import { NextRequest } from "next/server";
import {
  modelSupportsCountyLora,
  resolveImageModelId,
  QWEN_I2I_LOCAL,
  QWEN_T2I_LOCAL,
} from "@/lib/imageModelCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* 文生图：OpenAI 兼容的 /images/generations（AnyFast / ComfyUI 网关等）。
   读 IMAGE_API_KEY / IMAGE_BASE_URL / IMAGE_MODEL，密钥不进前端。
   Qwen 本地通道可用 COUNTY_IMAGE_MODEL / COUNTY_EDIT_IMAGE_MODEL（或 QWEN_T2I_MODEL / QWEN_I2I_MODEL）覆盖。
   返回 { images: string[] }，元素为图片 URL 或 data URL。 */
export async function POST(req: NextRequest) {
  let body: {
    prompt?: string;
    size?: string;
    n?: number;
    model?: string;
    image?: string | string[];
    lora?: { id?: string; name?: string; strength?: number }[];
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "请求体解析失败" }, { status: 400 });
  }

  let prompt = (body.prompt || "").trim();
  if (!prompt) return Response.json({ error: "缺少 prompt" }, { status: 400 });

  const apiKey = process.env.IMAGE_API_KEY || "";
  if (!apiKey) {
    return Response.json(
      { error: "尚未配置文生图 API Key：请在 .env.local 填写 IMAGE_API_KEY 后重启服务。" },
      { status: 503 },
    );
  }
  const baseURL = (process.env.IMAGE_BASE_URL || "https://www.anyfast.ai/v1").replace(/\/$/, "");
  const timeoutMs = Number(process.env.IMAGE_TIMEOUT_MS || 120000);
  const envModel = process.env.IMAGE_MODEL || "dall-e-3"; // 平台默认模型（一定有通道）

  function resolveUpstream(requested?: string): string {
    if (!requested) return envModel;
    const id = resolveImageModelId(requested) || requested;
    if (modelSupportsCountyLora(requested)) {
      // 文生 / 图生 UI 同名「MoFun区域文化大模型」：有参考图或旧图生别名 → 图生通道
      const isI2i =
        Boolean(body.image) ||
        id === QWEN_I2I_LOCAL ||
        requested === "Qwen 图生图" ||
        requested.includes("图生图") ||
        requested === "区县编辑模型" ||
        requested === "县域编辑模型" ||
        requested === "基础编辑模型";
      if (isI2i) {
        return process.env.COUNTY_EDIT_IMAGE_MODEL || process.env.QWEN_I2I_MODEL || QWEN_I2I_LOCAL;
      }
      return process.env.COUNTY_IMAGE_MODEL || process.env.QWEN_T2I_MODEL || QWEN_T2I_LOCAL;
    }
    return id;
  }
  const reqModel = resolveUpstream(body.model);

  // 调用上游文生图；连接抖动（ECONNRESET，常见于本机代理）自动重试至多 3 次、退避递增。
  async function callImage(modelId: string): Promise<{ res: Response; text: string } | { err: string; status: number }> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const init: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: modelId,
        prompt,
        n: body.n || 1,
        // 豆包 Seedream 等模型要求图片不小于约 369 万像素（1920×1920），默认用 2048 见方
        size: body.size || "2048x2048",
        // 图生图：传参考图（公网 URL）保持一致性；不传则纯文生图。
        ...(body.image ? { image: body.image } : {}),
        ...(body.lora?.length ? { lora: body.lora } : {}),
      }),
      signal: ctrl.signal,
    };
    let upstream: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        upstream = await fetch(`${baseURL}/images/generations`, init);
        break;
      } catch (e) {
        if ((e as Error)?.name === "AbortError" || attempt === 2) {
          clearTimeout(timer);
          return { err: "无法连接文生图服务，请检查网络或 IMAGE_BASE_URL。", status: 502 };
        }
        await new Promise((res) => setTimeout(res, 600 * (attempt + 1)));
      }
    }
    clearTimeout(timer);
    if (!upstream) return { err: "无法连接文生图服务，请检查网络或 IMAGE_BASE_URL。", status: 502 };
    return { res: upstream, text: await upstream.text() };
  }

  // 「无可用通道」判定：聚合网关上游临时忙/掉线/限流时返回，多为瞬时状态
  const isNoChannel = (t: string) => {
    const low = t.toLowerCase();
    return low.includes("model_not_found") || low.includes("no available channel") || low.includes("no_available");
  };

  let call = await callImage(reqModel);
  if ("err" in call) return Response.json({ error: call.err }, { status: call.status });
  // ① 瞬时「无可用通道」→ 退避重试同一模型至多 3 次（并发批量时常因上游瞬时紧张全失败，退避几秒多半恢复）
  for (let i = 0; i < 3 && !call.res.ok && isNoChannel(call.text); i++) {
    await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    const retry = await callImage(reqModel);
    if (!("err" in retry)) call = retry;
  }
  // ② 仍是「无可用通道」且指定了具体模型 → 退回平台默认模型再试一次（默认模型通道最稳）
  if (!call.res.ok && body.model && reqModel !== envModel && isNoChannel(call.text)) {
    const retry = await callImage(envModel);
    if (!("err" in retry)) call = retry;
  }
  const { res: upstream, text } = call;

  if (!upstream.ok) {
    const low = text.toLowerCase();
    // 内容审核拦截 → 友好中文提示；其它错误保留原文（截断）
    const sensitive = low.includes("sensitive") || low.includes("敏感") || low.includes("policy") || low.includes("content_detected");
    const friendly = sensitive
      ? "生成内容可能含敏感信息，已被模型内容审核拦截。请修改描述或元素名称后重试（避免政治、国旗、领导人、暴力等敏感内容）。"
      : `文生图服务返回错误（${upstream.status}）。${text.slice(0, 200)}`;
    return Response.json({ error: friendly }, { status: 502 });
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return Response.json({ error: "文生图返回解析失败。" }, { status: 502 });
  }

  // 兼容 OpenAI 格式：data[].url 或 data[].b64_json
  const data = (json as { data?: Array<{ url?: string; b64_json?: string }> })?.data || [];
  const images = data
    .map((d) => (d.url ? d.url : d.b64_json ? `data:image/png;base64,${d.b64_json}` : ""))
    .filter(Boolean);

  if (!images.length) {
    return Response.json({ error: "文生图未返回图片。" }, { status: 502 });
  }
  return Response.json({ images });
}
