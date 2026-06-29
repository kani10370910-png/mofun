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
import type { VideoRunRow, Grad } from "@/lib/types";

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
// "5秒" → 5
function durSeconds(dur: string): number {
  return parseInt(dur.match(/\d+/)?.[0] ?? "5", 10);
}

export function OnelineVideo() {
  const toast = useToast();
  const { addWork } = useLibrary();
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
  const firstRef = useRef<HTMLInputElement>(null);
  const lastRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  // 选场景模板：填充引导词（保留【变量】占位，模拟「县域知识库未录入」提示）
  function pickScene(s: string, p: string) {
    setScene(s);
    setPrompt(p);
    if (/【.+?】/.test(p)) toast("引导词含县域变量，发布时将从县域知识库自动填充（演示）");
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

  // 存内容库：写入「仓库 · 我的作品」并跳转到仓库页
  function saveToLibrary(row: VideoRunRow) {
    addWork({
      emoji: "🎬",
      grad: row.grad,
      kind: "视频",
      name: `${row.prompt.slice(0, 12) || "一句话视频"} · ${row.dur}`,
      sub: "视频生成 · 一句话成片",
      img: row.poster || posterFor(row),
      time: nowStamp(),
      edit: { sub: "oneline", input: row.prompt },
    });
    toast("已保存到「仓库 · 我的作品」，正在跳转…");
    router.push("/storage");
  }

  // 下载封面帧：同源静态图，用 <a download> 直接落盘
  function downloadFrame(row: VideoRunRow) {
    const src = row.poster || posterFor(row);
    const a = document.createElement("a");
    a.href = src;
    a.download = `${row.prompt.slice(0, 16) || "video-frame"}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast("已下载视频封面帧");
  }

  function deleteRun(id: string) {
    setRuns((prev) => prev.filter((r) => r.id !== id));
  }

  const scenes = videoSceneTpls.filter((t) => t.cat === sceneCat);
  const motionGroup = motionWords.find((m) => m.cat === motionCat) ?? motionWords[0];

  return (
    <>
        {/* 左侧表单 */}
        <div className="workspace">
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

                  {/* 运动描述 + 参考词库 */}
                  <div className="field">
                    <div className="ws-label">
                      运动描述 <span className="req">*</span>
                    </div>
                    <ClearableTextarea
                      value={motion}
                      onChange={(e) => setMotion(e.target.value)}
                      onClear={() => setMotion("")}
                      placeholder="描述画面如何运动，例如：花朵随风轻轻摆动，镜头缓缓推近"
                    />
                    <div className="filter-row" style={{ margin: "10px 0 6px" }}>
                      {motionWords.map((m) => (
                        <span key={m.cat} className={motionCat === m.cat ? "sel-chip on" : "sel-chip"} onClick={() => setMotionCat(m.cat)}>
                          {m.cat}
                        </span>
                      ))}
                    </div>
                    <div className="ov-word-row">
                      {motionGroup.words.map((w) => (
                        <button
                          key={w}
                          type="button"
                          className="ov-word"
                          onClick={() => setMotion((cur) => (cur ? `${cur}，${w}` : w))}
                        >
                          {w}
                        </button>
                      ))}
                    </div>
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
                  onDownload={() => downloadFrame(r)}
                  toast={toast}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {playing && (
        <VideoPlayerModal
          row={playing}
          onClose={() => setPlaying(null)}
          onDownload={() => downloadFrame(playing)}
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
  toast,
}: {
  row: VideoRunRow;
  onDelete: () => void;
  onPlay: () => void;
  onRegenerate: () => void;
  onSave: () => void;
  onDownload: () => void;
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
            <div className="ov-play">▶</div>
            <span className="ov-video-dur">00:{durLabel}</span>
            <span className="lh-mark">由 AI 生成</span>
          </>
        )}
      </div>

      {row.status === "done" && (
        <div className="ov-run-acts">
          <button className="btn btn-soft btn-sm" onClick={onDownload}>下载封面</button>
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
          <span className="vp-meta">{row.style} · {row.ratio}</span>
        </div>

        <div className="vp-foot">
          <button className="btn btn-soft btn-sm" onClick={onDownload}>
            <Icon name="download" size={14} /> 下载封面
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
