"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { SiteBeian } from "@/components/shell/SiteBeian";
import { cases, intents } from "@/data/home";
import { asset } from "@/lib/asset";
import { buildTemplateApplyHref, findTemplateByName } from "@/lib/templateApply";
import {
  emptyAgentState,
  runAgentTurn,
  executePropose,
  executeGenerate,
  executeAgentReply,
  postDeliveryActions,
  getSpecialist,
  failureRetryActions,
  type AgentAction,
  type AgentProposal,
  type AgentRuntimeState,
  type AskGroupItem,
  type AssistantTurn,
  type ChatHistoryItem,
} from "@/lib/agent";
import { describeRefImages } from "@/lib/agent/refVision";
import {
  persistSlotsToMemory,
  resetBrandMemory,
  bindBrandMemorySession,
  readBrandMemory,
  type BrandMemory,
} from "@/lib/agent/memory";
import { useLibrary } from "@/lib/store";
import {
  HOME_CHAT_EVENT,
  HOME_CHAT_EXIT_EVENT,
  HOME_SEASON_EVENT,
  type HomeSeason,
  readHomeSeason,
} from "@/lib/homeSeason";

type Cat = "all" | "content" | "image" | "video";
type ChatRole = "user" | "assistant";
type ChatMsg = {
  id: string;
  role: ChatRole;
  text: string;
  tipLabel?: string;
  thinking?: string;
  summaryLines?: string[];
  askGroups?: AskGroupItem[];
  options?: AgentAction[];
  actions?: AgentAction[];
  proposals?: AgentProposal[];
  images?: string[];
};

type ChatSession = {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMsg[];
  agentState?: AgentRuntimeState;
  /** 本对话专属品牌记忆，与其它对话隔离 */
  brandMemory?: BrandMemory | null;
};

const CHAT_HISTORY_KEY = "mofun_home_chat_history_v1";

function readChatHistory(): ChatSession[] {
  try {
    const raw = localStorage.getItem(CHAT_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatSession[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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

const CATS: { cat: Cat; name: string }[] = [
  { cat: "all", name: "全部" },
  { cat: "content", name: "文案策划" },
  { cat: "image", name: "品牌设计" },
  { cat: "video", name: "视频宣传" },
];

const BUBBLE_FULL = "我是「小墨」，想好今天设计什么了吗！";

const HERO_VIDEOS: Partial<Record<HomeSeason, string>> = {
  spring: "/home/hero-spring.mp4",
  summer: "/home/hero-summer.mp4",
  autumn: "/home/hero-autumn.mp4",
  winter: "/home/hero-winter.mp4",
};

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function historyForModel(msgs: ChatMsg[]): ChatHistoryItem[] {
  return msgs
    .filter((m) => m.text?.trim())
    .slice(-12)
    .map((m) => ({ role: m.role, text: m.text }));
}

/** 对外展示文案：去掉意图识别等内部元信息，并清掉行首缩进 */
function displayAssistantText(text: string) {
  return text
    .split("\n")
    .map((line) => line.replace(/^[ \t\u3000]+/, "").replace(/[ \t\u3000]+$/, ""))
    .filter((line) => !/识别意图\s*→/.test(line) && !/^收到[，,].*设计。?$/.test(line.trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function HomeView() {
  const router = useRouter();
  const toast = useToast();
  const { addWork } = useLibrary();

  const [input, setInput] = useState("");
  const [attached, setAttached] = useState<string[]>([]);
  const [refImages, setRefImages] = useState<string[]>([]);
  const [cat, setCat] = useState<Cat>("all");
  const [kw, setKw] = useState("");
  const [bubbleText, setBubbleText] = useState("");
  const [season, setSeason] = useState<HomeSeason>("summer");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [replying, setReplying] = useState(false);
  const [agentState, setAgentState] = useState<AgentRuntimeState>(() => emptyAgentState());
  const [sessionId, setSessionId] = useState(() => {
    const id = uid();
    resetBrandMemory(id);
    return id;
  });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyList, setHistoryList] = useState<ChatSession[]>([]);
  const [msgFeedback, setMsgFeedback] = useState<Record<string, "up" | "down">>({});
  const [moreOpenId, setMoreOpenId] = useState<string | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [askDrafts, setAskDrafts] = useState<Record<string, string>>({});
  /** 双问卡片本地暂存：两项都选齐后再一次发送 */
  const [askPicks, setAskPicks] = useState<Record<string, string>>({});
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const chatFileRef = useRef<HTMLInputElement>(null);
  const agentStateRef = useRef(agentState);
  agentStateRef.current = agentState;

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
    if (!previewSrc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewSrc(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [previewSrc]);
  const inChat = messages.length > 0;

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
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, inChat, replying]);

  function persistSession(msgs: ChatMsg[], id: string, state?: AgentRuntimeState) {
    if (msgs.length === 0) return;
    const raw = state ?? agentStateRef.current;
    // 参考原图 dataURL 过大，不进历史；保留视觉摘要供续聊
    const { refImages: _drop, ...rest } = raw;
    const next: ChatSession = {
      id,
      title: sessionTitle(msgs),
      updatedAt: Date.now(),
      messages: msgs,
      agentState: rest,
      brandMemory: readBrandMemory(),
    };
    const list = readChatHistory().filter((s) => s.id !== id);
    writeChatHistory([next, ...list]);
  }

  function exitToHome(showToast = false) {
    if (messages.length > 0) persistSession(messages, sessionId);
    setMessages([]);
    setChatInput("");
    setInput("");
    setReplying(false);
    setHistoryOpen(false);
    setAskDrafts({});
    setAskPicks({});
    setAgentState(emptyAgentState());
    setRefImages([]);
    const nextId = uid();
    resetBrandMemory(nextId);
    setSessionId(nextId);
    window.dispatchEvent(new CustomEvent(HOME_CHAT_EVENT, { detail: false }));
    if (showToast) toast("已新建对话");
  }

  function startNewChat() {
    exitToHome(true);
  }

  const exitToHomeRef = useRef(exitToHome);
  exitToHomeRef.current = exitToHome;

  useEffect(() => {
    const onExit = () => exitToHomeRef.current(false);
    window.addEventListener(HOME_CHAT_EXIT_EVENT, onExit);
    return () => window.removeEventListener(HOME_CHAT_EXIT_EVENT, onExit);
  }, []);

  function openHistory() {
    setHistoryList(readChatHistory());
    setHistoryOpen((v) => !v);
  }

  function loadSession(s: ChatSession) {
    if (messages.length > 0) persistSession(messages, sessionId);
    setSessionId(s.id);
    bindBrandMemorySession(s.id, s.brandMemory ?? null);
    setMessages(s.messages);
    setAgentState(s.agentState ?? emptyAgentState());
    setChatInput("");
    setReplying(false);
    setHistoryOpen(false);
    window.dispatchEvent(new CustomEvent(HOME_CHAT_EVENT, { detail: true }));
  }

  function applyTurn(userText: string, action?: AgentAction) {
    if (replying) return;
    setAskPicks({});
    if (messages.length === 0) {
      window.dispatchEvent(new CustomEvent(HOME_CHAT_EVENT, { detail: true }));
    }

    const refsSnapshot = [...refImages];
    const showUser = Boolean(userText.trim()) || refsSnapshot.length > 0 || action?.kind === "option" || action?.kind === "category";
    const displayText =
      userText.trim() ||
      action?.label ||
      (refsSnapshot.length ? "（已附参考图）" : "");

    const recentHistory: ChatHistoryItem[] = historyForModel(messages);
    if (showUser && displayText) {
      recentHistory.push({ role: "user", text: displayText });
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
    setReplying(true);

    const turnText =
      userText.trim() ||
      action?.value ||
      action?.label ||
      (refsSnapshot.length ? "请参考我上传的图片继续" : "");

    void (async () => {
      let visionNotes = "";
      if (refsSnapshot.length) {
        visionNotes = await describeRefImages(refsSnapshot);
      }

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

      const turn = runAgentTurn({
        text: turnText,
        state: baseState,
        think: true,
        action,
      });

      // 编排可能覆盖 slots；把参考图信息补回
      if (refsSnapshot.length) {
        turn.state = {
          ...turn.state,
          refImages: refsSnapshot,
          refVisionNotes: visionNotes || turn.state.refVisionNotes,
          slots: {
            ...turn.state.slots,
            ...(visionNotes ? { referenceDesc: visionNotes } : {}),
          },
        };
      }

      setAgentState(turn.state);
      agentStateRef.current = turn.state;

      const modelText = await executeAgentReply({
        state: turn.state,
        userText: turnText,
        turn,
        refVisionNotes: visionNotes || undefined,
        recentHistory,
      });
      const replyText = modelText || turn.text;

      const assistantMsg: ChatMsg = {
        id: uid(),
        role: "assistant",
        text: replyText,
        tipLabel: turn.tipLabel,
        thinking: turn.thinking,
        summaryLines: turn.summaryLines,
        askGroups: turn.askGroups,
        options: turn.options,
        actions: turn.actions,
        proposals: turn.proposals,
      };
      setMessages((prev) => {
        const next = [...prev, assistantMsg];
        persistSession(next, sessionId, turn.state);
        return next;
      });
      setReplying(false);
    })();
  }

  function sendMessage(raw: string) {
    const t = (raw || "").trim();
    if (replying) return;
    if (!t && refImages.length === 0) return;
    applyTurn(t);
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
      const el = document.querySelector<HTMLInputElement>(`input.hc-ask-input[data-slot="${slotKey}"]`);
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

  function onChip(action: AgentAction) {
    if (replying) return;

    // 「我自己写」：不推进回合，聚焦该槽输入框
    if (isSelfWriteOption(action) && action.slotKey) {
      focusAskInput(action.slotKey);
      return;
    }

    // 真实提案
    if (action.kind === "propose" || action.value === "帮我写一版" || action.label.includes("帮我提案")) {
      const userLabel = action.label;
      const recentHistory: ChatHistoryItem[] = [
        ...historyForModel(messages),
        { role: "user", text: userLabel },
      ];
      setMessages((prev) => {
        const next = [...prev, { id: uid(), role: "user" as const, text: userLabel }];
        persistSession(next, sessionId);
        return next;
      });
      setReplying(true);
      void (async () => {
        if (action.value === "帮我写一版") {
          const st = { ...agentStateRef.current, slots: { ...agentStateRef.current.slots, script: "（待生成）" } };
          setAgentState(st);
          agentStateRef.current = st;
        }
        if (action.label.includes("帮我提案") || action.value === "帮我提案") {
          const slots = { ...agentStateRef.current.slots };
          if (!slots.creativeDesc) slots.creativeDesc = "可爱品牌吉祥物 IP，单一角色居中";
          if (!slots.mode) slots.mode = "创新设计";
          const st = { ...agentStateRef.current, slots };
          setAgentState(st);
          agentStateRef.current = st;
        }
        const res = await executePropose(agentStateRef.current);
        if (!res.ok) {
          const failTurn: AssistantTurn = {
            text: res.error || "提案失败",
            actions: failureRetryActions("propose"),
            state: agentStateRef.current,
          };
          const modelFail = await executeAgentReply({
            state: agentStateRef.current,
            userText: userLabel,
            turn: failTurn,
            recentHistory,
            outcomeHint: `提案失败：${res.error || "未知错误"}`,
          });
          setMessages((prev) => {
            const next = [
              ...prev,
              {
                id: uid(),
                role: "assistant" as const,
                text: modelFail || res.error || "提案失败",
                tipLabel: undefined,
                actions: failureRetryActions("propose"),
              },
            ];
            persistSession(next, sessionId);
            return next;
          });
          setReplying(false);
          toast(res.error || "提案失败", "warn");
          return;
        }
        const proposals = res.proposals || [];
        const nextState: AgentRuntimeState = {
          ...agentStateRef.current,
          proposals,
          phase: "proposed",
        };
        setAgentState(nextState);
        agentStateRef.current = nextState;
        const proposeOpts = [
          ...proposals.map((p) => ({
            id: `pick-${p.id}`,
            label: `用${p.title}`,
            kind: "pick_proposal" as const,
            proposalId: p.id,
          })),
          { id: "redo-propose", label: "都不满意，再说说", kind: "option" as const, slotKey: "_redo", value: "redo" },
        ];
        const proposeTurn: AssistantTurn = {
          text: res.text,
          proposals,
          options: proposeOpts,
          state: nextState,
        };
        const modelText = await executeAgentReply({
          state: nextState,
          userText: userLabel,
          turn: proposeTurn,
          recentHistory,
          outcomeHint: `已生成 ${proposals.length} 个方向提案：${proposals.map((p) => p.title).join("、")}。${res.text}`,
        });
        setMessages((prev) => {
          const next = [
            ...prev,
            {
              id: uid(),
              role: "assistant" as const,
              text: modelText || res.text,
              tipLabel: undefined,
              proposals,
              options: proposeOpts,
            },
          ];
          persistSession(next, sessionId, nextState);
          return next;
        });
        setReplying(false);
      })();
      return;
    }

    // 确认策划 / 直接生成 / VI 延展 / 指定 Skill
    if (
      action.kind === "generate" ||
      action.kind === "confirm_plan" ||
      action.kind === "extend_vi" ||
      action.value === "我已上传，请出图"
    ) {
      const userLabel = action.label;
      const recentHistory: ChatHistoryItem[] = [
        ...historyForModel(messages),
        { role: "user", text: userLabel },
      ];
      setMessages((prev) => {
        const next = [...prev, { id: uid(), role: "user" as const, text: userLabel }];
        persistSession(next, sessionId);
        return next;
      });
      setReplying(true);
      void (async () => {
        const isVi = action.kind === "extend_vi" || action.skillId === "skill.image.vi_extend";
        const runSkillId =
          action.skillId || (isVi ? ("skill.image.vi_extend" as const) : undefined);
        const st: AgentRuntimeState = {
          ...agentStateRef.current,
          planConfirmed: true,
          skillId: runSkillId,
        };
        setAgentState(st);
        agentStateRef.current = st;
        persistSlotsToMemory(st.slots);

        const res = await executeGenerate(st, {
          refImage: st.refImages?.[0] || refImages[0],
          skill: runSkillId,
          confirming: true,
        });
        if (!res.ok) {
          const failTurn: AssistantTurn = {
            text: res.error || "生成失败",
            actions: failureRetryActions("generate"),
            state: agentStateRef.current,
          };
          const modelFail = await executeAgentReply({
            state: agentStateRef.current,
            userText: userLabel,
            turn: failTurn,
            recentHistory,
            outcomeHint: `生成失败：${res.error || "未知错误"}`,
          });
          setMessages((prev) => {
            const next = [
              ...prev,
              {
                id: uid(),
                role: "assistant" as const,
                text: modelFail || res.error || "生成失败",
                actions: failureRetryActions("generate"),
              },
            ];
            persistSession(next, sessionId);
            return next;
          });
          setReplying(false);
          toast(res.error || "生成失败", "warn");
          return;
        }
        if (res.images?.length) {
          res.images.forEach((img, i) => {
            addWork({
              emoji: "✨",
              grad: "thumb-grad-1",
              kind: "图片",
              name: `小墨对话 · ${agentStateRef.current.specialistId || "创作"} ${i + 1}`,
              sub: isVi ? "VI延展" : runSkillId === "skill.image.ip_story" ? "IP故事" : "首页对话",
              img,
              time: new Date().toLocaleString("zh-CN", { hour12: false }),
              edit: { sub: agentStateRef.current.specialistId?.split(".")[1] || "ip", input: res.text },
            });
          });
        }

        const spec = agentStateRef.current.specialistId
          ? getSpecialist(agentStateRef.current.specialistId)
          : undefined;
        const deliveryActions = spec
          ? postDeliveryActions(spec)
          : [
              { id: "act-generate", label: "再生成一版", kind: "generate" as const },
              { id: "act-propose", label: "再出方案", kind: "propose" as const },
            ];

        const nextState: AgentRuntimeState = {
          ...agentStateRef.current,
          phase: "delivered",
          skillId: undefined,
          lastImageCount: res.images?.length || 0,
        };
        setAgentState(nextState);
        agentStateRef.current = nextState;

        const deliveryTurn: AssistantTurn = {
          text: res.text,
          actions: deliveryActions,
          state: nextState,
        };
        const modelText = await executeAgentReply({
          state: nextState,
          userText: userLabel,
          turn: deliveryTurn,
          recentHistory,
          outcomeHint: res.images?.length
            ? `已成功出图 ${res.images.length} 张。系统提示：${res.text}`
            : `已完成文本生成。系统提示：${res.text}`,
        });

        setMessages((prev) => {
          const next = [
            ...prev,
            {
              id: uid(),
              role: "assistant" as const,
              text: modelText || res.text,
              images: res.images,
              actions: deliveryActions,
            },
          ];
          persistSession(next, sessionId, nextState);
          return next;
        });
        setReplying(false);
        toast(res.images?.length ? "已生成并存入仓库" : "已生成");
      })();
      return;
    }

    // 不再跳转功能页
    if (action.kind === "handoff") {
      toast("请在对话中继续完成创作，无需跳转");
      return;
    }

    applyTurn(action.value || action.label, action);
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

    const merged = [...refImages, ...next].slice(0, 4);
    setRefImages(merged);
    setAttached((prev) => [...prev, ...next.map(() => "📷")].slice(0, 8));

    const st: AgentRuntimeState = {
      ...agentStateRef.current,
      refImages: merged,
    };
    setAgentState(st);
    agentStateRef.current = st;

    const sid = st.specialistId;
    const slots = st.slots;
    const waitingUpload =
      (sid === "image.event" && slots.pipeline === "图生图") ||
      (sid === "video.oneline" && slots.pipeline === "图生视频") ||
      sid === "image.product" ||
      (sid === "image.ip" && slots.mode === "扩展设计");

    const pending = st.pendingAskKeys || [];
    let uploadKey =
      pending.find((k) => k === "refUpload" || k === "ipImage" || k === "productImage") ||
      undefined;
    if (!uploadKey && waitingUpload) {
      if (sid === "image.product" && !slots.productImage) uploadKey = "productImage";
      else if (sid === "image.ip" && slots.mode === "扩展设计" && !slots.ipImage) uploadKey = "ipImage";
      else if (!slots.refUpload) uploadKey = "refUpload";
    }

    if (waitingUpload && uploadKey && !replying) {
      const value =
        uploadKey === "productImage"
          ? "我已上传，请出图"
          : uploadKey === "ipImage"
            ? "我已上传"
            : "我已上传参考图";
      toast("图片已上传，继续为你推进");
      window.setTimeout(() => {
        applyTurn(value, {
          id: `upload-${uploadKey}`,
          label: value,
          kind: "option",
          slotKey: uploadKey,
          value,
        });
      }, 40);
      return;
    }

    toast(`已添加 ${next.length} 张参考图`);
  }

  function addAttach() {
    if (inChat) chatFileRef.current?.click();
    else fileRef.current?.click();
  }

  function scrollToShowcase() {
    document.getElementById("home-showcase")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function regenerate(msgId: string) {
    const idx = messages.findIndex((m) => m.id === msgId);
    if (idx < 0) return;
    const prevUser = [...messages].slice(0, idx).reverse().find((m) => m.role === "user");
    if (!prevUser) return;
    setReplying(true);
    setMessages((prev) => prev.filter((m) => m.id !== msgId));
    // 从该用户句重新跑（保留此前已收集槽位；正文走模型结合项目状态）
    void (async () => {
      const turn = runAgentTurn({
        text: prevUser.text,
        state: agentStateRef.current,
        think: true,
      });
      setAgentState(turn.state);
      agentStateRef.current = turn.state;
      const recentHistory = historyForModel(messages.slice(0, idx));
      const modelText = await executeAgentReply({
        state: turn.state,
        userText: prevUser.text,
        turn,
        recentHistory,
      });
      setMessages((prev) => {
        const next = [
          ...prev,
          {
            id: uid(),
            role: "assistant" as const,
            text: modelText || turn.text,
            tipLabel: turn.tipLabel,
            thinking: turn.thinking,
            summaryLines: turn.summaryLines,
            askGroups: turn.askGroups,
            options: turn.options,
            actions: turn.actions,
            proposals: turn.proposals,
          },
        ];
        persistSession(next, sessionId, turn.state);
        return next;
      });
      setReplying(false);
    })();
  }

  const shown = useMemo(() => {
    const q = kw.trim().toLowerCase();
    return cases.filter(
      (c) => (cat === "all" || c.cat === cat) && (!q || c.name.toLowerCase().includes(q))
    );
  }, [cat, kw]);

  if (inChat) {
    return (
      <div className="page page-home page-home-chat">
        <div className="home-chat-toolbar">
          <button
            type="button"
            className="hc-tool-btn"
            aria-label="新建对话"
            title="新建对话"
            onClick={startNewChat}
          >
            <Icon name="chatNew" size={20} />
          </button>
          <button
            type="button"
            className={`hc-tool-btn ${historyOpen ? "active" : ""}`}
            aria-label="历史记录"
            title="历史记录"
            aria-expanded={historyOpen}
            onClick={openHistory}
          >
            <Icon name="history" size={20} />
          </button>
          {historyOpen && (
            <div className="hc-history-panel">
              <div className="hc-history-title">历史记录</div>
              {historyList.length === 0 ? (
                <div className="hc-history-empty">暂无历史对话</div>
              ) : (
                <ul className="hc-history-list">
                  {historyList.map((s) => (
                    <li key={s.id}>
                      <button type="button" className="hc-history-item" onClick={() => loadSession(s)}>
                        <span className="hc-history-item-title">{s.title}</span>
                        <span className="hc-history-item-time">
                          {new Date(s.updatedAt).toLocaleString("zh-CN", {
                            month: "numeric",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="home-chat">
          <div className="home-chat-list" ref={listRef}>
            {messages.map((m, mi) => {
              const isLastAssistant =
                m.role === "assistant" && !messages.slice(mi + 1).some((x) => x.role === "assistant");
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
                    <div className="hc-bubble">{m.text}</div>
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
                    {m.thinking && (
                      <details className="hc-thinking">
                        <summary>深度思考</summary>
                        <div className="hc-thinking-body">{m.thinking}</div>
                      </details>
                    )}
                    <div className="hc-bubble">{displayAssistantText(m.text)}</div>
                    {m.askGroups && m.askGroups.length > 0 && (
                      <div className="hc-ask-card">
                        {m.askGroups.map((q, qi) => {
                          const localPick = askPicks[q.key];
                          const shownFilled = q.filled || (isLastAssistant ? localPick : undefined);
                          return (
                          <div key={q.key} className={`hc-ask-block ${shownFilled ? "filled" : ""}`}>
                            <div className="hc-ask-label">
                              Q{qi + 1} · {q.label}
                            </div>
                            <div className="hc-ask-q">{q.ask}</div>
                            {shownFilled ? (
                              <div className="hc-ask-filled">
                                {shownFilled}
                                {isLastAssistant && localPick && !q.filled && (
                                  <button
                                    type="button"
                                    className="hc-ask-repick"
                                    disabled={replying}
                                    onClick={() =>
                                      setAskPicks((prev) => {
                                        const next = { ...prev };
                                        delete next[q.key];
                                        return next;
                                      })
                                    }
                                  >
                                    重选
                                  </button>
                                )}
                              </div>
                            ) : (
                              isLastAssistant && (
                                <>
                                  {q.options && q.options.length > 0 && (
                                    <div className="hc-chips">
                                      {q.options.map((o) => (
                                        <button
                                          key={o.id}
                                          type="button"
                                          className="hc-chip"
                                          disabled={replying}
                                          onClick={() => onAskChip(o, m.askGroups!)}
                                        >
                                          {o.label}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                  <div className="hc-ask-input-row">
                                    <input
                                      type="text"
                                      className="hc-ask-input"
                                      data-slot={q.key}
                                      disabled={replying}
                                      placeholder={
                                        q.options?.length
                                          ? "优先点选上方选项；自定义在此输入后回车"
                                          : "在此输入后回车发送"
                                      }
                                      value={askDrafts[q.key] || ""}
                                      onChange={(e) =>
                                        setAskDrafts((prev) => ({ ...prev, [q.key]: e.target.value }))
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                                        e.preventDefault();
                                        onAskCustomSubmit(q.key, askDrafts[q.key] || "", m.askGroups!);
                                      }}
                                    />
                                  </div>
                                </>
                              )
                            )}
                          </div>
                          );
                        })}
                        {isLastAssistant &&
                          m.askGroups.filter((q) => !q.filled).length >= 2 && (
                            <div className="hc-ask-foot">
                              {Object.keys(askPicks).length
                                ? `已选 ${Object.keys(askPicks).length}/${m.askGroups.filter((q) => !q.filled).length}，两项都完成后再发送`
                                : "两项都选好后会自动发送；也可底部输入框一次说完"}
                            </div>
                          )}
                      </div>
                    )}
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
                      <div className="hc-images">
                        {m.images.map((src, i) => (
                          <button
                            key={i}
                            type="button"
                            className="hc-image-link"
                            title="查看大图"
                            aria-label={`查看生成结果 ${i + 1}`}
                            onClick={() => setPreviewSrc(src)}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={src} alt={`生成结果 ${i + 1}`} className="hc-image" />
                          </button>
                        ))}
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
                              <Icon name="sparkle" size={14} /> 产品建议
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    {isLastAssistant &&
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
                    {isLastAssistant && m.actions && m.actions.length > 0 && (
                      <div className="hc-suggest">
                        {m.actions.map((a) => (
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
                            disabled={replying}
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
                  <div className="hc-bubble hc-typing">正在回复…</div>
                </div>
              </div>
            )}
          </div>

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
              className="hc-input"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(chatInput);
                }
              }}
              placeholder="优先点选卡片选项；也可在此补充…"
              rows={2}
            />
            <div className="hc-composer-bar">
              <div className="hc-composer-left">
                <button type="button" className="hc-icon-btn" aria-label="上传附件" onClick={addAttach}>
                  <Icon name="attach" size={18} />
                </button>
              </div>
              <div className="hc-composer-right">
                <button
                  type="button"
                  className="hc-send"
                  aria-label="发送"
                  disabled={(!chatInput.trim() && refImages.length === 0) || replying}
                  onClick={() => sendMessage(chatInput)}
                >
                  <Icon name="send" size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
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
                    className="chat-input"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendMessage(input);
                    }}
                    placeholder="描述乡村品牌设计需求，例如：'设计国潮风萧山萝卜干伴手礼包装'，或上传草图方案让我完善"
                  />
                  <div className="chat-bar">
                    <div className="chat-tools" />
                    <button type="button" className="btn btn-primary hero-gen-btn" onClick={() => sendMessage(input)}>
                      <Icon name="sparkle" size={16} /> 立即生成
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="intent-hint">
            {intents.map((it, i) => (
              <button
                key={i}
                type="button"
                className="intent-chip"
                onClick={() => setInput(it.text)}
              >
                {it.text}
              </button>
            ))}
          </div>
        </div>

        <button type="button" className="hero-scroll" onClick={scrollToShowcase}>
          <span>下滑解锁更多内容</span>
          <Icon name="chevron" size={16} />
        </button>

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

      <section className="showcase" id="home-showcase">
        <div className="showcase-head">
          <h2 className="showcase-title">
            优秀<span>设计案例</span>
          </h2>
          <div className="showcase-sub">EXCELLENT DESIGN</div>
        </div>

        <div className="showcase-search">
          <Icon name="search" size={18} />
          <input
            value={kw}
            onChange={(e) => setKw(e.target.value)}
            placeholder="输入关键词搜索灵感…"
          />
        </div>

        <div className="showcase-bar">
          <div className="filter-row">
            {CATS.map((c) => (
              <span
                key={c.cat}
                className={cat === c.cat ? "sel-chip on" : "sel-chip"}
                onClick={() => setCat(c.cat)}
              >
                {c.name}
              </span>
            ))}
          </div>
          <a className="showcase-more" onClick={() => router.push("/template")}>
            查看更多 <Icon name="chevron" size={14} />
          </a>
        </div>

        <div className="case-wall">
          {shown.length === 0 ? (
            <p className="case-empty empty-note" style={{ gridColumn: "1/-1", textAlign: "center", padding: "30px 0" }}>
              没有匹配的案例，换个关键词或分类试试～
            </p>
          ) : (
            shown.map((c) => (
              <div
                key={c.name}
                className="case-card"
                onClick={() => {
                  const tpl = c.tpl ? findTemplateByName(c.tpl) : undefined;
                  if (tpl) {
                    toast(`已套用「${c.name}」，灵感已填入表单`);
                    window.setTimeout(() => router.push(buildTemplateApplyHref(tpl)), 700);
                    return;
                  }
                  const view = c.cat === "content" ? "content" : c.cat === "video" ? "video" : "image";
                  const sub = c.cat === "content" ? "social" : c.cat === "video" ? "oneline" : "event";
                  toast(`已载入「${c.name}」为模板`);
                  window.setTimeout(() => router.push(`/${view}?sub=${sub}`), 700);
                }}
              >
                <div className={`case-thumb ${c.grad}`}>
                  <span className="ct-type">{c.type}</span>
                  <span className="ct-emoji">{c.emoji}</span>
                  <div className="case-hover">
                    <button className="btn btn-primary btn-sm">套用模版</button>
                  </div>
                </div>
                <div className="case-info">
                  <div className="case-name">{c.name}</div>
                  <div className="case-meta">
                    <span className="region">📍{c.region}</span> · {c.author}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
