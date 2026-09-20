import { NextRequest } from "next/server";
import { hydrateKbFields } from "@/lib/kbServer";
import { AGENT } from "@/lib/agentCodes";
import { agentCanRun, fetchAgentByCode, firstNodeModel, workflowOrigin } from "@/lib/opsAgents";
import { executeAgentWorkflow } from "@/lib/workflow/execute";
import { fetchOpsModelCreds, openaiCompatBase, opsApiKey } from "@/lib/opsModels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* 多模态视觉理解：OpenAI 兼容的 /chat/completions（messages 里带 image_url）。
   用于「IP故事」根据图片识别 IP 形象描述。

   走视觉网关（默认复用图像网关 anyfast 的 Key/BaseURL，可用 VISION_* 覆盖）：
   - VISION_API_KEY  | 回退 IMAGE_API_KEY
   - VISION_BASE_URL | 回退 IMAGE_BASE_URL
   - VISION_MODEL    | 默认 doubao-seed-1-6-vision-250815（豆包视觉）

   入参：{ image: string(URL 或 data URL), prompt?: string }
   返回：{ text: string } —— 模型对图片的文字描述。 */
export async function POST(req: NextRequest) {
  let body: {
    image?: string;
    prompt?: string;
    agentCode?: string;
    useKB?: boolean;
    regionId?: string;
    county?: string;
    kbContext?: string;
    skipWorkflow?: boolean;
    model?: string;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "请求体解析失败" }, { status: 400 });
  }

  const image = (body.image || "").trim();
  if (!image) return Response.json({ error: "缺少图片" }, { status: 400 });

  const visAgent = await fetchAgentByCode(body.agentCode || AGENT.activityI2t);
  if (!body.skipWorkflow && agentCanRun(visAgent, ["vision"])) {
    const result = await executeAgentWorkflow({
      agent: visAgent,
      origin: workflowOrigin(req),
      input: {
        text: body.prompt,
        image,
        useKB: body.useKB,
        regionId: body.regionId,
        county: body.county,
        modelOverride: body.model,
      },
    });
    if (result.ok && result.text) return Response.json({ text: result.text });
    if (!result.ok) return Response.json({ error: result.error || "工作流视觉理解失败" }, { status: 502 });
  }

  let visionModel = process.env.VISION_MODEL || "doubao-seed-1-6-vision-250815";
  const bound = firstNodeModel(visAgent?.workflow, "vision");
  if (body.model) visionModel = body.model;
  else if (bound) visionModel = bound;
  const model = visionModel;
  const creds = await fetchOpsModelCreds(model);
  const apiKey = opsApiKey(creds, process.env.VISION_API_KEY || process.env.IMAGE_API_KEY || "");
  const baseURL = openaiCompatBase(creds?.base_url || process.env.VISION_BASE_URL || process.env.IMAGE_BASE_URL || "https://www.anyfast.com.cn/v1");
  if (!apiKey) {
    return Response.json(
      { error: "运营端未配置该视觉模型的 API 密钥：请在供应商列表或模型里填写后重试。" },
      { status: 503 },
    );
  }
  const timeoutMs = Number(process.env.VISION_TIMEOUT_MS || 60000);

  let prompt =
    body.prompt?.trim() ||
    "请用一段话客观描述这张图里的IP/卡通形象的外观特征（造型、配色、服饰、表情、标志性元素、风格定位等），" +
      "便于据此撰写IP故事。80字以内，只输出描述本身，不要标题、不要换行。";
  if (body.useKB) {
    body = await hydrateKbFields(body, prompt);
    const county = (body.county || "").trim();
    const kb = (body.kbContext || "").trim();
    prompt +=
      `\n【区县语境${county ? `·${county}` : ""}】在不违背「忠于原图」的前提下，可自然融入区县风貌与物产表述；` +
      `颜色、手持物与图中没有的主体一律不得臆造。` +
      (kb ? `\n参考资料：\n${kb}` : "");
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  const init: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: image } },
          ],
        },
      ],
      temperature: 0.5,
      stream: false,
    }),
    signal: ctrl.signal,
  };

  // 连接偶发被重置（ECONNRESET，常见于本机代理抖动）时自动重试，最多 3 次、退避递增
  let upstream: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      upstream = await fetch(`${baseURL}/chat/completions`, init);
      break;
    } catch (e) {
      if ((e as Error)?.name === "AbortError" || attempt === 2) {
        clearTimeout(timer);
        return Response.json({ error: "无法连接视觉模型服务，请检查网络或 VISION_BASE_URL。" }, { status: 502 });
      }
      await new Promise((res) => setTimeout(res, 600 * (attempt + 1)));
    }
  }
  clearTimeout(timer);
  if (!upstream) {
    return Response.json({ error: "无法连接视觉模型服务，请检查网络或 VISION_BASE_URL。" }, { status: 502 });
  }

  const raw = await upstream.text();
  if (!upstream.ok) {
    return Response.json(
      { error: `视觉模型服务返回错误（${upstream.status}）。${raw.slice(0, 300)}` },
      { status: 502 },
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return Response.json({ error: "视觉模型返回解析失败。" }, { status: 502 });
  }

  const text =
    (json as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message?.content || "";
  if (!text.trim()) {
    return Response.json({ error: "视觉模型未返回描述。" }, { status: 502 });
  }
  return Response.json({ text: text.trim() });
}
