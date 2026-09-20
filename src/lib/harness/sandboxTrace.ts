import type { SessionEvent } from "./session";

export type SandboxTraceKind = "think" | "read" | "web" | "review" | "optimize" | "generate" | "reply";

export type SandboxTraceItem = {
  id: string;
  kind: SandboxTraceKind;
  label: string;
  status: "running" | "done";
  detail?: string;
};

const LABEL: Record<SandboxTraceKind, string> = {
  think: "深度思考",
  read: "读取内容",
  web: "联网检索",
  review: "计划审查",
  optimize: "优化提示词",
  generate: "生成图片",
  reply: "已回复",
};

export type SealReplyKind = "text" | "image" | "video";

function doneItem(kind: SandboxTraceKind, label: string, id: string, detail?: string): SandboxTraceItem {
  return { id, kind, label, status: "done", ...(detail ? { detail } : {}) };
}

function clipDetail(raw: string, max = 2400): string {
  const t = String(raw || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max).trim()}…` : t;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function planRecord(data: Record<string, unknown>): Record<string, unknown> {
  return data.plan && typeof data.plan === "object" ? (data.plan as Record<string, unknown>) : data;
}

function eventDetail(ev: SessionEvent): string {
  const d = ev.data;
  if (str(d.detail)) return clipDetail(str(d.detail));
  if (str(d.brief)) return clipDetail(str(d.brief));
  if (ev.type === "plan/write") {
    const plan = planRecord(d);
    const path =
      str(plan.generateTool) === "propose" ? "先出方向提案" : "先问清再出图";
    return clipDetail(
      [
        str(plan.skillName) && `选用：${str(plan.skillName)}`,
        str(plan.intent) && `意图：${str(plan.intent)}`,
        str(plan.ragQuery) && `检索词：${str(plan.ragQuery)}`,
        (plan.needWeb === true || plan.needWeb === "true") && `联网：${str(plan.webQuery) || "需要"}`,
        `路径：${path}`,
        str(plan.notes) && `备注：${str(plan.notes)}`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  if (ev.type === "rag/retrieve") {
    const q = str(d.query);
    const brief = str(d.brief);
    return clipDetail([q && `检索词：${q}`, brief || "知识库暂无足够条目"].filter(Boolean).join("\n"));
  }
  if (ev.type === "web/search") {
    const q = str(d.query);
    const brief = str(d.brief);
    return clipDetail([q && `检索词：${q}`, brief || "未取到公开结果"].filter(Boolean).join("\n"));
  }
  if (ev.type === "prompt/optimize") {
    return clipDetail(str(d.prompt) || str(d.optimized));
  }
  if (ev.type === "accept/review") {
    return clipDetail(str(d.reason) || (d.ok === false ? "验收未通过" : "验收通过"));
  }
  if (ev.type === "tool/result") {
    if (str(d.error)) return clipDetail(str(d.error));
    const n = Number(d.imageCount || 0);
    if (n > 0) return `已产出 ${n} 张画面`;
    if (str(d.text)) return clipDetail(str(d.text));
  }
  if (ev.type === "step/end") {
    if (str(d.reason)) return clipDetail(str(d.reason));
    if (d.examples && typeof d.examples === "object") {
      const lines = Object.entries(d.examples as Record<string, unknown>).map(([k, v]) => {
        const vals = Array.isArray(v) ? v.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 3) : [String(v || "").trim()].filter(Boolean);
        return vals.length ? `${k}：${vals.join(" / ")}` : "";
      });
      return clipDetail(lines.filter(Boolean).join("\n"));
    }
  }
  return "";
}

function attachKind(ev: SessionEvent): SandboxTraceKind | null {
  if (ev.type === "plan/write") return "think";
  if (ev.type === "rag/retrieve") return "read";
  if (ev.type === "web/search") return "web";
  if (ev.type === "prompt/optimize") return "optimize";
  if (ev.type === "accept/review" || ev.type === "tool/result" || ev.type === "tool/call") return "generate";
  if (ev.type === "step/end") return phaseKind(String(ev.data.phase || ev.data.tool || ""));
  return kindFromEvent(ev);
}

function attachDetail(items: SandboxTraceItem[], kind: SandboxTraceKind | null, detail: string): SandboxTraceItem[] {
  if (!detail || !items.length) return items;
  let idx = -1;
  if (kind) {
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i].kind === kind) {
        idx = i;
        break;
      }
    }
  }
  if (idx < 0) {
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i].status === "running") {
        idx = i;
        break;
      }
    }
  }
  if (idx < 0) idx = items.length - 1;
  const cur = items[idx];
  if (!cur || cur.detail === detail) return items;
  const placeholder = /正在|进行中…/.test(cur.detail || "");
  const continuation = Boolean(
    cur.detail && (detail.startsWith(cur.detail) || cur.detail.startsWith(detail)),
  );
  const merged =
    placeholder || !cur.detail || continuation
      ? detail
      : cur.detail.includes(detail)
        ? cur.detail
        : `${cur.detail}\n${detail}`;
  const next = clipDetail(merged, 4000);
  if (cur.detail === next) return items;
  return items.map((x, i) => (i === idx ? { ...x, detail: next } : x));
}

/** 空过程时的兜底标题。 */
export function sealReplyTrace(kind: SealReplyKind): SandboxTraceItem[] {
  const first =
    kind === "video"
      ? doneItem("generate", "生成视频", "generate-end")
      : kind === "image"
        ? doneItem("generate", "生成图片", "generate-end")
        : doneItem("think", LABEL.think, "think-end");
  return [first, doneItem("reply", LABEL.reply, "reply-end")];
}

/** 对话落盘时保留全部步骤，并补上「已回复」。 */
export function freezeSandboxTrace(items: SandboxTraceItem[], kind: SealReplyKind): SandboxTraceItem[] {
  const done = finishRunning(items).map((x) =>
    x.kind === "generate" && kind === "video" && x.label === LABEL.generate
      ? { ...x, label: "生成视频" }
      : x,
  );
  if (!done.length) return sealReplyTrace(kind);
  if (done.some((x) => x.kind === "reply")) return done;
  return [...done, doneItem("reply", LABEL.reply, "reply-end")];
}

export function sandboxLabel(kind: SandboxTraceKind): string {
  return LABEL[kind];
}

function phaseKind(phase: string): SandboxTraceKind | null {
  if (phase === "think" || phase === "analyze") return "think";
  if (phase === "read" || phase === "rag" || phase === "quiz" || phase === "quiz-examples") return "read";
  if (phase === "web") return "web";
  if (phase === "review") return "review";
  if (phase === "optimize") return "optimize";
  if (phase === "generate" || phase === "propose") return "generate";
  return null;
}

function kindFromEvent(ev: SessionEvent): SandboxTraceKind | null {
  if (ev.type === "assistant/message") return "reply";
  if (ev.type === "tool/call") return "generate";
  if (ev.type === "step/start") {
    return phaseKind(String(ev.data.phase || ev.data.tool || ""));
  }
  return null;
}

function finishRunning(items: SandboxTraceItem[]): SandboxTraceItem[] {
  return items.map((x) => (x.status === "running" ? { ...x, status: "done" as const } : x));
}

export function reduceSandboxTrace(prev: SandboxTraceItem[], ev: SessionEvent): SandboxTraceItem[] {
  const kind = kindFromEvent(ev);
  const detail = eventDetail(ev);

  if (kind === "reply") {
    const done = finishRunning(prev);
    if (done.some((x) => x.kind === "reply")) return done;
    return [...done, { id: `reply-${ev.seq}`, kind: "reply", label: LABEL.reply, status: "done" }];
  }

  if (ev.type === "step/delta") {
    if (!detail) return prev;
    const deltaKind = phaseKind(String(ev.data.phase || ev.data.tool || ""));
    let idx = -1;
    for (let i = prev.length - 1; i >= 0; i--) {
      if (prev[i].status !== "running") continue;
      if (!deltaKind || prev[i].kind === deltaKind) {
        idx = i;
        break;
      }
    }
    if (idx < 0) return prev;
    const cur = prev[idx];
    if (cur.detail === detail) return prev;
    return prev.map((x, i) => (i === idx ? { ...x, detail: clipDetail(detail, 4000) } : x));
  }

  if (kind && (ev.type === "step/start" || ev.type === "tool/call")) {
    const last = prev[prev.length - 1];
    if (last && last.kind === kind && last.status === "running") {
      return detail ? attachDetail(prev, kind, detail) : prev;
    }
    const custom = typeof ev.data.label === "string" ? ev.data.label.trim() : "";
    const tool = String(ev.data.tool || "");
    return [
      ...finishRunning(prev),
      {
        id: `${kind}-${ev.seq}`,
        kind,
        label: custom || (kind === "generate" && tool === "propose" ? "写提案" : LABEL[kind]),
        status: "running",
        ...(detail ? { detail } : {}),
      },
    ];
  }

  let next = prev;
  if (ev.type === "step/end" || ev.type === "tool/result" || ev.type === "accept/review") {
    next = finishRunning(next);
  }
  if (detail) next = attachDetail(next, attachKind(ev), detail);
  if (ev.type === "plan/write") {
    let reason = str(ev.data.reason);
    if (!reason || /回退为通过/.test(reason)) {
      const plan = planRecord(ev.data);
      reason = [
        str(plan.skillName) && `技能「${str(plan.skillName)}」匹配当前需求`,
        str(plan.notes),
        str(ev.data.brief) || "已对照检索结果",
        "待补齐用户字段后再出图",
      ]
        .filter(Boolean)
        .join("。");
    }
    next = attachDetail(next, "review", clipDetail(reason));
  }
  return next;
}

export function sealSandboxTrace(_items?: SandboxTraceItem[]): SandboxTraceItem[] {
  return sealReplyTrace("text");
}

export function sealGenerateTrace(_items?: SandboxTraceItem[], kind: "image" | "video" = "image"): SandboxTraceItem[] {
  return sealReplyTrace(kind);
}
