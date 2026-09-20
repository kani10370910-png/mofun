/**
 * 工具插件：对齐 dsh `core/tools` 的 scoped registry + 闸门执行。
 * 不引入 Cordis；把现有 propose/generate 登记为可替换插件。
 */
import { toolGenerate, toolPropose } from "@/lib/agent/tools/registry";
import type { GenerateGateOpts } from "@/lib/agent/gates";
import type { ExecuteResult } from "@/lib/agent/execute";
import type { AgentRuntimeState, ToolName } from "@/lib/agent/types";
import type { SessionLog } from "./session";
import { harnessToolEnabled } from "./prompt";

export type ToolPlugin = {
  name: ToolName;
  description: string;
  execute: (state: AgentRuntimeState, opts?: GenerateGateOpts) => Promise<ExecuteResult>;
};

const TOOL_PLUGINS: Record<string, ToolPlugin> = {
  generate: {
    name: "generate",
    description: "按当前 Skill 出图或出文案",
    execute: (state, opts) => toolGenerate(state, opts),
  },
  propose: {
    name: "propose",
    description: "按当前 Skill 生成方向提案",
    execute: (state) => toolPropose(state),
  },
};

export function getToolPlugin(name: ToolName): ToolPlugin | undefined {
  if ((name === "generate" || name === "propose") && !harnessToolEnabled(name)) return undefined;
  return TOOL_PLUGINS[name];
}

/** tools/pre-execute → execute → tools/post-execute，并写入 session 日志 */
export async function runToolPlugin(
  session: SessionLog,
  name: ToolName,
  state: AgentRuntimeState,
  opts?: GenerateGateOpts
): Promise<ExecuteResult> {
  const plugin = getToolPlugin(name);
  if (!plugin) {
    const miss: ExecuteResult = { ok: false, text: "", error: `未注册工具：${name}` };
    session.append("tool/result", { name, ok: false, error: miss.error });
    return miss;
  }
  session.append("tool/call", { name, skillId: state.skillId, specialistId: state.specialistId });
  const result = await plugin.execute(state, opts);
  session.append("tool/result", {
    name,
    ok: result.ok,
    error: result.error,
    imageCount: result.images?.length || 0,
    hasText: Boolean(result.text),
    text: (result.text || "").slice(0, 280),
    detail: result.ok
      ? result.images?.length
        ? `已产出 ${result.images.length} 张画面`
        : (result.text || "").trim().slice(0, 280)
      : result.error || "",
  });
  return result;
}
