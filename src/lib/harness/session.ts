/**
 * 对齐 DeepSeek Harness `core/session`：
 * Session 是追加式 SessionEvent 日志，是交互历史的单一事实源。
 * 模型可见内容必须先入日志（model-visible means logged）。
 * @see https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md
 */

export type SessionEventType =
  | "turn/start"
  | "turn/end"
  | "step/start"
  | "step/delta"
  | "step/end"
  | "user/message"
  | "assistant/message"
  | "skill/mount"
  | "tool/call"
  | "tool/result"
  | "plan/write"
  | "rag/retrieve"
  | "web/search"
  | "prompt/optimize"
  | "accept/review";

export type SessionEvent = {
  seq: number;
  type: SessionEventType;
  at: number;
  data: Record<string, unknown>;
};

export type SessionLog = {
  id: string;
  events: SessionEvent[];
  append: (type: SessionEventType, data?: Record<string, unknown>) => SessionEvent;
  subscribe: (fn: (ev: SessionEvent) => void) => () => void;
};

export function createSessionLog(id?: string): SessionLog {
  const events: SessionEvent[] = [];
  const listeners = new Set<(ev: SessionEvent) => void>();
  return {
    id: id || `sess-${Date.now().toString(36)}`,
    events,
    append(type, data = {}) {
      const ev: SessionEvent = {
        seq: events.length + 1,
        type,
        at: Date.now(),
        data,
      };
      events.push(ev);
      listeners.forEach((fn) => fn(ev));
      return ev;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}
