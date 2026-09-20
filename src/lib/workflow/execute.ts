import { applyKbToImagePrompt, retrieveKnowledge, type KbRetrieveResult } from "@/lib/kbServer";
import { resolveProvider } from "@/lib/llm";
import { firstNodeModel, workflowHasKind, type PublicAgent, type WfKind, type WorkflowDoc } from "@/lib/opsAgents";
import { fetchOpsModelCreds, openaiCompatBase, opsApiKey } from "@/lib/opsModels";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type WorkflowInput = {
  text?: string;
  image?: string | string[];
  tailImage?: string;
  video?: string;
  regionId?: string;
  county?: string;
  voice?: string;
  useKB?: boolean;
  systemHint?: string;
  size?: string;
  n?: number;
  modelOverride?: string;
  ratio?: string;
  dur?: string;
  quality?: string;
  generateAudio?: boolean;
  useLora?: boolean;
  lora?: { id?: string; name?: string; strength?: number }[];
  referenceImageUrl?: string;
  referenceImageUrls?: string[];
  audioUrl?: string;
  audioUrls?: string[];
  resolution?: string;
};

export type WorkflowLog = { nodeId: string; kind: string; ok: boolean; detail: string };

export type WorkflowResult = {
  ok: boolean;
  code: string;
  name: string;
  text: string;
  image: string;
  images: string[];
  video: string;
  audio: string;
  frames: { first?: string; last?: string };
  kbContext: string;
  logs: WorkflowLog[];
  clientActions: { tool: string; prompt?: string }[];
  error?: string;
};

function interpolate(tpl: string, vars: Record<string, string>): string {
  return String(tpl || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => vars[key] ?? "");
}

function topoOrder(doc: WorkflowDoc): string[] {
  const ids = doc.nodes.map((n) => n.id);
  const incoming = new Map(ids.map((id) => [id, 0]));
  const outs = new Map(ids.map((id) => [id, [] as string[]]));
  for (const edge of doc.edges || []) {
    if (!incoming.has(edge.target) || !outs.has(edge.source)) continue;
    incoming.set(edge.target, (incoming.get(edge.target) || 0) + 1);
    outs.get(edge.source)!.push(edge.target);
  }
  const queue = ids.filter((id) => incoming.get(id) === 0);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const t of outs.get(id) || []) {
      incoming.set(t, (incoming.get(t) || 1) - 1);
      if (incoming.get(t) === 0) queue.push(t);
    }
  }
  return order.length === ids.length ? order : ids;
}

async function chatText(modelCode: string | undefined, system: string, user: string): Promise<string> {
  const provider = resolveProvider(modelCode === "deepseek-v4-pro" ? "studio-shots" : undefined);
  if (modelCode) provider.model = modelCode;
  const ops = await fetchOpsModelCreds(modelCode || provider.model);
  const opsKey = opsApiKey(ops);
  if (opsKey) provider.apiKey = opsKey;
  if (ops?.base_url) provider.baseURL = openaiCompatBase(ops.base_url);
  if (ops?.code) provider.model = ops.code;
  if (!provider.apiKey) throw new Error("运营端未配置该对话模型的 API 密钥");
  const url = `${provider.baseURL.replace(/\/$/, "")}/chat/completions`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.apiKey}` },
    body: JSON.stringify({
      model: provider.model,
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content: user },
      ],
      temperature: 0.7,
      stream: false,
    }),
    signal: AbortSignal.timeout(provider.timeoutMs),
  });
  const j = (await r.json().catch(() => ({}))) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  if (!r.ok) {
    const where = (() => {
      try {
        return new URL(url).host;
      } catch {
        return "上游";
      }
    })();
    throw new Error(j.error?.message || `LLM 失败（${r.status}，${where}）`);
  }
  return String(j.choices?.[0]?.message?.content || "").trim();
}

async function genImage(opts: {
  origin: string;
  prompt: string;
  model?: string;
  image?: string | string[];
  size?: string;
  n?: number;
  regionId?: string;
  county?: string;
  useLora?: boolean;
  lora?: WorkflowInput["lora"];
}): Promise<string[]> {
  const r = await fetch(`${opts.origin}/api/image`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: opts.prompt,
      skipWorkflow: true,
      n: opts.n || 1,
      size: opts.size || "2048x2048",
      useKB: false,
      ...(opts.model ? { model: opts.model } : {}),
      ...(opts.image ? { image: opts.image } : {}),
      ...(opts.regionId ? { regionId: opts.regionId } : {}),
      ...(opts.county ? { county: opts.county } : {}),
      ...(opts.useLora ? { useLora: true } : {}),
      ...(opts.lora?.length ? { lora: opts.lora } : {}),
    }),
    signal: AbortSignal.timeout(Number(process.env.IMAGE_TIMEOUT_MS || 120000)),
  });
  const j = (await r.json().catch(() => ({}))) as { images?: string[]; error?: string };
  if (!r.ok || !j.images?.length) throw new Error(j.error || `文生图失败（${r.status}）`);
  return j.images;
}

async function genVision(origin: string, image: string, prompt: string, model?: string): Promise<string> {
  const r = await fetch(`${origin}/api/vision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image,
      prompt,
      skipWorkflow: true,
      useKB: false,
      ...(model ? { model } : {}),
    }),
    signal: AbortSignal.timeout(Number(process.env.VISION_TIMEOUT_MS || 60000)),
  });
  const j = (await r.json().catch(() => ({}))) as { text?: string; error?: string };
  if (!r.ok || !j.text) throw new Error(j.error || `视觉理解失败（${r.status}）`);
  return j.text;
}

async function genTts(text: string, voice?: string): Promise<string> {
  const appid = process.env.VOLC_TTS_APPID || "";
  const token = process.env.VOLC_TTS_TOKEN || "";
  if (!appid || !token) throw new Error("尚未配置 VOLC_TTS_APPID / VOLC_TTS_TOKEN");
  const payload = {
    app: { appid, token, cluster: process.env.VOLC_TTS_CLUSTER || "volcano_tts" },
    user: { uid: "mofun-workflow" },
    audio: {
      voice_type: voice || "zh_female_shuangkuaisisi_moon_bigtts",
      encoding: "mp3",
      speed_ratio: 1,
    },
    request: {
      reqid: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text: text.slice(0, 500),
      operation: "query",
    },
  };
  const r = await fetch("https://openspeech.bytedance.com/api/v1/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer;${token}` },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(Number(process.env.TTS_TIMEOUT_MS || 30000)),
  });
  const j = (await r.json().catch(() => ({}))) as { code?: number; message?: string; data?: string };
  if (j.code === 3000 && j.data) return `data:audio/mpeg;base64,${j.data}`;
  throw new Error(j.message || "语音合成失败");
}

async function genVideo(opts: {
  origin: string;
  prompt: string;
  model?: string;
  image?: string;
  tailImage?: string;
  ratio?: string;
  dur?: string;
  quality?: string;
  generateAudio?: boolean;
  referenceImageUrl?: string;
  referenceImageUrls?: string[];
  audioUrl?: string;
  audioUrls?: string[];
  resolution?: string;
}): Promise<string> {
  const r = await fetch(`${opts.origin}/api/video`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: opts.prompt,
      ratio: opts.ratio || "16:9",
      dur: opts.dur || "5秒",
      model: opts.model || process.env.VIDEO_MODEL || "seedance-1.5-pro",
      generateAudio: opts.generateAudio !== false,
      quality: opts.quality || "720P",
      skipWorkflow: true,
      ...(opts.image ? { imageUrl: opts.image } : {}),
      ...(opts.tailImage ? { tailImageUrl: opts.tailImage } : {}),
      ...(opts.referenceImageUrl ? { referenceImageUrl: opts.referenceImageUrl } : {}),
      ...(opts.referenceImageUrls?.length ? { referenceImageUrls: opts.referenceImageUrls } : {}),
      ...(opts.audioUrl ? { audioUrl: opts.audioUrl } : {}),
      ...(opts.audioUrls?.length ? { audioUrls: opts.audioUrls } : {}),
      ...(opts.resolution ? { resolution: opts.resolution } : {}),
    }),
    signal: AbortSignal.timeout(450_000),
  });
  const j = (await r.json().catch(() => ({}))) as { videoUrl?: string; error?: string };
  if (!r.ok || !j.videoUrl) throw new Error(j.error || `视频生成失败（${r.status}）`);
  return j.videoUrl;
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { windowsHide: true });
    let err = "";
    child.stderr.on("data", (d) => {
      err += String(d);
    });
    child.on("error", (e) => reject(e));
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(err.slice(-400) || `ffmpeg ${code}`))));
  });
}

async function extractVideoFrames(videoUrl: string): Promise<{ first?: string; last?: string }> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mofun-wf-"));
  const src = path.join(tmp, "in.bin");
  const first = path.join(tmp, "first.jpg");
  const last = path.join(tmp, "last.jpg");
  try {
    const r = await fetch(videoUrl, { signal: AbortSignal.timeout(60000) });
    if (!r.ok) throw new Error("下载视频失败");
    fs.writeFileSync(src, Buffer.from(await r.arrayBuffer()));
    await runFfmpeg(["-y", "-i", src, "-frames:v", "1", "-q:v", "2", first]);
    await runFfmpeg(["-y", "-sseof", "-0.1", "-i", src, "-frames:v", "1", "-q:v", "2", last]);
    const toData = (p: string) =>
      fs.existsSync(p) ? `data:image/jpeg;base64,${fs.readFileSync(p).toString("base64")}` : "";
    return { first: toData(first), last: toData(last) };
  } finally {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

function toolName(prompt: string): string {
  const p = prompt || "";
  if (/首尾帧|抽帧/.test(p)) return "extractFrames";
  if (/抠图/.test(p)) return "cutout";
  if (/增强转矢量|pro/.test(p)) return "vectorPro";
  if (/基础转矢量|基础/.test(p)) return "vectorBasic";
  if (/矢量/.test(p)) return "vector";
  if (/合成/.test(p)) return "merge";
  return "tool";
}

export async function executeAgentWorkflow(opts: {
  agent: PublicAgent;
  input: WorkflowInput;
  origin: string;
}): Promise<WorkflowResult> {
  const { agent, input, origin } = opts;
  const doc = agent.workflow || { nodes: [], edges: [] };
  const logs: WorkflowLog[] = [];
  const clientActions: { tool: string; prompt?: string }[] = [];
  const firstImage = Array.isArray(input.image) ? input.image[0] || "" : input.image || "";
  const ctx = {
    text: input.text || "",
    image: firstImage,
    tailImage: input.tailImage || "",
    video: input.video || "",
    audio: "",
    kbContext: "",
    images: [] as string[],
    frames: {} as { first?: string; last?: string },
  };
  let kbResult: KbRetrieveResult | null = null;
  const vars = () => ({
    user_input: ctx.text,
    theme: ctx.text,
    brief: ctx.text,
    script: ctx.text,
    shot_prompt: ctx.text,
    creativeDesc: ctx.text,
    kb: ctx.kbContext,
  });

  const order = topoOrder(doc);
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));

  for (const id of order) {
    const node = byId.get(id);
    const kind = (node?.data?.kind || "") as WfKind;
    if (!node || kind === "start" || kind === "end") continue;
    const prompt = interpolate(node.data?.prompt || "", vars());
    const query = interpolate(node.data?.query || "", vars());
    const bound = node.data?.modelCode || "";
    const model =
      (kind === "t2i" || kind === "i2i" || kind === "video" || kind === "vision" || kind === "tts") && input.modelOverride
        ? input.modelOverride
        : bound;
    try {
      if (kind === "kb") {
        if (input.useKB === false) {
          logs.push({ nodeId: id, kind, ok: true, detail: "用户关闭知识库，已跳过" });
          continue;
        }
        kbResult = await retrieveKnowledge({
          useKB: true,
          regionId: input.regionId,
          county: input.county,
          query: query || ctx.text || "区县特色",
        });
        ctx.kbContext = kbResult?.kbContext || "";
        logs.push({ nodeId: id, kind, ok: true, detail: ctx.kbContext ? `检索到 ${kbResult?.items?.length || 0} 条` : "无命中（本地/远程知识库为空）" });
        continue;
      }
      if (kind === "llm") {
        const sys = [prompt, input.systemHint].filter(Boolean).join("\n\n") || "你是魔方智绘工作流助手，用中文简洁输出。";
        const user = ctx.kbContext
          ? `${ctx.text || "请根据节点指令生成内容"}\n【知识库】\n${ctx.kbContext}`
          : ctx.text || "请根据节点指令生成内容";
        const out = await chatText(model, sys, user);
        ctx.text = out || ctx.text;
        logs.push({ nodeId: id, kind, ok: true, detail: `输出 ${ctx.text.length} 字` });
        continue;
      }
      if (kind === "vision") {
        if (!ctx.image) throw new Error("视觉理解需要参考图");
        ctx.text = await genVision(
          origin,
          ctx.image,
          [prompt, ctx.text].filter(Boolean).join("\n") || "请描述这张图",
          model,
        );
        logs.push({ nodeId: id, kind, ok: true, detail: `识别 ${ctx.text.length} 字` });
        continue;
      }
      if (kind === "t2i" || kind === "i2i") {
        const raw = [prompt, ctx.text].filter(Boolean).join("。");
        if (!raw) throw new Error("缺少出图提示词");
        const p = applyKbToImagePrompt(raw, kbResult);
        const imgs = await genImage({
          origin,
          prompt: p,
          model,
          image: kind === "i2i" ? ctx.image || input.image : input.image || ctx.image || undefined,
          size: input.size,
          n: input.n,
          regionId: input.regionId,
          county: input.county,
          useLora: input.useLora,
          lora: input.lora,
        });
        if (!imgs[0]) throw new Error("未返回图片");
        ctx.image = imgs[0];
        ctx.images.push(...imgs);
        logs.push({ nodeId: id, kind, ok: true, detail: `出图 ${imgs.length} 张` });
        continue;
      }
      if (kind === "video") {
        ctx.video = await genVideo({
          origin,
          prompt: prompt || ctx.text,
          model,
          image: ctx.image || firstImage,
          tailImage: ctx.tailImage || input.tailImage,
          ratio: input.ratio,
          dur: input.dur,
          quality: input.quality,
          generateAudio: input.generateAudio,
          referenceImageUrl: input.referenceImageUrl,
          referenceImageUrls: input.referenceImageUrls,
          audioUrl: input.audioUrl,
          audioUrls: input.audioUrls,
          resolution: input.resolution,
        });
        logs.push({ nodeId: id, kind, ok: true, detail: "视频已生成" });
        continue;
      }
      if (kind === "tts") {
        const t = (ctx.text || prompt).slice(0, 500);
        if (!t) throw new Error("缺少配音文本");
        ctx.audio = await genTts(t, input.voice);
        logs.push({ nodeId: id, kind, ok: true, detail: "配音已生成" });
        continue;
      }
      if (kind === "tool") {
        const tool = toolName(prompt);
        if (tool === "extractFrames") {
          const src = ctx.video || input.video;
          if (!src) throw new Error("提取首尾帧需要视频地址");
          ctx.frames = await extractVideoFrames(src);
          if (ctx.frames.first) ctx.image = ctx.frames.first;
          logs.push({ nodeId: id, kind, ok: true, detail: ctx.frames.last ? "已提取首尾帧" : "已提取首帧" });
        } else {
          clientActions.push({ tool, prompt });
          logs.push({
            nodeId: id,
            kind,
            ok: true,
            detail:
              tool === "cutout"
                ? "抠图在用户端 WASM 执行（图片编辑已接通）"
                : tool === "merge"
                  ? "视频合成在制作大片预览步执行"
                  : `本地工具「${prompt || tool}」已标记，用户端对应能力可调用`,
          });
        }
        continue;
      }
      logs.push({ nodeId: id, kind, ok: false, detail: `未知节点 ${kind}` });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      logs.push({ nodeId: id, kind, ok: false, detail });
      return {
        ok: false,
        code: agent.code,
        name: agent.name,
        text: ctx.text,
        image: ctx.image,
        images: ctx.images,
        video: ctx.video,
        audio: ctx.audio,
        frames: ctx.frames,
        kbContext: ctx.kbContext,
        logs,
        clientActions,
        error: `${kind} 节点失败：${detail}`,
      };
    }
  }

  return {
    ok: !logs.some((l) => !l.ok),
    code: agent.code,
    name: agent.name,
    text: ctx.text,
    image: ctx.image,
    images: ctx.images,
    video: ctx.video,
    audio: ctx.audio,
    frames: ctx.frames,
    kbContext: ctx.kbContext,
    logs,
    clientActions,
  };
}

export function defaultImageModelFromAgent(agent: PublicAgent | null, hasImage?: boolean): string {
  if (!agent) return "";
  if (hasImage && workflowHasKind(agent.workflow, "i2i")) return firstNodeModel(agent.workflow, "i2i");
  return firstNodeModel(agent.workflow, "t2i") || firstNodeModel(agent.workflow, "i2i");
}
