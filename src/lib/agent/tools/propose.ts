/**
 * C · 工具：提案（薄封装现有 /api/generate 路径）
 * 实际 LLM 调用仍在 execute.ts，保持生成效果不变。
 */
import { assertCanPropose } from "../gates";
import { assembleContext } from "../context";
import { executePropose, type ExecuteResult } from "../execute";
import type { AgentRuntimeState } from "../types";

export async function toolPropose(state: AgentRuntimeState): Promise<ExecuteResult> {
  const gate = assertCanPropose(state);
  if (!gate.ok) {
    return { ok: false, text: "", error: gate.message };
  }
  // 装配上下文供调试 / 未来路由；本轮不改 execute prompt，保生成效果
  void assembleContext(state);
  return executePropose(state);
}
