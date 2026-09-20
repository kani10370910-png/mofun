import { GENERATE_SCENE_AGENT, imageSceneAgent } from "@/lib/agentCodes";

export type WfKind = "start" | "end" | "llm" | "kb" | "vision" | "t2i" | "i2i" | "video" | "tts" | "tool";

export type WfNode = {
  id: string;
  type?: string;
  position?: { x: number; y: number };
  data?: { kind?: WfKind; modelCode?: string; prompt?: string; query?: string };
};

export type WorkflowDoc = { version?: number; nodes: WfNode[]; edges: { source: string; target: string }[] };

export type PublicAgent = {
  id: string;
  name: string;
  code: string;
  description: string;
  status: string;
  workflow: WorkflowDoc;
};

const TTL_MS = 30_000;
const cache = new Map<string, { at: number; agent: PublicAgent | null }>();

function opsBase() {
  return (process.env.OPS_API_BASE || process.env.NEXT_PUBLIC_OPS_API_BASE || "http://localhost:4100").replace(
    /\/$/,
    "",
  );
}

export async function fetchAgentByCode(code: string): Promise<PublicAgent | null> {
  const key = code.trim();
  if (!key) return null;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.agent;
  try {
    const r = await fetch(`${opsBase()}/public/agents/${encodeURIComponent(key)}`, {
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!r.ok) {
      cache.set(key, { at: Date.now(), agent: null });
      return null;
    }
    const agent = (await r.json()) as PublicAgent;
    cache.set(key, { at: Date.now(), agent });
    return agent;
  } catch {
    cache.set(key, { at: Date.now(), agent: null });
    return null;
  }
}

export function firstNodeModel(doc: WorkflowDoc | undefined, kind: WfKind): string {
  if (!doc?.nodes) return "";
  const hit = doc.nodes.find((n) => n.data?.kind === kind && n.data.modelCode);
  return String(hit?.data?.modelCode || "");
}

export function workflowHasKind(doc: WorkflowDoc | undefined, kind: WfKind): boolean {
  return Boolean(doc?.nodes?.some((n) => n.data?.kind === kind));
}

export function agentCanRun(agent: PublicAgent | null | undefined, kinds: WfKind[]): agent is PublicAgent {
  if (!agent || agent.status === "disabled") return false;
  return kinds.some((k) => workflowHasKind(agent.workflow, k));
}

export function workflowOrigin(req?: { nextUrl?: { origin?: string }; url?: string }) {
  const fromEnv = (process.env.WORKFLOW_SELF_URL || "").trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const fromNext = req?.nextUrl?.origin;
  if (fromNext) return fromNext.replace(/\/$/, "");
  try {
    return new URL(req?.url || "http://127.0.0.1:3000").origin.replace(/\/$/, "");
  } catch {
    return "http://127.0.0.1:3000";
  }
}

export async function resolveAgentForGenerate(scene?: string, agentCode?: string) {
  const code = (agentCode || (scene ? GENERATE_SCENE_AGENT[scene] : "") || "").trim();
  if (!code) return null;
  return fetchAgentByCode(code);
}

export async function resolveAgentForImage(opts: { scene?: string; agentCode?: string; hasImage?: boolean }) {
  const code = (opts.agentCode || imageSceneAgent(opts.scene, opts.hasImage) || "").trim();
  if (!code) return null;
  return fetchAgentByCode(code);
}
