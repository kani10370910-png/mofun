import { NextRequest } from "next/server";
import { executeAgentWorkflow, type WorkflowInput } from "@/lib/workflow/execute";
import { fetchAgentByCode } from "@/lib/opsAgents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  let body: { code?: string; input?: WorkflowInput };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "请求体解析失败" }, { status: 400 });
  }
  const code = String(body.code || "").trim();
  if (!code) return Response.json({ error: "缺少智能体编码" }, { status: 400 });
  const agent = await fetchAgentByCode(code);
  if (!agent) {
    return Response.json(
      { error: `找不到智能体 ${code}。请确认运营 API（${process.env.NEXT_PUBLIC_OPS_API_BASE || "http://localhost:4100"}）已启动并已写入目录。` },
      { status: 404 },
    );
  }
  if (agent.status === "disabled") {
    return Response.json({ error: "智能体已停用" }, { status: 400 });
  }
  const origin = process.env.WORKFLOW_SELF_URL || req.nextUrl.origin;
  try {
    const result = await executeAgentWorkflow({
      agent,
      input: body.input || {},
      origin,
    });
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "工作流执行失败" }, { status: 500 });
  }
}
