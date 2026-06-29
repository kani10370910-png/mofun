/* 播放器声轨引擎：旁白优先用真实云端 TTS（/api/tts），失败回退浏览器 speechSynthesis。
   BGM / 环境声合成已移除（Web Audio 振荡器/噪声会产生嗡嗡声），待接入真实音乐/音效模型后再加。 */

interface PlayerAudioOpts {
  prompt: string;
  voice?: string; // 配音音色：不配音 / 温柔女声 / 沉稳男声 / 活力男声
  bgm?: string;   // 保留字段兼容调用方，当前不产生合成声音
}

// 拉取真实 TTS 并解码为 AudioBuffer；未配置/失败返回 null
async function fetchTtsBuffer(ctx: AudioContext, prompt: string, voice?: string): Promise<AudioBuffer | null> {
  if (!voice || voice === "不配音") return null;
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: prompt, voice }),
    });
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    if (!ab.byteLength) return null;
    return await ctx.decodeAudioData(ab);
  } catch {
    return null;
  }
}

/* 导出混音：仅当真实 TTS 旁白就绪时才建立音频流，供 MediaRecorder 与画面轨合成。
   无 TTS 时返回 null，下载文件为纯视频轨（无声）。 */
export interface ExportAudio {
  stream: MediaStream;
  hasNarration: boolean;
  dispose: () => void;
}
export async function buildExportAudio(opts: { bgm?: string; voice?: string; prompt: string }): Promise<ExportAudio | null> {
  if (typeof AudioContext === "undefined") return null;
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = 1.0;
  const dest = ctx.createMediaStreamDestination();
  master.connect(dest);

  const ttsBuf = await fetchTtsBuffer(ctx, opts.prompt, opts.voice);
  if (!ttsBuf) {
    void ctx.close();
    return null; // 无真实 TTS → 不混音，下载纯视频
  }

  const narr = ctx.createGain();
  narr.gain.value = 1.0;
  narr.connect(master);
  const src = ctx.createBufferSource();
  src.buffer = ttsBuf;
  src.connect(narr);
  src.start();

  await ctx.resume();
  return {
    stream: dest.stream,
    hasNarration: true,
    dispose: () => {
      try { src.stop(); } catch { /* 已停止 */ }
      void ctx.close();
    },
  };
}

export class PlayerAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private narrGain: GainNode | null = null;

  private started = false;
  private muted = false;

  private ttsBuffer: AudioBuffer | null = null;
  private ttsSource: AudioBufferSourceNode | null = null;
  private ttsTried = false;
  private useTts = false;

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
    this.master.gain.value = this.muted ? 0 : 1.0;
    this.master.connect(this.ctx.destination);
    this.narrGain = this.ctx.createGain();
    this.narrGain.gain.value = 1.0;
    this.narrGain.connect(this.master);
  }

  private async ensureTtsBuffer(): Promise<boolean> {
    if (this.ttsBuffer) return true;
    if (this.ttsTried) return false;
    this.ttsTried = true;
    if (!this.hasVoice || !this.ctx) return false;
    this.ttsBuffer = await fetchTtsBuffer(this.ctx, this.opts.prompt, this.opts.voice);
    return !!this.ttsBuffer;
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
      try { this.ttsSource.stop(); } catch { /* 已停止 */ }
      this.ttsSource.disconnect();
      this.ttsSource = null;
    }
  }

  private beginNarration() {
    if (!this.hasVoice) return;
    this.ensureTtsBuffer().then((ok) => {
      if (ok) {
        this.useTts = true;
        this.startTtsSource();
      } else {
        this.speakBrowser();
      }
    });
  }

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

  play() {
    this.ensure();
    void this.ctx?.resume();
    if (!this.started) {
      this.started = true;
      this.beginNarration();
      return;
    }
    if (!this.useTts && this.hasSpeech && window.speechSynthesis.paused) window.speechSynthesis.resume();
  }

  pause() {
    void this.ctx?.suspend();
    if (!this.useTts && this.hasSpeech && window.speechSynthesis.speaking) window.speechSynthesis.pause();
  }

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
    if (this.master) this.master.gain.value = m ? 0 : 1.0;
    if (this.useTts || !this.hasSpeech) return;
    if (m) window.speechSynthesis.cancel();
    else if (playing) this.speakBrowser();
  }

  destroy() {
    this.stopTtsSource();
    void this.ctx?.close();
    this.ctx = null;
    if (this.hasSpeech) window.speechSynthesis.cancel();
  }
}
