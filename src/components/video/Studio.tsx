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
  firstFrame?: string; // 首尾帧模式：首帧图（base64/URL）
  lastFrame?: string; // 首尾帧模式：尾帧图
  transition?: TransType; // 进入本镜的转场（与上一镜之间），默认「无」不破坏无缝衔接。首镜忽略
}

// 镜头间转场类型（默认无 = 保持尾帧无缝衔接）。black=黑场淡入淡出，white=白闪
type TransType = "none" | "black" | "white";
const TRANS_DUR = 0.45; // 转场时长（秒）
const TRANS_LABEL: Record<TransType, string> = { none: "无", black: "黑场", white: "白闪" };
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
const STUDIO_VIDEO_MODEL = "seedance-2.0-fast";

// 用户在「视频设定」选择的模型名 → 发给 API 的实际模型 ID；未命中时回退到默认可用模型
function modelIdOf(name?: string): string {
  return videoModels.find((m) => m.name === name)?.modelId ?? STUDIO_VIDEO_MODEL;
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

// 后端错误码 / 文案 → 中文提示
function mapVideoErr(error: unknown, status: number): string {
  const raw = (typeof error === "string" ? error : error && typeof error === "object" && "message" in error ? String((error as { message?: unknown }).message) : "").toLowerCase();
  if (status === 504 || raw.includes("timeout")) return "生成超时（视频耗时过长），请重试";
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
    return {
      id: `shot-${i}-${text.length}-${text.charCodeAt(0) || 0}`,
      shotDesc: text, // 仅填脚本实际提到的内容，无对应句子则留空
      caption: extractDialogue(text), // 字幕自动从画面描述引号内台词提取（无台词则空，用户可手动改）
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

      settings: { 模型: "Seedance 2.0 Fast", 视频比例: "16:9", 视频风格: videoStyles[0].name, 视频质量: "480P", 配音: "温柔女声", 配乐: "舒缓", 字幕: "显示", ...readNewSettingsDraft() },
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
  const [exporting, setExporting] = useState(false);
  const [exportPct, setExportPct] = useState(0);
  const [playingClip, setPlayingClip] = useState<Shot | null>(null); // 分镜视频大播放器
  const [editVideoFor, setEditVideoFor] = useState<Shot | null>(null); // 「编辑视频」弹窗（视频生视频，保持首尾帧）
  const [genMode, setGenMode] = useSessionField<GenMode>("genMode"); // 生成模式：文本生成 / 智能多帧 / 首尾帧
  const [subtitlesRaw, setSubtitles] = useSessionField<Subtitle[]>("subtitles"); // 时间轴多段字幕（老项目可能无此字段）
  const subtitles = subtitlesRaw ?? [];
  const [assetGenRaw, setAssetGenSettings] = useSessionField<Record<string, AssetGenSetting>>("assetGenSettings"); // 场景/角色/道具的生图清晰度 + 一键生成模型
  const assetGenSettings = assetGenRaw ?? {};
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
  // 进入「视频预览」时，若还没有时间轴字幕，就按各镜台词自动拆句生成（之后用户可自由拖动/增删，不再自动覆盖）
  useEffect(() => {
    if (stepKey !== "preview") return;
    if ((subtitlesRaw?.length ?? 0) > 0) return;
    const built = buildSubtitlesFromShots(shots);
    if (built.length) setSubtitles(built);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKey]);

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

  // 非破坏式重拆：锁定的镜头保留，其余按剧本重新拆分。
  // 段落式剧本（每段=一镜）镜头数由内容决定，拆完同步镜头数/总时长，与实际 shots 对齐。
  function rebuildShots() {
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
        // 改了「画面描述」或「出镜元素」（影响生成的内容）→ 该镜旧的生成结果作废，回到未生成，
        // 使成片按新剧本重新生成，避免残留旧内容的视频。字幕/旁白/运镜等不影响画面的字段不作废。
        const contentChanged =
          (patch.shotDesc !== undefined && patch.shotDesc !== s.shotDesc) ||
          (patch.assetRefs !== undefined && patch.assetRefs !== s.assetRefs);
        if (contentChanged && (s.status === "done" || s.status === "failed")) {
          return { ...next, status: "idle", pct: 0, videoUrl: undefined, failReason: undefined };
        }
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
  const ensureVideoCached = useCallback(async (url?: string) => {
    if (!url || !/^https?:\/\//i.test(url)) return;
    if (cachedVideosRef.current[url] || cacheInFlightRef.current.has(url)) return; // 已映射 / 正在处理
    cacheInFlightRef.current.add(url);
    try {
      let blob = await getCachedVideo(url);
      if (!blob) {
        blob = await fetch(`/api/media?url=${encodeURIComponent(url)}`)
          .then((r) => (r.ok ? r.blob() : null))
          .catch(() => null);
        if (blob && blob.size) await putCachedVideo(url, blob); // 等落库完成，保证随后抽尾帧能读到本地缓存
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
  }, []);

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
  useEffect(() => {
    if (!assets.length || !shots.length) return;
    let changed = false;
    const next = shots.map((s) => {
      if (autoBoundRef.current.has(s.id)) return s; // 已处理过，尊重用户后续手动选择
      autoBoundRef.current.add(s.id);
      if (s.assetRefs.length) return s; // 已有绑定（用户已选）→ 不动
      const desc = s.shotDesc || "";
      const matched = assets.filter((a) => a.name && desc.includes(a.name)).map((a) => a.id);
      if (!matched.length) return s;
      changed = true;
      return { ...s, assetRefs: matched };
    });
    if (changed) setShots(() => next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shots, assets]);

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
    setShots((prev) => prev.map((s) => (s.id === id ? { ...s, status: "gen", pct: 5, failReason: undefined } : s)));
    // 真实生成约 200s+，进度条缓慢爬升封顶 90%，拿到结果再跳 100%
    let pct = 5;
    const iv = window.setInterval(() => {
      pct = Math.min(90, pct + 2);
      setShots((prev) => prev.map((s) => (s.id === id && s.status === "gen" ? { ...s, pct } : s)));
    }, 1600);
    timers.current.push(iv);

    // 注入出镜元素（场景/角色/道具）。原则：场景/道具「按镜绑定」，角色「全局锁一致」。
    // - 本镜在「分镜脚本」勾选了元素 → 精确用勾选的；
    // - 未勾选 → 只锁「角色」类（保持主角外观一致），绝不默认塞入全部元素——否则每镜都会带上
    //   「颁奖台 / 斗茶大会现场」等无关场景，导致每个视频重复同一画面、跑偏。场景交给画面描述决定。
    const bound = cur.assetRefs.length
      ? assets.filter((a) => cur.assetRefs.includes(a.id))
      : assets.filter((a) => a.kind === "角色");
    const elemText = bound.length
      ? `。画面中需出现：${bound.map((a) => `${a.kind}「${a.name}」`).join("、")}，与设定参考图保持一致`
      : "";
    const stylePrefix = settings.视频风格 !== "智能匹配" ? settings.视频风格 : "";
    // 带入「分镜脚本」里为本镜填写的运镜、景别，让生成画面贴合脚本设定
    const shotMeta = [cur.shotSize && `景别${cur.shotSize}`, cur.camera && `镜头运动${cur.camera}`].filter(Boolean).join("，");
    // 跨全片一致性策略（锁「场景/角色/道具」在所有视频里外观统一）：
    //   角色 → 每一镜都注入「所有角色」参考图做全局锁（主角长相/服饰在所有镜头完全一致）；
    //   场景/道具 → 注入本镜绑定的（按镜相关，避免每镜塞无关场景导致画面重复）。
    // 合并去重、优先角色 > 场景 > 道具，供参考图与文字约束共用。
    const refOrder: Record<Asset["kind"], number> = { 角色: 0, 场景: 1, 道具: 2 };
    const globalChars = assets.filter((a) => a.kind === "角色"); // 全局角色锁：每一镜都带
    const boundSceneProps = bound.filter((a) => a.kind !== "角色"); // 本镜绑定的场景/道具
    const lockElems = [...globalChars, ...boundSceneProps].sort((a, b) => refOrder[a.kind] - refOrder[b.kind]);
    // 全片一致性硬约束：每一镜都要求与参考图 / 前面各镜保持完全相同的画面风格（插画↔写实不许跳变），
    // 并逐一点名要锁死外观的元素。即使是特写、空镜也不能换风格——这是「所有镜头都一致」的关键。
    const hasRefs = lockElems.some((a) => a.refImg);
    const lockNames = lockElems.map((a) => `${a.kind}「${a.name}」`);
    const consistencyNote =
      `整片风格严格统一：与${hasRefs ? "设定参考图和" : ""}前面各镜保持完全一致的画面风格（相同的插画/写实取向、渲染方式、色调、笔触与质感），` +
      `严禁在写实与动漫/插画之间跳变；` +
      (lockNames.length ? `${lockNames.join("、")}的外观（长相、发型、服饰、造型、颜色、材质、比例）在所有镜头中必须与设定参考图完全一致、不得改变；` : "") +
      `场景、角色、道具的外观也与全片保持一致`;
    // 编辑视频：强约束「只改指定部分」——人物、场景、画面风格与原视频保持一致，避免整体风格相对前一镜/原片跳变
    const editNote = opts?.editText?.trim()
      ? `。这是对已有视频的局部修改：在保持画面中人物外观、场景环境、整体画面风格与原视频完全一致的前提下，仅按以下要求改动对应局部，其余部分不要改动：${opts.editText.trim()}`
      : "";
    const prompt = [stylePrefix, `${cur.shotDesc}${elemText}${editNote}`, shotMeta, consistencyNote].filter(Boolean).join("，");
    const generateAudio = settings.配音 !== "不配音";

    // 首帧 = 外部传入的衔接帧（imageOverride）优先，否则本镜自设首帧图（cur.firstFrame）。imageOverride 由 genShot/genAll 按模式给：
    //   首尾帧(keyframe)=首帧图（镜头1 自设首帧 / 第 2 镜起上一镜尾帧图）；文本/智能多帧=上一镜真实视频尾帧。
    // 都没有则纯文生（首镜常见）。参考图「不」作首帧。
    const imageUrl = imageOverride ?? cur.firstFrame;
    // 参考图（reference_image）：注入 lockElems（全局角色 + 本镜场景/道具）的参考图锁跨镜一致性；
    // 不占首帧（首帧仍由脚本文生 / 承接上一镜尾帧决定）。已按角色 > 场景 > 道具排序，
    // 最多 4 张（避免过多参考图被网关拒绝、稀释锁定效果）——角色排在前，保证主角锁不会被挤掉。
    const referenceImageUrls = Array.from(
      new Set(lockElems.filter((a) => a.refImg).map((a) => a.refImg as string)),
    ).slice(0, 4);
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
        const j = (await r.json().catch(() => ({}))) as { videoUrl?: string; error?: unknown; degraded?: boolean };
        if (!r.ok || !j.videoUrl) {
          const reason = mapVideoErr(j.error, r.status);
          setShots((prev) => prev.map((s) => (s.id === id ? { ...s, status: "failed", pct: 0, failReason: reason } : s)));
          return undefined;
        }
        // 字幕/声音「脚本有就做，没有不做」：不再自动杜撰字幕，仅用脚本填写的字幕字段
        setShots((prev) => prev.map((s) => (s.id === id ? { ...s, status: "done", pct: 100, videoUrl: j.videoUrl, failReason: undefined } : s)));
        if (j.degraded) toast("本镜因输入图片被判敏感，已自动去掉部分图片生成——可能失去与上一镜的衔接/参考一致", "warn");
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
    await runShot(id, chainFrame);
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
              <span className="st-proj-meta">
                {active.name} · {shots.length} 镜 / {totalDur}s · {settings.模型 ?? "Seedance 2.0 Fast"}
              </span>
              <span className="st-progress">
                第 {activeIdx + 1}/{studioSteps.length} 步 · {doneShots.length}/{shots.length} 镜已生成
              </span>
            </div>
            <div className="st-right">
              <button className="st-edit-btn" onClick={() => setEditProjOpen(true)} title="编辑项目视频预设">
                <Icon name="gear" size={15} /> 编辑项目
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
                  aiExpandShot={aiExpandShot}
                  aiBusyId={aiBusyId}
                  totalSec={totalSec}
                  targetShots={targetShots}
                  setShotCount={setShotCount}
                  setTotal={setTotal}
                  genMode={genMode}
                  setGenMode={setGenMode}
                  settings={settings}
                  setSettings={setSettings}
                  assets={assets}
                  setAssets={setAssets}
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
                  onSetTransition={(id, t) => editShot(id, { transition: t })}
                  onPlayClip={setPlayingClip}
                />
              )}
            </main>
          </div>
        </div>
      </div>
      {playingClip && (
        <ClipPlayerModal
          shot={playingClip}
          ratio={ratio}
          caption={settings.字幕 !== "隐藏" ? playingClip.caption : ""}
          cache={cachedVideos}
          onClose={() => setPlayingClip(null)}
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

function ClipPlayerModal({ shot, ratio, caption, cache, onClose }: { shot: Shot; ratio: string; caption?: string; cache?: Record<string, string>; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  // 舞台宽高比：先用项目设定比例占位，视频元数据就绪后改用真实视频比例，避免黑边留白
  const [stageRatio, setStageRatio] = useState(ratioToCss(ratio));
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!mounted || !shot.videoUrl) return null;
  return createPortal(
    <div className="clipm-mask" onClick={onClose}>
      <div className="clipm-panel" onClick={(e) => e.stopPropagation()}>
        <div className="clipm-head">
          <span className="clipm-title">分镜视频</span>
          <button className="clipm-close" aria-label="关闭" onClick={onClose}>
            <Icon name="close" size={20} />
          </button>
        </div>
        <div className="clipm-stage" style={{ aspectRatio: stageRatio }}>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            className="clipm-video"
            src={playableVideoSrc(shot.videoUrl, cache)}
            controls
            autoPlay
            playsInline
            onLoadedMetadata={(e) => {
              const v = e.target as HTMLVideoElement;
              if (v.videoWidth && v.videoHeight) setStageRatio(`${v.videoWidth} / ${v.videoHeight}`);
            }}
          />
          {caption && <span className="clipm-caption">{caption}</span>}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ① 剧本编辑：左「AI 帮写剧本」对话 + 右剧本文本编辑区。生成 / 编辑的剧本存入 script，
// 「下一步」按剧本自动拆分镜（rebuildShots）。镜头数 / 总时长 / 生成模式移到「③ 分镜脚本」设定。
const SCRIPT_STAGES: { k: "idea" | "summary" | "shots"; n: string }[] = [
  { k: "idea", n: "原始创意" },
  { k: "summary", n: "镜头摘要" },
  { k: "shots", n: "完整镜头" },
];

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
  rebuildShots: () => void;
  setSettings: (f: (s: Record<string, string>) => Record<string, string>) => void;
  toast: (s: string, k?: "warn") => void;
  goStep: (k: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<"idea" | "summary" | "shots">(script.trim() || summary.trim() ? "shots" : idea.trim() ? "summary" : "idea");

  // 通用：调 /api/generate 流式生成，逐块写入目标（setTarget）
  async function streamGen(scene: string, inputText: string, setTarget: (s: string) => void) {
    if (busy) return;
    if (!inputText.trim()) return toast("内容为空，无法生成", "warn");
    setBusy(true);
    setTarget("");
    let acc = "";
    try {
      const resp = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene, input: inputText, styleHint }),
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
            const j = JSON.parse(line.slice(5).trim()) as { text?: string; error?: string };
            if (j.text) { acc += j.text; setTarget(acc); }
            if (j.error) toast(j.error, "warn");
          } catch {
            /* 跳过 */
          }
        }
      }
    } catch {
      toast("生成中断，请重试", "warn");
    } finally {
      setBusy(false);
    }
  }

  function goNextStage() {
    if (stage === "idea") {
      if (!idea.trim()) return toast("请先生成或填写原始创意", "warn");
      setStage("summary");
    } else if (stage === "summary") {
      if (!summary.trim()) return toast("请先生成或填写镜头摘要", "warn");
      setStage("shots");
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

  const curVal = stage === "idea" ? idea : stage === "summary" ? summary : script;
  const setCur = stage === "idea" ? setIdea : stage === "summary" ? setSummary : setScript;
  const curTitle = stage === "idea" ? "原始创意" : stage === "summary" ? "镜头摘要" : "完整镜头";

  // 上传剧本：解析 txt/docx（pdf/doc 会给出转换提示）→ 填入当前阶段编辑框
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [parsing, setParsing] = useState(false);
  async function onUploadScript(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = ""; // 允许重复选同一文件
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) return toast("文件不能超过 10MB", "warn");
    if (curVal.trim() && !(await appConfirm(`用上传内容覆盖当前${curTitle}？`))) return;
    setParsing(true);
    try {
      const { text, note } = await parseScriptFile(f);
      if (!text.trim()) return toast("未从文件中解析到文字内容", "warn");
      setCur(text);
      toast(note ? `已导入「${f.name}」（${note}）` : `已导入「${f.name}」`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "解析失败，请重试", "warn");
    } finally {
      setParsing(false);
    }
  }

  return (
    <div className="stage-panel">
      <div className="sp-title">① 脚本编辑</div>
      <div className="sp-sub">三步生成：由需求生成「原始创意」→ 确认后生成「镜头摘要」→ 再确认后生成「完整镜头」。每一步都可编辑，完成后「下一步」按镜头拆分。</div>
      <div className="script-steps">
        {SCRIPT_STAGES.map((s, i) => (
          <button key={s.k} type="button" className={`script-step ${stage === s.k ? "on" : ""}`} onClick={() => setStage(s.k)}>
            <span className="script-step-no">{i + 1}</span> {s.n}
          </button>
        ))}
      </div>
      <div className="script-layout">
        <div className="script-chat">
          {stage === "idea" && (
            <>
              <div className="script-chat-hd"><Icon name="sparkle" size={15} /> 第一步 · 原始创意</div>
              <div className="script-chat-tip">告诉我：类型 + 故事，AI 先给出世界观 / 主角 / 故事梗概</div>
              <textarea className="script-ask" value={input} placeholder="例如：做一条安吉白茶的温馨文旅短片，突出高山云雾茶园和采茶姑娘…" onChange={(e) => setInput(e.target.value)} />
              <button className="btn btn-primary btn-sm script-gen" disabled={busy} onClick={() => streamGen("studio-idea", input, setIdea)}>
                <Icon name={busy ? "refresh" : "sparkle"} size={14} className={busy ? "ico-spin" : undefined} /> {busy ? "生成中…" : "生成原始创意"}
              </button>
            </>
          )}
          {stage === "summary" && (
            <>
              <div className="script-chat-hd"><Icon name="sparkle" size={15} /> 第二步 · 镜头摘要</div>
              <div className="script-chat-tip">基于原始创意，生成逐镜头一句话要点</div>
              <div className="script-ref">{idea || "（还没有原始创意，请回第一步生成）"}</div>
              <button className="btn btn-primary btn-sm script-gen" disabled={busy || !idea.trim()} onClick={() => streamGen("studio-summary", idea, setSummary)}>
                <Icon name={busy ? "refresh" : "sparkle"} size={14} className={busy ? "ico-spin" : undefined} /> {busy ? "生成中…" : "生成镜头摘要"}
              </button>
            </>
          )}
          {stage === "shots" && (
            <>
              <div className="script-chat-hd"><Icon name="sparkle" size={15} /> 第三步 · 完整镜头</div>
              <div className="script-chat-tip">基于镜头摘要，把每个镜头扩写成完整内容</div>
              <div className="script-ref">{summary || "（还没有镜头摘要，请回第二步生成）"}</div>
              <button className="btn btn-primary btn-sm script-gen" disabled={busy || !summary.trim()} onClick={() => streamGen("studio-shots", summary, setScript)}>
                <Icon name={busy ? "refresh" : "sparkle"} size={14} className={busy ? "ico-spin" : undefined} /> {busy ? "生成中…" : "生成完整镜头"}
              </button>
            </>
          )}
        </div>
        <div className="script-editor">
          <div className="script-editor-hd">
            <span>{curTitle}</span>
            <div className="script-editor-tools">
              {stage !== "idea" && <button className="btn btn-ghost btn-sm" onClick={() => setStage(stage === "shots" ? "summary" : "idea")}>← 上一步</button>}
              <button
                className="btn btn-ghost btn-sm"
                title="上传剧本导入（支持 txt / docx；pdf、doc 请先转成 txt 或 docx）"
                disabled={parsing}
                onClick={() => fileRef.current?.click()}
              >
                <Icon name={parsing ? "refresh" : "upload"} size={13} className={parsing ? "ico-spin" : undefined} /> {parsing ? "解析中…" : "上传剧本"}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".txt,.md,.csv,.docx,.doc,.pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                hidden
                onChange={onUploadScript}
              />
              <button className="btn btn-ghost btn-sm" title="复制" onClick={() => { navigator.clipboard?.writeText(curVal); toast("已复制"); }}>复制</button>
              <button className="btn btn-ghost btn-sm" title="清空" onClick={async () => { if (curVal && !(await appConfirm(`清空当前${curTitle}？`))) return; setCur(""); }}>清空</button>
            </div>
          </div>
          <textarea
            className="script-body"
            value={curVal}
            placeholder={`${curTitle}会显示在这里，可直接编辑`}
            onChange={(e) => setCur(e.target.value)}
          />
        </div>
      </div>
      <div className="sp-actions">
        {stage === "shots" ? (
          <button className="btn btn-primary btn-sm" onClick={finish}>下一步 · 场景角色道具 →</button>
        ) : (
          <button className="btn btn-primary btn-sm" onClick={goNextStage}>{stage === "idea" ? "确认创意，去镜头摘要 →" : "确认摘要，去完整镜头 →"}</button>
        )}
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
  aiExpandShot: (id: string) => void;
  aiBusyId: string | null;
  totalSec: number;
  targetShots: number;
  setShotCount: (n: number) => void;
  setTotal: (sec: number) => void;
  genMode: GenMode;
  setGenMode: (m: GenMode) => void;
  settings: Record<string, string>;
  setSettings: (f: (s: Record<string, string>) => Record<string, string>) => void;
  assets: Asset[];
  setAssets: (f: (a: Asset[]) => Asset[]) => void;
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
  const [exportMenu, setExportMenu] = useState(false); // 「导出到本地」下拉菜单
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
                      {/* 悬停遮罩 + 下载按钮 */}
                      <div className="clip-hover">
                        <button className="clip-hover-btn" onClick={() => props.onPlayClip(s)}>▶ 播放</button>
                        <button className="clip-hover-btn" onClick={() => downloadVideo(s.videoUrl!, `镜头${i + 1}.mp4`)}>⬇ 下载</button>
                      </div>
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
                      className="btn btn-ghost btn-sm clip-del"
                      title={s.locked ? "已锁定，先解锁再删除" : "删除本镜"}
                      disabled={s.locked}
                      onClick={() => props.removeShot(s.id)}
                      aria-label="删除本镜"
                    >
                      <Icon name="trash" size={12} />
                    </button>
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
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={!canGen}
                      title={canGen ? undefined : "请先按顺序生成前面的镜头"}
                      onClick={() => props.genShot(s.id)}
                    >
                      <Icon name="refresh" size={12} /> {s.status === "done" ? "重新生成" : s.status === "failed" ? "重试" : "生成"}
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
      </div>
      <FilmPlayer
        shots={ready}
        ratio={props.ratio}
        cache={props.cache}
        showCaption={props.settings.字幕 !== "隐藏"}
        onToggleCaption={() => props.setSettings((s) => ({ ...s, 字幕: s.字幕 === "隐藏" ? "显示" : "隐藏" }))}
        subtitles={props.subtitles}
        seekTarget={props.seekTarget}
        onTime={props.onPreviewTime}
      />

      <div className="sp-actions">
        <div className="sp-export">
          <button className="btn btn-primary btn-sm" disabled={props.exporting} onClick={() => setExportMenu((v) => !v)}>
            {props.exporting ? `导出中 ${props.exportPct}%` : "导出到本地 ▾"}
          </button>
          {exportMenu && !props.exporting && (
            <>
              <div className="sp-export-mask" onClick={() => setExportMenu(false)} />
              <div className="sp-export-menu sp-export-menu2">
                <button className="sp-export-item" onClick={() => { setExportMenu(false); props.exportFilm({ subtitles: true, audio: true }); }}>
                  <Icon name="video" size={16} />
                  <span className="sp-export-it"><b>导出成片</b><small>合成为一段视频（含字幕/声音）并下载</small></span>
                </button>
                <button className="sp-export-item" onClick={() => { setExportMenu(false); props.exportDraft(); }}>
                  <Icon name="film" size={16} />
                  <span className="sp-export-it"><b>导出剪映素材包</b><small>全部片段 + 字幕(.srt)，拖入剪映二次剪辑</small></span>
                </button>
                <button className="sp-export-item" onClick={() => { setExportMenu(false); props.exportClips(); }}>
                  <Icon name="upload" size={16} />
                  <span className="sp-export-it"><b>重新导出素材</b><small>把全部分镜片段逐个下载到本地</small></span>
                </button>
                <div className="sp-export-sep" />
                <button className="sp-export-item sp-export-item-sm" onClick={() => { setExportMenu(false); props.exportSubtitles(); }}>
                  <Icon name="outline" size={15} />
                  <span className="sp-export-it"><b>只导出字幕（.srt）</b></span>
                </button>
              </div>
            </>
          )}
        </div>
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
}: {
  shots: Shot[];
  ratio: string;
  cache?: Record<string, string>; // 已缓存到本地的视频：原始 URL → blobURL
  showCaption?: boolean;
  onToggleCaption?: () => void; // 字幕开关（控制条按钮）：切换预览画面字幕叠加
  subtitles?: Subtitle[]; // 时间轴多段字幕：按当前整片时间匹配显示
  seekTarget?: { t: number; n: number };
  onTime?: (sec: number) => void;
}) {
  const n = Math.max(1, shots.length);
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

  // 播放/暂停/静音作用于当前 active 视频；另一 slot 保持暂停但（preload=auto）预加载下一镜
  useEffect(() => {
    const va = vRefs[active].current;
    const vb = vRefs[1 - active].current;
    if (vb) vb.pause();
    if (!va) return;
    va.muted = muted;
    if (playing) va.play().catch(() => setPlaying(false));
    else va.pause();
  }, [active, idx, playing, muted]);

  const fmt = (s: number) => `00:${String(Math.floor(s)).padStart(2, "0")}`;

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
        v.muted = muted;
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
    } else {
      goToShot(ci, offset);
    }
  }

  return (
    <div className="film-player">
      <div className="film-stage" style={{ aspectRatio: ratioToCss(ratio) }}>
        {[0, 1].map((slot) => (
          <video
            // eslint-disable-next-line jsx-a11y/media-has-caption
            key={slot}
            ref={vRefs[slot]}
            className="film-video"
            style={{ opacity: active === slot ? 1 : 0 }}
            src={playableVideoSrc(shots[slotShot[slot]]?.videoUrl, cache)}
            muted={muted}
            playsInline
            preload="auto"
            onTimeUpdate={(e) => {
              if (slot === active && !seekingRef.current) setSegT((e.target as HTMLVideoElement).currentTime);
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
      </div>
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
const ASSET_KINDS_ALL: Array<Asset["kind"]> = ["场景", "角色", "道具"];

// 按元素类型定制生图提示词后缀：场景只出环境（无人物）、角色出三视图、道具出单个静物
function assetKindPrompt(kind: Asset["kind"]): string {
  if (kind === "场景") return "场景环境概念图，宽幅取景，画面中不要出现人物，写实、氛围统一、高清";
  if (kind === "角色") return "角色三视图设定图，同一角色的正面、侧面、背面三个视角并排全身，纯白色背景，无场景干扰，高清";
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
  toast: (s: string, k?: "warn") => void;
  goStep: (k: string) => void;
  openLibraryPicker: (filter: "image" | "video", onPick: (item: AssetCard) => void) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [autoBusy, setAutoBusy] = useState(false);
  const [setOpen, setSetOpen] = useState(false);
  const [filter, setFilter] = useState<"全部" | Asset["kind"]>("全部"); // 按类型筛选元素卡片
  const [genImgBusy, setGenImgBusy] = useState(false); // 一键生成全部图片
  const [genImgProg, setGenImgProg] = useState({ done: 0, total: 0 });

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
      (obj.scenes || []).forEach((n) => n && items.push({ kind: "场景", name: String(n) }));
      (obj.characters || []).forEach((n) => n && items.push({ kind: "角色", name: String(n) }));
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

  // 一键生成全部图片：对每个「还没有参考图」的元素，先按剧本+类型优化描述，再据描述 AI 生成参考图并回填
  async function genAllImages() {
    if (genImgBusy) return;
    if (!assets.length) return toast("还没有元素，请先「自动添加」或手动添加", "warn");
    const targets = assets.filter((a) => !a.refImg);
    if (!targets.length) return toast("所有元素都已有参考图（如需重做，点各卡片的「AI 生成」）", "warn");
    // 首次点击：直接打开「生成设置」让用户先确认生图模型 / 清晰度（只拦一次；关闭后再点即开始生成）
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
    if (!(await appConfirm(`将为 ${targets.length} 个元素依次「优化描述 + AI 生成参考图」，耗时较久，是否继续？`))) return;
    setGenImgBusy(true);
    setGenImgProg({ done: 0, total: targets.length });
    const styleSuffix = stylePrompt?.trim() ? `，整体画面风格：${stylePrompt.trim()}` : "";
    // 「生成设置」里选的生图模型（空 = 自动匹配，跟随平台默认）
    const genModelName = genSettings[ASSET_GEN_MODEL_KEY]?.model ?? STUDIO_IMAGE_MODELS[0].name;
    const genModelId = STUDIO_IMAGE_MODELS.find((m) => m.name === genModelName)?.modelId || "";
    let ok = 0;
    for (let i = 0; i < targets.length; i++) {
      const a = targets[i];
      try {
        // 1) 优化描述：结合剧本 + 类型指令，把元素名扩写成适合出图的画面描述
        let desc = a.name;
        const expandInput = `【剧本背景】\n${script?.trim() || "（无）"}\n\n【${a.kind}】${a.name}\n\n请据剧本背景，${assetExpandInstr(a.kind)}，输出一段话，风格与剧本统一。`;
        const er = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scene: "studio-asset-desc", input: expandInput, styleHint: stylePrompt }),
        });
        if (er.ok && er.body) {
          const reader = er.body.getReader();
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
          if (acc.trim()) desc = acc.trim();
        }
        // 2) 据优化后的描述生成图片（类型定制提示词 + 项目风格），回填为该元素参考图
        const size = ASSET_SIZE_MAP[genSettings[a.kind]?.size ?? "2K"] || "2048x2048";
        const ir = await fetch("/api/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: `${desc}，${assetKindPrompt(a.kind)}${styleSuffix}`, n: 1, size, ...(genModelId ? { model: genModelId } : {}) }),
        });
        const j = (await ir.json().catch(() => ({}))) as { images?: string[]; error?: string };
        if (ir.ok && j.images?.length) {
          const url = j.images[0];
          setAssets((list) => list.map((x) => (x.id === a.id ? { ...x, refImg: url } : x)));
          ok++;
        }
      } catch {
        /* 单个失败跳过，继续下一个 */
      }
      setGenImgProg({ done: i + 1, total: targets.length });
    }
    setGenImgBusy(false);
    toast(ok ? `已为 ${ok}/${targets.length} 个元素生成参考图` : "生成失败，请重试（检查图片模型配置）", ok ? undefined : "warn");
  }

  const empty = assets.length === 0;
  return (
    <div className="stage-panel">
      <div className="sp-title">② 场景角色道具</div>
      <div className="sp-sub">手动添加或自动读剧本生成场景 / 角色 / 道具，给参考图（本地上传 · 仓库选图 · AI 生成）。在「分镜脚本」为每镜勾选出镜元素，生成时注入参考图保持一致。</div>
      <div className="assets-toolbar">
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
        <button className="btn btn-soft btn-sm" disabled={autoBusy} onClick={autoGen} title="读取①脚本内容，自动添加场景/角色/道具（只加元素，不生图）">
          <Icon name={autoBusy ? "refresh" : "sparkle"} size={14} className={autoBusy ? "ico-spin" : undefined} /> {autoBusy ? "添加中…" : "自动添加"}
        </button>
        <button className="btn btn-primary btn-sm" disabled={genImgBusy || autoBusy || empty} onClick={genAllImages} title="对所有还没有参考图的元素，先优化描述再 AI 生成参考图">
          <Icon name={genImgBusy ? "refresh" : "sparkle"} size={14} className={genImgBusy ? "ico-spin" : undefined} /> {genImgBusy ? `生成中 ${genImgProg.done}/${genImgProg.total}…` : "一键生成全部图片"}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setSetOpen(true)} title="生成设置">
          <Icon name="gear" size={14} />
        </button>
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
      const base = { n: 1, size: ASSET_SIZE_MAP[size] || "2048x2048", ...(modelId ? { model: modelId } : {}) };
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
  onSetTransition,
  onPlayClip,
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
  onSetTransition: (shotId: string, t: TransType) => void; // 设置进入某镜的转场
  onPlayClip: (shot: Shot) => void; // 点击（非拖拽）镜头块 → 弹出大号分镜视频预览
}) {
  const total = totalDur || 1;
  const [pps, setPps] = useState(92); // 每秒像素（放大缩小改这个）
  const [editingSub, setEditingSub] = useState<string | null>(null); // 正在编辑文字的字幕 id（双击进入）
  const [transFor, setTransFor] = useState<string | null>(null); // 打开转场选择的镜头 id（该镜与上一镜之间）
  const contentW = Math.max(total * pps, 320);
  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const scrubbing = useRef(false);
  const pan = useRef<{ x: number; left: number; clipId: string | null } | null>(null);
  // 字幕块拖动：mode=move 整体平移改起始 / l 拖左缘改起始+时长 / r 拖右缘改时长
  const subDrag = useRef<{ id: string; mode: "move" | "l" | "r"; grab: number; origStart: number; origEnd: number } | null>(null);

  // 打开时默认「铺满」：按容器宽度自适应，让整段时长（用户生成多少秒）一屏展示完（之后可手动放大缩小）。
  // 挂载首帧容器宽度可能还没算出，用 rAF 等布局完成再量；量到有效宽度即设定并停止。
  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    let done = false;
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => fit()) : null;
    const fit = () => {
      if (done) return;
      const avail = sc.clientWidth - 32; // 减去左右内边距
      if (avail > 40) {
        setPps(Math.max(24, Math.min(480, avail / total)));
        done = true; // 铺满一次后停止（保留用户之后手动放大缩小）
        ro?.disconnect();
      }
    };
    ro?.observe(sc);
    fit(); // 立即量一次（若已就绪）
    return () => ro?.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  const fmt = (s: number) => `00:${String(Math.max(0, Math.floor(s))).padStart(2, "0")}`;
  const before = (i: number) => shots.slice(0, i).reduce((a, x) => a + x.dur, 0);

  // 刻度：次刻度每 0.5s，主刻度每 2s（带时间标签）
  const ticks: number[] = [];
  for (let s = 0; s <= Math.ceil(total) + 0.001; s += 0.5) ticks.push(Math.round(s * 10) / 10);
  const labels: number[] = [];
  for (let s = 0; s <= Math.ceil(total); s += 2) labels.push(s);

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
    if ((e.target as HTMLElement).closest(".tl2-sub, .tl2-subin, .tl2-ruler, .tl2-playhead, .tl2-zoom, .tl2-trans")) return;
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
  const zoom = (f: number) => setPps((p) => Math.max(24, Math.min(480, Math.round(p * f))));

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
      {/* 放大 / 缩小（剪映式） */}
      <div className="tl2-zoom">
        <button onClick={() => zoom(1 / 1.4)} title="缩小" aria-label="缩小">－</button>
        <button onClick={() => zoom(1.4)} title="放大" aria-label="放大">＋</button>
      </div>
      <div className="tl2-scroll" ref={scrollRef} onPointerDown={panDown} onPointerMove={panMove} onPointerUp={panUp}>
        <div className="tl2-inner" ref={innerRef} style={{ width: contentW }}>
          {/* 刻度尺 */}
          <div className="tl2-ruler" onPointerDown={scrubDown} onPointerMove={scrubMove} onPointerUp={scrubUp}>
            {ticks.map((s) => (
              <span key={s} className={`tl2-tick ${s % 2 === 0 ? "maj" : ""}`} style={{ left: s * pps }} />
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
            {/* 镜头之间的转场点：第 2 镜起，在两镜衔接处放一个小圆点，点开选转场类型（默认无） */}
            {shots.slice(1).map((s, k) => {
              const i = k + 1;
              const cur = s.transition ?? "none";
              return (
                <div key={`tr-${s.id}`} className="tl2-trans" style={{ left: before(i) * pps }}>
                  <button
                    className={`tl2-trans-dot${cur !== "none" ? " on" : ""}`}
                    title={cur === "none" ? "添加转场" : `转场：${TRANS_LABEL[cur]}`}
                    onClick={(e) => { e.stopPropagation(); setTransFor(transFor === s.id ? null : s.id); }}
                  >
                    {cur === "none" ? "+" : "⇄"}
                  </button>
                  {transFor === s.id && (
                    <>
                      <div className="tl2-trans-mask" onClick={() => setTransFor(null)} />
                      <div className="tl2-trans-menu">
                        {(["none", "black", "white"] as TransType[]).map((t) => (
                          <button
                            key={t}
                            className={cur === t ? "on" : ""}
                            onClick={() => { onSetTransition(s.id, t); setTransFor(null); }}
                          >
                            {TRANS_LABEL[t]}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
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
