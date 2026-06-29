/* 播放器声轨引擎：旁白优先用真实云端 TTS（/api/tts），失败回退浏览器 speechSynthesis；
   背景音乐 / 环境声用 Web Audio 合成。所有声轨（含真实 TTS）都汇入同一 master 增益，
   故播放/暂停=ctx.suspend/resume、静音=master.gain、循环=重起旁白，行为统一。 */

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
  private narrGain: GainNode | null = null; // 旁白专用增益（汇入 master）
  private stops: Array<() => void> = [];

  private started = false; // 是否已首次起播
  private muted = false;

  // 真实 TTS
  private ttsBuffer: AudioBuffer | null = null;
  private ttsSource: AudioBufferSourceNode | null = null;
  private ttsTried = false; // 是否已尝试过拉取（失败则不再重试，转浏览器语音）
  private useTts = false; // 真实 TTS 是否就绪并启用

  constructor(private opts: PlayerAudioOpts) {}

  private get hasSpeech(): boolean {
    return (
      typeof window !== "undefined" &&
      typeof window.speechSynthesis !== "undefined" &&
      typeof SpeechSynthesisUtterance !== "undefined"
    );
  }

  private get hasVoice(): boolean {
    return !!this.opts.voice && this.opts.voice !== "不配音";
  }

  private ensure() {
    if (this.ctx || typeof window === "undefined" || typeof AudioContext === "undefined") return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.6;
    this.master.connect(this.ctx.destination);
    this.narrGain = this.ctx.createGain();
    this.narrGain.gain.value = 1.0; // 旁白比背景音乐更突出
    this.narrGain.connect(this.master);
    if (this.opts.bgm && this.opts.bgm !== "无") this.buildPad(MOODS[this.opts.bgm] ?? MOODS["舒缓"]);
    this.buildAmbient(); // 环境声始终生成
  }

  // 柔和和声 pad：根音 + 纯五度 + 八度 + 慢颤音 LFO
  private buildPad(mood: { root: number; type: OscillatorType; tremolo: number }) {
    const ctx = this.ctx!;
    const padGain = ctx.createGain();
    padGain.gain.setValueAtTime(0, ctx.currentTime);
    padGain.gain.linearRampToValueAtTime(0.16, ctx.currentTime + 1.4);
    padGain.connect(this.master!);

    const oscs = [0, 1, 2].map((i) => {
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

  // —— 真实 TTS —— //
  private async ensureTtsBuffer(): Promise<boolean> {
    if (this.ttsBuffer) return true;
    if (this.ttsTried) return false;
    this.ttsTried = true;
    if (!this.hasVoice || !this.ctx) return false;
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: this.opts.prompt, voice: this.opts.voice }),
      });
      if (!res.ok) return false; // 未配置/网关无 TTS → 回退浏览器语音
      const ab = await res.arrayBuffer();
      if (!ab.byteLength) return false;
      this.ttsBuffer = await this.ctx.decodeAudioData(ab);
      return true;
    } catch {
      return false;
    }
  }

  private startTtsSource() {
    if (!this.ttsBuffer || !this.ctx || !this.narrGain) return;
    this.stopTtsSource();
    const src = this.ctx.createBufferSource();
    src.buffer = this.ttsBuffer;
    src.connect(this.narrGain);
    src.start();
    this.ttsSource = src;
  }

  private stopTtsSource() {
    if (this.ttsSource) {
      try {
        this.ttsSource.stop();
      } catch {
        /* 已停止 */
      }
      this.ttsSource.disconnect();
      this.ttsSource = null;
    }
  }

  // 首次起播旁白：先试真实 TTS，失败回退浏览器语音
  private beginNarration() {
    if (!this.hasVoice) return;
    this.ensureTtsBuffer().then((ok) => {
      if (ok) {
        this.useTts = true;
        this.startTtsSource(); // 静音由 master 处理，无需特判
      } else {
        this.speakBrowser();
      }
    });
  }

  // —— 浏览器语音回退 —— //
  private speakBrowser() {
    if (this.muted || !this.hasVoice || !this.hasSpeech) return;
    const start = () => {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(this.opts.prompt);
      u.lang = "zh-CN";
      u.rate = 0.96;
      u.pitch = this.opts.voice!.includes("女") ? 1.18 : 0.88;
      const zh = window.speechSynthesis
        .getVoices()
        .find((v) => /zh|cmn|Chinese/i.test(v.lang) || /中文|普通话|Chinese/.test(v.name));
      if (zh) u.voice = zh;
      window.speechSynthesis.speak(u);
    };
    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.onvoiceschanged = null;
        start();
      };
      start();
    } else {
      start();
    }
  }

  // —— 对外控制 —— //
  play() {
    this.ensure();
    void this.ctx?.resume(); // 恢复音乐/环境声/真实 TTS 时钟
    if (!this.started) {
      this.started = true;
      this.beginNarration();
      return;
    }
    // 已起播过：真实 TTS 随 ctx.resume 自动续播；浏览器语音需手动 resume
    if (!this.useTts && this.hasSpeech && window.speechSynthesis.paused) window.speechSynthesis.resume();
  }

  pause() {
    void this.ctx?.suspend(); // 一并暂停音乐/环境声/真实 TTS
    if (!this.useTts && this.hasSpeech && window.speechSynthesis.speaking) window.speechSynthesis.pause();
  }

  // 循环回到片头：重读旁白
  restart() {
    if (this.useTts) {
      this.startTtsSource();
      return;
    }
    if (!this.hasSpeech) return;
    window.speechSynthesis.cancel();
    this.speakBrowser();
  }

  setMuted(m: boolean, playing: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.6; // 真实 TTS 走 master，静音即生效
    if (this.useTts || !this.hasSpeech) return;
    // 浏览器语音回退：静音取消，取消静音时若在播则重读
    if (m) window.speechSynthesis.cancel();
    else if (playing) this.speakBrowser();
  }

  destroy() {
    this.stopTtsSource();
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
