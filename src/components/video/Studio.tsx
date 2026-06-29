"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { EditorRail, type RailItem } from "@/components/ui/EditorRail";
import { useToast } from "@/components/ui/Toast";
import { studioSteps } from "@/data/video";
import type { IconName } from "@/data/icons";
import {
  posterFor,
  ratioToCanvas,
  durSeconds,
  drawKenBurns,
  loadImage,
  recordSupported,
  pickMime,
  mimeExt,
} from "@/lib/videoFx";

/* 制作大片 · 参考 LiblibAI 长视频生成的全流程编辑器：
   剧本 → 视频设定 → 场景角色道具 → AI 拆分镜 → 逐镜生成 → 合成预览 + 导出长视频。
   分镜画面复用海报样张 + Ken Burns 运镜；预览=多镜顺序连续播放；导出=MediaRecorder 把多镜合成一段真实长视频。 */

interface Shot {
  id: string;
  line: string; // 旁白 / 画面描述
  camera: string; // 运镜
  dur: number; // 秒
  poster: string;
  status: "idle" | "gen" | "done";
  pct: number;
}

interface Asset {
  id: string;
  emoji: string;
  name: string;
  kind: "场景" | "角色" | "道具";
}

const CAMERAS = ["航拍俯瞰", "缓缓推近", "特写镜头", "环绕拍摄", "上移俯拍", "横移跟拍"];
const ASSET_EMOJIS = ["🏞️", "👩‍🌾", "🍵", "🌾", "🏮", "🎐", "🛶", "🍂"];

const DEFAULT_SCRIPT =
  "安吉明前白茶产品介绍：海拔800米高山茶园产地。氨基酸高、鲜爽回甘的口感特点。手工采摘明前嫩芽。古法工艺匠心制作。限量预订，产地直发到家。";

const SETTING_FIELDS: { label: string; opts: string[] }[] = [
  { label: "画幅", opts: ["横屏 16:9", "竖屏 9:16", "方形 1:1"] },
  { label: "整体风格", opts: ["国风清新", "真实纪实", "活泼种草"] },
  { label: "总时长", opts: ["15s", "30s", "60s"] },
  { label: "配音", opts: ["温柔女声", "沉稳男声", "不配音"] },
];

// 剧本 → 结构化分镜数据
function makeShots(script: string, total: number): Shot[] {
  const bySentence = script
    .split(/[。\n；;！!？?]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  let lines = bySentence.length
    ? bySentence
    : script
        .split(/[，,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
  lines = lines.slice(0, 6);
  if (!lines.length) lines = ["开场画面"];
  const per = Math.max(3, Math.min(6, Math.round(total / lines.length) || 4));
  return lines.map((line, i) => ({
    id: `shot-${i}-${line.length}-${line.charCodeAt(0) || 0}`,
    line,
    camera: CAMERAS[i % CAMERAS.length],
    dur: per,
    poster: posterFor(line + i),
    status: "idle" as const,
    pct: 0,
  }));
}

export function Studio({
  initialStep = "script",
  railItems,
  iconOf,
  onPickType,
  showBack = false,
}: {
  initialStep?: string;
  railItems: RailItem[];
  iconOf: (k: string) => IconName;
  onPickType: (k: string) => void;
  showBack?: boolean; // 仅从生成历史进入时显示返回按钮；直接进入（一级功能）不显示
}) {
  const router = useRouter();
  const toast = useToast();
  const timers = useRef<number[]>([]);

  const [stepKey, setStepKey] = useState(studioSteps.find((s) => s.key === initialStep)?.key ?? "script");
  const [script, setScript] = useState(DEFAULT_SCRIPT);
  const [aiBusy, setAiBusy] = useState(false);
  const [settings, setSettings] = useState<Record<string, string>>({
    画幅: "横屏 16:9",
    整体风格: "国风清新",
    总时长: "30s",
    配音: "温柔女声",
  });
  const [assets, setAssets] = useState<Asset[]>([
    { id: "a1", emoji: "🏞️", name: "高山云雾茶园", kind: "场景" },
    { id: "a2", emoji: "👩‍🌾", name: "采茶姑娘", kind: "角色" },
    { id: "a3", emoji: "🍵", name: "白茶罐装", kind: "道具" },
  ]);
  const [shots, setShots] = useState<Shot[]>(() => makeShots(DEFAULT_SCRIPT, durSeconds("30s")));
  const [exporting, setExporting] = useState(false);
  const [exportPct, setExportPct] = useState(0);

  const ratio = settings.画幅; // 含 "16:9" 子串，videoFx 会解析
  const totalDur = shots.reduce((a, s) => a + s.dur, 0);
  const doneShots = shots.filter((s) => s.status === "done");

  // 制作大片：全屏沉浸模式（隐藏顶栏），离开时还原 + 清理定时器
  useEffect(() => {
    document.body.classList.add("studio-mode");
    const t = timers.current;
    return () => {
      document.body.classList.remove("studio-mode");
      t.forEach((id) => {
        window.clearTimeout(id);
        window.clearInterval(id);
      });
    };
  }, []);

  const activeIdx = studioSteps.findIndex((s) => s.key === stepKey);
  const active = studioSteps[activeIdx] ?? studioSteps[0];

  // 返回：回到真正的来源页（生成历史→一句话成片 / 其他入口→各自来源）；
  // 无站内历史（如直接粘贴 URL 打开）时兜底回视频首页，避免跳出应用。
  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/video?sub=oneline");
  }

  // —— 行为 ——
  function aiScript() {
    setAiBusy(true);
    timers.current.push(
      window.setTimeout(() => {
        setScript(
          (cur) =>
            cur.trim() +
            "。镜头从高山茶园全景航拍切入，推近至嫩芽特写；采茶、冲泡、罐装产地直发逐一呈现，暖色调清新自然、有地域辨识度，配舒缓背景音乐与温柔旁白。"
        );
        setAiBusy(false);
        toast("已 AI 扩写剧本（演示）");
      }, 1100)
    );
  }

  function rebuildShots() {
    setShots(makeShots(script, durSeconds(settings.总时长)));
    toast(`已按剧本拆出分镜（共 ${makeShots(script, durSeconds(settings.总时长)).length} 镜）`);
  }

  function editShot(id: string, patch: Partial<Shot>) {
    setShots((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  function removeShot(id: string) {
    setShots((prev) => prev.filter((s) => s.id !== id));
  }
  function addShot() {
    setShots((prev) => {
      const i = prev.length;
      return [
        ...prev,
        {
          id: `shot-new-${i}-${Date.now() % 100000}`,
          line: "新镜头：补充画面描述",
          camera: CAMERAS[i % CAMERAS.length],
          dur: 4,
          poster: posterFor("new" + i + Date.now()),
          status: "idle",
          pct: 0,
        },
      ];
    });
  }

  // 逐镜生成（进度状态机：idle → gen → done）
  function genShot(id: string) {
    setShots((prev) => prev.map((s) => (s.id === id && s.status !== "gen" ? { ...s, status: "gen", pct: 6 } : s)));
    let pct = 6;
    const iv = window.setInterval(() => {
      pct = Math.min(92, pct + 11);
      setShots((prev) => prev.map((s) => (s.id === id && s.status === "gen" ? { ...s, pct } : s)));
    }, 240);
    timers.current.push(iv);
    const to = window.setTimeout(() => {
      window.clearInterval(iv);
      setShots((prev) => prev.map((s) => (s.id === id ? { ...s, status: "done", pct: 100 } : s)));
    }, 1700 + Math.random() * 700);
    timers.current.push(to);
  }

  function genAll() {
    let stagger = 0;
    shots.forEach((s) => {
      if (s.status === "done") return;
      const to = window.setTimeout(() => genShot(s.id), stagger);
      timers.current.push(to);
      stagger += 360;
    });
    toast("已开始批量生成全部分镜");
  }

  // 导出：把分镜逐镜画面用 Ken Burns 录制并拼接为一段真实长视频
  async function exportFilm() {
    if (exporting) return;
    if (!recordSupported()) {
      toast("当前浏览器不支持视频录制导出", "warn");
      return;
    }
    const filmShots = doneShots.length ? doneShots : shots;
    if (!filmShots.length) {
      toast("请先在「分镜脚本」拆出镜头", "warn");
      return;
    }
    setExporting(true);
    setExportPct(0);
    toast(`正在合成长视频（约 ${filmShots.reduce((a, s) => a + s.dur, 0)} 秒），请稍候…`);
    try {
      const { cw, ch } = ratioToCanvas(ratio, 720);
      const canvas = document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no ctx");
      const imgs = await Promise.all(filmShots.map((s) => loadImage(s.poster)));

      const stream = canvas.captureStream(30);
      const mime = pickMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      const finished = new Promise<void>((resolve) => {
        rec.onstop = () => {
          const type = rec.mimeType || "video/webm";
          const ext = mimeExt(type);
          const blob = new Blob(chunks, { type });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `制作大片_${filmShots.length}镜.${ext}`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          window.setTimeout(() => URL.revokeObjectURL(url), 5000);
          toast(`已导出长视频到本地（.${ext}）`);
          resolve();
        };
      });

      rec.start();
      for (let i = 0; i < filmShots.length; i++) {
        const img = imgs[i];
        const dur = filmShots[i].dur;
        const t0 = performance.now();
        await new Promise<void>((resolve) => {
          const tick = () => {
            const p = Math.min(1, (performance.now() - t0) / 1000 / dur);
            drawKenBurns(ctx, img, cw, ch, p, filmShots[i].line);
            setExportPct(Math.round(((i + p) / filmShots.length) * 100));
            if (p >= 1) resolve();
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
      }
      await new Promise((r) => window.setTimeout(r, 150));
      rec.stop();
      await finished;
    } catch {
      toast("导出失败，请重试", "warn");
    } finally {
      setExporting(false);
      setExportPct(0);
    }
  }

  return (
    <div className="page">
      <div className="editor-layout">
        <EditorRail items={railItems} activeKey="studio" iconOf={iconOf} onPick={onPickType} />
        <div className="studio studio-inline">
          <header className="studio-top">
            <div className="st-left">
              {showBack && (
                <button className="st-back" onClick={goBack} title="返回">
                  <Icon name="chevron" size={18} />
                </button>
              )}
              <span className="st-proj">
                未命名项目 · {active.name} · {shots.length} 镜 / {totalDur}s
              </span>
            </div>
            <div className="st-right">
              <button className="btn btn-ghost btn-sm st-ghost" onClick={genAll}>
                <Icon name="sparkle" size={14} /> 一键生成全部
              </button>
              <button className="btn btn-primary btn-sm" disabled={exporting} onClick={exportFilm}>
                <Icon name="upload" size={14} /> {exporting ? `导出中 ${exportPct}%` : "导出视频"}
              </button>
            </div>
          </header>

          <div className="studio-body">
            <aside className="studio-rail">
              {studioSteps.map((s, i) => {
                const state = i < activeIdx ? "done" : i === activeIdx ? "on" : "";
                return (
                  <div key={s.key} className={`ss-step ${state}`} onClick={() => setStepKey(s.key)}>
                    <span className="ss-no">{s.no}</span>
                    <span className="ss-name">{s.name}</span>
                    {i < activeIdx ? (
                      <span className="ss-state ok">
                        <Icon name="check" size={13} />
                      </span>
                    ) : i === activeIdx ? (
                      <span className="ss-state cur">
                        <Icon name="pencil" size={12} />
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </aside>

            <main className="studio-stage">
              <div className="stage-canvas">
                <StudioStepView
                  stepKey={stepKey}
                  goStep={setStepKey}
                  toast={toast}
                  script={script}
                  setScript={setScript}
                  aiScript={aiScript}
                  aiBusy={aiBusy}
                  settings={settings}
                  setSettings={setSettings}
                  assets={assets}
                  setAssets={setAssets}
                  shots={shots}
                  ratio={ratio}
                  rebuildShots={rebuildShots}
                  editShot={editShot}
                  removeShot={removeShot}
                  addShot={addShot}
                  genShot={genShot}
                  genAll={genAll}
                  exportFilm={exportFilm}
                />
              </div>

              <Timeline shots={shots} totalDur={totalDur} settings={settings} />
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}

function StudioStepView(props: {
  stepKey: string;
  goStep: (k: string) => void;
  toast: (s: string, k?: "warn") => void;
  script: string;
  setScript: (s: string) => void;
  aiScript: () => void;
  aiBusy: boolean;
  settings: Record<string, string>;
  setSettings: (f: (s: Record<string, string>) => Record<string, string>) => void;
  assets: Asset[];
  setAssets: (f: (a: Asset[]) => Asset[]) => void;
  shots: Shot[];
  ratio: string;
  rebuildShots: () => void;
  editShot: (id: string, patch: Partial<Shot>) => void;
  removeShot: (id: string) => void;
  addShot: () => void;
  genShot: (id: string) => void;
  genAll: () => void;
  exportFilm: () => void;
}) {
  const { stepKey, goStep, toast } = props;

  if (stepKey === "script") {
    return (
      <div className="stage-panel">
        <div className="sp-title">① 剧本编辑</div>
        <div className="sp-sub">填写要点，AI 自动生成视频剧本；也可直接粘贴文案。一句话（句号/分号分隔）会拆成一个镜头。</div>
        <textarea
          className="sp-textarea"
          value={props.script}
          onChange={(e) => props.setScript(e.target.value)}
          placeholder="输入产品 / 场景要点，或粘贴成稿文案…"
        />
        <div className="sp-actions">
          <button className="btn btn-soft btn-sm" disabled={props.aiBusy} onClick={props.aiScript}>
            <Icon name={props.aiBusy ? "refresh" : "sparkle"} size={14} className={props.aiBusy ? "ico-spin" : undefined} />{" "}
            {props.aiBusy ? "AI 生成中…" : "AI 扩写剧本"}
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => goStep("setting")}>
            下一步 · 视频设定 →
          </button>
        </div>
      </div>
    );
  }

  if (stepKey === "setting") {
    return (
      <div className="stage-panel">
        <div className="sp-title">② 视频设定</div>
        <div className="sp-sub">画幅、风格、总时长、配音会贯穿到分镜生成、预览与导出。</div>
        <div className="sp-grid">
          {SETTING_FIELDS.map((g) => (
            <SettingField
              key={g.label}
              label={g.label}
              opts={g.opts}
              value={props.settings[g.label === "整体风格" ? "整体风格" : g.label] ?? g.opts[0]}
              onPick={(v) => props.setSettings((s) => ({ ...s, [g.label]: v }))}
            />
          ))}
        </div>
        <div className="sp-actions">
          <button className="btn btn-primary btn-sm" onClick={() => goStep("assets")}>
            下一步 · 场景角色道具 →
          </button>
        </div>
      </div>
    );
  }

  if (stepKey === "assets") {
    return (
      <div className="stage-panel">
        <div className="sp-title">③ 场景角色道具</div>
        <div className="sp-sub">设定出镜元素，AI 在分镜里保持一致性。点 × 删除，可继续添加。</div>
        <div className="sp-cards">
          {props.assets.map((a) => (
            <div className="sp-card" key={a.id}>
              <button className="sp-card-x" onClick={() => props.setAssets((list) => list.filter((x) => x.id !== a.id))} aria-label="删除">
                <Icon name="close" size={12} />
              </button>
              <div className="sp-card-ico">{a.emoji}</div>
              <div>{a.name}</div>
              <span className="tag green">{a.kind}</span>
            </div>
          ))}
          <div
            className="sp-card sp-card-add"
            onClick={() =>
              props.setAssets((list) => [
                ...list,
                {
                  id: "a" + (list.length + 1) + "-" + (Date.now() % 10000),
                  emoji: ASSET_EMOJIS[list.length % ASSET_EMOJIS.length],
                  name: "新元素",
                  kind: "道具",
                },
              ])
            }
          >
            ＋ 添加元素
          </div>
        </div>
        <div className="sp-actions">
          <button className="btn btn-primary btn-sm" onClick={() => goStep("storyboard")}>
            下一步 · 分镜脚本 →
          </button>
        </div>
      </div>
    );
  }

  if (stepKey === "storyboard") {
    return (
      <div className="stage-panel">
        <div className="sp-title">④ 分镜脚本</div>
        <div className="sp-sub">
          AI 已按剧本拆出 {props.shots.length} 个镜头，可改旁白、调时长、增删镜头。
        </div>
        <div className="sb-list">
          {props.shots.map((s, i) => (
            <div className="sb-shot" key={s.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="sb-thumb-img" src={s.poster} alt={`镜头${i + 1}`} />
              <div className="sb-meta">
                <div className="sb-no">
                  镜头 {i + 1} <span className="sb-cam">{s.camera}</span>
                </div>
                <input
                  className="sb-line-input"
                  value={s.line}
                  onChange={(e) => props.editShot(s.id, { line: e.target.value })}
                />
              </div>
              <div className="sb-dur-ctl">
                <button onClick={() => props.editShot(s.id, { dur: Math.max(2, s.dur - 1) })} aria-label="减少时长">
                  −
                </button>
                <span>{s.dur}s</span>
                <button onClick={() => props.editShot(s.id, { dur: Math.min(10, s.dur + 1) })} aria-label="增加时长">
                  ＋
                </button>
              </div>
              <button className="sb-del" onClick={() => props.removeShot(s.id)} aria-label="删除镜头">
                <Icon name="trash" size={14} />
              </button>
            </div>
          ))}
        </div>
        <div className="sp-actions">
          <button className="btn btn-soft btn-sm" onClick={props.addShot}>
            <Icon name="plus" size={14} /> 添加镜头
          </button>
          <button className="btn btn-soft btn-sm" onClick={props.rebuildShots}>
            <Icon name="refresh" size={14} /> 按剧本重新拆分镜
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => goStep("clips")}>
            下一步 · 分镜视频 →
          </button>
        </div>
      </div>
    );
  }

  if (stepKey === "clips") {
    return (
      <div className="stage-panel">
        <div className="sp-title">⑤ 分镜视频</div>
        <div className="sp-sub">逐镜生成视频片段（演示：海报 + 运镜）。全部生成后到「视频预览」合成成片。</div>
        <div className="clip-grid">
          {props.shots.map((s, i) => (
            <div className="clip-card" key={s.id}>
              <div className="clip-thumb">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.poster} alt={`镜头${i + 1}`} />
                {s.status === "gen" ? (
                  <div className="clip-progress">
                    <Icon name="refresh" size={18} className="ico-spin" />
                    <div className="clip-bar">
                      <span style={{ width: `${s.pct}%` }} />
                    </div>
                    <span className="clip-pct">{s.pct}%</span>
                  </div>
                ) : s.status === "done" ? (
                  <>
                    <div className="clip-play">▶</div>
                    <span className="clip-dur">{String(s.dur).padStart(2, "0")}s</span>
                    <span className="clip-ok">
                      <Icon name="check" size={11} /> 已生成
                    </span>
                  </>
                ) : (
                  <button className="clip-gen" onClick={() => props.genShot(s.id)}>
                    <Icon name="sparkle" size={14} /> 生成
                  </button>
                )}
              </div>
              <div className="clip-foot">
                <span>镜头 {i + 1}</span>
                {s.status !== "gen" && (
                  <button className="btn btn-ghost btn-sm" onClick={() => props.genShot(s.id)}>
                    <Icon name="refresh" size={12} /> {s.status === "done" ? "重生成" : "生成"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="sp-actions">
          <button className="btn btn-soft btn-sm" onClick={props.genAll}>
            <Icon name="sparkle" size={14} /> 批量生成全部
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => goStep("preview")}>
            下一步 · 视频预览 →
          </button>
        </div>
      </div>
    );
  }

  // preview
  const ready = props.shots.filter((s) => s.status === "done");
  if (!ready.length) {
    return (
      <div className="stage-preview">
        <div className="stage-logo">
          <Icon name="video" size={56} />
        </div>
        <div className="stage-tip">还没有已生成的分镜片段，先去「分镜视频」生成，再回来合成预览</div>
        <button className="btn btn-primary btn-sm" style={{ marginTop: 14 }} onClick={() => goStep("clips")}>
          去生成分镜视频
        </button>
      </div>
    );
  }
  return (
    <div className="stage-panel">
      <div className="sp-title">⑥ 视频预览</div>
      <div className="sp-sub">
        {ready.length} 个分镜按顺序连续播放（共 {ready.reduce((a, s) => a + s.dur, 0)}s）。满意后点右上角「导出视频」生成长片。
      </div>
      <FilmPlayer shots={ready} ratio={props.ratio} />
      <div className="sp-actions">
        <button className="btn btn-primary btn-sm" onClick={props.exportFilm}>
          <Icon name="upload" size={14} /> 导出长视频
        </button>
      </div>
    </div>
  );
}

// 合成预览播放器：多镜顺序连续播放，canvas + rAF 实时绘制 Ken Burns
function FilmPlayer({ shots, ratio }: { shots: Shot[]; ratio: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(true);
  const playingRef = useRef(true);
  const tRef = useRef(0);
  const uiRef = useRef(0);
  const seekRef = useRef(false);
  const [t, setT] = useState(0);
  const [idx, setIdx] = useState(0);
  const imgs = useRef<Record<string, HTMLImageElement>>({});
  const total = shots.reduce((a, s) => a + s.dur, 0) || 1;

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    let alive = true;
    shots.forEach((s) => {
      if (!imgs.current[s.poster])
        loadImage(s.poster)
          .then((im) => {
            if (alive) imgs.current[s.poster] = im;
          })
          .catch(() => {});
    });
    return () => {
      alive = false;
    };
  }, [shots]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { cw, ch } = ratioToCanvas(ratio, 540);
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();
    let stop = false;
    const frame = (now: number) => {
      if (stop) return;
      const dt = (now - last) / 1000;
      last = now;
      if (playingRef.current && !seekRef.current) {
        tRef.current += dt;
        if (tRef.current >= total) tRef.current = 0;
      }
      let acc = 0;
      let ci = 0;
      let p = 0;
      for (let i = 0; i < shots.length; i++) {
        if (tRef.current < acc + shots[i].dur) {
          ci = i;
          p = (tRef.current - acc) / shots[i].dur;
          break;
        }
        acc += shots[i].dur;
        ci = i;
        p = 1;
      }
      const img = imgs.current[shots[ci].poster];
      if (img) drawKenBurns(ctx, img, cw, ch, p, shots[ci].line);
      if (Math.abs(tRef.current - uiRef.current) > 0.1) {
        uiRef.current = tRef.current;
        setT(tRef.current);
        setIdx(ci);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      stop = true;
      cancelAnimationFrame(raf);
    };
  }, [shots, ratio, total]);

  const fmt = (s: number) => `00:${String(Math.floor(s)).padStart(2, "0")}`;
  function seek(clientX: number, el: HTMLElement) {
    const rect = el.getBoundingClientRect();
    const r = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    tRef.current = r * total;
    setT(tRef.current);
  }

  return (
    <div className="film-player">
      <div className="film-stage">
        <canvas ref={canvasRef} className="film-canvas" />
        {!playing && (
          <button className="film-bigplay" onClick={() => setPlaying(true)} aria-label="播放">
            ▶
          </button>
        )}
        <span className="film-shot-tag">
          镜头 {idx + 1}/{shots.length}
        </span>
      </div>
      <div className="film-ctrls">
        <button className="vp-ctrl" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "暂停" : "播放"}>
          {playing ? "❚❚" : "▶"}
        </button>
        <span className="vp-time">{fmt(t)}</span>
        <div
          className="vp-track"
          onPointerDown={(e) => {
            seekRef.current = true;
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            seek(e.clientX, e.currentTarget);
          }}
          onPointerMove={(e) => {
            if (seekRef.current) seek(e.clientX, e.currentTarget);
          }}
          onPointerUp={(e) => {
            seekRef.current = false;
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
          }}
        >
          <span className="vp-fill" style={{ width: `${(t / total) * 100}%` }} />
          {/* 分镜分隔点 */}
          {shots.slice(0, -1).map((_, i) => {
            const acc = shots.slice(0, i + 1).reduce((a, s) => a + s.dur, 0);
            return <span key={i} className="film-tick" style={{ left: `${(acc / total) * 100}%` }} />;
          })}
        </div>
        <span className="vp-time">{fmt(total)}</span>
      </div>
    </div>
  );
}

function SettingField({
  label,
  opts,
  value,
  onPick,
}: {
  label: string;
  opts: string[];
  value: string;
  onPick: (v: string) => void;
}) {
  return (
    <div className="sp-field">
      <div className="sp-label">{label}</div>
      <div className="chip-row">
        {opts.map((o) => (
          <span key={o} className={value === o ? "sel-chip on" : "sel-chip"} onClick={() => onPick(o)}>
            {o}
          </span>
        ))}
      </div>
    </div>
  );
}

// 多轨时间轴：视频轨按分镜分段（已生成显示封面），配音/字幕/音乐随设定
function Timeline({ shots, totalDur, settings }: { shots: Shot[]; totalDur: number; settings: Record<string, string> }) {
  const total = totalDur || 1;
  const hasVoice = settings.配音 && settings.配音 !== "不配音";
  return (
    <div className="timeline">
      <div className="tl-playhead" />
      <div className="tl-row">
        <span className="tl-label">视频</span>
        <div className="tl-track tl-video">
          {shots.length === 0 ? (
            <span className="tl-empty">＋ 还没有分镜，去「分镜脚本」拆分镜～</span>
          ) : (
            shots.map((s, i) => (
              <div
                key={s.id}
                className={`tl-seg ${s.status === "done" ? "done" : s.status === "gen" ? "gen" : "idle"}`}
                style={{ width: `${(s.dur / total) * 100}%` }}
                title={`镜头${i + 1} · ${s.line}`}
              >
                {s.status === "done" && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.poster} alt="" />
                )}
                <span className="tl-seg-no">{i + 1}</span>
              </div>
            ))
          )}
        </div>
      </div>
      <div className="tl-row">
        <span className="tl-label">配音</span>
        <div className="tl-track">
          {hasVoice ? <div className="tl-fullbar tl-voice">🎙 {settings.配音} · 旁白</div> : <span className="tl-none">无</span>}
        </div>
      </div>
      <div className="tl-row">
        <span className="tl-label">字幕</span>
        <div className="tl-track tl-sub">
          {shots.length ? (
            shots.map((s, i) => (
              <div key={s.id} className="tl-seg-sub" style={{ width: `${(s.dur / total) * 100}%` }} title={s.line}>
                {s.line}
              </div>
            ))
          ) : (
            <span className="tl-none">字 无</span>
          )}
        </div>
      </div>
      <div className="tl-row">
        <span className="tl-label">音乐</span>
        <div className="tl-track tl-music">
          {shots.length ? <div className="tl-fullbar">♪ 背景音乐 · 舒缓</div> : <span className="tl-none">♪ 无</span>}
        </div>
      </div>
    </div>
  );
}
