/**
 * C · 工具：生成（经 D 闸门后再调现有 /api/generate · /api/image）
 */
import { assertCanGenerate, type GenerateGateOpts } from "../gates";
import { assembleContext } from "../context";
import { executeGenerate, type ExecuteResult } from "../execute";
import type { AgentRuntimeState } from "../types";

export async function toolGenerate(
  state: AgentRuntimeState,
  opts?: GenerateGateOpts
): Promise<ExecuteResult> {
  const gate = assertCanGenerate(state, opts);
  if (!gate.ok) {
    return { ok: false, text: "", error: gate.message };
  }
  void assembleContext(state);
  return executeGenerate(state, {
    refImage: opts?.refImage,
    skill: opts?.skill,
  });
}
