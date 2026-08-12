import { NextRequest } from "next/server";
import { retrieveKnowledge } from "@/lib/kbServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 按区县 + 查询检索知识库（调试 / 预览）。配了 WEKNORA 时 source 为 weknora。 */
export async function POST(req: NextRequest) {
  let body: { query?: string; regionId?: string; county?: string; topK?: number; useKB?: boolean };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "请求体解析失败" }, { status: 400 });
  }
  const kb = await retrieveKnowledge({
    useKB: body.useKB !== false,
    regionId: body.regionId,
    county: body.county,
    query: body.query,
    topK: body.topK,
  });
  if (!kb) return Response.json({ items: [], kbContext: "", county: "", regionId: "", source: "local" });
  return Response.json(kb);
}
