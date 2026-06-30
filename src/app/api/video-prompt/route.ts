import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* 根据用户的简短视频描述，优化为适合视频生成模型的专业提示词。
   入参：{ input: string }
   返回：{ text: string | null } */

export async function POST(req: NextRequest) {
  const { input } = (await req.json()) as { input?: string };
  if (!input?.trim()) return Response.json({ text: null }, { status: 400 });

  const apiKey = process.env.IMAGE_API_KEY || process.env.LLM_API_KEY || "";
  const baseURL = (process.env.IMAGE_BASE_URL || process.env.LLM_BASE_URL || "").replace(/\/$/, "");
  const model = process.env.LLM_MODEL || "qwen3-max-2026-01-23";

  if (!apiKey || !baseURL) return Response.json({ text: null }, { status: 503 });

  const r = await fetch(`${baseURL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "你是一名专业的中文视频画面描述生成助手，服务于县域农业宣传、文化旅游、农旅融合等场景的短视频制作。\n" +
            "你的任务是：根据用户的简短输入，扩写成一段高质量的中文视频生成提示词，直接送入文生视频模型使用。\n\n" +
            "【扩写规则】\n" +
            "1. 输出为纯中文，不包含任何英文单词或标点符号。\n" +
            "2. 视频提示词的核心逻辑是镜头叙事，描述必须包含以下要素：\n" +
            "   主体内容：画面核心主体、场景环境、人物或物体的状态与动作；\n" +
            "   镜头运动：具体运镜方式（如航拍俯瞰缓缓推近、低机位仰拍慢速平移、手持跟拍、环绕镜头等）；\n" +
            "   光线氛围：光线类型与时段（如晨光逆光暖色调、黄金时刻侧光、阴天漫射柔光、夕阳金色逆光）；\n" +
            "   画面质感：技术规格与风格（如电影质感、浅景深虚化背景、4K超高清、慢动作升格）。\n" +
            "3. 按以下顺序组织内容，各部分用逗号连接，输出为一段连贯描述：\n" +
            "   场景环境与整体氛围 → 主体内容与动态细节 → 镜头运动方式 → 光线与色调 → 景深与构图 → 画面质感与风格 → 情绪基调。\n" +
            "4. 镜头运动必须具体，禁止使用「镜头移动」「画面变化」等模糊表述，须写明具体运镜名称。\n" +
            "5. 情绪基调须与主题匹配：农业类偏质朴温暖，旅游类偏壮阔诗意，人文类偏细腻沉静。\n" +
            "6. 若用户描述中含有地名、产品名或活动名，保留原文并作为画面核心主体突出呈现。\n" +
            "7. 不输出任何解释、标签或说明性语言，只输出最终画面描述段落。\n" +
            "8. 长度控制在一百八十字至二百二十字之间。",
        },
        { role: "user", content: input.trim() },
      ],
      max_tokens: 400,
      stream: false,
      enable_thinking: false,
    }),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);

  if (!r?.ok) return Response.json({ text: null });

  const data = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content?.trim() ?? null;
  return Response.json({ text });
}
