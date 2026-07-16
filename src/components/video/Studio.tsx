"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type PointerEvent as RPointerEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { initStudioSession, useSessionField, getStudioSnapshot } from "@/lib/studioSession";
import { segmentSensitive, findSensitiveWords } from "@/lib/sensitiveWords";
import { getProject, upsertProject } from "@/lib/studioProjects";
import { getCachedVideo, putCachedVideo } from "@/lib/videoCache";
import { makeZip } from "@/lib/zip";
import { parseScriptFile } from "@/lib/docParse";
import { appConfirm } from "@/components/ui/Confirm";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { EditorRail, type RailItem } from "@/components/ui/EditorRail";
import { useToast } from "@/components/ui/Toast";
import {
  studioSteps,
  studioCameras,
  studioShotSizes,
  videoRatios,
  videoStyles,
  videoQualities,
  videoModels,
  SETTING_FIELDS,
} from "@/data/video";
import { useLibrary } from "@/lib/store";
import { LibraryPicker } from "./LibraryPicker";
import { VOICES, VOICE_SCENES, VOICE_AGES, VOICE_GENDERS, VOICE_EMOTIONS, findVoice, type Voice } from "@/data/voices";
import { BGM_PRESETS, bgmUrl } from "@/data/bgm";
import { nowStamp } from "@/lib/datetime";
import type { IconName } from "@/data/icons";
import type { AssetCard } from "@/lib/types";
import {
  posterFor,
  ratioToCanvas,
  drawKenBurns,
  drawVideoFrame,
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
  caption: string; // 字幕（可独立编辑，可从画面描述引号台词自动提取）
  voiceScript?: string; // AI 分配说话人后的「角色名：台词」分行文本，仅供多说话人配音用（不污染字幕）
  camera: string; // 运镜
  shotSize: string; // 景别：远/全/中/近/特
  assetRefs: string[]; // 出镜元素引用（关联场景角色道具，跨镜一致性）
  dur: number; // 秒
  locked: boolean; // 锁定：重新拆分镜时保留
  poster: string;
  status: "idle" | "gen" | "done" | "failed";
  pct: number;
  failReason?: string; // 失败原因（已映射为中文）
  videoUrl?: string; // 真实生成的视频片段 URL（/api/video 返回）
  genElemSig?: string; // 生成该视频时的「出镜元素指纹」；之后元素增删/换参考图 → 与当前指纹不符即提示重新生成
  degraded?: boolean; // 本镜因输入图被审核拦而降级生成（可能失去参考锁定；首帧仍保留、衔接不受影响）
  degradeReason?: string; // 降级的具体原因（审核敏感 / 参考图地址读取失败等），显示在角标 tooltip
  firstFrame?: string; // 首尾帧模式：首帧图（base64/URL）
  lastFrame?: string; // 首尾帧模式：尾帧图
  transition?: TransType; // 进入本镜的转场（与上一镜之间），默认「无」不破坏无缝衔接。首镜忽略
}

// 镜头间转场类型（默认无 = 保持尾帧无缝衔接）。black=黑场淡入淡出，white=白闪
type TransType = "none" | "black" | "white";
const TRANS_DUR = 0.45; // 转场时长（秒）
const transColor = (t?: TransType): string | null => (t === "black" ? "#000" : t === "white" ? "#fff" : null);

// 时间轴字幕：全片级独立对象，一句话一段，可在时间轴上自由拖动位置、拖两端边缘调时长。
// 与分镜解耦——start/dur 是「整片时间轴」上的秒数，不受分镜边界限制。
interface Subtitle {
  id: string;
  text: string;
  start: number; // 整片时间轴起始（秒）
  dur: number; // 时长（秒）
}

// 把一段字幕文本按句（。！？；\n 及中英标点）拆成多句，去掉空句
function splitSentences(text: string): string[] {
  return (text || "")
    .split(/(?<=[。！？!?；;\n])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// 从各分镜的 caption 自动生成时间轴字幕：每镜台词按句拆分，时间在该镜 [before, before+dur] 内均分。
function buildSubtitlesFromShots(shots: Shot[]): Subtitle[] {
  const out: Subtitle[] = [];
  let acc = 0;
  shots.forEach((s, si) => {
    const start = acc;
    acc += s.dur;
    const sentences = splitSentences(s.caption);
    if (!sentences.length) return;
    const each = s.dur / sentences.length;
    sentences.forEach((text, i) => {
      out.push({ id: `sub-${si}-${i}-${start}`, text, start: +(start + i * each).toFixed(2), dur: +each.toFixed(2) });
    });
  });
  return out;
}

// 生成模式：文本生成（纯文生，无图）/ 智能多帧（每镜一张图）/ 首尾帧（首、尾帧链式）
type GenMode = "text" | "smart" | "keyframe";

// 角色音色配置：由「声音设置」弹窗产出，整体存入 Asset.voice（onChange 整体替换）
interface AssetVoice {
  id: string; // 关联 data/voices.ts 的音色 id
  name: string; // 展示名（清甜元气…）
  rate: number; // 语速 0.5–2.0
  volume: number; // 音量 1–10
  pitch: number; // 语调 0.5–2.0
  emotion?: string; // 情感（仅多情感音色）
}

interface Asset {
  id: string;
  emoji: string;
  name: string;
  kind: "场景" | "角色" | "道具";
  refImg?: string; // 参考图（一致性锚点），生成时注入
  voice?: AssetVoice; // 仅角色：配音音色（可选）
}

const ASSET_KINDS: Asset["kind"][] = ["角色", "场景", "道具"];

const CAMERAS = [...studioCameras];
const SHOT_SIZES = [...studioShotSizes];

// 本地兜底扩写：真实模型不可用时，给用户描述补上专业镜头/光影/质感细节（约 300 字）
function localExpand(base: string, style?: string, prevContext?: string): string {
  const clean = base.replace(/[。.！!？?\s]+$/, "");
  const styleHint = style && style !== "智能匹配" ? `以${style}的视觉基调，` : "";
  const trans = prevContext ? `自然承接上一镜画面、延续整段叙事，` : "";
  // 把原句「嵌入」到一段完整的场景改写里（作为画面核心动作），而非在原句后拼接固定话术。
  return (
    `${trans}${styleHint}画面聚焦于${clean}——这一动作作为镜头核心主体徐徐展开，环境层次分明、细节真实自然。` +
    `低机位缓缓推近开场，继而转入环绕跟拍与横移平移，运镜舒缓流畅、富有节奏。` +
    `黄金时段暖色侧逆光穿透，光影柔和细腻、明暗过渡自然；浅景深虚化前后景，凸显主体质感与纹理，构图讲究、主次分明。` +
    `慢速升格叠加通透饱满的色彩，兼具写实质感与电影氛围，整体情绪真挚温暖、张弛有度，传递出鲜活而富有感染力的现场气息。`
  );
}

// AI 扩写：把用户写的画面内容「整体改写」为更专业的完整描述（补镜头运动/光影氛围/画面质感，约 300 字），
// 传入上一镜内容做叙事衔接。复用一句话成片的 /api/video-prompt 路由。
// LLM 偶发超时/抖动会让扩写回退到本地模板（观感像“原句后追加”），故重试至多 3 次，尽量走真实改写。
async function optimizeShotPrompt(input: string, style?: string, prevContext?: string): Promise<string | null> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch("/api/video-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, style, targetChars: 300, prevContext }),
        signal: AbortSignal.timeout(30_000),
      });
      if (r.ok) {
        const { text } = (await r.json()) as { text?: string | null };
        if (text && text.trim()) return text.trim();
      }
    } catch {
      /* 超时/网络抖动 → 重试 */
    }
    if (attempt < 3) await new Promise((res) => setTimeout(res, 600 * attempt));
  }
  return null;
}

// 从画面描述里提取「台词」——引号（中文 ""『』「」 / 英文 ""）内的说话内容，用于自动填入字幕。
function extractDialogue(text: string): string {
  if (!text) return "";
  const matches = text.match(/[“"「『][^”"」』]*[”"」』]/g) || [];
  return matches
    .map((m) => m.slice(1, -1).trim())
    .filter(Boolean)
    .join(" ");
}

// 制作大片逐镜真实生成使用的视频模型（seedance-2.0 系列均有可用通道；默认 doubao 无通道）
const STUDIO_VIDEO_MODEL = "seedance-2.0-mini"; // Direct 分组可用的兜底模型（旧项目存了已下线的名称时回退到它）

// 用户在「视频设定」选择的模型名 → 发给 API 的实际模型 ID；未命中时回退到默认可用模型
function modelIdOf(name?: string): string {
  return videoModels.find((m) => m.name === name)?.modelId ?? STUDIO_VIDEO_MODEL;
}

// 支持「首帧 + 参考图」同时使用的模型 ID（可在首帧承接基础上叠加参考图锁脸）。
// Seedance 系列均不支持混用（同时传会被网关拒「first/last frame content cannot be mixed」→降级丢参考图），故默认空集；
// 未来接入支持二者叠加的视频模型时，把其 modelId 登记到这里，即可自动在首帧承接之上叠加参考图锁脸。
const MODELS_FRAME_PLUS_REF = new Set<string>([]);
function modelSupportsFrameAndRef(name?: string): boolean {
  return MODELS_FRAME_PLUS_REF.has(modelIdOf(name));
}

// 生成参考图（生图 / 改图）可选的图片模型：name 展示，modelId 发给 /api/image。
// 首项「自动匹配」modelId 为空 → 不传 model，沿用后端 IMAGE_MODEL 默认（保证与其它出图一致、不误传无效 id）。
const STUDIO_IMAGE_MODELS: { name: string; modelId: string; desc: string }[] = [
  { name: "自动匹配", modelId: "", desc: "跟随平台默认模型（推荐）" },
  { name: "Seedream 4.5", modelId: "seedream-4.5", desc: "细节增强 · 商业级" },
  { name: "Seedream 4.0", modelId: "seedream-4.0", desc: "高细节 · 商业级" },
  { name: "Qwen-Image", modelId: "qwen-image", desc: "中文语义理解强" },
  { name: "Z-Image", modelId: "z-image", desc: "真实感增强" },
];

// ② 生成设置：每类元素的生图清晰度 + 一键生成用的生图模型（存于保留键 __model）
type AssetGenSetting = { size?: string; model?: string };
const ASSET_GEN_MODEL_KEY = "__model"; // genSettings 里存生图模型名的保留键（不参与三类清晰度渲染）
const GEN_IMG_HINT_KEY = "mofun.studio.genImgHintSeen"; // 「一键生成全部图片」首次提示去生成设置的标记
// 一键生成图片的取消控制放模块级：生成是「会话级持续」的，切步骤/页面后 Studio 会重挂载成新实例，
// 若取消标志是实例级 ref，新实例点停止会作用不到还在跑的旧循环。模块级 → 跨实例共享，停得掉。
const genImgCancelRef = { current: false };
const genImgAborts = new Set<AbortController>(); // 在飞的生成请求，停止时全部 abort（立即停）

// 后端错误码 / 文案 → 中文提示
function mapVideoErr(error: unknown, status: number): string {
  const raw = (typeof error === "string" ? error : error && typeof error === "object" && "message" in error ? String((error as { message?: unknown }).message) : "").toLowerCase();
  if (status === 504 || raw.includes("timeout")) return "生成超时（视频耗时过长），请重试";
  // Seedance 2.0 硬限制：真人首帧被隐私审核拦 / 首帧与参考图不能混用（衔接真人镜头的常见失败）
  if (raw.includes("real person") || raw.includes("privacy") || raw.includes("人像")) return "首帧图里含真人，被模型隐私审核拦截（Seedance 不接受真人首帧图）。已自动尝试改用「参考图模式」生成——若仍失败，点重试，或把这一镜做成不含正脸真人的画面";
  if (raw.includes("cannot be mixed") || raw.includes("first/last frame")) return "首帧与参考图不能同时使用（Seedance 限制）。已自动改用其一重试，请点重试";
  // 审核类：尽量区分是「输入图片」还是「文字」被判敏感，避免用户只改文字却改不掉图片的问题
  const sensitive = raw.includes("content") || raw.includes("safety") || raw.includes("policy") || raw.includes("审核") || raw.includes("sensitive");
  if (sensitive) {
    if (raw.includes("image") || raw.includes("图")) return "输入图片未通过审核：某个元素参考图被判敏感（常见：斧头/刀具等被误判为「武器」，或某张图触发审核）。改文字无效——去③取消本镜绑定该元素后重试";
    if (raw.includes("text") || raw.includes("prompt") || raw.includes("文")) return "画面描述文字未通过审核，请修改文字（点「去改写」）";
    return "内容未通过审核：可能是文字，也可能是输入图片（人物/元素参考图、上一镜尾帧）。若改文字无效，多为图片被判敏感";
  }
  if (raw.includes("channel") || raw.includes("unavailable") || raw.includes("no available")) return "模型暂时不可用，请稍后重试";
  if (status === 429 || raw.includes("quota") || raw.includes("rate")) return "生成频率过高或额度不足，请稍后重试";
  return "生成失败，请重试（额度已退还）";
}
const ASSET_EMOJIS = ["🏞️", "👩‍🌾", "🍵", "🌾", "🏮", "🎐", "🛶", "🍂"];

// 读取「新建大片」对话框暂存的视频设定（读后清除，仅新建项目时用；SSR / 隐私模式无 sessionStorage 时回退空）
function readNewSettingsDraft(): Record<string, string> {
  try {
    const raw = sessionStorage.getItem("mofun.studio.newSettings");
    if (raw) {
      sessionStorage.removeItem("mofun.studio.newSettings");
      return JSON.parse(raw) as Record<string, string>;
    }
  } catch {
    /* 无 sessionStorage，用默认设定 */
  }
  return {};
}

// 视频设定字段 SETTING_FIELDS 已移至 @/data/video（与「新建大片」对话框共享）

// 剧本 → 结构化分镜数据
// 拆分镜：按「目标镜头数」把剧本切成 n 个镜头，总时长平均分配到每镜。
// targetShots 省略时按句子数（上限 6）自动定；否则严格产出 n 个镜头。
// 把剧本拆成「镜头段落」：优先按「镜头N：」标记拆，否则按空行分段。每段 = 一整条镜头。
function splitShotBlocks(script: string): string[] {
  const t = (script || "").trim();
  if (!t) return [];
  if (/镜头\s*\d+\s*[:：]/.test(t)) {
    return t
      .split(/(?=镜头\s*\d+\s*[:：])/)
      .map((s) => s.replace(/^镜头\s*\d+\s*[:：]\s*/, "").trim())
      .filter(Boolean);
  }
  return t.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
}

// 删除剧本文本里第 idx 段镜头（与 splitShotBlocks 的分段口径一致），用于「删镜头时连带删剧本对应段落」。
// 「镜头N：」格式：删该段后重新按顺序编号；普通空行分段：删该段后用空行重拼。段索引越界则原样返回。
function removeScriptBlock(script: string, idx: number): string {
  const t = (script || "").trim();
  if (!t || idx < 0) return script;
  if (/镜头\s*\d+\s*[:：]/.test(t)) {
    const parts = t.split(/(?=镜头\s*\d+\s*[:：])/).map((s) => s.trim()).filter(Boolean);
    if (idx >= parts.length) return script;
    parts.splice(idx, 1);
    return parts
      .map((p, i) => `镜头${i + 1}：${p.replace(/^镜头\s*\d+\s*[:：]\s*/, "").trim()}`)
      .join("\n");
  }
  const blocks = t.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  if (idx >= blocks.length) return script;
  blocks.splice(idx, 1);
  return blocks.join("\n\n");
}

// 解析一段镜头文本为「画面 / 字幕(口播words) / voiceScript(带说话人前缀，供配音路由)」。
// 有【画面】/【旁白】/【对白】结构标签时按结构拆；否则退回：整段为画面、引号内台词为字幕。
// 旁白/对白缺失（或写了「无」）则不产出对应内容——不凭空编造。
function parseShotParts(text: string): { desc: string; caption: string; voiceScript: string } {
  if (/【\s*画面\s*】/.test(text)) {
    const grab = (label: string) => {
      const m = text.match(new RegExp(`【\\s*${label}\\s*】\\s*([\\s\\S]*?)(?=【\\s*(?:画面|旁白|对白)\\s*】|$)`));
      return m ? m[1].trim() : "";
    };
    const isEmpty = (s: string) => !s || /^（?\s*无\s*）?$/.test(s);
    const desc = grab("画面");
    const nar = grab("旁白").replace(/\n+/g, " ").trim();
    const dia = grab("对白").trim();
    const stripCue = (s: string) => s.replace(/[（(][^）)]{0,20}[）)]/g, "").trim(); // 去掉（低声）等舞台提示，免得被 TTS 读出来
    const cap: string[] = [];
    const vs: string[] = [];
    const narClean = stripCue(nar);
    if (!isEmpty(narClean)) { cap.push(narClean); vs.push(`旁白：${narClean}`); }
    if (!isEmpty(dia)) {
      for (const raw of dia.split(/\n+/).map((l) => l.trim()).filter(Boolean)) {
        const line = stripCue(raw);
        if (!line) continue;
        vs.push(line); // 「角色名：台词」（已去舞台提示），供配音按说话人路由
        const m = line.match(/^[^：:]{1,12}[：:]\s*(.+)$/);
        cap.push(m ? m[1].trim() : line); // 字幕去掉「角色名：」前缀，只留说的话
      }
    }
    return { desc: desc || text, caption: cap.join(" "), voiceScript: vs.join("\n") };
  }
  return { desc: text, caption: extractDialogue(text), voiceScript: "" };
}

// 自动撑高的文本框：默认高度=内容高度（全部文字都展示、不出滚动条）；仍保留 CSS 的 resize 手动放大缩小。
function AutoGrowTextarea({ className, value, placeholder, onChange }: {
  className?: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; }
  }, [value]);
  return (
    <textarea
      ref={ref}
      className={className}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function makeShots(script: string, total: number, targetShots?: number): Shot[] {
  // 剧本若本身是「多个镜头段落」，每段 = 一整条镜头（镜头数由内容决定，不按句子拆碎、不受 targetShots 限制）
  const blocks = splitShotBlocks(script);
  const useBlocks = blocks.length >= 2;
  let lines: string[];
  if (useBlocks) {
    lines = blocks;
  } else {
    const bySentence = script.split(/[。\n；;！!？?]+/).map((s) => s.trim()).filter(Boolean);
    lines = bySentence.length ? bySentence : script.split(/[，,]+/).map((s) => s.trim()).filter(Boolean);
    if (!lines.length) lines = ["开场画面"];
  }
  const L = lines.length;
  const n = useBlocks ? Math.max(1, Math.min(40, blocks.length)) : Math.max(1, Math.min(40, targetShots ?? Math.min(6, L)));
  // 把总时长精确分配到 n 个镜头：base 秒均分，余数派给前若干镜，使各镜时长之和恰等于总时长
  const base = Math.floor(total / n);
  const rem = total - base * n;
  return Array.from({ length: n }, (_, i) => {
    const dur = Math.max(4, Math.min(15, base + (i < rem ? 1 : 0)));
    // 段落模式：每段整条作为该镜画面；句子模式：句子≥镜头按比例合并，镜头>句子则一句一镜、多出留空
    const text = useBlocks
      ? lines[i] ?? ""
      : n <= L
        ? lines.slice(Math.floor((i * L) / n), Math.floor(((i + 1) * L) / n)).join("，")
        : i < L
          ? lines[i]
          : "";
    const parts = parseShotParts(text); // 拆出画面/字幕/说话人脚本（脚本无旁白对白则各为空，不编造）
    return {
      id: `shot-${i}-${text.length}-${text.charCodeAt(0) || 0}`,
      shotDesc: parts.desc, // 只放「画面」，干净地喂视频模型
      caption: parts.caption, // 字幕=旁白+对白的口播文字（去说话人前缀）；无则空
      voiceScript: parts.voiceScript || undefined, // 带「旁白：/角色：」前缀，供配音按说话人分配音色
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

// 空白镜头（增加镜头数时追加，内容留空由用户填写）
let blankSeq = 0;
function blankShot(i: number): Shot {
  blankSeq += 1;
  return {
    id: `shot-blank-${i}-${blankSeq}`,
    shotDesc: "",
    caption: "",
    camera: CAMERAS[i % CAMERAS.length],
    shotSize: SHOT_SIZES[i % SHOT_SIZES.length],
    assetRefs: [],
    locked: false,
    dur: 4,
    poster: posterFor("blank" + i + "-" + blankSeq),
    status: "idle",
    pct: 0,
  };
}

// 量音频时长（秒）：给定音频 URL，读元数据返回 duration；失败/无限返回 0。
function audioDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const a = new Audio();
    a.preload = "metadata";
    const done = (v: number) => { a.onloadedmetadata = null; a.onerror = null; resolve(v); };
    a.onloadedmetadata = () => done(Number.isFinite(a.duration) ? a.duration : 0);
    a.onerror = () => done(0);
    setTimeout(() => done(Number.isFinite(a.duration) ? a.duration : 0), 6000); // 兜底
    a.src = url;
  });
}

// 出镜元素重点排序：人物 > 场景 > 道具（角色最优先——显示靠前，且生成注入参考图时不被 4 张上限挤掉）
const KIND_ORDER: Record<string, number> = { 角色: 0, 场景: 1, 道具: 2 };
function sortRefsByKind(ids: string[], assets: Asset[]): string[] {
  const rank = (id: string) => KIND_ORDER[assets.find((x) => x.id === id)?.kind ?? ""] ?? 9;
  return [...ids].sort((a, b) => rank(a) - rank(b));
}
// 出镜元素指纹：绑定的元素 id + 各自参考图特征。元素增删、或某元素换了参考图，指纹就变。
function elemSig(assetRefs: string[], assets: Asset[]): string {
  return [...assetRefs]
    .map((id) => {
      const a = assets.find((x) => x.id === id);
      if (!a) return id;
      return `${a.id}:${a.refImg ? a.refImg.length + a.refImg.slice(-16) : "-"}`;
    })
    .sort()
    .join("|");
}

// AudioBuffer(单声道) → WAV Blob（16bit PCM）
function encodeWav(data: Float32Array, sr: number): Blob {
  const len = data.length;
  const ab = new ArrayBuffer(44 + len * 2);
  const dv = new DataView(ab);
  const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, "RIFF"); dv.setUint32(4, 36 + len * 2, true); ws(8, "WAVE"); ws(12, "fmt ");
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  ws(36, "data"); dv.setUint32(40, len * 2, true);
  let o = 44;
  for (let i = 0; i < len; i++) { const s = Math.max(-1, Math.min(1, data[i])); dv.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
  return new Blob([ab], { type: "audio/wav" });
}

// 把多段音频(ArrayBuffer[]) 解码拼接为单条 WAV（段间留 150ms 间隔）。用于一镜多说话人对话。
async function concatAudioToWav(parts: ArrayBuffer[]): Promise<Blob | null> {
  const Ctx = typeof window !== "undefined" ? (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
  if (!Ctx) return null;
  const ctx = new Ctx();
  try {
    const bufs: AudioBuffer[] = [];
    for (const p of parts) { try { bufs.push(await ctx.decodeAudioData(p.slice(0))); } catch { /* 跳过坏段 */ } }
    if (!bufs.length) return null;
    const sr = bufs[0].sampleRate;
    const gap = Math.round(sr * 0.15);
    const total = bufs.reduce((a, b) => a + b.length, 0) + gap * (bufs.length - 1);
    const out = new Float32Array(total);
    let off = 0;
    for (let i = 0; i < bufs.length; i++) { out.set(bufs[i].getChannelData(0), off); off += bufs[i].length + (i < bufs.length - 1 ? gap : 0); }
    return encodeWav(out, sr);
  } finally { void ctx.close(); }
}

// 把「每句配音 + 该句在镜内的起始偏移」混成一条镜头音轨（单声道 WAV）。
// 各句按 offset 定位放入；重叠部分直接相加（方案 B：允许略微交叠，不提速、不截断）。
async function mixDubToWav(segs: { buf: ArrayBuffer; offset: number }[], minDur: number): Promise<{ blob: Blob; dur: number } | null> {
  const Ctx = typeof window !== "undefined" ? (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
  if (!Ctx || !segs.length) return null;
  const ctx = new Ctx();
  try {
    const decoded: { data: Float32Array; sr: number; offset: number }[] = [];
    for (const s of segs) {
      try { const b = await ctx.decodeAudioData(s.buf.slice(0)); decoded.push({ data: b.getChannelData(0), sr: b.sampleRate, offset: s.offset }); } catch { /* 跳过坏段 */ }
    }
    if (!decoded.length) return null;
    const sr = decoded[0].sr;
    // 输出长度 = max(minDur, 各句结束点)；每句结束点 = offset + 句长
    let endSamples = Math.ceil(minDur * sr);
    for (const d of decoded) endSamples = Math.max(endSamples, Math.round(d.offset * sr) + d.data.length);
    const out = new Float32Array(endSamples);
    for (const d of decoded) {
      const start = Math.max(0, Math.round(d.offset * sr));
      for (let i = 0; i < d.data.length && start + i < out.length; i++) {
        let v = out[start + i] + d.data[i];
        if (v > 1) v = 1; else if (v < -1) v = -1; // 交叠相加后限幅防爆音
        out[start + i] = v;
      }
    }
    return { blob: encodeWav(out, sr), dur: endSamples / sr };
  } finally { void ctx.close(); }
}

// 任意音频 Blob（浏览器录音多为 webm/opus，或上传的 mp3/m4a）→ 单声道 WAV Blob。
// 火山声音复刻只收 wav/mp3/ogg/m4a/aac/pcm，不收 webm，故上传前统一解码重编码为 WAV。
async function blobToWav(blob: Blob): Promise<Blob | null> {
  const Ctx = typeof window !== "undefined" ? (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
  if (!Ctx) return null;
  const ctx = new Ctx();
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    return encodeWav(buf.getChannelData(0), buf.sampleRate);
  } catch {
    return null;
  } finally {
    void ctx.close();
  }
}

// 视频比例字符串 → CSS aspect-ratio（"智能"/无匹配默认 16:9）
function ratioToCss(ratio: string): string {
  const m = ratio.match(/(\d+)\s*[:：]\s*(\d+)/);
  const w = m ? Number(m[1]) : 16;
  const h = m ? Number(m[2]) : 9;
  return `${w} / ${h}`;
}

// 播放源：优先用已缓存到本地（IndexedDB）的 blobURL——命中则播放最快且不依赖外链；
// 未命中的外部直链经 /api/media 同源代理（带重试 + Range 转发）播放更稳。data:/blob:/同源地址原样返回。
function playableVideoSrc(url?: string, cache?: Record<string, string>): string | undefined {
  if (!url) return undefined;
  if (cache?.[url]) return cache[url];
  return /^https?:\/\//i.test(url) ? `/api/media?url=${encodeURIComponent(url)}` : url;
}

// 下载视频到本地：优先用本地缓存的 blob（外链过期也能下），未命中再经 /api/media 同源代理取回。
async function downloadVideo(videoUrl: string, filename: string) {
  try {
    let blob = /^https?:\/\//i.test(videoUrl) ? await getCachedVideo(videoUrl) : null;
    if (!blob) {
      const r = await fetch(`/api/media?url=${encodeURIComponent(videoUrl)}`);
      if (!r.ok) throw new Error("proxy fail");
      blob = await r.blob();
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch {
    window.open(videoUrl, "_blank"); // 兜底：新标签打开
  }
}

// 视频质量档位 → 传给生成模型的分辨率字符串。
// 模型（seedance-2.0-fast）上限为 1080p，2K/4K 兜底为 1080p 生成，避免网关拒绝导致失败。
function qualityToRes(q: string): string {
  if (q.includes("4K") || q.includes("2K") || q.includes("1080")) return "1080p";
  if (q.includes("480")) return "480p";
  return "720p";
}

// 视频质量档位 → 消耗额度倍数。实际输出最高 1080p，故 1080P/2K/4K 均按 ×2 计费（不虚高收费）。
function qualityMult(q: string): number {
  if (q.includes("4K") || q.includes("2K") || q.includes("1080")) return 2;
  return 1;
}

// 从脚本文案里识别用户提到的「视频设定」关键词，返回可自动填入的设定项（只含命中的字段）
function detectSettings(text: string): Record<string, string> {
  const t = text.toLowerCase();
  const has = (...ks: string[]) => ks.some((k) => t.includes(k.toLowerCase()));
  const out: Record<string, string> = {};

  // 视频比例
  if (has("9:16", "竖屏", "竖版", "抖音", "手机竖", "小红书")) out.视频比例 = "9:16";
  else if (has("21:9", "宽幅", "超宽", "电影宽")) out.视频比例 = "21:9";
  else if (has("1:1", "方形", "正方形")) out.视频比例 = "1:1";
  else if (has("3:4")) out.视频比例 = "3:4";
  else if (has("4:3")) out.视频比例 = "4:3";
  else if (has("16:9", "横屏", "横版", "宽屏")) out.视频比例 = "16:9";

  // 视频风格（对齐 videoStyles 名称）
  if (has("水墨", "国风", "古风")) out.视频风格 = "国风水墨";
  else if (has("航拍", "无人机")) out.视频风格 = "航拍大片";
  else if (has("电影感", "电影级", "电影质感", "电影画面")) out.视频风格 = "电影感";
  else if (has("治愈", "温暖", "温馨")) out.视频风格 = "温暖治愈";
  else if (has("纪录片")) out.视频风格 = "纪录片";
  else if (has("写实", "纪实", "真实自然")) out.视频风格 = "写实";

  // 视频质量
  if (has("4k", "超高清", "超清")) out.视频质量 = "4K";
  else if (has("2k")) out.视频质量 = "2K";
  else if (has("1080", "全高清")) out.视频质量 = "1080P";
  else if (has("720")) out.视频质量 = "720P";
  else if (has("480", "标清")) out.视频质量 = "480P";

  // 配音
  if (has("不配音", "无配音", "无旁白", "无解说", "不要配音")) out.配音 = "不配音";
  else if (has("活力")) out.配音 = "活力男声";
  else if (has("沉稳", "男声", "男生旁白")) out.配音 = "沉稳男声";
  else if (has("温柔", "女声", "女生旁白")) out.配音 = "温柔女声";

  // 配乐
  if (has("无音乐", "无背景音乐", "无配乐", "不要音乐")) out.配乐 = "无";
  else if (has("轻快")) out.配乐 = "轻快";
  else if (has("大气", "磅礴", "震撼")) out.配乐 = "大气";
  else if (has("国风音乐", "古风音乐")) out.配乐 = "国风";
  else if (has("舒缓", "轻柔")) out.配乐 = "舒缓";

  // 字幕
  if (has("无字幕", "隐藏字幕", "不要字幕", "不显示字幕", "不加字幕")) out.字幕 = "隐藏";
  else if (has("加字幕", "显示字幕", "需要字幕", "带字幕", "上字幕")) out.字幕 = "显示";

  return out;
}

// 把总时长精确分配到各镜（base 均分，余数派前若干镜），每镜 2–15s
function redistribute(list: Shot[], total: number): Shot[] {
  const n = list.length || 1;
  const base = Math.floor(total / n);
  const rem = total - base * n;
  return list.map((s, i) => ({ ...s, dur: Math.max(4, Math.min(15, base + (i < rem ? 1 : 0))) }));
}

export function Studio({
  initialStep = "script",
  initialName,
  initialPid,
  railItems,
  iconOf,
  onPickType,
  showBack = false,
  immersive = false,
}: {
  initialStep?: string;
  initialName?: string; // 显示名（新建时输入 / 打开项目时来自存档）
  initialPid?: string; // 项目唯一 id（新建每次不同，保证是新文件；重开传已有项目 id）
  railItems: RailItem[];
  iconOf: (k: string) => IconName;
  onPickType: (k: string) => void;
  showBack?: boolean; // 显示返回按钮（从生成历史 / 从首页进入）
  immersive?: boolean; // 全屏沉浸（隐藏全局顶栏）——仅从生成历史进入；从首页进入保留全局顶栏
}) {
  const router = useRouter();
  const toast = useToast();
  const { addWork, addMaterial } = useLibrary();
  const timers = useRef<number[]>([]);
  const genInFlight = useRef<Set<string>>(new Set()); // 正在生成的镜头 id（防同一镜重复启动进度定时器）
  const genAllRunning = useRef(false); // 批量生成进行中（防重入）
  // 仓库选择器：由「首尾帧选图 / 分镜视频调取视频」触发，选中项回调给发起方
  const [picker, setPicker] = useState<{ filter: "image" | "video"; onPick: (item: AssetCard) => void } | null>(null);
  const openLibraryPicker = (filter: "image" | "video", onPick: (item: AssetCard) => void) => setPicker({ filter, onPick });

  // 项目状态存到跨导航存活的会话单例：切到其他功能、Studio 卸载后仍保留，生成在后台继续。
  // projId 用项目名标识：同名 → 恢复；换项目 → 重置。工厂函数仅在重置时构建初始值。
  // 项目唯一 id 优先用 pid（新建每次唯一 → 必是新文件）；无 pid 时回退到名字/默认
  const projId = initialPid?.trim() || initialName?.trim() || "未命名项目";
  initStudioSession(projId, () => {
    // 打开已保存的项目 → 载入其分镜/设定；否则新建空白项目（显示名取输入名）。
    // 仅当保存的 state 含实际分镜（shots）才当作「重开」；「新建占位」记录（无 shots）走全新初始化。
    const saved = getProject(projId);
    if (saved?.state && Array.isArray((saved.state as { shots?: unknown }).shots)) return saved.state;
    return {
      projectName: initialName?.trim() || "未命名大片",
      stepKey: studioSteps.find((s) => s.key === initialStep)?.key ?? "script",
      script: "", // 新建项目从空开始 → 剧本编辑默认落在第一步「原始创意」，走三步向导

      settings: { 模型: "Seedance 2.0 Mini", 视频比例: "16:9", 视频风格: videoStyles[0].name, 视频质量: "480P", 配音: "温柔女声", 配乐: "舒缓", 字幕: "显示", 知识库: "使用", ...readNewSettingsDraft() },
      totalSec: 15, // 新建默认单镜拉满 15s（模型上限）
      targetShots: 1,
      assets: [] as Asset[], // 新建项目默认无元素 → 展示空态引导，由用户手动添加 / 自动生成
      shots: redistribute([blankShot(0)], 15),
      genMode: "text" as GenMode,
      subtitles: [] as Subtitle[],
    };
  });

  const [projectName, setProjectName] = useSessionField<string>("projectName");
  const [stepKey, setStepKey] = useSessionField<string>("stepKey");
  const [script, setScript] = useSessionField<string>("script");
  const [aiBusyId, setAiBusyId] = useState<string | null>(null);
  const [safeRewriteId, setSafeRewriteId] = useState<string | null>(null); // 正在「AI 改写重试」的镜头 id
  const [settings, setSettings] = useSessionField<Record<string, string>>("settings");
  const [editProjOpen, setEditProjOpen] = useState(false); // 「编辑项目」弹窗：修改视频预设（同新建大片）
  const [cachedVideos, setCachedVideos] = useState<Record<string, string>>({}); // 原始视频 URL → 本地缓存 blobURL
  const cachedVideosRef = useRef<Record<string, string>>({});
  // ⑤ 配音（方案B）：逐镜用角色音色把台词合成火山 TTS，shotId → 音频 blobURL；预览/导出用它替代视频原声。
  const [voiceTracks, setVoiceTracks] = useState<Record<string, string>>({});
  // 配音在时间轴上的偏移（秒，相对镜头起点，可拖动调整；正=延后播放）。shotId → 偏移
  const [voiceOffsets, setVoiceOffsets] = useSessionField<Record<string, number>>("voiceOffsets");
  const setVoiceOffset = (shotId: string, sec: number) => setVoiceOffsets((m) => ({ ...(m ?? {}), [shotId]: sec }));
  const [voiceDurs, setVoiceDurs] = useSessionField<Record<string, number>>("voiceDurs"); // 每镜配音实际时长（秒），时间轴按此画配音块宽度
  // 按字幕的配音元数据：subtitleId → { dur 该句配音时长, name 音色名 }。用于时间轴「每条字幕一个配音块」展示。
  const [voiceSegs, setVoiceSegs] = useSessionField<Record<string, { dur: number; name: string }>>("voiceSegs");
  const [audioMode, setAudioMode] = useSessionField<string>("audioMode"); // 声音来源：dub=火山配音 / original=视频自带原声
  const [synthBusy, setSynthBusy] = useState(false);
  const [dubConfigShot, setDubConfigShot] = useState<Shot | null>(null); // ⑤ 时间轴：正在为哪一镜「生成配音」弹「声音设置」
  const [bgmPickerOpen, setBgmPickerOpen] = useState(false); // ⑤ 时间轴「添加背景音乐」弹层（内置曲库+上传）
  const [speakerBusy, setSpeakerBusy] = useState(false); // AI 分配说话人进行中
  const [voiceMatchBusy, setVoiceMatchBusy] = useState(false); // AI 自动匹配音色进行中
  const voiceTracksRef = useRef<Record<string, string>>({});
  // ⑤ 背景音乐（BGM）：本地上传的音频，整片循环播放；预览/导出与配音一起混音。volume 0–100。
  const [bgm, setBgm] = useState<{ url: string; name: string; volume: number } | null>(null);
  // 用户自定义：目标镜头数 + 总时长（秒）。默认 1 镜 / 5 秒。用 ref 保存最新值，
  // 避免两个 stepper 互读对方的陈旧闭包值导致覆盖。
  const [totalSec, setTotalSec] = useSessionField<number>("totalSec");
  const [targetShots, setTargetShots] = useSessionField<number>("targetShots");
  const totalSecRef = useRef(totalSec);
  const targetShotsRef = useRef(targetShots);
  totalSecRef.current = totalSec; // 与会话值保持同步（恢复后台项目时也正确）
  targetShotsRef.current = targetShots;
  const [assets, setAssets] = useSessionField<Asset[]>("assets");
  const [shots, setShots] = useSessionField<Shot[]>("shots");
  // 挂载时复位「卡在生成中却没有实际生成在跑」的镜头（多因刷新/服务重启中断），否则会永远转圈且无按钮可救。
  useEffect(() => {
    setShots((prev) => {
      if (!prev?.some((s) => s.status === "gen" && !genInFlight.current.has(s.id))) return prev;
      return prev.map((s) => (s.status === "gen" && !genInFlight.current.has(s.id) ? { ...s, status: "idle" as const, pct: 0 } : s));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [exporting, setExporting] = useState(false);
  const [exportPct, setExportPct] = useState(0);
  const [playingClip, setPlayingClip] = useState<Shot | null>(null); // 分镜视频大播放器
  const [editVideoFor, setEditVideoFor] = useState<Shot | null>(null); // 「编辑视频」弹窗（视频生视频，保持首尾帧）
  const [genMode, setGenMode] = useSessionField<GenMode>("genMode"); // 生成模式：文本生成 / 智能多帧 / 首尾帧
  const [subtitlesRaw, setSubtitles] = useSessionField<Subtitle[]>("subtitles"); // 时间轴多段字幕（老项目可能无此字段）
  const subtitles = subtitlesRaw ?? [];
  const [subCapSig, setSubCapSig] = useSessionField<string>("subCapSig"); // 上次构建字幕所依据的「各镜台词+时长」签名；台词变了就重建字幕
  const [assetGenRaw, setAssetGenSettings] = useSessionField<Record<string, AssetGenSetting>>("assetGenSettings"); // 场景/角色/道具的生图清晰度 + 一键生成模型
  const assetGenSettings = assetGenRaw ?? {};
  // 「一键生成全部图片」后台运行态：放会话级 → 切换步骤/离开页面后仍在后台继续，回来还能看到进度
  const [genImgBusyRaw, setGenImgBusy] = useSessionField<boolean>("genImgBusy");
  const genImgBusy = genImgBusyRaw ?? false;
  const [genImgProgRaw, setGenImgProg] = useSessionField<{ done: number; total: number }>("genImgProg");
  const genImgProg = genImgProgRaw ?? { done: 0, total: 0 };
  const genImgRunning = useRef(false); // 即时防重入（本实例内）
  const [studioInputRaw, setStudioInput] = useSessionField<string>("studioInput"); // ① 用户需求输入（生成原始创意用，需持久化）
  const [studioIdeaRaw, setStudioIdea] = useSessionField<string>("studioIdea"); // ① 原始创意
  const [studioSummaryRaw, setStudioSummary] = useSessionField<string>("studioSummary"); // ① 镜头摘要
  const studioInput = studioInputRaw ?? "";
  const studioIdea = studioIdeaRaw ?? "";
  const studioSummary = studioSummaryRaw ?? "";
  // 字幕 CRUD：拖动改位置 / 拖边缘改时长 / 编辑文字 / 增删。start、dur 均钳制在 [0, 总时长]。
  const totalDurAll = () => shots.reduce((a, s) => a + s.dur, 0) || 1;
  function editSubtitle(id: string, patch: Partial<Subtitle>) {
    setSubtitles((prev) => (prev ?? []).map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }
  function moveSubtitle(id: string, start: number) {
    const T = totalDurAll();
    setSubtitles((prev) =>
      (prev ?? []).map((x) => (x.id === id ? { ...x, start: Math.max(0, Math.min(T - x.dur, +start.toFixed(2))) } : x)),
    );
  }
  function resizeSubtitle(id: string, start: number, dur: number) {
    const T = totalDurAll();
    setSubtitles((prev) =>
      (prev ?? []).map((x) => {
        if (x.id !== id) return x;
        const s = Math.max(0, Math.min(T - 0.3, +start.toFixed(2)));
        const d = Math.max(0.3, Math.min(T - s, +dur.toFixed(2)));
        return { ...x, start: s, dur: d };
      }),
    );
  }
  function removeSubtitle(id: string) {
    setSubtitles((prev) => (prev ?? []).filter((x) => x.id !== id));
  }
  function addSubtitleAt(sec: number) {
    const T = totalDurAll();
    const dur = Math.min(2, T);
    const start = Math.max(0, Math.min(T - dur, +sec.toFixed(2)));
    setSubtitles((prev) => [...(prev ?? []), { id: `sub-new-${Math.round(sec * 100)}-${(prev ?? []).length}`, text: "新字幕", start, dur }]);
  }
  // 进入「视频预览」时按各镜台词自动生成时间轴字幕，并「一直跟随脚本」：
  // 只要各镜台词（caption）或时长变化（改脚本/重排镜头），就按最新台词重建字幕；台词没变时保留用户手动拖动/增删/改字。
  useEffect(() => {
    if (stepKey !== "preview") return;
    const sig = shots.map((s) => `${s.caption}@${s.dur}`).join("|"); // 台词+时长签名
    if (sig === (subCapSig ?? "") && (subtitlesRaw?.length ?? 0) > 0) return; // 脚本未变且已有字幕 → 保留手动编辑
    const built = buildSubtitlesFromShots(shots);
    setSubtitles(built);
    setSubCapSig(sig);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKey, shots]);

  // 时间轴播放头 ↔ 视频预览联动：previewTime = 当前时间（秒）；拖动时间轴时通过 seekTarget 通知预览跳帧。
  const [previewTime, setPreviewTime] = useState(0);
  const seekN = useRef(0);
  const [seekTarget, setSeekTarget] = useState<{ t: number; n: number }>({ t: 0, n: 0 });
  function scrubTo(sec: number) {
    setPreviewTime(sec);
    seekN.current += 1;
    setSeekTarget({ t: sec, n: seekN.current });
  }

  const ratio = settings.视频比例; // "智能"/"16:9" 等，videoFx 会解析
  const totalDur = shots.reduce((a, s) => a + s.dur, 0);
  const doneShots = shots.filter((s) => s.status === "done");

  // 项目文件自动保存：项目名 / 分镜状态 / 视频变化时同步存盘（签名排除 pct，避免生成中频繁写入）
  const saveSig = `${projectName}|${shots.map((s) => `${s.id}:${s.status}:${s.videoUrl ? 1 : 0}`).join(",")}`;
  useEffect(() => {
    persistProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveSig]);

  // 仅「从生成历史进入」时启用全屏沉浸模式（隐藏全局顶栏，配合返回按钮）；
  // 从首页 / 直接进入时保留全局顶栏作为导航，顶部一直固定可见。
  useEffect(() => {
    if (immersive) document.body.classList.add("studio-mode");
    const t = timers.current;
    return () => {
      if (immersive) document.body.classList.remove("studio-mode");
      t.forEach((id) => {
        window.clearTimeout(id);
        window.clearInterval(id);
      });
    };
  }, [immersive]);

  const activeIdx = studioSteps.findIndex((s) => s.key === stepKey);
  const active = studioSteps[activeIdx] ?? studioSteps[0];

  // 返回：回到真正的来源页（生成历史→一句话成片 / 其他入口→各自来源）；
  // 无站内历史（如直接粘贴 URL 打开）时兜底回视频首页，避免跳出应用。
  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/video?sub=oneline");
  }

  // —— 行为 ——
  // AI 扩写（逐镜）：把该镜头画面描述调 /api/video-prompt 优化为更专业的描述（真实 AI，失败本地兜底）。
  async function aiExpandShot(id: string) {
    const idx = shots.findIndex((s) => s.id === id);
    const base = shots[idx]?.shotDesc.trim();
    if (!base) {
      toast("请先填写画面内容，再点 AI 扩写", "warn");
      return;
    }
    // 前面所有镜头内容作为叙事衔接上下文（首镜无），保证与整段前文连贯
    const prevContext = shots
      .slice(0, idx)
      .map((s, i) => ({ i, t: s.shotDesc.trim() }))
      .filter((x) => x.t)
      .map((x) => `镜头${x.i + 1}：${x.t}`)
      .join("\n");
    setAiBusyId(id);
    const style = settings.视频风格 === "智能匹配" ? undefined : settings.视频风格;
    const text = (await optimizeShotPrompt(base, style, prevContext)) ?? localExpand(base, style, prevContext);
    setShots((prev) => prev.map((s) => (s.id === id ? { ...s, shotDesc: text } : s)));
    setAiBusyId(null);
    toast(prevContext ? "已 AI 扩写并衔接前面镜头" : "已 AI 扩写画面描述");
  }

  // 智能匹配：当「视频风格 = 智能匹配」时，读脚本让 LLM 从 6 种具体风格里挑一种最贴合的，
  // 写回 settings.视频风格 → 全片固定按该风格生成（文本扩写 / 生图 / 视频都会带上该风格）。
  // 挑中后风格就变成具体值、不再是「智能匹配」，即「固定」；用户如需重挑可在「编辑项目」重新选回智能匹配。
  async function resolveAutoStyle() {
    const snap = getStudioSnapshot() as { script?: string; studioIdea?: string; settings?: Record<string, string> };
    if ((snap.settings?.视频风格 ?? settings.视频风格) !== "智能匹配") return; // 已是具体风格 → 不动
    const src = (snap.script || script || snap.studioIdea || "").trim();
    if (!src) return; // 没脚本无从判断，保持智能匹配（模型自由）
    try {
      const resp = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene: "studio-style-match", input: src }),
      });
      if (!resp.ok || !resp.body) return;
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop() ?? "";
        for (const evt of events) {
          const line = evt.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          try { const j = JSON.parse(line.slice(5).trim()) as { text?: string }; if (j.text) acc += j.text; } catch { /* 跳过 */ }
        }
      }
      // 从返回文本里匹配出一个具体风格名（防止模型多输出别的字）
      const names = videoStyles.filter((v) => v.name !== "智能匹配").map((v) => v.name);
      const matched = names.find((n) => acc.includes(n));
      if (matched && getStudioSnapshot() && (getStudioSnapshot() as { settings?: Record<string, string> }).settings?.视频风格 === "智能匹配") {
        setSettings((s) => ({ ...s, 视频风格: matched }));
        toast(`已根据脚本智能匹配为「${matched}」风格，全片将按此风格生成`);
      }
    } catch {
      /* 失败则保持「智能匹配」，不影响生成 */
    }
  }

  // 非破坏式重拆：锁定的镜头保留，其余按剧本重新拆分。
  // 段落式剧本（每段=一镜）镜头数由内容决定，拆完同步镜头数/总时长，与实际 shots 对齐。
  function rebuildShots() {
    void resolveAutoStyle(); // 脚本就绪 → 若为智能匹配，后台挑一个具体风格并锁定（不阻塞拆分镜）
    const locked = shots.filter((s) => s.locked);
    const fresh = makeShots(script, totalSec, targetShots);
    const mergedRaw = locked.length ? [...locked, ...fresh] : fresh;
    // 总时长默认拉满：每镜取模型上限 15s，总时长 = 镜数 × 15（用户可在总时长处再手动调短）
    const total = mergedRaw.length * 15;
    const merged = redistribute(mergedRaw, total);
    setShots(() => merged);
    targetShotsRef.current = merged.length;
    totalSecRef.current = total;
    setTargetShots(merged.length);
    setTotalSec(total);
    toast(locked.length ? `已重新拆分镜，保留 ${locked.length} 个锁定镜头（共 ${merged.length} 镜）` : `已按剧本拆出分镜（共 ${fresh.length} 镜）`);
  }

  // 调整镜头数：增加则在末尾追加空白镜头、减少则从末尾裁剪，保留已填内容；再按总时长重新分配各镜时长。
  // 约束：每镜 4–15 秒（模型要求）→ 总时长 = 镜头数 ×[4,15]。
  function setShotCount(n: number) {
    const v = Math.max(1, Math.min(40, Math.round(n))); // 最多 40 镜（40 × 15s = 10 分钟）
    targetShotsRef.current = v;
    setTargetShots(v);
    let t = totalSecRef.current;
    if (t > v * 15) {
      t = v * 15;
      totalSecRef.current = t;
      setTotalSec(t);
      toast("每镜最长 15 秒，已同步调整总时长");
    } else if (t < v * 4) {
      t = v * 4;
      totalSecRef.current = t;
      setTotalSec(t);
      toast("每镜最短 4 秒，已同步调整总时长");
    }
    setShots((prev) => {
      const next = prev.slice(0, v);
      while (next.length < v) next.push(blankShot(next.length));
      return redistribute(next, t);
    });
  }
  function setTotal(sec: number) {
    const minT = targetShotsRef.current * 4; // 每镜 ≥ 4s（模型要求）
    const maxT = targetShotsRef.current * 15; // 每镜 ≤ 15s
    const want = Math.round(sec);
    const v = Math.max(minT, Math.min(maxT, want));
    if (want > maxT) toast("每镜最长 15 秒，请增加镜头数以延长总时长", "warn");
    else if (want < minT) toast("每镜最短 4 秒，请减少镜头数以缩短总时长", "warn");
    totalSecRef.current = v;
    setTotalSec(v);
    setShots((prev) => redistribute(prev, v));
  }

  function editShot(id: string, patch: Partial<Shot>) {
    setShots((prev) => {
      const nextShots = prev.map((s): Shot => {
        if (s.id !== id) return s;
        const next = { ...s, ...patch };
        // 字幕自动提取：改「画面描述」时，若字幕仍是空 / 上一版自动提取的台词（即用户没手动改过），
        // 就自动跟随更新为新画面描述引号内的台词；用户一旦手动编辑过字幕则不覆盖。
        if (patch.shotDesc !== undefined && patch.shotDesc !== s.shotDesc) {
          const oldAuto = extractDialogue(s.shotDesc);
          if (!s.caption.trim() || s.caption === oldAuto) {
            next.caption = extractDialogue(patch.shotDesc);
          }
        }
        // 改画面描述 / 出镜元素 / 字幕 / 运镜等，都「不」作废已生成的视频——保留原视频不变。
        // 只有用户主动点「重新生成」（genShot）时才按最新内容重生成并覆盖。这样回去改内容不会丢原片。
        return next;
      });
      // 用户调节某一镜时长 → 总时长跟着变（顶部「总时长」= 各镜时长之和）。
      // 在更新器里同步 ref，并延后一个 microtask 更新总时长状态，避免在状态计算阶段直接 setState。
      if (patch.dur !== undefined) {
        const sum = nextShots.reduce((a, s) => a + s.dur, 0);
        totalSecRef.current = sum;
        queueMicrotask(() => setTotalSec(sum));
      }
      return nextShots;
    });
  }

  // 某镜配音音色：优先本镜勾选的角色里第一个有音色的；否则退回项目主角色（有音色的第一个角色）。
  function shotVoice(shot: Shot): AssetVoice | undefined {
    const bound = assets.find((a) => shot.assetRefs.includes(a.id) && a.kind === "角色" && a.voice);
    if (bound?.voice) return bound.voice;
    return assets.find((a) => a.kind === "角色" && a.voice)?.voice;
  }

  // 方案B 逐镜配音：台词=shot.caption，音色=该镜角色音色 → 调 /api/tts（火山）合成，存 voiceTracks[shotId]。
  async function synthVoices(onlyShotId?: string) {
    if (synthBusy) return;
    const done = shots.filter((s) => s.status === "done" && s.videoUrl);
    const targets = done.filter((s) => s.caption.trim() && shotVoice(s) && (!onlyShotId || s.id === onlyShotId));
    if (!targets.length) {
      toast(onlyShotId ? "这一镜没有可配音的内容：需有台词（字幕）且出场角色已选音色" : "没有可配音的镜头：请确认镜头有台词（字幕）且出场角色已在②选好音色", "warn");
      return;
    }
    setSynthBusy(true);
    // 自动分角色：多角色镜头若还没分过说话人，先自动分配（用返回的映射，避免读到未刷新的 state）。
    const needAssign = targets.filter((s) => isMultiChar(s) && !s.voiceScript?.trim());
    if (needAssign.length) { setSpeakerBusy(true); toast(`检测到 ${needAssign.length} 个多角色镜头，正在自动分角色…`); }
    const speakerMap = needAssign.length ? await computeSpeakers(needAssign) : {};
    if (needAssign.length) setSpeakerBusy(false);
    const next = { ...voiceTracksRef.current };
    const nextSegs: Record<string, { dur: number; name: string }> = { ...(voiceSegs ?? {}) };
    let ok = 0;
    const subs = (subtitles ?? []).slice();
    // 各镜在全片时间轴上的起始秒（用于把字幕句归属到镜头、算镜内偏移）
    let acc = 0; const shotStartMap = new Map<string, number>();
    for (const sh of shots) { shotStartMap.set(sh.id, acc); acc += sh.dur; }
    const shotForSub = (sub: Subtitle) => shots.find((sh) => { const st = shotStartMap.get(sh.id) ?? 0; return sub.start >= st - 0.05 && sub.start < st + sh.dur - 0.001; }) ?? null;
    const normTxt = (t: string) => t.replace(/[，。！？、；：""''「」,.!?;:\s]/g, "");
    // 单次合成 → 返回 ArrayBuffer（失败 null）
    const synthOnce = async (vt: string, text: string, speed: number, voice: AssetVoice): Promise<ArrayBuffer | null> => {
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voice: vt, speed, volume: (voice.volume ?? 5) / 5, emotion: voice.emotion ? VOLC_EMOTION[voice.emotion] : undefined, clone: /^S_/.test(vt) }),
        });
        if (!res.ok) return null;
        const buf = await res.arrayBuffer();
        return buf.byteLength ? buf : null;
      } catch { return null; }
    };
    // 台词分「说话人段」：每行"名字：台词"用该角色音色；无前缀/名字没匹配 → 默认音色（多说话人）。
    const parseSegs = (caption: string, def: AssetVoice): { text: string; voice: AssetVoice }[] => {
      const lines = caption.split(/\n+/).map((l) => l.trim()).filter(Boolean);
      const src = lines.length ? lines : [caption];
      const segs: { text: string; voice: AssetVoice }[] = [];
      for (const line of src) {
        const m = line.match(/^([^：:]{1,12})[：:]\s*(.+)$/);
        if (m) {
          const a = assets.find((x) => x.kind === "角色" && x.voice && x.name === m[1].trim());
          segs.push({ text: m[2].trim(), voice: a?.voice ?? def });
        } else segs.push({ text: line, voice: def });
      }
      return segs.filter((x) => x.text);
    };
    for (const s of targets) {
      const def = shotVoice(s)!;
      const segs = parseSegs((speakerMap[s.id] || s.voiceScript?.trim() || s.caption).trim(), def);
      // 把一句字幕文本匹配到说话人段 → 取该说话人音色；匹配不到用本镜默认音色。
      const voiceForText = (text: string): AssetVoice => {
        const st = normTxt(text);
        const hit = segs.find((g) => { const gt = normTxt(g.text); return gt && (st.includes(gt) || gt.includes(st)); });
        return hit?.voice ?? def;
      };
      const shotStartT = shotStartMap.get(s.id) ?? 0;
      const shotSubs = subs.filter((sub) => sub.text.trim() && shotForSub(sub)?.id === s.id).sort((a, b) => a.start - b.start);
      // 逐句配音项：优先按时间轴字幕逐条；本镜没有字幕则退回整镜台词一句
      const items = shotSubs.length
        ? shotSubs.map((sub) => ({ id: sub.id, text: sub.text.trim(), offset: Math.max(0, sub.start - shotStartT) }))
        : [{ id: `dubshot-${s.id}`, text: s.caption.trim(), offset: 0 }];
      const mixSegs: { buf: ArrayBuffer; offset: number }[] = [];
      for (const it of items) {
        const voice = voiceForText(it.text);
        const vt = /^S_/.test(voice.id) ? voice.id : findVoice(voice.id)?.tts;
        if (!vt) continue;
        const buf = await synthOnce(vt, it.text, Math.min(2, voice.rate || 1), voice); // 自然语速，不为塞进字幕格提速（方案B）
        if (!buf) continue;
        // 测该句时长（时间轴按此画配音块宽）
        const tmpUrl = URL.createObjectURL(new Blob([buf], { type: "audio/mpeg" }));
        const segDur = await audioDuration(tmpUrl).catch(() => 1);
        URL.revokeObjectURL(tmpUrl);
        nextSegs[it.id] = { dur: segDur > 0 ? segDur : 1, name: voice.name || voiceNameOf(voice.id) || "配音" };
        mixSegs.push({ buf, offset: it.offset });
      }
      if (!mixSegs.length) continue;
      // 各句按镜内偏移混成一条镜头音轨（交叠相加）；播放器仍按镜头播这条轨，不用改。
      const mixed = await mixDubToWav(mixSegs, s.dur);
      if (!mixed) continue;
      if (next[s.id]?.startsWith("blob:")) URL.revokeObjectURL(next[s.id]);
      next[s.id] = URL.createObjectURL(mixed.blob);
      ok++;
    }
    voiceTracksRef.current = next;
    setVoiceTracks(next);
    setVoiceSegs(nextSegs);
    setSynthBusy(false);
    if (!ok) { toast("配音合成失败，请检查火山配置/额度", "warn"); return; }
    toast("已按字幕逐句合成配音（预览已启用）");
  }

  // 某镜是否是「多角色（≥2 个有音色的角色）」镜头 → 需要分说话人
  const isMultiChar = (s: Shot) => assets.filter((a) => s.assetRefs.includes(a.id) && a.kind === "角色" && a.voice).length >= 2;

  // 对给定镜头做 AI 分说话人：调 LLM 把台词标成「角色名：台词」分行，返回 shotId→分行文本 映射，同时写入 voiceScript 持久化。
  async function computeSpeakers(targetShots: Shot[]): Promise<Record<string, string>> {
    const map: Record<string, string> = {};
    for (const s of targetShots) {
      const chars = assets.filter((a) => s.assetRefs.includes(a.id) && a.kind === "角色").map((a) => a.name);
      const input = `【画面描述】\n${s.shotDesc || "（无）"}\n\n【台词】\n${s.caption.trim()}\n\n【本镜出场角色】${chars.join("、")}`;
      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scene: "studio-speakers", input }),
        });
        if (!res.ok || !res.body) continue;
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "", acc = "";
        for (;;) {
          const { done: rd, value } = await reader.read();
          if (rd) break;
          buf += dec.decode(value, { stream: true });
          const events = buf.split("\n\n"); buf = events.pop() ?? "";
          for (const evt of events) {
            const line = evt.split("\n").find((l) => l.startsWith("data:"));
            if (line) { try { const j = JSON.parse(line.slice(5).trim()) as { text?: string }; if (j.text) acc += j.text; } catch { /* 跳过 */ } }
          }
        }
        const script = acc.trim();
        if (script && /[：:]/.test(script)) { map[s.id] = script; editShot(s.id, { voiceScript: script }); }
      } catch { /* 单镜失败跳过 */ }
    }
    return map;
  }


  // AI 自动匹配音色：读每个角色的设定 + 剧本，让 LLM 从火山音色库里选最贴合的音色，自动填入 asset.voice。
  // 和有戏"自动匹配角色声音"一致——从固定库里选，不是生成新声音。redoAll=false 时只匹配还没音色的角色。
  async function autoMatchVoices(redoAll = false) {
    if (voiceMatchBusy) return;
    const chars = assets.filter((a) => a.kind === "角色");
    const targets = redoAll ? chars : chars.filter((a) => !a.voice);
    if (!targets.length) { toast(chars.length ? "所有角色都已有音色（如需重配，点「重新匹配」）" : "还没有角色，请先在②添加/生成角色", "warn"); return; }
    const catalog = VOICES.map((v) => `${v.name}（${v.gender}·${v.age}·${v.scene}${v.multiEmotion ? "·多情感" : ""}）`).join("\n");
    setVoiceMatchBusy(true);
    let ok = 0;
    for (const a of targets) {
      const input = `【剧本背景】\n${script?.trim() || "（无）"}\n\n【角色】${a.name}\n\n【可选音色清单】\n${catalog}\n\n请从清单里选一个最贴合「${a.name}」的音色，只输出音色名。`;
      try {
        const res = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scene: "studio-voice-match", input }) });
        if (!res.ok || !res.body) continue;
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "", acc = "";
        for (;;) {
          const { done: rd, value } = await reader.read();
          if (rd) break;
          buf += dec.decode(value, { stream: true });
          const events = buf.split("\n\n"); buf = events.pop() ?? "";
          for (const evt of events) {
            const line = evt.split("\n").find((l) => l.startsWith("data:"));
            if (line) { try { const j = JSON.parse(line.slice(5).trim()) as { text?: string }; if (j.text) acc += j.text; } catch { /* 跳过 */ } }
          }
        }
        const out = acc.trim();
        // 先精确匹配，再包含匹配（模型可能带多余字）；按名字长度降序避免"男友"误命中"儒雅男友"外的短名
        const matched = VOICES.find((v) => v.name === out) ?? [...VOICES].sort((x, y) => y.name.length - x.name.length).find((v) => out.includes(v.name));
        if (matched) {
          setAssets((list) => list.map((x) => (x.id === a.id ? { ...x, voice: { id: matched.id, name: matched.name, rate: 1, volume: 5, pitch: 1 } } : x)));
          ok++;
        }
      } catch { /* 单个失败跳过 */ }
    }
    setVoiceMatchBusy(false);
    toast(ok ? `已为 ${ok}/${targets.length} 个角色自动匹配音色，可在②卡片微调` : "匹配失败，请重试", ok ? undefined : "warn");
  }

  // 默认自动匹配音色：只要出现「还没音色」的角色，就在后台自动从火山音色库匹配。
  // 每个角色只自动尝试一次（记在 autoVoiceTried），这样用户手动清空/换掉音色后不会被反复覆盖。
  const autoVoiceTried = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (voiceMatchBusy) return;
    const pending = assets.filter((a) => a.kind === "角色" && !a.voice && !autoVoiceTried.current.has(a.id));
    if (!pending.length) return;
    pending.forEach((a) => autoVoiceTried.current.add(a.id));
    void autoMatchVoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, voiceMatchBusy]);

  // 生成后默认存为「项目文件」：只要有已生成分镜，就把当前会话（多分镜合集）持久化为一个项目，
  // 显示在制作大片首页「我制作的大片」，可重新打开。读取模块级快照，卸载后（后台生成完成时）仍可调用。
  function persistProject() {
    const snap = getStudioSnapshot() as { shots?: Shot[]; projectName?: string };
    const list = snap.shots ?? [];
    const done = list.filter((s) => s.status === "done" && s.videoUrl);
    // 新建项目（唯一 pid，p- 前缀）一律存为文件（未生成时以占位文件夹展示）；
    // 示例入口（非 p- 前缀）仅在真正生成后才落库，避免仅浏览就产生垃圾项目。
    if (!projId.startsWith("p-") && !done.length) return;
    upsertProject({
      id: projId,
      name: snap.projectName || projId,
      updated: nowStamp(),
      ts: Date.now(),
      count: list.length,
      cover: done[0]?.videoUrl,
      state: snap as Record<string, unknown>,
    });
  }

  // 字幕改动（拖动位置 / 拖边缘改时长 / 编辑文字 / 增删）默认自动保存到项目文件。
  // 防抖 600ms：拖动过程中不频繁写盘，松手（最后一次变更）后自动持久化。persistProject 读模块快照，无闭包陈旧问题。
  const firstSubsPersist = useRef(true);
  useEffect(() => {
    if (firstSubsPersist.current) { firstSubsPersist.current = false; return; } // 跳过初次挂载
    const t = window.setTimeout(() => persistProject(), 600);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtitlesRaw]);

  async function removeShot(id: string) {
    const idx = shots.findIndex((x) => x.id === id);
    const s = shots[idx];
    const label = idx >= 0 ? `镜头 ${idx + 1}` : "该镜头";
    const hasVideo = s?.status === "done" && !!s?.videoUrl;
    if (!(await appConfirm({ message: `确定删除${label}吗？${hasVideo ? "已生成的视频片段会一并删除。" : ""}①剧本里对应的这段镜头文字也会一并删除，其余镜头自动重新编号。`, danger: true, confirmText: "删除" }))) return;
    setShots((prev) => prev.filter((x) => x.id !== id));
    if (idx >= 0) setScript(removeScriptBlock(script, idx)); // 连带删除剧本对应段落并重编号
  }
  function addShot() {
    setShots((prev) => {
      const i = prev.length;
      return [
        ...prev,
        {
          id: `shot-new-${i}-${Date.now() % 100000}`,
          shotDesc: "新镜头：补充画面描述",
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
  // 新增「已放入视频」的镜头：把本地上传 / 仓库选取的视频作为新的一镜，追加到末尾（默认 5s，直接标记已生成）
  function addVideoShot(videoUrl: string, poster?: string) {
    setShots((prev) => {
      const i = prev.length;
      return [
        ...prev,
        {
          id: `shot-vid-${i}-${Date.now() % 100000}`,
          shotDesc: "",
          caption: "",
          camera: CAMERAS[i % CAMERAS.length],
          shotSize: SHOT_SIZES[i % SHOT_SIZES.length],
          assetRefs: [],
          locked: false,
          dur: 5,
          poster: poster || posterFor("vid" + i + Date.now()),
          status: "done",
          pct: 100,
          videoUrl,
        },
      ];
    });
    toast("已加入一个视频镜头");
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

  // 从已生成视频里抽取「最后一帧」为 dataURL，用作下一镜首帧实现画面无缝衔接。
  // 取「完整、可 seek」的同源播放源，整文件在内存、不依赖 Range 流式，seek 到结尾稳定可靠：
  //   1) 本地视频（blob:/data:）直接用；2) 优先本地缓存的完整 blob（生成后已自动缓存，最稳）；
  //   3) 兜底经 /api/media 同源代理下载整段（带重试，规避 CDN 抖动）。
  // 任何失败均返回 undefined，由调用方标记失败让用户重试。
  async function extractLastFrame(videoUrl: string, position: "first" | "last" = "last"): Promise<{ frame?: string; reason?: string }> {
    const isLocal = /^(blob:|data:)/.test(videoUrl);
    let objUrl = "";
    let revoke = false;
    if (isLocal) {
      objUrl = videoUrl; // 本地视频直接可 seek，不下载、不 revoke（否则会破坏原始 URL）
    } else {
      // 优先本地缓存（IndexedDB）的完整 blob；未命中再经代理下载，前端叠加重试
      let blob: Blob | null = await getCachedVideo(videoUrl);
      for (let i = 0; !blob && i < 3; i++) {
        blob = await fetch(`/api/media?url=${encodeURIComponent(videoUrl)}`)
          .then((r) => (r.ok ? r.blob() : null))
          .catch(() => null);
        if (blob && blob.size > 0) break;
        blob = null;
      }
      if (!blob || !blob.size) {
        console.warn("[extractLastFrame] 视频下载失败（缓存未命中且代理多次取回为空）");
        return { reason: "未能下载上一镜视频（网络或 CDN 问题），请重试" };
      }
      objUrl = URL.createObjectURL(blob);
      revoke = true;
    }
    try {
      return await new Promise<{ frame?: string; reason?: string }>((resolve) => {
        const v = document.createElement("video");
        v.muted = true;
        v.preload = "auto";
        v.playsInline = true;
        let settled = false;
        let seekGuard = 0;
        const done = (val: string | undefined, why?: string) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(to);
          window.clearTimeout(seekGuard);
          if (!val) console.warn("[extractLastFrame] 抽帧失败：", why, "| dur:", v.duration, "| vw:", v.videoWidth);
          resolve(val ? { frame: val } : { reason: `未能解析上一镜尾帧（${why ?? "未知"}），请重试` });
        };
        const to = window.setTimeout(() => done(undefined, "20s 超时"), 20_000);
        const grab = () => {
          try {
            if (!v.videoWidth) return; // 帧数据尚未就绪，等下一次回调/兜底
            const c = document.createElement("canvas");
            c.width = v.videoWidth || 1280;
            c.height = v.videoHeight || 720;
            const ctx = c.getContext("2d");
            if (!ctx) return done(undefined, "无 canvas ctx");
            ctx.drawImage(v, 0, 0, c.width, c.height);
            done(c.toDataURL("image/jpeg", 0.9));
          } catch (e) {
            done(undefined, "canvas 异常：" + (e instanceof Error ? e.message : String(e)));
          }
        };
        // seek 到目标位置抽帧（首帧≈0.05s / 尾帧≈末尾-0.1s）；贴近末尾的 seek 部分浏览器不触发 onseeked，故加 1.5s 兜底
        const seekTarget = () => {
          v.onseeked = grab;
          window.clearTimeout(seekGuard);
          seekGuard = window.setTimeout(grab, 1500);
          if (position === "first") { v.currentTime = 0.05; return; }
          const d = v.duration;
          v.currentTime = isFinite(d) && d > 0 ? Math.max(0, d - 0.1) : 0;
        };
        v.onloadedmetadata = () => {
          if (position === "last" && (!isFinite(v.duration) || v.duration <= 0)) {
            // 抽尾帧且时长元数据缺失（Infinity/NaN）：先 seek 到极大值促使浏览器读到真实结尾确定时长，再抽帧
            v.ontimeupdate = () => {
              if (isFinite(v.duration) && v.duration > 0) {
                v.ontimeupdate = null;
                seekTarget();
              }
            };
            v.currentTime = 1e101;
          } else {
            seekTarget();
          }
        };
        v.onerror = () => done(undefined, "video error code=" + (v.error?.code ?? "?"));
        v.src = objUrl;
      });
    } finally {
      if (revoke) URL.revokeObjectURL(objUrl);
    }
  }

  // 把某个生成视频自动缓存到本地（IndexedDB）并映射为可播放的 blobURL。
  // 已缓存 / 已映射直接复用；外链未缓存则经 /api/media 代理下载后存库。非 http 外链（blob:/data:）跳过。
  const cacheInFlightRef = useRef<Set<string>>(new Set());
  // 后台缓存并发信号量：一次最多下 2 个视频，避免进入④页时十来个视频同时下载抢带宽、拖慢正在观看的那条。
  const cacheSlotsRef = useRef(2);
  const cacheWaitRef = useRef<Array<() => void>>([]);
  const acquireCacheSlot = useCallback(async () => {
    if (cacheSlotsRef.current > 0) { cacheSlotsRef.current--; return; }
    await new Promise<void>((res) => cacheWaitRef.current.push(res));
  }, []);
  const releaseCacheSlot = useCallback(() => {
    const next = cacheWaitRef.current.shift();
    if (next) next(); // 让排队的下一个下载占用这个名额
    else cacheSlotsRef.current++;
  }, []);
  const ensureVideoCached = useCallback(async (url?: string) => {
    if (!url || !/^https?:\/\//i.test(url)) return;
    if (cachedVideosRef.current[url] || cacheInFlightRef.current.has(url)) return; // 已映射 / 正在处理
    cacheInFlightRef.current.add(url);
    try {
      let blob = await getCachedVideo(url); // 本地已入库 → 直接读，不占下载名额
      if (!blob) {
        await acquireCacheSlot(); // 限并发：拿到名额才真正发起下载
        try {
          blob = await fetch(`/api/media?url=${encodeURIComponent(url)}`)
            .then((r) => (r.ok ? r.blob() : null))
            .catch(() => null);
          if (blob && blob.size) await putCachedVideo(url, blob); // 等落库完成，保证随后抽尾帧能读到本地缓存
        } finally {
          releaseCacheSlot();
        }
      }
      if (blob && blob.size && !cachedVideosRef.current[url]) {
        const objUrl = URL.createObjectURL(blob);
        cachedVideosRef.current = { ...cachedVideosRef.current, [url]: objUrl };
        setCachedVideos(cachedVideosRef.current);
      }
    } catch {
      /* 缓存失败不影响功能，播放/下载回退到 /api/media 代理 */
    } finally {
      cacheInFlightRef.current.delete(url);
    }
  }, [acquireCacheSlot, releaseCacheSlot]);

  // 打开项目 / 生成完成后：把所有已生成分镜视频恢复为本地缓存（首次访问会下载入库，之后秒开）
  useEffect(() => {
    shots.forEach((s) => {
      if (s.status === "done" && s.videoUrl) ensureVideoCached(s.videoUrl);
    });
  }, [shots, ensureVideoCached]);

  // 卸载时释放所有 blobURL，避免内存泄漏
  useEffect(
    () => () => {
      Object.values(cachedVideosRef.current).forEach((u) => URL.revokeObjectURL(u));
    },
    [],
  );

  // 出镜元素自动绑定：元素就绪后，对「还没绑定过」的镜头，把名字出现在其画面描述里的元素默认勾选。
  // 每个镜头只自动处理一次（autoBoundRef 记录），用户之后手动增删都不会被再次自动改写。
  const autoBoundRef = useRef<Set<string>>(new Set());
  // 描述里出现这些人物指代（但没点名具体角色）时，默认认为主角出镜 → 自动补上主角，避免人物不一致。
  const PERSON_HINT = /她|他|姑娘|小姑娘|女子|女孩|少女|妇人|背影|身影|主角|人物/;
  useEffect(() => {
    if (!assets.length || !shots.length) return;
    const mainChar = assets.find((a) => a.kind === "角色"); // 主角 = 第一个角色
    let changed = false;
    const next = shots.map((s) => {
      if (autoBoundRef.current.has(s.id)) return s; // 已处理过，尊重用户后续手动选择
      autoBoundRef.current.add(s.id);
      if (s.assetRefs.length) return s; // 已有绑定（用户已选）→ 不动
      const desc = s.shotDesc || "";
      const matched = assets.filter((a) => a.name && desc.includes(a.name)).map((a) => a.id);
      // 没点名任何角色，但描述暗示有人物出镜（她/姑娘…）→ 补上主角，锁人物一致
      const hasChar = matched.some((id) => assets.find((a) => a.id === id)?.kind === "角色");
      if (!hasChar && mainChar && PERSON_HINT.test(desc)) matched.push(mainChar.id);
      if (!matched.length) return s;
      changed = true;
      return { ...s, assetRefs: sortRefsByKind(matched, assets) };
    });
    if (changed) setShots(() => next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shots, assets]);

  // 出镜元素·AI 识别：字符串精确匹配对散文描述基本无效（元素「西湖湖面」≠ 描述「西湖的水面」），
  // 所以对启发式没绑上的镜头，让 AI 语义判断每镜出现了②里的哪些元素，自动绑定。每镜只 AI 处理一次。
  const aiElemTriedRef = useRef<Set<string>>(new Set());
  const [elemMatchBusy, setElemMatchBusy] = useState(false);
  async function autoMatchElements(targetShots: Shot[]) {
    const els = assets.filter((a) => a.name);
    if (!els.length || !targetShots.length) return;
    setElemMatchBusy(true);
    const catalog = els.map((a) => `- ${a.name}（${a.kind}）`).join("\n");
    const shotsText = targetShots.map((s) => `【${s.id}】${(s.shotDesc || "").slice(0, 300)}`).join("\n\n");
    const input = `【元素清单】\n${catalog}\n\n【镜头】\n${shotsText}\n\n请输出 JSON：{ "镜头ID": ["出现的元素名称", ...] }`;
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene: "studio-shot-elements", input }),
      });
      if (!res.ok || !res.body) return;
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "", acc = "";
      for (;;) {
        const { done: rd, value } = await reader.read();
        if (rd) break;
        buf += dec.decode(value, { stream: true });
        const events = buf.split("\n\n"); buf = events.pop() ?? "";
        for (const evt of events) {
          const line = evt.split("\n").find((l) => l.startsWith("data:"));
          if (line) { try { const j = JSON.parse(line.slice(5).trim()) as { text?: string }; if (j.text) acc += j.text; } catch { /* 跳过 */ } }
        }
      }
      const m = acc.match(/\{[\s\S]*\}/);
      if (!m) return;
      const map = JSON.parse(m[0]) as Record<string, unknown>;
      const nameToId = new Map(els.map((a) => [a.name, a.id] as const));
      let ok = 0;
      setShots((prev) => prev.map((s) => {
        if (s.assetRefs.length) return s; // 用户已选/启发式已绑 → 不动
        const names = map[s.id];
        if (!Array.isArray(names)) return s;
        const ids = (names as unknown[]).map((n) => nameToId.get(String(n).trim())).filter(Boolean) as string[];
        if (!ids.length) return s;
        ok++;
        return { ...s, assetRefs: sortRefsByKind(ids, assets) };
      }));
      if (ok) toast(`已为 ${ok} 个镜头自动识别出镜元素`);
    } catch { /* 忽略，用户可手动「查看元素」选择 */ } finally {
      setElemMatchBusy(false);
    }
  }
  useEffect(() => {
    if (!assets.length || !shots.length || elemMatchBusy) return;
    const pending = shots.filter((s) => !s.assetRefs.length && (s.shotDesc || "").trim() && !aiElemTriedRef.current.has(s.id));
    if (!pending.length) return;
    pending.forEach((s) => aiElemTriedRef.current.add(s.id));
    toast(`正在识别 ${pending.length} 个镜头的出镜元素…`);
    void autoMatchElements(pending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shots, assets, elemMatchBusy]);

  // 手动「AI 识别出镜元素」：对所有「还没绑元素」的镜头重新识别补齐（自动那趟漏掉的、或后来新增的镜头）。
  // 只填空镜头，不动用户/已识别好的绑定。
  function recognizeAllElements() {
    if (elemMatchBusy) return;
    if (!assets.length) { toast("请先在②添加场景/角色/道具", "warn"); return; }
    const empty = shots.filter((s) => !s.assetRefs.length && (s.shotDesc || "").trim());
    if (!empty.length) { toast("每个镜头都已选好出镜元素"); return; }
    empty.forEach((s) => aiElemTriedRef.current.add(s.id));
    toast(`正在识别 ${empty.length} 个镜头的出镜元素…`);
    void autoMatchElements(empty);
  }

  // 执行单镜生成：真调 /api/video，返回成功的 videoUrl（失败返回 undefined）。
  // imageOverride：外部指定首帧（衔接上一镜尾帧 / 编辑视频保持首帧）。
  // opts.tailOverride：指定尾帧（编辑视频保持尾帧不变）；opts.editText：编辑要求，追加到画面描述。
  function runShot(id: string, imageOverride?: string, opts?: { tailOverride?: string; editText?: string }): Promise<string | undefined> {
    // 读最新快照而非闭包，兼容「AI 改写画面描述后立即重新生成」能拿到改写后的新描述
    const liveShots = (getStudioSnapshot() as { shots?: Shot[] }).shots ?? shots;
    const idx = liveShots.findIndex((s) => s.id === id);
    const cur = liveShots[idx];
    if (!cur) return Promise.resolve(undefined);
    if (genInFlight.current.has(id)) return Promise.resolve(undefined); // 该镜已在生成中 → 不重复启动（避免进度条互相打架）
    genInFlight.current.add(id);
    setShots((prev) => prev.map((s) => (s.id === id ? { ...s, status: "gen", pct: 5, failReason: undefined, degraded: false, degradeReason: undefined } : s)));
    // 真实生成约 200s+，进度条缓慢爬升封顶 90%，拿到结果再跳 100%
    let pct = 5;
    const iv = window.setInterval(() => {
      pct = Math.min(90, pct + 2);
      setShots((prev) => prev.map((s) => (s.id === id && s.status === "gen" ? { ...s, pct } : s)));
    }, 1600);
    timers.current.push(iv);

    // 注入出镜元素（场景/角色/道具）。原则：只锁「本镜在③分镜脚本勾选的出镜元素」，绝不无差别塞入其它角色。
    // 为什么不再全局注入所有角色：多角色项目里，把 6 个角色全塞进一镜、再取前 4 张，会把本镜该出的角色（如小渔）
    // 挤掉、并注入无关角色（老人/游客…），导致模型把人物画成别人。一致性靠「为每镜勾选正确角色 + 首帧衔接」保证。
    // 读最新 assets 快照：参考图可能是刚在②后台生成完成的，runShot 闭包里的 assets 可能还没带上 refImg。
    const liveAssets = (getStudioSnapshot() as { assets?: Asset[] }).assets ?? assets;
    let bound = cur.assetRefs.length ? liveAssets.filter((a) => cur.assetRefs.includes(a.id)) : [];
    // 安全网：本镜画面里有人物（描述命中人物关键词），却没绑到任何「有参考图的角色」——
    // 常见于③忘了勾角色、或勾了但参考图是事后才补生成的。此时自动补入主角色参考图，
    // 否则模型没有人物锚点会自由发挥、把人画成别人（镜头间人物不一致的根因）。
    const hasBoundCharRef = bound.some((a) => a.kind === "角色" && a.refImg);
    if (!hasBoundCharRef && PERSON_HINT.test(cur.shotDesc)) {
      const mainChar = liveAssets.find((a) => a.kind === "角色" && a.refImg);
      if (mainChar && !bound.some((a) => a.id === mainChar.id)) bound = [...bound, mainChar];
    }
    const elemText = bound.length
      ? `。画面中需出现：${bound.map((a) => `${a.kind}「${a.name}」`).join("、")}，与设定参考图保持一致`
      : "";
    const stylePrefix = settings.视频风格 !== "智能匹配" ? settings.视频风格 : "";
    // 带入「分镜脚本」里为本镜填写的运镜、景别，让生成画面贴合脚本设定
    const shotMeta = [cur.shotSize && `景别${cur.shotSize}`, cur.camera && `镜头运动${cur.camera}`].filter(Boolean).join("，");
    // 锁定元素 = 本镜出镜元素，按「角色 > 场景 > 道具」排序（角色最优先，保证不被 4 张参考图上限挤掉）。
    const refOrder: Record<Asset["kind"], number> = { 角色: 0, 场景: 1, 道具: 2 };
    const lockElems = [...bound].sort((a, b) => refOrder[a.kind] - refOrder[b.kind]);
    // 全片一致性硬约束：每一镜都要求与参考图 / 前面各镜保持完全相同的画面风格（插画↔写实不许跳变），
    // 并逐一点名要锁死外观的元素。即使是特写、空镜也不能换风格——这是「所有镜头都一致」的关键。
    const hasRefs = lockElems.some((a) => a.refImg);
    const lockNames = lockElems.map((a) => `${a.kind}「${a.name}」`);
    // 有定妆参考图的角色：单独点名，把「脸/五官/是同一个人」说到最死——这是压住跨镜换脸的关键约束。
    const charRefs = lockElems.filter((a) => a.kind === "角色" && a.refImg);
    const faceLock = charRefs.length
      ? `画面里的人物${charRefs.map((a) => `「${a.name}」`).join("、")}必须严格以参考图中的人物为准：五官、脸型、眉眼、发型、发色、服饰颜色与款式完全一致，是同一个人，绝不允许换脸、换成其他长相或年龄的人；`
      : "";
    const consistencyNote =
      `整片风格严格统一：与${hasRefs ? "设定参考图和" : ""}前面各镜保持完全一致的画面风格（相同的插画/写实取向、渲染方式、色调、笔触与质感），` +
      `严禁在写实与动漫/插画之间跳变；` +
      faceLock +
      (lockNames.length ? `${lockNames.join("、")}的外观（长相、发型、服饰、造型、颜色、材质、比例）在所有镜头中必须与设定参考图完全一致、不得改变；` : "") +
      `场景、角色、道具的外观也与全片保持一致`;
    // 编辑视频：强约束「只改指定部分」——人物、场景、画面风格与原视频保持一致，避免整体风格相对前一镜/原片跳变
    const editNote = opts?.editText?.trim()
      ? `。这是对已有视频的局部修改：在保持画面中人物外观、场景环境、整体画面风格与原视频完全一致的前提下，仅按以下要求改动对应局部，其余部分不要改动：${opts.editText.trim()}`
      : "";
    // 尾帧约束（跨镜人物一致的关键）：当前可用的 seedance 系列「不支持参考图锁人物」（reference 模式会 400），
    // 唯一能保住跨镜同一个人的手段就是「让人脸从上一镜尾帧、经首帧衔接传到下一镜」。且实测这些模型不拦真人首帧，
    // 所以本镜若有出场人物，就让主角在结尾帧清晰稳定地出现（脸别糊/别背身），下一镜承接同一张脸；无人物镜则收在稳定环境。
    const isChained = idx >= 0 && idx < liveShots.length - 1;
    const hasCharInShot = bound.some((a) => a.kind === "角色");
    const tailRule = isChained
      ? (hasCharInShot
          ? "。【结尾帧要求】本镜最后 1 秒让主要人物清晰、稳定地出现在画面中（正面或近景为佳，光线充足、五官清楚、构图稳定，不要背影/不要糊脸），以便作为下一镜的首帧，让下一镜自然承接同一个人物、保持跨镜人物完全一致"
          : "。【结尾帧要求】本镜最后 1 秒收束在稳定的环境/景物画面，便于作为下一镜首帧自然衔接")
      : "";
    // 画面主体前置：本镜若有出场角色，把「角色必须作为主体清晰出现」提到最前面。
    // 否则 300+ 字风景描述会把人物淹没，模型常只出空镜/风景、漏掉出镜角色（出镜元素没生成出来的根因）。
    const boundChars = bound.filter((a) => a.kind === "角色");
    const subjectLead = boundChars.length
      ? `【画面主体】本镜必须清晰呈现角色${boundChars.map((a) => `「${a.name}」`).join("、")}：真人出镜、位于画面主要位置、体量足够大、面部清楚可见，是本镜的主角，绝不能拍成没有人物的纯风景空镜。`
      : "";
    const prompt = [stylePrefix, subjectLead, `${cur.shotDesc}${elemText}${editNote}`, shotMeta, consistencyNote].filter(Boolean).join("，") + tailRule;
    const generateAudio = settings.配音 !== "不配音";

    // 首帧 = 外部传入的衔接帧（imageOverride）优先，否则本镜自设首帧图（cur.firstFrame）。imageOverride 由 genShot/genAll 按模式给：
    //   首尾帧(keyframe)=首帧图（镜头1 自设首帧 / 第 2 镜起上一镜尾帧图）；文本/智能多帧=上一镜真实视频尾帧。
    // 都没有则纯文生（首镜常见）。参考图「不」作首帧。
    const imageUrl = imageOverride ?? cur.firstFrame;
    // 参考图（reference_image）：锁本镜人物/场景/道具外观。
    // 策略：默认「首帧承接」为跨镜一致的主手段；参考图能否叠加取决于模型能力。
    //  - 有首帧的镜（第 2 镜起 / 自设首帧）：默认只用首帧承接，不加参考图（Seedance 混用会被网关拒→降级丢参考图）；
    //    仅当模型支持「首帧 + 参考图」同时使用（modelSupportsFrameAndRef）时，才在首帧之上叠加参考图锁脸。
    //  - 无首帧的镜（首镜纯文生）：直接注入参考图去锁外观。
    const refImgUrls = Array.from(new Set(lockElems.filter((a) => a.refImg).map((a) => a.refImg as string)));
    const referenceImageUrls = imageUrl
      ? (modelSupportsFrameAndRef(settings.模型) ? refImgUrls : [])
      : refImgUrls;
    const tailImageUrl = opts?.tailOverride ?? (genMode === "keyframe" ? cur.lastFrame : undefined);

    return fetch("/api/video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        ratio: settings.视频比例,
        dur: `${cur.dur}秒`,
        model: modelIdOf(settings.模型),
        resolution: qualityToRes(settings.视频质量),
        generateAudio,
        ...(imageUrl ? { imageUrl } : {}),
        ...(tailImageUrl ? { tailImageUrl } : {}),
        ...(referenceImageUrls.length ? { referenceImageUrls } : {}),
      }),
      signal: AbortSignal.timeout(450_000),
    })
      .then(async (r) => {
        window.clearInterval(iv);
        genInFlight.current.delete(id);
        const j = (await r.json().catch(() => ({}))) as { videoUrl?: string; error?: unknown; degraded?: boolean; degradeReason?: string };
        if (!r.ok || !j.videoUrl) {
          const reason = mapVideoErr(j.error, r.status);
          setShots((prev) => prev.map((s) => (s.id === id ? { ...s, status: "failed", pct: 0, failReason: reason } : s)));
          return undefined;
        }
        // 字幕/声音「脚本有就做，没有不做」：不再自动杜撰字幕，仅用脚本填写的字幕字段
        setShots((prev) => prev.map((s) => (s.id === id ? { ...s, status: "done", pct: 100, videoUrl: j.videoUrl, genElemSig: elemSig(cur.assetRefs, liveAssets), failReason: undefined, degraded: Boolean(j.degraded), degradeReason: j.degraded ? j.degradeReason : undefined } : s)));
        // 降级（参考图被网关拒收）不再向用户提示；仅内部保留 degraded 状态，控制台仍有日志便于排查。
        if (j.degraded) console.warn("[studio] 本镜降级生成：", j.degradeReason || "参考图被网关拒绝");
        persistProject(); // 生成完成 → 默认存为项目文件（后台完成时也生效）
        // 本镜生成成功 → 立即把这段分镜视频存入「我的素材」仓库（按真实地址去重；重生成的新片段也会入库）
        addMaterial({
          emoji: "🎬",
          grad: "thumb-grad-3",
          kind: "视频",
          name: `${projectName} · 镜${idx + 1}（${cur.dur}s）`,
          sub: "分镜视频 · 制作大片",
          img: cur.poster,
          videoUrl: j.videoUrl,
          time: nowStamp(),
          edit: { sub: "studio" },
        });
        return j.videoUrl;
      })
      .catch((e: unknown) => {
        window.clearInterval(iv);
        genInFlight.current.delete(id);
        const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
        setShots((prev) =>
          prev.map((s) => (s.id === id ? { ...s, status: "failed", pct: 0, failReason: timeout ? "生成超时（视频耗时过长），请重试" : "网络异常，请重试" } : s))
        );
        return undefined;
      });
  }

  // 逐镜生成（单镜手动触发）。首帧策略按生成模式区分：
  // - 首尾帧(keyframe)：首帧按「首帧图」——镜头1 用自设首帧，第 2 镜起用上一镜的「尾帧图」（inheritedFirst）；
  //   尾帧按本镜「尾帧图」。即完全按用户设定的两张图 flf2v，衔接靠「镜头N首帧图 == 镜头N-1尾帧图」（同一张图）保证。
  // - 文本/智能多帧：第 2 镜起强制无缝——以上一镜生成视频的真实最后一帧作为首帧，保证 N 首帧 == N-1 真实尾帧。
  async function genShot(id: string) {
    const liveShots = (getStudioSnapshot() as { shots?: Shot[] }).shots ?? shots;
    const idx = liveShots.findIndex((s) => s.id === id);
    const cur = liveShots[idx];
    if (!cur || cur.status === "gen") return;
    // 顺序生成：必须先把前面所有镜头生成好，才能生成本镜（不能先生成后面）
    if (liveShots.slice(0, idx).some((s) => s.status !== "done")) {
      toast("请先按顺序生成前面的镜头", "warn");
      return;
    }
    const prev = idx > 0 ? liveShots[idx - 1] : undefined;
    let chainFrame: string | undefined;
    if (genMode === "keyframe") {
      // 首尾帧：首帧按图。镜头1 用自设首帧；第 2 镜起用上一镜尾帧图（与 UI「承接上一镜尾帧」一致）。
      chainFrame = idx > 0 ? prev?.lastFrame : cur.firstFrame;
    } else if (idx > 0 && prev?.status === "done" && prev.videoUrl) {
      // 文本/智能多帧的强制无缝：抽上一镜真实尾帧作首帧。
      setShots((p) => p.map((s) => (s.id === id ? { ...s, status: "gen", pct: 2, failReason: undefined } : s)));
      const res = await extractLastFrame(prev.videoUrl);
      chainFrame = res.frame;
      if (!chainFrame) {
        // 抽帧失败「不」静默降级为纯文生（那样本镜首帧必然对不上上一镜尾帧）。标记失败让用户重试。
        const reason = res.reason ?? "未能读取上一镜尾帧，无法衔接，请重试";
        setShots((p) => p.map((s) => (s.id === id ? { ...s, status: "failed", pct: 0, failReason: reason } : s)));
        toast(reason, "warn");
        return;
      }
    }
    // 两头无缝：若「后一镜」已有视频（多见于重新生成中间镜头），抽它的真实首帧作本镜尾帧，
    // 保证 本镜尾帧 == 后一镜首帧，与前一镜首帧衔接一起形成前后都无缝。
    // 正常顺序生成时后一镜尚未生成，此分支不触发；抽帧失败也不阻断，只是尾端尽力贴合。
    const nextShot = liveShots[idx + 1];
    let tailOverride: string | undefined;
    if (nextShot && nextShot.status === "done" && nextShot.videoUrl) {
      setShots((p) => p.map((s) => (s.id === id ? { ...s, status: "gen", pct: 2, failReason: undefined } : s)));
      const nres = await extractLastFrame(nextShot.videoUrl, "first");
      if (nres.frame) tailOverride = nres.frame;
    }
    await runShot(id, chainFrame, tailOverride ? { tailOverride } : undefined);
  }

  // 编辑视频（视频生视频）：保持这一镜的首帧和尾帧不变，仅按用户编辑要求修改中间画面内容。
  async function editShotVideo(id: string, editText: string) {
    if (genInFlight.current.has(id)) return;
    const shot = shots.find((s) => s.id === id);
    if (!shot?.videoUrl) return toast("这一镜还没有视频，无法编辑", "warn");
    if (!editText.trim()) return toast("请填写要修改的内容", "warn");
    setShots((p) => p.map((s) => (s.id === id ? { ...s, status: "gen", pct: 2, failReason: undefined } : s)));
    // 抽当前视频的首帧 + 尾帧作为「不变」的首尾约束，中间内容按编辑要求重生成
    const [first, last] = await Promise.all([
      extractLastFrame(shot.videoUrl, "first"),
      extractLastFrame(shot.videoUrl, "last"),
    ]);
    if (!first.frame || !last.frame) {
      setShots((p) => p.map((s) => (s.id === id ? { ...s, status: "done", pct: 100 } : s))); // 复原
      return toast("读取视频首尾帧失败，请重试", "warn");
    }
    await runShot(id, first.frame, { tailOverride: last.frame, editText });
  }

  // 审核失败一键改写重试：用 LLM 把这镜画面描述改写成能过审的版本 → 更新描述（editShot 会把该镜复位）→ 自动重新生成。
  async function aiSafeRewriteShot(id: string) {
    if (safeRewriteId) return;
    const base = shots.find((s) => s.id === id)?.shotDesc.trim();
    if (!base) return toast("这一镜没有画面描述，无法改写", "warn");
    setSafeRewriteId(id);
    try {
      const resp = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene: "studio-safe-rewrite", input: base }),
      });
      if (!resp.ok || !resp.body) {
        const j = (await resp.json().catch(() => ({}))) as { error?: string };
        toast(j.error || "改写失败，请重试", "warn");
        return;
      }
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop() ?? "";
        for (const evt of events) {
          const line = evt.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          try {
            const j = JSON.parse(line.slice(5).trim()) as { text?: string };
            if (j.text) acc += j.text;
          } catch {
            /* 跳过 */
          }
        }
      }
      const rewritten = acc.trim();
      if (!rewritten) return toast("改写为空，请重试", "warn");
      editShot(id, { shotDesc: rewritten }); // 改画面描述 → 该镜由 failed 复位为 idle
      toast("已按审核规则改写，正在重新生成…");
      await genShot(id); // runShot/genShot 读最新快照，用的是改写后的新描述
    } catch {
      toast("改写中断，请重试", "warn");
    } finally {
      setSafeRewriteId(null);
    }
  }

  // 批量生成：按镜头顺序「依次」生成，每镜完成后抽取尾帧作为下一镜首帧，保证全片画面连贯。
  async function genAll() {
    if (genAllRunning.current) return toast("正在批量生成中，请稍候…", "warn"); // 防重入：正在跑就别再点
    if (genInFlight.current.size > 0) return toast("有镜头正在生成中，请等它完成再批量生成", "warn");
    const pending = shots.filter((s) => s.status !== "done");
    if (!pending.length) {
      toast("全部分镜已生成完成");
      return;
    }
    // 一致性预检：有「角色」元素但缺参考图 → 各镜人物会长得不一样，先提醒去②生成角色参考图。
    const charsNoRef = assets.filter((a) => a.kind === "角色" && !a.refImg);
    if (charsNoRef.length) {
      const go = await appConfirm(
        `有 ${charsNoRef.length} 个角色还没有参考图（${charsNoRef.map((a) => a.name).slice(0, 4).join("、")}${charsNoRef.length > 4 ? "…" : ""}）。缺角色参考图时，人物在各镜之间会长得不一样。建议先到「② 场景角色道具」用「一键生成全部图片」给角色出参考图，再来生成视频。仍要现在生成吗？`
      );
      if (!go) return;
    }
    const mult = qualityMult(settings.视频质量 ?? "");
    const cost = pending.length * mult;
    const ok = await appConfirm(
      `本次将按顺序依次生成 ${pending.length} 个分镜（真实视频，单镜约 3–4 分钟，后一镜自动衔接前一镜尾帧），预计消耗 ${cost} 次生成额度${mult > 1 ? `（${settings.视频质量} 高清 ×${mult}）` : ""}。是否继续？`
    );
    if (!ok) return;
    genAllRunning.current = true;
    toast(`已开始按顺序生成 ${pending.length} 个分镜`);
    // 用当前快照按顺序遍历；靠局部 prevUrl 传递衔接帧，避免依赖异步中的 state
    const snapshot = shots;
    let prevUrl: string | undefined;
    try {
    for (let k = 0; k < snapshot.length; k++) {
      const s = snapshot[k];
      if (s.status === "done") {
        prevUrl = s.videoUrl;
        continue;
      }
      let chain: string | undefined;
      if (genMode === "keyframe") {
        // 首尾帧：首帧按图——镜头1 用自设首帧，第 2 镜起用上一镜尾帧图（尾帧仍由 runShot 取本镜尾帧图）
        chain = k > 0 ? snapshot[k - 1]?.lastFrame : s.firstFrame;
      } else if (k > 0 && prevUrl) {
        // 文本/智能多帧的强制无缝：第 2 镜起从上一镜真实尾帧接续，保证镜头 N 首帧 == 镜头 N-1 真实尾帧
        const res = await extractLastFrame(prevUrl);
        chain = res.frame;
        if (!chain) {
          // 抽帧失败不静默降级为纯文生，否则本镜首帧对不上上一镜尾帧。停止批量、标记失败，让用户重试。
          const reason = res.reason ?? "未能读取上一镜尾帧，无法衔接，请重试";
          setShots((p) => p.map((sh) => (sh.id === s.id ? { ...sh, status: "failed", pct: 0, failReason: reason } : sh)));
          toast(`镜头 ${k + 1}：${reason}（已停止，请重试该镜后继续）`, "warn");
          break;
        }
      }
      const url = await runShot(s.id, chain);
      if (!url) {
        // 某镜失败 → 停止批量（不能先生成后面），提示用户重试该镜后再继续
        toast(`镜头 ${k + 1} 生成失败，已停止批量生成，请重试该镜后继续`, "warn");
        break;
      }
      await ensureVideoCached(url); // 本镜先缓存到本地，下一镜抽尾帧直接读本地完整视频，衔接更稳
      prevUrl = url;
    }
    } finally {
      genAllRunning.current = false;
    }
  }

  // 一键生成全部元素参考图（并行 + 后台）：提升到 Studio → 用户切到其它步骤/页面后仍在后台继续，回来还能看进度。
  // 首次提示「去生成设置」的拦截在 AssetsStep 里做（那是本地弹窗），此处只负责确认 + 并行生成。
  async function genAllImages(redoAll = false) {
    if (genImgRunning.current || genImgBusy) return;
    const liveAssets = (getStudioSnapshot() as { assets?: Asset[] }).assets ?? assets;
    const targets = redoAll ? liveAssets : liveAssets.filter((a) => !a.refImg);
    if (!targets.length) return toast(redoAll ? "还没有元素" : "所有元素都已有参考图（如需重做，点「一键全部重做」或各卡片的「AI 生成」）", "warn");
    const ask = redoAll
      ? `将按当前视频风格「${settings.视频风格}」重做全部 ${targets.length} 个元素的参考图（覆盖现有图片）。是否继续？`
      : `将为 ${targets.length} 个元素并行「优化描述 + AI 生成参考图」，可切换到其它步骤，后台会继续生成。是否继续？`;
    if (!(await appConfirm(ask))) return;
    genImgRunning.current = true;
    genImgCancelRef.current = false;
    genImgAborts.clear();
    setGenImgBusy(true);
    setGenImgProg({ done: 0, total: targets.length });
    const stylePrompt = videoStyles.find((v) => v.name === settings.视频风格)?.stylePrompt ?? "";
    // 风格打头（比结尾更有权重），压住「西湖=水墨」这类地标固有偏向；写实再补实拍关键词。
    const styleLead = stylePrompt.trim()
      ? `${settings.视频风格 === "写实" ? "真实摄影照片，实拍质感，" : ""}${stylePrompt.trim()}。`
      : "";
    const styleSuffix = stylePrompt.trim() ? `，整体画面风格：${stylePrompt.trim()}` : "";
    const genModelName = assetGenSettings[ASSET_GEN_MODEL_KEY]?.model ?? STUDIO_IMAGE_MODELS[0].name;
    const genModelId = STUDIO_IMAGE_MODELS.find((m) => m.name === genModelName)?.modelId || "";
    let ok = 0;
    let done = 0;
    // 单个元素：优化描述 → 生图 → 回填参考图（setAssets 会话级持久化，卸载后仍能保存）
    const genOne = async (a: Asset) => {
      const ctrl = new AbortController();
      genImgAborts.add(ctrl);
      try {
        let desc = a.name;
        const expandInput = `【剧本背景】\n${script?.trim() || "（无）"}\n\n【${a.kind}】${a.name}\n\n请据剧本背景，${assetExpandInstr(a.kind)}，输出一段话，风格与剧本统一。`;
        const er = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scene: "studio-asset-desc", input: expandInput, styleHint: stylePrompt }),
          signal: ctrl.signal,
        });
        if (er.ok && er.body) {
          const reader = er.body.getReader();
          const dec = new TextDecoder();
          let buf = "";
          let acc = "";
          for (;;) {
            const { done: rdDone, value } = await reader.read();
            if (rdDone) break;
            buf += dec.decode(value, { stream: true });
            const events = buf.split("\n\n");
            buf = events.pop() ?? "";
            for (const evt of events) {
              const line = evt.split("\n").find((l) => l.startsWith("data:"));
              if (!line) continue;
              try { const j = JSON.parse(line.slice(5).trim()) as { text?: string }; if (j.text) acc += j.text; } catch { /* 跳过 */ }
            }
          }
          if (acc.trim()) desc = acc.trim();
        }
        // 角色=「左照片+右三视图」横构图，用宽幅画布（≥3.69M 像素，满足文生图下限），别用正方形挤压
        const size = a.kind === "角色" ? "2816x1536" : (ASSET_SIZE_MAP[assetGenSettings[a.kind]?.size ?? "2K"] || "2048x2048");
        const ir = await fetch("/api/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: `${styleLead}${desc}，${assetKindPrompt(a.kind)}${styleSuffix}`, n: 1, size, ...(genModelId ? { model: genModelId } : {}) }),
          signal: ctrl.signal,
        });
        const j = (await ir.json().catch(() => ({}))) as { images?: string[]; error?: string };
        if (ir.ok && j.images?.length) {
          setAssets((list) => list.map((x) => (x.id === a.id ? { ...x, refImg: j.images![0] } : x)));
          ok++;
        }
      } catch {
        /* 单个失败/被中止跳过 */
      } finally {
        genImgAborts.delete(ctrl);
      }
      done++;
      setGenImgProg({ done, total: targets.length });
    };
    // 并行生成，带并发上限（并发过高会瞬时打满聚合网关的上游通道导致「无可用通道」，降到 3 更稳）
    const CONCURRENCY = 3;
    const queue = [...targets];
    try {
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
          for (let a = queue.shift(); a; a = queue.shift()) {
            if (genImgCancelRef.current) break; // 用户点了停止 → 不再取新任务
            await genOne(a);
          }
        }),
      );
    } finally {
      genImgRunning.current = false;
      setGenImgBusy(false);
    }
    if (genImgCancelRef.current) toast(`已停止，已生成 ${ok}/${targets.length} 个（其余保留未生成，可再次点一键生成继续）`, "warn");
    else toast(ok ? `已为 ${ok}/${targets.length} 个元素生成参考图` : "生成失败，请重试（检查图片模型配置）", ok ? undefined : "warn");
  }

  // 停止一键生成图片：置模块级取消标志（跨实例）+ 立即中止在飞的请求，无需等当前那批跑完。
  function stopGenAllImages() {
    if (!genImgBusy && !genImgRunning.current) return;
    genImgCancelRef.current = true;
    genImgAborts.forEach((c) => c.abort());
    genImgAborts.clear();
    setGenImgBusy(false);
    toast("已停止生成");
  }

  // 导出：把分镜逐镜画面用 Ken Burns 录制并拼接为一段真实长视频
  async function exportFilm(opts: { subtitles: boolean; audio: boolean } = { subtitles: true, audio: true }) {
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
      // 预下载每镜真实视频为「同源 blobURL」：外链视频直接 drawImage 会污染 canvas 导致录制失败，
      // 经 /api/media 代理下载为 blob（同源）后播放即可安全绘制。无 videoUrl 的镜头回退占位海报。
      const clips = await Promise.all(
        filmShots.map(async (s) => {
          if (!s.videoUrl) return { blobUrl: null as string | null, poster: s.poster, revoke: false };
          // 本地上传的视频（blob:/data:）已同源，直接用，不走代理（代理取不到浏览器内 blob）；revoke=false 避免释放原始 URL
          if (s.videoUrl.startsWith("blob:") || s.videoUrl.startsWith("data:")) return { blobUrl: s.videoUrl, poster: s.poster, revoke: false };
          try {
            const blob = await fetch(`/api/media?url=${encodeURIComponent(s.videoUrl)}`).then((r) => (r.ok ? r.blob() : null));
            return { blobUrl: blob && blob.size ? URL.createObjectURL(blob) : null, poster: s.poster, revoke: true };
          } catch {
            return { blobUrl: null as string | null, poster: s.poster, revoke: false };
          }
        }),
      );

      const stream = canvas.captureStream(30);
      // 需要声音时：建音频图，把各镜视频的音轨汇入一个 MediaStreamDestination，并入录制流
      let audioCtx: AudioContext | null = null;
      let audioDest: MediaStreamAudioDestinationNode | null = null;
      if (opts.audio && typeof AudioContext !== "undefined") {
        try {
          audioCtx = new AudioContext();
          audioDest = audioCtx.createMediaStreamDestination();
          const at = audioDest.stream.getAudioTracks()[0];
          if (at) stream.addTrack(at);
        } catch { audioCtx = null; audioDest = null; }
      }
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

      const captionOn = opts.subtitles; // 由导出选项决定是否烧字幕
      // 按「全片时间」匹配时间轴字幕（多段、可跨镜），与预览显示逻辑一致
      const capAt = (gt: number) => (captionOn ? subtitles.find((s) => gt >= s.start && gt < s.start + s.dur)?.text : undefined);
      let shotStart = 0; // 当前镜在全片时间轴上的起点（与时间轴字幕 start 同基准）
      rec.start();
      for (let i = 0; i < filmShots.length; i++) {
        const dur = filmShots[i].dur;
        const base = shotStart;
        shotStart += dur;
        const clip = clips[i];
        // 转场叠色：本镜入场（首 half 秒从色淡入）+ 下一镜若设了转场（本镜末 half 秒淡出到色）。默认无则不叠。
        const inC = transColor(filmShots[i].transition);
        const outC = transColor(filmShots[i + 1]?.transition);
        const half = TRANS_DUR / 2;
        const drawTrans = (ct: number) => {
          let color: string | null = null;
          let alpha = 0;
          if (inC && ct < half) { color = inC; alpha = 1 - ct / half; }
          else if (outC && ct > dur - half) { color = outC; alpha = (ct - (dur - half)) / half; }
          if (color && alpha > 0.001) {
            ctx.save();
            ctx.globalAlpha = Math.min(1, alpha);
            ctx.fillStyle = color;
            ctx.fillRect(0, 0, cw, ch);
            ctx.restore();
          }
        };
        if (clip.blobUrl) {
          // 真实视频：逐帧绘制真实画面 + 按时间烧字幕
          const v = document.createElement("video");
          v.src = clip.blobUrl;
          v.muted = !audioDest; // 需要声音则不静音，音频经音频图捕获（不外放）
          v.playsInline = true;
          if (audioCtx && audioDest) {
            try { audioCtx.createMediaElementSource(v).connect(audioDest); } catch { /* 已连接/不支持则忽略 */ }
          }
          await new Promise<void>((res) => {
            v.onloadeddata = () => res();
            v.onerror = () => res();
          });
          try { v.currentTime = 0; await v.play(); } catch { /* muted 视频通常允许自动播放，忽略异常 */ }
          await new Promise<void>((resolve) => {
            const tick = () => {
              const ct = v.currentTime;
              drawVideoFrame(ctx, v, cw, ch, capAt(base + Math.min(ct, dur)));
              drawTrans(ct);
              setExportPct(Math.round(((i + Math.min(1, ct / dur)) / filmShots.length) * 100));
              if (v.ended || ct >= dur) { v.pause(); resolve(); }
              else requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          });
          if (clip.revoke) URL.revokeObjectURL(clip.blobUrl);
        } else {
          // 无真实视频 → 回退占位海报 Ken Burns（仍按时间烧字幕）
          const img = await loadImage(clip.poster);
          const t0 = performance.now();
          await new Promise<void>((resolve) => {
            const tick = () => {
              const p = Math.min(1, (performance.now() - t0) / 1000 / dur);
              drawKenBurns(ctx, img, cw, ch, p, capAt(base + p * dur));
              drawTrans(p * dur);
              setExportPct(Math.round(((i + p) / filmShots.length) * 100));
              if (p >= 1) resolve();
              else requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          });
        }
      }
      await new Promise((r) => window.setTimeout(r, 150));
      rec.stop();
      await finished;
      try { await audioCtx?.close(); } catch { /* 忽略 */ }
    } catch {
      toast("导出失败，请重试", "warn");
    } finally {
      setExporting(false);
      setExportPct(0);
    }
  }

  // 只导出字幕（.srt 文件）：把时间轴字幕按 SRT 格式导出，可导入剪辑软件二次使用
  // 把时间轴字幕拼成 SRT 文本（供「只导出字幕」和「素材包」复用）
  function buildSrt(): string {
    const fmt = (t: number) => {
      const ms = Math.max(0, Math.round(t * 1000));
      const h = String(Math.floor(ms / 3600000)).padStart(2, "0");
      const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, "0");
      const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");
      return `${h}:${m}:${s},${String(ms % 1000).padStart(3, "0")}`;
    };
    return [...subtitles]
      .sort((a, b) => a.start - b.start)
      .map((s, i) => `${i + 1}\n${fmt(s.start)} --> ${fmt(s.start + s.dur)}\n${s.text}\n`)
      .join("\n");
  }

  function exportSubtitles() {
    if (!subtitles.length) {
      toast("还没有字幕可导出", "warn");
      return;
    }
    const blob = new Blob([buildSrt()], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "制作大片_字幕.srt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast("已导出字幕文件（.srt）");
  }

  // 取某片段的完整 blob：优先本地缓存，其次 /api/media 代理（本地 blob:/data: 直取）
  async function fetchClipBlob(url: string): Promise<Blob | null> {
    if (/^https?:\/\//i.test(url)) {
      const cached = await getCachedVideo(url);
      if (cached && cached.size) return cached;
      return fetch(`/api/media?url=${encodeURIComponent(url)}`).then((r) => (r.ok ? r.blob() : null)).catch(() => null);
    }
    return fetch(url).then((r) => (r.ok ? r.blob() : null)).catch(() => null); // blob:/data:
  }

  // 重新导出素材：≥2 镜打成一个 .zip（含字幕可选）；仅 1 镜直接下单文件。
  async function exportClips(includeSubs = false): Promise<number> {
    const list = (doneShots.length ? doneShots : shots).filter((s) => s.videoUrl);
    if (!list.length) {
      toast("没有已生成的分镜片段可导出", "warn");
      return 0;
    }
    // 只有 1 个片段 → 直接下单文件（无需打包）
    if (list.length < 2) {
      await downloadVideo(list[0].videoUrl as string, `${projectName}_镜头1.mp4`);
      if (includeSubs && subtitles.length) exportSubtitles();
      toast("已导出分镜片段");
      return 1;
    }
    // ≥2 个 → 打包成 zip
    toast(`正在打包 ${list.length} 个片段，请稍候…`);
    const files: { name: string; content: Uint8Array }[] = [];
    for (let i = 0; i < list.length; i++) {
      const blob = await fetchClipBlob(list[i].videoUrl as string);
      if (blob && blob.size) files.push({ name: `镜头${i + 1}.mp4`, content: new Uint8Array(await blob.arrayBuffer()) });
    }
    if (!files.length) {
      toast("片段下载失败，请重试", "warn");
      return 0;
    }
    if (includeSubs && subtitles.length) {
      files.push({ name: "字幕.srt", content: new TextEncoder().encode(buildSrt()) });
    }
    const zip = makeZip(files);
    const url = URL.createObjectURL(zip);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectName}_素材包.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 8000);
    toast(`已打包导出 ${files.length} 个文件（.zip）`);
    return files.length;
  }

  // 导出剪映素材包：全部分镜片段 + 字幕(.srt) 打包，供拖入剪映二次剪辑（非剪映专有工程草稿）
  async function exportDraftPack() {
    await exportClips(true);
  }

  // 只导出声音（音频文件）：把各镜视频的音轨顺序汇入音频图录制为一段音频
  async function exportAudioOnly() {
    if (exporting) return;
    const filmShots = doneShots.length ? doneShots : shots;
    const withVideo = filmShots.filter((s) => s.videoUrl);
    if (!withVideo.length) {
      toast("没有已生成的视频，无法导出声音", "warn");
      return;
    }
    if (typeof AudioContext === "undefined" || typeof MediaRecorder === "undefined") {
      toast("当前浏览器不支持音频导出", "warn");
      return;
    }
    setExporting(true);
    setExportPct(0);
    toast("正在导出声音，请稍候…");
    try {
      const clips = await Promise.all(
        withVideo.map(async (s) => {
          const u = s.videoUrl as string;
          if (u.startsWith("blob:") || u.startsWith("data:")) return { blobUrl: u, revoke: false };
          const blob = await fetch(`/api/media?url=${encodeURIComponent(u)}`).then((r) => (r.ok ? r.blob() : null)).catch(() => null);
          return { blobUrl: blob && blob.size ? URL.createObjectURL(blob) : null, revoke: true };
        }),
      );
      const audioCtx = new AudioContext();
      const dest = audioCtx.createMediaStreamDestination();
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "";
      const rec = new MediaRecorder(dest.stream, mime ? { mimeType: mime } : undefined);
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      const finished = new Promise<void>((resolve) => {
        rec.onstop = () => {
          const type = rec.mimeType || "audio/webm";
          const ext = type.includes("mp4") ? "m4a" : "webm";
          const blob = new Blob(chunks, { type });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `制作大片_声音.${ext}`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          window.setTimeout(() => URL.revokeObjectURL(url), 5000);
          toast(`已导出声音到本地（.${ext}）`);
          resolve();
        };
      });
      rec.start();
      for (let i = 0; i < clips.length; i++) {
        const c = clips[i];
        if (!c.blobUrl) continue;
        const v = document.createElement("video");
        v.src = c.blobUrl;
        v.muted = false;
        v.playsInline = true;
        try { audioCtx.createMediaElementSource(v).connect(dest); } catch { /* 忽略 */ }
        await new Promise<void>((res) => { v.onloadeddata = () => res(); v.onerror = () => res(); });
        try { v.currentTime = 0; await v.play(); } catch { /* 忽略 */ }
        await new Promise<void>((resolve) => {
          const tick = () => {
            setExportPct(Math.round(((i + Math.min(1, v.currentTime / (v.duration || withVideo[i].dur))) / clips.length) * 100));
            if (v.ended) { v.pause(); resolve(); }
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        if (c.revoke) URL.revokeObjectURL(c.blobUrl);
      }
      await new Promise((r) => window.setTimeout(r, 150));
      rec.stop();
      await finished;
      try { await audioCtx.close(); } catch { /* 忽略 */ }
    } catch {
      toast("声音导出失败，请重试", "warn");
    } finally {
      setExporting(false);
      setExportPct(0);
    }
  }

  // M9：成片自动交付——分镜全部生成后，默认自动存入「我的作品 / 仓库」并提交审核，
  // 无需用户手动点按钮。按视频 URL 签名去重，避免重复入库；同一成片只交付一次。
  const deliveredSigRef = useRef<string>("");
  function autoDeliver(film: Shot[]) {
    const sig = film.map((s) => s.videoUrl || "").join("|");
    if (!sig || deliveredSigRef.current === sig) return;
    deliveredSigRef.current = sig;
    const card: AssetCard = {
      emoji: "🎬",
      grad: "thumb-grad-1",
      kind: "视频",
      name: `${projectName} · ${film.length}镜 / ${film.reduce((a, s) => a + s.dur, 0)}s`,
      sub: "视频生成 · 制作大片",
      img: film[0].poster,
      videoUrl: film[0].videoUrl, // 代表视频（首镜），供预览/调取
      time: nowStamp(),
      edit: { sub: "studio" },
    };
    try {
      addWork(card); // 成片默认存入作品库（各分镜视频已在生成成功时即时存入素材仓库）
      toast("成片已自动存入作品库并提交审核"); // 审核默认自动提交
    } catch (e) {
      if (e instanceof DOMException && e.name === "QuotaExceededError") {
        toast("本地存储空间不足，作品可能未保存", "warn");
      }
    }
  }

  // 所有分镜生成完成 → 自动交付（存库 + 提交审核），全程无需手动操作
  useEffect(() => {
    if (!shots.length) return;
    if (!shots.every((s) => s.status === "done" && s.videoUrl)) return;
    autoDeliver(shots);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shots]);

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
            </div>
            {/* 步骤导航移到顶部 header 中部（原项目信息/进度文字已删除），横向、可点击切换 */}
            <nav className="studio-tabs">
              {studioSteps.map((s, i) => {
                const state = i < activeIdx ? "done" : i === activeIdx ? "on" : "";
                return (
                  <button key={s.key} className={`st-tab ${state}`} onClick={() => setStepKey(s.key)}>
                    <span className="st-tab-no">{s.no}</span>
                    <span className="st-tab-name">{s.name}</span>
                  </button>
                );
              })}
            </nav>
            <div className="st-right">
              <button className="st-edit-btn" onClick={() => setEditProjOpen(true)} title="编辑项目视频预设">
                <Icon name="gear" size={15} /> 编辑项目
              </button>
            </div>
          </header>

          <div className="studio-body">
            <main className="studio-stage">
              <div className="stage-canvas">
                <StudioStepView
                  stepKey={stepKey}
                  goStep={setStepKey}
                  toast={toast}
                  script={script}
                  setScript={setScript}
                  aiExpandShot={aiExpandShot}
                  aiBusyId={aiBusyId}
                  totalSec={totalSec}
                  targetShots={targetShots}
                  setShotCount={setShotCount}
                  setTotal={setTotal}
                  genMode={genMode}
                  setGenMode={setGenMode}
                  recognizeElements={recognizeAllElements}
                  elemMatchBusy={elemMatchBusy}
                  settings={settings}
                  setSettings={setSettings}
                  assets={assets}
                  setAssets={setAssets}
                  genAllImages={genAllImages}
                  stopGenAllImages={stopGenAllImages}
                  voiceMatchBusy={voiceMatchBusy}
                  genImgBusy={genImgBusy}
                  genImgProg={genImgProg}
                  shots={shots}
                  ratio={ratio}
                  cache={cachedVideos}
                  rebuildShots={rebuildShots}
                  editShot={editShot}
                  removeShot={removeShot}
                  addShot={addShot}
                  addVideoShot={addVideoShot}
                  moveShot={moveShot}
                  duplicateShot={duplicateShot}
                  toggleLock={toggleLock}
                  genShot={genShot}
                  aiSafeRewriteShot={aiSafeRewriteShot}
                  safeRewriteId={safeRewriteId}
                  genAll={genAll}
                  exportFilm={exportFilm}
                  exportSubtitles={exportSubtitles}
                  exportAudio={exportAudioOnly}
                  exportClips={exportClips}
                  exportDraft={exportDraftPack}
                  exporting={exporting}
                  exportPct={exportPct}
                  onPlayClip={setPlayingClip}
                  onEditVideo={setEditVideoFor}
                  seekTarget={seekTarget}
                  onPreviewTime={setPreviewTime}
                  voiceTracks={voiceTracks}
                  voiceOffsets={voiceOffsets ?? {}}
                  synthVoices={synthVoices}
                  synthBusy={synthBusy}
                  speakerBusy={speakerBusy}
                  audioMode={audioMode ?? "dub"}
                  setAudioMode={setAudioMode}
                  bgm={bgm}
                  setBgm={setBgm}
                  openLibraryPicker={openLibraryPicker}
                  subtitles={subtitles}
                  assetGenSettings={assetGenSettings}
                  setAssetGenSettings={setAssetGenSettings}
                  studioInput={studioInput}
                  setStudioInput={setStudioInput}
                  studioIdea={studioIdea}
                  setStudioIdea={setStudioIdea}
                  studioSummary={studioSummary}
                  setStudioSummary={setStudioSummary}
                />
              </div>

              {stepKey === "preview" && (
                <Timeline
                  shots={shots}
                  totalDur={totalDur}
                  head={previewTime}
                  onScrub={scrubTo}
                  subtitles={subtitles}
                  onMoveSub={moveSubtitle}
                  onResizeSub={resizeSubtitle}
                  onEditSub={editSubtitle}
                  onRemoveSub={removeSubtitle}
                  onAddSub={addSubtitleAt}
                  onPlayClip={setPlayingClip}
                  voiceTracks={voiceTracks}
                  voiceOffsets={voiceOffsets ?? {}}
                  voiceSegs={voiceSegs ?? {}}
                  onMoveVoice={setVoiceOffset}
                  onGenShotDub={(shot) => setDubConfigShot(shot)}
                  synthBusy={synthBusy}
                  onOpenBgm={() => setBgmPickerOpen(true)}
                  audioMode={audioMode ?? "dub"}
                  setAudioMode={setAudioMode}
                  assets={assets}
                  bgm={bgm}
                  exportFilm={exportFilm}
                  exportDraft={exportDraftPack}
                  exportClips={exportClips}
                  exportSubtitles={exportSubtitles}
                  exporting={exporting}
                  exportPct={exportPct}
                />
              )}
            </main>
          </div>
        </div>
      </div>
      {playingClip && (
        <ClipPlayerModal
          shot={playingClip}
          caption={settings.字幕 !== "隐藏" ? playingClip.caption : ""}
          cache={cachedVideos}
          onClose={() => setPlayingClip(null)}
        />
      )}
      {/* ⑤ 时间轴「生成配音」：为该镜主角色弹「声音设置」，确定后合成这一镜的配音 */}
      {dubConfigShot && (() => {
        const ch = assets.find((a) => dubConfigShot.assetRefs.includes(a.id) && a.kind === "角色") ?? assets.find((a) => a.kind === "角色");
        if (!ch) { toast("这一镜没有出场角色，请先在②角色场景道具添加角色并选音色", "warn"); setDubConfigShot(null); return null; }
        const shotId = dubConfigShot.id;
        return (
          <VoiceSettingsModal
            asset={ch}
            confirmLabel={voiceTracks[shotId] ? "重新生成" : "生成配音"}
            onSave={(v) => {
              setAssets((list) => list.map((x) => (x.id === ch.id ? { ...x, voice: v } : x)));
              setDubConfigShot(null);
              // 等 voice 写入后再合成这一镜（下一帧）
              window.setTimeout(() => void synthVoices(shotId), 30);
            }}
            onClose={() => setDubConfigShot(null)}
            toast={toast}
          />
        );
      })()}
      {/* ⑤ 时间轴「添加背景音乐」：内置曲库 + 上传本地音乐的选择弹层 */}
      {bgmPickerOpen && (
        <BgmPickerModal
          current={bgm}
          onPick={(b) => { setBgm(b); setBgmPickerOpen(false); }}
          onClose={() => setBgmPickerOpen(false)}
          toast={toast}
        />
      )}
      {editVideoFor && (
        <EditVideoModal
          shot={editVideoFor}
          onClose={() => setEditVideoFor(null)}
          onSubmit={(text) => { const id = editVideoFor.id; setEditVideoFor(null); editShotVideo(id, text); }}
        />
      )}
      {picker && (
        <LibraryPicker
          filter={picker.filter}
          onPick={(item) => {
            picker.onPick(item);
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}
      {editProjOpen && (
        <EditProjectModal
          settings={settings}
          onSave={(next) => {
            setSettings((s) => ({ ...s, ...next }));
            setEditProjOpen(false);
            void resolveAutoStyle(); // 若改成了「智能匹配」，据脚本挑一个具体风格并锁定
          }}
          onClose={() => setEditProjOpen(false)}
        />
      )}
    </div>
  );
}

// 「编辑项目」弹窗：修改当前项目的视频预设（与「新建大片」对话框同一套 SETTING_FIELDS）。
// 打开时用当前 settings 初始化草稿，保存时合并回项目 settings。
function EditProjectModal({
  settings,
  onSave,
  onClose,
}: {
  settings: Record<string, string>;
  onSave: (next: Record<string, string>) => void;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const d: Record<string, string> = {};
    for (const f of SETTING_FIELDS) d[f.label] = settings[f.label] ?? f.opts[0];
    return d;
  });
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!mounted) return null;
  return createPortal(
    <div className="sh-mask" onClick={onClose}>
      <div className="sh-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="sh-dialog-title">编辑项目</div>
        <div className="sh-dialog-label">视频设定</div>
        <div className="sh-dialog-settings">
          {SETTING_FIELDS.map((f) => (
            <div className="sh-set-field" key={f.label}>
              <div className="sh-set-label">{f.label}</div>
              <div className="chip-row">
                {f.opts.map((o) => {
                  const on = (draft[f.label] ?? f.opts[0]) === o;
                  return (
                    <span
                      key={o}
                      className={on ? "sel-chip on" : "sel-chip"}
                      onClick={() => setDraft((s) => ({ ...s, [f.label]: o }))}
                    >
                      {o}
                      {f.notes?.[o] && <em className="sel-chip-note">{f.notes[o]}</em>}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="sh-dialog-acts">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => onSave(draft)}>
            保存
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// 分镜视频大播放器：点击分镜卡片播放按钮弹出，原生 controls 自动播放真实 MP4
// 编辑视频弹窗：填写要修改的内容 → 视频生视频（保持首尾帧不变）
function EditVideoModal({ shot, onClose, onSubmit }: { shot: Shot; onClose: () => void; onSubmit: (text: string) => void }) {
  const [text, setText] = useState("");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div className="sh-mask" onClick={onClose}>
      <div className="editvid-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="editvid-hd">
          <b>编辑视频</b>
          <span>保持这一镜的首帧、尾帧不变，仅按要求修改中间画面内容</span>
          <button className="assetgen-x" onClick={onClose} aria-label="关闭"><Icon name="close" size={15} /></button>
        </div>
        {shot.videoUrl && (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video className="editvid-preview" src={playableVideoSrc(shot.videoUrl)} muted playsInline preload="metadata" />
        )}
        <label className="assetgen-lbl">修改要求</label>
        <textarea
          className="assetgen-ta"
          value={text}
          autoFocus
          placeholder="描述要怎么改，如：把老人的衣服换成深灰色、天空改成晴天、加一点雾气…"
          onChange={(e) => setText(e.target.value)}
        />
        <div className="editvid-acts">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>取消</button>
          <button className="btn btn-primary btn-sm" disabled={!text.trim()} onClick={() => onSubmit(text)}>
            <Icon name="sparkle" size={13} /> 生成编辑后的视频
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ClipPlayerModal({ shot, caption, cache, onClose }: { shot: Shot; caption?: string; cache?: Record<string, string>; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!mounted || !shot.videoUrl) return null;
  // 补 #t=0.1 跳过开头黑帧（否则暂停时停在黑色第 0 帧，看着像没画面）；muted 自动播放规避浏览器拦截。
  const base = playableVideoSrc(shot.videoUrl, cache);
  const src = base ? `${base}#t=0.1` : undefined;
  return createPortal(
    <div className="clipm-mask" onClick={onClose}>
      <div className="clipm-panel" onClick={(e) => e.stopPropagation()}>
        <div className="clipm-head">
          <span className="clipm-title">分镜视频</span>
          <button className="clipm-close" aria-label="关闭" onClick={onClose}>
            <Icon name="close" size={20} />
          </button>
        </div>
        <div className="clipm-stage">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video className="clipm-video" src={src} controls autoPlay muted playsInline preload="auto" />
          {caption && <span className="clipm-caption">{caption}</span>}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ① 剧本编辑：左「AI 帮写剧本」对话 + 右剧本文本编辑区。生成 / 编辑的剧本存入 script，
// 「下一步」按剧本自动拆分镜（rebuildShots）。镜头数 / 总时长 / 生成模式移到「③ 分镜脚本」设定。
// 去掉 LLM 偶尔输出的 markdown 标记（**加粗**、## 标题、- 列表、` 反引号）——脚本编辑是纯文本框、不渲染 markdown，
// 直接显示符号会很乱。清理为自然纯文本。
function stripStudioMd(s: string): string {
  return s
    .replace(/\*\*/g, "") // 去粗体标记 **
    .replace(/(^|\n)(\s{0,3})#{1,6}\s+/g, "$1$2") // 去标题 ## / ###
    .replace(/(^|\n)(\s{0,3})[-*+]\s+/g, "$1$2· ") // 列表 - / * → ·
    .replace(/`+/g, ""); // 去反引号
}

// ① 剧本编辑（三阶段向导）：需求 →「原始创意」→ 确认 →「镜头摘要」→ 确认 →「完整镜头」。
// 每阶段产物可编辑；完成后「下一步」按完整镜头拆分镜。
function ScriptStep({
  script,
  setScript,
  input,
  setInput,
  idea,
  setIdea,
  summary,
  setSummary,
  styleHint,
  useKB,
  rebuildShots,
  setSettings,
  toast,
  goStep,
}: {
  script: string;
  setScript: (s: string) => void;
  input: string; // 用户需求输入（持久化）
  setInput: (s: string) => void;
  idea: string;
  setIdea: (s: string) => void;
  summary: string;
  setSummary: (s: string) => void;
  styleHint: string; // 项目视频风格描述词，注入剧本三阶段生成保持全片文字风格一致
  useKB: boolean; // 是否使用「魔方智绘知识库」生成脚本
  rebuildShots: () => void;
  setSettings: (f: (s: Record<string, string>) => Record<string, string>) => void;
  toast: (s: string, k?: "warn") => void;
  goStep: (k: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  // 底层：调 /api/generate 流式生成，返回清理后的完整文本；onChunk 可选（实时回填编辑框）。不管理 busy。
  async function runGen(scene: string, inputText: string, onChunk?: (s: string) => void): Promise<string> {
    const resp = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scene, input: inputText, styleHint, useKB }),
    });
    if (!resp.ok || !resp.body) {
      const j = (await resp.json().catch(() => ({}))) as { error?: string };
      toast(j.error || "生成失败，请重试", "warn");
      return "";
    }
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let acc = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const events = buf.split("\n\n");
      buf = events.pop() ?? "";
      for (const evt of events) {
        const line = evt.split("\n").find((l) => l.startsWith("data:"));
        if (!line) continue;
        try {
          const j = JSON.parse(line.slice(5).trim()) as { text?: string; error?: string };
          if (j.text) { acc += j.text; onChunk?.(acc); }
          if (j.error) toast(j.error, "warn");
        } catch {
          /* 跳过 */
        }
      }
    }
    const cleaned = stripStudioMd(acc); // 清一遍 markdown 符号（文本框不渲染 markdown）
    onChunk?.(cleaned);
    return cleaned;
  }

  // 单步生成（带 busy + 清空目标）：用于「生成原始创意」
  async function streamGen(scene: string, inputText: string, setTarget: (s: string) => void) {
    if (busy) return;
    if (!inputText.trim()) return toast("内容为空，无法生成", "warn");
    setBusy(true);
    setTarget("");
    try {
      await runGen(scene, inputText, setTarget);
    } catch {
      toast("生成中断，请重试", "warn");
    } finally {
      setBusy(false);
    }
  }

  // 生成完整镜头：镜头摘要不展示给用户 → 后台先据原始创意生成摘要，再据摘要生成完整镜头。
  async function genFullShots() {
    if (busy) return;
    if (!idea.trim()) return toast("请先生成或填写原始创意", "warn");
    setBusy(true);
    setScript("");
    try {
      // 1) 后台生成镜头摘要（不展示，存入 summary 供内部使用）
      toast("正在整理镜头摘要…");
      const sum = await runGen("studio-summary", idea);
      if (!sum.trim()) return toast("镜头摘要生成失败，请重试", "warn");
      setSummary(sum);
      // 2) 据摘要生成完整镜头（实时回填到编辑框）
      toast("正在生成完整镜头…");
      await runGen("studio-shots", sum, setScript);
    } catch {
      toast("生成中断，请重试", "warn");
    } finally {
      setBusy(false);
    }
  }

  function finish() {
    if (!script.trim()) return toast("请先生成或填写完整镜头", "warn");
    const detected = detectSettings(script);
    const keys = Object.keys(detected);
    if (keys.length) {
      setSettings((s) => ({ ...s, ...detected }));
      toast(`已按内容识别设定：${keys.map((k) => `${k.replace("视频", "")} ${detected[k]}`).join("、")}`);
    }
    rebuildShots();
    goStep("assets");
  }

  // 上传剧本：解析 txt/docx（pdf/doc 会给出转换提示）→ 填入「完整镜头」（第三步的正文）
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [parsing, setParsing] = useState(false);
  async function onUploadScript(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = ""; // 允许重复选同一文件
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) return toast("文件不能超过 10MB", "warn");
    if (script.trim() && !(await appConfirm("用上传内容覆盖当前完整镜头？"))) return;
    setParsing(true);
    try {
      const { text, note } = await parseScriptFile(f);
      if (!text.trim()) return toast("未从文件中解析到文字内容", "warn");
      setScript(text);
      toast(note ? `已导入「${f.name}」（${note}）` : `已导入「${f.name}」`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "解析失败，请重试", "warn");
    } finally {
      setParsing(false);
    }
  }

  // 每个步骤编辑框右上角的「复制 / 清空」
  const editorTools = (val: string, setVal: (s: string) => void, title: string) => (
    <div className="script-editor-tools">
      <button className="btn btn-ghost btn-sm" title="复制" onClick={() => { navigator.clipboard?.writeText(val); toast("已复制"); }}>复制</button>
      <button className="btn btn-ghost btn-sm" title="清空" onClick={async () => { if (val && !(await appConfirm(`清空当前${title}？`))) return; setVal(""); }}>清空</button>
    </div>
  );

  return (
    <div className="stage-panel">
      <div className="sp-title">① 脚本编辑</div>
      <div className="sp-sub">两步竖排，逐步向下：填需求 →「原始创意」→「完整镜头」，每步都可编辑（镜头摘要由 AI 后台自动整理，无需手动）。完成后「下一步」按镜头拆分。</div>

      <div className="script-vlist">
        {/* 第一步 · 原始创意 */}
        <section className="script-vstep">
          <div className="script-vstep-hd"><span className="script-vstep-no">1</span> 原始创意</div>
          <div className="script-chat-tip">告诉我：类型 + 故事，AI 先给出世界观 / 主角 / 故事梗概</div>
          <textarea className="script-ask" value={input} placeholder="例如：做一条安吉白茶的温馨文旅短片，突出高山云雾茶园和采茶姑娘…" onChange={(e) => setInput(e.target.value)} />
          <div className="script-vstep-row">
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => streamGen("studio-idea", input, setIdea)}>
              <Icon name={busy ? "refresh" : "sparkle"} size={14} className={busy ? "ico-spin" : undefined} /> {busy ? "生成中…" : "生成原始创意"}
            </button>
          </div>
          <div className="script-editor">
            <div className="script-editor-hd"><span>原始创意</span>{editorTools(idea, setIdea, "原始创意")}</div>
            <AutoGrowTextarea className="script-body" value={idea} placeholder="原始创意会显示在这里，可直接编辑" onChange={setIdea} />
          </div>
        </section>

        {/* 第二步 · 完整镜头（镜头摘要不展示，点生成时后台先出摘要再据摘要生成完整镜头） */}
        <section className="script-vstep">
          <div className="script-vstep-hd"><span className="script-vstep-no">2</span> 完整镜头</div>
          <div className="script-chat-tip">基于上面的原始创意，一键生成完整镜头（自动在后台先整理镜头摘要，再逐镜扩写）</div>
          <div className="script-vstep-row">
            <button className="btn btn-primary btn-sm" disabled={busy || !idea.trim()} onClick={genFullShots}>
              <Icon name={busy ? "refresh" : "sparkle"} size={14} className={busy ? "ico-spin" : undefined} /> {busy ? "生成中…" : "生成完整镜头"}
            </button>
            <button className="btn btn-ghost btn-sm" title="上传脚本导入（支持 txt / docx；pdf、doc 请先转成 txt 或 docx）" disabled={parsing} onClick={() => fileRef.current?.click()}>
              <Icon name={parsing ? "refresh" : "upload"} size={13} className={parsing ? "ico-spin" : undefined} /> {parsing ? "解析中…" : "上传脚本"}
            </button>
            <input ref={fileRef} type="file" accept=".txt,.md,.csv,.docx,.doc,.pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden onChange={onUploadScript} />
          </div>
          <div className="script-editor">
            <div className="script-editor-hd"><span>完整镜头</span>{editorTools(script, setScript, "完整镜头")}</div>
            <AutoGrowTextarea className="script-body" value={script} placeholder="完整镜头会显示在这里，可直接编辑" onChange={setScript} />
          </div>
        </section>
      </div>

      <div className="sp-actions">
        <button className="btn btn-primary btn-sm" onClick={finish}>下一步 · 角色场景道具 →</button>
      </div>
    </div>
  );
}

// ③ 分镜脚本·出镜元素：默认只显示本镜「已勾选出镜」的元素，其余隐藏；点「查看元素」展开全部以增删绑定。
function ShotAssets({ shot, assets, editShot }: { shot: Shot; assets: Asset[]; editShot: (id: string, patch: Partial<Shot>) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState<"全部" | Asset["kind"]>("全部"); // 展开后按类型筛选
  // 已绑元素按「人物 > 场景 > 道具」排序展示
  const bound = assets.filter((a) => shot.assetRefs.includes(a.id)).sort((a, b) => (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9));
  // 默认只出现已勾选元素；展开后显示全部并可按 场景/角色/道具 筛选
  const shown = expanded ? assets.filter((a) => filter === "全部" || a.kind === filter) : bound;
  const toggle = (a: Asset) => {
    const on = shot.assetRefs.includes(a.id);
    // 新增勾选后同样按 人物>场景>道具 重排存储
    editShot(shot.id, { assetRefs: on ? shot.assetRefs.filter((x) => x !== a.id) : sortRefsByKind([...shot.assetRefs, a.id], assets) });
  };
  const collapse = () => { setExpanded(false); setFilter("全部"); }; // 收起 → 回到只显示已勾选
  return (
    <div className="sb-assets">
      <span className="sb-assets-lbl">出镜元素</span>
      {!expanded && bound.length === 0 && <span className="sb-assets-empty">本镜暂无出镜元素，点右侧「查看元素」选择</span>}
      {expanded && (
        <>
          <span className="sb-assets-filter">
            {(["全部", "角色", "场景", "道具"] as const).map((k) => (
              <span key={k} className={filter === k ? "sb-af on" : "sb-af"} onClick={() => setFilter(k)}>{k}</span>
            ))}
          </span>
          <span className="sb-assets-break" />
        </>
      )}
      {shown.map((a) => {
        const on = shot.assetRefs.includes(a.id);
        return (
          <span
            key={a.id}
            className={on ? "sb-asset-chip on" : "sb-asset-chip"}
            onClick={() => toggle(a)}
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
      {(expanded || assets.length > bound.length) && (
        <button type="button" className="sb-assets-toggle" onClick={() => (expanded ? collapse() : setExpanded(true))}>
          {expanded ? "收起" : "查看全部元素"}
        </button>
      )}
    </div>
  );
}

function StudioStepView(props: {
  stepKey: string;
  goStep: (k: string) => void;
  toast: (s: string, k?: "warn") => void;
  script: string;
  setScript: (s: string) => void;
  aiExpandShot: (id: string) => void;
  aiBusyId: string | null;
  totalSec: number;
  targetShots: number;
  setShotCount: (n: number) => void;
  setTotal: (sec: number) => void;
  genMode: GenMode;
  setGenMode: (m: GenMode) => void;
  recognizeElements: () => void; // 手动 AI 识别出镜元素（补齐所有未绑镜头）
  elemMatchBusy: boolean;
  settings: Record<string, string>;
  setSettings: (f: (s: Record<string, string>) => Record<string, string>) => void;
  assets: Asset[];
  setAssets: (f: (a: Asset[]) => Asset[]) => void;
  genAllImages: (redoAll?: boolean) => void; // 一键生成全部参考图（Studio 提升，后台持续）
  stopGenAllImages: () => void; // 停止一键生成
  voiceMatchBusy: boolean;
  genImgBusy: boolean;
  genImgProg: { done: number; total: number };
  shots: Shot[];
  ratio: string;
  cache: Record<string, string>; // 已缓存到本地的视频：原始 URL → blobURL
  rebuildShots: () => void;
  editShot: (id: string, patch: Partial<Shot>) => void;
  removeShot: (id: string) => void;
  addShot: () => void;
  addVideoShot: (videoUrl: string, poster?: string) => void;
  moveShot: (id: string, dir: -1 | 1) => void;
  duplicateShot: (id: string) => void;
  toggleLock: (id: string) => void;
  genShot: (id: string) => void;
  aiSafeRewriteShot: (id: string) => void; // 审核失败一键改写重试
  safeRewriteId: string | null; // 正在改写重试的镜头 id
  genAll: () => void;
  exportFilm: (opts?: { subtitles: boolean; audio: boolean }) => void;
  exportSubtitles: () => void;
  exportAudio: () => void;
  exportClips: () => void; // 重新导出全部分镜素材
  exportDraft: () => void; // 导出剪映素材包（片段+字幕）
  exportPct: number;
  exporting: boolean;
  onPlayClip: (s: Shot) => void;
  onEditVideo: (s: Shot) => void;
  seekTarget: { t: number; n: number }; // 时间轴拖动 → 通知预览跳转
  onPreviewTime: (sec: number) => void; // 预览播放 → 回传当前时间给时间轴播放头
  voiceTracks: Record<string, string>; // ⑤ 配音：shotId → 火山 TTS 音频 blobURL
  voiceOffsets: Record<string, number>; // 配音时间轴偏移（秒），预览按此延后播放
  synthVoices: () => void; // 触发逐镜配音合成
  synthBusy: boolean; // 配音合成进行中
  speakerBusy: boolean;
  audioMode: string; // 声音来源：dub=火山配音 / original=视频原声
  setAudioMode: (m: string) => void;
  bgm: { url: string; name: string; volume: number } | null; // ⑤ 背景音乐
  setBgm: (b: { url: string; name: string; volume: number } | null) => void;
  openLibraryPicker: (filter: "image" | "video", onPick: (item: AssetCard) => void) => void; // 打开仓库选择器
  subtitles: Subtitle[]; // 时间轴多段字幕（预览按时间匹配显示）
  assetGenSettings: Record<string, AssetGenSetting>; // 场景/角色/道具生图清晰度 + 一键生成模型
  setAssetGenSettings: (updater: Record<string, AssetGenSetting> | ((p: Record<string, AssetGenSetting>) => Record<string, AssetGenSetting>)) => void;
  studioInput: string;
  setStudioInput: (s: string) => void;
  studioIdea: string;
  setStudioIdea: (s: string) => void;
  studioSummary: string;
  setStudioSummary: (s: string) => void;
}) {
  const { goStep, toast } = props;
  // 「视频设定」步骤已移除（改到新建大片时设定）；旧项目若停在该步，落到「分镜脚本」，避免空白
  const stepKey = props.stepKey === "setting" ? "storyboard" : props.stepKey;

  if (stepKey === "script") {
    return (
      <ScriptStep
        script={props.script}
        setScript={props.setScript}
        input={props.studioInput}
        setInput={props.setStudioInput}
        idea={props.studioIdea}
        setIdea={props.setStudioIdea}
        summary={props.studioSummary}
        setSummary={props.setStudioSummary}
        styleHint={videoStyles.find((v) => v.name === props.settings.视频风格)?.stylePrompt ?? ""}
        useKB={props.settings.知识库 !== "不使用"}
        rebuildShots={props.rebuildShots}
        setSettings={props.setSettings}
        toast={toast}
        goStep={goStep}
      />
    );
  }

  if (stepKey === "assets") {
    return (
      <AssetsStep
        assets={props.assets}
        setAssets={props.setAssets}
        script={props.script}
        stylePrompt={videoStyles.find((v) => v.name === props.settings.视频风格)?.stylePrompt ?? ""}
        genSettings={props.assetGenSettings}
        setGenSettings={props.setAssetGenSettings}
        genAllImages={props.genAllImages}
        stopGenAllImages={props.stopGenAllImages}
        voiceMatchBusy={props.voiceMatchBusy}
        genImgBusy={props.genImgBusy}
        genImgProg={props.genImgProg}
        toast={toast}
        goStep={goStep}
        openLibraryPicker={props.openLibraryPicker}
      />
    );
  }

  if (stepKey === "storyboard") {
    return (
      <div className="stage-panel">
        <div className="sp-title">③ 分镜脚本</div>
        <div className="sp-sub">
          按「① 脚本编辑」的脚本自动拆出镜头。每镜可分别编辑「画面描述 / 字幕」（引号内台词可提取为字幕），并设定运镜、景别、时长；可排序、复制、锁定、增删。可用镜头数 / 总时长微调分配。
        </div>
        {/* 镜头数 / 总时长 / 生成模式（原在①，随剧本拆分镜迁移到此） */}
        <div className="sp-setrow">
          <div className="sp-setctl">
            <span className="sp-setlbl">镜头数</span>
            <StepperInput
              value={props.targetShots}
              suffix="镜"
              ariaLabel="镜头数"
              onCommit={(n) => props.setShotCount(n)}
              onDec={() => props.setShotCount(props.targetShots - 1)}
              onInc={() => props.setShotCount(props.targetShots + 1)}
              decDisabled={props.targetShots <= 1}
              incDisabled={props.targetShots >= 40}
            />
          </div>
          <div className="sp-setctl">
            <span className="sp-setlbl">总时长</span>
            <StepperInput
              value={props.totalSec}
              suffix="s"
              ariaLabel="总时长秒数"
              onCommit={(n) => props.setTotal(n)}
              onDec={() => props.setTotal(props.totalSec - 5)}
              onInc={() => props.setTotal(props.totalSec + 5)}
              decDisabled={props.totalSec <= props.targetShots * 4}
              incDisabled={props.totalSec >= props.targetShots * 15}
              decTitle="每镜最短 4 秒"
              incTitle="每镜最长 15 秒"
            />
          </div>
          <span className="sp-setnote">每镜约 {Math.max(4, Math.round(props.totalSec / props.targetShots))}s · {props.settings.视频质量}</span>
        </div>
        <div className="sp-genmode">
          <span className="sp-setlbl">生成模式</span>
          <span className={props.genMode === "text" ? "sel-chip on" : "sel-chip"} onClick={() => props.setGenMode("text")}>文本生成</span>
          <span className={props.genMode === "smart" ? "sel-chip on" : "sel-chip"} onClick={() => props.setGenMode("smart")}>智能多帧</span>
          <span className={props.genMode === "keyframe" ? "sel-chip on" : "sel-chip"} onClick={() => props.setGenMode("keyframe")}>首尾帧</span>
          <button className="btn btn-ghost btn-sm sb-recog" disabled={props.elemMatchBusy} onClick={props.recognizeElements} title="用 AI 识别每个镜头画面里出现的场景/角色/道具，自动补齐所有还没绑定的镜头">
            <Icon name={props.elemMatchBusy ? "refresh" : "sparkle"} size={14} className={props.elemMatchBusy ? "ico-spin" : undefined} /> {props.elemMatchBusy ? "识别中…" : "AI 识别出镜元素"}
          </button>
        </div>
        <div className="sb-list">
          {props.shots.map((s, i) => (
            <div id={`sb-shot-${s.id}`} className={`sb-shot2 ${s.locked ? "locked" : ""}`} key={s.id}>
              <div className="sb-head">
                {s.status === "done" && s.videoUrl ? (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <video className="sb-thumb-img" src={playableVideoSrc(s.videoUrl, props.cache)} muted playsInline preload="metadata" />
                ) : (
                  <div className="sb-thumb-ph" title="镜头未生成">
                    <Icon name="video" size={18} />
                  </div>
                )}
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
                    <button className="sb-tool danger" onClick={() => props.removeShot(s.id)} disabled={s.locked} aria-label="删除镜头" title={s.locked ? "已锁定，先解锁再删除" : "删除"}>
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="sb-fields">
                {/* 智能多帧 / 首尾帧模式：帧上传区放在画面描述之上（文本生成模式不显示） */}
                {(props.genMode === "smart" || props.genMode === "keyframe") && (
                  <div className="sb-frames">
                    <span className="sb-assets-lbl">{props.genMode === "smart" ? "镜头参考图" : "首尾帧"}</span>
                    <ShotFrames
                      shot={s}
                      mode={props.genMode === "smart" ? "smart" : "keyframe"}
                      isFirst={i === 0}
                      prevLastFrame={i > 0 ? props.shots[i - 1]?.lastFrame : undefined}
                      script={props.script}
                      stylePrompt={videoStyles.find((v) => v.name === props.settings.视频风格)?.stylePrompt ?? ""}
                      toast={toast}
                      onSet={(which, url) => props.editShot(s.id, which === "first" ? { firstFrame: url } : { lastFrame: url })}
                      openLibraryPicker={props.openLibraryPicker}
                    />
                  </div>
                )}
                <label className="sb-flabel">画面描述</label>
                <textarea
                  className="sb-field-ta"
                  rows={2}
                  value={s.shotDesc}
                  disabled={s.locked}
                  placeholder="这一镜画面里有什么（用于生成）…"
                  onChange={(e) => props.editShot(s.id, { shotDesc: e.target.value })}
                />
                <label className="sb-flabel">字幕</label>
                <input
                  className="sb-field-in"
                  value={s.caption}
                  disabled={s.locked}
                  placeholder="屏幕字幕（已自动从画面描述台词提取，可手动修改）…"
                  onChange={(e) => props.editShot(s.id, { caption: e.target.value })}
                />
              </div>

              <div className="sb-ctls">
                <label className="sb-ctl">
                  <span>运镜</span>
                  <select className="sb-sel" value={s.camera} disabled={s.locked} onChange={(e) => props.editShot(s.id, { camera: e.target.value })}>
                    {CAMERAS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label className="sb-ctl">
                  <span>景别</span>
                  <select className="sb-sel" value={s.shotSize} disabled={s.locked} onChange={(e) => props.editShot(s.id, { shotSize: e.target.value })}>
                    {SHOT_SIZES.map((z) => (
                      <option key={z} value={z}>{z}</option>
                    ))}
                  </select>
                </label>
                <div className="sb-dur-ctl">
                  <button onClick={() => props.editShot(s.id, { dur: Math.max(2, s.dur - 1) })} disabled={s.locked} aria-label="减少时长">−</button>
                  <span>{s.dur}s</span>
                  <button onClick={() => props.editShot(s.id, { dur: Math.min(15, s.dur + 1) })} disabled={s.locked} aria-label="增加时长">＋</button>
                </div>
              </div>

              {props.assets.length > 0 && (
                <ShotAssets shot={s} assets={props.assets} editShot={props.editShot} />
              )}
            </div>
          ))}
        </div>
        <div className="sp-actions">
          <button className="btn btn-soft btn-sm" onClick={props.addShot}>
            <Icon name="plus" size={14} /> 添加镜头
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
        <div className="sp-title">④ 分镜视频</div>
        <div className="sp-sub">逐镜调用视频模型生成真实片段（单镜约 3–4 分钟，请耐心等待）。第 2 镜起默认自动以上一镜视频的最后一帧作为首帧，画面无缝衔接。全部生成后到「视频预览」查看成片。</div>
        <div className="clips-topbar">
          <button className="btn btn-primary btn-sm" onClick={props.genAll}>
            <Icon name="sparkle" size={14} /> 批量生成全部
          </button>
        </div>
        <div className="clip-grid">
          {props.shots.map((s, i) => {
            // 顺序生成门控：前面所有镜头都已生成，才允许生成/重生成本镜（不能先生成后面）
            const canGen = props.shots.slice(0, i).every((p) => p.status === "done");
            // 出镜元素在生成后是否有变化（增删元素 / 换了参考图）→ 视频已过时，提示重新生成
            const elemChanged = s.status === "done" && !!s.videoUrl && s.genElemSig != null && s.genElemSig !== elemSig(s.assetRefs, props.assets);
            return (
            <div className="clip-card" key={s.id}>
              <div className="clip-thumb" style={{ aspectRatio: ratioToCss(props.ratio) }}>
                {s.status === "gen" ? (
                  <div className="clip-progress">
                    <Icon name="refresh" size={18} className="ico-spin" />
                    <div className="clip-bar">
                      <span style={{ width: `${s.pct}%` }} />
                    </div>
                    <span className="clip-pct">{s.pct}% · 生成中</span>
                  </div>
                ) : s.status === "done" ? (
                  s.videoUrl ? (
                    <>
                      {/* 首帧作封面（无 controls），点播放按钮弹出大播放器 */}
                      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                      <video className="clip-video" src={`${playableVideoSrc(s.videoUrl, props.cache)}#t=0.1`} muted playsInline preload="metadata" />
                      <button className="clip-play clip-play-btn" onClick={() => props.onPlayClip(s)} aria-label="播放">▶</button>
                      <span className="clip-ok">
                        <Icon name="check" size={11} /> 已生成
                      </span>
                    </>
                  ) : (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img className="clip-poster" src={s.poster} alt={`镜头${i + 1}`} />
                      <div className="clip-play">▶</div>
                      <span className="clip-dur">{String(s.dur).padStart(2, "0")}s</span>
                      <span className="clip-ok">
                        <Icon name="check" size={11} /> 已生成
                      </span>
                    </>
                  )
                ) : s.status === "failed" ? (
                  <div className="clip-fail">
                    <Icon name="close" size={16} />
                    <span className="clip-fail-msg">{s.failReason ?? "生成失败"}</span>
                    <div className="clip-fail-acts">
                      <button className="clip-retry" onClick={() => props.genShot(s.id)} disabled={!canGen || props.safeRewriteId === s.id}>
                        <Icon name="refresh" size={12} /> 重试
                      </button>
                      {(s.failReason ?? "").includes("审核") && (
                        <button
                          className="clip-retry clip-retry-ai"
                          onClick={() => {
                            goStep("storyboard");
                            // 切到③后滚动定位到这一镜的卡片（等 DOM 渲染出来再滚）
                            window.setTimeout(() => {
                              document.getElementById(`sb-shot-${s.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                            }, 150);
                          }}
                          title="返回③分镜脚本，定位到这一镜手动修改画面描述后再重新生成"
                        >
                          <Icon name="sparkle" size={12} /> 去改写
                        </button>
                      )}
                    </div>
                  </div>
                ) : canGen ? (
                  <button className="clip-gen" onClick={() => props.genShot(s.id)}>
                    <Icon name="sparkle" size={14} /> 生成
                  </button>
                ) : (
                  <div className="clip-locked">🔒 请先生成前面镜头</div>
                )}
                {/* 出镜元素在生成后变了 → 提示重新生成（点角标即重生成本镜） */}
                {elemChanged && (
                  <button
                    className="clip-stale"
                    onClick={() => props.genShot(s.id)}
                    disabled={!canGen}
                    title="这一镜的出镜元素在生成后有改动（增删元素或换了参考图），当前视频还是旧的。点此重新生成以应用新元素/参考图。"
                  >
                    <Icon name="refresh" size={11} /> 元素已变 · 重新生成
                  </button>
                )}
              </div>
              <div className="clip-foot">
                <span>镜头 {i + 1}</span>
                {s.status !== "gen" && (
                  <div className="clip-foot-acts">
                    {s.status === "done" && s.videoUrl && (
                      <button
                        className="btn btn-ghost btn-sm"
                        title="编辑视频：保持首尾帧不变，修改中间画面内容"
                        onClick={() => props.onEditVideo(s)}
                      >
                        <Icon name="sparkle" size={12} /> 编辑
                      </button>
                    )}
                    <button
                      className="btn btn-ghost btn-sm"
                      title="从仓库调取已有视频作为本镜"
                      onClick={() =>
                        props.openLibraryPicker("video", (it) => {
                          if (!it.videoUrl) return;
                          props.editShot(s.id, {
                            videoUrl: it.videoUrl,
                            poster: it.img || s.poster,
                            status: "done",
                            pct: 100,
                            failReason: undefined,
                          });
                        })
                      }
                    >
                      <Icon name="film" size={12} /> 仓库
                    </button>
                    {s.status === "done" && s.videoUrl && (
                      <button
                        className="btn btn-ghost btn-sm"
                        title="下载本镜视频到本地"
                        onClick={() => downloadVideo(s.videoUrl!, `镜头${i + 1}.mp4`)}
                      >
                        <Icon name="download" size={12} /> 下载
                      </button>
                    )}
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={!canGen}
                      title={canGen ? undefined : "请先按顺序生成前面的镜头"}
                      onClick={() => props.genShot(s.id)}
                    >
                      <Icon name="refresh" size={12} /> {s.status === "done" ? "重新生成" : s.status === "failed" ? "重试" : "生成"}
                    </button>
                    <button
                      className="btn btn-ghost btn-sm clip-del"
                      title={s.locked ? "已锁定，先解锁再删除" : "删除本镜"}
                      disabled={s.locked}
                      onClick={() => props.removeShot(s.id)}
                      aria-label="删除本镜"
                    >
                      <Icon name="trash" size={12} />
                    </button>
                  </div>
                )}
              </div>
            </div>
            );
          })}
            {/* 添加视频卡片：从本地上传 / 从仓库选一个视频，作为新的一镜追加 */}
            <div className="clip-add">
              <div className="clip-add-plus">＋</div>
              <div className="clip-add-title">添加视频</div>
              <div className="clip-add-acts">
                <label className="btn btn-ghost btn-sm" title="从本地上传一个视频作为新镜头">
                  <Icon name="upload" size={12} /> 本地
                  <input
                    type="file"
                    accept="video/*"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) props.addVideoShot(URL.createObjectURL(f));
                    }}
                  />
                </label>
                <button
                  className="btn btn-ghost btn-sm"
                  title="从仓库选一个视频作为新镜头"
                  onClick={() =>
                    props.openLibraryPicker("video", (it) => {
                      if (it.videoUrl) props.addVideoShot(it.videoUrl, it.img);
                    })
                  }
                >
                  <Icon name="film" size={12} /> 仓库
                </button>
              </div>
            </div>
        </div>
        <div className="sp-actions">
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
      <div className="sp-title">⑤ 视频预览</div>
      <div className="sp-sub">
        {ready.length} 个分镜按顺序连续播放（共 {ready.reduce((a, s) => a + s.dur, 0)}s）。字幕可编辑后再导出。
        {/* 声音来源「配音/原声」切换已移到时间轴配音轨（生成配音之后的「🔊 原声」按钮）。此处仅保留已设置背景音乐的音量/移除控件 */}
        {props.audioMode !== "original" && props.bgm && (
          <span className="sp-bgm-info" title={props.bgm.name}>
            <span className="sp-bgm-name">🎵 {props.bgm.name}</span>
            <input
              className="sp-bgm-vol"
              type="range"
              min={0}
              max={100}
              value={props.bgm.volume}
              title={`音量 ${props.bgm.volume}%`}
              onChange={(e) => props.bgm && props.setBgm({ ...props.bgm, volume: Number(e.target.value) })}
            />
            <button className="sp-bgm-x" title="移除背景音乐" onClick={() => props.setBgm(null)}>×</button>
          </span>
        )}
      </div>
      <div className="sp-player-wrap">
      <FilmPlayer
        shots={ready}
        ratio={props.ratio}
        cache={props.cache}
        showCaption={props.settings.字幕 !== "隐藏"}
        onToggleCaption={() => props.setSettings((s) => ({ ...s, 字幕: s.字幕 === "隐藏" ? "显示" : "隐藏" }))}
        subtitles={props.subtitles}
        seekTarget={props.seekTarget}
        onTime={props.onPreviewTime}
        voiceTracks={props.audioMode === "original" ? undefined : props.voiceTracks}
        voiceOffsets={props.voiceOffsets}
        bgm={props.audioMode === "original" ? null : props.bgm}
      />

      </div>
    </div>
  );
}

// 合成预览播放器：双缓冲无缝连播——两个 video 交替，一个播放、另一个预加载下一镜，
// 播完瞬间切到已就绪的另一 slot，切镜零黑屏（不再有 src 切换导致的黑帧）。
function FilmPlayer({
  shots,
  ratio,
  cache,
  showCaption = true,
  onToggleCaption,
  subtitles = [],
  seekTarget,
  onTime,
  voiceTracks,
  voiceOffsets,
  bgm,
}: {
  shots: Shot[];
  ratio: string;
  cache?: Record<string, string>; // 已缓存到本地的视频：原始 URL → blobURL
  showCaption?: boolean;
  onToggleCaption?: () => void; // 字幕开关（控制条按钮）：切换预览画面字幕叠加
  subtitles?: Subtitle[]; // 时间轴多段字幕：按当前整片时间匹配显示
  seekTarget?: { t: number; n: number };
  onTime?: (sec: number) => void;
  voiceTracks?: Record<string, string>; // 方案B 配音：shotId → 火山 TTS 音频；有则静音视频、改播此配音
  voiceOffsets?: Record<string, number>; // 配音相对镜头起点的偏移（秒），预览按此延后播放
  bgm?: { url: string; name: string; volume: number } | null; // 背景音乐：整片循环，与配音一起播
}) {
  const n = Math.max(1, shots.length);
  const ttsRef = useRef<HTMLAudioElement>(null);
  const ttsTimerRef = useRef<number | null>(null); // 配音延后启动定时器
  const bgmRef = useRef<HTMLAudioElement>(null);
  const hasVoice = !!voiceTracks && Object.keys(voiceTracks).length > 0;
  const nextOf = (i: number) => (i + 1) % n;
  const vRef0 = useRef<HTMLVideoElement>(null);
  const vRef1 = useRef<HTMLVideoElement>(null);
  const vRefs = [vRef0, vRef1];
  const [active, setActive] = useState(0); // 当前显示/播放的 slot（0/1）
  const [idx, setIdx] = useState(0);
  const [slotShot, setSlotShot] = useState<[number, number]>([0, n > 1 ? 1 : 0]); // 每个 slot 承载的分镜下标
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(true);
  const [segT, setSegT] = useState(0);
  const seekingRef = useRef(false);
  const pendingSeek = useRef<{ slot: number; time: number } | null>(null);
  const total = shots.reduce((a, s) => a + s.dur, 0) || 1;
  const before = shots.slice(0, idx).reduce((a, s) => a + s.dur, 0);
  const t = Math.min(total, before + segT);
  const cur = shots[idx];

  // 切到「配音」（出现可播放的配音轨）时自动取消静音，让配音出声。
  // 此时用户刚点过「配音」切换、页面已有手势，浏览器允许带声播放。
  useEffect(() => {
    if (hasVoice) setMuted(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasVoice]);

  // 播放/暂停/静音作用于当前 active 视频；另一 slot 保持暂停但（preload=auto）预加载下一镜。
  // 方案B 配音：有 voiceTracks 时视频恒静音，改由 TTS 音轨随当前镜播放；静音按钮控制配音是否出声。
  useEffect(() => {
    const va = vRefs[active].current;
    const vb = vRefs[1 - active].current;
    if (vb) vb.pause();
    if (!va) return;
    va.muted = hasVoice ? true : muted;
    if (playing) va.play().catch(() => setPlaying(false));
    else va.pause();
    const a = ttsRef.current;
    if (ttsTimerRef.current) { window.clearTimeout(ttsTimerRef.current); ttsTimerRef.current = null; }
    if (a) {
      const track = hasVoice ? voiceTracks?.[shots[idx]?.id] : undefined;
      const off = voiceOffsets?.[shots[idx]?.id] ?? 0; // 配音相对镜头起点的偏移（秒）
      if (!track) { a.pause(); if (a.getAttribute("src")) a.removeAttribute("src"); }
      else {
        if (a.getAttribute("src") !== track) a.src = track;
        a.muted = muted;
        if (segT >= off) {
          // 已过配音起点：定位到 segT-off 处播放
          try { a.currentTime = Math.max(0, segT - off); } catch { /* 未就绪忽略 */ }
          if (playing && !muted) a.play().catch(() => {});
          else a.pause();
        } else {
          // 还没到配音起点：先静默，若在播则定时到点再起
          a.pause(); try { a.currentTime = 0; } catch { /* 忽略 */ }
          if (playing && !muted) {
            ttsTimerRef.current = window.setTimeout(() => {
              try { a.currentTime = 0; } catch { /* 忽略 */ }
              a.play().catch(() => {});
            }, Math.max(0, (off - segT) * 1000));
          }
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, idx, playing, muted, hasVoice, voiceOffsets]);

  // 背景音乐：整片循环，跟随播放/暂停；音量按 bgm.volume；静音按钮同时静音 BGM。
  // 自动避让(ducking)：当前镜有配音时把 BGM 压到 30%，无配音镜恢复设定音量，避免盖住人声。
  useEffect(() => {
    const b = bgmRef.current;
    if (!b) return;
    if (!bgm) { b.pause(); if (b.getAttribute("src")) b.removeAttribute("src"); return; }
    if (b.getAttribute("src") !== bgm.url) b.src = bgm.url;
    b.loop = true;
    const base = Math.min(1, Math.max(0, (bgm.volume ?? 30) / 100));
    const ducking = hasVoice && !!voiceTracks?.[shots[idx]?.id];
    b.volume = ducking ? base * 0.3 : base;
    b.muted = muted;
    if (playing && !muted) b.play().catch(() => {});
    else b.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgm, playing, muted, idx, hasVoice]);

  const fmt = (s: number) => {
    const sec = Math.max(0, Math.floor(s));
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  };

  // 切到目标镜 ci（镜头内偏移 offset 秒）。另一 slot 已预加载该镜 → 无缝切换；否则在当前 slot 硬加载。
  function goToShot(ci: number, offset = 0) {
    const other = 1 - active;
    if (n > 1 && slotShot[other] === ci) {
      const v = vRefs[other].current;
      if (v) {
        try {
          v.currentTime = offset;
        } catch {
          /* metadata 未就绪，忽略 */
        }
        v.muted = hasVoice ? true : muted;
        if (playing) v.play().catch(() => {});
      }
      setActive(other);
      setIdx(ci);
      setSegT(offset);
      // 老 active slot 改为预加载 ci 的下一镜
      setSlotShot((s) => {
        const ns: [number, number] = [s[0], s[1]];
        ns[active] = nextOf(ci);
        return ns;
      });
    } else {
      // 未预加载（任意 seek）：当前 slot 硬加载目标镜，另一 slot 预加载其下一镜
      setIdx(ci);
      setSegT(offset);
      setSlotShot((s) => {
        const ns: [number, number] = [s[0], s[1]];
        ns[active] = ci;
        ns[other] = nextOf(ci);
        return ns;
      });
      pendingSeek.current = { slot: active, time: offset };
    }
  }

  // 全片时间（秒）→ 定位镜头 + 镜头内偏移
  function locate(sec: number): { ci: number; offset: number } {
    let target = Math.max(0, Math.min(total, sec));
    let ci = 0;
    for (let i = 0; i < shots.length; i++) {
      if (target < shots[i].dur || i === shots.length - 1) {
        ci = i;
        break;
      }
      target -= shots[i].dur;
    }
    return { ci, offset: Math.max(0, Math.min(shots[ci].dur, target)) };
  }

  // 时间轴拖动播放头 → 视频跳到对应帧（seekTarget.n 变化时触发）
  const lastSeekN = useRef(0);
  useEffect(() => {
    if (!seekTarget || seekTarget.n === lastSeekN.current) return;
    lastSeekN.current = seekTarget.n;
    const { ci, offset } = locate(seekTarget.t);
    if (ci === idx) {
      const v = vRefs[active].current;
      if (v) v.currentTime = offset;
      const a = ttsRef.current;
      if (a && hasVoice) { try { a.currentTime = offset; } catch { /* 忽略 */ } }
      setSegT(offset);
    } else {
      goToShot(ci, offset);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekTarget?.n]);

  // 视频播放 → 把当前全片时间回传给时间轴播放头（联动）；仅回传有限值，避免 NaN 传播
  useEffect(() => {
    if (Number.isFinite(t)) onTime?.(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  function onEnded() {
    goToShot(nextOf(idx), 0);
  }

  function toggle() {
    if (playing) {
      vRefs[active].current?.pause();
      setPlaying(false);
    } else {
      vRefs[active].current?.play().catch(() => {});
      setPlaying(true);
    }
  }

  // 整片进度条 seek：定位到目标镜头 + 镜头内偏移
  function seek(clientX: number, el: HTMLElement) {
    const rect = el.getBoundingClientRect();
    const r = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    let target = r * total;
    let ci = 0;
    for (let i = 0; i < shots.length; i++) {
      if (target < shots[i].dur || i === shots.length - 1) {
        ci = i;
        break;
      }
      target -= shots[i].dur;
    }
    const offset = Math.max(0, Math.min(shots[ci].dur, target));
    if (ci === idx) {
      setSegT(offset);
      const v = vRefs[active].current;
      if (v) v.currentTime = offset;
      const a = ttsRef.current;
      if (a && hasVoice) { try { a.currentTime = offset; } catch { /* 忽略 */ } }
    } else {
      goToShot(ci, offset);
    }
  }

  return (
    <div className="film-player">
      {/* 方案B 配音音轨：跟随当前镜播放的火山 TTS，视频原声已静音 */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={ttsRef} onEnded={() => { /* 配音比镜头短 → 播完静默，等切镜 */ }} hidden />
      {/* 背景音乐：整片循环 */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={bgmRef} hidden />
      <div className="film-stage" style={{ aspectRatio: ratioToCss(ratio) }}>
        {[0, 1].map((slot) => (
          <video
            // eslint-disable-next-line jsx-a11y/media-has-caption
            key={slot}
            ref={vRefs[slot]}
            className="film-video"
            style={{ opacity: active === slot ? 1 : 0 }}
            src={playableVideoSrc(shots[slotShot[slot]]?.videoUrl, cache)}
            muted={hasVoice ? true : muted}
            playsInline
            preload="auto"
            onTimeUpdate={(e) => {
              if (slot === active && !seekingRef.current) {
                const vt = (e.target as HTMLVideoElement).currentTime;
                setSegT(vt);
                // 配音连续校准：dub 音轨已把每句按「镜内时间」烤进去，故其 currentTime 应始终等于视频镜内时间。
                // 只在切镜时同步一次会漂移/晚起 → 每次 timeupdate 若偏差>0.25s 就拉回，保证配音与字幕/画面同步。
                const a = ttsRef.current;
                if (a && hasVoice && !muted && playing && a.getAttribute("src") && Math.abs(a.currentTime - vt) > 0.25) {
                  try { a.currentTime = vt; } catch { /* 未就绪忽略 */ }
                }
              }
            }}
            onLoadedMetadata={(e) => {
              if (pendingSeek.current && pendingSeek.current.slot === slot) {
                const el = e.target as HTMLVideoElement;
                el.currentTime = pendingSeek.current.time;
                pendingSeek.current = null;
                if (slot === active && playing) el.play().catch(() => {});
              }
            }}
            onEnded={() => {
              if (slot === active) onEnded();
            }}
            onClick={toggle}
          />
        ))}
        {!playing && (
          <button className="film-bigplay" onClick={toggle} aria-label="播放">
            ▶
          </button>
        )}
        {showCaption &&
          (() => {
            const sub = subtitles.find((s) => t >= s.start && t < s.start + s.dur);
            return sub?.text ? <span className="film-caption">{sub.text}</span> : null;
          })()}
        {/* 转场叠色预览：本镜入场首 half 秒从色淡入 / 下一镜有转场时本镜末 half 秒淡出到色 */}
        {(() => {
          const half = TRANS_DUR / 2;
          const dur = cur?.dur ?? 0;
          const inC = transColor(cur?.transition);
          const outC = transColor(shots[idx + 1]?.transition);
          let color: string | null = null;
          let alpha = 0;
          if (inC && segT < half) { color = inC; alpha = 1 - segT / half; }
          else if (outC && dur && segT > dur - half) { color = outC; alpha = (segT - (dur - half)) / half; }
          return color && alpha > 0.001 ? (
            <span className="film-trans" style={{ background: color, opacity: Math.min(1, alpha) }} />
          ) : null;
        })()}
        <span className="film-shot-tag">
          镜头 {idx + 1}/{shots.length}
        </span>
        {/* 控制条：叠在视频底部（原生播放器样式）——通宽进度条 + 播放/时间/字幕/音量/全屏 */}
        <div className="film-ctrls">
          <button className="vp-ctrl" onClick={toggle} aria-label={playing ? "暂停" : "播放"}>
            {playing ? "❚❚" : "▶"}
          </button>
          <span className="vp-time">{fmt(t)}</span>
          <div
            className="vp-track"
            onPointerDown={(e) => {
              seekingRef.current = true;
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              seek(e.clientX, e.currentTarget);
            }}
            onPointerMove={(e) => {
              if (seekingRef.current) seek(e.clientX, e.currentTarget);
            }}
            onPointerUp={(e) => {
              seekingRef.current = false;
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
          {onToggleCaption && (
            <button
              className={`vp-ctrl vp-ctrl-cap${showCaption ? "" : " is-off"}`}
              onClick={onToggleCaption}
              aria-label={showCaption ? "隐藏字幕" : "显示字幕"}
              title={showCaption ? "隐藏字幕" : "显示字幕"}
            >
              💬
            </button>
          )}
          <button className="vp-ctrl" onClick={() => setMuted((m) => !m)} aria-label={muted ? "取消静音" : "静音"}>
            {muted ? "🔇" : "🔊"}
          </button>
          <button
            className="vp-ctrl"
            onClick={(e) => {
              const st = (e.currentTarget as HTMLElement).closest(".film-stage") as HTMLElement | null;
              if (document.fullscreenElement) document.exitFullscreen();
              else st?.requestFullscreen?.();
            }}
            aria-label="全屏"
            title="全屏"
          >
            ⛶
          </button>
        </div>
      </div>
    </div>
  );
}

// 带敏感词标红的画面描述输入框：textarea 文字/背景透明、光标可见，后叠一层同样式高亮层，
// 命中的违规词渲染成红字并波浪下划线，下方给出提示。内容审核有问题时即在原文对应文字上标红。
function HlTextarea({
  value,
  placeholder,
  onChange,
  children,
}: {
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  children?: ReactNode;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const hlRef = useRef<HTMLDivElement>(null);
  const segs = segmentSensitive(value);
  const bad = findSensitiveWords(value);
  const sync = () => {
    if (hlRef.current && taRef.current) {
      hlRef.current.scrollTop = taRef.current.scrollTop;
      hlRef.current.scrollLeft = taRef.current.scrollLeft;
    }
  };
  return (
    <div className="sp-shot-box">
      <div className={bad.length ? "sp-shot-box2 has-bad" : "sp-shot-box2"}>
        <div className="sp-shot-hl" ref={hlRef} aria-hidden="true">
          {segs.map((seg, i) =>
            seg.bad ? (
              <mark key={i} className="hl-bad">
                {seg.text}
              </mark>
            ) : (
              <span key={i}>{seg.text}</span>
            ),
          )}
        </div>
        <textarea
          ref={taRef}
          className="sp-shot-ta sp-shot-ta-hl"
          rows={2}
          spellCheck={false}
          value={value}
          placeholder={placeholder}
          onScroll={sync}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      {children}
      {bad.length > 0 && <div className="sp-shot-warn">⚠ 含疑似违规词：{bad.join("、")}，请修改后再生成</div>}
    </div>
  );
}

// 可编辑步进器：− / ＋ 微调 + 中间数字可直接手动输入。输入在失焦 / 回车时提交，
// 由外部 onCommit 统一做区间钳制（如镜头数 1–12、总时长受每镜 4–15s 约束）。
function StepperInput({
  value,
  suffix,
  onCommit,
  onDec,
  onInc,
  decDisabled,
  incDisabled,
  decTitle,
  incTitle,
  ariaLabel,
}: {
  value: number;
  suffix: string;
  onCommit: (n: number) => void;
  onDec: () => void;
  onInc: () => void;
  decDisabled?: boolean;
  incDisabled?: boolean;
  decTitle?: string;
  incTitle?: string;
  ariaLabel: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(value);
  function commit(raw: string | null = draft) {
    if (raw === null) return;
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n)) onCommit(n);
    setDraft(null);
  }
  return (
    <div className="sp-stepper">
      <button onClick={onDec} disabled={decDisabled} title={decTitle} aria-label={`减少${ariaLabel}`}>−</button>
      <span className="sp-stepper-val">
        <input
          className="sp-stepper-in"
          inputMode="numeric"
          value={shown}
          aria-label={ariaLabel}
          onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={() => commit()}
          onKeyDown={(e) => {
            if (e.key === "Enter") { commit(e.currentTarget.value); e.currentTarget.blur(); }
            if (e.key === "Escape") { setDraft(null); e.currentTarget.blur(); }
          }}
        />
        <span className="sp-stepper-suf">{suffix}</span>
      </span>
      <button onClick={onInc} disabled={incDisabled} title={incTitle} aria-label={`增加${ariaLabel}`}>＋</button>
    </div>
  );
}

function SettingField({
  label,
  opts,
  value,
  hint,
  notes,
  onPick,
}: {
  label: string;
  opts: string[];
  value: string;
  hint?: string;
  notes?: Record<string, string>; // 个别选项的小标注（如 2K/4K「模型上限」）
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
            {notes?.[o] && <em className="sel-chip-note">{notes[o]}</em>}
          </span>
        ))}
      </div>
    </div>
  );
}

// M4：可编辑元素卡——名称 / 类型 / 参考图（一致性锚点）
// 三类元素默认 emoji + 生图清晰度 → /api/image size 映射
const ASSET_KIND_EMOJI: Record<string, string> = { 场景: "🏞️", 角色: "🧑", 道具: "🎁" };
// 文生图模型要求图片 ≥ 3,686,400 像素（约 1920×1920），故 1K 档也用 1920² 起（避免 size too small 报错）
const ASSET_SIZE_MAP: Record<string, string> = { "1K": "1920x1920", "2K": "2048x2048", "4K": "4096x4096" };
const ASSET_KINDS_ALL: Array<Asset["kind"]> = ["角色", "场景", "道具"];

// 按元素类型定制生图提示词后缀：场景只出环境（无人物）、角色出三视图、道具出单个静物
function assetKindPrompt(kind: Asset["kind"]): string {
  if (kind === "场景") return "场景环境概念图，宽幅取景，画面中不要出现人物，写实、氛围统一、高清";
  if (kind === "角色") return "角色设定图，横构图左右分区：左侧为该角色的半身特写照片（清晰正脸、上半身、突出五官与气质），右侧为同一角色的三视图（正面、侧面、背面三个视角并排全身，姿势自然）；左右为同一个人，外貌/发型/服饰完全一致，纯白色背景，无场景干扰，高清";
  return "单个道具静物图，主体居中，纯色干净背景，无人物、无多余物件，高清";
}

// 按元素类型定制「AI 扩写」的指令：场景只写环境不带人物、角色只写外观设定、道具只写物件外观
function assetExpandInstr(kind: Asset["kind"]): string {
  if (kind === "场景") return "扩写这个场景的环境画面描述，只写场景、环境、光影、氛围，画面中不要出现任何人物或角色";
  if (kind === "角色") return "扩写这个角色的外观设定（外貌、发型、服饰、气质、标志性元素），用于生成角色三视图，不要描述场景背景";
  return "扩写这个道具的外观（造型、材质、颜色、细节），不要出现人物或场景";
}

// ② 场景角色道具：空态引导 + 工具栏（手动添加分类型 / 自动读剧本生成 / 生成设置）+ 元素卡片列表
function AssetsStep({
  assets,
  setAssets,
  script,
  stylePrompt,
  genSettings,
  setGenSettings,
  genAllImages,
  stopGenAllImages,
  voiceMatchBusy,
  genImgBusy,
  genImgProg,
  toast,
  goStep,
  openLibraryPicker,
}: {
  assets: Asset[];
  setAssets: (f: (a: Asset[]) => Asset[]) => void;
  script: string;
  stylePrompt: string; // 项目视频风格的画面描述词（智能匹配为空），生图/改图时注入保持整体风格一致
  genSettings: Record<string, AssetGenSetting>;
  setGenSettings: (updater: Record<string, AssetGenSetting> | ((p: Record<string, AssetGenSetting>) => Record<string, AssetGenSetting>)) => void;
  genAllImages: (redoAll?: boolean) => void; // 一键生成全部参考图（提升到 Studio，切步骤/页面后台仍继续）
  stopGenAllImages: () => void; // 停止一键生成
  voiceMatchBusy: boolean;
  genImgBusy: boolean;
  genImgProg: { done: number; total: number };
  toast: (s: string, k?: "warn") => void;
  goStep: (k: string) => void;
  openLibraryPicker: (filter: "image" | "video", onPick: (item: AssetCard) => void) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [autoBusy, setAutoBusy] = useState(false);
  const [setOpen, setSetOpen] = useState(false);
  const [filter, setFilter] = useState<"全部" | Asset["kind"]>("全部"); // 按类型筛选元素卡片

  function addAsset(kind: Asset["kind"]) {
    setAddOpen(false);
    // 手动新增的排在最前面，方便用户立即看到并编辑
    setAssets((list) => [{ id: `a-${Date.now().toString(36)}-${list.length}`, emoji: ASSET_KIND_EMOJI[kind] ?? "🎬", name: `新${kind}`, kind }, ...list]);
  }

  // 自动生成：读剧本 → LLM 提取场景/角色/道具（JSON）→ 批量创建元素
  async function autoGen() {
    if (autoBusy) return;
    if (!script.trim()) return toast("请先在「① 脚本编辑」写好脚本", "warn");
    // 存在「上次自动生成的元素」时先确认：会替换它们（手动添加的会保留）
    if (assets.some((a) => a.id.startsWith("auto-")) && !(await appConfirm("「自动添加」会替换上次自动添加的元素（保留你手动添加的），按最新脚本重新提取。是否继续？"))) return;
    setAutoBusy(true);
    let full = "";
    try {
      const resp = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene: "studio-assets", input: script }),
      });
      if (!resp.ok || !resp.body) {
        const j = (await resp.json().catch(() => ({}))) as { error?: string };
        toast(j.error || "生成失败，请重试", "warn");
        return;
      }
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop() ?? "";
        for (const evt of events) {
          const line = evt.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          try {
            const j = JSON.parse(line.slice(5).trim()) as { text?: string };
            if (j.text) full += j.text;
          } catch {
            /* 跳过 */
          }
        }
      }
      const m = full.match(/\{[\s\S]*\}/);
      const obj = m ? (JSON.parse(m[0]) as { scenes?: string[]; characters?: string[]; props?: string[] }) : null;
      if (!obj) return toast("解析失败，请重试", "warn");
      const items: { kind: Asset["kind"]; name: string }[] = [];
      // 顺序：角色 > 场景 > 道具（自动添加优先给出角色）
      (obj.characters || []).forEach((n) => n && items.push({ kind: "角色", name: String(n) }));
      (obj.scenes || []).forEach((n) => n && items.push({ kind: "场景", name: String(n) }));
      (obj.props || []).forEach((n) => n && items.push({ kind: "道具", name: String(n) }));
      if (!items.length) return toast("剧本里没提取到场景/角色/道具", "warn");
      // 只替换「上次自动生成的」（id 以 auto- 开头）：保留手动添加 / 示例元素，删掉旧的自动元素、换成本次的
      setAssets((list) => [
        ...list.filter((a) => !a.id.startsWith("auto-")),
        ...items.map((it, i) => ({ id: `auto-${Date.now().toString(36)}-${i}`, emoji: ASSET_KIND_EMOJI[it.kind] ?? "🎬", name: it.name, kind: it.kind })),
      ]);
      toast(`已从剧本生成 ${items.length} 个元素`);
    } catch {
      toast("生成中断，请重试", "warn");
    } finally {
      setAutoBusy(false);
    }
  }

  // 一键生成全部图片：实际生成逻辑在 Studio（后台持续，切步骤/页面不中断）。这里只做首次点击的「去生成设置」提示。
  // redoAll=true：全部重做（含已有图片，按当前视频风格覆盖重生成）。
  function onGenAll(redoAll = false) {
    if (genImgBusy) return;
    if (!assets.length) return toast("还没有元素，请先「自动添加」或手动添加", "warn");
    try {
      if (!localStorage.getItem(GEN_IMG_HINT_KEY)) {
        localStorage.setItem(GEN_IMG_HINT_KEY, "1");
        setSetOpen(true);
        toast("首次生成，请先确认生图模型和清晰度，关闭后再点即可开始生成");
        return;
      }
    } catch {
      /* 隐私模式禁用 storage 时忽略，直接进入生成 */
    }
    genAllImages(redoAll); // 交给 Studio 的后台并行生成
  }
  const allHaveImg = assets.length > 0 && assets.every((a) => a.refImg);

  const empty = assets.length === 0;
  return (
    <div className="stage-panel">
      <div className="sp-title">② 角色场景道具</div>
      <div className="sp-sub">手动添加或自动读剧本生成角色 / 场景 / 道具，给参考图（本地上传 · 仓库选图 · AI 生成）。在「分镜脚本」为每镜勾选出镜元素，生成时注入参考图保持一致。</div>
      <div className="assets-toolbar">
        <button className="btn btn-soft btn-sm" disabled={autoBusy} onClick={autoGen} title="读取①脚本内容，自动添加场景/角色/道具（只加元素，不生图）">
          <Icon name={autoBusy ? "refresh" : "sparkle"} size={14} className={autoBusy ? "ico-spin" : undefined} /> {autoBusy ? "添加中…" : "自动添加"}
        </button>
        <div className="assets-add-wrap">
          <button className="btn btn-soft btn-sm" onClick={() => setAddOpen((v) => !v)}>＋ 手动添加 ▾</button>
          {addOpen && (
            <>
              <div className="assets-add-mask" onClick={() => setAddOpen(false)} />
              <div className="assets-add-menu">
                {ASSET_KINDS_ALL.map((k) => (
                  <button key={k} onClick={() => addAsset(k)}>新增{k}</button>
                ))}
              </div>
            </>
          )}
        </div>
        {genImgBusy ? (
          <button className="btn btn-primary btn-sm assets-genall-stop" onClick={stopGenAllImages} title="点击停止（正在生成的这几张会完成，其余不再生成）">
            <Icon name="refresh" size={14} className="ico-spin" /> 生成中 {genImgProg.done}/{genImgProg.total} · 点击停止
          </button>
        ) : (
          <button className="btn btn-primary btn-sm" disabled={autoBusy || empty} onClick={() => onGenAll(allHaveImg)} title={allHaveImg ? "全部元素重新生成参考图（按当前视频风格覆盖现有图片）" : "对所有还没有参考图的元素，先优化描述再 AI 生成参考图（后台生成，可切换到其它步骤）"}>
            <Icon name={allHaveImg ? "refresh" : "sparkle"} size={14} /> {allHaveImg ? "一键全部重做" : "一键生成全部图片"}
          </button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={() => setSetOpen(true)} title="生成设置">
          <Icon name="gear" size={14} />
        </button>
        {/* 音色改为默认自动匹配（角色出现即在后台匹配），此处不再放手动按钮 */}
        {voiceMatchBusy && (
          <span className="btn btn-ghost btn-sm" style={{ pointerEvents: "none", opacity: 0.75 }}>
            <Icon name="refresh" size={14} className="ico-spin" /> 匹配音色中…
          </span>
        )}
        {!empty && (
          <div className="assets-filter">
            {(["全部", ...ASSET_KINDS_ALL] as const).map((k) => (
              <span key={k} className={filter === k ? "sel-chip on" : "sel-chip"} onClick={() => setFilter(k)}>{k}</span>
            ))}
          </div>
        )}
      </div>
      {empty ? (
        <div className="assets-empty">
          <div className="assets-empty-ico"><Icon name="video" size={42} /></div>
          <div className="assets-empty-tip">
            手动添加：手动新增场景 / 角色 / 道具，再给参考图
            <br />
            自动添加：自动读取脚本内容，添加场景 / 角色 / 道具（再点「一键生成全部图片」出参考图）
          </div>
        </div>
      ) : (
        <div className="sp-cards2">
          {assets.filter((a) => filter === "全部" || a.kind === filter).map((a) => (
            <AssetCardEdit
              key={a.id}
              asset={a}
              toast={toast}
              genSize={genSettings[a.kind]?.size}
              script={script}
              stylePrompt={stylePrompt}
              onChange={(patch) => setAssets((list) => list.map((x) => (x.id === a.id ? { ...x, ...patch } : x)))}
              onRemove={() => setAssets((list) => list.filter((x) => x.id !== a.id))}
              openLibraryPicker={openLibraryPicker}
            />
          ))}
        </div>
      )}
      <div className="sp-actions">
        <button className="btn btn-primary btn-sm" onClick={() => goStep("storyboard")}>下一步 · 分镜脚本 →</button>
      </div>
      {setOpen &&
        createPortal(
          <div className="sh-mask" onClick={() => setSetOpen(false)}>
            <div className="gen-set-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="gen-set-hd">
                <b>生成设置</b>
                <span>为场景、角色、道具分别设置生图清晰度</span>
                <button className="gen-set-x" onClick={() => setSetOpen(false)} aria-label="关闭"><Icon name="close" size={14} /></button>
              </div>
              {ASSET_KINDS_ALL.map((k) => (
                <div className="gen-set-row" key={k}>
                  <div className="gen-set-klabel">{k}</div>
                  <div className="chip-row">
                    {["1K", "2K", "4K"].map((s) => (
                      <span key={s} className={(genSettings[k]?.size ?? "2K") === s ? "sel-chip on" : "sel-chip"} onClick={() => setGenSettings((p) => ({ ...p, [k]: { ...p[k], size: s } }))}>{s}</span>
                    ))}
                  </div>
                </div>
              ))}
              {/* 一键生成用的生图模型：默认「自动匹配」跟随平台默认；可指定具体模型 */}
              <div className="gen-set-row gen-set-modelrow">
                <div className="gen-set-klabel">生图模型</div>
                <div className="chip-row">
                  {STUDIO_IMAGE_MODELS.map((m) => {
                    const cur = genSettings[ASSET_GEN_MODEL_KEY]?.model ?? STUDIO_IMAGE_MODELS[0].name;
                    return (
                      <span
                        key={m.name}
                        className={cur === m.name ? "sel-chip on" : "sel-chip"}
                        title={m.desc}
                        onClick={() => setGenSettings((p) => ({ ...p, [ASSET_GEN_MODEL_KEY]: { model: m.name } }))}
                      >
                        {m.name}
                      </span>
                    );
                  })}
                </div>
              </div>
              <div className="gen-set-note">「一键生成全部图片」按上面选的生图模型出图；清晰度越高越清晰、消耗越大。</div>
              <div className="gen-set-acts"><button className="btn btn-primary btn-sm" onClick={() => setSetOpen(false)}>保存设置</button></div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

// 通用大图预览：点击缩略图放大查看整张图，点任意处关闭。多处复用（元素参考图 / 首尾帧 / 镜头图）
function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return createPortal(
    <div className="img-lightbox" onClick={onClose}>
      <button className="img-lightbox-x" onClick={onClose} aria-label="关闭"><Icon name="close" size={18} /></button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="查看大图" />
    </div>,
    document.body,
  );
}

function AssetCardEdit({
  asset,
  toast,
  genSize,
  script,
  stylePrompt,
  onChange,
  onRemove,
  openLibraryPicker,
}: {
  asset: Asset;
  toast: (s: string, k?: "warn") => void;
  genSize?: string;
  script: string;
  stylePrompt?: string;
  onChange: (patch: Partial<Asset>) => void;
  onRemove: () => void;
  openLibraryPicker: (filter: "image" | "video", onPick: (item: AssetCard) => void) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [zoom, setZoom] = useState(false); // 点已有参考图 → 放大查看
  const [voiceOpen, setVoiceOpen] = useState(false); // 「声音设置」弹窗（仅角色）
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
      <button
        className="sp-card2-img"
        type="button"
        onClick={() => (asset.refImg ? setZoom(true) : fileRef.current?.click())}
        title={asset.refImg ? "点击查看大图" : "上传参考图"}
      >
        {asset.refImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset.refImg} alt={asset.name} />
        ) : (
          <span className="sp-card2-ph">
            <span className="sp-card2-up">＋ 参考图</span>
          </span>
        )}
      </button>
      {zoom && asset.refImg && <ImageLightbox src={asset.refImg} onClose={() => setZoom(false)} />}
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onFile} />
      {/* 参考图三来源：本地上传 / 仓库选图 / AI 生成 */}
      <div className="sp-card2-src">
        <button type="button" onClick={() => fileRef.current?.click()} title="从本地上传参考图">
          <Icon name="upload" size={11} /> 上传
        </button>
        <button
          type="button"
          onClick={() => openLibraryPicker("image", (it) => { if (it.img) onChange({ refImg: it.img }); })}
          title="从仓库选一张图作参考图"
        >
          <Icon name="film" size={11} /> 仓库
        </button>
        <button type="button" onClick={() => setModalOpen(true)} title="AI 生成参考图（打开生图界面）">
          <Icon name="sparkle" size={11} /> AI 生成
        </button>
      </div>
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
      <input
        className="sp-card2-name"
        value={asset.name}
        placeholder="元素名称"
        onChange={(e) => onChange({ name: e.target.value })}
      />
      {/* 仅角色：底部「音色选择」行，点开「声音设置」弹窗 */}
      {asset.kind === "角色" && (
        <button className="sp-card2-voice" type="button" onClick={() => setVoiceOpen(true)} title="为该角色选择配音音色">
          <span className="sp-card2-voice-lbl">音色选择：</span>
          <b className={asset.voice ? "" : "muted"}>{asset.voice?.name ?? "未选择"}</b>
          <span className="sp-card2-voice-arrow">›</span>
        </button>
      )}
      {voiceOpen && (
        <VoiceSettingsModal
          asset={asset}
          onSave={(v) => { onChange({ voice: v }); setVoiceOpen(false); }}
          onClose={() => setVoiceOpen(false)}
          toast={toast}
        />
      )}
      {modalOpen && (
        <AssetGenModal
          asset={asset}
          genSize={genSize}
          script={script}
          stylePrompt={stylePrompt}
          toast={toast}
          onPick={(url) => { onChange({ refImg: url }); setModalOpen(false); }}
          onClose={() => setModalOpen(false)}
          openLibraryPicker={openLibraryPicker}
        />
      )}
    </div>
  );
}

// 情感中文名 → 火山 emotion 枚举
const VOLC_EMOTION: Record<string, string> = { 开心: "happy", 伤心: "sad", 生气: "angry", 惊讶: "surprise", 平静: "neutral", 中性: "neutral" };

// 试听/合成：调 /api/tts（火山语音）拿音频并播放。成功返回 null；失败返回可读原因（不抛异常）。
let voicePreviewEl: HTMLAudioElement | null = null;
async function playVoicePreview(
  text: string,
  voiceType?: string,
  opts?: { speed?: number; volume?: number; pitch?: number; emotion?: string },
): Promise<string | null> {
  try {
    if (voicePreviewEl) { voicePreviewEl.pause(); voicePreviewEl = null; }
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: text.slice(0, 300),
        voice: voiceType,
        speed: opts?.speed,
        volume: opts?.volume,
        pitch: opts?.pitch,
        emotion: opts?.emotion ? VOLC_EMOTION[opts.emotion] : undefined,
        clone: /^S_/.test(voiceType || ""),
      }),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      return j.error || `试听失败（${res.status}）`;
    }
    const buf = await res.arrayBuffer();
    if (!buf.byteLength) return "试听失败：未返回音频";
    const url = URL.createObjectURL(new Blob([buf], { type: "audio/mpeg" }));
    const a = new Audio(url);
    a.onended = () => URL.revokeObjectURL(url);
    voicePreviewEl = a;
    await a.play();
    return null;
  } catch {
    return "试听失败，请检查网络或 TTS 配置";
  }
}

// 音色收藏（localStorage）
function loadVoiceFavs(): string[] {
  try { return JSON.parse(localStorage.getItem("mofun.studio.voiceFavs") || "[]") as string[]; } catch { return []; }
}
function saveVoiceFavs(ids: string[]) {
  try { localStorage.setItem("mofun.studio.voiceFavs", JSON.stringify(ids)); } catch { /* 隐私模式忽略 */ }
}

// 声音复刻：用户自己的音色（localStorage）。id 即火山 speaker_id（S_xxx），name 为用户命名
interface CustomVoice { id: string; name: string; time?: string }
function loadCustomVoices(): CustomVoice[] {
  try { return JSON.parse(localStorage.getItem("mofun.studio.customVoices") || "[]") as CustomVoice[]; } catch { return []; }
}
function saveCustomVoices(list: CustomVoice[]) {
  try { localStorage.setItem("mofun.studio.customVoices", JSON.stringify(list)); } catch { /* 隐私模式忽略 */ }
}
// 音色名解析：复刻音色查本地库，系统音色查 voices.ts
function voiceNameOf(id?: string): string {
  if (!id) return "";
  if (/^S_/.test(id)) return loadCustomVoices().find((v) => v.id === id)?.name || "我的声音";
  return findVoice(id)?.name || "";
}
// 音色对象解析：复刻音色包成与系统音色兼容的对象（tts=speaker_id），系统音色查 voices.ts
function resolveVoice(id?: string): Voice | undefined {
  if (!id) return undefined;
  if (/^S_/.test(id)) {
    const cv = loadCustomVoices().find((v) => v.id === id);
    return cv ? ({ id: cv.id, name: cv.name, tts: cv.id, scene: "声音复刻", age: "", gender: "", multiEmotion: false } as Voice) : undefined;
  }
  return findVoice(id);
}

// 音色选择弹窗（图3）：系统音色/收藏 + 场景/年龄/性别筛选 + 网格（试听/收藏）+ 取消/确定
function VoicePickerModal({
  currentId,
  onPick,
  onClose,
}: {
  currentId?: string;
  onPick: (voiceId: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"system" | "fav">("system");
  const [scene, setScene] = useState<string>(VOICE_SCENES[0]);
  const [age, setAge] = useState<string>(VOICE_AGES[0]);
  const [gender, setGender] = useState<string>(VOICE_GENDERS[0]);
  const [sel, setSel] = useState<string | undefined>(currentId);
  const [favs, setFavs] = useState<string[]>([]);
  const [customs, setCustoms] = useState<CustomVoice[]>([]); // 声音复刻：我的声音
  const [cloneOpen, setCloneOpen] = useState(false); // 「使用自己声音」录制/上传弹层
  const [menuFor, setMenuFor] = useState<string | null>(null); // 我的声音的「⋮」菜单展开项
  const [editId, setEditId] = useState<string | null>(null); // 正在重命名的我的声音 id
  const [editName, setEditName] = useState("");
  const [mounted, setMounted] = useState(false);
  // 我的声音：重命名 / 删除（仅复刻音色，写回 localStorage）
  const renameCustom = (id: string, nm: string) => {
    const name = nm.trim();
    if (!name) return;
    const next = loadCustomVoices().map((v) => (v.id === id ? { ...v, name } : v));
    saveCustomVoices(next); setCustoms(next);
  };
  const deleteCustom = (id: string) => {
    const next = loadCustomVoices().filter((v) => v.id !== id);
    saveCustomVoices(next); setCustoms(next);
    if (sel === id) setSel(undefined);
  };
  useEffect(() => { setMounted(true); setFavs(loadVoiceFavs()); setCustoms(loadCustomVoices()); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggleFav = (id: string) => {
    setFavs((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      saveVoiceFavs(next);
      return next;
    });
  };
  const list = VOICES.filter((v) => {
    if (tab === "fav" && !favs.includes(v.id)) return false;
    // 「多情感」是标记维度：选它则只看有多情感的音色；其它场景按 v.scene 精确匹配
    if (scene === "多情感") { if (!v.multiEmotion) return false; }
    else if (scene !== VOICE_SCENES[0] && v.scene !== scene) return false;
    if (age !== VOICE_AGES[0] && v.age !== age) return false;
    if (gender !== VOICE_GENDERS[0] && v.gender !== gender) return false;
    return true;
  });
  const resetFilters = () => { setScene(VOICE_SCENES[0]); setAge(VOICE_AGES[0]); setGender(VOICE_GENDERS[0]); };

  if (!mounted) return null;
  return createPortal(
    <div className="vp-mask" onClick={onClose}>
      <div className="vpk-panel" onClick={(e) => e.stopPropagation()}>
        <div className="vpk-head">
          <div className="vp-tabs">
            <button className={tab === "system" ? "vp-tab on" : "vp-tab"} onClick={() => setTab("system")}>系统音色</button>
            <button className={tab === "fav" ? "vp-tab on" : "vp-tab"} onClick={() => setTab("fav")}>收藏音色</button>
          </div>
          <button className="vp-x" aria-label="关闭" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>
        <div className="vp-filters">
          <select className="vp-sel" value={scene} onChange={(e) => setScene(e.target.value)}>
            {VOICE_SCENES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="vp-sel" value={age} onChange={(e) => setAge(e.target.value)}>
            {VOICE_AGES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="vp-sel" value={gender} onChange={(e) => setGender(e.target.value)}>
            {VOICE_GENDERS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {/* 使用自己声音（声音复刻）：录/传一段自己的声音克隆成音色 */}
          <button className="vp-own" onClick={() => setCloneOpen(true)} title="录一段或上传一段自己的声音，克隆成专属音色">
            使用自己声音
          </button>
          <button className="vp-reset" onClick={resetFilters}>重置筛选</button>
        </div>
        <div className="vp-grid">
          {/* 我的声音（复刻音色）：置顶，可选、可试听 */}
          {tab === "system" && customs.map((cv) => (
            <div
              key={cv.id}
              className={`vp-item vp-item-own${sel === cv.id ? " on" : ""}`}
              onClick={() => setSel(cv.id)}
            >
              <button
                className="vp-play"
                title="试听"
                onClick={(e) => { e.stopPropagation(); void playVoicePreview(`你好，我是${cv.name}。`, cv.id); }}
              >▶</button>
              {editId === cv.id ? (
                <input
                  className="vp-rename"
                  value={editName}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { renameCustom(cv.id, editName); setEditId(null); }
                    if (e.key === "Escape") setEditId(null);
                  }}
                  onBlur={() => { renameCustom(cv.id, editName); setEditId(null); }}
                  maxLength={12}
                />
              ) : (
                <span className="vp-name">{cv.name}</span>
              )}
              <span className="vp-badge vp-badge-own">我的</span>
              {/* 仅「我的声音」有 ⋮ 菜单：重命名 / 删除 */}
              <button
                className="vp-more"
                title="更多"
                onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === cv.id ? null : cv.id); }}
              >⋮</button>
              {menuFor === cv.id && (
                <>
                  <div className="vp-more-mask" onClick={(e) => { e.stopPropagation(); setMenuFor(null); }} />
                  <div className="vp-more-menu" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => { setEditId(cv.id); setEditName(cv.name); setMenuFor(null); }}>重命名</button>
                    <button className="vp-more-del" onClick={() => { deleteCustom(cv.id); setMenuFor(null); }}>删除</button>
                  </div>
                </>
              )}
            </div>
          ))}
          {list.length === 0 && customs.length === 0 && <div className="vp-empty">{tab === "fav" ? "还没有收藏的音色" : "没有符合筛选条件的音色"}</div>}
          {list.map((v) => (
            <div
              key={v.id}
              className={`vp-item${sel === v.id ? " on" : ""}`}
              onClick={() => setSel(v.id)}
            >
              <button
                className="vp-play"
                title="试听"
                onClick={(e) => { e.stopPropagation(); void playVoicePreview(`你好，我是${v.name}。`, v.tts); }}
              >▶</button>
              <span className="vp-name">{v.name}</span>
              {v.multiEmotion && <span className="vp-badge">多情感</span>}
              <button
                className={`vp-fav${favs.includes(v.id) ? " on" : ""}`}
                title={favs.includes(v.id) ? "取消收藏" : "收藏"}
                onClick={(e) => { e.stopPropagation(); toggleFav(v.id); }}
              >{favs.includes(v.id) ? "★" : "☆"}</button>
            </div>
          ))}
        </div>
        <div className="vp-acts">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>取消</button>
          <button className="btn btn-primary btn-sm" disabled={!sel} onClick={() => { if (sel) { onPick(sel); onClose(); } }}>确定</button>
        </div>
      </div>
      {cloneOpen && (
        <VoiceCloneModal
          onClose={() => setCloneOpen(false)}
          onDone={(cv) => {
            const next = [cv, ...loadCustomVoices().filter((x) => x.id !== cv.id)];
            saveCustomVoices(next);
            setCustoms(next);
            setSel(cv.id);
            setCloneOpen(false);
          }}
        />
      )}
    </div>,
    document.body,
  );
}

// 使用自己声音（声音复刻）：录制或上传一段音频 → 火山训练 → 轮询状态 → 存为「我的声音」
function VoiceCloneModal({ onClose, onDone }: { onClose: () => void; onDone: (cv: CustomVoice) => void }) {
  const [name, setName] = useState("我的声音");
  const [audio, setAudio] = useState<{ blob: Blob; url: string; format: string } | null>(null);
  const [recording, setRecording] = useState(false);
  const [phase, setPhase] = useState<"idle" | "submitting" | "training" | "error">("idle");
  const [err, setErr] = useState("");
  const [mounted, setMounted] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => () => { if (audio) URL.revokeObjectURL(audio.url); }, [audio]);

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        setAudio({ blob, url: URL.createObjectURL(blob), format: /wav/.test(blob.type) ? "wav" : /mp3|mpeg/.test(blob.type) ? "mp3" : "wav" });
      };
      recRef.current = mr;
      mr.start();
      setRecording(true);
    } catch {
      setErr("无法访问麦克风，请检查浏览器权限，或改用上传音频。");
      setPhase("error");
    }
  };
  const stopRec = () => { recRef.current?.stop(); setRecording(false); };
  const onFile = (f?: File) => {
    if (!f) return;
    const fmt = /wav/i.test(f.name) ? "wav" : /m4a|aac/i.test(f.name) ? "m4a" : "mp3";
    setAudio({ blob: f, url: URL.createObjectURL(f), format: fmt });
  };

  const blobToBase64 = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => resolve(String(r.result).replace(/^data:[^;]+;base64,/, ""));
      r.onerror = reject;
      r.readAsDataURL(blob);
    });

  const submit = async () => {
    if (!audio || !name.trim()) return;
    setPhase("submitting"); setErr("");
    try {
      // 统一转 WAV 再上传（火山不收浏览器录音的 webm 格式）
      const wav = await blobToWav(audio.blob);
      if (!wav) { setErr("音频解析失败，请换一段录音或换个音频文件重试。"); setPhase("error"); return; }
      const b64 = await blobToBase64(wav);
      const tr = await fetch("/api/voice-clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "train", audio: b64, format: "wav", used: loadCustomVoices().map((v) => v.id) }),
      });
      const tj = await tr.json();
      if (!tr.ok || !tj.speakerId) { setErr(tj.error || "提交训练失败"); setPhase("error"); return; }
      const speakerId = tj.speakerId as string;
      setPhase("training");
      // 轮询状态（每 4s，最多 ~3 分钟）
      const deadline = Date.now() + 3 * 60 * 1000;
      for (;;) {
        if (Date.now() > deadline) { setErr("训练超时，请稍后在「我的声音」重试。"); setPhase("error"); return; }
        await new Promise((r) => setTimeout(r, 4000));
        const sr = await fetch("/api/voice-clone", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "status", speakerId }),
        });
        const sj = await sr.json();
        if (sj.done) {
          if (sj.ok) { onDone({ id: speakerId, name: name.trim() }); return; }
          setErr(sj.message || "训练失败，请换一段更清晰的录音重试。"); setPhase("error"); return;
        }
      }
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e)); setPhase("error");
    }
  };

  if (!mounted) return null;
  const busy = phase === "submitting" || phase === "training";
  return createPortal(
    <div className="vp-mask" onClick={busy ? undefined : onClose}>
      <div className="vcl-panel" onClick={(e) => e.stopPropagation()}>
        <div className="vpk-head">
          <b>使用自己的声音（声音复刻）</b>
          <button className="vp-x" aria-label="关闭" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>
        <div className="vcl-body">
          <div className="vcl-tip">录一段或上传一段清晰的中文朗读（约 10–20 秒、安静环境、单人），克隆成你的专属音色。</div>
          <div className="vcl-script">
            <div className="vcl-script-label">朗读参考（照着念即可）</div>
            <p className="vcl-script-text">你好，很高兴认识你。今天天气不错，希望你也有个好心情。生活中有很多美好的事情值得我们去发现，只要用心感受，每一天都会充满惊喜。</p>
          </div>
          <label className="vcl-field"><span>音色名称</span>
            <input className="vcl-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={12} placeholder="如：我的声音" />
          </label>
          <div className="vcl-capture">
            {!recording ? (
              <button className="btn btn-soft btn-sm" onClick={startRec} disabled={busy}>● 录制</button>
            ) : (
              <button className="btn btn-primary btn-sm" onClick={stopRec}>■ 停止录制</button>
            )}
            <button className="btn btn-soft btn-sm" onClick={() => fileRef.current?.click()} disabled={busy}>⬆ 上传音频</button>
            <input ref={fileRef} type="file" accept="audio/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
            {audio && <audio className="vcl-audio" src={audio.url} controls controlsList="nodownload noplaybackrate" />}
          </div>
          {err && <div className="vcl-err">{err}</div>}
          {phase === "training" && <div className="vcl-status">🧬 正在训练你的声音，请稍候（约 1–2 分钟）…</div>}
          {phase === "submitting" && <div className="vcl-status">上传中…</div>}
        </div>
        <div className="vp-acts">
          <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={busy}>取消</button>
          <button className="btn btn-primary btn-sm" disabled={!audio || !name.trim() || busy} onClick={submit}>
            {busy ? "处理中…" : "开始克隆"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// 背景音乐选择弹层（⑤ 时间轴「添加背景音乐」用）：内置曲库 + 上传本地音乐
function BgmPickerModal({
  current,
  onPick,
  onClose,
  toast,
}: {
  current?: { url: string; name: string; volume: number } | null;
  onPick: (b: { url: string; name: string; volume: number }) => void;
  onClose: () => void;
  toast: (s: string, k?: "warn") => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!mounted) return null;
  return createPortal(
    <div className="vp-mask" onClick={onClose}>
      <div className="bgmpick" onClick={(e) => e.stopPropagation()}>
        <div className="bgmpick-head">
          <b>🎵 背景音乐</b>
          <button className="vp-x" aria-label="关闭" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>
        <div className="bgmpick-body">
          <div className="sp-bgm-menu-title">内置曲库</div>
          <div className="sp-bgm-presets">
            {BGM_PRESETS.map((p) => (
              <button
                key={p.id}
                className={current?.name === p.name ? "sp-bgm-preset on" : "sp-bgm-preset"}
                onClick={async () => {
                  const url = bgmUrl(p.id);
                  const ok = await fetch(url, { method: "HEAD" }).then((r) => r.ok).catch(() => false);
                  if (!ok) { toast("内置曲库的音乐文件还没放置（需把 mp3 放到 public/bgm/），请先用「上传本地音乐」", "warn"); return; }
                  onPick({ url, name: p.name, volume: current?.volume ?? 30 });
                }}
              >
                {p.name}<em>{p.mood}</em>
              </button>
            ))}
          </div>
          <label className="sp-bgm-upload">
            ＋ 上传本地音乐（mp3/wav）
            <input
              type="file"
              accept="audio/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                if (f.size > 20 * 1024 * 1024) { toast("音频不能超过 20MB", "warn"); return; }
                onPick({ url: URL.createObjectURL(f), name: f.name.replace(/\.[^.]+$/, ""), volume: current?.volume ?? 30 });
              }}
            />
          </label>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// 声音设置弹窗（图2）：头部音色 + 语速/音量/语调 + 情感 + 试听/确定选择
function VoiceSettingsModal({
  asset,
  onSave,
  onClose,
  toast,
  confirmLabel = "确定选择",
}: {
  asset: Asset;
  onSave: (v: AssetVoice) => void;
  onClose: () => void;
  toast: (s: string, k?: "warn") => void;
  confirmLabel?: string; // 确定按钮文案（重新编辑已生成的配音时传「重新生成」）
}) {
  const [voiceId, setVoiceId] = useState<string | undefined>(asset.voice?.id);
  const [rate, setRate] = useState(asset.voice?.rate ?? 1.0);
  const [volume, setVolume] = useState(asset.voice?.volume ?? 5);
  const [pitch, setPitch] = useState(asset.voice?.pitch ?? 1.0);
  const [emotion, setEmotion] = useState<string | undefined>(asset.voice?.emotion);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (pickerOpen ? undefined : onClose());
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, pickerOpen]);

  const voice: Voice | undefined = resolveVoice(voiceId);
  // 换音色后，若新音色不支持多情感，清掉情感
  useEffect(() => { if (!voice?.multiEmotion) setEmotion(undefined); }, [voice?.multiEmotion]);

  const doPreview = async () => {
    if (previewing) return;
    setPreviewing(true);
    const err = await playVoicePreview(`你好，我是${asset.name || "角色"}，很高兴见到你。`, voice?.tts, {
      speed: rate, volume: volume / 5, pitch, emotion: voice?.multiEmotion ? emotion : undefined,
    });
    setPreviewing(false);
    if (err) toast(err, "warn");
  };
  const confirm = () => {
    if (!voice) { toast("请先选择音色", "warn"); return; }
    onSave({ id: voice.id, name: voice.name, rate, volume, pitch, emotion: voice.multiEmotion ? emotion : undefined });
  };

  if (!mounted) return null;
  return createPortal(
    <div className="vs-mask" onClick={onClose}>
      <div className="vs-panel" onClick={(e) => e.stopPropagation()}>
        <div className="vs-head">
          <b>声音设置</b>
          <button className="vs-x" aria-label="关闭" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>
        <div className="vs-top">
          <span className="vs-avatar">
            {asset.refImg
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={asset.refImg} alt={asset.name} />
              : <Icon name="image" size={20} />}
          </span>
          <span className="vs-name">{asset.name || "角色"}</span>
          <span className={`vs-voice${voice ? " on" : ""}`}>{voice ? `🎤 ${voice.name}` : "🎤 未选择音色"}</span>
          <button className="vs-pick" onClick={() => setPickerOpen(true)}>音色选择 ›</button>
        </div>

        <div className="vs-row">
          <span className="vs-lbl">语速</span>
          <input className="vs-range" type="range" min={0.5} max={2} step={0.1} value={rate} onChange={(e) => setRate(Number(e.target.value))} />
          <span className="vs-val">{rate.toFixed(1)}x</span>
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
          {voice?.multiEmotion ? (
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
          <button className="vs-preview" disabled={previewing} onClick={doPreview}>▶ {previewing ? "试听中…" : "试听"}</button>
          <button className="btn btn-primary vs-confirm" onClick={confirm}>{confirmLabel}</button>
        </div>
      </div>
      {pickerOpen && (
        <VoicePickerModal
          currentId={voiceId}
          onPick={(id) => setVoiceId(id)}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>,
    document.body,
  );
}

// AI 生成参考图的「生图界面」弹窗：画面描述 + 清晰度 + 立即生成，右侧生成结果可选一张回填为参考图。
function AssetGenModal({
  asset,
  genSize,
  script,
  stylePrompt,
  toast,
  onPick,
  onClose,
  openLibraryPicker,
  headerText,
  kindPrompt,
  expandInstr,
  baseImage,
}: {
  asset: Asset;
  genSize?: string;
  script: string;
  stylePrompt?: string; // 项目视频风格描述词：拼进生图/改图 prompt，使参考图风格与整片一致
  toast: (s: string, k?: "warn") => void;
  onPick: (url: string) => void;
  onClose: () => void;
  openLibraryPicker: (filter: "image" | "video", onPick: (item: AssetCard) => void) => void;
  headerText?: string; // 覆盖标题副文本（用于「镜头帧」生图，如「镜头图 / 首帧」）
  kindPrompt?: string; // 覆盖类型定制提示词（默认按 asset.kind：场景/角色三视图/道具）
  expandInstr?: string; // 覆盖 AI 扩写指令（默认按 asset.kind）
  baseImage?: string; // 生图基底图（如尾帧以本镜首帧为基底走图生图，保住主体/场景一致）
}) {
  const [tab, setTab] = useState<"gen" | "edit">("gen");
  const [prompt, setPrompt] = useState(asset.name); // 生图·画面描述（含 AI 扩写结果）
  const [editPrompt, setEditPrompt] = useState(""); // 改图·修改要求（与生图描述独立，互不串写）
  const [size, setSize] = useState(genSize || "2K");
  const [model, setModel] = useState(STUDIO_IMAGE_MODELS[0].name); // 生图/改图模型（生图与改图共用）
  const [zoom, setZoom] = useState<string | null>(null); // 点击生成结果放大查看的图 URL
  const [busy, setBusy] = useState(false);
  const [expBusy, setExpBusy] = useState(false);
  const [images, setImages] = useState<string[]>(asset.refImg ? [asset.refImg] : []); // 已有参考图则先展示在结果区，新生成的排在其前
  const [editImage, setEditImage] = useState(""); // 改图：待修改的原图（base64/URL）
  const editFileRef = useRef<HTMLInputElement>(null);
  function onEditFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) return toast("图片不超过 10MB", "warn");
    const reader = new FileReader();
    reader.onload = () => setEditImage(String(reader.result));
    reader.readAsDataURL(f);
  }

  // AI 扩写：把当前描述 + 剧本背景送 LLM，扩写成与剧本统一的画面描述，流式填回描述框
  async function expand() {
    const p = prompt.trim();
    if (!p) return toast("先填一点描述再扩写", "warn");
    if (expBusy || busy) return;
    setExpBusy(true);
    const input = `【剧本背景】\n${script?.trim() || "（无）"}\n\n【${headerText ?? asset.kind}】${p}\n\n请据剧本背景，${expandInstr ?? assetExpandInstr(asset.kind)}，输出一段话，风格与剧本统一。`;
    let acc = "";
    try {
      const resp = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene: "studio-asset-desc", input, styleHint: stylePrompt }),
      });
      if (!resp.ok || !resp.body) {
        const j = (await resp.json().catch(() => ({}))) as { error?: string };
        toast(j.error || "扩写失败，请重试", "warn");
        return;
      }
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      setPrompt("");
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop() ?? "";
        for (const evt of events) {
          const line = evt.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          try {
            const j = JSON.parse(line.slice(5).trim()) as { text?: string };
            if (j.text) { acc += j.text; setPrompt(acc); }
          } catch {
            /* 跳过 */
          }
        }
      }
      if (!acc.trim()) setPrompt(p); // 扩写为空则还原
    } catch {
      setPrompt(p);
      toast("扩写中断，请重试", "warn");
    } finally {
      setExpBusy(false);
    }
  }

  async function gen() {
    const p = (tab === "edit" ? editPrompt : prompt).trim();
    if (!p) return toast(tab === "edit" ? "请填写修改要求" : "请先填写画面描述", "warn");
    if (tab === "edit" && !editImage) return toast("请先导入要修改的图片", "warn");
    if (busy) return;
    setBusy(true);
    try {
      // 生图：文生图（按类型定制提示词）；改图：图生图（带原图 image + 修改要求）
      // 结合项目「视频风格」：把风格描述词拼进 prompt，使参考图风格与整片统一（智能匹配为空则不拼）
      const styleSuffix = stylePrompt?.trim() ? `，整体画面风格：${stylePrompt.trim()}` : "";
      const modelId = STUDIO_IMAGE_MODELS.find((m) => m.name === model)?.modelId || "";
      // 角色=「左照片+右三视图」横构图 → 宽幅画布；其余按清晰度方图
      const genImgSize = asset.kind === "角色" && !kindPrompt ? "2816x1536" : (ASSET_SIZE_MAP[size] || "2048x2048");
      const base = { n: 1, size: genImgSize, ...(modelId ? { model: modelId } : {}) };
      // 生图：有基底图（如尾帧以首帧为基底）→ 图生图保住主体/场景；否则纯文生。改图：图生图（原图 + 修改要求）。
      const body =
        tab === "edit"
          ? { prompt: `${p}${styleSuffix}`, image: editImage, ...base }
          : {
              prompt: `${p}，${kindPrompt ?? assetKindPrompt(asset.kind)}${styleSuffix}`,
              ...(baseImage ? { image: baseImage } : {}),
              ...base,
            };
      const resp = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await resp.json().catch(() => ({}))) as { images?: string[]; error?: string };
      if (!resp.ok || !j.images?.length) {
        toast(j.error || "生成失败，请重试", "warn");
        return;
      }
      setImages((prev) => [...j.images!, ...prev]); // 新结果排前
    } catch {
      toast("生成失败，请重试", "warn");
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="sh-mask" onClick={onClose}>
      <div className="assetgen-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="assetgen-hd">
          <b>AI 生成参考图</b>
          <span>{headerText ?? `${asset.kind} · ${asset.name || "未命名"}`}</span>
          <button className="assetgen-x" onClick={onClose} aria-label="关闭"><Icon name="close" size={15} /></button>
        </div>
        <div className="assetgen-tabs">
          <button type="button" className={tab === "gen" ? "on" : ""} onClick={() => setTab("gen")}>生图</button>
          <button type="button" className={tab === "edit" ? "on" : ""} onClick={() => setTab("edit")}>改图</button>
        </div>
        <div className="assetgen-body">
          <div className="assetgen-form">
            {tab === "gen" ? (
              <>
                {baseImage && (
                  <div className="assetgen-base">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={baseImage} alt="首帧基底" />
                    <span>已以「首帧」为基底生成，保持主体与场景一致，仅按描述推进到结尾状态</span>
                  </div>
                )}
                <label className="assetgen-lbl">画面描述</label>
                <textarea
                  className="assetgen-ta"
                  value={prompt}
                  placeholder={`描述这个${asset.kind}的样子，如：高山云雾茶园、清晨薄雾、写实…`}
                  onChange={(e) => setPrompt(e.target.value)}
                />
                <div className="assetgen-exp">
                  <button type="button" disabled={expBusy || busy} onClick={expand} title="结合①剧本内容，把描述扩写得更专业、与整片风格统一">
                    <Icon name={expBusy ? "refresh" : "sparkle"} size={12} className={expBusy ? "ico-spin" : undefined} /> {expBusy ? "扩写中…" : "AI 扩写（结合剧本）"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <label className="assetgen-lbl">原图</label>
                <div className="assetgen-import">
                  {editImage ? (
                    <div className="assetgen-import-prev">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={editImage} alt="待修改" />
                      <button type="button" className="assetgen-import-x" onClick={() => setEditImage("")} aria-label="移除"><Icon name="close" size={12} /></button>
                    </div>
                  ) : (
                    <div className="assetgen-import-btns">
                      <button type="button" className="assetgen-import-btn" onClick={() => editFileRef.current?.click()}>
                        <Icon name="upload" size={13} /> 本地上传
                      </button>
                      <button type="button" className="assetgen-import-btn" onClick={() => openLibraryPicker("image", (it) => { if (it.img) setEditImage(it.img); })}>
                        <Icon name="film" size={13} /> 从仓库选
                      </button>
                    </div>
                  )}
                  <input ref={editFileRef} type="file" accept="image/*" hidden onChange={onEditFile} />
                </div>
                <label className="assetgen-lbl">修改要求</label>
                <textarea
                  className="assetgen-ta"
                  value={editPrompt}
                  placeholder="描述要怎么改，如：把背景换成夜晚灯火、转成油画风格、加一杯热茶…"
                  onChange={(e) => setEditPrompt(e.target.value)}
                />
              </>
            )}
            <label className="assetgen-lbl">模型</label>
            <div className="chip-row">
              {STUDIO_IMAGE_MODELS.map((m) => (
                <span key={m.name} className={model === m.name ? "sel-chip on" : "sel-chip"} title={m.desc} onClick={() => setModel(m.name)}>{m.name}</span>
              ))}
            </div>
            <label className="assetgen-lbl">清晰度</label>
            <div className="chip-row">
              {["1K", "2K", "4K"].map((s) => (
                <span key={s} className={size === s ? "sel-chip on" : "sel-chip"} onClick={() => setSize(s)}>{s}</span>
              ))}
            </div>
            <button className="btn btn-primary btn-sm assetgen-go" disabled={busy} onClick={gen}>
              <Icon name={busy ? "refresh" : "sparkle"} size={14} className={busy ? "ico-spin" : undefined} />{" "}
              {busy
                ? tab === "edit"
                  ? "改图中…"
                  : "生成中…"
                : images.length > 0
                  ? tab === "edit"
                    ? "再次改图"
                    : "再次生成"
                  : tab === "edit"
                    ? "立即改图"
                    : "立即生成"}
            </button>
          </div>
          <div className="assetgen-result">
            {busy && <div className="assetgen-loading">正在{tab === "edit" ? "改图" : "生成"}，请稍候…</div>}
            {!busy && images.length === 0 && <div className="assetgen-empty">{tab === "edit" ? "左侧导入原图 + 填写修改要求后点「立即改图」" : "左侧填写描述后点「立即生成」"}，结果会显示在这里，点图即可用作参考图</div>}
            <div className="assetgen-grid">
              {images.map((url, i) => (
                <div key={i} className="assetgen-item">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="生成结果" className="assetgen-thumb" title="点击放大查看" onClick={() => setZoom(url)} />
                  <div className="assetgen-actions">
                    <button type="button" onClick={() => onPick(url)} title="用作参考图">用作参考图</button>
                    <button
                      type="button"
                      title="用这张图去改图"
                      onClick={() => {
                        setEditImage(url); // 这张图作为改图原图
                        setEditPrompt(""); // 修改要求置空，等待填写（不动生图描述）
                        setTab("edit"); // 跳转到「改图」
                      }}
                    >
                      去改图
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {zoom && (
        <div className="assetgen-zoom" onClick={(e) => { e.stopPropagation(); setZoom(null); }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="放大查看" />
        </div>
      )}
    </div>,
    document.body,
  );
}

// 首尾帧模式：单镜的首帧 / 尾帧图片选择（点击上传，校验格式/体积；可移除）。
// 链式衔接：第 2 镜起首帧只读、自动继承上一镜尾帧（prevLastFrame），画面无缝承接。
function ShotFrames({
  shot,
  mode,
  isFirst,
  prevLastFrame,
  script,
  stylePrompt,
  genSize,
  toast,
  onSet,
  openLibraryPicker,
}: {
  shot: Shot;
  mode: "smart" | "keyframe";
  isFirst: boolean;
  prevLastFrame?: string;
  script: string; // 用于 AI 生成帧时的剧本背景 / 扩写
  stylePrompt?: string; // 项目视频风格描述词
  genSize?: string; // 生图清晰度
  toast: (s: string, k?: "warn") => void;
  onSet: (which: "first" | "last", url: string) => void;
  openLibraryPicker: (filter: "image" | "video", onPick: (item: AssetCard) => void) => void;
}) {
  const [genFor, setGenFor] = useState<null | "first" | "last">(null); // 打开「AI 生成帧」弹窗的槽位
  const [zoom, setZoom] = useState<string | null>(null); // 点已有帧图 → 放大查看
  const firstRef = useRef<HTMLInputElement>(null);
  const lastRef = useRef<HTMLInputElement>(null);
  function pick(which: "first" | "last", e: ChangeEvent<HTMLInputElement>) {
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
    reader.onload = () => onSet(which, String(reader.result));
    reader.readAsDataURL(f);
  }
  const editableSlot = (which: "first" | "last", img: string | undefined, ref: RefObject<HTMLInputElement | null>, label: string) => (
    <div className="sf-card">
      <button
        className="sf-card-img"
        type="button"
        onClick={() => (img ? setZoom(img) : ref.current?.click())}
        title={img ? "点击查看大图" : `上传${label}`}
      >
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt={label} />
        ) : (
          <span className="sf-card-ph">
            <Icon name="plus" size={18} />
            {label}
          </span>
        )}
      </button>
      {img && (
        <button className="sf-x" type="button" onClick={() => onSet(which, "")} aria-label="移除">
          <Icon name="close" size={11} />
        </button>
      )}
      <div className="sf-card-src">
        <button type="button" title={`上传${label}`} onClick={() => ref.current?.click()}>
          <Icon name="upload" size={11} /> 上传
        </button>
        <button type="button" title={`从仓库选${label}`} onClick={() => openLibraryPicker("image", (it) => it.img && onSet(which, it.img))}>
          <Icon name="film" size={11} /> 仓库
        </button>
        <button type="button" title={`AI 生成${label}`} onClick={() => setGenFor(which)}>
          <Icon name="sparkle" size={11} /> AI 生成
        </button>
      </div>
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => pick(which, e)} />
    </div>
  );
  // 第 2 镜起：首帧只读，继承上一镜尾帧
  const inheritedFirst = (
    <div className="sf-card" title="承接上一镜尾帧，自动衔接">
      <div
        className="sf-card-img sf-box-linked"
        style={prevLastFrame ? { cursor: "zoom-in" } : undefined}
        onClick={() => prevLastFrame && setZoom(prevLastFrame)}
      >
        {prevLastFrame ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={prevLastFrame} alt="首帧（承接上一镜）" />
        ) : (
          <span className="sf-card-ph sf-ph-linked">承接上一镜尾帧</span>
        )}
      </div>
    </div>
  );
  const frameZoom = zoom && <ImageLightbox src={zoom} onClose={() => setZoom(null)} />;
  // 「AI 生成帧」弹窗：复用 AssetGenModal，用镜头画面描述作起点，覆盖类型提示词为「电影级单帧画面」。
  // 尾帧：以本镜首帧（自设首帧 / 继承的上一镜尾帧）为图生图基底 → 保住主体与场景，仅把画面推进到「结尾状态」，
  // 避免尾帧凭空另画一张、和首帧/画面对不上。
  const genForFirstFrame = shot.firstFrame ?? prevLastFrame;
  const frameModal = genFor && (
    <AssetGenModal
      asset={{ id: `frame-${shot.id}-${genFor}`, emoji: "🎬", name: shot.shotDesc || "", kind: "场景" }}
      genSize={genSize}
      script={script}
      stylePrompt={stylePrompt}
      headerText={`镜头帧 · ${mode === "smart" ? "镜头图" : genFor === "first" ? "首帧" : "尾帧"}`}
      kindPrompt="电影级单帧画面，完整场景构图，写实光影层次，主体清晰，可包含人物 / 环境 / 道具，与整片风格保持一致"
      expandInstr={
        genFor === "last"
          ? "这是本镜的『结尾画面（尾帧）』：在保持首帧的人物、场景、画面风格完全一致的前提下，把画面推进到这一镜动作/剧情结束时的最终定格状态，只描述结尾这一刻的主体姿态、位置与画面，不要出现分镜编号或旁白"
          : "把这一镜的画面扩写成一段完整、具体、有镜头感的画面描述（含主体、环境、光线、构图、氛围），适合直接作为该镜的画面帧生成，不要出现分镜编号或旁白"
      }
      baseImage={genFor === "last" ? genForFirstFrame : undefined}
      toast={toast}
      onPick={(url) => { onSet(genFor, url); setGenFor(null); }}
      onClose={() => setGenFor(null)}
      openLibraryPicker={openLibraryPicker}
    />
  );
  // 智能多帧：每镜一张镜头图（用 firstFrame 存）。强制无缝下第 2 镜起首帧由上一镜尾帧接续 → 只读继承，不再可编辑。
  if (mode === "smart") {
    return (
      <>
        <div className="sf-row">{isFirst ? editableSlot("first", shot.firstFrame, firstRef, "镜头图") : inheritedFirst}</div>
        {frameModal}
        {frameZoom}
      </>
    );
  }
  // 首尾帧：首帧（第 2 镜起继承上一镜尾帧）→ 尾帧
  return (
    <>
      <div className="sf-row">
        {isFirst ? editableSlot("first", shot.firstFrame, firstRef, "首帧") : inheritedFirst}
        <span className="sf-arrow">→</span>
        {editableSlot("last", shot.lastFrame, lastRef, "尾帧")}
      </div>
      {frameModal}
      {frameZoom}
    </>
  );
}

// 剪辑器风格时间轴（亮色）：刻度尺 + 可拖拽播放头（与预览联动）+ 缩略图视频轨 + 字幕轨。
// 可左右拖拽平移、可放大缩小（改变每秒像素）。head/onScrub 由上层控制以和预览播放器同步。
function Timeline({
  shots,
  totalDur,
  head,
  onScrub,
  subtitles,
  onMoveSub,
  onResizeSub,
  onEditSub,
  onRemoveSub,
  onAddSub,
  onPlayClip,
  voiceTracks,
  voiceOffsets = {},
  voiceSegs = {},
  onMoveVoice,
  onGenShotDub,
  synthBusy,
  onOpenBgm,
  audioMode,
  setAudioMode,
  assets = [],
  bgm,
  exportFilm,
  exportDraft,
  exportClips,
  exportSubtitles,
  exporting,
  exportPct,
}: {
  shots: Shot[];
  totalDur: number;
  head: number; // 播放头位置（秒），受控
  onScrub: (sec: number) => void; // 拖动播放头/刻度尺 → 通知上层跳转
  subtitles: Subtitle[];
  onMoveSub: (id: string, start: number) => void; // 拖动字幕块 → 改起始时间
  onResizeSub: (id: string, start: number, dur: number) => void; // 拖字幕块边缘 → 改时长
  onEditSub: (id: string, patch: Partial<Subtitle>) => void; // 编辑字幕文字
  onRemoveSub: (id: string) => void; // 删除字幕
  onAddSub: (sec: number) => void; // 在某时间点新增字幕
  onPlayClip: (shot: Shot) => void; // 点击（非拖拽）镜头块 → 弹出大号分镜视频预览
  voiceTracks?: Record<string, string>; // 配音轨：shotId → 已合成的火山 TTS 音频
  voiceOffsets?: Record<string, number>; // （保留）配音块偏移（秒）
  voiceSegs?: Record<string, { dur: number; name: string }>; // 按字幕的配音：subtitleId → {时长, 音色名}，配音块按此画
  onMoveVoice?: (shotId: string, sec: number) => void; // （保留）拖动配音块 → 改偏移
  onGenShotDub?: (shot: Shot) => void; // 点某镜「生成配音」→ 弹声音设置并合成该镜
  synthBusy?: boolean; // 配音合成进行中
  onOpenBgm?: () => void; // 点「背景音乐」→ 上传本地音频作 BGM
  audioMode?: string; // 声音来源：dub=配音 / original=原声
  setAudioMode?: (m: string) => void; // 切换配音/原声
  assets?: Asset[]; // 用于解析每镜配音音色名
  bgm?: { url: string; name: string; volume: number } | null; // 背景音乐轨
  exportFilm: (opts?: { subtitles: boolean; audio: boolean }) => void; // 导出成片
  exportDraft: () => void; // 导出剪映素材包
  exportClips: () => void; // 重新导出全部分镜素材
  exportSubtitles: () => void; // 只导出字幕(.srt)
  exporting: boolean; // 导出进行中
  exportPct: number; // 导出进度百分比
}) {
  const total = totalDur || 1;
  const [pps, setPps] = useState(92); // 每秒像素（放大缩小改这个）
  const [editingSub, setEditingSub] = useState<string | null>(null); // 正在编辑文字的字幕 id（双击进入）
  const [exportMenu, setExportMenu] = useState(false); // 右上角「导出 ▾」下拉
  const contentW = Math.max(total * pps, 320);
  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const scrubbing = useRef(false);
  const pan = useRef<{ x: number; left: number; clipId: string | null } | null>(null);
  // 字幕块拖动：mode=move 整体平移改起始 / l 拖左缘改起始+时长 / r 拖右缘改时长
  const subDrag = useRef<{ id: string; mode: "move" | "l" | "r"; grab: number; origStart: number; origEnd: number } | null>(null);
  const voiceDrag = useRef<{ id: string; grabX: number; orig: number } | null>(null); // 拖动配音块

  // 持续跟踪容器可用宽度：既用于首屏「铺满」，也作为缩小下限（缩到正好铺满全部镜头）。
  const [availW, setAvailW] = useState(0);
  const fittedRef = useRef(false);
  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    const measure = () => {
      const avail = sc.clientWidth - 32; // 减去左右内边距
      if (avail <= 40) return;
      setAvailW(avail);
      if (!fittedRef.current) {
        // 首屏按「已生成镜头」的时长铺满（未生成的在右侧，用户滑动或缩小才看到）；一个都没生成则铺满全部
        const doneDur = shots.filter((s) => s.status === "done" && s.videoUrl).reduce((a, x) => a + x.dur, 0);
        const fitDur = doneDur > 0 ? doneDur : total;
        setPps(Math.max(6, Math.min(480, avail / fitDur)));
        fittedRef.current = true;
      }
    };
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(sc);
    measure();
    return () => ro?.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  // 缩放范围：缩小下限 = 正好把全部镜头铺满一屏（availW/total）；放大上限 480px/s，足够精确到 1 秒。
  const fitPps = availW > 40 ? availW / total : 24;
  const minPps = fitPps;
  const maxPps = 480;

  const fmt = (s: number) => `00:${String(Math.max(0, Math.floor(s))).padStart(2, "0")}`;
  const before = (i: number) => shots.slice(0, i).reduce((a, x) => a + x.dur, 0);

  // 刻度/标签随缩放自适应：放大时到 1 秒一格；缩小时自动拉大间隔，避免刻度和时间标签挤成一团。
  const NICE = [1, 2, 5, 10, 15, 30, 60];
  const labelStep = NICE.find((s) => s * pps >= 52) ?? 60; // 相邻时间标签间距 ≥ 52px
  const tickStep = NICE.find((s) => s * pps >= 16) ?? labelStep; // 相邻次刻度间距 ≥ 16px
  const ticks: number[] = [];
  for (let s = 0; s <= Math.ceil(total) + 0.001; s += tickStep) ticks.push(s);
  const labels: number[] = [];
  for (let s = 0; s <= Math.ceil(total); s += labelStep) labels.push(s);

  function xToSec(clientX: number) {
    const rect = innerRef.current?.getBoundingClientRect();
    if (!rect || !Number.isFinite(clientX)) return 0;
    const sec = (clientX - rect.left) / pps;
    return Number.isFinite(sec) ? Math.max(0, Math.min(total, sec)) : 0;
  }
  // 刻度尺 / 播放头：按下并拖拽 → 移动播放头（通知上层 scrub，预览跳到对应帧）
  function scrubDown(e: RPointerEvent) {
    scrubbing.current = true;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {
      /* 某些环境 pointerId 无效会抛错，忽略即可 */
    }
    onScrub(xToSec(e.clientX));
  }
  function scrubMove(e: RPointerEvent) {
    if (scrubbing.current) onScrub(xToSec(e.clientX));
  }
  function scrubUp(e: RPointerEvent) {
    scrubbing.current = false;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  }
  // 轨道空白 / 片段上按下拖拽 → 左右平移滚动（字幕输入、刻度尺、播放头、缩放按钮除外）
  function panDown(e: RPointerEvent) {
    if ((e.target as HTMLElement).closest(".tl2-sub, .tl2-subin, .tl2-dub, .tl2-dub-gen, .tl2-orig, .tl2-bgm, .tl2-bgm-gen, .tl2-ruler, .tl2-playhead, .tl2-zoom")) return;
    const sc = scrollRef.current;
    if (!sc) return;
    // 记录按下时命中的镜头块 id（pointer capture 后 panUp 的 target 会变成滚动容器，故在此提前记下）
    const clipId = (e.target as HTMLElement).closest<HTMLElement>(".tl2-clip")?.dataset.shotId ?? null;
    pan.current = { x: e.clientX, left: sc.scrollLeft, clipId };
    try {
      sc.setPointerCapture?.(e.pointerId);
    } catch {
      /* 忽略无效 pointerId */
    }
  }
  function panMove(e: RPointerEvent) {
    if (pan.current && scrollRef.current) scrollRef.current.scrollLeft = pan.current.left - (e.clientX - pan.current.x);
  }
  function panUp(e: RPointerEvent) {
    const p = pan.current;
    pan.current = null;
    scrollRef.current?.releasePointerCapture?.(e.pointerId);
    // 位移很小（<5px）视为「点击」而非「拖拽平移」→ 点了某个已生成的镜头块就弹大号预览
    if (p?.clipId && Math.abs(e.clientX - p.x) < 5) {
      const shot = shots.find((s) => s.id === p.clipId);
      if (shot?.status === "done" && shot.videoUrl) onPlayClip(shot);
    }
  }
  const zoom = (f: number) => setPps((p) => Math.max(minPps, Math.min(maxPps, Math.round(p * f))));

  // 字幕块拖动：按下记录模式与抓取偏移，move 时按指针位置实时改起始/时长
  function subDown(e: RPointerEvent, sub: Subtitle, mode: "move" | "l" | "r") {
    e.stopPropagation();
    try { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* 忽略无效 pointerId */ }
    subDrag.current = { id: sub.id, mode, grab: xToSec(e.clientX) - sub.start, origStart: sub.start, origEnd: sub.start + sub.dur };
  }
  function subMove(e: RPointerEvent) {
    const d = subDrag.current;
    if (!d) return;
    const sec = xToSec(e.clientX);
    if (d.mode === "move") onMoveSub(d.id, sec - d.grab);
    else if (d.mode === "l") onResizeSub(d.id, sec, d.origEnd - sec);
    else onResizeSub(d.id, d.origStart, sec - d.origStart);
  }
  function subUp(e: RPointerEvent) {
    subDrag.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId); } catch { /* 忽略 */ }
  }

  return (
    <div className="tl2">
      {/* 右上角「导出 ▾」：合成成片 / 剪映素材包 / 素材 / 字幕 */}
      <div className="tl2-export">
        <button className="btn btn-primary btn-sm" disabled={exporting} onClick={() => setExportMenu((v) => !v)}>
          {exporting ? `导出中 ${exportPct}%` : "导出 ▾"}
        </button>
        {exportMenu && !exporting && (
          <>
            <div className="sp-export-mask" onClick={() => setExportMenu(false)} />
            <div className="sp-export-menu tl2-export-menu">
              <button className="sp-export-item" onClick={() => { setExportMenu(false); exportFilm({ subtitles: true, audio: true }); }}>
                <span className="sp-export-it"><b>导出成片</b><small>合成为一段视频（含字幕/声音）并下载</small></span>
              </button>
              <button className="sp-export-item" onClick={() => { setExportMenu(false); exportDraft(); }}>
                <span className="sp-export-it"><b>导出剪映素材包</b><small>全部片段 + 字幕(.srt)，拖入剪映二次剪辑</small></span>
              </button>
              <button className="sp-export-item" onClick={() => { setExportMenu(false); exportClips(); }}>
                <span className="sp-export-it"><b>重新导出素材</b><small>把全部分镜片段逐个下载到本地</small></span>
              </button>
              <div className="sp-export-sep" />
              <button className="sp-export-item sp-export-item-sm" onClick={() => { setExportMenu(false); exportSubtitles(); }}>
                <span className="sp-export-it"><b>只导出字幕（.srt）</b></span>
              </button>
            </div>
          </>
        )}
      </div>
      {/* 左侧固定轨道名列：顶部空位放「放大/缩小」控件，其下依次是各轨道名牌，不随时间轴横向滚动 */}
      <div className="tl2-gutter">
        <div className="tl2-gutter-sp">
          {/* 放大 / 缩小（剪映式） */}
          <button className="tl2-zoombtn" onClick={() => zoom(1 / 1.4)} title="缩小" aria-label="缩小">－</button>
          <button className="tl2-zoombtn" onClick={() => zoom(1.4)} title="放大" aria-label="放大">＋</button>
        </div>
        <div className="tl2-glabel tl2-glabel-vid">
          <span>镜头</span>
        </div>
        <div className="tl2-glabel tl2-glabel-sub">
          <span>字幕</span>
        </div>
        <div className="tl2-glabel tl2-glabel-dub">
          <span>配音</span>
        </div>
        <div className="tl2-glabel tl2-glabel-bgm">
          <span>背景音乐</span>
        </div>
      </div>
      <div className="tl2-scroll" ref={scrollRef} onPointerDown={panDown} onPointerMove={panMove} onPointerUp={panUp}>
        <div className="tl2-inner" ref={innerRef} style={{ width: contentW }}>
          {/* 刻度尺 */}
          <div className="tl2-ruler" onPointerDown={scrubDown} onPointerMove={scrubMove} onPointerUp={scrubUp}>
            {ticks.map((s) => (
              <span key={s} className={`tl2-tick ${s % labelStep === 0 ? "maj" : ""}`} style={{ left: s * pps }} />
            ))}
            {labels.map((s) => (
              <span key={`l${s}`} className="tl2-time" style={{ left: s * pps }}>
                {fmt(s)}
              </span>
            ))}
          </div>

          {/* 视频轨 */}
          <div className="tl2-track tl2-vtrack">
            {shots.length === 0 && <span className="tl2-empty">还没有分镜，去「分镜脚本」拆分镜～</span>}
            {shots.map((s, i) => (
              <div
                key={s.id}
                className={`tl2-clip ${s.status}${s.status === "done" && s.videoUrl ? " playable" : ""}`}
                style={{ left: before(i) * pps, width: s.dur * pps }}
                data-shot-id={s.id}
                title={s.status === "done" && s.videoUrl ? "点击查看这一镜的大图预览" : undefined}
              >
                {s.status === "done" && s.videoUrl ? (
                  <video className="tl2-clip-media" src={`${s.videoUrl}#t=0.1`} muted playsInline preload="metadata" />
                ) : s.status === "done" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="tl2-clip-media" src={s.poster} alt="" />
                ) : null}
                <span className="tl2-clip-label">
                  镜头{i + 1} · {fmt(s.dur)}
                </span>
              </div>
            ))}
          </div>

          {/* 字幕轨：多段独立字幕块，可整体拖动改位置、拖两端边缘调时长、双击空白处新增 */}
          <div
            className="tl2-track tl2-subtrack"
            onDoubleClick={(e) => {
              if ((e.target as HTMLElement).closest(".tl2-sub")) return; // 双击空白处新增
              onAddSub(xToSec(e.clientX));
            }}
            title="双击空白处新增字幕"
          >
            {subtitles.length === 0 && <span className="tl2-empty">双击这里添加字幕，或在「分镜脚本」填台词后进入本步自动生成</span>}
            {subtitles.map((sub) => (
              <div
                key={sub.id}
                className="tl2-sub"
                style={{ left: sub.start * pps, width: Math.max(sub.dur * pps, 24) }}
                onPointerDown={(e) => subDown(e, sub, "move")}
                onPointerMove={subMove}
                onPointerUp={subUp}
                onDoubleClick={() => setEditingSub(sub.id)}
                title="拖动改位置 · 拖两端改时长 · 双击编辑文字"
              >
                <span className="tl2-sub-handle tl2-sub-l" onPointerDown={(e) => subDown(e, sub, "l")} />
                {editingSub === sub.id ? (
                  <input
                    className="tl2-subin"
                    autoFocus
                    value={sub.text}
                    placeholder="字幕…"
                    onPointerDown={(e) => e.stopPropagation()}
                    onChange={(e) => onEditSub(sub.id, { text: e.target.value })}
                    onBlur={() => setEditingSub(null)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur(); }}
                  />
                ) : (
                  <span className="tl2-sub-text">{sub.text || "字幕"}</span>
                )}
                <button
                  className="tl2-sub-del"
                  title="删除字幕"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => onRemoveSub(sub.id)}
                >
                  ×
                </button>
                <span className="tl2-sub-handle tl2-sub-r" onPointerDown={(e) => subDown(e, sub, "r")} />
              </div>
            ))}
          </div>

          {/* 配音轨：配音模式下→已配音显示配音块、未配音显示「生成配音」按钮；并在其后放「原声」切换 */}
          <div className="tl2-track tl2-dubtrack">
            {/* 原声切换（放在生成配音之后）：切到原声则用视频自带声音、不用配音 */}
            {setAudioMode && (
              <button
                className={`tl2-orig${audioMode === "original" ? " on" : ""}`}
                style={{ left: before(0) * pps + 100 }}
                onClick={(e) => { e.stopPropagation(); setAudioMode(audioMode === "original" ? "dub" : "original"); }}
                title={audioMode === "original" ? "当前用原声（视频自带声音），点切回配音" : "切到原声：用视频自带声音，不用配音"}
              >
                {audioMode === "original" ? "原声中" : "原声"}
              </button>
            )}
            {audioMode !== "original" && subtitles.map((sub) => {
              const seg = voiceSegs[sub.id];
              if (!seg) return null;
              // 找该字幕所属镜头（点击配音块 → 重新打开声音设置、重配这一镜）
              let acc = 0; let shotOf: Shot | undefined;
              for (const s of shots) { if (sub.start >= acc - 0.05 && sub.start < acc + s.dur - 0.001) { shotOf = s; break; } acc += s.dur; }
              return (
                <div
                  key={`dub-${sub.id}`}
                  className="tl2-dub"
                  style={{ left: sub.start * pps, width: Math.max(seg.dur * pps - 2, 24) }}
                  title={`${seg.name}：${sub.text}（配音 ${seg.dur.toFixed(1)}s）· 点击重新编辑配音`}
                  onClick={(e) => { e.stopPropagation(); if (shotOf && onGenShotDub) onGenShotDub(shotOf); }}
                >
                  <span className="tl2-dub-name">🎙 {seg.name}</span>
                  <span className="tl2-dub-text">{sub.text}</span>
                </div>
              );
            })}
            {/* 每个镜头一个「生成配音」按钮（未生成视频的置灰、提示先生成）；已配音的镜头不显示。原声/配音模式下按钮都保留，只切换配音块内容。
               不限制必须有台词——无台词镜头也显示，声音内容可在弹出的声音设置里手填 */}
            {onGenShotDub && shots.map((s, i) => {
              if (voiceTracks?.[s.id]) return null;
              const canDub = s.status === "done" && !!s.videoUrl;
              return (
                <button
                  key={`dubgen-${s.id}`}
                  className="tl2-dub-gen"
                  style={{ left: before(i) * pps + 3, maxWidth: Math.max(s.dur * pps - 8, 56) }}
                  disabled={synthBusy || !canDub}
                  onClick={(e) => { e.stopPropagation(); onGenShotDub(s); }}
                  title={canDub ? `为镜头${i + 1}生成配音：弹出声音设置，设定后合成这一镜的配音` : `镜头${i + 1}还没生成视频，请先在④生成后再配音`}
                >
                  {synthBusy ? "合成中…" : "生成配音"}
                </button>
              );
            })}
          </div>

          {/* 背景音乐轨：已设置→整片一条；未设置→每个镜头一个「添加背景音乐」按钮 */}
          <div className="tl2-track tl2-bgmtrack">
            {bgm ? (
              <div className="tl2-bgm" style={{ left: 0, width: Math.max(total * pps - 2, 24) }} title="点击更换背景音乐" onClick={() => onOpenBgm?.()}>
                <span className="tl2-bgm-name">🎵 {bgm.name}</span>
              </div>
            ) : (
              shots.map((s, i) => (
                <button
                  key={`bgmgen-${s.id}`}
                  className="tl2-bgm-gen"
                  style={{ left: before(i) * pps + 3, maxWidth: Math.max(s.dur * pps - 8, 56) }}
                  disabled={!onOpenBgm}
                  onClick={(e) => { e.stopPropagation(); onOpenBgm?.(); }}
                  title="上传本地音频作全片背景音乐"
                >
                  添加背景音乐
                </button>
              ))
            )}
          </div>

          {/* 播放头（可拖拽 scrub，与预览联动） */}
          <div
            className="tl2-playhead"
            style={{ left: (Number.isFinite(head) ? head : 0) * pps }}
            onPointerDown={scrubDown}
            onPointerMove={scrubMove}
            onPointerUp={scrubUp}
          >
            <span className="tl2-playhead-grip" />
          </div>
        </div>
      </div>
    </div>
  );
}
