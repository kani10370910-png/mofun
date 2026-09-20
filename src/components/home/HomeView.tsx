"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/AuthContext";
import { useTakeCharge } from "@/lib/chargeGenerate";
import { PointsCost } from "@/components/ui/PointsCost";
import { avatarSecondsPoints, multiImagePoints, videoSecondsPoints } from "@/lib/pointCosts";
import { SiteBeian } from "@/components/shell/SiteBeian";
import { intents } from "@/data/home";
import { asset } from "@/lib/asset";
import {
  emptyAgentState,
  getSkill,
  type AgentAction,
  type AgentProposal,
  type AgentRuntimeState,
  type AskGroupItem,
} from "@/lib/agent";
import {
  createSessionLog,
  isDetailedBrief,
  isVagueBrandCategory,
  runHarnessTurn,
  loadPublicHarness,
  matchedSkill,
  buildSkillBrief,
  skillGenParams,
  formatSkillGeneratePrompt,
  applySkillPicksToSlots,
  extractUserFacingSpeech,
  extractOptimizedPrompt,
  reduceSandboxTrace,
  freezeSandboxTrace,
  sanitizeAskGroup,
  askIntentValue,
  type HarnessIntent,
  type SandboxTraceItem,
  type SkillBrief,
  type SkillGenParams,
} from "@/lib/harness";
import { SandboxTrace } from "@/components/home/SandboxTrace";
import { GeneratingSlot, genSlotAspect } from "@/components/ui/GeneratingSlot";
import { ResultPane, mediaFromUrls, isVideoSrc, type ResultMedia } from "@/components/home/ResultPane";
import { useLibrary } from "@/lib/store";
import { LibraryPickerModal, type LibraryPickItem } from "@/components/image/LibraryPickerModal";
import { nowStamp } from "@/lib/datetime";
import { describeRefImages } from "@/lib/agent/refVision";
import {
  resetBrandMemory,
  bindBrandMemorySession,
  readBrandMemory,
  type BrandMemory,
} from "@/lib/agent/memory";
import {
  HOME_CHAT_EVENT,
  HOME_CHAT_EXIT_EVENT,
  HOME_SEASON_EVENT,
  type HomeSeason,
  readHomeSeason,
} from "@/lib/homeSeason";
import { hydrateCanonicalHistory } from "@/lib/agentChats";

type ChatRole = "user" | "assistant";
type ChatMsg = {
  id: string;
  role: ChatRole;
  text: string;
  tipLabel?: string;
  thinking?: string;
  summaryLines?: string[];
  askGroups?: AskGroupItem[];
  intentPicks?: Record<string, string>;
  options?: AgentAction[];
  actions?: AgentAction[];
  proposals?: AgentProposal[];
  images?: string[];
  /** 本轮出图画幅，如 "16 / 9"；展示时按此比例，不强制 1:1 */
  imageAspect?: string;
  sandboxTrace?: SandboxTraceItem[];
  skillBrief?: SkillBrief;
  skillParams?: {
    brief: SkillBrief;
    params: SkillGenParams;
    extra: string;
    round: number;
  };
};

function slotSeconds(v?: string, fallback = 0): number {
  const n = Number(String(v || "").replace(/[^0-9.]/g, ""));
  return n > 0 ? n : fallback;
}

function slotCount(v?: string, fallback = 1): number {
  const n = Number(String(v || "").replace(/\D/g, ""));
  return n > 0 ? n : fallback;
}

/** 发送将出图 / 出视频时的算力；文案 / 闲聊为 0（不展示） */
function composerMediaPoints(opts: {
  specialistId?: string;
  skillName?: string;
  slots: Record<string, string>;
  input: string;
}): number {
  const sid = String(opts.specialistId || "");
  const hit = matchedSkill(opts.input);
  const spec = sid || hit?.id || "";
  const bag = `${opts.skillName || ""} ${hit?.name || ""} ${opts.input} ${spec}`;
  const video = spec.startsWith("video.") || /一句话|大片|成片|短视频|数字人/.test(bag);
  const image =
    spec.startsWith("image.") || /海报|logo|ip|吉祥物|店招|商拍|艺术字|出图|活动物料|表情包/.test(bag);
  if (!video && !image) return 0;
  const count = slotCount(opts.slots.count, spec === "image.ip" ? 2 : 1);
  const model = opts.slots.model;
  if (spec.includes("avatar") || /数字人/.test(bag)) {
    return avatarSecondsPoints(slotSeconds(opts.slots.duration, 8));
  }
  if (video) {
    return videoSecondsPoints(slotSeconds(opts.slots.duration || opts.slots.dur, 5), {
      model,
      quality: opts.slots.quality || opts.slots.resolution,
      count,
      withAudio: opts.slots.audio !== "关" && opts.slots.audio !== "无声",
    });
  }
  return multiImagePoints(count, model);
}

function skillParamCardPoints(card: { brief: SkillBrief; params: SkillGenParams }, agent: AgentRuntimeState) {
  return composerMediaPoints({
    specialistId: agent.specialistId,
    skillName: agent.harnessSkillName,
    slots: {
      ...(card.brief.picks || {}),
      model: card.params.model,
      ratio: card.params.ratio,
      count: card.params.count,
      duration: card.brief.picks?.duration,
      audio: card.brief.picks?.audio,
    },
    input: "",
  });
}

type ChatSession = {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMsg[];
  agentState?: AgentRuntimeState;
  /** 本对话专属品牌记忆，与其它对话隔离 */
  brandMemory?: BrandMemory | null;
  /** 用户手动重命名的标题 */
  customTitle?: string;
};

const CHAT_HISTORY_KEY = "mofun_home_chat_history_v2";
const CHAT_HISTORY_LEGACY_KEY = "mofun_home_chat_history_v1";

function readStoredHistory(key: string): ChatSession[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatSession[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readChatHistory(): ChatSession[] {
  return readStoredHistory(CHAT_HISTORY_KEY);
}

function readLegacyChatHistory(): ChatSession[] {
  return readStoredHistory(CHAT_HISTORY_LEGACY_KEY);
}

function writeChatHistory(list: ChatSession[]) {
  try {
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(list.slice(0, 30)));
  } catch {
    /* ignore quota */
  }
}

function sessionTitle(msgs: ChatMsg[]) {
  const first = msgs.find((m) => m.role === "user");
  const t = (first?.text || "新对话").trim();
  return t.length > 24 ? `${t.slice(0, 24)}…` : t;
}

const BUBBLE_FULL = "我是「小墨」，想好今天设计什么了吗！";
const DELIVER_COPY = "出来了！点击图片可查看大图；确认后可继续延展或微调。";

const HERO_VIDEOS: Partial<Record<HomeSeason, string>> = {
  spring: "/home/hero-spring.mp4",
  summer: "/home/hero-summer.mp4",
  autumn: "/home/hero-autumn.mp4",
  winter: "/home/hero-winter.mp4",
};

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isEnterKey(e: { key: string; code?: string }) {
  return e.key === "Enter" || e.code === "Enter" || e.code === "NumpadEnter";
}

/** 仅用 keyCode 229 判断输入法处理中；不要用 isComposing，中文输入结束后它会卡住导致 Enter 发不出去 */
function isSendEnter(e: { key: string; code?: string; shiftKey: boolean; altKey: boolean; repeat?: boolean; keyCode?: number }) {
  if (!isEnterKey(e) || e.shiftKey || e.altKey || e.repeat) return false;
  if (e.keyCode === 229 || e.key === "Process") return false;
  return true;
}

/** 对外展示文案：去掉意图识别等内部元信息，并清掉行首缩进 */
function displayAssistantText(text: string) {
  const prepared = text
    .split("\n")
    .map((line) => line.replace(/^[ \t\u3000]+/, "").replace(/[ \t\u3000]+$/, ""))
    .filter((line) => !/识别意图\s*→/.test(line) && !/^收到[，,].*设计。?$/.test(line.trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const facing = extractUserFacingSpeech(prepared);
  if (facing) return facing;
  if (/好的，已收到你的信息/.test(prepared)) {
    return "好的，已收到你的信息。即将按以下内容生成：";
  }
  return extractOptimizedPrompt(prepared, "");
}

export function HomeView({ variant = "home" }: { variant?: "home" | "agent" }) {
  const toast = useToast();
  const { economyRev, openLogin } = useAuth();
  const takeCharge = useTakeCharge();
  void economyRev;
  const { addMaterial } = useLibrary();
  const isAgentWorkspace = variant === "agent";

  const [heroIntents, setHeroIntents] = useState<typeof intents>([]);
  const [input, setInput] = useState("");
  const [attached, setAttached] = useState<string[]>([]);
  const [refImages, setRefImages] = useState<string[]>([]);
  const [bubbleText, setBubbleText] = useState("");
  const [season, setSeason] = useState<HomeSeason>("summer");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const messagesRef = useRef<ChatMsg[]>([]);
  messagesRef.current = messages;
  const [chatMode, setChatMode] = useState(isAgentWorkspace);
  const inChat = isAgentWorkspace || chatMode;
  const [chatInput, setChatInput] = useState("");
  const [replying, setReplying] = useState(false);
  const [agentState, setAgentState] = useState<AgentRuntimeState>(() => emptyAgentState());
  const [sessionId, setSessionId] = useState(() => {
    const id = uid();
    resetBrandMemory(id);
    return id;
  });
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;
  const [historyList, setHistoryList] = useState<ChatSession[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sessionMenuId, setSessionMenuId] = useState<string | null>(null);
  const sessionMoreBtnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [sessionMenuBox, setSessionMenuBox] = useState<{ top: number; left: number } | null>(null);
  const [historyBatchMode, setHistoryBatchMode] = useState(false);
  const [historySelected, setHistorySelected] = useState<Set<string>>(() => new Set());
  const [renameTarget, setRenameTarget] = useState<ChatSession | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [msgFeedback, setMsgFeedback] = useState<Record<string, "up" | "down">>({});
  const [moreOpenId, setMoreOpenId] = useState<string | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [libOpen, setLibOpen] = useState(false);
  const [resultItems, setResultItems] = useState<ResultMedia[]>([]);
  const [resultIndex, setResultIndex] = useState(0);
  const [askDrafts, setAskDrafts] = useState<Record<string, string>>({});
  /** 双问卡片本地暂存：两项都选齐后再一次发送 */
  const [askPicks, setAskPicks] = useState<Record<string, string>>({});
  const [quizStep, setQuizStep] = useState(0);
  const [quizPicks, setQuizPicks] = useState<Record<string, string>>({});
  const [quizEditingCustom, setQuizEditingCustom] = useState<string | null>(null);
  const paramAskRoundRef = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const chatFileRef = useRef<HTMLInputElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const heroInputRef = useRef<HTMLTextAreaElement>(null);
  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});
  const lastSendAtRef = useRef(0);
  const [busyHint, setBusyHint] = useState("正在回复…");
  const [genPreview, setGenPreview] = useState<{ count: number; aspect: string } | null>(null);
  const [sandboxTrace, setSandboxTrace] = useState<SandboxTraceItem[]>([]);
  const sandboxTraceRef = useRef<SandboxTraceItem[]>([]);
  const turnSeqRef = useRef(0);
  const agentStateRef = useRef(agentState);
  agentStateRef.current = agentState;
  const sessionLogRef = useRef(createSessionLog());

  useEffect(() => {
    if (!moreOpenId) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.(".hc-tool-more-wrap")) return;
      setMoreOpenId(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [moreOpenId]);

  useEffect(() => {
    if (!sessionMenuId) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.(".hc-session-more-wrap") || t?.closest?.(".hc-session-menu")) return;
      setSessionMenuId(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [sessionMenuId]);

  useLayoutEffect(() => {
    if (!sessionMenuId) {
      setSessionMenuBox(null);
      return;
    }
    const place = () => {
      const btn = sessionMoreBtnRefs.current[sessionMenuId];
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const menuW = 160;
      const menuH = 156;
      const pad = 8;
      let top = r.bottom + 4;
      if (top + menuH > window.innerHeight - pad) {
        top = Math.max(pad, r.top - menuH - 4);
      }
      let left = r.right - menuW;
      if (left < pad) left = pad;
      if (left + menuW > window.innerWidth - pad) left = window.innerWidth - menuW - pad;
      setSessionMenuBox({ top, left });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [sessionMenuId]);

  useEffect(() => {
    if (!renameTarget) return;
    const t = window.setTimeout(() => {
      const el = renameInputRef.current;
      if (!el) return;
      el.focus();
      el.select();
    }, 30);
    return () => window.clearTimeout(t);
  }, [renameTarget]);

  useEffect(() => {
    if (!previewSrc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewSrc(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [previewSrc]);

  function assistantMediaUrls(msgs: ChatMsg[] = messagesRef.current) {
    return msgs.flatMap((m) => (m.role === "assistant" && m.images ? m.images : []));
  }

  function openResult(urls: string[], focusSrc?: string) {
    const items = mediaFromUrls(urls);
    if (!items.length) return;
    const idx = focusSrc ? items.findIndex((x) => x.src === focusSrc) : items.length - 1;
    setResultItems(items);
    setResultIndex(idx >= 0 ? idx : 0);
  }

  function openResultFromChat(urls: string[], clicked: string) {
    const all = [...assistantMediaUrls(), ...urls];
    openResult(all.length ? all : urls, clicked);
  }

  function closeResult() {
    setResultItems([]);
    setResultIndex(0);
  }

  function addResultToChat() {
    const cur = resultItems[resultIndex];
    if (!cur) return;
    if (cur.kind === "video") {
      toast("视频请下载后从附件上传", "info");
      return;
    }
    setRefImages((prev) => (prev.includes(cur.src) ? prev : [...prev, cur.src]));
    toast("已加入对话，可继续描述后发送");
  }

  function saveResultMaterial() {
    const cur = resultItems[resultIndex];
    if (!cur) return;
    const name = sessionTitle(messagesRef.current);
    const saved = addMaterial({
      emoji: "",
      grad: "thumb-grad-1",
      kind: "素材",
      name: `${name.slice(0, 16) || "小墨生成"}`,
      sub: cur.kind === "video" ? "首页 · 视频" : "首页 · 图片",
      img: cur.kind === "image" ? cur.src : undefined,
      videoUrl: cur.kind === "video" ? cur.src : undefined,
      module: "home",
      time: nowStamp(),
    });
    toast(saved.ok ? "已另存为「仓库 · 我的素材」" : "本地空间不足，存入失败", saved.ok ? undefined : "warn");
  }

  function downloadResult() {
    const cur = resultItems[resultIndex];
    if (!cur) return;
    const filename = `mofun-${Date.now()}`;
    const href =
      cur.src.startsWith("data:") || cur.src.startsWith("blob:")
        ? cur.src
        : `/api/download?url=${encodeURIComponent(cur.src)}&name=${encodeURIComponent(filename)}`;
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast("已开始下载");
  }

  useEffect(() => {
    void loadPublicHarness(true).then((cfg) => {
      if (cfg.ok) {
        setHeroIntents(
          (cfg.intents || []).map((it: HarnessIntent) => ({
            text: it.text,
            view: (it.view || "image") as (typeof intents)[number]["view"],
            sub: it.sub,
          })),
        );
      } else {
        setHeroIntents(intents);
      }
    });
  }, []);

  const lastAsk = [...messages].reverse().find((m) => m.askGroups && m.askGroups.length > 0);
  const lastAskId = lastAsk?.id;
  useEffect(() => {
    const filled = Object.fromEntries(
      (lastAsk?.askGroups || []).filter((g) => (g.filled || "").trim()).map((g) => [g.key, g.filled || ""]),
    );
    setQuizStep(0);
    setQuizPicks({ ...filled, ...(lastAsk?.intentPicks || {}) });
    setAskDrafts({});
    setQuizEditingCustom(null);
    paramAskRoundRef.current = 0;
  }, [lastAskId]);

  useEffect(() => {
    setSeason(readHomeSeason());
    const onSeason = (e: Event) => {
      const next = (e as CustomEvent<HomeSeason>).detail;
      if (next) setSeason(next);
    };
    window.addEventListener(HOME_SEASON_EVENT, onSeason);
    return () => window.removeEventListener(HOME_SEASON_EVENT, onSeason);
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent(HOME_CHAT_EVENT, { detail: inChat }));
    return () => {
      window.dispatchEvent(new CustomEvent(HOME_CHAT_EVENT, { detail: false }));
    };
  }, [inChat]);

  useEffect(() => {
    if (inChat) return;
    const chars = Array.from(BUBBLE_FULL);
    let i = 0;
    let pause = 0;
    setBubbleText("");
    const timer = window.setInterval(() => {
      if (i >= chars.length) {
        pause += 1;
        if (pause < 18) return;
        i = 0;
        pause = 0;
        setBubbleText("");
        return;
      }
      i += 1;
      setBubbleText(chars.slice(0, i).join(""));
    }, 90);
    return () => window.clearInterval(timer);
  }, [inChat]);

  useEffect(() => {
    if (!inChat) return;
    setHistoryList(readChatHistory());
  }, [inChat, sessionId, messages.length]);

  useEffect(() => {
    if (!inChat) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, inChat, replying]);

  function persistSession(msgs: ChatMsg[], id: string, state?: AgentRuntimeState) {
    if (msgs.length === 0) return;
    const raw = state ?? agentStateRef.current;
    const { refImages: _drop, ...rest } = raw;
    const existing = readChatHistory().find((s) => s.id === id);
    const autoTitle = sessionTitle(msgs);
    const next: ChatSession = {
      id,
      title: existing?.customTitle ?? autoTitle,
      customTitle: existing?.customTitle,
      updatedAt: Date.now(),
      messages: msgs,
      agentState: rest,
      brandMemory: readBrandMemory(),
    };
    const list = readChatHistory().filter((s) => s.id !== id);
    writeChatHistory([next, ...list]);
  }

  function exitHistoryBatch() {
    setHistoryBatchMode(false);
    setHistorySelected(new Set());
  }

  function toggleHistorySelect(id: string) {
    setHistorySelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleHistorySelectAll() {
    if (historySelected.size >= historyList.length) {
      setHistorySelected(new Set());
      return;
    }
    setHistorySelected(new Set(historyList.map((s) => s.id)));
  }

  function deleteHistorySessions(ids: Set<string>) {
    if (!ids.size) {
      toast("请先选择对话", "warn");
      return;
    }
    const deletingCurrent = ids.has(sessionId);
    if (!deletingCurrent && messages.length > 0) {
      persistSession(messages, sessionId);
    }
    const list = readChatHistory().filter((s) => !ids.has(s.id));
    writeChatHistory(list);
    setHistoryList(list);
    exitHistoryBatch();
    setSessionMenuId(null);
    if (deletingCurrent) {
      if (list.length > 0) {
        const s = list[0];
        setSessionId(s.id);
        bindBrandMemorySession(s.id, s.brandMemory ?? null);
        setMessages(s.messages);
        setAgentState(s.agentState ?? emptyAgentState());
        setChatInput("");
        setReplying(false);
        setAskDrafts({});
        setAskPicks({});
      } else {
        setMessages([]);
        setChatInput("");
        setReplying(false);
        setAskDrafts({});
        setAskPicks({});
        setAgentState(emptyAgentState());
        setRefImages([]);
        const nextId = uid();
        resetBrandMemory(nextId);
        setSessionId(nextId);
      }
    }
    toast(`已删除 ${ids.size} 条对话`);
  }

  function openRenameSession(s: ChatSession) {
    setSessionMenuId(null);
    setRenameTarget(s);
    setRenameDraft(s.title);
  }

  function confirmRenameSession() {
    if (!renameTarget) return;
    const title = renameDraft.trim();
    if (!title) {
      toast("请输入对话名称", "warn");
      return;
    }
    const list = readChatHistory().map((s) =>
      s.id === renameTarget.id
        ? { ...s, title, customTitle: title, updatedAt: Date.now() }
        : s,
    );
    writeChatHistory(list);
    setHistoryList(list);
    setRenameTarget(null);
    toast("已重命名");
  }

  function enterHistoryBatch(fromId?: string) {
    setSessionMenuId(null);
    setHistoryBatchMode(true);
    setHistorySelected(fromId ? new Set([fromId]) : new Set());
  }

  const historyAllSelected = historyList.length > 0 && historySelected.size >= historyList.length;
  const historyPartialSelected = historySelected.size > 0 && !historyAllSelected;

  function exitToHome(showToast = false) {
    if (isAgentWorkspace) {
      startNewChat();
      return;
    }
    if (messages.length > 0) persistSession(messages, sessionId);
    setMessages([]);
    setChatInput("");
    setInput("");
    setReplying(false);
    setAskDrafts({});
    setAskPicks({});
    setAgentState(emptyAgentState());
    setRefImages([]);
    paramAskRoundRef.current = 0;
    closeResult();
    const nextId = uid();
    resetBrandMemory(nextId);
    setSessionId(nextId);
    sessionLogRef.current = createSessionLog();
    setChatMode(false);
    window.dispatchEvent(new CustomEvent(HOME_CHAT_EVENT, { detail: false }));
    if (showToast) toast("已新建对话");
  }

  function startNewChat() {
    if (messages.length > 0) persistSession(messages, sessionId);
    setMessages([]);
    setChatInput("");
    setInput("");
    setReplying(false);
    setAskDrafts({});
    setAskPicks({});
    setAgentState(emptyAgentState());
    setRefImages([]);
    paramAskRoundRef.current = 0;
    closeResult();
    const nextId = uid();
    resetBrandMemory(nextId);
    setSessionId(nextId);
    sessionLogRef.current = createSessionLog();
    setChatMode(true);
    setHistoryList(readChatHistory());
    window.dispatchEvent(new CustomEvent(HOME_CHAT_EVENT, { detail: true }));
    toast("已新建对话");
  }

  const exitToHomeRef = useRef(exitToHome);
  exitToHomeRef.current = exitToHome;

  useEffect(() => {
    const onExit = () => {
      if (isAgentWorkspace) return;
      exitToHomeRef.current(false);
    };
    window.addEventListener(HOME_CHAT_EXIT_EVENT, onExit);
    return () => window.removeEventListener(HOME_CHAT_EXIT_EVENT, onExit);
  }, [isAgentWorkspace]);

  function loadSession(s: ChatSession) {
    if (s.id === sessionId) return;
    if (messages.length > 0) persistSession(messages, sessionId);
    setSessionId(s.id);
    bindBrandMemorySession(s.id, s.brandMemory ?? null);
    setMessages(s.messages);
    setAgentState(s.agentState ?? emptyAgentState());
    setChatInput("");
    setReplying(false);
    setAskDrafts({});
    setAskPicks({});
    sessionLogRef.current = createSessionLog();
    setChatMode(true);
    paramAskRoundRef.current = 0;
    const urls = (s.messages || []).flatMap((m) => (m.role === "assistant" && m.images ? m.images : []));
    if (urls.length) openResult(urls, urls[urls.length - 1]);
    else closeResult();
    window.dispatchEvent(new CustomEvent(HOME_CHAT_EVENT, { detail: true }));
  }

  const restoredRef = useRef(false);
  useEffect(() => {
    if (!isAgentWorkspace || restoredRef.current) return;
    let cancelled = false;
    void hydrateCanonicalHistory<ChatSession>({
      readLocal: readChatHistory,
      readLegacy: readLegacyChatHistory,
      writeLocal: writeChatHistory,
    }).then((list) => {
      if (cancelled) return;
      restoredRef.current = true;
      setHistoryList(list);
      const last = list[0];
      if (last?.messages?.length) loadSession(last);
      else window.dispatchEvent(new CustomEvent(HOME_CHAT_EVENT, { detail: true }));
    });
    return () => {
      cancelled = true;
    };
  }, [isAgentWorkspace]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyHandlerRef.current(e);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("keyup", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("keyup", onKey, true);
    };
  }, []);

  useEffect(() => {
    if (!inChat) return;
    const id = window.setTimeout(() => chatInputRef.current?.focus(), 50);
    return () => window.clearTimeout(id);
  }, [inChat]);

  useEffect(() => {
    return () => {
      if (messagesRef.current.length > 0) {
        persistSession(messagesRef.current, sessionIdRef.current);
      }
    };
  }, []);

  function applyHarnessTurn(userText: string, forceGenerate: boolean, opts?: { omitUserMessage?: boolean; displayText?: string; ignoreBusy?: boolean; actionKind?: string; skillId?: string; preview?: { count: number; aspect: string } }) {
    if (replying && !opts?.ignoreBusy) return;
    const t = userText.trim();
    const refsSnapshot = [...refImages];
    if (!t && refsSnapshot.length === 0) {
      toast("请先描述需求或上传参考图", "warn");
      return;
    }
    if (!chatMode) {
      setChatMode(true);
      window.dispatchEvent(new CustomEvent(HOME_CHAT_EVENT, { detail: true }));
    }

    const displayText = opts?.displayText || t || (refsSnapshot.length ? "（已附参考图）" : "");
    if (!opts?.omitUserMessage) {
      const userMsg: ChatMsg = {
        id: uid(),
        role: "user",
        text: displayText,
        images: refsSnapshot.length ? refsSnapshot : undefined,
      };
      setMessages((prev) => {
        const next = [...prev, userMsg];
        persistSession(next, sessionId);
        return next;
      });
    }
    setInput("");
    setChatInput("");
    setRefImages([]);
    const quizDone = /请按以下信息生成/.test(t);
    const retrying =
      forceGenerate &&
      (/^(确认|再试一次|直接生成)$/.test(t) ||
        Boolean(agentStateRef.current.specialistId || agentStateRef.current.lastGenerateText));
    const startingSkillAsk =
      !retrying &&
      !quizDone &&
      !isVagueBrandCategory(t) &&
      agentStateRef.current.harnessSkillStage !== "discover" &&
      Boolean(matchedSkill(t));
    const interviewAnswered =
      quizDone ||
      (agentStateRef.current.harnessSkillStage === "discover" &&
        t.trim().length >= 6 &&
        !matchedSkill(t));
    const videoSkill = String(agentStateRef.current.specialistId || opts?.skillId || "").startsWith("video.");
    const textSkill = Boolean(opts?.skillId && getSkill(opts.skillId)?.output === "text") && !videoSkill;
    const willGen =
      forceGenerate &&
      !startingSkillAsk &&
      (retrying ||
        agentStateRef.current.phase === "delivered" ||
        agentStateRef.current.phase === "ready" ||
        interviewAnswered ||
        isDetailedBrief(t, refsSnapshot.length > 0));
    setBusyHint(willGen ? (textSkill ? "正在撰写…" : videoSkill ? "正在生成视频…" : "正在生成…") : "正在回复…");
    if (willGen && !textSkill) {
      const slots = agentStateRef.current.slots || {};
      const n = Number(String(slots.count || "").replace(/\D/g, "") || 0);
      const video = String(agentStateRef.current.specialistId || "").startsWith("video.");
      setGenPreview(
        opts?.preview ?? {
          count: Math.min(4, Math.max(1, n || 1)),
          aspect: genSlotAspect(String(slots.ratio || slots.canvasSize || (video ? "16:9" : "1:1"))),
        },
      );
    } else {
      setGenPreview(null);
    }
    setReplying(true);
    const seq = ++turnSeqRef.current;
    sandboxTraceRef.current = [];
    setSandboxTrace([]);
    const unsubTrace = sessionLogRef.current.subscribe((ev) => {
      if (seq !== turnSeqRef.current) return;
      const next = reduceSandboxTrace(sandboxTraceRef.current, ev);
      sandboxTraceRef.current = next;
      setSandboxTrace(next);
    });

    void (async () => {
      try {
        let visionNotes = "";
        if (refsSnapshot.length) {
          visionNotes = await describeRefImages(refsSnapshot);
        }
        if (seq !== turnSeqRef.current) return;
        const baseState: AgentRuntimeState = {
          ...agentStateRef.current,
          ...(refsSnapshot.length
            ? {
                refImages: refsSnapshot,
                refVisionNotes: visionNotes || agentStateRef.current.refVisionNotes,
                slots: {
                  ...agentStateRef.current.slots,
                  ...(visionNotes ? { referenceDesc: visionNotes } : {}),
                },
              }
            : {}),
        };
        const result = await runHarnessTurn({
          text: t || "请参考我上传的图片生成",
          state: baseState,
          session: sessionLogRef.current,
          refImages: refsSnapshot,
          forceGenerate,
          visionNotes,
          actionKind: opts?.actionKind,
          skillId: opts?.skillId,
        });
        if (seq !== turnSeqRef.current) return;
        setAgentState(result.state);
        agentStateRef.current = result.state;
        const slots = result.state.slots || {};
        const video = String(result.state.specialistId || "").startsWith("video.");
        const images = (result.images || []).filter(Boolean);
        const facing = displayAssistantText(result.text);
        const assistantMsg: ChatMsg = {
          id: uid(),
          role: "assistant",
          text: images.length
            ? facing || DELIVER_COPY
            : facing || (result.askGroups?.length ? "" : "我在，想做什么直接说。"),
          images: images.length ? images : undefined,
          imageAspect: images.length
            ? genSlotAspect(String(slots.ratio || (video ? "16:9" : "1:1")))
            : undefined,
          actions: result.actions,
          proposals: result.proposals,
          askGroups: result.askGroups,
          intentPicks: result.intentPicks,
          sandboxTrace: freezeSandboxTrace(
            sandboxTraceRef.current,
            images.some((src) => isVideoSrc(src)) || (video && images.length)
              ? "video"
              : images.length
                ? "image"
                : "text",
          ),
        };
        setMessages((prev) => {
          const next = assistantMsg.skillParams
            ? [...prev.filter((m) => !m.skillParams), assistantMsg]
            : [...prev, assistantMsg];
          persistSession(next, sessionId, result.state);
          return next;
        });
        if (result.askGroups?.length) {
          setQuizStep(0);
          setQuizPicks({});
          setQuizEditingCustom(null);
        }
        if (result.error) toast(result.error, "warn");
        else if (images.length) {
          openResult([...assistantMediaUrls(), ...images], images[0]);
          toast("已生成并存入仓库");
        }
      } catch (err) {
        if (seq !== turnSeqRef.current) return;
        const text = err instanceof Error ? err.message : "回复失败，请再试一次。";
        setMessages((prev) => {
          const next = [
            ...prev,
            { id: uid(), role: "assistant" as const, text: `刚才没回复成功：${text}` },
          ];
          persistSession(next, sessionId);
          return next;
        });
        toast(text, "warn");
      } finally {
        unsubTrace();
        if (seq === turnSeqRef.current) {
          setReplying(false);
          setGenPreview(null);
          setSandboxTrace([]);
          sandboxTraceRef.current = [];
        }
      }
    })();
  }

  function stopTurn() {
    if (!replying) return;
    turnSeqRef.current += 1;
    setReplying(false);
    setGenPreview(null);
    setSandboxTrace([]);
    sandboxTraceRef.current = [];
    toast("已停止生成");
  }

  function applyTurn(userText: string, action?: AgentAction) {
    const force =
      action?.kind === "generate" ||
      action?.kind === "confirm_plan" ||
      action?.kind === "propose" ||
      action?.kind === "extend_vi";
    applyHarnessTurn(userText.trim() || action?.label || "", Boolean(force), {
      actionKind: action?.kind,
      skillId: action?.skillId,
    });
  }

  function submitTurn(raw?: string) {
    if (replying) return;
    const typed = (raw ?? (inChat ? chatInput : input)).trim();
    const lastUser = [...messages].reverse().find((m) => m.role === "user")?.text?.trim() || "";
    const t = typed || lastUser;
    if (!t && refImages.length === 0) {
      toast("请先描述需求或上传参考图", "warn");
      return;
    }
    const lastAsst = [...messages].reverse().find((m) => m.role === "assistant");
    const suggest = lastAsst?.actions?.find((a) => (a.label || "").trim() === typed);
    if (typed && suggest && suggest.id === "skill-confirm-start") {
      setChatInput("");
      setInput("");
      runSuggestAction(suggest);
      return;
    }
    if (typed && suggest && isComposerSuggest(suggest)) {
      const userMsg: ChatMsg = { id: uid(), role: "user", text: typed };
      setMessages((prev) => {
        const next = [...prev, userMsg];
        persistSession(next, sessionId);
        return next;
      });
      setChatInput("");
      setInput("");
      runSuggestAction(suggest);
      return;
    }
    applyHarnessTurn(t, true);
  }

  function fillComposer(text: string) {
    const t = (text || "").trim();
    if (!t) return;
    if (inChat) {
      setChatInput(t);
      window.setTimeout(() => {
        const el = chatInputRef.current;
        if (!el) return;
        el.focus();
        const n = t.length;
        el.setSelectionRange(n, n);
      }, 0);
    } else {
      setInput(t);
    }
  }

  function isComposerSuggest(action: AgentAction) {
    return action.id === "skill-adjust" || action.id === "skill-restart";
  }

  function isSelfWriteOption(action: AgentAction): boolean {
    return (
      action.kind === "option" &&
      !!action.slotKey &&
      (action.value === "我自己写" ||
        action.value === "我来补充" ||
        action.value === "我来描述" ||
        action.value === "自定义")
    );
  }

  function focusAskInput(slotKey: string) {
    setAskDrafts((prev) => ({ ...prev, [slotKey]: prev[slotKey] || "" }));
    window.setTimeout(() => {
      const el = document.querySelector<HTMLInputElement>(
        `input.hc-quiz-inline[data-slot="${slotKey}"]`,
      );
      el?.focus();
    }, 30);
    toast("请在卡片输入框填写后回车", "info");
  }

  /** 双问：两项都齐后合并发送；单问仍立即发送 */
  function onAskChip(action: AgentAction, groups: AskGroupItem[]) {
    if (replying) return;
    if (isSelfWriteOption(action) && action.slotKey) {
      focusAskInput(action.slotKey);
      return;
    }
    if (!action.slotKey || action.value == null || action.value === "") {
      onChip(action);
      return;
    }

    const needKeys = groups.filter((q) => !q.filled).map((q) => q.key);
    if (needKeys.length <= 1) {
      onChip(action);
      return;
    }

    const nextPicks = { ...askPicks, [action.slotKey]: action.value };
    setAskPicks(nextPicks);

    const allDone = needKeys.every((k) => !!nextPicks[k]?.trim());
    if (!allDone) {
      toast("已选一项，请继续完成另一项后再发送", "info");
      return;
    }

    const ordered = needKeys.map((k) => nextPicks[k]).filter(Boolean);
    setAskPicks({});
    setAskDrafts({});
    applyTurn(ordered.join("，"));
  }

  function onAskCustomSubmit(slotKey: string, value: string, groups: AskGroupItem[]) {
    const v = value.trim();
    if (!v || replying) return;
    setAskDrafts((prev) => {
      const next = { ...prev };
      delete next[slotKey];
      return next;
    });
    if (groups.length >= 2) {
      setQuizPicks((prev) => ({ ...prev, [slotKey]: v }));
      setQuizEditingCustom(null);
      return;
    }

    const needKeys = groups.filter((q) => !q.filled).map((q) => q.key);
    if (needKeys.length >= 2) {
      // 一句里用分隔符答两项 → 直接发送
      if (/[,，、]/.test(v)) {
        setAskPicks({});
        applyTurn(v);
        return;
      }
      const nextPicks = { ...askPicks, [slotKey]: v };
      setAskPicks(nextPicks);
      if (needKeys.every((k) => !!nextPicks[k]?.trim())) {
        const ordered = needKeys.map((k) => nextPicks[k]).filter(Boolean);
        setAskPicks({});
        applyTurn(ordered.join("，"));
      } else {
        toast("已填一项，请继续完成另一项后再发送", "info");
      }
      return;
    }

    applyTurn(v, {
      id: `ask-in-${slotKey}`,
      label: v,
      kind: "option",
      slotKey,
      value: v,
    });
  }

  const QUIZ_LETTERS = "ABCDEFGH";

  function isCustomPick(q: AskGroupItem, value: string) {
    const v = (value || "").trim();
    if (!v) return false;
    return !(q.options || []).some((x) => !isSelfWriteOption(x) && (x.value || x.label) === v);
  }

  function stampAskFills(groups: AskGroupItem[] | undefined, picks: Record<string, string>) {
    return (groups || []).map((g) => {
      const filled = (askIntentValue(picks, g.key) || g.filled || "").trim();
      return filled ? { ...g, filled } : g;
    });
  }

  function persistAskFills(picks: Record<string, string>) {
    const nextState: AgentRuntimeState = {
      ...agentStateRef.current,
      slots: applySkillPicksToSlots(agentStateRef.current.slots || {}, picks),
    };
    agentStateRef.current = nextState;
    setAgentState(nextState);
    setMessages((prev) => {
      let idx = -1;
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].askGroups?.length) {
          idx = i;
          break;
        }
      }
      if (idx < 0) return prev;
      const next = prev.slice();
      next[idx] = { ...next[idx], askGroups: stampAskFills(next[idx].askGroups, picks) };
      persistSession(next, sessionId, nextState);
      return next;
    });
  }

  function renderAskQuiz(groupsIn: AskGroupItem[], interactive: boolean) {
    const groups = groupsIn.filter((g) => g.key !== "count").map(sanitizeAskGroup);
    if (!groups.length) return null;
    const answered = groups
      .map((q) => ({
        key: q.key,
        label: q.label,
        value: (q.filled || askIntentValue(quizPicks, q.key) || "").trim(),
      }))
      .filter((q) => q.value);
    if (!interactive && answered.length > 0) {
      return (
        <div className="hc-quiz hc-quiz--done">
          <div className="hc-quiz-head">
            <span className="hc-quiz-title">已填写</span>
          </div>
          {answered.map((q) => (
            <div key={q.key} className="hc-quiz-done-row">
              <span className="hc-quiz-done-k">{q.label}</span>
              <span className="hc-quiz-done-v">{q.value}</span>
            </div>
          ))}
        </div>
      );
    }
    const step = Math.min(quizStep, groups.length - 1);
    const viewGroups = interactive ? [groups[step]] : groups;
    return (
      <div className={`hc-quiz${interactive ? " hc-quiz--overlay" : ""}`}>
        {viewGroups.map((q, qi) => {
          const picked = (interactive ? quizPicks[q.key] : q.filled) || q.filled || quizPicks[q.key] || "";
          const pickedList = picked.split(/[、，,]/).map((s) => s.trim()).filter(Boolean);
          const showPager = interactive && qi === 0;
          return (
            <div key={q.key} className={interactive ? undefined : "hc-quiz-block"}>
              <div className="hc-quiz-head">
                <span className="hc-quiz-title">{q.label}</span>
                {showPager ? (
                  <span className="hc-quiz-pager">
                    <button
                      type="button"
                      className="hc-quiz-nav"
                      disabled={replying || step <= 0}
                      onClick={() => setQuizStep((s) => Math.max(0, s - 1))}
                    >
                      ‹
                    </button>
                    {step + 1}/{groups.length}
                    <button
                      type="button"
                      className="hc-quiz-nav"
                      disabled={replying || step >= groups.length - 1}
                      onClick={() => setQuizStep((s) => Math.min(groups.length - 1, s + 1))}
                    >
                      ›
                    </button>
                  </span>
                ) : null}
              </div>
              <div className="hc-quiz-q">{q.ask}</div>
              {q.options && q.options.length > 0 && (
                <div className="hc-quiz-opts">
                  {q.options.map((o, oi) => {
                    const custom = isSelfWriteOption(o);
                    const letter = QUIZ_LETTERS[oi] || String(oi + 1);
                    const customSelected = isCustomPick(q, picked);
                    const selected = custom
                      ? customSelected || (interactive && quizEditingCustom === q.key)
                      : q.multi
                        ? pickedList.includes(o.value || o.label)
                        : picked === (o.value || o.label);
                    const editing = custom && interactive && quizEditingCustom === q.key;
                    return custom ? (
                      <div
                        key={`${q.key}-${o.id}-${oi}`}
                        className={`hc-quiz-opt${selected ? " on" : ""}`}
                        role="button"
                        tabIndex={interactive ? 0 : -1}
                        onClick={() => {
                          if (!interactive || replying) return;
                          onQuizOption(o, q);
                        }}
                      >
                        <span className="hc-quiz-letter">{letter}</span>
                        {editing ? (
                          <input
                            type="text"
                            className="hc-quiz-inline"
                            data-slot={q.key}
                            disabled={replying}
                            placeholder="输入自定义回答…"
                            value={askDrafts[q.key] || ""}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) =>
                              setAskDrafts((prev) => ({ ...prev, [q.key]: e.target.value }))
                            }
                            onKeyDown={(e) => {
                              if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                              e.preventDefault();
                              onAskCustomSubmit(q.key, askDrafts[q.key] || "", groups);
                            }}
                          />
                        ) : (
                          <span className="hc-quiz-opt-label">
                            {customSelected ? picked : o.label}
                          </span>
                        )}
                      </div>
                    ) : (
                      <button
                        key={`${q.key}-${o.id}-${oi}`}
                        type="button"
                        className={`hc-quiz-opt${selected ? " on" : ""}`}
                        disabled={!interactive || replying}
                        onClick={() => onQuizOption(o, q)}
                      >
                        <span className="hc-quiz-letter">{letter}</span>
                        <span className="hc-quiz-opt-label">{o.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {interactive && (
          <div className="hc-quiz-foot">
            <button
              type="button"
              className="hc-quiz-skip"
              disabled={replying}
              onClick={() => onQuizSkip(groups)}
            >
              跳过
            </button>
            <button
              type="button"
              className="hc-quiz-next"
              disabled={replying}
              title={step >= groups.length - 1 ? "确认 (Enter)" : "下一个 (Enter)"}
              onClick={() => onQuizNext(groups)}
            >
              {step >= groups.length - 1 ? "确认" : "下一个"}
            </button>
          </div>
        )}
      </div>
    );
  }

  async function finishSkillQuiz(groups: AskGroupItem[], picks = quizPicks) {
    if (groups.length === 1 && groups[0].key === "task") {
      const task = (picks.task || "").trim();
      if (!task || task === "你来定") {
        toast("请先选要做什么，或自己填", "info");
        return;
      }
      persistAskFills(picks);
      applyHarnessTurn(task, false);
      return;
    }
    setReplying(true);
    setQuizEditingCustom(null);
    persistAskFills(picks);
    const st = agentStateRef.current;
    const intent = [...messagesRef.current].reverse().find((m) => m.intentPicks)?.intentPicks || {};
    const nextPicks = { ...st.slots, ...intent, ...picks };
    const nextState: AgentRuntimeState = {
      ...st,
      slots: applySkillPicksToSlots(st.slots || {}, nextPicks),
      lastGenerateText: (nextPicks.creativeDesc || nextPicks.oneLiner || "").trim() || st.lastGenerateText,
    };
    agentStateRef.current = nextState;
    setAgentState(nextState);
    const brief = buildSkillBrief(groups, nextPicks, st.harnessSkillName || "");
    const descShown = nextPicks.creativeDesc || nextPicks.brandDesc;
    if (descShown) {
      const idx = brief.lines.findIndex((l) => /创意描述|画面描述|品牌描述|成片描述|一句话/.test(l.label));
      if (idx >= 0) brief.lines[idx] = { ...brief.lines[idx], value: descShown };
      else brief.lines.push({ label: "创意描述", value: descShown });
    }
    setReplying(false);
    openSkillParamCard(brief);
  }

  function openSkillParamCard(brief: SkillBrief) {
    setReplying(false);
    const params = skillGenParams(brief.picks, brief.skillName);
    const lines = [...brief.lines];
    if (params.resolution && !lines.some((l) => /分辨率|画质/.test(l.label))) {
      lines.push({ label: "分辨率", value: params.resolution });
    }
    const card = {
      brief: { ...brief, lines },
      params,
      extra: "",
      round: paramAskRoundRef.current + 1,
    };
    const assistantMsg: ChatMsg = {
      id: uid(),
      role: "assistant",
      text: "",
      skillParams: card,
    };
    setMessages((prev) => {
      const next = [...prev.filter((m) => !m.skillParams), assistantMsg];
      persistSession(next, sessionId);
      return next;
    });
  }

  function confirmSkillParamCard(card = [...messagesRef.current].reverse().find((m) => m.skillParams)?.skillParams) {
    if (!card) {
      toast("没有可生成的信息，请先完成前面的选择", "warn");
      return;
    }
    const cost = skillParamCardPoints(card, agentStateRef.current);
    if (cost > 0) {
      const charged = takeCharge(cost, `${card.brief.title || "对话生成"}`);
      if (!charged.ok) {
        if (/登录/.test(charged.message)) openLogin();
        toast(charged.message, "warn");
        return;
      }
    }
    const { brief, params, extra } = card;
    const prompt = formatSkillGeneratePrompt(brief, params, extra) || "请按以下信息生成。按已确认方案出图";
    const copyLine =
      brief.lines.find((l) => /创意描述|画面描述|成片描述|一句话/.test(l.label))?.value ||
      brief.picks.creativeDesc ||
      brief.picks.oneLiner ||
      "";
    const picks = {
      ...brief.picks,
      model: params.model,
      ratio: params.ratio,
      count: params.count,
    };
    const nextState: AgentRuntimeState = {
      ...agentStateRef.current,
      slots: applySkillPicksToSlots(agentStateRef.current.slots || {}, picks),
      harnessSkillStage: "ready",
      phase: "ready",
      lastGenerateText: copyLine || prompt,
      optimizedPrompt: copyLine || agentStateRef.current.optimizedPrompt,
    };
    agentStateRef.current = nextState;
    setAgentState(nextState);
    const preview = {
      count: Math.min(4, Math.max(1, Number(params.count) || 1)),
      aspect: genSlotAspect(params.ratio),
    };
    paramAskRoundRef.current += 1;
    setMessages((prev) => {
      const next = prev.filter((m) => !m.skillParams);
      persistSession(next, sessionId, nextState);
      return next;
    });
    applyHarnessTurn(prompt, true, {
      displayText: "确认",
      ignoreBusy: true,
      preview,
      actionKind: "generate",
      skillId: agentStateRef.current.skillId || agentStateRef.current.harnessSkillCode,
    });
  }

  function rejectSkillParamCard() {
    setMessages((prev) => {
      const next = prev.filter((m) => !m.skillParams);
      persistSession(next, sessionId);
      return next;
    });
  }

  function updateSkillParamExtra(id: string, extra: string) {
    setMessages((prev) =>
      prev.map((m) => (m.id === id && m.skillParams ? { ...m, skillParams: { ...m.skillParams, extra } } : m)),
    );
  }

  function renderSkillParamCard(m: ChatMsg, interactive: boolean) {
    if (!m.skillParams) return null;
    const sid = String(agentState.specialistId || "");
    const picks = m.skillParams.brief.picks || {};
    const briefLines = (m.skillParams.brief.lines || []).filter((l) => (l.value || "").trim());
    const hasBrief = (re: RegExp) => briefLines.some((l) => re.test(l.label));
    const title = sid.startsWith("research.")
      ? "是否确认生成调研报告？"
      : sid.startsWith("content.")
        ? "是否确认生成文案？"
        : sid.startsWith("video.")
          ? "是否确认生成视频？"
          : "是否确认生成图片？";
    const extraGrid =
      sid.startsWith("content.") || sid.startsWith("research.") ? (
        <>
          {picks.length && !hasBrief(/字数|时间/) ? (
            <div>
              <div className="hc-param-k">{sid.startsWith("research.") ? "时间跨度" : "字数"}</div>
              <div className="hc-param-v">{picks.length || picks.timeScope}</div>
            </div>
          ) : picks.timeScope && !hasBrief(/时间/) ? (
            <div>
              <div className="hc-param-k">时间跨度</div>
              <div className="hc-param-v">{picks.timeScope}</div>
            </div>
          ) : null}
          {(picks.style || picks.tone) && !hasBrief(/风格|语气/) ? (
            <div>
              <div className="hc-param-k">{picks.style ? "风格" : "语气"}</div>
              <div className="hc-param-v">{picks.style || picks.tone}</div>
            </div>
          ) : null}
          {picks.platform && !hasBrief(/平台/) ? (
            <div>
              <div className="hc-param-k">平台</div>
              <div className="hc-param-v">{picks.platform}</div>
            </div>
          ) : null}
        </>
      ) : sid === "video.avatar" ? (
        <>
          {!hasBrief(/模式|模型/) ? (
            <div>
              <div className="hc-param-k">生成模式</div>
              <div className="hc-param-v">{picks.genMode || m.skillParams.params.model}</div>
            </div>
          ) : null}
          {!hasBrief(/字幕/) ? (
            <div>
              <div className="hc-param-k">字幕</div>
              <div className="hc-param-v">{picks.subtitle || "显示"}</div>
            </div>
          ) : null}
          {!hasBrief(/数量/) ? (
            <div>
              <div className="hc-param-k">数量</div>
              <div className="hc-param-v">{m.skillParams.params.count}</div>
            </div>
          ) : null}
        </>
      ) : sid.startsWith("video.") ? (
        <>
          {!hasBrief(/模型/) ? (
            <div>
              <div className="hc-param-k">模型</div>
              <div className="hc-param-v">{m.skillParams.params.model}</div>
            </div>
          ) : null}
          {!hasBrief(/尺寸|比例/) ? (
            <div>
              <div className="hc-param-k">比例</div>
              <div className="hc-param-v">{m.skillParams.params.ratio}</div>
            </div>
          ) : null}
          {picks.duration && !hasBrief(/时长/) ? (
            <div>
              <div className="hc-param-k">时长</div>
              <div className="hc-param-v">{picks.duration}</div>
            </div>
          ) : null}
          {!hasBrief(/画质|分辨率/) ? (
            <div>
              <div className="hc-param-k">画质</div>
              <div className="hc-param-v">{m.skillParams.params.resolution}</div>
            </div>
          ) : null}
        </>
      ) : (
        <>
          {!hasBrief(/模型/) ? (
            <div>
              <div className="hc-param-k">模型</div>
              <div className="hc-param-v">{m.skillParams.params.model}</div>
            </div>
          ) : null}
          {!hasBrief(/尺寸|比例/) ? (
            <div>
              <div className="hc-param-k">比例</div>
              <div className="hc-param-v">{m.skillParams.params.ratio}</div>
            </div>
          ) : null}
          {!hasBrief(/分辨率|画质/) ? (
            <div>
              <div className="hc-param-k">分辨率</div>
              <div className="hc-param-v">{m.skillParams.params.resolution}</div>
            </div>
          ) : null}
          {m.skillParams.params.count && m.skillParams.params.count !== "1" && !hasBrief(/数量/) ? (
            <div>
              <div className="hc-param-k">数量</div>
              <div className="hc-param-v">{m.skillParams.params.count}</div>
            </div>
          ) : null}
        </>
      );
    const hasExtraGrid = Boolean(
      extraGrid &&
        (Array.isArray(extraGrid.props?.children)
          ? extraGrid.props.children.some(Boolean)
          : extraGrid.props?.children),
    );
    return (
      <div className={`hc-param-card${interactive ? " hc-param-card--overlay" : ""}`}>
        <div className="hc-param-head">
          {m.skillParams.round > 1 ? (
            <span className="hc-param-step">
              {m.skillParams.round}/{m.skillParams.round}
            </span>
          ) : (
            <span />
          )}
        </div>
        <div className="hc-param-title">{title}</div>
        <div className="hc-param-subject">{m.skillParams.brief.title}</div>
        <div className="hc-param-body">
          {briefLines.length > 0 ? (
            <div className="hc-param-brief">
              {briefLines.map((line) => (
                <div key={line.label} className="hc-param-brief-row">
                  <span className="hc-param-k">{line.label}</span>
                  <span className="hc-param-v">
                    {/创意描述|画面描述|品牌描述|成片描述/.test(line.label)
                      ? extractOptimizedPrompt(line.value, line.value)
                      : extractUserFacingSpeech(line.value)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          {hasExtraGrid ? <div className="hc-param-grid">{extraGrid}</div> : null}
        </div>
        {interactive ? (
          <>
            <input
              className="hc-param-extra"
              placeholder="输入其他要求..."
              value={m.skillParams.extra}
              onChange={(e) => updateSkillParamExtra(m.id, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  confirmSkillParamCard(m.skillParams);
                }
              }}
            />
            <div className="hc-quiz-foot">
              <button type="button" className="hc-quiz-skip" onClick={() => rejectSkillParamCard()}>
                拒绝
              </button>
              <button
                type="button"
                className="hc-quiz-next hc-quiz-next--cost"
                title="确认 (Enter)"
                onClick={() => confirmSkillParamCard(m.skillParams)}
              >
                确认
                <PointsCost
                  amount={skillParamCardPoints(m.skillParams, agentState)}
                  className="hc-send-credit"
                />
              </button>
            </div>
          </>
        ) : null}
      </div>
    );
  }

  function onQuizNext(groups: AskGroupItem[]) {
    const q = groups[quizStep];
    if (!q) return;
    const typed = quizEditingCustom === q.key ? (askDrafts[q.key] || "").trim() : "";
    const cur = typed || (quizPicks[q.key] || "").trim();
    const lastStep = quizStep >= groups.length - 1;
    if (!cur) {
      toast("请先点选一项，或点「跳过」", "info");
      return;
    }
    const picks = typed ? { ...quizPicks, [q.key]: typed } : { ...quizPicks, [q.key]: cur };
    if (typed) setQuizPicks(picks);
    persistAskFills(picks);
    if (lastStep) {
      finishSkillQuiz(groups, picks);
      return;
    }
    setQuizEditingCustom(null);
    setQuizStep((s) => s + 1);
  }

  function onQuizSkip(groups: AskGroupItem[]) {
    const q = groups[quizStep];
    if (!q) return;
    if (q.required && !(quizPicks[q.key] || "").trim()) {
      toast("这项需要填写，请点选或输入", "info");
      return;
    }
    const nextPicks = { ...quizPicks, [q.key]: quizPicks[q.key] || "你来定" };
    setQuizPicks(nextPicks);
    persistAskFills(nextPicks);
    if (quizStep >= groups.length - 1) {
      finishSkillQuiz(groups, nextPicks);
      return;
    }
    setQuizEditingCustom(null);
    setQuizStep((s) => s + 1);
  }

  function onQuizOption(action: AgentAction, q: AskGroupItem) {
    if (replying) return;
    if (isSelfWriteOption(action) && q.key) {
      setQuizEditingCustom(q.key);
      setAskDrafts((prev) => ({
        ...prev,
        [q.key]: prev[q.key] || (isCustomPick(q, quizPicks[q.key]) ? quizPicks[q.key] : ""),
      }));
      window.setTimeout(() => {
        document.querySelector<HTMLInputElement>(`input.hc-quiz-inline[data-slot="${q.key}"]`)?.focus();
      }, 30);
      return;
    }
    const value = (action.value || action.label || "").trim();
    if (!value) return;
    if (q.multi) {
      const cur = (quizPicks[q.key] || "").split(/[、，,]/).map((s) => s.trim()).filter(Boolean);
      const has = cur.includes(value);
      const next = has ? cur.filter((x) => x !== value) : [...cur, value];
      const max = q.maxSelect || 3;
      if (!has && next.length > max) {
        toast(`最多选 ${max} 个`, "info");
        return;
      }
      const nextPicks = { ...quizPicks, [q.key]: next.join("、") };
      setQuizPicks(nextPicks);
      persistAskFills(nextPicks);
      return;
    }
    const nextPicks = { ...quizPicks, [q.key]: value };
    setQuizPicks(nextPicks);
    persistAskFills(nextPicks);
    setQuizEditingCustom(null);
  }

  function onChip(action: AgentAction) {
    if (replying && action.id !== "skill-confirm-start" && action.id !== "skill-param-ok") return;
    if (action.id === "skill-confirm-start") {
      runSuggestAction(action);
      return;
    }
    if (isComposerSuggest(action)) {
      fillComposer(action.label);
      return;
    }
    runSuggestAction(action);
  }

  function runSuggestAction(action: AgentAction) {
    if (replying && action.id !== "skill-confirm-start" && action.id !== "skill-param-ok") return;

    if (action.id === "skill-confirm-start") {
      const brief = [...messagesRef.current].reverse().find((m) => m.skillBrief)?.skillBrief;
      if (brief) openSkillParamCard(brief);
      else toast("没有可生成的信息，请先完成前面的选择", "warn");
      return;
    }
    if (action.id === "skill-param-ok") {
      confirmSkillParamCard();
      return;
    }
    if (action.id === "skill-param-reject") {
      rejectSkillParamCard();
      return;
    }
    if (action.id === "skill-adjust") {
      setMessages((prev) => {
        const next = prev.filter((m) => !m.skillBrief && !m.skillParams);
        persistSession(next, sessionId);
        return next;
      });
      setQuizStep(0);
      toast("请修改后再次点立即生成", "info");
      return;
    }
    if (action.id === "skill-restart") {
      paramAskRoundRef.current = 0;
      setQuizPicks({});
      setAskDrafts({});
      setQuizStep(0);
      setMessages((prev) => {
        const next = prev.filter((m) => !m.skillBrief && !m.skillParams);
        persistSession(next, sessionId);
        return next;
      });
      toast("已清空选择，请重新填写", "info");
      return;
    }

    // 「我自己写」：不推进回合，聚焦该槽输入框
    if (isSelfWriteOption(action) && action.slotKey) {
      focusAskInput(action.slotKey);
      return;
    }
    if (action.kind === "handoff") {
      toast("请在对话中继续完成创作，无需跳转");
      return;
    }
    const force =
      action.kind === "generate" ||
      action.kind === "confirm_plan" ||
      action.kind === "extend_vi" ||
      action.kind === "propose";
    const retry =
      action.id === "act-generate" ||
      action.label === "再试一次" ||
      action.label === "直接生成";
    const st = agentStateRef.current;
    const retryText = (
      st.lastGenerateText ||
      st.optimizedPrompt ||
      st.slots.creativeDesc ||
      st.slots.oneLiner ||
      ""
    ).trim();
    applyHarnessTurn(retry && retryText ? retryText : action.value || action.label, force, {
      actionKind: action.kind,
      skillId: action.skillId || st.skillId,
    });
  }

  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("read fail"));
      reader.readAsDataURL(file);
    });
  }

  async function onPickFiles(files: FileList | null) {
    if (!files?.length) return;
    const next: string[] = [];
    for (const f of Array.from(files).slice(0, 4)) {
      if (!f.type.startsWith("image/")) continue;
      try {
        next.push(await readFileAsDataUrl(f));
      } catch {
        /* skip */
      }
    }
    if (!next.length) {
      toast("请上传图片文件", "warn");
      return;
    }

    commitRefImages(next, `已添加 ${next.length} 张参考图`);
  }

  function commitRefImages(urls: string[], okText: string) {
    const incoming = urls.filter(Boolean);
    if (!incoming.length) return;
    const room = Math.max(0, 4 - refImages.length);
    if (room <= 0) {
      toast("最多添加 4 张参考图", "warn");
      return;
    }
    const extra = incoming.filter((u) => !refImages.includes(u)).slice(0, room);
    if (!extra.length) {
      toast("这些图片已在对话中", "info");
      return;
    }
    const merged = [...refImages, ...extra];
    setRefImages(merged);
    setAttached((prev) => [...prev, ...extra.map(() => "")].slice(0, 8));
    const st: AgentRuntimeState = {
      ...agentStateRef.current,
      refImages: merged,
    };
    setAgentState(st);
    agentStateRef.current = st;
    toast(incoming.length > extra.length ? `${okText}（最多 4 张，已放入 ${extra.length} 张）` : okText);
  }

  function addFromWarehouse(items: LibraryPickItem[]) {
    const urls = items.map((x) => x.img).filter(Boolean);
    const okText =
      items.length === 1 ? `已从仓库选用「${items[0].name}」` : `已从仓库添加 ${items.length} 张`;
    commitRefImages(urls, okText);
  }

  function addAttach() {
    if (inChat) chatFileRef.current?.click();
    else fileRef.current?.click();
  }

  function regenerate(msgId: string) {
    const idx = messages.findIndex((m) => m.id === msgId);
    if (idx < 0) return;
    const st = agentStateRef.current;
    const retryText = (
      st.lastGenerateText ||
      st.optimizedPrompt ||
      st.slots.creativeDesc ||
      st.slots.oneLiner ||
      ""
    ).trim();
    const prevUser = [...messages].slice(0, idx).reverse().find((m) => {
      const t = (m.text || "").trim();
      return m.role === "user" && t && !/^(确认|再试一次|直接生成)$/.test(t);
    });
    const prompt = retryText || prevUser?.text || "";
    if (!prompt) return;
    setMessages((prev) => prev.filter((m) => m.id !== msgId));
    applyHarnessTurn(prompt, true, {
      omitUserMessage: true,
      actionKind: "generate",
      skillId: st.skillId,
    });
  }

  const lastAssistantMsg = [...messages].reverse().find((m) => m.role === "assistant");
  const lastDockParam =
    !replying && lastAssistantMsg?.skillParams ? lastAssistantMsg : undefined;
  const lastDockQuiz = lastDockParam
    ? undefined
    : lastAssistantMsg?.askGroups && lastAssistantMsg.askGroups.length > 0 && !replying
      ? lastAssistantMsg
      : undefined;
  const hasDockOverlay = Boolean(lastDockParam);

  keyHandlerRef.current = (e: KeyboardEvent) => {
    if (e.repeat) return;
    if (libOpen || previewSrc) return;
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.closest(".hc-rename-panel") || t.closest(".modal-mask") || t === renameInputRef.current) return;
    if (t.closest("input.hc-quiz-inline")) return;
    const tag = (t.tagName || "").toLowerCase();
    const inComposer =
      t === chatInputRef.current ||
      t === heroInputRef.current ||
      t.classList.contains("hc-input") ||
      t.classList.contains("chat-input");
    const inParamExtra = t.classList.contains("hc-param-extra");
    const inOtherField =
      (tag === "input" || tag === "textarea" || t.isContentEditable) &&
      !inComposer &&
      !inParamExtra;
    if (inOtherField) return;

    const composerEmpty = !(inChat ? chatInput : input).trim();
    if (
      e.type === "keydown" &&
      !replying &&
      lastDockQuiz?.askGroups &&
      (!inComposer || composerEmpty) &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      e.keyCode !== 229 &&
      /^[a-h]$/i.test(e.key)
    ) {
      const groups = lastDockQuiz.askGroups.filter((g) => g.key !== "count").map(sanitizeAskGroup);
      const q = groups[Math.min(quizStep, Math.max(0, groups.length - 1))];
      const opt = q?.options?.[QUIZ_LETTERS.indexOf(e.key.toUpperCase())];
      if (opt) {
        e.preventDefault();
        e.stopPropagation();
        onQuizOption(opt, q);
      }
      return;
    }

    if (!isSendEnter(e)) return;
    if (t.closest("button.hc-quiz-skip") || t.closest("button.hc-quiz-next") || t.closest("button.hc-send")) return;

    if (!replying && lastDockParam?.skillParams) {
      e.preventDefault();
      e.stopPropagation();
      if (e.type === "keydown") confirmSkillParamCard(lastDockParam.skillParams);
      return;
    }
    if (!replying && lastDockQuiz?.askGroups) {
      e.preventDefault();
      e.stopPropagation();
      if (e.type === "keydown") {
        onQuizNext(lastDockQuiz.askGroups.filter((g) => g.key !== "count").map(sanitizeAskGroup));
      }
      return;
    }
    if (tag === "button" || t.getAttribute("role") === "button" || t.closest("button")) return;
    if (replying) return;
    const wantSend = inChat || inComposer || Boolean(input.trim() || refImages.length > 0);
    if (!wantSend) return;
    const now = Date.now();
    if (now - lastSendAtRef.current < 400) {
      e.preventDefault();
      return;
    }
    lastSendAtRef.current = now;
    e.preventDefault();
    e.stopPropagation();
    submitTurn(inChat ? chatInput : input);
  };

  if (inChat) {
    return (
      <div className="page page-home page-home-chat">
        <div className="home-chat-layout">
          <aside className={`hc-sidebar${sidebarOpen ? "" : " is-collapsed"}`}>
            {sidebarOpen ? (
              <div className={`hc-sidebar-body${historyBatchMode ? " is-batch" : ""}`}>
                {!historyBatchMode && (
                  <div className="hc-sidebar-head">
                    <h2 className="hc-sidebar-title">历史记录</h2>
                    <div className="hc-sidebar-head-actions">
                      <button
                        type="button"
                        className="hc-sidebar-head-btn hc-sidebar-head-plain"
                        aria-label="新建对话"
                        title="新建对话"
                        onClick={startNewChat}
                      >
                        <Icon name="chatNew" size={20} />
                      </button>
                      <button
                        type="button"
                        className="hc-sidebar-head-btn hc-sidebar-head-panel"
                        aria-label="收起历史记录"
                        title="收起历史记录"
                        onClick={() => setSidebarOpen(false)}
                      >
                        <Icon name="panelLeft" size={20} />
                      </button>
                    </div>
                  </div>
                )}
                <nav className="hc-sidebar-nav" aria-label="历史记录">
                  {historyList.length === 0 ? (
                    <div className="hc-sidebar-empty">暂无历史对话</div>
                  ) : (
                    <ul className="hc-sidebar-list">
                      {historyList.map((s) => {
                        const active = s.id === sessionId;
                        const checked = historySelected.has(s.id);
                        const menuOpen = sessionMenuId === s.id;
                        return (
                          <li key={s.id}>
                            <div
                              className={`hc-sidebar-row${active && !historyBatchMode ? " active" : ""}${checked ? " checked" : ""}${menuOpen ? " menu-open" : ""}`}
                            >
                              {historyBatchMode ? (
                                <button
                                  type="button"
                                  className="hc-sidebar-item hc-sidebar-item--batch"
                                  onClick={() => toggleHistorySelect(s.id)}
                                >
                                  <span className={`hc-hist-check${checked ? " on" : ""}`} aria-hidden>
                                    {checked ? <Icon name="check" size={14} /> : null}
                                  </span>
                                  <span className="hc-sidebar-item-title">{s.title}</span>
                                </button>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className="hc-sidebar-item"
                                    onClick={() => loadSession(s)}
                                  >
                                    <span className="hc-sidebar-item-title">{s.title}</span>
                                  </button>
                                  <div className="hc-session-more-wrap">
                                    <button
                                      type="button"
                                      className="hc-sidebar-more"
                                      ref={(el) => {
                                        sessionMoreBtnRefs.current[s.id] = el;
                                      }}
                                      aria-label="更多操作"
                                      aria-expanded={menuOpen}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSessionMenuId(menuOpen ? null : s.id);
                                      }}
                                    >
                                      <Icon name="dots" size={16} />
                                    </button>
                                    {menuOpen && sessionMenuBox && typeof document !== "undefined"
                                      ? createPortal(
                                          <div
                                            className="hc-session-menu"
                                            role="menu"
                                            style={{ top: sessionMenuBox.top, left: sessionMenuBox.left }}
                                          >
                                            <button
                                              type="button"
                                              role="menuitem"
                                              onClick={() => enterHistoryBatch()}
                                            >
                                              <Icon name="listCheck" size={18} />
                                              批量操作
                                            </button>
                                            <button
                                              type="button"
                                              role="menuitem"
                                              onClick={() => openRenameSession(s)}
                                            >
                                              <Icon name="edit" size={18} />
                                              重命名
                                            </button>
                                            <button
                                              type="button"
                                              role="menuitem"
                                              className="danger"
                                              onClick={() => deleteHistorySessions(new Set([s.id]))}
                                            >
                                              <Icon name="trash" size={18} />
                                              删除对话
                                            </button>
                                          </div>,
                                          document.body,
                                        )
                                      : null}
                                  </div>
                                </>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </nav>
                {historyBatchMode && historyList.length > 0 && (
                  <div className="hc-history-batch" role="toolbar" aria-label="批量操作">
                    <div className="hc-history-batch-top">
                      <button type="button" className="hc-history-batch-all" onClick={toggleHistorySelectAll}>
                        <span
                          className={`hc-hist-check hc-hist-check--all${historyAllSelected ? " on" : historyPartialSelected ? " partial" : ""}`}
                        >
                          {historyAllSelected ? (
                            <Icon name="check" size={14} />
                          ) : historyPartialSelected ? (
                            <span className="hc-hist-check-minus" />
                          ) : null}
                        </span>
                        全选
                      </button>
                      <span className="hc-history-batch-count">已选 {historySelected.size} 条</span>
                    </div>
                    <div className="hc-history-batch-actions">
                      <button type="button" className="hc-history-batch-cancel" onClick={exitHistoryBatch}>
                        取消
                      </button>
                      <button
                        type="button"
                        className="hc-history-batch-del"
                        onClick={() => deleteHistorySessions(historySelected)}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="hc-sidebar-rail">
                <button
                  type="button"
                  className="hc-sidebar-rail-btn hc-sidebar-rail-panel"
                  aria-label="展开历史记录"
                  onClick={() => setSidebarOpen(true)}
                >
                  <Icon name="panelLeft" size={20} />
                  <span className="hc-sidebar-tip">展开</span>
                </button>
                <button
                  type="button"
                  className="hc-sidebar-rail-btn hc-sidebar-rail-plain"
                  aria-label="新建对话"
                  title="新建对话"
                  onClick={startNewChat}
                >
                  <Icon name="chatNew" size={20} />
                </button>
              </div>
            )}
          </aside>

          <div className="home-chat-main">
        <div className="home-chat">
          <div className={`home-chat-list${hasDockOverlay ? " has-quiz-overlay" : ""}`} ref={listRef}>
            {messages.map((m, mi) => {
              const isLastAssistant =
                m.role === "assistant" && !messages.slice(mi + 1).some((x) => x.role === "assistant");
              if (m.role === "assistant" && m.skillParams && (replying || lastDockParam?.id === m.id)) return null;
              if (
                m.role === "assistant" &&
                !displayAssistantText(m.text) &&
                !m.images?.length &&
                !m.skillBrief &&
                !m.askGroups?.length &&
                !m.skillParams &&
                !m.proposals?.length &&
                !m.sandboxTrace?.length
              ) {
                return null;
              }
              return m.role === "user" ? (
                <div key={m.id} className="hc-row hc-user">
                  <div className="hc-body">
                    {m.images && m.images.length > 0 && (
                      <div className="hc-images hc-images-user">
                        {m.images.map((src, i) => (
                          <button
                            key={i}
                            type="button"
                            className="hc-image-link"
                            title="查看参考图"
                            aria-label={`查看参考图 ${i + 1}`}
                            onClick={() => setPreviewSrc(src)}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={src} alt={`参考图 ${i + 1}`} className="hc-image" />
                          </button>
                        ))}
                      </div>
                    )}
                    {m.text?.trim() ? <div className="hc-bubble">{m.text}</div> : null}
                  </div>
                </div>
              ) : (
                <div key={m.id} className="hc-row hc-ai">
                  <div className="hc-avatar hc-avatar-ai">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={asset("/home/xiaomo.png")} alt="" />
                  </div>
                  <div className="hc-body">
                    <div className="hc-name">
                      小墨 <span className="hc-ai-tag">AI</span>
                    </div>
                    {m.sandboxTrace && m.sandboxTrace.length > 0 ? (
                      <SandboxTrace items={m.sandboxTrace} />
                    ) : null}
                    {displayAssistantText(m.text) ? (
                      <div className="hc-bubble">{displayAssistantText(m.text)}</div>
                    ) : null}
                    {m.skillBrief && m.skillBrief.lines.length > 0 && (
                      <div className="hc-brief">
                        {m.skillBrief.lines.map((line) => (
                          <div key={line.label} className="hc-brief-row">
                            <span className="hc-brief-k">{line.label}</span>
                            <span className="hc-brief-v">
                              {/创意描述|画面描述|品牌描述|成片描述/.test(line.label)
                                ? extractOptimizedPrompt(line.value, line.value)
                                : extractUserFacingSpeech(line.value)}
                            </span>
                          </div>
                        ))}
                        <div className="hc-brief-ask">请确认这个方向，或告诉我需要调整哪些部分：</div>
                      </div>
                    )}
                    {m.askGroups && m.askGroups.length > 0
                      ? renderAskQuiz(m.askGroups, lastDockQuiz?.id === m.id && !replying)
                      : null}
                    {m.skillParams && !replying && lastDockParam?.id !== m.id
                      ? renderSkillParamCard(m, false)
                      : null}
                    {m.proposals && m.proposals.length > 0 && (
                      <div className="hc-proposals">
                        {m.proposals.map((p) => (
                          <div key={p.id} className="hc-proposal-card">
                            <div className="hc-proposal-title">{p.title}</div>
                            <div className="hc-proposal-text">{p.text}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {m.images && m.images.length > 0 && (
                      <div className={`hc-images${m.images.length > 1 ? " is-multi" : ""}`}>
                        {m.images.filter(Boolean).map((src, i) =>
                          isVideoSrc(src) ? (
                            <video
                              key={i}
                              src={src}
                              className="hc-image"
                              controls
                              playsInline
                              preload="metadata"
                              onClick={() => openResultFromChat(m.images || [], src)}
                            />
                          ) : (
                            <button
                              key={i}
                              type="button"
                              className="hc-image-link"
                              style={
                                m.images!.length === 1
                                  ? { width: "min(420px, 100%)", maxWidth: "100%" }
                                  : undefined
                              }
                              title="在右侧查看"
                              aria-label={`在右侧查看生成结果 ${i + 1}`}
                              onClick={() => openResultFromChat(m.images || [], src)}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={src} alt={`生成结果 ${i + 1}`} className="hc-image" />
                            </button>
                          ),
                        )}
                      </div>
                    )}
                    <div className="hc-msg-tools">
                      <button
                        type="button"
                        className="hc-tool-btn"
                        title="复制"
                        aria-label="复制"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(displayAssistantText(m.text));
                            toast("已复制");
                          } catch {
                            toast("复制失败", "warn");
                          }
                        }}
                      >
                        <Icon name="copy" size={16} />
                      </button>
                      <button
                        type="button"
                        className={`hc-tool-btn ${msgFeedback[m.id] === "up" ? "on" : ""}`}
                        title="点赞"
                        aria-label="点赞"
                        onClick={() => {
                          setMsgFeedback((prev) => {
                            const next = { ...prev };
                            if (next[m.id] === "up") delete next[m.id];
                            else next[m.id] = "up";
                            return next;
                          });
                          toast(msgFeedback[m.id] === "up" ? "已取消点赞" : "感谢反馈");
                        }}
                      >
                        <Icon name="thumbUp" size={16} />
                      </button>
                      <button
                        type="button"
                        className={`hc-tool-btn ${msgFeedback[m.id] === "down" ? "on" : ""}`}
                        title="点踩"
                        aria-label="点踩"
                        onClick={() => {
                          setMsgFeedback((prev) => {
                            const next = { ...prev };
                            if (next[m.id] === "down") delete next[m.id];
                            else next[m.id] = "down";
                            return next;
                          });
                          toast(msgFeedback[m.id] === "down" ? "已取消" : "已记录，我们会改进");
                        }}
                      >
                        <Icon name="thumbDown" size={16} />
                      </button>
                      <div className="hc-tool-more-wrap">
                        <button
                          type="button"
                          className={`hc-tool-btn ${moreOpenId === m.id ? "on" : ""}`}
                          title="更多"
                          aria-label="更多"
                          aria-expanded={moreOpenId === m.id}
                          onClick={() => setMoreOpenId((id) => (id === m.id ? null : m.id))}
                        >
                          <Icon name="dots" size={16} />
                        </button>
                        {moreOpenId === m.id && (
                          <div className="hc-tool-menu" role="menu">
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setMoreOpenId(null);
                                regenerate(m.id);
                              }}
                            >
                              <Icon name="refresh" size={14} /> 重新回答
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setMoreOpenId(null);
                                toast("已记录问题反馈，感谢");
                              }}
                            >
                              <Icon name="shield" size={14} /> 报告问题
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setMoreOpenId(null);
                                toast("欢迎通过反馈告诉我产品建议");
                              }}
                            >
                              产品建议
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    {isLastAssistant &&
                      !replying &&
                      (!m.askGroups || m.askGroups.length === 0) &&
                      m.options &&
                      m.options.length > 0 && (
                        <div className="hc-suggest">
                          {m.options.map((o) => (
                            <button
                              key={o.id}
                              type="button"
                              className="hc-suggest-btn"
                              disabled={replying}
                              onClick={() => onChip(o)}
                            >
                              {o.label}
                            </button>
                          ))}
                        </div>
                      )}
                    {isLastAssistant && !replying && !m.skillParams && m.actions && m.actions.length > 0 && (
                      <div className="hc-suggest">
                        {m.actions.slice(0, 3).map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            className={
                              a.kind === "propose" ||
                              a.kind === "generate" ||
                              a.kind === "confirm_plan" ||
                              a.kind === "extend_vi"
                                ? "hc-suggest-btn hc-suggest-primary"
                                : "hc-suggest-btn"
                            }
                            disabled={replying && a.id !== "skill-confirm-start" && a.id !== "skill-param-ok"}
                            onClick={() => onChip(a)}
                          >
                            {a.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {replying && (
              <div className="hc-row hc-ai">
                <div className="hc-avatar hc-avatar-ai">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={asset("/home/xiaomo.png")} alt="" />
                </div>
                <div className="hc-body">
                  <div className="hc-name">
                    小墨 <span className="hc-ai-tag">AI</span>
                  </div>
                  {sandboxTrace.length > 0 && <SandboxTrace items={sandboxTrace} live />}
                  {genPreview ? (
                    <div className={`hc-gen-slots${genPreview.count > 1 ? " is-multi" : ""}`}>
                      {Array.from({ length: genPreview.count }, (_, i) => (
                        <GeneratingSlot key={i} aspect={genPreview.aspect} framed={genPreview.count <= 1} />
                      ))}
                    </div>
                  ) : (
                    <div className="hc-bubble hc-typing">{busyHint}</div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="home-chat-dock">
            {lastDockParam ? renderSkillParamCard(lastDockParam, !replying) : null}
            <div className="home-chat-composer">
            <input
              ref={chatFileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                void onPickFiles(e.target.files);
                e.target.value = "";
              }}
            />
            {refImages.length > 0 && (
              <div className="hc-ref-row">
                {refImages.map((src, i) => (
                  <div key={i} className="hc-ref-thumb">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" />
                    <button
                      type="button"
                      className="hc-ref-del"
                      aria-label="移除"
                      onClick={() => setRefImages((prev) => prev.filter((_, j) => j !== i))}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <textarea
              ref={chatInputRef}
              className="hc-input"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (!isSendEnter(e.nativeEvent)) return;
                e.preventDefault();
                if (replying) return;
                const now = Date.now();
                if (now - lastSendAtRef.current < 400) return;
                lastSendAtRef.current = now;
                submitTurn(chatInput);
              }}
              placeholder="发一条消息，说说你想做什么"
              rows={2}
              autoFocus={isAgentWorkspace}
            />
            <div className="hc-composer-bar">
              <div className="hc-composer-left">
                <button type="button" className="hc-icon-btn" aria-label="上传附件" title="上传附件" onClick={addAttach}>
                  <Icon name="attach" size={18} />
                </button>
                <button
                  type="button"
                  className="hc-icon-btn hc-lib-btn"
                  aria-label="上传仓库"
                  title="从仓库选择图片"
                  onClick={() => setLibOpen(true)}
                >
                  <Icon name="storage" size={18} />
                  <span>上传仓库</span>
                </button>
              </div>
              <div className="hc-composer-right">
                {replying ? (
                  <button
                    type="button"
                    className="hc-send hc-send-stop"
                    aria-label="正在生成中，点击停止"
                    title="正在生成中"
                    onClick={stopTurn}
                  >
                    <span className="hc-send-stop-sq" />
                  </button>
                ) : (
                  (chatInput.trim() || refImages.length > 0) && (
                    <button
                      type="button"
                      className="hc-send"
                      aria-label="发送"
                      title="发送 (Enter)"
                      aria-keyshortcuts="Enter"
                      onClick={() => submitTurn(chatInput)}
                    >
                      <Icon name="send" size={16} />
                    </button>
                  )
                )}
              </div>
            </div>
          </div>
          </div>
        </div>
        </div>
        {resultItems.length > 0 && (
          <ResultPane
            items={resultItems}
            index={resultIndex}
            onIndex={setResultIndex}
            onClose={closeResult}
            onAddToChat={addResultToChat}
            onSaveMaterial={saveResultMaterial}
            onDownload={downloadResult}
            onPreview={setPreviewSrc}
          />
        )}
        </div>

      {libOpen && (
        <LibraryPickerModal
          multiple
          onClose={() => setLibOpen(false)}
          onPickMany={addFromWarehouse}
        />
      )}

      {previewSrc && (
        <div
          className="img-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="查看图片"
          onClick={() => setPreviewSrc(null)}
        >
          <button
            type="button"
            className="img-lightbox-x"
            aria-label="关闭"
            onClick={() => setPreviewSrc(null)}
          >
            <Icon name="close" size={18} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewSrc}
            alt="生成结果预览"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {renameTarget && (
        <div className="modal-mask" onClick={() => setRenameTarget(null)}>
          <div className="hc-rename-panel" onClick={(e) => e.stopPropagation()}>
            <div className="hc-rename-head">
              <span className="hc-rename-title">编辑对话名称</span>
              <button type="button" className="hc-rename-close" aria-label="关闭" onClick={() => setRenameTarget(null)}>
                <Icon name="close" size={20} />
              </button>
            </div>
            <input
              ref={renameInputRef}
              type="text"
              className="hc-rename-input"
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmRenameSession();
                if (e.key === "Escape") setRenameTarget(null);
              }}
            />
            <div className="hc-rename-foot">
              <button type="button" className="hc-rename-cancel" onClick={() => setRenameTarget(null)}>
                取消
              </button>
              <button type="button" className="hc-rename-ok" onClick={confirmRenameSession}>
                确认
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    );
  }

  return (
    <div className="page page-home">
      <section className={`hero hero-scenic hero-season-${season}`}>
        {HERO_VIDEOS[season] ? (
          <video
            key={season}
            className="hero-scenic-bg hero-scenic-video"
            src={asset(HERO_VIDEOS[season]!)}
            autoPlay
            muted
            loop
            playsInline
            aria-hidden
          />
        ) : (
          <div
            className="hero-scenic-bg"
            style={{ backgroundImage: `url(${asset("/home/hero-bg.png")})` }}
            aria-hidden
          />
        )}
        <div className="hero-scenic-mask" aria-hidden />
        <div className="hero-core">
          <h1 className="hero-title hero-title-cn">
            AI赋活地域文化基因
            <br />
            数智赋能农文旅未来
          </h1>

          <div className="hero-dialog">
            <div className="hero-mascot">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="hero-mascot-img" src={asset("/home/xiaomo.png")} alt="小墨" />
              <div className="hero-bubble" aria-live="polite">
                {bubbleText}
                {bubbleText.length < BUBBLE_FULL.length && <span className="hero-bubble-caret" aria-hidden />}
              </div>
            </div>

            <div className="chat-box hero-chat">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  void onPickFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <div className="hero-chat-row">
                <div className={`hero-attach-col${refImages.length ? " has-thumbs" : ""}`}>
                  <button type="button" className="attach-card" onClick={addAttach}>
                    <span className="attach-plus">
                      <Icon name="plus" size={22} />
                    </span>
                    <span className="attach-txt">上传附件</span>
                  </button>
                  {refImages.slice(-2).reverse().map((src, i) => {
                    const realIndex = refImages.length - 1 - i;
                    return (
                      <div
                        key={`${realIndex}-${src.slice(0, 32)}`}
                        className={`attach-thumb${i > 0 ? " is-back" : ""}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt="" />
                        <span
                          className="attach-del"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRefImages((prev) => prev.filter((_, j) => j !== realIndex));
                          }}
                        >
                          ×
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="hero-chat-main">
                  <textarea
                    ref={heroInputRef}
                    className="chat-input"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (!isSendEnter(e.nativeEvent)) return;
                      e.preventDefault();
                      if (replying) return;
                      const now = Date.now();
                      if (now - lastSendAtRef.current < 400) return;
                      lastSendAtRef.current = now;
                      submitTurn(input);
                    }}
                    placeholder="描述需求，例如「国潮风萧山萝卜干伴手礼包装」。"
                  />
                  <div className="chat-bar">
                    <div className="chat-tools" />
                    {(input.trim() || refImages.length > 0) && !replying ? (
                    <button
                      type="button"
                      className="hc-send"
                      aria-label="发送"
                      title="发送 (Enter)"
                      aria-keyshortcuts="Enter"
                      onClick={() => submitTurn(input)}
                    >
                      <Icon name="send" size={16} />
                    </button>
                    ) : replying ? (
                    <button
                      type="button"
                      className="hc-send hc-send-stop"
                      aria-label="正在生成中，点击停止"
                      title="正在生成中"
                      onClick={stopTurn}
                    >
                      <span className="hc-send-stop-sq" />
                    </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {heroIntents.length > 0 ? (
          <div className="intent-hint">
            {heroIntents.map((it, i) => (
              <button
                key={`${it.text}-${i}`}
                type="button"
                className="intent-chip"
                onClick={() => setInput(it.text)}
              >
                {it.text}
              </button>
            ))}
          </div>
          ) : null}
        </div>

        <div className="hero-float">
          <div className="hero-cs-wrap">
            <div className="hero-cs-pop" role="tooltip">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="hero-cs-qr" src={asset("/home/cs-qr.png")} alt="微信客服二维码" />
              <div className="hero-cs-meta">
                <div className="hero-cs-title">微信客服</div>
                <div className="hero-cs-sub">工作日 9:00–18:00</div>
                <span className="hero-cs-tag">扫码联系</span>
              </div>
            </div>
            <button type="button" className="hero-float-cs" aria-label="联系客服">
              <Icon name="headset" size={18} />
              <span>联系客服</span>
            </button>
          </div>
        </div>

        <SiteBeian className="hero-beian" />
      </section>
    </div>
  );
}
