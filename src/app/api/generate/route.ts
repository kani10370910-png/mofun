import { NextRequest } from "next/server";
import { resolveProvider, buildMessages } from "@/lib/llm";
import type { GenerateRequest } from "@/lib/types";
import { generateKbQuery, hydrateKbFields } from "@/lib/kbServer";
import { agentCanRun, firstNodeModel, resolveAgentForGenerate, workflowHasKind, workflowOrigin } from "@/lib/opsAgents";
import { fetchOpsModelCreds, openaiCompatBase, opsApiKey } from "@/lib/opsModels";
import { executeAgentWorkflow } from "@/lib/workflow/execute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/* SSE 帮助：把一段文本封成 data 事件 */
function sse(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

function sseTextResponse(text: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(sse({ text })));
      controller.enqueue(encoder.encode(sse({ done: true })));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

export async function POST(req: NextRequest) {
  let body: GenerateRequest & { agentCode?: string; skipWorkflow?: boolean };
  try {
    body = (await req.json()) as GenerateRequest & { agentCode?: string; skipWorkflow?: boolean };
  } catch {
    return Response.json({ error: "请求体解析失败" }, { status: 400 });
  }

  const skipWorkflow =
    body.skipWorkflow === true ||
    body.scene === "studio-script-pro" ||
    body.scene === "studio-script" ||
    body.scene === "studio-shots" ||
    body.scene === "studio-shot-script";
  const agent = skipWorkflow ? null : await resolveAgentForGenerate(body.scene, body.agentCode);
  if (agentCanRun(agent, ["llm"])) {
    if (agent && workflowHasKind(agent.workflow, "kb") && body.useKB !== false) {
      body.useKB = true;
    }
    const messages = buildMessages(body);
    const systemHint = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
    const userText =
      messages.filter((m) => m.role === "user").map((m) => m.content).join("\n") || generateKbQuery(body);
    const result = await executeAgentWorkflow({
      agent,
      origin: workflowOrigin(req),
      input: {
        text: userText,
        systemHint,
        regionId: body.regionId,
        county: body.county,
        useKB: body.useKB,
      },
    });
    if (result.ok && result.text) return sseTextResponse(result.text);
    if (!result.ok) {
      return Response.json({ error: result.error || "工作流生成失败" }, { status: 502 });
    }
  }

  if (agent && workflowHasKind(agent.workflow, "kb") && body.useKB !== false) {
    body.useKB = true;
  }
  const llmModel = agent ? firstNodeModel(agent.workflow, "llm") : "";

  let provider;
  try {
    provider = resolveProvider(body.scene, llmModel || undefined);
    const ops = await fetchOpsModelCreds(llmModel || provider.model);
    const opsKey = opsApiKey(ops);
    if (opsKey) provider.apiKey = opsKey;
    if (ops?.base_url) provider.baseURL = openaiCompatBase(ops.base_url);
    if (ops?.code) provider.model = ops.code;
    if (!provider.apiKey) throw new Error("MISSING_API_KEY");
  } catch (e) {
    const msg = e instanceof Error && e.message === "MISSING_API_KEY"
      ? "运营端未配置该对话模型的 API 密钥：请在供应商列表或模型里填写后重试。"
      : "模型配置读取失败。";
    return Response.json({ error: msg }, { status: 503 });
  }

  body = await hydrateKbFields(body, generateKbQuery(body));
  const messages = buildMessages(body);
  const scriptScene =
    body.scene === "studio-script-pro" ||
    body.scene === "studio-script" ||
    body.scene === "studio-shots" ||
    body.scene === "studio-shot-script";

  // 调上游 OpenAI 兼容 /chat/completions（流式）
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), provider.timeoutMs);

  const url = `${provider.baseURL.replace(/\/$/, "")}/chat/completions`;
  const init: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model: provider.model,
      messages,
      stream: true,
      temperature: 0.8,
      enable_thinking: false,
      max_tokens: scriptScene ? 8192 : 2048,
    }),
    signal: ctrl.signal,
  };

  // 连接偶发被重置（ECONNRESET，常见于本机代理抖动）时自动重试，最多 3 次、退避递增
  let upstream: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      upstream = await fetch(url, init);
      break;
    } catch (e) {
      if ((e as Error)?.name === "AbortError" || attempt === 2) {
        clearTimeout(timer);
        return Response.json({ error: "无法连接模型服务，请检查网络或 baseURL 配置。" }, { status: 502 });
      }
      await new Promise((res) => setTimeout(res, 600 * (attempt + 1)));
    }
  }
  if (!upstream) {
    clearTimeout(timer);
    return Response.json({ error: "无法连接模型服务，请检查网络或 baseURL 配置。" }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    clearTimeout(timer);
    const detail = await upstream.text().catch(() => "");
    // 不回传密钥相关信息；只给出状态码与精简提示
    return Response.json(
      { error: `模型服务返回错误（${upstream.status}）。${detail.slice(0, 200)}` },
      { status: 502 }
    );
  }

  // 解析上游 SSE，仅提取 choices[].delta.content，重新封成简单的 {text} SSE 转发
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();
      let buf = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });

          // 上游以 \n\n 分隔事件
          const events = buf.split("\n\n");
          buf = events.pop() ?? "";
          for (const evt of events) {
            const line = evt.split("\n").find((l) => l.startsWith("data:"));
            if (!line) continue;
            const data = line.slice(5).trim();
            if (data === "[DONE]") {
              controller.enqueue(encoder.encode(sse({ done: true })));
              continue;
            }
            try {
              const json = JSON.parse(data);
              const delta = json?.choices?.[0]?.delta;
              const text = typeof delta?.content === "string" ? delta.content : "";
              if (text) controller.enqueue(encoder.encode(sse({ text })));
            } catch {
              // 跳过无法解析的中间帧
            }
          }
        }
        controller.enqueue(encoder.encode(sse({ done: true })));
      } catch {
        controller.enqueue(encoder.encode(sse({ error: "生成过程中断。" })));
      } finally {
        clearTimeout(timer);
        controller.close();
        reader.releaseLock();
      }
    },
    cancel() {
      clearTimeout(timer);
      ctrl.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
