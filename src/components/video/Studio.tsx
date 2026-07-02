"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { EditorRail, type RailItem } from "@/components/ui/EditorRail";
import { useToast } from "@/components/ui/Toast";
import { studioSteps, studioCameras, studioShotSizes } from "@/data/video";
import { useLibrary } from "@/lib/store";
import { nowStamp } from "@/lib/datetime";
import type { IconName } from "@/data/icons";
import type { AssetCard } from "@/lib/types";
import {
  posterFor,
  ratioToCanvas,
  drawKenBurns,
  loadImage,
  recordSupported,
  pickMime,
  mimeExt,
} from "@/lib/videoFx";

/* 制作大片 · 参考 LiblibAI 长视频生成的全流程编辑器：
   剧本 → 视频设定 → 场景角色道具 → AI 拆分镜 → 逐镜生成 → 合成预览 + 导出长视频。
   分镜画面复用海报样张 + Ken Burns 运镜；预览=多镜顺序连续播放；导出=MediaRecorder 把多镜合成一段真实长视频。 */

/* M5 分镜脚本结构化：一个镜头 = 画面描述 + 口播旁白 + 字幕 + 调度（运镜/景别/出镜元素） */
interface Shot {
  id: string;
  shotDesc: string; // 画面描述（喂给图/视频模型的提示词）
  narration: string; // 口播旁白（喂给 TTS 配音）
  caption: string; // 字幕（默认继承旁白，可独立编辑）
  camera: string; // 运镜
  shotSize: string; // 景别：远/全/中/近/特
  assetRefs: string[]; // 出镜元素引用（关联场景角色道具，跨镜一致性）
  dur: number; // 秒
  locked: boolean; // 锁定：重新拆分镜时保留
  poster: string;
  status: "idle" | "gen" | "done" | "failed";
  pct: number;
  failReason?: string; // 失败原因（已映射为中文）
}

interface Asset {
  id: string;
  emoji: string;
  name: string;
  kind: "场景" | "角色" | "道具";
  refImg?: string; // 参考图（一致性锚点），生成时注入
}

const ASSET_KINDS: Asset["kind"][] = ["场景", "角色", "道具"];

const CAMERAS = [...studioCameras];
const SHOT_SIZES = [...studioShotSizes];
const ASSET_EMOJIS = ["🏞️", "👩‍🌾", "🍵", "🌾", "🏮", "🎐", "🛶", "🍂"];

const DEFAULT_SCRIPT =
  "安吉明前白茶产品介绍：海拔800米高山茶园产地。氨基酸高、鲜爽回甘的口感特点。手工采摘明前嫩芽。古法工艺匠心制作。限量预订，产地直发到家。";

const SETTING_FIELDS: { label: string; opts: string[]; hint?: string }[] = [
  { label: "画幅", opts: ["横屏 16:9", "竖屏 9:16", "方形 1:1"] },
  { label: "整体风格", opts: ["国风清新", "真实纪实", "活泼种草", "电影感", "航拍大片"] },
  { label: "配音", opts: ["温柔女声", "沉稳男声", "不配音"] },
  { label: "配乐", opts: ["舒缓", "轻快", "大气", "国风", "无"] },
  { label: "字幕", opts: ["显示", "隐藏"] },
  { label: "画质", opts: ["720P 清晰", "1080P 高清"], hint: "1080P 消耗 2 倍额度" },
];

// 剧本 → 结构化分镜数据
// 拆分镜：按「目标镜头数」把剧本切成 n 个镜头，总时长平均分配到每镜。
// targetShots 省略时按句子数（上限 6）自动定；否则严格产出 n 个镜头。
function makeShots(script: string, total: number, targetShots?: number): Shot[] {
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
  if (!lines.length) lines = ["开场画面"];
  const L = lines.length;
  const n = Math.max(1, Math.min(12, targetShots ?? Math.min(6, L)));
  // 把总时长精确分配到 n 个镜头：base 秒均分，余数派给前若干镜，使各镜时长之和恰等于总时长
  const base = Math.floor(total / n);
  const rem = total - base * n;
  return Array.from({ length: n }, (_, i) => {
    const dur = Math.max(2, Math.min(15, base + (i < rem ? 1 : 0)));
    // 把句子按比例分配到 n 个镜头：句子多于镜头则合并，少于镜头则循环兜底
    const start = Math.floor((i * L) / n);
    const end = Math.floor(((i + 1) * L) / n);
    const seg = lines.slice(start, Math.max(end, start + 1));
    const text = seg.join("，") || lines[i % L] || `镜头 ${i + 1} 画面`;
    return {
      id: `shot-${i}-${text.length}-${text.charCodeAt(0) || 0}`,
      shotDesc: text, // 演示：画面描述 = 分配到的句子；实际由结构化拆分引擎产出
      narration: text, // 口播旁白默认同句，可独立编辑
      caption: text, // 字幕默认继承旁白
      camera: CAMERAS[i % CAMERAS.length],
      shotSize: SHOT_SIZES[i % SHOT_SIZES.length],
      assetRefs: [] as string[],
      locked: false,
      dur,
      poster: posterFor(text + i),
      status: "idle" as const,
      pct: 0,
    };
  });
}

export function Studio({
  initialStep = "script",
  initialName,
  railItems,
  iconOf,
  onPickType,
  showBack = false,
}: {
  initialStep?: string;
  initialName?: string; // 从首页「新建大片」命名 / 打开项目时带入
  railItems: RailItem[];
  iconOf: (k: string) => IconName;
  onPickType: (k: string) => void;
  showBack?: boolean; // 仅从生成历史进入时显示返回按钮；直接进入（一级功能）不显示
}) {
  const router = useRouter();
  const toast = useToast();
  const { addWork } = useLibrary();
  const timers = useRef<number[]>([]);

  const [projectName, setProjectName] = useState(initialName?.trim() || "未命名项目");
  const [stepKey, setStepKey] = useState(studioSteps.find((s) => s.key === initialStep)?.key ?? "script");
  const [script, setScript] = useState(DEFAULT_SCRIPT);
  const [aiBusy, setAiBusy] = useState(false);
  const [settings, setSettings] = useState<Record<string, string>>({
    画幅: "横屏 16:9",
    整体风格: "国风清新",
    总时长: "30s",
    配音: "温柔女声",
    配乐: "舒缓",
    字幕: "显示",
    画质: "720P 清晰",
  });
  // 用户自定义：目标镜头数 + 总时长（秒），驱动拆分镜。用 ref 保存最新值，
  // 避免两个 stepper 互读对方的陈旧闭包值导致覆盖。
  const [totalSec, setTotalSec] = useState(30);
  const [targetShots, setTargetShots] = useState(() => makeShots(DEFAULT_SCRIPT, 30).length);
  const totalSecRef = useRef(30);
  const targetShotsRef = useRef(makeShots(DEFAULT_SCRIPT, 30).length);
  const [assets, setAssets] = useState<Asset[]>([
    { id: "a1", emoji: "🏞️", name: "高山云雾茶园", kind: "场景" },
    { id: "a2", emoji: "👩‍🌾", name: "采茶姑娘", kind: "角色" },
    { id: "a3", emoji: "🍵", name: "白茶罐装", kind: "道具" },
  ]);
  const [shots, setShots] = useState<Shot[]>(() => makeShots(DEFAULT_SCRIPT, 30));
  const [exporting, setExporting] = useState(false);
  const [exportPct, setExportPct] = useState(0);

  const ratio = settings.画幅; // 含 "16:9" 子串，videoFx 会解析
  const totalDur = shots.reduce((a, s) => a + s.dur, 0);
  const doneShots = shots.filter((s) => s.status === "done");

  // 仅「从生成历史进入」时启用全屏沉浸模式（隐藏顶栏，配合返回按钮）；
  // 直接进入是一级功能，保留顶栏作为导航，避免无顶栏又无返回而出不去。
  useEffect(() => {
    const immersive = showBack;
    if (immersive) document.body.classList.add("studio-mode");
    const t = timers.current;
    return () => {
      if (immersive) document.body.classList.remove("studio-mode");
      t.forEach((id) => {
        window.clearTimeout(id);
        window.clearInterval(id);
      });
    };
  }, [showBack]);

  const activeIdx = studioSteps.findIndex((s) => s.key === stepKey);
  const active = studioSteps[activeIdx] ?? studioSteps[0];

  // 返回：回到真正的来源页（生成历史→一句话成片 / 其他入口→各自来源）；
  // 无站内历史（如直接粘贴 URL 打开）时兜底回视频首页，避免跳出应用。
  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/video?sub=oneline");
  }

  // —— 行为 ——
  // M2：AI 结构化生成——把要点/成稿组织成「开场钩子 → 卖点 → 场景 → 行动号召」四段式剧本
  function aiScript() {
    setAiBusy(true);
    timers.current.push(
      window.setTimeout(() => {
        setScript((cur) => {
          const core = cur.trim().replace(/[。.!！?？\s]+$/, "");
          const subject = core.slice(0, 12) || "本产品";
          return [
            `【开场】航拍缓缓切入，${subject}的产地全景在晨光中展开，瞬间抓住眼球。`,
            `【卖点】推近特写，逐一呈现核心卖点：${core}。`,
            `【场景】切入真实使用/生产场景，人物动作自然，画面有地域辨识度。`,
            `【号召】结尾定格产品与标识，配一句行动号召，引导下单/到店/关注。`,
          ].join("\n");
        });
        setAiBusy(false);
        toast("已生成结构化剧本（开场/卖点/场景/号召，演示）");
      }, 1100)
    );
  }

  // 非破坏式重拆：锁定的镜头保留，其余按「目标镜头数 + 总时长」重新拆分
  function rebuildShots() {
    setShots((prev) => {
      const locked = prev.filter((s) => s.locked);
      const fresh = makeShots(script, totalSec, targetShots);
      if (!locked.length) {
        toast(`已按剧本拆出分镜（共 ${fresh.length} 镜）`);
        return fresh;
      }
      const merged = [...locked, ...fresh];
      toast(`已重新拆分镜，保留 ${locked.length} 个锁定镜头（共 ${merged.length} 镜）`);
      return merged;
    });
  }

  // 用户调整目标镜头数 / 总时长：立即按新参数重拆（剧本编辑阶段，直接覆盖）。
  // 约束：每镜不超过 15 秒 → 总时长上限 = 镜头数 × 15；通过 ref 读取另一维度的最新值，连续调整也不互相覆盖。
  function setShotCount(n: number) {
    const v = Math.max(1, Math.min(12, Math.round(n)));
    targetShotsRef.current = v;
    setTargetShots(v);
    // 镜头减少后若每镜超 15s，则同步收窄总时长
    let t = totalSecRef.current;
    if (t > v * 15) {
      t = v * 15;
      totalSecRef.current = t;
      setTotalSec(t);
      toast("每镜最长 15 秒，已同步调整总时长");
    }
    setShots(makeShots(script, t, v));
  }
  function setTotal(sec: number) {
    const cap = targetShotsRef.current * 15; // 每镜 ≤ 15s
    const want = Math.round(sec);
    const v = Math.max(5, Math.min(cap, want));
    if (want > cap) toast("每镜最长 15 秒，请增加镜头数以延长总时长", "warn");
    totalSecRef.current = v;
    setTotalSec(v);
    setShots(makeShots(script, v, targetShotsRef.current));
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
          shotDesc: "新镜头：补充画面描述",
          narration: "",
          caption: "",
          camera: CAMERAS[i % CAMERAS.length],
          shotSize: SHOT_SIZES[i % SHOT_SIZES.length],
          assetRefs: [],
          locked: false,
          dur: 4,
          poster: posterFor("new" + i + Date.now()),
          status: "idle",
          pct: 0,
        },
      ];
    });
  }
  // 镜头排序：上移 / 下移
  function moveShot(id: string, dir: -1 | 1) {
    setShots((prev) => {
      const i = prev.findIndex((s) => s.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  // 复制镜头：在其后插入一份副本（重置生成状态）
  function duplicateShot(id: string) {
    setShots((prev) => {
      const i = prev.findIndex((s) => s.id === id);
      if (i < 0) return prev;
      const src = prev[i];
      const copy: Shot = {
        ...src,
        id: `shot-copy-${i}-${Date.now() % 100000}`,
        locked: false,
        status: "idle",
        pct: 0,
      };
      const next = [...prev];
      next.splice(i + 1, 0, copy);
      return next;
    });
  }
  function toggleLock(id: string) {
    setShots((prev) => prev.map((s) => (s.id === id ? { ...s, locked: !s.locked } : s)));
  }

  // 逐镜生成（状态机：idle/failed → gen → done / failed）
  // 演示：约 12% 概率失败，落到失败态并给出映射后的中文原因 + 可重试
  function genShot(id: string) {
    setShots((prev) => prev.map((s) => (s.id === id && s.status !== "gen" ? { ...s, status: "gen", pct: 6, failReason: undefined } : s)));
    let pct = 6;
    const iv = window.setInterval(() => {
      pct = Math.min(92, pct + 11);
      setShots((prev) => prev.map((s) => (s.id === id && s.status === "gen" ? { ...s, pct } : s)));
    }, 240);
    timers.current.push(iv);
    const to = window.setTimeout(() => {
      window.clearInterval(iv);
      const fail = Math.random() < 0.12;
      setShots((prev) =>
        prev.map((s) =>
          s.id === id
            ? fail
              ? { ...s, status: "failed", pct: 0, failReason: "生成失败，请重试（额度已退还）" }
              : { ...s, status: "done", pct: 100, failReason: undefined }
            : s
        )
      );
    }, 1700 + Math.random() * 700);
    timers.current.push(to);
  }

  // 批量生成：生成前弹额度预估确认（1080P 计 2 倍额度）
  function genAll() {
    const pending = shots.filter((s) => s.status !== "done");
    if (!pending.length) {
      toast("全部分镜已生成完成");
      return;
    }
    const mult = settings.画质?.includes("1080") ? 2 : 1;
    const cost = pending.length * mult;
    const ok = window.confirm(
      `本次将生成 ${pending.length} 个分镜，预计消耗 ${cost} 次生成额度${mult === 2 ? "（1080P 高清 ×2）" : ""}。是否继续？`
    );
    if (!ok) return;
    let stagger = 0;
    pending.forEach((s) => {
      const to = window.setTimeout(() => genShot(s.id), stagger);
      timers.current.push(to);
      stagger += 360;
    });
    toast(`已开始批量生成 ${pending.length} 个分镜`);
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
            drawKenBurns(ctx, img, cw, ch, p, filmShots[i].caption);
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

  // M9：成片交付——存入「我的作品 / 仓库」（写入作品库，缩略图取首个已生成分镜）
  function saveToLibrary() {
    const film = doneShots.length ? doneShots : shots;
    if (!film.length) {
      toast("请先在「分镜脚本」拆出镜头", "warn");
      return;
    }
    const card: AssetCard = {
      emoji: "🎬",
      grad: "thumb-grad-1",
      kind: "视频",
      name: `${projectName} · ${film.length}镜 / ${film.reduce((a, s) => a + s.dur, 0)}s`,
      sub: "视频生成 · 制作大片",
      img: film[0].poster,
      time: nowStamp(),
      edit: { sub: "studio" },
    };
    try {
      addWork(card);
      toast("已存入「我的作品 · 仓库」");
    } catch (e) {
      if (e instanceof DOMException && e.name === "QuotaExceededError") {
        toast("本地存储空间不足，作品可能未保存", "warn");
      } else {
        toast("存入失败，请重试", "warn");
      }
    }
  }

  // M9：提交审核（演示——真实流程接入平台审核队列）
  function submitReview() {
    if (!doneShots.length) {
      toast("请先生成分镜并合成成片，再提交审核", "warn");
      return;
    }
    toast("已提交审核，结果将在「我的作品」中更新（演示）");
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
              <input
                className="st-proj-input"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                aria-label="项目名称"
                title="点击修改项目名称"
              />
              <span className="st-proj-meta">
                {active.name} · {shots.length} 镜 / {totalDur}s
              </span>
              <span className="st-progress">
                第 {activeIdx + 1}/{studioSteps.length} 步 · {doneShots.length}/{shots.length} 镜已生成
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
                  totalSec={totalSec}
                  targetShots={targetShots}
                  setShotCount={setShotCount}
                  setTotal={setTotal}
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
                  moveShot={moveShot}
                  duplicateShot={duplicateShot}
                  toggleLock={toggleLock}
                  genShot={genShot}
                  genAll={genAll}
                  exportFilm={exportFilm}
                  saveToLibrary={saveToLibrary}
                  submitReview={submitReview}
                  exporting={exporting}
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
  totalSec: number;
  targetShots: number;
  setShotCount: (n: number) => void;
  setTotal: (sec: number) => void;
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
  moveShot: (id: string, dir: -1 | 1) => void;
  duplicateShot: (id: string) => void;
  toggleLock: (id: string) => void;
  genShot: (id: string) => void;
  genAll: () => void;
  exportFilm: () => void;
  saveToLibrary: () => void;
  submitReview: () => void;
  exporting: boolean;
}) {
  const { stepKey, goStep, toast } = props;

  if (stepKey === "script") {
    return (
      <div className="stage-panel">
        <div className="sp-title">① 剧本编辑</div>
        <div className="sp-sub">填写要点或粘贴成稿，AI 生成「开场/卖点/场景/号召」结构化剧本；一句话（句号/分号分隔）会拆成一个镜头。</div>
        <textarea
          className="sp-textarea"
          value={props.script}
          onChange={(e) => props.setScript(e.target.value)}
          placeholder="输入产品 / 场景要点，或粘贴成稿文案…"
        />
        <div className="sp-setrow">
          <div className="sp-setctl">
            <span className="sp-setlbl">镜头数</span>
            <div className="sp-stepper">
              <button onClick={() => props.setShotCount(props.targetShots - 1)} disabled={props.targetShots <= 1} aria-label="减少镜头">−</button>
              <span>{props.targetShots} 镜</span>
              <button onClick={() => props.setShotCount(props.targetShots + 1)} disabled={props.targetShots >= 12} aria-label="增加镜头">＋</button>
            </div>
          </div>
          <div className="sp-setctl">
            <span className="sp-setlbl">总时长</span>
            <div className="sp-stepper">
              <button onClick={() => props.setTotal(props.totalSec - 5)} disabled={props.totalSec <= 5} aria-label="减少时长">−</button>
              <span>{props.totalSec}s</span>
              <button onClick={() => props.setTotal(props.totalSec + 5)} disabled={props.totalSec >= props.targetShots * 15} aria-label="增加时长" title="每镜最长 15 秒">＋</button>
            </div>
          </div>
          <span className="sp-setnote">每镜约 {Math.max(2, Math.round(props.totalSec / props.targetShots))}s · {props.settings.画质}</span>
        </div>
        <div className="sp-actions">
          <button className="btn btn-soft btn-sm" disabled={props.aiBusy} onClick={props.aiScript}>
            <Icon name={props.aiBusy ? "refresh" : "sparkle"} size={14} className={props.aiBusy ? "ico-spin" : undefined} />{" "}
            {props.aiBusy ? "AI 生成中…" : "AI 生成结构化剧本"}
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
        <div className="sp-sub">画幅、风格、配音、配乐、字幕、画质会贯穿到分镜生成、预览与导出（镜头数与总时长在「剧本编辑」设定）。</div>
        <div className="sp-grid">
          {SETTING_FIELDS.map((g) => (
            <SettingField
              key={g.label}
              label={g.label}
              opts={g.opts}
              hint={g.hint}
              value={props.settings[g.label] ?? g.opts[0]}
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
        <div className="sp-sub">设定出镜元素并上传参考图，可改名称/类型；在「分镜脚本」为每镜勾选出镜元素，生成时注入参考图保持跨镜一致。</div>
        <div className="sp-cards2">
          {props.assets.map((a) => (
            <AssetCardEdit
              key={a.id}
              asset={a}
              toast={toast}
              onChange={(patch) => props.setAssets((list) => list.map((x) => (x.id === a.id ? { ...x, ...patch } : x)))}
              onRemove={() => props.setAssets((list) => list.filter((x) => x.id !== a.id))}
            />
          ))}
          <button
            type="button"
            className="sp-card2 sp-card2-add"
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
          </button>
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
          AI 已按剧本拆出 {props.shots.length} 个镜头。每镜可分别编辑「画面描述 / 口播旁白 / 字幕」，并设定运镜、景别、时长；可排序、复制、锁定、增删。
        </div>
        <div className="sb-list">
          {props.shots.map((s, i) => (
            <div className={`sb-shot2 ${s.locked ? "locked" : ""}`} key={s.id}>
              <div className="sb-head">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="sb-thumb-img" src={s.poster} alt={`镜头${i + 1}`} />
                <div className="sb-headinfo">
                  <div className="sb-no">
                    镜头 {i + 1}
                    {s.locked && <span className="sb-lock-tag">已锁定</span>}
                  </div>
                  <div className="sb-tools">
                    <button className="sb-tool" onClick={() => props.moveShot(s.id, -1)} disabled={i === 0} aria-label="上移" title="上移">↑</button>
                    <button className="sb-tool" onClick={() => props.moveShot(s.id, 1)} disabled={i === props.shots.length - 1} aria-label="下移" title="下移">↓</button>
                    <button className="sb-tool" onClick={() => props.duplicateShot(s.id)} aria-label="复制" title="复制镜头">复制</button>
                    <button className={`sb-tool ${s.locked ? "on" : ""}`} onClick={() => props.toggleLock(s.id)} aria-label="锁定" title="锁定后重新拆分镜时保留">{s.locked ? "解锁" : "锁定"}</button>
                    <button className="sb-tool danger" onClick={() => props.removeShot(s.id)} aria-label="删除镜头" title="删除">
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="sb-fields">
                <label className="sb-flabel">画面描述</label>
                <textarea
                  className="sb-field-ta"
                  rows={2}
                  value={s.shotDesc}
                  placeholder="这一镜画面里有什么（用于生成）…"
                  onChange={(e) => props.editShot(s.id, { shotDesc: e.target.value })}
                />
                <label className="sb-flabel">口播旁白</label>
                <input
                  className="sb-field-in"
                  value={s.narration}
                  placeholder="这一镜的配音文案（用于 TTS）…"
                  onChange={(e) => props.editShot(s.id, { narration: e.target.value })}
                />
                <label className="sb-flabel">
                  字幕
                  <button
                    className="sb-sync"
                    type="button"
                    onClick={() => props.editShot(s.id, { caption: s.narration })}
                    title="用口播旁白填充字幕"
                  >
                    同步旁白
                  </button>
                </label>
                <input
                  className="sb-field-in"
                  value={s.caption}
                  placeholder="屏幕字幕（默认继承旁白）…"
                  onChange={(e) => props.editShot(s.id, { caption: e.target.value })}
                />
              </div>

              <div className="sb-ctls">
                <label className="sb-ctl">
                  <span>运镜</span>
                  <select className="sb-sel" value={s.camera} onChange={(e) => props.editShot(s.id, { camera: e.target.value })}>
                    {CAMERAS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label className="sb-ctl">
                  <span>景别</span>
                  <select className="sb-sel" value={s.shotSize} onChange={(e) => props.editShot(s.id, { shotSize: e.target.value })}>
                    {SHOT_SIZES.map((z) => (
                      <option key={z} value={z}>{z}</option>
                    ))}
                  </select>
                </label>
                <div className="sb-dur-ctl">
                  <button onClick={() => props.editShot(s.id, { dur: Math.max(2, s.dur - 1) })} aria-label="减少时长">−</button>
                  <span>{s.dur}s</span>
                  <button onClick={() => props.editShot(s.id, { dur: Math.min(15, s.dur + 1) })} aria-label="增加时长">＋</button>
                </div>
              </div>

              {props.assets.length > 0 && (
                <div className="sb-assets">
                  <span className="sb-assets-lbl">出镜元素</span>
                  {props.assets.map((a) => {
                    const on = s.assetRefs.includes(a.id);
                    return (
                      <span
                        key={a.id}
                        className={on ? "sb-asset-chip on" : "sb-asset-chip"}
                        onClick={() =>
                          props.editShot(s.id, {
                            assetRefs: on ? s.assetRefs.filter((x) => x !== a.id) : [...s.assetRefs, a.id],
                          })
                        }
                        title={on ? "点击取消绑定" : "点击绑定该元素"}
                      >
                        {a.refImg ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.refImg} alt="" className="sb-asset-thumb" />
                        ) : (
                          <span className="sb-asset-emoji">{a.emoji}</span>
                        )}
                        {a.name}
                      </span>
                    );
                  })}
                </div>
              )}
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
                ) : s.status === "failed" ? (
                  <div className="clip-fail">
                    <Icon name="close" size={16} />
                    <span className="clip-fail-msg">{s.failReason ?? "生成失败"}</span>
                    <button className="clip-retry" onClick={() => props.genShot(s.id)}>
                      <Icon name="refresh" size={12} /> 重试
                    </button>
                  </div>
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
                    <Icon name="refresh" size={12} /> {s.status === "done" ? "重生成" : s.status === "failed" ? "重试" : "生成"}
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
        {ready.length} 个分镜按顺序连续播放（共 {ready.reduce((a, s) => a + s.dur, 0)}s）。满意后可导出到本地、存入作品库或提交审核。
      </div>
      <FilmPlayer shots={ready} ratio={props.ratio} />
      <div className="sp-actions">
        <button className="btn btn-primary btn-sm" disabled={props.exporting} onClick={props.exportFilm}>
          <Icon name="upload" size={14} /> {props.exporting ? "导出中…" : "导出到本地"}
        </button>
        <button className="btn btn-soft btn-sm" onClick={props.saveToLibrary}>
          <Icon name="check" size={14} /> 存入作品库
        </button>
        <button className="btn btn-soft btn-sm" onClick={props.submitReview}>
          <Icon name="upload" size={14} /> 提交审核
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
      if (img) drawKenBurns(ctx, img, cw, ch, p, shots[ci].caption);
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
  hint,
  onPick,
}: {
  label: string;
  opts: string[];
  value: string;
  hint?: string;
  onPick: (v: string) => void;
}) {
  return (
    <div className="sp-field">
      <div className="sp-label">
        {label}
        {hint && <span className="sp-hint">{hint}</span>}
      </div>
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

// M4：可编辑元素卡——名称 / 类型 / 参考图（一致性锚点）
function AssetCardEdit({
  asset,
  toast,
  onChange,
  onRemove,
}: {
  asset: Asset;
  toast: (s: string, k?: "warn") => void;
  onChange: (patch: Partial<Asset>) => void;
  onRemove: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["jpg", "jpeg", "png", "webp"].includes(ext)) {
      toast("仅支持 JPG、PNG、WEBP 格式图片", "warn");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast("图片大小不能超过 10 MB，请压缩后重试", "warn");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onChange({ refImg: String(reader.result) });
    reader.readAsDataURL(f);
  }
  return (
    <div className="sp-card2">
      <button className="sp-card2-x" onClick={onRemove} aria-label="删除">
        <Icon name="close" size={12} />
      </button>
      <button className="sp-card2-img" type="button" onClick={() => fileRef.current?.click()} title="上传参考图">
        {asset.refImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset.refImg} alt={asset.name} />
        ) : (
          <span className="sp-card2-ph">
            <span className="sp-card2-emoji">{asset.emoji}</span>
            <span className="sp-card2-up">＋ 参考图</span>
          </span>
        )}
      </button>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onFile} />
      <input
        className="sp-card2-name"
        value={asset.name}
        placeholder="元素名称"
        onChange={(e) => onChange({ name: e.target.value })}
      />
      <div className="sp-card2-kinds">
        {ASSET_KINDS.map((k) => (
          <span
            key={k}
            className={asset.kind === k ? "sp-kind on" : "sp-kind"}
            onClick={() => onChange({ kind: k })}
          >
            {k}
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
  const hasBgm = settings.配乐 && settings.配乐 !== "无";
  const showCaption = settings.字幕 !== "隐藏";
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
                title={`镜头${i + 1} · ${s.shotDesc}`}
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
          {!showCaption ? (
            <span className="tl-none">已隐藏</span>
          ) : shots.length ? (
            shots.map((s, i) => (
              <div key={s.id} className="tl-seg-sub" style={{ width: `${(s.dur / total) * 100}%` }} title={s.caption}>
                {s.caption}
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
          {shots.length && hasBgm ? <div className="tl-fullbar">♪ 背景音乐 · {settings.配乐}</div> : <span className="tl-none">♪ 无</span>}
        </div>
      </div>
    </div>
  );
}
