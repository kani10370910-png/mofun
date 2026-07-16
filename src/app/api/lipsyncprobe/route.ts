import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* 探测网关是否提供「对口型 / 数字人 / 语音驱动」类模型。
   服务端读自身环境变量（不暴露 key），拉 /v1/models 列表并按关键词筛。
   访问 /api/lipsyncprobe 查看结果，接完对口型管线后可删除本路由。 */

// 对口型 / 数字人 / talking-head 常见模型与能力关键词
const LIPSYNC_KW = [
  "lip", "sync", "lipsync", "talk", "talking", "avatar", "digital-human", "digitalhuman",
  "wav2lip", "sadtalker", "musetalk", "hallo", "sonic", "emo", "aniportrait", "echomimic",
  "omnihuman", "heygen", "dreamtalk", "video-retalking", "linly", "duix", "口型", "数字人", "对口",
];

export async function GET(_req: NextRequest) {
  const apiKey =
    process.env.VIDEO_API_KEY || process.env.IMAGE_API_KEY || process.env.OPENAI_API_KEY || "";
  const baseURL = (
    process.env.VIDEO_BASE_URL ||
    process.env.IMAGE_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    ""
  ).replace(/\/$/, "");

  if (!apiKey || !baseURL) {
    return Response.json(
      { ok: false, error: "缺少 VIDEO_API_KEY / VIDEO_BASE_URL（在 .env.local 配置）" },
      { status: 503 },
    );
  }

  let list: unknown = null;
  let status = 0;
  let raw = "";
  try {
    const res = await fetch(`${baseURL}/v1/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(30_000),
    });
    status = res.status;
    raw = await res.text();
    try {
      list = JSON.parse(raw);
    } catch {
      /* 非 JSON，保留 raw */
    }
  } catch (e) {
    return Response.json(
      { ok: false, baseURL, error: "拉取 /v1/models 失败", detail: String(e) },
      { status: 502 },
    );
  }

  // OpenAI 兼容格式：{ data: [{ id, ... }] }
  const models: string[] = Array.isArray((list as { data?: unknown })?.data)
    ? ((list as { data: Array<{ id?: string }> }).data.map((m) => m.id).filter(Boolean) as string[])
    : [];

  const lipsync = models.filter((id) => {
    const low = id.toLowerCase();
    return LIPSYNC_KW.some((kw) => low.includes(kw.toLowerCase()));
  });

  return Response.json({
    ok: true,
    baseURL,
    httpStatus: status,
    totalModels: models.length,
    lipsyncCount: lipsync.length,
    lipsyncModels: lipsync,
    // 没命中时给出全部模型 id，便于人工辨认命名不规范的对口型模型
    allModels: lipsync.length ? undefined : models,
    // models 为空时回传原始响应，便于排查（截断避免过大）
    rawSample: models.length ? undefined : raw.slice(0, 2000),
  });
}
