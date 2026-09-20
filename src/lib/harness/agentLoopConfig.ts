/**
 * 对齐 DeepSeek Harness `@deepseek-ai/dsh-agent-loop`：
 * Agent 循环是可插拔驱动器。运营端启用/停用、选驱动器、开关 step 插件。
 * 循环本身只负责 turn/step；分析/检索/审查/问卷举例/优化/验收都是可拔掉的监听。
 */
export type AgentLoopDriver = "xiaomo-cycle" | "llm-tools";
export type AgentLoopEffort = "low" | "medium" | "high";

export type AgentLoopSteps = {
  analyze: boolean;
  rag: boolean;
  web: boolean;
  review: boolean;
  quizExamples: boolean;
  optimize: boolean;
  accept: boolean;
  sandboxTrace: boolean;
};

export type AgentLoopConfig = {
  enabled: boolean;
  driver: AgentLoopDriver;
  maxParallelToolCalls: number;
  reasoningEffort: AgentLoopEffort;
  steps: AgentLoopSteps;
};

export const DEFAULT_AGENT_LOOP_STEPS: AgentLoopSteps = {
  analyze: true,
  rag: true,
  web: true,
  review: true,
  quizExamples: true,
  optimize: true,
  accept: true,
  sandboxTrace: true,
};

export const DEFAULT_AGENT_LOOP: AgentLoopConfig = {
  enabled: true,
  driver: "xiaomo-cycle",
  maxParallelToolCalls: 1,
  reasoningEffort: "high",
  steps: { ...DEFAULT_AGENT_LOOP_STEPS },
};

function flag(v: unknown, fallback: boolean) {
  if (v === false || v === "false" || v === 0) return false;
  if (v === true || v === "true" || v === 1) return true;
  return fallback;
}

function parseDriver(v: unknown): AgentLoopDriver {
  return v === "llm-tools" ? "llm-tools" : "xiaomo-cycle";
}

function parseEffort(v: unknown): AgentLoopEffort {
  if (v === "low" || v === "medium" || v === "high") return v;
  return "high";
}

function parseSteps(raw: unknown): AgentLoopSteps {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    analyze: flag(src.analyze, true),
    rag: flag(src.rag, true),
    web: flag(src.web, true),
    review: flag(src.review, true),
    quizExamples: flag(src.quizExamples, true),
    optimize: flag(src.optimize, true),
    accept: flag(src.accept, true),
    sandboxTrace: flag(src.sandboxTrace, true),
  };
}

export function parseAgentLoop(extra: Record<string, unknown> | undefined, mounted: boolean): AgentLoopConfig {
  if (!mounted) {
    return {
      ...DEFAULT_AGENT_LOOP,
      enabled: false,
      driver: "llm-tools",
      steps: {
        analyze: false,
        rag: false,
        web: false,
        review: false,
        quizExamples: false,
        optimize: false,
        accept: false,
        sandboxTrace: false,
      },
    };
  }
  const n = Number(extra?.maxParallelToolCalls);
  return {
    enabled: true,
    driver: parseDriver(extra?.driver),
    maxParallelToolCalls: Number.isFinite(n) && n >= 1 ? Math.min(10, Math.floor(n)) : 1,
    reasoningEffort: parseEffort(extra?.reasoningEffort),
    steps: parseSteps(extra?.steps),
  };
}

