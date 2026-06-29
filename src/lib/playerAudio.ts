/* 播放器真实声轨引擎（无后端音频模型，纯浏览器原生能力合成「有声」效果）：
   - 旁白/对白：Web Speech API（speechSynthesis）朗读提示词文案，音高随音色变化
   - 背景音乐：Web Audio 合成柔和和声 pad + 慢速颤音，按 BGM 心情切换基频/音色
   - 环境声：Web Audio 布朗噪声经低通滤波，模拟风/水氛围底噪
   播放/暂停 → ctx.suspend/resume + 语音 pause/resume；关闭 → 全部停止。 */

interface PlayerAudioOpts {
  prompt: string;
  voice?: string; // 配音音色：不配音 / 温柔女声 / 沉稳男声 / 活力男声
  bgm?: string; // 背景音乐：无 / 舒缓 / 轻快 / 大气 / 国风
}

// 背景音乐心情 → 基频 / 波形 / 颤音速率
const MOODS: Record<string, { root: number; type: OscillatorType; tremolo: number }> = {
  舒缓: { root: 220.0, type: "sine", tremolo: 0.12 },
  轻快: { root: 293.66, type: "triangle", tremolo: 0.2 },
  大气: { root: 146.83, type: "sine", tremolo: 0.07 },
  国风: { root: 196.0, type: "sine", tremolo: 0.1 },
};

export class PlayerAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private stops: Array<() => void> = [];
  private utter: SpeechSynthesisUtterance | null = null;
  private spoken = false;
  private muted = false;

  constructor(private opts: PlayerAudioOpts) {}

  private get hasSpeech(): boolean {
    return typeof window !== "undefined" && typeof window.speechSynthesis !== "undefined" && typeof SpeechSynthesisUtterance !== "undefined";
  }

  private ensure() {
    if (this.ctx || typeof window === "undefined" || typeof AudioContext === "undefined") return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.6;
    this.master.connect(this.ctx.destination);
    if (this.opts.bgm && this.opts.bgm !== "无") this.buildPad(MOODS[this.opts.bgm] ?? MOODS["舒缓"]);
    this.buildAmbient(); // 环境声始终生成（与卡片四路音轨口径一致）
  }

  // 柔和和声 pad：根音 + 纯五度 + 八度，叠加慢速颤音 LFO
  private buildPad(mood: { root: number; type: OscillatorType; tremolo: number }) {
    const ctx = this.ctx!;
    const padGain = ctx.createGain();
    padGain.gain.setValueAtTime(0, ctx.currentTime);
    padGain.gain.linearRampToValueAtTime(0.16, ctx.currentTime + 1.4);
    padGain.connect(this.master!);

    const oscs = [this.opts, this.opts, this.opts].map((_, i) => {
      const o = ctx.createOscillator();
      o.type = mood.type;
      o.frequency.value = mood.root * [1, 1.5, 2][i];
      o.detune.value = (i - 1) * 4;
      o.connect(padGain);
      o.start();
      return o;
    });

    const lfo = ctx.createOscillator();
    lfo.frequency.value = mood.tremolo;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.06;
    lfo.connect(lfoGain);
    lfoGain.connect(padGain.gain);
    lfo.start();

    this.stops.push(() => {
      oscs.forEach((o) => o.stop());
      lfo.stop();
    });
  }

  // 环境声：布朗噪声 → 低通 → 极低音量
  private buildAmbient() {
    const ctx = this.ctx!;
    const size = 2 * ctx.sampleRate;
    const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < size; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 720;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    src.connect(lp);
    lp.connect(g);
    g.connect(this.master!);
    src.start();
    this.stops.push(() => src.stop());
  }

  private speak() {
    if (this.muted) return;
    if (!this.opts.voice || this.opts.voice === "不配音" || !this.hasSpeech) return;
    const start = () => {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(this.opts.prompt);
      u.lang = "zh-CN";
      u.rate = 0.96;
      u.pitch = this.opts.voice!.includes("女") ? 1.18 : 0.88;
      const zh = window.speechSynthesis.getVoices().find((v) => /zh|cmn|Chinese/i.test(v.lang) || /中文|普通话|Chinese/.test(v.name));
      if (zh) u.voice = zh;
      this.utter = u;
      window.speechSynthesis.speak(u);
    };
    // 首次打开时语音列表可能未就绪，等就绪后再读
    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.onvoiceschanged = null;
        start();
      };
      start(); // 同时先尝试一次（多数浏览器已可用）
    } else {
      start();
    }
  }

  // 播放：恢复音频上下文；旁白若未读过则开始读，暂停过则继续
  play() {
    this.ensure();
    void this.ctx?.resume();
    if (!this.hasSpeech) return;
    if (this.spoken && window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    } else if (!this.spoken) {
      this.speak();
      this.spoken = true;
    }
  }

  pause() {
    void this.ctx?.suspend();
    if (this.hasSpeech && window.speechSynthesis.speaking) window.speechSynthesis.pause();
  }

  // 循环回到片头：重新朗读旁白
  restart() {
    if (!this.hasSpeech) return;
    window.speechSynthesis.cancel();
    this.spoken = false;
    this.speak();
    this.spoken = true;
  }

  setMuted(m: boolean, playing: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.6;
    if (!this.hasSpeech) return;
    if (m) {
      window.speechSynthesis.cancel();
    } else if (playing) {
      this.spoken = false;
      this.speak();
      this.spoken = true;
    }
  }

  destroy() {
    this.stops.forEach((s) => {
      try {
        s();
      } catch {
        /* 忽略已停止节点 */
      }
    });
    this.stops = [];
    void this.ctx?.close();
    this.ctx = null;
    if (this.hasSpeech) window.speechSynthesis.cancel();
  }
}
