"use client";

import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent as RPointerEvent, type WheelEvent as RWheelEvent } from "react";
import { useRouter } from "next/navigation";
import { EditorRail, type RailItem } from "@/components/ui/EditorRail";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { PointsCost } from "@/components/ui/PointsCost";
import { avatarSecondsPoints, imageShotPoints, videoSecondsPoints, POINT_COST } from "@/lib/pointCosts";
import { useLibrary } from "@/lib/store";
import { getProject, upsertProject, uniqueProjectName } from "@/lib/studioProjects";
import { nowStamp } from "@/lib/datetime";
import { VOICES, VOICE_SCENES, VOICE_AGES, VOICE_GENDERS, VOICE_EMOTIONS, type Voice } from "@/data/voices";
import { myWorks, myMaterials } from "@/data/storage";
import type { AssetCard } from "@/lib/types";
import {
  AVATAR_PRESETS,
  AVATAR_ROLES,
  AVATAR_BG_PRESETS,
  AVATAR_BG_CATEGORIES,
  type AvatarPreset,
  type AvatarBg,
} from "@/data/avatars";
import type { IconName } from "@/data/icons";
import { VoiceCloneModal } from "./Studio";
import { buildAvatarCues, matteAuto, imgSrcToBitmap, renderAvatarDemoVideo, layerRect, type SubCue } from "@/lib/videoMatte";
import { DEMO, demoWait, demoOptimizeDesc, DEMO_AVATAR_IMAGES, DEMO_BG_IMAGES, DEMO_VIDEO, demoPick } from "@/lib/demo";
import { asset as assetUrl } from "@/lib/asset";
import { getCachedVideo, putCachedVideo } from "@/lib/videoCache";
import { avatarInspires } from "@/data/videoInspires";
import { RegionEnhanceStrip } from "@/components/image/RegionEnhanceStrip";
import { accountRegionId, imageRequestBody, kbFields, notifyRegionEnhance } from "@/lib/regionEnhance";
import { RegionEnhanceBadge } from "@/components/image/RegionEnhanceStrip";
import { useAuth } from "@/lib/AuthContext";

/* ── 工具函数 ── */
function fileToDataUri(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

async function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

/* 规范化 s2v 输入形象图：跨域走代理取图 → 解码 → ≤1280 长边 → JPEG data URI。
   AI 生成图常是远程 URL / webp / 超高分辨率，直接给 s2v 易触发「engine process fail」；
   统一转成中等分辨率 JPEG，再由 lipsync 上传 OSS，规避格式/尺寸/远程拉取问题。 */
async function normalizeS2vImage(src: string): Promise<string> {
  let blob: Blob;
  if (src.startsWith("data:")) {
    blob = await fetch(src).then((r) => r.blob());
  } else {
    const isCross = /^https?:\/\//.test(src) && !src.startsWith(location.origin);
    const url = isCross ? `/api/proxy-image?url=${encodeURIComponent(src)}` : src;
    blob = await fetch(url).then((r) => { if (!r.ok) throw new Error("形象图片已失效或无法读取，请重新生成或上传形象"); return r.blob(); });
  }
  const bmp = await createImageBitmap(blob);
  const long = Math.max(bmp.width, bmp.height) || 1280;
  const scale = Math.min(1, 1280 / long);
  const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  c.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  return c.toDataURL("image/jpeg", 0.92);
}

/* 读取音频真实时长（秒）：用于对口型 20 秒上限校验；元数据读不出时返回 0（放行，交由服务端兜底）。
   注意：火山 TTS 返回 CBR MP3，Chrome 在 loadedmetadata 阶段常把 duration 高估（实测 18s 被读成 61s，
   误触发超时拦截）。解决：seek 到超大时间强制浏览器扫描到文件尾，seeked 后拿到真实时长。 */
async function audioDuration(blob: Blob): Promise<number> {
  return new Promise((res) => {
    const url = URL.createObjectURL(blob);
    const a = new Audio();
    let settled = false;
    const done = (sec: number) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      res(Number.isFinite(sec) && sec > 0 ? sec : 0);
    };
    a.onloadedmetadata = () => {
      // 强制扫到文件尾以校正 MP3 被高估的 duration；seeked 时 duration 已是真实值
      const onSeeked = () => { a.removeEventListener("seeked", onSeeked); done(a.duration); };
      a.addEventListener("seeked", onSeeked);
      try { a.currentTime = 1e101; } catch { done(a.duration); }
    };
    a.onerror = () => done(0);
    a.src = url;
    setTimeout(() => done(a.duration || 0), 4000); // 兜底：4s 未出结果则放行
  });
}

/* 合成语音 + 坏音频防抖：火山 TTS 偶发返回「一小段声音 + 一大段静音」的坏音频（接口仍报成功 code 3000，
   实测时长远超文案应有长度）。检测到就自动重试，最多 3 次；仍异常则把最后一次结果交给调用方按真实时长判定。
   plausibleMax = 该文案合理的最长时长；realSec 超出即视为坏音频。 */
async function synthTTS(body: object, plausibleMax: number): Promise<{ blob: Blob; realSec: number }> {
  let last: { blob: Blob; realSec: number } = { blob: new Blob(), realSec: 0 };
  for (let attempt = 1; attempt <= 3; attempt++) {
    const resp = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const j = (await resp.json().catch(() => ({}))) as { error?: string };
      throw new Error(j.error || "语音合成失败");
    }
    const blob = await resp.blob();
    const realSec = await audioDuration(blob);
    last = { blob, realSec };
    if (realSec <= plausibleMax) return last; // 时长合理 → 正常音频，直接用
    // 否则疑似坏音频，重试（最后一次不再等待，直接返回交给调用方判错）
  }
  return last;
}

/* AI 生图：比例 → 生成尺寸（目标约 4MP、64 对齐，满足豆包 Seedream 等上游像素下限）*/
function ratioToSize(ratio: string): string {
  const [w, h] = ratio.split(":").map((n) => Number(n) || 1);
  const k = Math.sqrt(4_000_000 / (w * h));
  const align = (n: number) => Math.max(64, Math.ceil((n * k) / 64) * 64);
  return `${align(w)}x${align(h)}`;
}
const AG_RATIOS = ["9:16", "16:9", "3:4", "4:3", "1:1", "3:2", "2:3", "21:9"];
const AG_AGE_WORDS: Record<string, string> = { 儿童: "儿童", 青年: "青年", 老年: "老年人" };
/* AI 生图推荐：标签（chip 显示）+ 详细人物形象描述（点击填入，约 100 字，供图片模型生成）*/
const AG_SUGGEST = [
  { label: "景区讲解员", desc: "一位亲切专业的景区讲解员，面带温暖自信的微笑，短发利落干净，身穿浅色制服衬衫并佩戴讲解工牌，姿态挺拔大方，眼神明亮富有亲和力，背景为虚化的景区自然风光与游客步道，整体气质热情专业，适合文旅讲解与景点介绍出镜。" },
  { label: "农技专家", desc: "一位朴实可信的农业技术推广员，皮肤带有健康的阳光气色，短发朴素整洁，身穿深色工作衬衫或工装马甲，神情认真专注、笑容真诚踏实，双手自然放松，背景为虚化的田园大棚与作物，整体气质专业又接地气，适合农技讲解与助农科普出镜。" },
  { label: "县长带货", desc: "一位形象亲民可信的助农带货主播，着装得体大方，身穿深色休闲西装搭配简约衬衫，神情自信从容、面带真诚微笑，姿态端正稳重、举止落落大方，背景为虚化的农产品展示区或明亮直播间，整体气质专业亲切，适合助农产品推介与直播带货出镜。" },
  { label: "非遗传承人", desc: "一位气质温润的非遗手工艺传承人，年长而面容慈祥，头发盘束整洁，身穿中式棉麻或传统立领服饰，神情专注平和、笑容温厚，双手仿佛在展示传统技艺，背景为虚化的手工作坊与工艺作品，整体气质古朴匠心，适合非遗文化传播出镜。" },
  { label: "村播主播", desc: "一位阳光有活力的乡村主播，笑容灿烂真诚、极具感染力，短发清爽利落，身穿休闲T恤或格纹衬衫，姿态自然生动、眼神明亮，背景为虚化的乡村田园、果园或农家院落，整体气质接地气、亲和力强，适合乡村直播与三农内容出镜。" },
];

/* AI 生成背景推荐（农文旅场景，无人物） */
const BG_AG_SUGGEST = [
  { label: "金色稻田", desc: "金色成熟稻田，稻浪随风起伏，远处青山与蓝天白云，明媚阳光，农业丰收场景" },
  { label: "茶园梯田", desc: "青翠茶园梯田层层叠叠，云雾缭绕，清晨柔和光线，生态茶山风光" },
  { label: "古镇街巷", desc: "江南古镇青石板街巷，白墙黛瓦，红灯笼高挂，文旅古镇氛围，暖阳斜照" },
  { label: "现代直播间", desc: "简约现代电商直播间，柔和补光灯，背景货架陈列农特产品，景深虚化" },
  { label: "乡村院落", desc: "美丽乡村农家小院，绿树掩映，篱笆花草，田园风光，温暖阳光" },
  { label: "非遗工坊", desc: "传统手工艺作坊，木质结构，墙上悬挂竹编与手工艺品，古朴静谧，暖色调" },
];

/* 角色表现预设（随机填充）：动作 / 情绪 / 运镜 */
const PERFORM_PRESETS = [
  "面带微笑，眼神自然看向镜头，轻微点头，亲切自然",
  "热情饱满，双手适度比划，身体略前倾，拉近与观众距离",
  "沉稳专业，神态从容，讲到重点时微微挑眉强调",
  "活泼生动，语气轻快，表情丰富，带动情绪",
  "端庄大方，神情庄重，适合政务播报、正式通知",
  "自信讲解，微笑点头，手势自然引导观众视线",
  "镜头缓慢推近，人物保持微笑，眼神坚定专注",
];

/* 情感 → 火山 TTS emotion 参数（与制作大片 Studio 一致）*/
const VOLC_EMOTION: Record<string, string> = { 开心: "happy", 伤心: "sad", 生气: "angry", 惊讶: "surprise", 平静: "neutral", 中性: "neutral" };

/* 参考灵感：形象 + 口播范例，一键套用（选形象 + 填文案）*/
const INSPIRE = avatarInspires;
/* 形象绑定的背景配置：背景图/视频 + 画布式变换参数（人物层/背景层各自 scale + 平移 x/y，归一化到画幅）。
   画幅=人像图片原生比例；人物 contain 基准、背景 cover 基准，各自 ×scale 后按 (x,y) 平移。三处渲染共用 layerRect。 */
interface AvatarBgCfg {
  img: string;        // 背景静态图（视频背景时为首帧/封面）
  name: string;
  dyn?: string;       // 动态背景视频
  personScale?: number; // 人物缩放（1=contain 填满），默认 1
  personX?: number;   // 人物左右平移 -1–1（0=居中），默认 0
  personY?: number;   // 人物上下平移 -1–1（0=居中），默认 0
  bgScale?: number;   // 背景缩放（1=cover 基准），默认 1
  bgX?: number;       // 背景左右平移，默认 0
  bgY?: number;       // 背景上下平移，默认 0
  bgOffsetY?: number; // 旧字段（背景单轴偏移），向后兼容读取
}
/* 我的形象：把一张面部图 + 场景/昵称/角色表现/音色/语速/情感 保存成可复用形象 */
interface MyAvatar {
  id: string;
  name: string;
  img: string;
  scene: string;
  performance?: string;
  voiceId?: string;
  speed?: number;
  emotion?: string;
  bg?: AvatarBgCfg; // 绑定在形象上的背景：有则「换背景」合成，无则原图
}
const MY_AVATARS_KEY = "mofun.avatar.myAvatars";
const AVATAR_RUNS_KEY = "mofun.avatar.runs"; // 生成历史元数据（视频 blob 另存 IndexedDB）
const PENDING_KEY = "mofun.avatar.pending"; // 未完成的对口型任务（taskId + 合成参数），供刷新/断线后恢复轮询
const LIPSYNC_MAX_SEC = 60; // 数字人对口型音频上限（即梦 OmniHuman <60s）

/* 未完成任务（提交后已拿 taskId、尚未出片）：持久化以便刷新/断线后接着轮询。
   音频 blob 另存 IndexedDB（key=audio_<runId>），供恢复时做换背景合成。 */
interface PendingTask {
  runId: string;
  taskId: string;
  name: string;
  script: string;
  poster: string;
  time: string;
  contentSec: number;
  bg?: AvatarBgCfg | null; // 换背景合成参数（无则原图直出）
  subtitleOn?: boolean; // 是否把口播文案分句字幕烧进画面（生成/刷新恢复共用）
}
const SCENE_OPTS = AVATAR_ROLES.filter((r) => r !== "全部");

// 上传/自定义背景场景（本地持久化）
interface MyBg {
  id: string;
  name: string;
  img: string;
  dynUrl?: string; // 动态背景：i2v 生成的动态背景视频地址（供合成用）
}
const MY_BGS_KEY = "mofun.avatar.myBgs";
// 背景库筛选：突出农旅相关场景（农业 / 文旅在前）
const BG_CATS = ["全部", "农业", "文旅", "演播室"] as const;

/* 生成历史条目 */
interface AvatarRun {
  id: string;
  name: string;
  script: string;
  poster: string;
  status: "running" | "done" | "failed";
  videoUrl?: string;
  errorMsg?: string;
  time: string;
  overlaySubs?: boolean; // 播放器按 script 实时叠字幕（OmniHuman 原片不烧字幕，避免离屏视频重录冻帧）
  regionEnhance?: boolean;
  regionId?: string;
}

/* 播放器：原片直出 + 按 script 实时叠字幕（不烧进画面，画质/口型零损失）。
   字幕时间轴依视频真实时长分配；overlaySubs=false（字幕关）或旧任务则不显示。 */
function AvatarPlayer({ run, onClose }: { run: AvatarRun; onClose: () => void }) {
  const vref = useRef<HTMLVideoElement>(null);
  const [cues, setCues] = useState<SubCue[]>([]);
  const [cur, setCur] = useState("");
  // 依视频真实时长算字幕时间轴。blob 视频元数据常在 React 挂监听前就绪 → onLoadedMetadata 可能漏触发，
  // 故 onTimeUpdate 里兜底补算（播放中持续触发，必能补上）。
  const ensureCues = (v: HTMLVideoElement): SubCue[] => {
    if (cues.length || run.overlaySubs === false) return cues; // 仅「明确关闭」不叠；undefined/true 均显示
    const dur = isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
    if (!dur) return cues;
    const c = buildAvatarCues(run.script, dur);
    setCues(c);
    return c;
  };
  const onTime = () => {
    const v = vref.current; if (!v) return;
    const c = ensureCues(v);
    const t = v.currentTime;
    setCur(c.find((q) => t >= q.start && t < q.end)?.text || "");
  };
  return (
    <div className="av-modal-mask" onClick={onClose}>
      <div className="av-play-modal" onClick={(e) => e.stopPropagation()}>
        <button className="av-side-close av-play-close" onClick={onClose}>✕</button>
        <div className="av-play-stage">
          <video ref={vref} src={run.videoUrl} controls autoPlay className="av-play-video" playsInline onLoadedMetadata={onTime} onTimeUpdate={onTime} />
          {cur && <div className="av-play-sub">{cur}</div>}
        </div>
        <span className="lh-mark av-play-mark">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="lh-mark-logo" src={assetUrl("/brand-logo.png")} alt="魔方智绘" />
          由 AI 生成
        </span>
      </div>
    </div>
  );
}

/* 抠图缓存：同一张人像只抠一次，扫描动效 / 合成预览 / 编辑器共用，避免重复计算与二次「抠像中」。 */
const _matteCache = new Map<string, HTMLCanvasElement>();
const _matteInflight = new Map<string, Promise<HTMLCanvasElement | null>>();
function hasMatteCached(person: string | null): boolean { return !!person && _matteCache.has(person); }
function getMatteCached(person: string): Promise<HTMLCanvasElement | null> {
  const hit = _matteCache.get(person);
  if (hit) return Promise.resolve(hit);
  const inflight = _matteInflight.get(person);
  if (inflight) return inflight;
  const p = matteAuto(person, 512)
    .then((c) => { _matteCache.set(person, c); return c as HTMLCanvasElement | null; })
    .catch(() => null)
    .finally(() => { _matteInflight.delete(person); });
  _matteInflight.set(person, p);
  return p;
}

/* 上传 / AI 生成人像后的「抠图处理」展示：扫描线循环扫过原图 + 分阶段文案；抠完做一次揭示
   （原图 → 透明棋盘格上的抠像）+ ✓ 完成，再交给编辑器。诚实的不确定态——扫描循环直到真实抠图
   返回；首次加载模型偏慢时停在第一阶段文案。抠图失败则直接 onDone，由下游回退显示原图。 */
const MTS_PHASES = ["加载抠图模型…", "识别人物…", "分离背景…"];
function MattingScan({ person, onDone }: { person: string; onDone: () => void }) {
  const cutRef = useRef<HTMLCanvasElement>(null);
  const [pn, setPn] = useState<{ w: number; h: number } | null>(null);
  const [phase, setPhase] = useState(0);
  const [reveal, setReveal] = useState(0); // 0–1 揭示进度（抠完后）
  const [done, setDone] = useState(false);

  useEffect(() => { let a = true; imgSrcToBitmap(person).then((i) => { if (a) setPn({ w: i.width, h: i.height }); }).catch(() => { }); return () => { a = false; }; }, [person]);

  useEffect(() => {
    // 扫描线走纯 CSS transform（合成线程）动画，即使 RVM 推理阻塞主线程也持续扫动；
    // 阶段文案用 interval 推进（推理阻塞时会暂停，属预期，视觉靠扫描线撑住）。
    let alive = true; let ph = 0; setPhase(0);
    const iv = setInterval(() => { ph = Math.min(2, ph + 1); if (alive) setPhase(ph); }, 900);
    getMatteCached(person).then((c) => {
      if (!alive) return;
      clearInterval(iv);
      if (!c) { onDone(); return; } // 抠图失败：交给下游回退原图
      const cv = cutRef.current;
      if (cv) { cv.width = c.width; cv.height = c.height; cv.getContext("2d")!.drawImage(c, 0, 0); }
      const r0 = performance.now();
      const revealLoop = () => {
        if (!alive) return;
        const p = Math.min(1, (performance.now() - r0) / 520);
        setReveal(p);
        if (p < 1) requestAnimationFrame(revealLoop);
        else { setDone(true); setTimeout(() => { if (alive) onDone(); }, 700); }
      };
      requestAnimationFrame(revealLoop);
    });
    return () => { alive = false; clearInterval(iv); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person]);

  const aspect = pn ? `${pn.w} / ${pn.h}` : "3 / 4";
  return (
    <div className="mts" style={{ aspectRatio: aspect, width: pn ? `min(100%, calc(${pn.w / pn.h} * 52vh))` : "min(100%, 39vh)" }}>
      <img className="mts-orig" src={person} alt="" draggable={false} />
      <div className="mts-cutwrap" style={{ clipPath: `inset(0 ${100 - reveal * 100}% 0 0)` }}>
        <div className="mts-checker" />
        <canvas ref={cutRef} className="mts-cut" />
      </div>
      {!done && reveal === 0 && <span className="mts-sweep" />}
      <div className={`mts-cap${done ? " mts-cap--done" : ""}`}>
        {done ? <>✓ 抠图完成</> : <><span className="mts-spin" />{MTS_PHASES[phase]}</>}
      </div>
      {done && <span className="mts-badge">✓ 完成</span>}
    </div>
  );
}

/* 合成预览：把 person（原图）抠像后按位置参数叠到 bg 上；无 bg 则显示原图。
   加载与绘制分离（图片缓存 + 同步重绘），拖参数不闪。主面板与编辑弹窗共用。 */
function CompositePreview({ person, bg, alwaysMatte = false }: { person: string | null; bg?: AvatarBgCfg | null; alwaysMatte?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [matte, setMatte] = useState<HTMLCanvasElement | null>(null);
  const [bgImg, setBgImg] = useState<ImageBitmap | null>(null);
  const [imgEl, setImgEl] = useState<ImageBitmap | null>(null);
  const [busy, setBusy] = useState(false);
  const bgSrc = bg?.img;
  // alwaysMatte：编辑弹窗里「默认预生成抠图」——进来就把人物抠出来，换背景时立刻能看到人物
  useEffect(() => {
    if (!person || (!bgSrc && !alwaysMatte)) { setMatte(null); return; }
    let alive = true; setBusy(true);
    getMatteCached(person).then((c) => { if (alive) setMatte(c); }).finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [person, bgSrc, alwaysMatte]);
  useEffect(() => { if (!bgSrc) { setBgImg(null); return; } let a = true; imgSrcToBitmap(bgSrc).then((i) => { if (a) setBgImg(i); }).catch(() => { if (a) setBgImg(null); }); return () => { a = false; }; }, [bgSrc]);
  useEffect(() => { if (!person) { setImgEl(null); return; } let a = true; imgSrcToBitmap(person).then((i) => { if (a) setImgEl(i); }).catch(() => { if (a) setImgEl(null); }); return () => { a = false; }; }, [person]);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    // 画幅恒=人像图片原生比例（=最终视频比例）；换背景/缩小也是同一尺寸
    let aw = 3, ah = 4;
    if (imgEl) { aw = imgEl.width; ah = imgEl.height; }
    const base = 480;
    const W = aw >= ah ? base : Math.round((base * aw) / ah);
    const H = aw >= ah ? Math.round((base * ah) / aw) : base;
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d")!; ctx.imageSmoothingQuality = "high"; ctx.clearRect(0, 0, W, H);
    // 新变换模型：背景 cover 基准、人物 contain 基准，各自 ×scale + 平移 (x,y)，与 BgEditor / 合成一致
    const pScale = bg?.personScale ?? 1, pX = bg?.personX ?? 0, pY = bg?.personY ?? 0;
    const bScale = bg?.bgScale ?? 1, bX = bg?.bgX ?? 0, bY = bg?.bgY ?? 0;
    if (bgSrc && bgImg) {
      const br = layerRect(W, H, bgImg.width, bgImg.height, "cover", bScale, bX, bY);
      ctx.drawImage(bgImg, br.dx, br.dy, br.dw, br.dh);
      const fg = matte ?? (!busy ? imgEl : null); // 抠图失败兜底：仍把人物原图叠上去
      if (fg) { const pr = layerRect(W, H, fg.width, fg.height, "contain", pScale, pX, pY); ctx.drawImage(fg, pr.dx, pr.dy, pr.dw, pr.dh); }
    } else if (imgEl) {
      // 原图背景：画布=人像原生比例 → 精确铺满，不裁切、不加边（最终视频直出，同比例）
      ctx.drawImage(imgEl, 0, 0, W, H);
    }
  }, [bg, bgSrc, matte, bgImg, imgEl, busy]);
  return <><canvas ref={ref} className="av-edit2-canvas" />{busy && <span className="av-edit2-busy">抠像中…</span>}</>;
}

/* 抠图结果预览：把抠出的人像（透明背景）画在棋盘格上，让用户直观看到「背景已去除」。已抠图但未选新背景时用。 */
function CutoutPreview({ person }: { person: string | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [matte, setMatte] = useState<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!person) { setMatte(null); return; }
    let alive = true;
    getMatteCached(person).then((c) => { if (alive) setMatte(c); });
    return () => { alive = false; };
  }, [person]);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    let aw = 3, ah = 4;
    if (matte) { aw = matte.width; ah = matte.height; }
    const base = 480;
    const W = aw >= ah ? base : Math.round((base * aw) / ah);
    const H = aw >= ah ? Math.round((base * ah) / aw) : base;
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d")!; ctx.clearRect(0, 0, W, H);
    if (matte) ctx.drawImage(matte, 0, 0, W, H);
  }, [matte]);
  return <canvas ref={ref} className="av-cutout-canvas" />;
}

/* 编辑背景 · 画布式拖/缩编辑器：背景层(cover 基准)+人物层(抠像,contain 基准)各自可拖动、角点/滚轮缩放，
   视频框(=人像原生比例)内的内容 = 最终数字人形象。变换用 layerRect，与预览/合成完全一致。 */
function BgEditor({ person, bg, value, onChange }: {
  person: string;
  bg: { img: string; dyn?: string };
  value: AvatarBgCfg;
  onChange: (patch: Partial<AvatarBgCfg>) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [matteSrc, setMatteSrc] = useState<string | null>(null);
  const [pn, setPn] = useState<{ w: number; h: number } | null>(null);
  const [bn, setBn] = useState<{ w: number; h: number } | null>(null);
  const [sel, setSel] = useState<"person" | "bg">("person");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true; setBusy(true);
    getMatteCached(person).then((c) => {
      if (!alive) return;
      if (c) { setMatteSrc(c.toDataURL("image/png")); setPn({ w: c.width, h: c.height }); }
      else {
        // 抠像失败时回退显示原图，避免人物层空白
        imgSrcToBitmap(person).then((i) => { if (alive) { setMatteSrc(person); setPn({ w: i.width, h: i.height }); } }).catch(() => { if (alive) setMatteSrc(null); });
      }
    }).finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [person]);
  useEffect(() => { let a = true; imgSrcToBitmap(bg.img).then((i) => { if (a) setBn({ w: i.width, h: i.height }); }).catch(() => { }); return () => { a = false; }; }, [bg.img]);

  const v = { personScale: value.personScale ?? 1, personX: value.personX ?? 0, personY: value.personY ?? 0, bgScale: value.bgScale ?? 1, bgX: value.bgX ?? 0, bgY: value.bgY ?? 0 };
  const aspect = pn ? `${pn.w} / ${pn.h}` : "3 / 4";

  function startDrag(e: RPointerEvent, which: "person" | "bg", handle = false) {
    e.stopPropagation(); setSel(which);
    const startX = e.clientX, startY = e.clientY;
    const sKey = which === "person" ? "personScale" : "bgScale", xKey = which === "person" ? "personX" : "bgX", yKey = which === "person" ? "personY" : "bgY";
    const s0 = v[sKey] as number, x0 = v[xKey] as number, y0 = v[yKey] as number;
    const rect = frameRef.current!.getBoundingClientRect();
    const cx = rect.width / 2, cy = rect.height / 2;
    const d0 = Math.hypot(startX - rect.left - cx, startY - rect.top - cy) || 1;
    const move = (ev: globalThis.PointerEvent) => {
      if (handle) {
        const d = Math.hypot(ev.clientX - rect.left - cx, ev.clientY - rect.top - cy);
        onChange({ [sKey]: Math.max(0.2, Math.min(3, s0 * (d / d0))) } as Partial<AvatarBgCfg>);
      } else {
        onChange({ [xKey]: x0 + (ev.clientX - startX) / rect.width, [yKey]: y0 + (ev.clientY - startY) / rect.height } as Partial<AvatarBgCfg>);
      }
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  }
  function onWheel(e: RWheelEvent) {
    const sKey = sel === "person" ? "personScale" : "bgScale";
    const s0 = v[sKey] as number;
    onChange({ [sKey]: Math.max(0.2, Math.min(3, s0 * (e.deltaY < 0 ? 1.06 : 0.94))) } as Partial<AvatarBgCfg>);
  }

  // 虚拟画幅（与画幅比例一致）→ 图层用百分比定位，与实际像素测量无关（消除测量竞态导致的空白）
  const Wv = 1000, Hv = pn ? Math.max(1, 1000 * pn.h / pn.w) : 1333;
  const pct = (r: { dx: number; dy: number; dw: number; dh: number }) => ({ left: `${(r.dx / Wv) * 100}%`, top: `${(r.dy / Hv) * 100}%`, width: `${(r.dw / Wv) * 100}%`, height: `${(r.dh / Hv) * 100}%` });
  const bgRect = bn ? layerRect(Wv, Hv, bn.w, bn.h, "cover", v.bgScale, v.bgX, v.bgY) : null;
  const pRect = pn ? layerRect(Wv, Hv, pn.w, pn.h, "contain", v.personScale, v.personX, v.personY) : null;
  const selR = sel === "person" ? pRect : bgRect;

  return (
    <div className="bge">
      <div className="bge-frame" ref={frameRef} style={{ aspectRatio: aspect, width: pn ? `min(100%, calc(${pn.w / pn.h} * 52vh))` : "min(100%, 39vh)" }} onWheel={onWheel} onPointerDown={() => setSel("bg")}>
        {bgRect && <img className="bge-layer" src={bg.img} alt="" draggable={false} style={pct(bgRect)} onPointerDown={(e) => startDrag(e, "bg")} />}
        {pRect && matteSrc && <img className="bge-layer bge-person" src={matteSrc} alt="" draggable={false} style={pct(pRect)} onPointerDown={(e) => startDrag(e, "person")} />}
        {selR && <>
          <span className="bge-selbox" style={pct(selR)} />
          {([[0, 0], [1, 0], [0, 1], [1, 1]] as const).map(([hx, hy], i) => (
            <span key={i} className="bge-handle" style={{ left: `${((selR.dx + hx * selR.dw) / Wv) * 100}%`, top: `${((selR.dy + hy * selR.dh) / Hv) * 100}%` }} onPointerDown={(e) => startDrag(e, sel, true)} />
          ))}
        </>}
        {busy && <span className="bge-busy">抠像中…</span>}
      </div>
      <div className="bge-bar">
        <div className="bge-sel">
          <button className={sel === "person" ? "on" : ""} onClick={() => setSel("person")}>人物</button>
          <button className={sel === "bg" ? "on" : ""} onClick={() => setSel("bg")}>背景</button>
        </div>
        <span className="bge-tip">选「人物/背景」→ 拖动移位、拖角点或滚轮缩放；框内即最终画面</span>
        <button className="bge-reset" onClick={() => onChange({ personScale: 1, personX: 0, personY: 0, bgScale: 1, bgX: 0, bgY: 0 })}>重置</button>
      </div>
    </div>
  );
}

/* ── 主组件 ── */
export function AvatarEditor({
  railItems,
  iconOf,
  onPickType,
  initialScript,
}: {
  railItems: RailItem[];
  iconOf: (k: string) => IconName;
  onPickType: (k: string) => void;
  initialScript?: string;
}) {
  const toast = useToast();
  const { addWork, works, materials, isFavorite, toggleFavorite } = useLibrary();
  const router = useRouter();
  const { user } = useAuth();
  const regionId = accountRegionId(user);
  const [regionEnhance, setRegionEnhance] = useState(true);
  const [useLora, setUseLora] = useState(true);
  const [useKB, setUseKB] = useState(true);

  /* 弹窗开关（原右侧面板改为弹窗）*/
  const [libOpen, setLibOpen] = useState(false);
  const [libTab, setLibTab] = useState<"official" | "mine">("official");
  const [voiceSettingsOpen, setVoiceSettingsOpen] = useState(false); // 声音设置（语速/音量/语调/情感）
  const [voiceOpen, setVoiceOpen] = useState(false); // 音色选择（网格列表）
  const [cloneOpen, setCloneOpen] = useState(false); // 声音复刻（与制作大片共用同一组件/存储）
  const [repoOpen, setRepoOpen] = useState(false);

  /* 右侧：生成历史 / 参考灵感 */
  const [resultTab, setResultTab] = useState<"history" | "inspire">("history");
  const [onlyFav, setOnlyFav] = useState(false);
  const [runs, setRuns] = useState<AvatarRun[]>([]);
  const [playing, setPlaying] = useState<AvatarRun | null>(null);
  const [previewImg, setPreviewImg] = useState<string | null>(null); // 点缩略图查看完整形象图

  /* ① 形象 */
  const [selectedPreset, setSelectedPreset] = useState<AvatarPreset | null>(() =>
    initialScript?.trim() ? AVATAR_PRESETS.find((x) => x.id === "av1") ?? null : null
  );
  const [customImg, setCustomImg] = useState<string | null>(null);
  const [customImgName, setCustomImgName] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("全部");
  const imgFileRef = useRef<HTMLInputElement>(null);

  /* 背景库（官方场景 / 上传场景，农旅相关筛选）*/
  const [bgOpen, setBgOpen] = useState(false);
  const [bgTab, setBgTab] = useState<"official" | "upload">("official");
  const [bgCat, setBgCat] = useState<string>("全部");
  const [selectedBg, setSelectedBg] = useState<AvatarBg | null>(null);
  const [customBg, setCustomBg] = useState<{ img: string; name: string } | null>(null);
  const [myBgs, setMyBgs] = useState<MyBg[]>([]);
  const [humanMode, setHumanMode] = useState<"orig" | "green">("orig"); // 人物：原图 / 绿底人像
  const [bgMode, setBgMode] = useState<"image" | "video">("image");     // 背景：图片 / 视频
  const bgFileRef = useRef<HTMLInputElement>(null);
  const bgVideoFileRef = useRef<HTMLInputElement>(null);
  const cBgUploadRef = useRef<HTMLInputElement>(null); // 编辑弹窗自定义上传（图片+视频）
  /* 编辑场景弹窗（上传/选择场景后填写 + 生成动态背景）*/
  const [bgEditOpen, setBgEditOpen] = useState(false);
  const [bgEditId, setBgEditId] = useState<string | null>(null); // 编辑已有场景的 id（新建为 null）
  const [bgEditImg, setBgEditImg] = useState<string | null>(null);
  const [bgEditName, setBgEditName] = useState("");
  const [bgEditDyn, setBgEditDyn] = useState<string | null>(null); // 动态背景视频地址
  const [bgEditDynDesc, setBgEditDynDesc] = useState(""); // 动态方式描述（用户输入，驱动 i2v）
  const [bgEditDynBusy, setBgEditDynBusy] = useState(false);
  const bgEditFileRef = useRef<HTMLInputElement>(null);
  const [repoTarget, setRepoTarget] = useState<"avatar" | "bg">("avatar"); // 「从仓库」目标：形象 or 背景
  /* 背景 AI 生成 */
  const [bgAgOpen, setBgAgOpen] = useState(false);
  const [bgAgDesc, setBgAgDesc] = useState("");
  const [bgAgRatio, setBgAgRatio] = useState("16:9");
  const [bgAgBusy, setBgAgBusy] = useState(false);

  /* AI 生图弹窗 */
  const [agOpen, setAgOpen] = useState(false);
  const [agGender, setAgGender] = useState("女");
  const [agAge, setAgAge] = useState("青年");
  const [agDesc, setAgDesc] = useState("");
  const [agRatio, setAgRatio] = useState("9:16");
  const [agBusy, setAgBusy] = useState(false);
  const [agOptBusy, setAgOptBusy] = useState(false); // AI 优化角色描述中

  /* 创建我的形象弹窗（独立于 AI 生图）*/
  const [myAvatars, setMyAvatars] = useState<MyAvatar[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null); // 非空=编辑已有形象（保存时更新而非新建）
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null); // 非空=编辑官方形象的背景（仅背景可改）
  // 官方形象的背景是「当前选中形象」的临时属性：仅「编辑背景→去使用」设置；平时点选形象=原图背景
  const [presetBg, setPresetBg] = useState<AvatarBgCfg | null>(null);
  const [cImg, setCImg] = useState<string | null>(null);
  const [cName, setCName] = useState("");
  const [cScene, setCScene] = useState<string>(SCENE_OPTS[0]);
  const [cBg, setCBg] = useState<AvatarBgCfg | null>(null); // 编辑中形象绑定的背景（含位置参数）
  const [cBgSub, setCBgSub] = useState<"image" | "video" | "custom">("image"); // 背景来源：图片/视频/自定义
  const [cBgCat2, setCBgCat2] = useState<string>("全部"); // 挑选背景的分类筛选
  const [matteReady, setMatteReady] = useState(true); // 抠图处理展示是否结束（缓存命中则直接就绪）
  const [matteStarted, setMatteStarted] = useState(false); // 用户是否已点「开始抠图」（上传/生成后不自动抠，点按钮才开始）
  const createFileRef = useRef<HTMLInputElement>(null);
  // 人像变化：重置为「未抠图」状态，显示原图 + 「开始抠图」按钮；已缓存则直接就绪
  useEffect(() => { const cached = hasMatteCached(cImg); setMatteReady(cached); setMatteStarted(cached); }, [cImg]);
  // 关闭创建弹窗时重置合成子界面，避免下次打开残留在合成态
  useEffect(() => { if (!createOpen) { setComposeMode(false); setComposeImg2(null); setComposeDesc(""); } }, [createOpen]);

  /* 图片合成：把用户另传的一张图（图2）里的元素，按描述合成进原图（图1）。用 Seedream 多图参考。 */
  const [composeMode, setComposeMode] = useState(false);   // 是否处于「图片合成」子界面
  const [composeImg2, setComposeImg2] = useState<string | null>(null); // 第二张参考图（data URL）
  const [composeDesc, setComposeDesc] = useState("");       // 合成描述（如「把图2中物品放到图1的手上」）
  const [composeBusy, setComposeBusy] = useState(false);
  const composeFile2Ref = useRef<HTMLInputElement>(null);

  /* ② 文案 */
  const [script, setScript] = useState(() => initialScript?.trim() || "");

  /* 角色表现（非必填） */
  const [performance, setPerformance] = useState("");
  const shuffleRef = useRef(0);

  /* ③ 声音（与制作大片一致：系统/收藏 + 场景/年龄/性别 + 收藏 + 复刻音色）*/
  const [selectedVoice, setSelectedVoice] = useState<Voice | null>(null);
  const [speed, setSpeed] = useState(1);      // 语速 0.5-2
  const [volume, setVolume] = useState(5);    // 音量 1-10（发送 TTS 时 /5 归一）
  const [pitch, setPitch] = useState(1);      // 语调 0.5-2
  const [emotion, setEmotion] = useState("中性");
  const [voiceTab, setVoiceTab] = useState<"system" | "fav">("system");
  const [vScene, setVScene] = useState<string>(VOICE_SCENES[0]);
  const [vAge, setVAge] = useState<string>(VOICE_AGES[0]);
  const [vGender, setVGender] = useState<string>(VOICE_GENDERS[0]);
  const [voiceFavs, setVoiceFavs] = useState<string[]>([]);
  const [customVoices, setCustomVoices] = useState<{ id: string; name: string }[]>([]);
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 与制作大片共享「收藏音色」「复刻音色」；加载「我的形象」（本地持久化）
  useEffect(() => {
    try { setVoiceFavs(JSON.parse(localStorage.getItem("mofun.studio.voiceFavs") || "[]") as string[]); } catch { /* ignore */ }
    try { setCustomVoices(JSON.parse(localStorage.getItem("mofun.studio.customVoices") || "[]") as { id: string; name: string }[]); } catch { /* ignore */ }
    try { setMyAvatars(JSON.parse(localStorage.getItem(MY_AVATARS_KEY) || "[]") as MyAvatar[]); } catch { /* ignore */ }
    try { setMyBgs(JSON.parse(localStorage.getItem(MY_BGS_KEY) || "[]") as MyBg[]); } catch { /* ignore */ }
  }, []);

  function toggleVoiceFav(id: string) {
    setVoiceFavs((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try { localStorage.setItem("mofun.studio.voiceFavs", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }
  function resetVoiceFilters() { setVScene(VOICE_SCENES[0]); setVAge(VOICE_AGES[0]); setVGender(VOICE_GENDERS[0]); }
  const wrapCustom = (cv: { id: string; name: string }): Voice =>
    ({ id: cv.id, name: cv.name, tts: cv.id, scene: "声音复刻", age: "", gender: "", multiEmotion: false });

  // 声音复刻完成：写同一份「mofun.studio.customVoices」（与制作大片共用），刷新列表并选中
  function onCloneDone(cv: { id: string; name: string }) {
    setCustomVoices((prev) => {
      const next = [{ id: cv.id, name: cv.name }, ...prev.filter((x) => x.id !== cv.id)];
      try { localStorage.setItem("mofun.studio.customVoices", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
    setSelectedVoice(wrapCustom(cv));
    setCloneOpen(false);
    toast("声音复刻完成，已加入音色列表");
  }

  /* ── 创建我的形象 ── */
  function openCreate() {
    setEditingId(null);
    setEditingPresetId(null);
    setCImg(customImg);
    setCName(customImgName || "");
    setCScene(SCENE_OPTS[0]);
    setCBg(null);
    setCreateOpen(true);
  }
  /* ── 拿到一张形象图（AI 生图 / 本地上传 / 从仓库）后，统一进入「创建我的形象」填写弹窗 ── */
  function startCreateWithImage(img: string, name: string) {
    setEditingId(null);
    setEditingPresetId(null);
    setCImg(img);
    setCName(name);
    setCScene(SCENE_OPTS[0]);
    setCBg(null);
    setCreateOpen(true);
  }
  /* ── 编辑已有形象：带入其数据回到「创建我的形象」弹窗，保存时原位更新 ── */
  function openEditAvatar(ma: MyAvatar) {
    setEditingId(ma.id);
    setEditingPresetId(null);
    setCImg(ma.img);
    setCName(ma.name);
    setCScene(ma.scene || SCENE_OPTS[0]);
    setCBg(ma.bg ?? null);
    setCreateOpen(true);
  }
  /* ── 编辑官方形象：只能改背景（图片锁定），保存为按预设 id 的背景覆盖 ── */
  function openEditPreset(p: AvatarPreset) {
    // 官方形象模板恒为初始状态：每次打开「编辑背景」都从原图背景开始，不回填上次的修改
    setEditingId(null);
    setEditingPresetId(p.id);
    setCImg(p.cover);
    setCName(p.name);
    setCBg(null);
    setCBgSub("image");
    setCBgCat2("全部");
    setCreateOpen(true);
  }
  async function onCreateUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.type.startsWith("video") || !file.type.startsWith("image")) { toast("人像请上传清晰的人物照片（图片），不支持视频", "warn"); return; }
    if (file.size > 10 * 1024 * 1024) { toast("图片大小不能超过 10 MB", "warn"); return; }
    setCImg(await fileToDataUri(file));
  }
  function selectMyAvatar(ma: MyAvatar) {
    setCustomImg(ma.img);
    setCustomImgName(ma.name);
    setSelectedPreset(null);
    setPresetBg(null);
    if (ma.performance) setPerformance(ma.performance);
    const v = ma.voiceId ? VOICES.find((x) => x.id === ma.voiceId) : undefined;
    if (v) { setSelectedVoice(v); setSpeed(ma.speed ?? 1); setEmotion(ma.emotion ?? "中性"); }
  }
  function deleteMyAvatar(id: string) {
    setMyAvatars((prev) => {
      const next = prev.filter((m) => m.id !== id);
      try { localStorage.setItem(MY_AVATARS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }
  function saveMyAvatar() {
    // 官方形象「编辑背景→去使用」：把选中的背景作为「当前形象」的临时背景应用到主面板（不改动形象库模板、不持久化）
    if (editingPresetId) {
      const preset = AVATAR_PRESETS.find((x) => x.id === editingPresetId);
      if (preset) { setSelectedPreset(preset); setCustomImg(null); setPresetBg(cBg); } // 带背景的合成图/视频只在「数字人形象」主面板展示
      setCreateOpen(false);
      setEditingPresetId(null);
      setCBg(null); setCBgSub("image"); // 弹窗复位到初始状态
      setLibOpen(false); // 关掉形象库，直接回主面板
      toast("已应用到数字人形象");
      return;
    }
    if (!cImg) { toast("请先为形象上传一张清晰面部图", "warn"); return; }
    if (!cName.trim()) { toast("请填写形象昵称", "warn"); return; }
    const ma: MyAvatar = {
      id: editingId ?? `ma_${Date.now()}`,
      name: cName.trim(),
      img: cImg,
      scene: cScene,
      bg: cBg ?? undefined,
    };
    setMyAvatars((prev) => {
      // 编辑：原位更新同 id；新建：插入到最前
      const next = editingId ? prev.map((m) => (m.id === editingId ? ma : m)) : [ma, ...prev];
      try { localStorage.setItem(MY_AVATARS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
    selectMyAvatar(ma);
    setCreateOpen(false);
    setEditingId(null);
    setLibTab("mine");
    toast(editingId ? "形象已更新" : "已保存到「我的形象」");
  }

  /* ④ 生成模式 / 数量 / 生成 */
  const [genMode, setGenMode] = useState<"720p" | "1080p">("720p");
  const [genCount, setGenCount] = useState(1);
  const [subtitleOn, setSubtitleOn] = useState(true); // 字幕：按口播文案分句烧录到画面底部，默认显示
  const [generating, setGenerating] = useState(false);
  const [genPct, setGenPct] = useState(0);
  const [genLabel, setGenLabel] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef<Set<string>>(new Set()); // 已取消等待的 runId：轮询到它就停

  const avatarImg = customImg ?? selectedPreset?.cover ?? null;
  const avatarLabel = customImg ? customImgName || "自定义形象" : selectedPreset?.name ?? "";
  const voiceLabel = selectedVoice?.name ?? selectedPreset?.voiceName ?? "跟随形象默认";
  // RVM 方案下无需绿底：人物框始终显示原图，抠像在生成时自动完成
  const humanPreview = avatarImg;
  // 当前选中形象绑定的背景（我的形象=ma.bg / 官方形象=去使用设置的临时 presetBg），用于主面板合成预览
  const selBg = customImg
    ? myAvatars.find((m) => m.img === customImg)?.bg
    : (selectedPreset ? presetBg ?? undefined : undefined);
  const bgSelectable = humanMode === "green"; // 「换背景」模式才需要选背景（原图保留自带背景）

  /* ── 背景库：选择 / 上传 / 持久化 ── */
  const bgLabel = customBg?.name ?? selectedBg?.name ?? "";
  const bgStaticImg = customBg?.img ?? selectedBg?.thumb ?? ""; // 背景静态图（上传/官方）
  const bgDynPreview = customBg
    ? (myBgs.find((m) => m.img === customBg.img)?.dynUrl || "")
    : (selectedBg?.dyn || ""); // 背景动态视频（官方=预置 dyn / 上传=用户生成的 dynUrl）
  const filteredBgs = bgCat === "全部" ? AVATAR_BG_PRESETS : AVATAR_BG_PRESETS.filter((b) => b.category === bgCat);
  // 编辑弹窗「挑选背景」列表：图片=官方静态背景(按分类) / 视频=官方动态背景 / 自定义=用户上传的全部场景(图片+视频)
  const cBgList: { img: string; name: string; dyn?: string }[] =
    cBgSub === "image"
      ? (cBgCat2 === "全部" ? AVATAR_BG_PRESETS : AVATAR_BG_PRESETS.filter((b) => b.category === cBgCat2)).filter((b) => !b.dyn).map((b) => ({ img: b.thumb, name: b.name }))
      : cBgSub === "video"
        ? AVATAR_BG_PRESETS.filter((b) => b.dyn).map((b) => ({ img: b.thumb, name: b.name, dyn: b.dyn }))
        : myBgs.map((m) => ({ img: m.img, name: m.name, dyn: m.dynUrl }));
  // 所选背景没有动态视频时，自动回退到图片
  useEffect(() => { if (bgMode === "video" && !bgDynPreview) setBgMode("image"); }, [bgDynPreview, bgMode]);

  function deleteMyBg(id: string) {
    setMyBgs((prev) => {
      const next = prev.filter((m) => m.id !== id);
      try { localStorage.setItem(MY_BGS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }
  // 背景库只从「编辑我的形象」打开：选中即绑定到编辑中形象的背景（cBg）
  function useBgPreset(bg: AvatarBg) { setCBg({ img: bg.thumb, name: bg.name, dyn: bg.dyn }); setBgOpen(false); }
  function useMyBg(mb: MyBg) { setCBg({ img: mb.img, name: mb.name, dyn: mb.dynUrl }); setBgOpen(false); }
  async function onUploadBg(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast("图片大小不能超过 10 MB，请压缩后重试", "warn"); return; }
    const uri = await fileToDataUri(file);
    const name = file.name.replace(/\.[^.]+$/, "");
    startBgEdit(uri, name); // 上传后进入「编辑场景」弹窗（填名 + 生成动态背景）
  }
  /* ── 编辑场景：拿到场景图后进入弹窗；保存时写入「上传场景」──*/
  function startBgEdit(img: string, name: string) {
    setBgEditId(null);
    setBgEditImg(img);
    setBgEditName(name);
    setBgEditDyn(null);
    setBgEditDynDesc("");
    setBgEditOpen(true);
  }
  function openEditBg(mb: MyBg) {
    setBgEditId(mb.id);
    setBgEditImg(mb.img);
    setBgEditName(mb.name);
    setBgEditDyn(mb.dynUrl ?? null);
    setBgEditDynDesc("");
    setBgEditOpen(true);
  }
  async function onBgEditUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast("图片大小不能超过 10 MB", "warn"); return; }
    setBgEditImg(await fileToDataUri(file));
    setBgEditDyn(null);
  }
  // 提取视频首帧作海报（静态图）
  function videoFirstFrame(src: string): Promise<string> {
    return new Promise((res, rej) => {
      const v = document.createElement("video");
      v.src = src; v.muted = true; v.playsInline = true;
      const fail = () => rej(new Error("读取视频失败"));
      v.onloadeddata = () => { try { v.currentTime = 0.1; } catch { fail(); } };
      v.onseeked = () => {
        const c = document.createElement("canvas");
        c.width = v.videoWidth || 1280; c.height = v.videoHeight || 720;
        c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
        res(c.toDataURL("image/jpeg", 0.85));
      };
      v.onerror = fail;
    });
  }
  /* 编辑弹窗「自定义」上传：图片或视频，直接绑定为当前形象的背景（视频抽首帧当预览图、视频本身作动态背景）*/
  async function onCEditBgUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const isVideo = file.type.startsWith("video");
    const maxMB = isVideo ? 30 : 10;
    if (file.size > maxMB * 1024 * 1024) { toast(`${isVideo ? "视频" : "图片"}不能超过 ${maxMB} MB`, "warn"); return; }
    const uri = await fileToDataUri(file);
    const name = (file.name.replace(/\.[^.]+$/, "") || "自定义背景").slice(0, 16);
    const keep = { personScale: cBg?.personScale ?? 1, personX: cBg?.personX ?? 0, personY: cBg?.personY ?? 0 };
    setMatteStarted(true); // 选了背景即开始抠图
    if (isVideo) {
      let poster = "";
      try { poster = await videoFirstFrame(uri); } catch { /* ignore */ }
      if (!poster) { toast("无法读取该视频首帧，请换个视频", "warn"); return; }
      const mb: MyBg = { id: `mb_${Date.now()}`, name, img: poster, dynUrl: uri };
      setMyBgs((prev) => { const next = [mb, ...prev]; try { localStorage.setItem(MY_BGS_KEY, JSON.stringify(next)); } catch { /* 视频过大可能超本地存储配额，仅本次会话可用 */ } return next; });
      setCBg({ img: poster, name, dyn: uri, ...keep });
    } else {
      const mb: MyBg = { id: `mb_${Date.now()}`, name, img: uri };
      setMyBgs((prev) => { const next = [mb, ...prev]; try { localStorage.setItem(MY_BGS_KEY, JSON.stringify(next)); } catch { /* ignore */ } return next; });
      setCBg({ img: uri, name, ...keep });
    }
  }
  /* 背景库直接上传视频：抽首帧当静态图、视频作动态背景，进「编辑场景」弹窗 */
  async function onBgVideoUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 30 * 1024 * 1024) { toast("视频大小不能超过 30 MB，请压缩后重试", "warn"); return; }
    const videoUri = await fileToDataUri(file);
    let poster = "";
    try { poster = await videoFirstFrame(videoUri); } catch { /* ignore */ }
    if (!poster) { toast("无法读取该视频首帧，请换个视频", "warn"); return; }
    setBgEditId(null);
    setBgEditImg(poster);
    setBgEditName(file.name.replace(/\.[^.]+$/, ""));
    setBgEditDyn(videoUri); // 上传的视频直接作动态背景（无需再 i2v 生成）
    setBgEditDynDesc("");
    setBgEditOpen(true);
    setBgOpen(false);
  }
  /* 在编辑场景弹窗里生成动态背景（i2v）*/
  async function genBgDynEdit() {
    if (!bgEditImg) { toast("请先上传/选择场景图", "warn"); return; }
    if (!bgEditDynDesc.trim()) { toast("请先描述背景怎么动（如：微风吹过稻田、云雾缓缓流动）", "warn"); return; }
    notifyRegionEnhance(toast, { useLora, useKB });
    setBgEditDynBusy(true);
    try {
      if (DEMO) { await demoWait(1200); setBgEditDyn(DEMO_VIDEO); toast("动态背景已生成（演示），保存后即可用于合成"); return; }
      let uri = bgEditImg;
      if (uri.startsWith("/")) uri = await blobToDataUri(await fetch(uri).then((r) => r.blob()));
      // 用户描述驱动动态方式；固定约束保证不出现人物/文字、构图稳定
      const kb = kbFields(useKB, regionId);
      const prompt = `${bgEditDynDesc.trim()}。保持画面构图基本稳定，动态轻微自然，画面中没有人物、没有文字，作为数字人口播的背景${kb.kbContext ? `\n【在地视觉参考·${kb.county}】融入下列气质（勿绘制系统标签）：\n${kb.kbContext}` : ""}`;
      // 动态背景必须图生：用 1.5 Pro（支持 i2v，时长 4–12）
      const r = await fetch("/api/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          ratio: "16:9",
          dur: "5秒",
          model: "seedance-1.5-pro",
          resolution: "720p",
          quality: "720P",
          generateAudio: false,
          imageUrl: uri,
        }),
        signal: AbortSignal.timeout(450_000),
      });
      const j = (await r.json().catch(() => ({}))) as { videoUrl?: string; error?: string };
      if (!r.ok || !j.videoUrl) { toast(j.error || "动态背景生成失败", "warn"); return; }
      setBgEditDyn(j.videoUrl);
      toast("动态背景已生成，保存后即可用于合成");
    } catch {
      toast("动态背景生成失败，请重试", "warn");
    } finally {
      setBgEditDynBusy(false);
    }
  }
  /* 保存场景（新建 upsert / 编辑更新），并选用 */
  function saveBgEdit() {
    if (!bgEditImg) { toast("请先上传/选择场景图", "warn"); return; }
    const name = bgEditName.trim() || "我的场景";
    const id = bgEditId ?? `mb_${Date.now()}`;
    const mb: MyBg = { id, name, img: bgEditImg, dynUrl: bgEditDyn ?? undefined };
    setMyBgs((prev) => {
      const next = bgEditId ? prev.map((m) => (m.id === id ? mb : m)) : [mb, ...prev.filter((m) => m.img !== bgEditImg)];
      try { localStorage.setItem(MY_BGS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
    setCBg({ img: bgEditImg, name, dyn: bgEditDyn ?? undefined }); // 绑定到编辑中形象
    setBgEditOpen(false);
    setBgTab("upload");
    toast(bgEditId ? "场景已更新" : "已保存到「上传场景」");
  }
  /* ── AI 生成背景场景 ── */
  async function aiGenerateBg() {
    if (!bgAgDesc.trim()) { toast("请描述背景场景", "warn"); return; }
    notifyRegionEnhance(toast, { useLora, useKB });
    setBgAgBusy(true);
    try {
      if (DEMO) {
        await demoWait(1000);
        const nm = bgAgDesc.trim().slice(0, 12) || "AI 背景";
        setBgAgOpen(false); setBgAgDesc("");
        startBgEdit(demoPick(DEMO_BG_IMAGES, bgAgDesc.trim().length), nm);
        toast("背景已生成（演示）");
        return;
      }
      const prompt = `数字人视频背景场景，${bgAgDesc.trim()}，农文旅主题，横向宽幅构图，画面中无人物、无文字，景深虚化留出人物站位，专业布光，写实高清`;
      const r = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(imageRequestBody({ prompt, size: ratioToSize(bgAgRatio), useLora, useKB, regionId })),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        toast(j.error || "背景生成失败，请重试", "warn");
        return;
      }
      const j = (await r.json()) as { images?: string[] };
      const img = j.images?.[0];
      if (!img) { toast("背景生成为空，请重试", "warn"); return; }
      const name = bgAgDesc.trim().slice(0, 12) || "AI 背景";
      setBgAgOpen(false);
      setBgAgDesc("");
      startBgEdit(img, name); // 生成后进入「编辑场景」弹窗
    } catch {
      toast("背景生成失败，请重试", "warn");
    } finally {
      setBgAgBusy(false);
    }
  }

  /* ── 上传自定义形象 ── */
  async function onUploadAvatar(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.type.startsWith("video") || !file.type.startsWith("image")) { toast("人像请上传清晰的人物照片（图片），不支持视频", "warn"); return; }
    if (file.size > 10 * 1024 * 1024) {
      toast("图片大小不能超过 10 MB，请压缩后重试", "warn");
      return;
    }
    const uri = await fileToDataUri(file);
    const name = file.name.replace(/\.[^.]+$/, "");
    // 上传后进入「创建我的形象」填写弹窗（与 AI 生图一致），填完再保存入库
    startCreateWithImage(uri, name);
  }

  /* ── AI 优化角色描述（送入 LLM 润色为高质量人像描述）── */
  async function optimizeAgDesc() {
    if (!agDesc.trim()) { toast("请先输入角色描述", "warn"); return; }
    notifyRegionEnhance(toast, { useLora, useKB });
    setAgOptBusy(true);
    try {
      if (DEMO) { await demoWait(600); setAgDesc(demoOptimizeDesc(agDesc, agGender, AG_AGE_WORDS[agAge])); toast("已优化角色描述（演示）"); return; }
      const r = await fetch("/api/avatar-desc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: agDesc.trim(), gender: agGender, age: AG_AGE_WORDS[agAge], ...kbFields(useKB, regionId) }),
      });
      const j = (await r.json().catch(() => ({}))) as { text?: string | null };
      if (!r.ok || !j.text) { toast("优化失败，请稍后重试", "warn"); return; }
      setAgDesc(j.text);
      toast("已优化角色描述");
    } catch {
      toast("优化失败，请检查网络后重试", "warn");
    } finally {
      setAgOptBusy(false);
    }
  }

  /* ── AI 生图（形象）── */
  async function aiGenerate() {
    if (!agDesc.trim()) { toast("请描述角色特征", "warn"); return; }
    notifyRegionEnhance(toast, { useLora, useKB });
    setAgBusy(true);
    try {
      if (DEMO) {
        await demoWait(1200);
        setAgOpen(false);
        startCreateWithImage(demoPick(DEMO_AVATAR_IMAGES, agDesc.trim().length), "");
        toast("已生成形象（演示）");
        return;
      }
      const prompt = `数字人形象，${agGender}性，${AG_AGE_WORDS[agAge]}，${agDesc.trim()}，正面清晰面部，专业摄影棚布光，写实人像，高清`;
      const r = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(imageRequestBody({ prompt, size: ratioToSize(agRatio), useLora, useKB, regionId })),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        toast(j.error || "形象生成失败，请重试", "warn");
        return;
      }
      const j = (await r.json()) as { images?: string[] };
      const img = j.images?.[0];
      if (!img) { toast("形象生成为空，请重试", "warn"); return; }
      // AI 图返回的是火山 ark 临时地址，会过期：趁 URL 新鲜立即转成 data URI 存下，
      // 否则后续 s2v/显示会因地址失效而失败（engine process fail）。转失败则退回原图。
      let persisted = img;
      try { persisted = await normalizeS2vImage(img); } catch { /* 保底用原图 */ }
      setAgOpen(false);
      startCreateWithImage(persisted, "");
    } catch {
      toast("形象生成失败，请重试", "warn");
    } finally {
      setAgBusy(false);
    }
  }

  /* ── 图片合成：上传第二张参考图（图2）── */
  async function onComposeUpload2(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image")) { toast("请上传图片（jpg / png / webp）", "warn"); return; }
    if (file.size > 10 * 1024 * 1024) { toast("图片大小不能超过 10 MB，请压缩后重试", "warn"); return; }
    setComposeImg2(await fileToDataUri(file));
  }

  /* ── 图片合成：图1（原图）+ 图2（参考图）+ 描述 → Seedream 多图合成 → 结果作新原图 ── */
  async function composeImages() {
    if (!cImg) { toast("缺少原图（图1）", "warn"); return; }
    if (!composeDesc.trim()) { toast("请描述要如何修改：可只填描述改图（如「把背景换成茶园」），或上传图2做元素合成", "warn"); return; }
    setComposeBusy(true);
    try {
      if (DEMO) {
        await demoWait(1200);
        toast("已合成（演示）——正式环境将调用图像合成模型");
        setComposeMode(false); setComposeImg2(null); setComposeDesc("");
        return;
      }
      // 结果尺寸沿用图1的宽高比（长边约 1536、64 对齐），保持人像构图不被拉成方图
      let size = "2048x2048";
      try {
        const im = await new Promise<HTMLImageElement>((res, rej) => {
          const el = new Image();
          el.onload = () => res(el); el.onerror = rej; el.src = cImg;
        });
        const w = im.naturalWidth || 1024, h = im.naturalHeight || 1024;
        // 豆包 Seedream 要求出图≥约369万像素(1920²)：按图1宽高比取总像素≈2048²(4.19M)、64 对齐，既保比例又稳过下限
        const target = 2048 * 2048, ratio = w / h;
        const al = (n: number) => Math.max(1024, Math.round(n / 64) * 64);
        size = `${al(Math.sqrt(target * ratio))}x${al(Math.sqrt(target / ratio))}`;
      } catch { /* 探测失败用默认方图 */ }
      // 有图2=多图元素合成；无图2=只按文字对图1改图（图生图/文字编辑）
      const hasRef = !!composeImg2;
      const prompt = hasRef
        ? `图1是主体人物，图2是参考素材。请在保持图1人物的相貌、发型、服饰、姿态与画面构图不变的前提下，${composeDesc.trim()}。自然融合光影与透视，写实高清，避免多余文字与水印。`
        : `请在保持人物的相貌、发型、服饰与整体构图基本不变的前提下，对这张图片做如下修改：${composeDesc.trim()}。自然真实、写实高清，避免多余文字与水印。`;
      const image = hasRef ? [cImg, composeImg2] : [cImg];
      const r = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(imageRequestBody({ prompt, size, image, useLora, useKB, regionId })),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        toast(j.error || "商品图合成失败，请重试", "warn");
        return;
      }
      const j = (await r.json()) as { images?: string[] };
      const out = j.images?.[0];
      if (!out) { toast("合成结果为空，请调整描述后重试", "warn"); return; }
      // 上游返回多为临时地址，趁新鲜转 data URI 存下，避免后续抠图/s2v 因地址失效而失败
      let persisted = out;
      try { persisted = await normalizeS2vImage(out); } catch { /* 保底用原图 */ }
      setCImg(persisted);       // 合成结果作为新原图（会触发抠图状态重置）
      setComposeMode(false); setComposeImg2(null); setComposeDesc("");
      toast("已合成，可继续抠图或选背景");
    } catch {
      toast("商品图合成失败，请检查网络后重试", "warn");
    } finally {
      setComposeBusy(false);
    }
  }

  /* ── 从仓库选图作形象（相对路径 → data URI，供 lipsync 上传）── */
  async function pickRepoImage(item: AssetCard) {
    if (!item.img) return;
    try {
      const blob = await fetch(item.img).then((r) => {
        if (!r.ok) throw new Error("fetch fail");
        return r.blob();
      });
      const uri = await blobToDataUri(blob);
      const name = item.name.replace(/\.[^.]+$/, "");
      if (repoTarget === "bg") {
        setRepoOpen(false);
        startBgEdit(uri, name); // 从仓库选场景 → 进「编辑场景」弹窗
      } else {
        // 从仓库选图后进入「创建我的形象」填写弹窗（与 AI 生图 / 本地上传一致）
        setRepoOpen(false);
        startCreateWithImage(uri, name);
      }
    } catch {
      toast("该图片读取失败，请换一张", "warn");
    }
  }

  /* ── 套用参考灵感：选形象 + 填文案 ── */
  function useInspire(it: (typeof INSPIRE)[number]) {
    const p = AVATAR_PRESETS.find((x) => x.id === it.presetId);
    if (p) { setSelectedPreset(p); setCustomImg(null); setPresetBg(null); }
    setScript(it.script);
    toast("已套用参考灵感");
  }

  /* ── TTS 预听（可指定音色）── */
  async function previewTts(v?: Voice) {
    if (!script.trim()) { toast("请先填写配音内容", "warn"); return; }
    const vObj = v ?? selectedVoice;
    const voice = vObj?.tts ?? "zh_female_shuangkuaisisi_moon_bigtts";
    try {
      const r = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: script.trim().slice(0, 500),
          voice,
          speed,
          volume: volume / 5,
          pitch,
          emotion: vObj?.multiEmotion ? VOLC_EMOTION[emotion] : undefined,
          clone: /^S_/.test(voice),
        }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        toast(j.error || "语音合成失败，请重试", "warn");
        return;
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      if (audioBlobUrl) URL.revokeObjectURL(audioBlobUrl);
      setAudioBlobUrl(url);
      if (audioRef.current) {
        audioRef.current.src = url;
        void audioRef.current.play();
        setTtsPlaying(true);
      }
    } catch {
      toast("语音合成失败，请重试", "warn");
    }
  }

  function stopTts() {
    audioRef.current?.pause();
    setTtsPlaying(false);
  }

  /* 随机填充角色表现（保证与当前不同）*/
  function shufflePerform() {
    const step = 1 + Math.floor(Math.random() * (PERFORM_PRESETS.length - 1));
    shuffleRef.current = (shuffleRef.current + step) % PERFORM_PRESETS.length;
    setPerformance(PERFORM_PRESETS[shuffleRef.current]);
  }

  const updateRun = (id: string, patch: Partial<AvatarRun>) =>
    setRuns((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  // 生成历史元数据持久化（视频 blob 存 IndexedDB，此处只存轻量元数据；最多 30 条）
  function persistRunMeta(m: { id: string; name: string; script: string; poster: string; time: string; overlaySubs?: boolean }) {
    try {
      const list = JSON.parse(localStorage.getItem(AVATAR_RUNS_KEY) || "[]") as typeof m[];
      const next = [m, ...list.filter((x) => x.id !== m.id)].slice(0, 30);
      localStorage.setItem(AVATAR_RUNS_KEY, JSON.stringify(next));
    } catch { /* ignore */ }
  }
  // 未完成任务持久化（供刷新/断线恢复轮询）
  function savePending(p: PendingTask) {
    try {
      const list = JSON.parse(localStorage.getItem(PENDING_KEY) || "[]") as PendingTask[];
      localStorage.setItem(PENDING_KEY, JSON.stringify([p, ...list.filter((x) => x.runId !== p.runId)].slice(0, 8)));
    } catch { /* 换背景的 bg 可能是大 data URI，超配额则不持久化，仅当次会话内可轮询 */ }
  }
  function removePending(runId: string) {
    try {
      const list = JSON.parse(localStorage.getItem(PENDING_KEY) || "[]") as PendingTask[];
      localStorage.setItem(PENDING_KEY, JSON.stringify(list.filter((x) => x.runId !== runId)));
    } catch { /* ignore */ }
  }
  // 取消等待单条：停止轮询 + 清 pending + 从历史移除（火山侧任务无取消接口，仍会自行跑完，仅本地不再等）
  function cancelRun(runId: string) {
    cancelledRef.current.add(runId);
    removePending(runId);
    setRuns((prev) => prev.filter((r) => r.id !== runId));
    setGenerating(false);
    setGenLabel(""); setGenPct(0);
  }
  // 取消全部等待：清空 pending + 移除所有「生成中」条目
  function cancelAllPending() {
    try {
      const list = JSON.parse(localStorage.getItem(PENDING_KEY) || "[]") as PendingTask[];
      list.forEach((p) => cancelledRef.current.add(p.runId));
      localStorage.removeItem(PENDING_KEY);
    } catch { /* ignore */ }
    setRuns((prev) => prev.filter((r) => r.status !== "running"));
    setGenerating(false);
    setGenLabel(""); setGenPct(0);
    toast("已清空排队等待（火山侧任务会自行跑完，本地不再等）");
  }
  const prox = (u: string) => (/^https?:\/\//.test(u) ? `/api/proxy-video?url=${encodeURIComponent(u)}` : u);

  // 轮询任务状态直到出片：返回外链视频地址；失败/超时抛错。不长挂请求，每次查询都是快请求。
  async function pollLipsync(runId: string, taskId: string): Promise<string> {
    const deadline = Date.now() + 25 * 60 * 1000; // 前端最多等 25min（免费试用并发1、队列积压时排队很久）
    while (Date.now() < deadline) {
      if (cancelledRef.current.has(runId)) throw new Error("已取消等待");
      await new Promise((r) => setTimeout(r, 5000));
      if (cancelledRef.current.has(runId)) throw new Error("已取消等待");
      const r = await fetch("/api/lipsync", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "status", taskId }),
        signal: AbortSignal.timeout(30_000),
      }).catch(() => null);
      if (!r) continue; // 网络抖动，继续轮询
      const j = (await r.json().catch(() => ({}))) as { status?: string; videoUrl?: string; error?: string };
      if (j.status === "done" && j.videoUrl) return j.videoUrl;
      if (j.status === "failed") throw new Error(j.error || "数字人生成失败，请重试");
      setGenLabel(j.status === "queued" ? "排队中，等待数字人算力…" : "正在驱动数字人口型…");
      if (runId) setGenPct((p) => Math.min(88, p + 1)); // 缓慢推进
    }
    throw new Error("数字人生成超时，请重试（任务可能仍在火山侧排队，可稍后重试）");
  }

  // 收尾：外链视频 → 换背景合成 / 直出 → 缓存 + 入历史 + 入作品库；清理 pending
  async function finalizeLipsync(p: PendingTask, remoteUrl: string, audioBlob: Blob | null, audioCtx: AudioContext | null) {
    // OmniHuman 原片已是完整口播视频（人物+手持物+背景+口型俱全）。直接用原片，不做任何 canvas 重录：
    // 离屏 <video> 浏览器只推进时钟不解码新帧，重录必冻帧。字幕改由播放器按 script 实时叠加（overlaySubs），画质/口型零损失。
    const overlaySubs = p.subtitleOn !== false;
    setGenLabel("正在保存视频…");
    const blob = await fetch(prox(remoteUrl)).then((r) => r.blob());
    await putCachedVideo(p.runId, blob);
    const videoUrl = URL.createObjectURL(blob);
    setGenPct(100); setGenLabel("合成完成！");
    updateRun(p.runId, { status: "done", videoUrl, overlaySubs });
    persistRunMeta({ id: p.runId, name: p.name, script: p.script, poster: p.poster.startsWith("data:") ? "" : p.poster, time: p.time, overlaySubs });
    removePending(p.runId);
    addWork({
      emoji: "🧑‍💼",
      grad: "thumb-grad-2",
      kind: "视频",
      name: `${p.name} · 数字人口播`,
      sub: "数字人模特",
      module: "video",
      time: nowStamp(),
      img: p.poster.startsWith("data:") ? undefined : p.poster,
      videoUrl: remoteUrl,
      mediaRef: `idb:${p.runId}`,
      edit: { sub: "avatar", input: p.script, runId: p.runId },
    });
  }

  // 删除一条生成历史：内存 + 本地元数据一起删（IndexedDB blob 变孤儿但无害，不会再被引用）
  function deleteRun(id: string) {
    setRuns((p) => p.filter((x) => x.id !== id));
    try {
      const list = JSON.parse(localStorage.getItem(AVATAR_RUNS_KEY) || "[]") as { id: string }[];
      localStorage.setItem(AVATAR_RUNS_KEY, JSON.stringify(list.filter((x) => x.id !== id)));
    } catch { /* ignore */ }
  }
  // 生成历史 → 作品卡（与生成时写入「我的作品」的口径一致，用于收藏/存库）
  function avatarVideoAsset(r: AvatarRun): AssetCard {
    return {
      emoji: "🧑‍💼",
      grad: "thumb-grad-2",
      kind: "视频",
      name: `${r.name} · 数字人口播`,
      sub: "数字人模特",
      module: "video",
      img: r.poster || undefined,
      videoUrl: r.videoUrl?.startsWith("blob:") ? undefined : r.videoUrl,
      mediaRef: `idb:${r.id}`,
      time: nowStamp(),
      edit: { sub: "avatar", input: r.script, runId: r.id },
    };
  }
  // 收藏：写入「我的作品」并标记收藏，与仓库「只看收藏」互通（与一句话一致）
  function toggleRunFav(r: AvatarRun) {
    const a = avatarVideoAsset(r);
    const was = isFavorite(a);
    addWork(a);
    toggleFavorite(a);
    toast(was ? "已取消收藏" : "已收藏，可在「仓库 · 我的作品」用「只看收藏」筛选");
  }
  // 重新编辑：把该条文案回填到「配音内容」，可改后再次生成
  function reeditRun(r: AvatarRun) {
    setScript(r.script);
    toast("文案已回填到左侧，可编辑后再次生成");
  }
  // 去制作大片：为这条数字人视频建/复用一个制作大片项目，塞入 1 个已生成镜头，跳到④分镜视频
  function studioFromRun(r: AvatarRun) {
    if (!r.videoUrl) { toast("这条还没有可用的视频，无法制作大片", "warn"); return; }
    const pid = `p-avatar-${r.id}`;
    const existing = getProject(pid);
    const name = existing?.name ?? uniqueProjectName((r.name || "数字人口播").slice(0, 12).trim() || "数字人口播");
    if (!existing) {
      const dur = Math.max(2, Math.min(15, Math.ceil(r.script.length / 3) || 5));
      const shot = { id: `shot-avatar-${r.id}`, shotDesc: r.script, caption: "", camera: "", shotSize: "", assetRefs: [] as string[], locked: false, dur, poster: r.poster || "", status: "done", pct: 100, videoUrl: r.videoUrl };
      const state = { projectName: name, stepKey: "clips", script: r.script, studioIdea: r.script, settings: { 模型: "Seedance 1.5 Pro", 视频比例: "9:16", 视频风格: "智能匹配", 视频质量: "480P", 配音: "温柔女声", 配乐: "舒缓", 字幕: "显示", 本地增强: "使用" }, totalSec: dur, targetShots: 1, assets: [], shots: [shot], genMode: "text", subtitles: [] };
      upsertProject({ id: pid, name, updated: nowStamp(), ts: Date.now(), count: 1, cover: r.videoUrl, state });
    }
    router.push(`/video?sub=studio:clips&from=home&pid=${encodeURIComponent(pid)}&name=${encodeURIComponent(name)}`);
  }
  // 挂载时从本地缓存重建生成历史（刷新不丢）
  useEffect(() => {
    let list: { id: string; name: string; script: string; poster: string; time: string }[] = [];
    try { list = JSON.parse(localStorage.getItem(AVATAR_RUNS_KEY) || "[]"); } catch { return; }
    if (!list.length) {
      // DEMO：无历史时种一条示例口播（用随站发布的本地 demo 视频），让线上页面有内容可看/可播/可下载
      if (DEMO) {
        const p = AVATAR_PRESETS[0];
        setRuns([{
          id: "seed_demo_1", name: `${p.name} · 数字人口播`,
          script: "现在播报一则通知：为进一步优化便民服务，我县政务大厅将延长工作时间，方便群众办事。",
          poster: p.cover, time: "2026-07-23 11:32", status: "done", videoUrl: DEMO_VIDEO,
        }]);
      }
      return;
    }
    (async () => {
      const rehydrated = await Promise.all(list.map(async (m) => {
        const blob = await getCachedVideo(m.id);
        return blob
          ? { id: m.id, name: m.name, script: m.script, poster: m.poster, time: m.time, status: "done" as const, videoUrl: URL.createObjectURL(blob), overlaySubs: (m as { overlaySubs?: boolean }).overlaySubs }
          : null;
      }));
      const valid = rehydrated.filter(Boolean) as AvatarRun[];
      // 合并：保留恢复流程已插入的 running 条目，补入本地缓存的 done 条目
      if (valid.length) setRuns((prev) => { const have = new Set(prev.map((r) => r.id)); return [...prev, ...valid.filter((v) => !have.has(v.id))]; });
    })();
  }, []);

  // 挂载时恢复「已提交未出片」的任务：重建 running 条目并接着轮询（刷新/断线不丢）
  useEffect(() => {
    if (DEMO) return;
    let list: PendingTask[] = [];
    try { list = JSON.parse(localStorage.getItem(PENDING_KEY) || "[]"); } catch { return; }
    if (!list.length) return;
    (async () => {
      for (const p of list) {
        if (!p.taskId) { removePending(p.runId); continue; }
        setRuns((prev) => prev.some((r) => r.id === p.runId) ? prev : [{ id: p.runId, name: p.name, script: p.script, poster: p.poster, status: "running", time: p.time }, ...prev]);
        setResultTab("history"); setGenerating(true); setGenPct(10); setGenLabel("恢复未完成的数字人任务…");
        let audioCtx: AudioContext | null = null, audioBlob: Blob | null = null;
        try {
          // 换背景合成 / 烧字幕都需要口播音轨（旧任务无 subtitleOn 字段视为开）
          if (p.bg?.img || p.bg?.dyn || p.subtitleOn !== false) {
            audioBlob = await getCachedVideo(`audio_${p.runId}`);
            try { audioCtx = new AudioContext(); await audioCtx.resume(); } catch { audioCtx = null; }
          }
          const remoteUrl = await pollLipsync(p.runId, p.taskId);
          await finalizeLipsync(p, remoteUrl, audioBlob, audioCtx);
          toast("已恢复并完成一条数字人视频");
        } catch (e) {
          const msg = e instanceof Error ? e.message : "恢复失败";
          updateRun(p.runId, { status: "failed", errorMsg: msg });
          if (!/超时/.test(msg)) removePending(p.runId);
        } finally {
          setGenerating(false);
          try { await audioCtx?.close(); } catch { /* ignore */ }
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── 合成：TTS → Lipsync，结果进「生成历史」── */
  async function generate() {
    if (!avatarImg && !selectedPreset) {
      toast("请先选择或上传数字人形象", "warn");
      setLibOpen(true);
      return;
    }
    if (!script.trim()) {
      toast("请先填写配音内容", "warn");
      return;
    }
    // 对口型单次上限：先用估算快速拦一道，省掉无谓的合成调用（DEMO 无真实对口型，不受限）
    if (!DEMO && overLipLimit) {
      toast(`配音约 ${estSec} 秒，数字人对口型单次上限 ${LIPSYNC_MAX_SEC} 秒，请精简文案或调快语速后再生成`, "warn");
      return;
    }
    // 背景绑定在形象上：我的形象读 ma.bg / 官方形象读去使用设置的临时 presetBg；有则换背景合成，否则原图
    const avaBg = customImg
      ? myAvatars.find((m) => m.img === customImg)?.bg
      : (selectedPreset ? presetBg ?? undefined : undefined);
    const willComposite = !!(avaBg?.img || avaBg?.dyn);
    // 换背景合成、或无背景但要烧字幕，都会过 canvas 录制：前景静音、口播音轨经 Web Audio 注入（规避自动播放拦截）。
    // AudioContext 必须在点击手势内 resume（此处尚未 await，手势仍有效）。
    const needAudioInject = willComposite || subtitleOn;
    let audioCtx: AudioContext | null = null;
    if (needAudioInject) {
      try { audioCtx = new AudioContext(); await audioCtx.resume(); } catch { audioCtx = null; }
    }
    const runId = `run_${Date.now()}`;
    const poster = customImg ?? selectedPreset?.cover ?? "";
    setRuns((prev) => [
      {
        id: runId,
        name: avatarLabel || "数字人",
        script: script.trim(),
        poster,
        status: "running",
        time: nowStamp(),
        regionEnhance,
        regionId,
      },
      ...prev,
    ]);
    setResultTab("history");
    setGenerating(true);
    setGenPct(2);
    setGenLabel("正在合成语音…");

    let pct = 2;
    timerRef.current = setInterval(() => {
      pct = Math.min(88, pct + 1.5);
      setGenPct(pct);
    }, 1800);

    try {
      // DEMO（线上静态部署，无后端）：跳过 tts/lipsync/合成的 API，本地渲染一段匹配所选形象+背景的 demo 视频
      if (DEMO) {
        setGenLabel("正在生成数字人视频…");
        const personImg = customImg ?? selectedPreset?.cover ?? "";
        const demoSec = 6;
        const blob = await renderAvatarDemoVideo(personImg, avaBg ?? null, {
          seconds: demoSec,
          captions: subtitleOn ? buildAvatarCues(script.trim(), demoSec) : undefined,
        });
        await putCachedVideo(runId, blob);
        const demoUrl = URL.createObjectURL(blob);
        clearInterval(timerRef.current!);
        setGenPct(100);
        setGenLabel("合成完成！");
        updateRun(runId, { status: "done", videoUrl: demoUrl, overlaySubs: false }); // DEMO 已把字幕烧进画面，播放器不再叠加
        persistRunMeta({ id: runId, name: avatarLabel || "数字人", script: script.trim(), poster: poster.startsWith("data:") ? "" : poster, time: nowStamp(), overlaySubs: false });
        addWork({
          emoji: "🧑‍💼",
          grad: "thumb-grad-2",
          kind: "视频",
          name: `${avatarLabel} · 数字人口播`,
          sub: "数字人模特",
          module: "video",
          time: nowStamp(),
          img: poster.startsWith("data:") ? undefined : poster,
          mediaRef: `idb:${runId}`,
          edit: { sub: "avatar", input: script.trim(), runId },
        });
        toast("数字人视频已生成（演示）");
        return;
      }
      const voice = selectedVoice?.tts ?? selectedPreset?.defaultVoice ?? "zh_female_shuangkuaisisi_moon_bigtts";
      // 合理时长上限：按最慢约 1.5 字/秒估算 + 6s 缓冲、下限 24s。超出视为火山偶发坏音频，synthTTS 内部会自动重试
      const plausibleMax = Math.max(24, Math.ceil(script.trim().length / 1.5 / (speed || 1)) + 6);
      const { blob: audioBlob, realSec } = await synthTTS(
        {
          text: script.trim().slice(0, 500),
          voice,
          speed,
          volume: volume / 5,
          pitch,
          emotion: selectedVoice?.multiEmotion ? VOLC_EMOTION[emotion] : undefined,
          clone: /^S_/.test(voice),
        },
        plausibleMax,
      );
      // 真实时长校验：数字人对口型硬性要求输入音频 ≤ 上限（OmniHuman 60s）
      if (realSec > LIPSYNC_MAX_SEC) {
        // 区分「文案真的太长」与「重试后仍为坏音频（大段静音）」，给不同提示
        throw new Error(
          realSec > plausibleMax
            ? `语音合成异常（返回约 ${Math.ceil(realSec)} 秒、含大段静音的音频），已自动重试仍失败，请重试或更换音色`
            : `配音时长约 ${Math.ceil(realSec)} 秒，超过数字人对口型 ${LIPSYNC_MAX_SEC} 秒上限，请精简文案或调快语速后重试`,
        );
      }
      const audioDataUri = await blobToDataUri(audioBlob);

      const rawImg = customImg ?? selectedPreset?.cover ?? "";
      if (!rawImg) throw new Error("形象图片不可用，请上传或 AI 生成形象图");
      // 规范化形象图（本地/远程/AI 图统一转成 ≤1280 JPEG，由 lipsync 上传 OSS），
      // 规避 AI 生成图直接给 s2v 时的格式/尺寸/远程拉取失败（engine process fail）。
      const imageUri = await normalizeS2vImage(rawImg);

      // 抗断式：提交任务秒回 taskId → 前端轮询（不长挂请求，超时/断线也不丢，刷新可恢复）
      setGenLabel("正在提交数字人任务…");
      const subResp = await fetch("/api/lipsync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit", image: imageUri, audio: audioDataUri, resolution: "720P", performance: performance.trim() || undefined }),
        // 提交超时留足：即梦 OmniHuman 秒回 taskId，后续轮询 status 取视频
        signal: AbortSignal.timeout(450_000),
      });
      const subJson = (await subResp.json().catch(() => ({}))) as { taskId?: string; videoUrl?: string; error?: string };
      if (!subResp.ok) throw new Error(subJson.error || "提交数字人任务失败");

      const pending: PendingTask = {
        runId, taskId: subJson.taskId ?? "", name: avatarLabel || "数字人", script: script.trim(),
        poster, time: nowStamp(), contentSec: realSec, bg: avaBg ?? null, subtitleOn,
      };
      // 换背景合成 / 烧字幕都要用口播音轨；存 IndexedDB，供本次及刷新恢复时取用
      if (needAudioInject) { try { await putCachedVideo(`audio_${runId}`, audioBlob); } catch { /* ignore */ } }

      // 即梦 OmniHuman 提交后回 taskId，需轮询 status 取视频
      let remoteUrl = subJson.videoUrl || "";
      if (!remoteUrl) {
        if (!subJson.taskId) throw new Error("提交任务失败，请重试");
        savePending(pending); // 持久化，刷新/断线后可恢复
        setGenLabel("排队中，等待数字人算力…");
        remoteUrl = await pollLipsync(runId, subJson.taskId);
      }
      await finalizeLipsync(pending, remoteUrl, audioBlob, audioCtx);
      clearInterval(timerRef.current!);
      toast("数字人视频已生成，已存入「我的作品」");
    } catch (e) {
      clearInterval(timerRef.current!);
      setGenPct(0);
      setGenLabel("");
      const msg = e instanceof Error ? e.message : "生成失败，请重试";
      updateRun(runId, { status: "failed", errorMsg: msg });
      // 超时保留 pending（任务可能仍在火山侧排队，刷新后可恢复轮询）；其余为终态失败，清掉避免反复恢复
      if (!/超时/.test(msg)) removePending(runId);
      toast(msg, "warn");
    } finally {
      setGenerating(false);
      try { await audioCtx?.close(); } catch { /* ignore */ }
    }
  }

  const filteredPresets = roleFilter === "全部"
    ? AVATAR_PRESETS
    : AVATAR_PRESETS.filter((p) => p.role === roleFilter);
  const shownRuns = onlyFav ? runs.filter((r) => isFavorite(avatarVideoAsset(r))) : runs;

  // 与制作大片一致：系统/收藏 tab + 场景/年龄/性别筛选，「多情感」按 multiEmotion 标记
  const filteredVoices = VOICES.filter((v) => {
    if (voiceTab === "fav" && !voiceFavs.includes(v.id)) return false;
    if (vScene === "多情感") { if (!v.multiEmotion) return false; }
    else if (vScene !== VOICE_SCENES[0] && v.scene !== vScene) return false;
    if (vAge !== VOICE_AGES[0] && v.age !== vAge) return false;
    if (vGender !== VOICE_GENDERS[0] && v.gender !== vGender) return false;
    return true;
  });

  // 仓库可选图片：用户作品/素材 + 种子数据，仅取有真实图片(img)的，按 img 去重
  const repoImages = (() => {
    const seen = new Set<string>();
    return [...works, ...materials, ...myWorks, ...myMaterials].filter((a) => {
      if (!a.img || seen.has(a.img)) return false;
      // 选人像形象时排除视频作品：它们的 img 只是视频海报（场景图），不是清晰人像
      if (repoTarget === "avatar" && a.videoUrl) return false;
      seen.add(a.img);
      return true;
    });
  })();

  // 数字人对口型音频上限（OmniHuman <60s，建议 ≤15s）；按 3 字/秒并计入语速估算时长
  const estSec = Math.ceil(script.trim().length / 3 / (speed || 1));
  const overLipLimit = estSec > LIPSYNC_MAX_SEC;

  return (
    <div className="page">
      <div className="editor-layout">
        <EditorRail items={railItems} activeKey="avatar" iconOf={iconOf} onPick={onPickType} />

        <div className="workspace av-avatar-ws">
          {/* ══ 左：配置表单（宽度与一句话成片一致，300px）══ */}
          <div className="ws-panel sticky">
            <div className="ws-scroll">
              <RegionEnhanceStrip
                useLora={useLora}
                onLoraChange={(next) => {
                  setUseLora(next);
                  setRegionEnhance(next || useKB);
                }}
                useKB={useKB}
                onKBChange={(next) => {
                  setUseKB(next);
                  setRegionEnhance(useLora || next);
                }}
                regionId={regionId}
                showLora={true}
              />
              {/* 数字人形象 */}
              <div className="field">
                <div className="ws-label">数字人形象</div>
                <div className="av-single">
                  <div
                    className={`av-dual-box av-single-box${humanPreview ? " av-dual-box--on" : ""}`}
                    onClick={() => humanPreview && setPreviewImg(humanPreview)}
                    title={humanPreview ? "点击查看完整图片" : undefined}
                  >
                    {humanPreview ? (
                      // 所见即所得：绑背景→抠像合成；未绑→模糊铺底+完整人像（与生成 reframe 一致）
                      <CompositePreview person={humanPreview} bg={selBg?.img ? selBg : null} />
                    ) : (
                      <span className="av-dual-ph">尚未选择形象</span>
                    )}
                  </div>
                  <button className="av-face-btn av-single-btn" onClick={() => { setLibTab("official"); setLibOpen(true); }}>形象库</button>
                  <input ref={imgFileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onUploadAvatar} />
                  <input ref={bgFileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onUploadBg} />
                  <input ref={bgVideoFileRef} type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={onBgVideoUpload} />
                </div>
              </div>

              {/* 配音内容 */}
              <div className="field">
                <div className="av-field-hd av-dub-hd">
                  <span className="ws-label av-dub-label">配音内容</span>
                  <span className={`av-count${overLipLimit ? " av-count-over" : ""}`}>
                    {script.length}/500 字 · 约 {estSec} 秒{overLipLimit ? ` · 超口型 ${LIPSYNC_MAX_SEC} 秒上限` : ""}
                  </span>
                </div>
                <textarea
                  className="av-script-box"
                  placeholder="请输入你想让角色说话的内容（约 3 字 / 秒）"
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                  maxLength={500}
                />
                <audio ref={audioRef} onEnded={() => setTtsPlaying(false)} style={{ display: "none" }} />
              </div>

              {/* 选择音色 → 声音设置弹窗 */}
              <button className="av-select-row" onClick={() => setVoiceSettingsOpen(true)}>
                <span className="av-select-label">选择音色</span>
                <span className="av-select-val">{voiceLabel} · {speed.toFixed(1)}x</span>
                <span className="av-select-chev">›</span>
              </button>

              {/* 角色表现（非必填）*/}
              <div className="field">
                <div className="ws-label">角色表现 <span className="av-field-opt">（非必填）</span></div>
                <div className="av-perform-wrap">
                  <textarea
                    className="av-perform-box"
                    placeholder="请输入角色的动作、情绪、运镜等，让数字人表现更生动"
                    value={performance}
                    onChange={(e) => setPerformance(e.target.value)}
                    maxLength={200}
                  />
                  <button className="av-perform-shuffle" onClick={shufflePerform} title="随机填充一个表现">随机</button>
                </div>
              </div>

              {/* 生成模式 */}
              <div className="field">
                <div className="ws-label">生成模式</div>
                <div className="av-seg-row">
                  {(["720p", "1080p"] as const).map((m) => (
                    <button
                      key={m}
                      className={`av-seg-opt${genMode === m ? " av-seg-opt--on" : ""}`}
                      onClick={() => setGenMode(m)}
                    >{m} + 30FPS</button>
                  ))}
                </div>
              </div>

              {/* 字幕：按口播文案分句烧录到画面底部 */}
              <div className="field">
                <div className="ws-label">字幕</div>
                <div className="av-seg-row">
                  {([[true, "显示"], [false, "隐藏"]] as const).map(([on, label]) => (
                    <button
                      key={label}
                      className={`av-seg-opt${subtitleOn === on ? " av-seg-opt--on" : ""}`}
                      onClick={() => setSubtitleOn(on)}
                    >{label}</button>
                  ))}
                </div>
              </div>

              {/* 生成数量 */}
              <div className="field">
                <div className="ws-label">生成数量</div>
                <div className="av-seg-row">
                  {[1, 2].map((n) => (
                    <button
                      key={n}
                      className={`av-seg-opt${genCount === n ? " av-seg-opt--on" : ""}`}
                      onClick={() => setGenCount(n)}
                    >{n}</button>
                  ))}
                </div>
              </div>

              <div className="av-disclaimer"><span>ⓘ</span> 内容由 AI 生成，禁止利用功能从事违法活动</div>
            </div>

            {/* 底部生成栏 */}
            <div className="ws-foot">
              <button
                className="btn btn-primary btn-block gen-btn"
                disabled={generating}
                onClick={generate}
              >
                {generating ? (
                  `合成中… ${Math.round(genPct)}%`
                ) : (
                  <>
                    立即生成 <PointsCost amount={avatarSecondsPoints(Math.max(1, estSec || 8))} />
                  </>
                )}
              </button>
            </div>
          </div>

          {/* ══ 右：生成历史 / 参考灵感 ══ */}
          <div className="ws-panel av-result">
            <div className="lg-head">
              <div className="tabs">
                <div className={resultTab === "history" ? "tab on" : "tab"} onClick={() => setResultTab("history")}>生成历史</div>
                <div className={resultTab === "inspire" ? "tab on" : "tab"} onClick={() => setResultTab("inspire")}>参考灵感</div>
              </div>
              {resultTab === "history" && runs.length > 0 && (
                <label className="lg-fav-switch">
                  <input type="checkbox" checked={onlyFav} onChange={(e) => setOnlyFav(e.target.checked)} />
                  <span className="lg-switch" />
                  只看收藏
                </label>
              )}
              {resultTab === "history" && runs.some((r) => r.status === "running") && (
                <button className="av-cancel-all" onClick={cancelAllPending} title="清空所有排队/生成中的等待（火山侧任务仍会自行跑完，本地不再等）">取消全部等待</button>
              )}
            </div>

            {resultTab === "history" ? (
              shownRuns.length === 0 ? (
                <div className="preview-empty">
                  <div>
                    <div className="pe-ico"><Icon name={onlyFav ? "heart" : "video"} size={42} /></div>
                    {onlyFav ? "还没有收藏，把鼠标移到视频上点右上角♡收藏" : "还没有生成记录，选好形象、填好配音，点左下「生成」试试"}
                  </div>
                </div>
              ) : (
                <div className="ov-runs">
                  {shownRuns.map((r) => {
                    const done = r.status === "done" && !!r.videoUrl;
                    const loading = r.status === "running";
                    const failed = r.status === "failed";
                    return (
                    <div key={r.id} className="ov-run">
                      <div className="ov-run-head">
                        <p className="ov-run-prompt">{r.script}</p>
                        <div className="ov-run-meta">
                          <span className="ov-run-mode">数字人口播</span>
                          <span className="lg-cat">{r.name}</span>
                          {r.regionEnhance && <RegionEnhanceBadge regionId={r.regionId} />}
                          {!loading && (
                            <button className="lh-ico lh-tip" data-tip="删除" aria-label="删除" onClick={() => deleteRun(r.id)}>
                              <Icon name="trash" size={14} />
                            </button>
                          )}
                          <span className="ov-run-time">{r.time}</span>
                        </div>
                      </div>
                      <div
                        className={`ov-video ov-video--portrait thumb-grad-2${done ? " clickable" : ""}`}
                        onClick={done ? () => setPlaying(r) : undefined}
                        role={done ? "button" : undefined}
                        title={done ? "点击播放预览" : undefined}
                      >
                        {done ? (
                          <>
                            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                            <video className="ov-video-poster" src={r.videoUrl!} muted preload="metadata" />
                            <button
                              className={isFavorite(avatarVideoAsset(r)) ? "lh-fav on" : "lh-fav"}
                              title={isFavorite(avatarVideoAsset(r)) ? "取消收藏" : "收藏"}
                              onClick={(e) => { e.stopPropagation(); toggleRunFav(r); }}
                            >
                              <Icon name="heart" size={15} />
                            </button>
                            <div className="ov-play">▶</div>
                            <span className="lh-mark">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img className="lh-mark-logo" src={assetUrl("/brand-logo.png")} alt="魔方智绘" />
                              由 AI 生成
                            </span>
                          </>
                        ) : loading ? (
                          <div className="ov-video-loading av-run-loading">
                            {r.poster && <img src={r.poster} alt="" className="av-run-blur" />}
                            <div className="av-run-spinner" />
                            <div className="ov-video-status">{genLabel || "正在合成…"} {Math.round(genPct)}%</div>
                            <button className="av-run-cancel" onClick={() => cancelRun(r.id)} title="停止等待这条（火山侧任务仍会自行跑完，本地不再等）">取消等待</button>
                          </div>
                        ) : (
                          <div className="ov-video-loading">
                            <Icon name="close" size={26} />
                            <div className="ov-video-status" style={{ color: "var(--color-warn, #f59e0b)" }}>
                              {r.errorMsg || "生成失败，请重试"}
                            </div>
                          </div>
                        )}
                      </div>
                      {done && (
                        <div className="ov-run-acts">
                          <a href={r.videoUrl!} download="数字人口播.mp4" className="btn btn-soft btn-sm">下载视频</a>
                          <button className="btn btn-ghost btn-sm" onClick={() => reeditRun(r)}><Icon name="edit" size={13} /> 重新编辑</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => generate()}>
                            <Icon name="refresh" size={13} /> 再次生成 <PointsCost amount={avatarSecondsPoints(Math.max(1, estSec || 8))} />
                          </button>
                          <button className="btn btn-primary btn-sm ov-run-studio" onClick={() => studioFromRun(r)}>去制作大片 <Icon name="chevron" size={14} /></button>
                        </div>
                      )}
                      {failed && (
                        <div className="ov-run-acts">
                          <button className="btn btn-ghost btn-sm" onClick={() => reeditRun(r)}><Icon name="edit" size={13} /> 重新编辑</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => generate()}>
                            <Icon name="refresh" size={13} /> 再次生成 <PointsCost amount={avatarSecondsPoints(Math.max(1, estSec || 8))} />
                          </button>
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              )
            ) : (
              <div className="av-inspire-grid">
                {INSPIRE.map((it) => {
                  const p = AVATAR_PRESETS.find((x) => x.id === it.presetId);
                  return (
                    <div key={it.presetId + it.title} className="av-inspire-card" onClick={() => useInspire(it)}>
                      <div className="av-inspire-cover" style={p ? { background: p.grad } : {}}>
                        {p?.cover ? <img src={p.cover} alt={p.name} className="av-inspire-img" /> : <span className="av-inspire-emoji">{p?.emoji}</span>}
                      </div>
                      <span className="av-inspire-title">{it.title}</span>
                      <div className="av-inspire-mask">
                        <p className="av-inspire-mask-script">{it.script.slice(0, 46)}…</p>
                        <button className="av-inspire-apply" onClick={(e) => { e.stopPropagation(); useInspire(it); }}>套用灵感</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══ 形象图查看弹窗 ══ */}
      {previewImg && (
        <div className="av-modal-mask av-imgview-mask" onClick={() => setPreviewImg(null)}>
          <div className="av-imgview" onClick={(e) => e.stopPropagation()}>
            <button className="av-side-close av-imgview-close" onClick={() => setPreviewImg(null)}>✕</button>
            <img src={previewImg} alt="完整形象" className="av-imgview-img" />
          </div>
        </div>
      )}

      {/* ══ 播放器弹窗 ══ */}
      {playing?.videoUrl && <AvatarPlayer run={playing} onClose={() => setPlaying(null)} />}

      {/* ══ 形象库弹窗 ══ */}
      {libOpen && (
        <div className="av-modal-mask" onClick={() => setLibOpen(false)}>
          <div className="av-modal av-lib-modal" onClick={(e) => e.stopPropagation()}>
            <div className="av-modal-hd">
              <span className="av-modal-title">形象库</span>
              <button className="av-side-close" onClick={() => setLibOpen(false)}>✕</button>
            </div>
            <div className="av-modal-body">
              <div className="av-lib-tabs">
                <button className={`av-lib-tab${libTab === "official" ? " av-lib-tab--on" : ""}`} onClick={() => setLibTab("official")}>官方形象</button>
                <button className={`av-lib-tab${libTab === "mine" ? " av-lib-tab--on" : ""}`} onClick={() => setLibTab("mine")}>我的形象</button>
              </div>
              {libTab === "official" ? (
                <>
                  <div className="av-filters">
                    {AVATAR_ROLES.map((r) => (
                      <button key={r} className={`av-filter-btn${roleFilter === r ? " av-filter-btn--on" : ""}`} onClick={() => setRoleFilter(r)}>{r}</button>
                    ))}
                  </div>
                  <div className="av-lib-grid">
                    {filteredPresets.map((p) => {
                      const sel = selectedPreset?.id === p.id && !customImg;
                      return (
                        <div key={p.id} className={`av-lib-card av-lib-card--click${sel ? " av-lib-card--sel" : ""}`} title={`使用 ${p.name} · ${p.role}`}
                          onClick={() => { setSelectedPreset(p); setCustomImg(null); setPresetBg(null); setLibOpen(false); }}
                          onMouseEnter={p.demo ? (e) => { const v = e.currentTarget.querySelector("video"); v?.play().catch(() => { }); } : undefined}
                          onMouseLeave={p.demo ? (e) => { const v = e.currentTarget.querySelector("video"); if (v) { v.pause(); v.currentTime = 0; } } : undefined}>
                          <div className="av-lib-img" style={{ background: p.grad }}>
                            {p.cover ? <img src={p.cover} alt={p.name} className="av-lib-img-el" /> : <span className="av-lib-emoji">{p.emoji}</span>}
                            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                            {p.demo && <video className="av-lib-demo" src={p.demo} muted loop playsInline preload="metadata" />}
                          </div>
                          <span className="av-lib-tag">{p.name} · {p.role}</span>
                          {sel && <span className="av-lib-check">✓</span>}
                          {p.cover && <span className="av-zoom-btn" title="查看完整图片" onClick={(e) => { e.stopPropagation(); setPreviewImg(p.cover); }}>⤢</span>}
                          <div className="av-card-more">
                            <button className="av-card-more-btn" title="更多" onClick={(e) => e.stopPropagation()}>⋯</button>
                            <div className="av-card-more-pop">
                              <button className="av-card-more-item" onClick={(e) => { e.stopPropagation(); openEditPreset(p); }}>✎ 编辑背景</button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="av-lib-grid">
                  <div className="av-lib-card av-lib-create av-create-wrap">
                    <div className="av-create-face">
                      <span className="av-lib-plus">＋</span>
                      <span className="av-lib-create-tip">创建我的形象</span>
                    </div>
                    <div className="av-create-menu">
                      <button className="av-create-item" onClick={() => setAgOpen(true)}>AI 生图</button>
                      <button className="av-create-item" onClick={() => imgFileRef.current?.click()}>本地上传</button>
                      <button className="av-create-item" onClick={() => { setRepoTarget("avatar"); setRepoOpen(true); }}>从仓库选择</button>
                    </div>
                  </div>
                  {myAvatars.map((ma) => {
                    const sel = customImg === ma.img;
                    return (
                      <div key={ma.id} className={`av-lib-card${sel ? " av-lib-card--sel" : ""}`} title={ma.name}>
                        <div className="av-lib-img"><img src={ma.img} alt={ma.name} className="av-lib-img-el" /></div>
                        <span className="av-lib-tag">{ma.name}</span>
                        {sel && <span className="av-lib-check">✓</span>}
                        <div className="av-card-more">
                          <button className="av-card-more-btn" title="更多" onClick={(e) => e.stopPropagation()}>⋯</button>
                          <div className="av-card-more-pop">
                            <button className="av-card-more-item" onClick={(e) => { e.stopPropagation(); openEditAvatar(ma); }}>✎ 编辑</button>
                            <button className="av-card-more-item av-card-more-del" onClick={(e) => { e.stopPropagation(); deleteMyAvatar(ma.id); }}>🗑 删除</button>
                          </div>
                        </div>
                        <span className="av-zoom-btn" title="查看完整图片" onClick={(e) => { e.stopPropagation(); setPreviewImg(ma.img); }}>⤢</span>
                        <div className="av-lib-hover">
                          <button className="av-lib-use" onClick={() => { selectMyAvatar(ma); setLibOpen(false); }}>使用</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ 背景库弹窗（官方场景 / 上传场景，农旅相关筛选）══ */}
      {bgOpen && (
        <div className="av-modal-mask av-modal-mask--top" onClick={() => setBgOpen(false)}>
          <div className="av-modal av-lib-modal" onClick={(e) => e.stopPropagation()}>
            <div className="av-modal-hd">
              <span className="av-modal-title">背景库</span>
              <button className="av-side-close" onClick={() => setBgOpen(false)}>✕</button>
            </div>
            <div className="av-modal-body">
              <div className="av-lib-tabs">
                <button className={`av-lib-tab${bgTab === "official" ? " av-lib-tab--on" : ""}`} onClick={() => setBgTab("official")}>官方场景</button>
                <button className={`av-lib-tab${bgTab === "upload" ? " av-lib-tab--on" : ""}`} onClick={() => setBgTab("upload")}>上传场景</button>
              </div>
              {bgTab === "official" ? (
                <>
                  <div className="av-filters">
                    {BG_CATS.map((c) => (
                      <button key={c} className={`av-filter-btn${bgCat === c ? " av-filter-btn--on" : ""}`} onClick={() => setBgCat(c)}>{c}</button>
                    ))}
                  </div>
                  <div className="av-lib-grid">
                    {filteredBgs.map((b) => {
                      const sel = selectedBg?.id === b.id && !customBg;
                      return (
                        <div key={b.id} className={`av-lib-card${sel ? " av-lib-card--sel" : ""}`} title={`${b.name} · ${b.category}`}>
                          <div className="av-lib-img" style={{ background: b.color }}>
                            {b.thumb ? <img src={b.thumb} alt={b.name} className="av-lib-img-el" /> : null}
                          </div>
                          <span className="av-lib-tag">{b.name} · {b.category}</span>
                          {sel && <span className="av-lib-check">✓</span>}
                          {b.dyn && <span className="av-dyn-badge" title="预置动态背景">动态</span>}
                          {b.thumb && <span className="av-zoom-btn" title="查看完整图片" onClick={(e) => { e.stopPropagation(); setPreviewImg(b.thumb); }}>⤢</span>}
                          <div className="av-lib-hover">
                            <button className="av-lib-use" onClick={() => useBgPreset(b)}>使用</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="av-lib-grid">
                  <div className="av-lib-card av-lib-create av-create-wrap">
                    <div className="av-create-face">
                      <span className="av-lib-plus">＋</span>
                      <span className="av-lib-create-tip">上传场景</span>
                    </div>
                    <div className="av-create-menu">
                      <button className="av-create-item" onClick={() => setBgAgOpen(true)}>AI 生成</button>
                      <button className="av-create-item" onClick={() => bgFileRef.current?.click()}>上传图片</button>
                      <button className="av-create-item" onClick={() => bgVideoFileRef.current?.click()}>上传视频</button>
                      <button className="av-create-item" onClick={() => { setRepoTarget("bg"); setRepoOpen(true); }}>从仓库选择</button>
                    </div>
                  </div>
                  {myBgs.map((mb) => {
                    const sel = customBg?.img === mb.img;
                    return (
                      <div key={mb.id} className={`av-lib-card${sel ? " av-lib-card--sel" : ""}`} title={mb.name}>
                        <div className="av-lib-img"><img src={mb.img} alt={mb.name} className="av-lib-img-el" /></div>
                        <span className="av-lib-tag">{mb.name}</span>
                        {sel && <span className="av-lib-check">✓</span>}
                        {mb.dynUrl && <span className="av-dyn-badge" title="已生成动态背景">动态</span>}
                        <div className="av-card-more">
                          <button className="av-card-more-btn" title="更多" onClick={(e) => e.stopPropagation()}>⋯</button>
                          <div className="av-card-more-pop">
                            <button className="av-card-more-item" onClick={(e) => { e.stopPropagation(); openEditBg(mb); }}>✎ 编辑</button>
                            <button className="av-card-more-item av-card-more-del" onClick={(e) => { e.stopPropagation(); deleteMyBg(mb.id); }}>🗑 删除</button>
                          </div>
                        </div>
                        <span className="av-zoom-btn" title="查看完整图片" onClick={(e) => { e.stopPropagation(); setPreviewImg(mb.img); }}>⤢</span>
                        <div className="av-lib-hover">
                          <button className="av-lib-use" onClick={() => useMyBg(mb)}>使用</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ 声音设置弹窗（参考制作大片：语速/音量/语调/情感 + 音色选择）══ */}
      {voiceSettingsOpen && (
        <div className="vs-mask" onClick={() => setVoiceSettingsOpen(false)}>
          <div className="vs-panel" onClick={(e) => e.stopPropagation()}>
            <div className="vs-head">
              <b>声音设置</b>
              <button className="vs-x" aria-label="关闭" onClick={() => setVoiceSettingsOpen(false)}>✕</button>
            </div>
            <div className="vs-top">
              <span className="vs-avatar">
                {avatarImg ? <img src={avatarImg} alt={avatarLabel} /> : <Icon name="image" size={20} />}
              </span>
              <span className="vs-name">{avatarLabel || "数字人"}</span>
              <span className={`vs-voice${selectedVoice ? " on" : ""}`}>{voiceLabel}</span>
              <button className="vs-pick" onClick={() => setVoiceOpen(true)}>音色选择 ›</button>
            </div>

            <div className="vs-row">
              <span className="vs-lbl">语速</span>
              <input className="vs-range" type="range" min={0.5} max={2} step={0.1} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
              <span className="vs-val">{speed.toFixed(1)}x</span>
            </div>
            <div className="vs-row">
              <span className="vs-lbl">音量</span>
              <input className="vs-range" type="range" min={1} max={10} step={1} value={volume} onChange={(e) => setVolume(Number(e.target.value))} />
              <span className="vs-val">{volume}</span>
            </div>
            <div className="vs-row">
              <span className="vs-lbl">语调</span>
              <input className="vs-range" type="range" min={0.5} max={2} step={0.1} value={pitch} onChange={(e) => setPitch(Number(e.target.value))} />
              <span className="vs-val">{pitch.toFixed(1)}x</span>
            </div>
            <div className="vs-row vs-row-emotion">
              <span className="vs-lbl">情感</span>
              {selectedVoice?.multiEmotion ? (
                <div className="vs-emotions">
                  {VOICE_EMOTIONS.map((em) => (
                    <span key={em} className={emotion === em ? "vs-emo on" : "vs-emo"} onClick={() => setEmotion(em)}>{em}</span>
                  ))}
                </div>
              ) : (
                <span className="vs-emo-lock">🔒 当前音色不支持多情感</span>
              )}
            </div>

            <div className="vs-acts">
              <button className="vs-preview" onClick={() => previewTts()}>▶ 试听</button>
              <button className="btn btn-primary vs-confirm" onClick={() => setVoiceSettingsOpen(false)}>确定选择</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ 音色选择弹窗（网格列表）══ */}
      {voiceOpen && (
        <div className="av-modal-mask av-voice-over" onClick={() => setVoiceOpen(false)}>
          <div className="av-modal av-voice-modal" onClick={(e) => e.stopPropagation()}>
            <div className="av-modal-hd">
              <span className="av-modal-title">音色选择</span>
              <button className="av-side-close" onClick={() => setVoiceOpen(false)}>✕</button>
            </div>
            <div className="av-modal-body av-voice-panel">
              <div className="vp-tabs av-vp-tabs">
                <button className={voiceTab === "system" ? "vp-tab on" : "vp-tab"} onClick={() => setVoiceTab("system")}>系统音色</button>
                <button className={voiceTab === "fav" ? "vp-tab on" : "vp-tab"} onClick={() => setVoiceTab("fav")}>收藏音色</button>
              </div>
              <div className="av-vp-filters">
                <select className="vp-sel" value={vScene} onChange={(e) => setVScene(e.target.value)}>
                  {VOICE_SCENES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select className="vp-sel" value={vAge} onChange={(e) => setVAge(e.target.value)}>
                  {VOICE_AGES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select className="vp-sel" value={vGender} onChange={(e) => setVGender(e.target.value)}>
                  {VOICE_GENDERS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <button className="vp-own" onClick={() => setCloneOpen(true)}>使用自己声音</button>
                <button className="vp-reset" onClick={resetVoiceFilters}>重置筛选</button>
              </div>
              <div className="av-vp-grid">
                {voiceTab === "system" && customVoices.map((cv) => {
                  const sel = selectedVoice?.id === cv.id;
                  return (
                    <div key={cv.id} className={`vp-item vp-item-own${sel ? " on" : ""}`} onClick={() => { setSelectedVoice(wrapCustom(cv)); setVoiceOpen(false); }}>
                      <button className="vp-play" title="试听" onClick={(e) => { e.stopPropagation(); void previewTts(wrapCustom(cv)); }}>▶</button>
                      <span className="vp-name">{cv.name}</span>
                      <span className="vp-badge vp-badge-own">我的</span>
                    </div>
                  );
                })}
                {filteredVoices.length === 0 && (voiceTab === "fav" || customVoices.length === 0) && (
                  <div className="vp-empty">{voiceTab === "fav" ? "还没有收藏的音色" : "没有符合筛选条件的音色"}</div>
                )}
                {filteredVoices.map((v) => {
                  const sel = selectedVoice?.id === v.id;
                  return (
                    <div key={v.id} className={`vp-item${sel ? " on" : ""}`} onClick={() => { setSelectedVoice(v); setVoiceOpen(false); }}>
                      <button className="vp-play" title="试听" onClick={(e) => { e.stopPropagation(); void previewTts(v); }}>▶</button>
                      <span className="vp-name">{v.name}</span>
                      {v.multiEmotion && <span className="vp-badge">多情感</span>}
                      <button className={`vp-fav${voiceFavs.includes(v.id) ? " on" : ""}`} title={voiceFavs.includes(v.id) ? "取消收藏" : "收藏"} onClick={(e) => { e.stopPropagation(); toggleVoiceFav(v.id); }}>{voiceFavs.includes(v.id) ? "★" : "☆"}</button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ 从仓库选择弹窗 ══ */}
      {repoOpen && (
        <div className="av-modal-mask" style={{ zIndex: 80 }} onClick={() => setRepoOpen(false)}>
          <div className="av-modal av-lib-modal" onClick={(e) => e.stopPropagation()}>
            <div className="av-modal-hd">
              <span className="av-modal-title">从仓库选择</span>
              <button className="av-side-close" onClick={() => setRepoOpen(false)}>✕</button>
            </div>
            <div className="av-modal-body">
              {repoImages.length === 0 ? (
                <div className="av-repo-empty">仓库暂无可用图片<br /><span>可先在「品牌设计 / 视频」生成并存入仓库</span></div>
              ) : (
                <div className="av-lib-grid">
                  {repoImages.map((a, i) => {
                    const sel = customImgName === a.name.replace(/\.[^.]+$/, "");
                    return (
                      <button key={`${a.img}-${i}`} className={`av-lib-card${sel ? " av-lib-card--sel" : ""}`} onClick={() => pickRepoImage(a)} title={a.name}>
                        <div className="av-lib-img"><img src={a.img} alt={a.name} className="av-lib-img-el" /></div>
                        <span className="av-lib-tag">{a.name}</span>
                        {sel && <span className="av-lib-check">✓</span>}
                        {a.img && <span className="av-zoom-btn" title="查看完整图片" onClick={(e) => { e.stopPropagation(); setPreviewImg(a.img!); }}>⤢</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ 声音复刻弹窗（与制作大片共用同一组件）══ */}
      {cloneOpen && (
        <VoiceCloneModal onClose={() => setCloneOpen(false)} onDone={onCloneDone} />
      )}

      {/* ══ AI 生图弹窗 ══ */}
      {agOpen && (
        <div className="av-modal-mask" onClick={() => !agBusy && setAgOpen(false)}>
          <div className="av-modal" onClick={(e) => e.stopPropagation()}>
            <div className="av-modal-hd">
              <span className="av-modal-title">AI 生图</span>
              <button className="av-side-close" onClick={() => !agBusy && setAgOpen(false)}>✕</button>
            </div>
            <div className="av-modal-body">
              <div className="av-modal-field">
                <div className="av-modal-lbl">性别</div>
                <div className="av-seg">
                  {["女", "男"].map((g) => (
                    <button key={g} className={`av-seg-btn${agGender === g ? " av-seg-btn--on" : ""}`} onClick={() => setAgGender(g)}>{g}</button>
                  ))}
                </div>
              </div>
              <div className="av-modal-field">
                <div className="av-modal-lbl">年龄</div>
                <div className="av-seg">
                  {["儿童", "青年", "老年"].map((a) => (
                    <button key={a} className={`av-seg-btn${agAge === a ? " av-seg-btn--on" : ""}`} onClick={() => setAgAge(a)}>{a}</button>
                  ))}
                </div>
              </div>
              <div className="av-modal-field">
                <div className="av-desc-wrap">
                  <textarea className="av-modal-desc" placeholder="请描述角色特征，如职业、发型、服饰、姿势、背景等" value={agDesc} onChange={(e) => setAgDesc(e.target.value)} />
                  <div className="av-desc-tools">
                    {agDesc.trim() && !agOptBusy && (
                      <button className="av-desc-btn" onClick={() => setAgDesc("")} title="清空描述">清空</button>
                    )}
                    <button className="av-desc-btn av-desc-btn--ai" onClick={optimizeAgDesc} disabled={agOptBusy} title="用 AI 优化角色描述">
                      {agOptBusy ? "优化中…" : "AI 优化"}
                    </button>
                  </div>
                </div>
                <div className="av-suggest-row">
                  <span className="av-suggest-lbl">推荐：</span>
                  {AG_SUGGEST.map((s) => (
                    <button key={s.label} className="av-suggest-chip" onClick={() => setAgDesc(s.desc)}>{s.label}</button>
                  ))}
                </div>
              </div>
              <div className="av-modal-field">
                <div className="av-modal-lbl">比例</div>
                <div className="av-ratio-row">
                  {AG_RATIOS.map((r) => (
                    <button key={r} className={`av-ratio${agRatio === r ? " av-ratio--on" : ""}`} onClick={() => setAgRatio(r)}>{r}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="av-modal-foot">
              <button className="btn btn-primary" disabled={agBusy} onClick={aiGenerate}>
                {agBusy ? "生成中…" : <>生成形象 <PointsCost amount={POINT_COST.imagePerShot} /></>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ AI 生成背景弹窗 ══ */}
      {bgAgOpen && (
        <div className="av-modal-mask" style={{ zIndex: 80 }} onClick={() => !bgAgBusy && setBgAgOpen(false)}>
          <div className="av-modal" onClick={(e) => e.stopPropagation()}>
            <div className="av-modal-hd">
              <span className="av-modal-title">AI 生成背景</span>
              <button className="av-side-close" onClick={() => !bgAgBusy && setBgAgOpen(false)}>✕</button>
            </div>
            <div className="av-modal-body">
              <div className="av-modal-field">
                <textarea className="av-modal-desc" placeholder="请描述背景场景，如：金色稻田、茶园梯田、古镇街巷、直播间…" value={bgAgDesc} onChange={(e) => setBgAgDesc(e.target.value)} />
                <div className="av-suggest-row">
                  <span className="av-suggest-lbl">推荐：</span>
                  {BG_AG_SUGGEST.map((s) => (
                    <button key={s.label} className="av-suggest-chip" onClick={() => setBgAgDesc(s.desc)}>{s.label}</button>
                  ))}
                </div>
              </div>
              <div className="av-modal-field">
                <div className="av-modal-lbl">比例</div>
                <div className="av-ratio-row">
                  {AG_RATIOS.map((r) => (
                    <button key={r} className={`av-ratio${bgAgRatio === r ? " av-ratio--on" : ""}`} onClick={() => setBgAgRatio(r)}>{r}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="av-modal-foot">
              <button className="btn btn-primary" disabled={bgAgBusy} onClick={aiGenerateBg}>
                {bgAgBusy ? "生成中…" : <>生成背景 <PointsCost amount={POINT_COST.imagePerShot} /></>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ 编辑场景弹窗（左场景图 | 右生成动态背景）══ */}
      {bgEditOpen && (
        <div className="av-modal-mask" onClick={() => setBgEditOpen(false)}>
          <div className="av-modal av-cr-modal" onClick={(e) => e.stopPropagation()}>
            <div className="av-modal-hd">
              <span className="av-modal-title">{bgEditId ? "编辑场景" : "创建我的场景"}</span>
              <button className="av-side-close" onClick={() => setBgEditOpen(false)}>✕</button>
            </div>
            <div className="av-modal-body">
              <div className="av-cr-top">
                {/* 左：场景图 */}
                <div className="av-cr-preview">
                  {bgEditImg ? (
                    <img src={bgEditImg} alt="场景" className="av-cr-img" />
                  ) : (
                    <div className="av-cr-empty">
                      <span>请上传一张背景场景图</span>
                      <button className="btn btn-secondary btn-sm" onClick={() => bgEditFileRef.current?.click()}>上传图片</button>
                    </div>
                  )}
                  {bgEditImg && <button className="av-cr-change" title="更换图片" onClick={() => bgEditFileRef.current?.click()}>更换</button>}
                  <input ref={bgEditFileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onBgEditUpload} />
                </div>
                {/* 右：生成动态背景 */}
                <div className="av-cr-cutout">
                  <div className="av-cutout-title">动态背景 {bgEditDyn && <span className="av-cutout-ok">✓ 已生成</span>}</div>
                  <div className="av-cutout-sub">把场景图生成轻微动态的背景视频，合成时叠在数字人身后</div>
                  <div className="av-cr-cutout-preview">
                    {bgEditDyn ? (
                      // eslint-disable-next-line jsx-a11y/media-has-caption
                      <video src={bgEditDyn} muted loop autoPlay playsInline />
                    ) : (
                      <span className="av-cr-cutout-ph">{bgEditImg ? "未生成动态背景" : "先上传/选择场景图"}</span>
                    )}
                  </div>
                  <button className="btn btn-soft btn-sm av-cr-cutout-btn" disabled={bgEditDynBusy || !bgEditImg} onClick={genBgDynEdit}>
                    {bgEditDynBusy
                      ? "生成中…（约2-3分钟）"
                      : <>
                          {bgEditDyn ? "重新生成动态背景" : "生成动态背景"}{" "}
                          <PointsCost amount={videoSecondsPoints(5, { model: "Seedance 1.5 Pro", quality: "720P", withAudio: false })} />
                        </>}
                  </button>
                </div>
              </div>
              <div className="av-modal-field">
                <div className="av-modal-lbl">动态方式描述</div>
                <input className="av-ai-input" placeholder="描述背景怎么动，如：微风吹过稻田、麦浪起伏；云雾在山间缓缓流动…（填了再点上方「生成动态背景」）" value={bgEditDynDesc} onChange={(e) => setBgEditDynDesc(e.target.value)} maxLength={60} />
              </div>
              <div className="av-modal-field">
                <div className="av-modal-lbl">场景昵称</div>
                <input className="av-ai-input" placeholder="给场景起个名字" value={bgEditName} onChange={(e) => setBgEditName(e.target.value)} maxLength={16} />
              </div>
            </div>
            <div className="av-modal-foot">
              <button className="btn btn-primary" onClick={saveBgEdit}>{bgEditId ? "保存修改" : "保存场景"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ 创建 / 编辑我的形象弹窗 ══ */}
      {createOpen && (
        <div className="av-modal-mask" onClick={() => { setCreateOpen(false); setEditingId(null); setEditingPresetId(null); }}>
          <div className="av-modal av-cr-modal" onClick={(e) => e.stopPropagation()}>
            <div className="av-modal-hd">
              <span className="av-modal-title">{editingPresetId ? "编辑背景（官方形象）" : editingId ? "编辑我的形象" : "创建我的形象"}</span>
              <button className="av-side-close" onClick={() => { setCreateOpen(false); setEditingId(null); setEditingPresetId(null); }}>✕</button>
            </div>
            <div className="av-modal-body av-edit3">
              <input ref={createFileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onCreateUpload} />
              {!editingPresetId && (
                <div className="av-edit3-name">
                  <input className="av-ai-input" placeholder="形象昵称" value={cName} onChange={(e) => setCName(e.target.value)} maxLength={16} />
                  {cImg && <button className="btn btn-soft btn-sm" onClick={() => createFileRef.current?.click()}>更换照片</button>}
                </div>
              )}
              {!cImg ? (
                <div className="av-cr-empty av-edit3-empty">
                  <span>请上传一张清晰面部图</span>
                  <button className="btn btn-secondary btn-sm" onClick={() => createFileRef.current?.click()}>上传照片</button>
                </div>
              ) : (
                <div className="av-edit3-cols">
                  {/* 左：背景选择 */}
                  <div className="av-edit3-left">
                    <div className="av-edit3-lhd">背景选择</div>
                    <div className="av-edit2-sub">
                      {([["image", "图片"], ["video", "视频"], ["custom", "自定义"]] as const).map(([s, label]) => (
                        <button key={s} className={`av-edit2-subtab${cBgSub === s ? " on" : ""}`} onClick={() => setCBgSub(s)}>{label}</button>
                      ))}
                    </div>
                    {cBgSub === "image" && (
                      <div className="chip-row av-edit2-cats">
                        {(["全部", ...AVATAR_BG_CATEGORIES] as const).map((c) => (
                          <span key={c} className={`sel-chip${cBgCat2 === c ? " on" : ""}`} onClick={() => setCBgCat2(c)}>{c}</span>
                        ))}
                      </div>
                    )}
                    <div className="av-edit3-gridwrap">
                    <div className="av-edit2-grid av-edit3-grid">
                      <div className={`av-edit2-cell av-edit2-none${!cBg ? " on" : ""}`} onClick={() => setCBg(null)}>原图<br />背景</div>
                      {cBgSub === "custom" && (
                        <div className="av-edit3-create">
                          <button className="av-edit3-create-item" onClick={() => setBgAgOpen(true)}>AI 生成</button>
                          <button className="av-edit3-create-item" onClick={() => cBgUploadRef.current?.click()}>本地上传</button>
                          <button className="av-edit3-create-item" onClick={() => { setRepoTarget("bg"); setRepoOpen(true); }}>仓库</button>
                        </div>
                      )}
                      {cBgList.map((b, i) => (
                        <div key={i} className={`av-edit2-cell${cBg?.img === b.img ? " on" : ""}`} title={b.name}
                          onClick={() => { setMatteStarted(true); setCBg({ img: b.img, name: b.name, dyn: b.dyn, personScale: cBg?.personScale ?? 1, personX: cBg?.personX ?? 0, personY: cBg?.personY ?? 0 }); }}>
                          <img src={b.img} alt={b.name} />
                          {b.dyn && <span className="av-edit2-vbadge">视频</span>}
                        </div>
                      ))}
                      <input ref={cBgUploadRef} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" hidden onChange={onCEditBgUpload} />
                    </div>
                    </div>
                  </div>
                  {/* 右：原图（不自动抠）→ 点「开始抠图」或选背景后跑扫描抠图 → 进入位置调整编辑器 */}
                  <div className="av-edit3-right">
                    <input ref={composeFile2Ref} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onComposeUpload2} />
                    {composeMode ? (
                      // 图片合成：图1（原图）+ 图2（上传参考图）+ 描述 → 合成为新原图
                      <div className="av-edit3-orig av-compose">
                        <div className="av-compose-imgs">
                          <div className="av-compose-cell">
                            <img src={cImg} alt="图1 原图" />
                            <span className="av-compose-tag">图1（原图）</span>
                          </div>
                          <div className="av-compose-plus">+</div>
                          {composeImg2 ? (
                            <div className="av-compose-cell">
                              <img src={composeImg2} alt="图2 参考图" />
                              <span className="av-compose-tag">图2（参考图）</span>
                              <button className="av-compose-del" title="移除图2" onClick={() => setComposeImg2(null)}>✕</button>
                            </div>
                          ) : (
                            <button className="av-compose-cell av-compose-add" onClick={() => composeFile2Ref.current?.click()}>
                              <span className="av-compose-addico">＋</span>
                              <span>上传图2（可选）</span>
                            </button>
                          )}
                        </div>
                        <textarea className="av-ai-input av-compose-desc" rows={2}
                          placeholder="描述要如何改图，例如「把背景换成茶园」；若上传了图2，则如「把图2的茶杯放到图1人物手上」"
                          value={composeDesc} onChange={(e) => setComposeDesc(e.target.value)} maxLength={200} />
                        <div className="av-compose-acts">
                          <button className="btn btn-soft btn-sm" disabled={composeBusy} onClick={() => { setComposeMode(false); setComposeImg2(null); setComposeDesc(""); }}>返回</button>
                          <button className="btn btn-primary btn-sm" disabled={composeBusy} onClick={composeImages}>
                            {composeBusy
                              ? "生成中…"
                              : <>
                                  {composeImg2 ? "开始合成" : "开始生成"} <PointsCost amount={imageShotPoints()} />
                                </>}
                          </button>
                        </div>
                        <div className="av-single-tip" style={{ maxWidth: "none" }}>只填描述即可直接改图；上传图2则把图2的元素融合进图1。结果作为新的原图</div>
                      </div>
                    ) : cImg && matteStarted && !matteReady ? (
                      <MattingScan person={cImg} onDone={() => setMatteReady(true)} />
                    ) : cBg?.img && matteReady ? (
                      <BgEditor person={cImg} bg={{ img: cBg.img, dyn: cBg.dyn }} value={cBg} onChange={(patch) => setCBg({ ...cBg, ...patch })} />
                    ) : matteReady ? (
                      // 已抠图、未选背景 → 显示抠出的人像（透明棋盘格），从左侧选背景即合成
                      <div className="av-edit3-orig">
                        <CutoutPreview person={cImg} />
                        <div className="av-single-tip" style={{ maxWidth: "none" }}>已抠出人像（透明底）—— 从左侧选一个背景即可合成换背景；抠不干净可点「重新抠图」或换真人照片</div>
                        <button className="btn btn-soft btn-sm" onClick={() => { if (cImg) _matteCache.delete(cImg); setMatteReady(false); setMatteStarted(false); }}>重新抠图 / 用原图</button>
                      </div>
                    ) : (
                      // 未抠图 → 原图 + 开始抠图 / 图片合成 按钮
                      <div className="av-edit3-orig">
                        <CompositePreview person={cImg} bg={null} />
                        <div className="av-compose-btns">
                          <button className="btn btn-primary" onClick={() => setMatteStarted(true)}>开始抠图</button>
                          <button className="btn btn-secondary" onClick={() => setComposeMode(true)}>商品图合成</button>
                        </div>
                        <div className="av-single-tip" style={{ maxWidth: "none" }}>点「开始抠图」去除背景，或从左侧选背景自动换背景；「商品图合成」可把另一张图的元素融合进原图</div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="av-modal-foot">
              <button className="btn btn-primary" onClick={saveMyAvatar}>{editingPresetId ? "去使用" : editingId ? "保存修改" : "保存形象"}</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
