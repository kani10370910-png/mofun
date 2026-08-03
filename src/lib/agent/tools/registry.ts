/**
 * C · ToolRegistry：对话框可调工具的统一入口
 * Skill = 流程手册；Tool = 外部能力（API）。二者不混用。
 */
import { toolPropose } from "./propose";
import { toolGenerate } from "./generate";
import {
  toolMemoryInjectSlots,
  toolMemoryPersistSlots,
  toolMemoryRead,
  toolMemoryWrite,
} from "./memory";
import type { GenerateGateOpts } from "../gates";
import type { ExecuteResult } from "../execute";
import type { AgentRuntimeState, ToolName } from "../types";
import type { BrandMemory } from "../memory";

export type ToolHandler = {
  name: ToolName;
  description: string;
};

export const TOOL_CATALOG: ToolHandler[] = [
  { name: "propose", description: "生成方向提案（/api/generate）" },
  { name: "generate", description: "出文案或文生图（须过闸门）" },
  { name: "memory_read", description: "读取品牌记忆（静态事实轨）" },
  { name: "memory_write", description: "写回品牌记忆（用户确认事实）" },
];

/** 兼容 HomeView：与历史 executePropose 同签名，内置闸门 */
export async function executePropose(state: AgentRuntimeState): Promise<ExecuteResult> {
  return toolPropose(state);
}

/** 兼容 HomeView：与历史 executeGenerate 同签名，内置闸门 */
export async function executeGenerate(
  state: AgentRuntimeState,
  opts?: GenerateGateOpts
): Promise<ExecuteResult> {
  return toolGenerate(state, opts);
}

export {
  toolPropose,
  toolGenerate,
  toolMemoryRead,
  toolMemoryWrite,
  toolMemoryInjectSlots,
  toolMemoryPersistSlots,
};

export type { BrandMemory, ExecuteResult, GenerateGateOpts };
