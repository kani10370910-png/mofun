/** 首页对话：把上传的参考图交给视觉模型，得到可注入上下文的文字描述 */
export async function describeRefImages(images: string[]): Promise<string> {
  const list = images.filter(Boolean).slice(0, 4);
  if (!list.length) return "";

  const parts = await Promise.all(
    list.map(async (image, i) => {
      try {
        const r = await fetch("/api/vision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image,
            prompt:
              "请客观描述这张参考图的视觉要点（主体、构图、风格、色彩、字体/图形特征、可用于品牌或 Logo 设计的元素）。" +
              "80字以内，只输出描述本身，不要标题、不要前缀。",
          }),
        });
        const j = (await r.json().catch(() => ({}))) as { text?: string; error?: string };
        if (!r.ok || !j.text?.trim()) {
          return `参考图${i + 1}：（未能识别${j.error ? `，${j.error}` : ""}）`;
        }
        return `参考图${i + 1}：${j.text.trim()}`;
      } catch {
        return `参考图${i + 1}：（识别失败）`;
      }
    })
  );

  return parts.join("\n");
}
