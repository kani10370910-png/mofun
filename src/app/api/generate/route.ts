import { NextRequest } from "next/server";
import { resolveProvider, buildMessages } from "@/lib/llm";
import type { GenerateRequest } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* SSE 帮助：把一段文本封成 data 事件 */
function sse(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

export async function POST(req: NextRequest) {
  let body: GenerateRequest;
  try {
    body = (await req.json()) as GenerateRequest;
  } catch {
    return Response.json({ error: "请求体解析失败" }, { status: 400 });
  }

  let provider;
  try {
    provider = resolveProvider();
  } catch (e) {
    const msg = e instanceof Error && e.message === "MISSING_API_KEY"
      ? "尚未配置模型 API Key：请在 .env.local 中填写 LLM_API_KEY 后重启服务。"
      : "模型配置读取失败。";
    return Response.json({ error: msg }, { status: 503 });
  }

  const messages = buildMessages(body);

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
              const delta = json?.choices?.[0]?.delta?.content;
              if (typeof delta === "string" && delta.length) {
                controller.enqueue(encoder.encode(sse({ text: delta })));
              }
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
