"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { useLibrary } from "@/lib/store";
import { nowStamp } from "@/lib/datetime";
import { ClearableTextarea } from "@/components/ui/ClearableTextarea";
import {
  videoSceneTpls,
  videoSceneCats,
  motionWords,
  videoStyles,
  videoRatios,
  videoDurations,
  videoQualities,
} from "@/data/video";
import type { VideoRunRow, Grad, AssetCard } from "@/lib/types";

/* F10 一句话视频：文生视频(T2V) / 图生视频(I2V) 双 Tab。
   演示骨架：场景引导词库 + 参数 + 首尾帧 + 内容安全预检/复检 + 进度状态机 + 后处理/审核流。
   出片为演示占位（无真视频模型）；额度/RAG变量/安全检测/审核/通知均为前端模拟。 */

const GRADS: Grad[] = ["thumb-grad-1", "thumb-grad-2", "thumb-grad-3", "thumb-grad-4"];
// 敏感词演示：命中则安全预检拦截
const BLOCK_WORDS = ["反动", "暴恐", "色情", "血腥"];

// 预置 3 条「已完成」生成历史（演示）：保证每次进入都有现成记录，可直接点下载/重生成/存库/提交审核
const SEED_RUNS: VideoRunRow[] = [
  {
    id: "seed-1",
    mode: "t2v",
    prompt: "安吉特产白茶，产地直发，新鲜直达，横版宣传短视频",
    scene: "农产品展示",
    ratio: "16:9",
    dur: "5秒",
    style: "写实",
    time: "2026-06-26 09:20",
    status: "done",
    pct: 100,
    grad: "thumb-grad-1",
  },
  {
    id: "seed-2",
    mode: "t2v",
    prompt: "金秋丰收，安吉茶园喜获丰收，农民笑脸特写",
    scene: "丰收季节",
    ratio: "9:16",
    dur: "10秒",
    style: "电影感",
    time: "2026-06-26 09:05",
    status: "done",
    pct: 100,
    grad: "thumb-grad-3",
  },
  {
    id: "seed-3",
    mode: "i2v",
    prompt: "茶叶采摘动作，镜头缓缓推近",
    ratio: "16:9",
    dur: "5秒",
    style: "国风水墨",
    time: "2026-06-26 08:48",
    status: "done",
    pct: 100,
    poster: "/poster-samples/20251219175905342092j5c2dj.jpg",
    grad: "thumb-grad-2",
  },
];

// 演示海报池：无首帧的记录回退到这些样张，让预览/播放有真实画面
const POSTER_POOL = [
  "/poster-samples/20251219150028966406xict5e.jpg",
  "/poster-samples/20251222150201108065evwftz.jpg",
  "/poster-samples/20251223153921706507udqknx.jpg",
  "/poster-samples/20251225143202617562fe2mzh.jpg",
  "/poster-samples/202512251516181258973mq1jx.jpg",
];
// 按 id 稳定散列取一张回退海报（同一条记录每次取到同一张）
function posterFor(row: VideoRunRow): string {
  if (row.poster) return row.poster;
  let h = 0;
  for (let i = 0; i < row.id.length; i++) h = (h * 31 + row.id.charCodeAt(i)) >>> 0;
  return POSTER_POOL[h % POSTER_POOL.length];
}
// 参考灵感：取前 6 个县域场景模板 + 海报样张，供右栏一键套用到提示词
const INSPIRE = videoSceneTpls.slice(0, 6).map((t, i) => ({
  ...t,
  poster: POSTER_POOL[i % POSTER_POOL.length],
}));

// "5秒" → 5
function durSeconds(dur: string): number {
  return parseInt(dur.match(/\d+/)?.[0] ?? "5", 10);
}

// canvas 字幕换行绘制：按字符折行，超过 maxLines 行末尾省略号，从底部向上排版
function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  yBottom: number,
  maxW: number,
  lineH: number,
  maxLines: number
) {
  const lines: string[] = [];
  let line = "";
  for (const chr of Array.from(text)) {
    if (ctx.measureText(line + chr).width > maxW && line) {
      lines.push(line);
      line = chr;
    } else {
      line += chr;
    }
  }
  if (line) lines.push(line);

  const shown = lines.slice(0, maxLines);
  if (lines.length > maxLines && shown.length) {
    let last = shown[maxLines - 1];
    while (last && ctx.measureText(last + "…").width > maxW) last = last.slice(0, -1);
    shown[maxLines - 1] = last + "…";
  }
  const startY = yBottom - (shown.length - 1) * lineH;
  shown.forEach((l, i) => ctx.fillText(l, x, startY + i * lineH));
}

export function OnelineVideo() {
  const toast = useToast();
  const { addWork, isFavorite, toggleFavorite } = useLibrary();
  const router = useRouter();

  const [tab, setTab] = useState<"t2v" | "i2v">("t2v");
  // —— 文生视频 ——
  const [scene, setScene] = useState(""); // 当前选中场景（二级场景名）
  const [sceneCat, setSceneCat] = useState(videoSceneCats[0]); // 场景一级分类筛选
  const [prompt, setPrompt] = useState("");
  const [expanding, setExpanding] = useState(false);
  // —— 图生视频 ——
  const [firstFrame, setFirstFrame] = useState(""); // 首帧图 URL
  const [lastFrame, setLastFrame] = useState(""); // 尾帧图 URL（首尾帧模式）
  const [endFrameOn, setEndFrameOn] = useState(false); // 首尾帧开关 F10-04
  const [motion, setMotion] = useState(""); // 运动描述
  const [motionCat, setMotionCat] = useState(motionWords[0].cat);
  // —— 公共参数 ——
  const [ratio, setRatio] = useState<string>(videoRatios[0]);
  const [dur, setDur] = useState<string>(videoDurations[0]);
  const [quality, setQuality] = useState<string>(videoQualities[0]);
  const [style, setStyle] = useState(videoStyles[0].name);
  const [count, setCount] = useState(1);

  const [runs, setRuns] = useState<VideoRunRow[]>(SEED_RUNS);
  const [playing, setPlaying] = useState<VideoRunRow | null>(null); // 当前在播放器中预览的记录
  const [busy, setBusy] = useState(false);
  const [safe, setSafe] = useState<null | "checking" | "blocked">(null); // 安全预检状态
  const timers = useRef<number[]>([]);
  const seq = useRef(0); // 自增序号，保证新生成记录 id 唯一
  const dlRef = useRef(false); // 视频录制中标志，防止并发下载
  const firstRef = useRef<HTMLInputElement>(null);
  const lastRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  // 运动预设词开关：已在描述中则移除该词，否则追加（按「，」分词，顺带去重）
  function toggleMotionWord(w: string) {
    setMotion((cur) => {
      const tokens = cur
        .split(/[，,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (tokens.includes(w)) return tokens.filter((t) => t !== w).join("，");
      return [...tokens, w].join("，");
    });
  }

  // 选场景模板：填充引导词（保留【变量】占位，模拟「县域知识库未录入」提示）
  function pickScene(s: string, p: string) {
    setScene(s);
    setPrompt(p);
    if (/【.+?】/.test(p)) toast("引导词含县域变量，发布时将从县域知识库自动填充（演示）");
  }

  // 套用右栏参考灵感：切到文生视频并填入对应场景提示词
  function useInspire(it: (typeof INSPIRE)[number]) {
    setTab("t2v");
    setSceneCat(it.cat);
    setScene(it.scene);
    setPrompt(it.prompt);
    toast("已套用参考灵感到提示词");
  }

  // AI 扩写（演示）：在原描述后补一段镜头/光影细节
  function expand() {
    const base = prompt.trim();
    if (!base) {
      toast("请先输入或选择一个场景引导词", "warn");
      return;
    }
    setExpanding(true);
    timers.current.push(
      window.setTimeout(() => {
        setPrompt(
          base +
            "，航拍俯瞰开阔全景缓缓推近，晨光逆光暖色调，浅景深突出主体，画面干净有呼吸感，配舒缓背景音乐，整体清新自然、有地域辨识度"
        );
        setExpanding(false);
        toast("已 AI 扩写画面细节（演示）");
      }, 1200)
    );
  }

  function pickFile(which: "first" | "last", file?: File) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (which === "first") setFirstFrame(url);
    else setLastFrame(url);
  }

  // 立即生成：安全预检 → 入队 → 进度状态机（演示）
  function run() {
    if (busy) return;
    const isI2v = tab === "i2v";
    const text = (isI2v ? motion : prompt).trim();

    if (isI2v && !firstFrame) {
      toast("请先上传首帧图！", "warn");
      return;
    }
    if (isI2v && endFrameOn && !lastFrame) {
      toast("首尾帧模式需上传尾帧图！", "warn");
      return;
    }
    if (!text) {
      toast(isI2v ? "请输入运动描述！" : "请输入提示词或选择场景！", "warn");
      return;
    }

    // F10-07 安全预检（演示：命中敏感词阻断）
    setSafe("checking");
    timers.current.push(
      window.setTimeout(() => {
        if (BLOCK_WORDS.some((w) => text.includes(w))) {
          setSafe("blocked");
          toast("内容安全预检未通过：含敏感词，请修改后重试", "warn");
          timers.current.push(window.setTimeout(() => setSafe(null), 2600));
          return;
        }
        setSafe(null);
        startGenerate(isI2v, text);
      }, 900)
    );
  }

  function startGenerate(isI2v: boolean, text: string) {
    enqueue({
      mode: isI2v ? "i2v" : "t2v",
      text,
      scene: isI2v ? undefined : scene || undefined,
      ratio,
      dur,
      style,
      poster: isI2v ? firstFrame : undefined,
    });
  }

  // 入队 + 进度状态机（文生 / 图生 / 重新生成 三处共用）
  function enqueue(p: {
    mode: "t2v" | "i2v";
    text: string;
    scene?: string;
    ratio: string;
    dur: string;
    style: string;
    poster?: string;
  }) {
    setBusy(true);
    const id = "v-" + ++seq.current;
    const grad = GRADS[seq.current % GRADS.length];
    const row: VideoRunRow = {
      id,
      mode: p.mode,
      prompt: p.text,
      scene: p.scene,
      ratio: p.ratio,
      dur: p.dur,
      style: p.style,
      time: nowStamp(),
      status: "pending",
      pct: 0,
      poster: p.poster,
      grad,
    };
    setRuns((prev) => [row, ...prev]);

    // 排队中 → 生成中 → 进度推进 → 安全复检 → 完成（演示节奏）
    const upd = (patch: Partial<VideoRunRow>) =>
      setRuns((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

    timers.current.push(window.setTimeout(() => upd({ status: "running", pct: 8 }), 1000));
    let pct = 8;
    const iv = window.setInterval(() => {
      pct = Math.min(92, pct + 9);
      upd({ pct });
    }, 700);
    timers.current.push(iv as unknown as number);
    timers.current.push(
      window.setTimeout(() => {
        window.clearInterval(iv);
        // F10-10 安全复检（演示通过）→ 完成
        upd({ status: "done", pct: 100 });
        setBusy(false);
        addWork({
          emoji: "🎬",
          grad,
          kind: "视频",
          name: `${p.text.slice(0, 12) || "一句话视频"} · ${p.dur}`,
          sub: "视频生成 · 一句话成片",
          img: p.poster,
          time: nowStamp(),
          edit: { sub: "oneline", input: p.text },
        });
        toast("视频已生成，已存入「我的作品」");
      }, 5200)
    );
  }

  // 重新生成：把该记录参数回填到表单，并按原参数立即重新入队
  function regenerate(row: VideoRunRow) {
    if (busy) return;
    setTab(row.mode);
    if (row.mode === "t2v") {
      setScene(row.scene ?? "");
      setPrompt(row.prompt);
    } else {
      setMotion(row.prompt);
    }
    setRatio(row.ratio);
    setDur(row.dur);
    setStyle(row.style);
    enqueue({
      mode: row.mode,
      text: row.prompt,
      scene: row.scene,
      ratio: row.ratio,
      dur: row.dur,
      style: row.style,
      poster: row.poster,
    });
    toast("已按原参数重新生成");
  }

  // 视频记录 → 作品卡（收藏/存库口径一致；assetKey 取 类型+名称，name 对单条稳定）
  function videoAsset(row: VideoRunRow): AssetCard {
    return {
      emoji: "🎬",
      grad: row.grad,
      kind: "视频",
      name: `${row.prompt.slice(0, 12) || "一句话视频"} · ${row.dur}`,
      sub: "视频生成 · 一句话成片",
      img: row.poster || posterFor(row),
      time: nowStamp(),
      edit: { sub: "oneline", input: row.prompt },
    };
  }

  // 存内容库：写入「仓库 · 我的作品」并跳转到仓库页
  function saveToLibrary(row: VideoRunRow) {
    addWork(videoAsset(row));
    toast("已保存到「仓库 · 我的作品」，正在跳转…");
    router.push("/storage");
  }

  // 收藏：与品牌设计一致——写入「我的作品」并标记收藏，和仓库「只看收藏」互通
  function toggleFav(row: VideoRunRow) {
    const a = videoAsset(row);
    const was = isFavorite(a);
    addWork(a);
    toggleFavorite(a);
    toast(was ? "已取消收藏" : "已收藏，可在「仓库 · 我的作品」用「只看收藏」筛选");
  }

  // 下载视频：用 canvas 实时重放封面的 Ken Burns 运镜（与播放器一致），
  // 经 MediaRecorder 按视频时长录制为真实视频文件（mp4/webm）落盘到本地。
  async function downloadVideo(row: VideoRunRow) {
    if (dlRef.current) {
      toast("视频正在生成中，请稍候…");
      return;
    }
    const src = row.poster || posterFor(row);
    // 极老浏览器兜底：不支持录制则退回下载封面图
    if (typeof MediaRecorder === "undefined" || !document.createElement("canvas").captureStream) {
      const a = document.createElement("a");
      a.href = src;
      a.download = `${row.prompt.slice(0, 16) || "video"}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast("当前浏览器不支持视频录制，已下载封面图");
      return;
    }

    dlRef.current = true;
    toast(`正在生成视频（约 ${durSeconds(row.dur)} 秒），请稍候…`);
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = src;
      await img.decode();

      const [rw, rh] = row.ratio.split(":").map(Number);
      const base = 720;
      const cw = rw >= rh ? Math.round((base * rw) / rh) : base;
      const ch = rw >= rh ? base : Math.round((base * rh) / rw);
      const canvas = document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d context");

      const total = durSeconds(row.dur);
      const drawFrame = (p: number) => {
        const z = 1 + 0.14 * p; // 随进度缓慢放大
        const ir = img.width / img.height;
        const cr = cw / ch;
        let dw: number, dh: number;
        if (ir > cr) {
          dh = ch;
          dw = ch * ir;
        } else {
          dw = cw;
          dh = cw / ir;
        }
        dw *= z;
        dh *= z;
        const dx = (cw - dw) / 2 - 0.04 * p * cw; // 轻微左上平移
        const dy = (ch - dh) / 2 - 0.025 * p * ch;
        ctx.clearRect(0, 0, cw, ch);
        ctx.drawImage(img, dx, dy, dw, dh);
        // 底部暗角
        const g = ctx.createLinearGradient(0, 0, 0, ch);
        g.addColorStop(0, "rgba(0,0,0,0.18)");
        g.addColorStop(0.3, "rgba(0,0,0,0)");
        g.addColorStop(0.62, "rgba(0,0,0,0)");
        g.addColorStop(1, "rgba(0,0,0,0.58)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, cw, ch);
        // 字幕（提示词，最多两行）
        const pad = Math.round(cw * 0.045);
        const fs = Math.round(ch * 0.04);
        ctx.fillStyle = "#fff";
        ctx.font = `600 ${fs}px system-ui, -apple-system, sans-serif`;
        ctx.textBaseline = "bottom";
        ctx.shadowColor = "rgba(0,0,0,0.7)";
        ctx.shadowBlur = 10;
        drawWrappedText(ctx, row.prompt, pad, ch - pad, cw - 2 * pad, fs * 1.35, 2);
        ctx.shadowBlur = 0;
      };

      const stream = canvas.captureStream(30);
      const mime =
        ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"].find((m) =>
          MediaRecorder.isTypeSupported(m)
        ) || "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      const finished = new Promise<void>((resolve) => {
        rec.onstop = () => {
          const type = rec.mimeType || "video/webm";
          const ext = type.includes("mp4") ? "mp4" : "webm";
          const blob = new Blob(chunks, { type });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${row.prompt.slice(0, 16) || "video"}.${ext}`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          window.setTimeout(() => URL.revokeObjectURL(url), 5000);
          toast(`已下载视频到本地（.${ext}）`);
          resolve();
        };
      });

      rec.start();
      const t0 = performance.now();
      await new Promise<void>((resolve) => {
        const tick = () => {
          const p = Math.min(1, (performance.now() - t0) / 1000 / total);
          drawFrame(p);
          if (p >= 1) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      await new Promise((r) => window.setTimeout(r, 150)); // 多录一点确保末帧入流
      rec.stop();
      await finished;
    } catch {
      toast("视频生成失败，请重试");
    } finally {
      dlRef.current = false;
    }
  }

  function deleteRun(id: string) {
    setRuns((prev) => prev.filter((r) => r.id !== id));
  }

  const scenes = videoSceneTpls.filter((t) => t.cat === sceneCat);
  const motionGroup = motionWords.find((m) => m.cat === motionCat) ?? motionWords[0];

  return (
    <>
        {/* 左侧表单 */}
        <div className="workspace ov-workspace">
          <div className="ws-panel sticky">
            <div className="ws-scroll">
              {/* 文生 / 图生 双 Tab + 顶部吸顶 */}
              <div className="ev-sticky-top">
                <div className="ev-tabs">
                  <span className={tab === "t2v" ? "ev-tab on" : "ev-tab"} onClick={() => setTab("t2v")}>
                    文生视频
                  </span>
                  <span className={tab === "i2v" ? "ev-tab on" : "ev-tab"} onClick={() => setTab("i2v")}>
                    图生视频
                  </span>
                </div>
              </div>

              {tab === "t2v" ? (
                <>
                  {/* 场景模板库 F10-01 */}
                  <div className="field">
                    <div className="ws-label">场景模板</div>
                    <div className="filter-row" style={{ marginBottom: 10 }}>
                      {videoSceneCats.map((c) => (
                        <span key={c} className={sceneCat === c ? "sel-chip on" : "sel-chip"} onClick={() => setSceneCat(c)}>
                          {c}
                        </span>
                      ))}
                    </div>
                    <div className="ov-scene-grid">
                      {scenes.map((s) => (
                        <button
                          key={s.scene}
                          type="button"
                          className={scene === s.scene ? "ov-scene on" : "ov-scene"}
                          onClick={() => pickScene(s.scene, s.prompt)}
                        >
                          <span className="ov-scene-emoji">{s.emoji}</span>
                          <span className="ov-scene-name">{s.scene}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 提示词 + AI 扩写 F10-02 */}
                  <div className="field">
                    <div className="ws-label">
                      提示词 <span className="req">*</span>
                    </div>
                    <ClearableTextarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      onClear={() => setPrompt("")}
                      placeholder="一句话描述要生成的视频，或上方选个场景自动填充（最多 500 字）"
                      maxLength={500}
                      toolbar={
                        <button type="button" className="ta-tool" disabled={expanding} onClick={expand}>
                          {expanding ? (
                            <><Icon name="refresh" size={14} className="ico-spin" /> 扩写中…</>
                          ) : (
                            <><Icon name="sparkle" size={14} /> AI 扩写</>
                          )}
                        </button>
                      }
                    />
                  </div>
                </>
              ) : (
                <>
                  {/* 首帧上传 + 首尾帧开关 F10-03 / F10-04 */}
                  <div className="field">
                    <div className="ws-label-row">
                      <div className="ws-label">
                        参考图片 <span className="req">*</span>
                      </div>
                      <label className="ov-switch">
                        <input type="checkbox" checked={endFrameOn} onChange={(e) => setEndFrameOn(e.target.checked)} />
                        <span className="lg-switch" />
                        首尾帧
                      </label>
                    </div>
                    <div className={`ov-frames ${endFrameOn ? "two" : ""}`}>
                      <FrameSlot
                        label="首帧"
                        url={firstFrame}
                        inputRef={firstRef}
                        onPick={(f) => pickFile("first", f)}
                        onClear={() => setFirstFrame("")}
                      />
                      {endFrameOn && (
                        <FrameSlot
                          label="尾帧"
                          url={lastFrame}
                          inputRef={lastRef}
                          onPick={(f) => pickFile("last", f)}
                          onClear={() => setLastFrame("")}
                        />
                      )}
                    </div>
                    <div className="field-hint">
                      {endFrameOn ? "AI 自动补全首尾帧之间的过渡动画" : "上传单张首帧，AI 让画面动起来"}
                    </div>
                  </div>

                  {/* 视频预设（在前）+ 运动描述（在后） */}
                  <div className="field">
                    <div className="ws-label">
                      视频预设 <span className="ws-label-hint">点选预设快速填入运动描述</span>
                    </div>
                    <div className="filter-row" style={{ margin: "0 0 6px" }}>
                      {motionWords.map((m) => (
                        <span key={m.cat} className={motionCat === m.cat ? "sel-chip on" : "sel-chip"} onClick={() => setMotionCat(m.cat)}>
                          {m.cat}
                        </span>
                      ))}
                    </div>
                    <div className="ov-word-row">
                      {motionGroup.words.map((w) => {
                        const on = motion
                          .split(/[，,]/)
                          .map((s) => s.trim())
                          .includes(w);
                        return (
                          <button
                            key={w}
                            type="button"
                            className={on ? "ov-word on" : "ov-word"}
                            onClick={() => toggleMotionWord(w)}
                          >
                            {w}
                          </button>
                        );
                      })}
                    </div>
                    <div className="ws-label" style={{ marginTop: 14 }}>
                      运动描述 <span className="req">*</span>
                    </div>
                    <ClearableTextarea
                      value={motion}
                      onChange={(e) => setMotion(e.target.value)}
                      onClear={() => setMotion("")}
                      placeholder="描述画面如何运动，例如：花朵随风轻轻摆动，镜头缓缓推近"
                    />
                  </div>
                </>
              )}

              {/* —— 公共参数 F10-05 / F10-06 —— */}
              <div className="field">
                <div className="ws-label">视频比例</div>
                <div className="chip-row">
                  {videoRatios.map((r) => (
                    <span key={r} className={ratio === r ? "sel-chip on" : "sel-chip"} onClick={() => setRatio(r)}>
                      {r}
                    </span>
                  ))}
                </div>
              </div>
              <div className="field">
                <div className="ws-label">视频时长</div>
                <div className="chip-row">
                  {videoDurations.map((d) => (
                    <span key={d} className={dur === d ? "sel-chip on" : "sel-chip"} onClick={() => setDur(d)}>
                      {d}
                    </span>
                  ))}
                </div>
              </div>
              <div className="field">
                <div className="ws-label">画质</div>
                <div className="chip-row">
                  {videoQualities.map((q) => (
                    <span key={q} className={quality === q ? "sel-chip on" : "sel-chip"} onClick={() => setQuality(q)}>
                      {q}
                    </span>
                  ))}
                </div>
                {quality.includes("1080") && <div className="field-hint">高清消耗 2 倍额度</div>}
              </div>
              <div className="field">
                <div className="ws-label">视频风格</div>
                <div className="ov-style-row">
                  {videoStyles.map((s) => (
                    <button key={s.key} type="button" className={style === s.name ? "ov-style on" : "ov-style"} onClick={() => setStyle(s.name)}>
                      <span className={`ov-style-ico ${s.grad}`}>{s.emoji}</span>
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
              {tab === "t2v" && (
                <div className="field">
                  <div className="ws-label">生成数量</div>
                  <div className="seg">
                    {[1, 2].map((n) => (
                      <div key={n} className={count === n ? "seg-item on" : "seg-item"} onClick={() => setCount(n)}>
                        {n} 条
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="ws-foot">
              <button className="btn btn-primary btn-block gen-btn" disabled={busy || safe === "checking"} onClick={run}>
                {safe === "checking" ? (
                  <><Icon name="shield" size={16} /> 内容安全检测中…</>
                ) : (
                  <><Icon name="sparkle" size={16} /> 立即生成</>
                )}
              </button>
              {safe === "blocked" && <p className="ov-block-note">⚠ 内容安全预检未通过，请修改提示词</p>}
            </div>
          </div>

        {/* 右侧：生成历史 */}
        <div className="ws-panel ov-result">
          <div className="lg-head">
            <div className="tabs">
              <div className="tab on">生成历史</div>
            </div>
          </div>
          {runs.length === 0 ? (
            <div className="preview-empty">
              <div>
                <div className="pe-ico">
                  <Icon name="video" size={42} />
                </div>
                还没有生成记录，填好左侧点「立即生成」试试
              </div>
            </div>
          ) : (
            <div className="ov-runs">
              {runs.map((r) => (
                <VideoRunCard
                  key={r.id}
                  row={r}
                  onDelete={() => deleteRun(r.id)}
                  onPlay={() => setPlaying(r)}
                  onRegenerate={() => regenerate(r)}
                  onSave={() => saveToLibrary(r)}
                  onDownload={() => downloadVideo(r)}
                  fav={isFavorite(videoAsset(r))}
                  onFav={() => toggleFav(r)}
                  toast={toast}
                />
              ))}
            </div>
          )}
        </div>

        {/* 最右：参考灵感 */}
        <div className="ws-panel ov-inspire">
          <div className="lg-head">
            <div className="tabs">
              <div className="tab on">参考灵感</div>
            </div>
          </div>
          <div className="ov-inspire-list">
            {INSPIRE.map((it) => (
              <div className="ov-insp-card" key={it.scene}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="ov-insp-thumb" src={it.poster} alt={it.scene} />
                <div className="ov-insp-body">
                  <div className="ov-insp-scene">
                    {it.emoji} {it.scene}
                  </div>
                  <div className="ov-insp-prompt">{it.prompt}</div>
                  <button className="btn btn-soft btn-sm ov-insp-use" onClick={() => useInspire(it)}>
                    <Icon name="sparkle" size={13} /> 用此灵感
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {playing && (
        <VideoPlayerModal
          row={playing}
          onClose={() => setPlaying(null)}
          onDownload={() => downloadVideo(playing)}
          onSave={() => {
            saveToLibrary(playing);
            setPlaying(null);
          }}
          onStudio={() => router.push("/video?sub=studio")}
        />
      )}
    </>
  );
}

function FrameSlot({
  label,
  url,
  inputRef,
  onPick,
  onClear,
}: {
  label: string;
  url: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onPick: (f?: File) => void;
  onClear: () => void;
}) {
  return (
    <div className={`ov-frame ${url ? "filled" : ""}`} onClick={() => inputRef.current?.click()}>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => {
          onPick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {url ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={label} />
          <button
            type="button"
            className="ov-frame-clear"
            onClick={(e) => {
              e.stopPropagation();
              if (url.startsWith("blob:")) URL.revokeObjectURL(url);
              onClear();
            }}
          >
            <Icon name="close" size={13} />
          </button>
        </>
      ) : (
        <>
          <Icon name="plus" size={18} />
          <span>上传{label}</span>
        </>
      )}
      <span className="ov-frame-tag">{label}</span>
    </div>
  );
}

const STATUS_TEXT: Record<VideoRunRow["status"], string> = {
  pending: "排队中，预计等待 1 分钟",
  running: "AI 正在生成视频，请稍候…",
  done: "已完成",
  failed: "生成遇到问题，额度已退还",
};

function VideoRunCard({
  row,
  onDelete,
  onPlay,
  onRegenerate,
  onSave,
  onDownload,
  fav,
  onFav,
  toast,
}: {
  row: VideoRunRow;
  onDelete: () => void;
  onPlay: () => void;
  onRegenerate: () => void;
  onSave: () => void;
  onDownload: () => void;
  fav: boolean;
  onFav: () => void;
  toast: (s: string) => void;
}) {
  const [reviewing, setReviewing] = useState(false);
  const loading = row.status === "pending" || row.status === "running";
  const done = row.status === "done";
  const durLabel = (row.dur.match(/\d+/)?.[0] ?? "5").padStart(2, "0");

  return (
    <div className="ov-run">
      <div className="ov-run-head">
        <span className="ov-run-mode">{row.mode === "i2v" ? "图生视频" : "文生视频"}</span>
        <span className="ov-run-prompt">{row.prompt}</span>
        <span className="lg-cat">{row.style} · {row.ratio} · {row.dur}</span>
        {!loading && (
          <button className="lh-ico lh-tip" data-tip="删除" aria-label="删除" onClick={onDelete}>
            <Icon name="trash" size={14} />
          </button>
        )}
        <span className="ov-run-time">{row.time}</span>
      </div>

      <div
        className={`ov-video ${row.grad} ${done ? "clickable" : ""}`}
        onClick={done ? onPlay : undefined}
        role={done ? "button" : undefined}
        title={done ? "点击播放预览" : undefined}
      >
        {(row.poster || done) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="ov-video-poster" src={row.poster || posterFor(row)} alt="视频封面" />
        ) : null}
        {loading ? (
          <div className="ov-video-loading">
            <Icon name="refresh" size={26} className="ico-spin" />
            <div className="ov-video-status">{STATUS_TEXT[row.status]}</div>
            <div className="ov-video-bar"><span style={{ width: `${row.pct}%` }} /></div>
            <div className="ov-video-pct">{row.pct}%</div>
          </div>
        ) : (
          <>
            <button
              className={fav ? "lh-fav on" : "lh-fav"}
              title={fav ? "取消收藏" : "收藏"}
              onClick={(e) => {
                e.stopPropagation();
                onFav();
              }}
            >
              <Icon name="heart" size={15} />
            </button>
            <div className="ov-play">▶</div>
            <span className="ov-video-dur">00:{durLabel}</span>
            <span className="lh-mark">由 AI 生成</span>
          </>
        )}
      </div>

      {row.status === "done" && (
        <div className="ov-run-acts">
          <button className="btn btn-soft btn-sm" onClick={onDownload}>下载视频</button>
          <button className="btn btn-ghost btn-sm" onClick={onRegenerate}>重新生成</button>
          <button className="btn btn-ghost btn-sm" onClick={onSave}>存内容库</button>
          <button
            className="btn btn-primary btn-sm"
            disabled={reviewing}
            onClick={() => {
              setReviewing(true);
              toast("已提交审核，进入审核队列");
            }}
          >
            {reviewing ? "审核中…" : "提交审核"}
          </button>
        </div>
      )}
    </div>
  );
}

/* 视频预览播放器：点击生成历史卡片打开。
   无真实视频模型，这里用海报图 + 实时 transform（Ken Burns 推拉）模拟一段可播放预览，
   播放时间由 requestAnimationFrame 驱动，播放/暂停/拖动进度条与画面运动严格同步、循环播放。 */
function VideoPlayerModal({
  row,
  onClose,
  onDownload,
  onSave,
  onStudio,
}: {
  row: VideoRunRow;
  onClose: () => void;
  onDownload: () => void;
  onSave: () => void;
  onStudio: () => void;
}) {
  const total = durSeconds(row.dur);
  const [playing, setPlaying] = useState(true);
  const [t, setT] = useState(0); // 当前播放秒（浮点）
  const raf = useRef(0);
  const last = useRef(0);
  const seeking = useRef(false);

  // rAF 推进播放时间，到结尾循环回 0
  useEffect(() => {
    if (!playing) return;
    last.current = performance.now();
    const tick = (now: number) => {
      const dt = (now - last.current) / 1000;
      last.current = now;
      if (!seeking.current) setT((cur) => (cur + dt >= total ? 0 : cur + dt));
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, total]);

  // Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const prog = Math.min(1, t / total);
  // Ken Burns：随播放进度缓慢放大 + 轻微平移，与进度条同步
  const scale = 1 + 0.14 * prog;
  const tx = -4 * prog;
  const ty = -2.5 * prog;
  const fmt = (s: number) => `00:${String(Math.floor(s)).padStart(2, "0")}`;

  function seekAt(clientX: number, el: HTMLElement) {
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setT(ratio * total);
  }

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="vp-panel" onClick={(e) => e.stopPropagation()}>
        <div className="vp-head">
          <span className="ov-run-mode">{row.mode === "i2v" ? "图生视频" : "文生视频"}</span>
          <span className="vp-title">{row.prompt}</span>
          <span className="vp-meta-chips">
            <span className="vp-chip">{row.style}</span>
            <span className="vp-chip">{row.ratio}</span>
            <span className="vp-chip">{row.dur}</span>
          </span>
          <button className="vp-close" onClick={onClose} aria-label="关闭">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="vp-stage" style={{ aspectRatio: row.ratio.replace(":", "/") }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="vp-frame"
            src={posterFor(row)}
            alt={row.prompt}
            style={{ transform: `scale(${scale}) translate(${tx}%, ${ty}%)` }}
          />
          <div className="vp-vignette" />
          <div className="vp-caption">{row.prompt}</div>
          {!playing && (
            <button className="vp-bigplay" onClick={() => setPlaying(true)} aria-label="播放">
              ▶
            </button>
          )}
        </div>

        <div className="vp-controls">
          <button className="vp-ctrl" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "暂停" : "播放"}>
            {playing ? "❚❚" : "▶"}
          </button>
          <span className="vp-time">{fmt(t)}</span>
          <div
            className="vp-track"
            onPointerDown={(e) => {
              seeking.current = true;
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              seekAt(e.clientX, e.currentTarget);
            }}
            onPointerMove={(e) => {
              if (seeking.current) seekAt(e.clientX, e.currentTarget);
            }}
            onPointerUp={(e) => {
              seeking.current = false;
              last.current = performance.now();
              (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
            }}
          >
            <span className="vp-fill" style={{ width: `${prog * 100}%` }} />
            <span className="vp-knob" style={{ left: `${prog * 100}%` }} />
          </div>
          <span className="vp-time">{fmt(total)}</span>
        </div>

        <div className="vp-foot">
          <button className="btn btn-soft btn-sm" onClick={onDownload}>
            <Icon name="download" size={14} /> 下载视频
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onSave}>
            存内容库
          </button>
          <div className="vp-foot-spacer" />
          <button className="btn btn-primary btn-sm" onClick={onStudio}>
            去制作大片 <Icon name="chevron" size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
