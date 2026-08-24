/**
 * 按 Skill 执行 propose / generate（工作台 scene 对齐）
 */
import { collectGenerate } from "@/lib/useGenerateStream";
import { buildCreativeBrief } from "../orchestrator";
import { getSpecialist } from "../specialists";
import { formatSocialOutput, parseProposals } from "../parse";
import { resolveActiveSkill } from "./resolve";
import { stripOfficialMarkdown } from "./prompts/officialArticle";
import type { AgentProposal, AgentRuntimeState, SkillDef, SkillId } from "../types";
import type { GenerateRequest } from "@/lib/types";
import { imageRequestBody, kbFields } from "@/lib/regionEnhance";
import { seedreamOutputSize, enforceIpCreatePrompt } from "@/lib/image";

function withAgentKb(req: GenerateRequest): GenerateRequest {
  if (req.useKB === false) return { ...req, useKB: false };
  return { ...kbFields(true), ...req, useKB: true };
}

function llm(req: GenerateRequest) {
  return collectGenerate(withAgentKb(req));
}

export type ExecuteResult = {
  ok: boolean;
  text: string;
  proposals?: AgentProposal[];
  images?: string[];
  error?: string;
};

async function genImage(
  prompt: string,
  n = 1,
  ref?: string,
  size = "2048x2048"
): Promise<{ images: string[]; error?: string }> {
  try {
    const r = await fetch("/api/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        imageRequestBody({
          prompt,
          n: Math.min(Math.max(n, 1), 2),
          size,
          useKB: true,
          useLora: true,
          ...(ref ? { image: ref } : {}),
        }),
      ),
    });
    const j = (await r.json()) as { images?: string[]; error?: string };
    if (!r.ok) return { images: [], error: j.error || `出图失败（${r.status}）` };
    const images = (j.images || []).filter(Boolean);
    if (!images.length) return { images: [], error: j.error || "未返回图片" };
    return { images };
  } catch {
    return { images: [], error: "无法连接文生图服务" };
  }
}

/** 槽位尺寸文案 → 干净比例标签（如 3:4） */
function slotRatioLabel(ratio?: string, fallback = "1:1"): string {
  const t = (ratio || "").trim();
  if (!t || t === "你定") return fallback;
  const m = t.match(/(\d+)\s*[:：]\s*(\d+)/);
  if (m) return `${m[1]}:${m[2]}`;
  if (/9\s*[:：]\s*16|竖版9/.test(t)) return "9:16";
  if (/16\s*[:：]\s*9|宽屏|横版16/.test(t)) return "16:9";
  if (/3\s*[:：]\s*5|纵向\s*3/.test(t)) return "3:5";
  if (/5\s*[:：]\s*3|横向\s*5/.test(t)) return "5:3";
  if (/3\s*[:：]\s*4|竖版3/.test(t)) return "3:4";
  if (/4\s*[:：]\s*3/.test(t)) return "4:3";
  if (/方|1\s*[:：]\s*1|正方形/.test(t)) return "1:1";
  if (/竖|纵向/.test(t)) return "3:4";
  if (/横|宽屏/.test(t)) return "16:9";
  return fallback;
}

/** 槽位尺寸 → 文生图像素：先落到界面显示宽高，再按 Seedream 规则放大到 ≥369 万 */
function slotRatioToSize(ratio?: string, fallbackLabel = "1:1"): string {
  const label = slotRatioLabel(ratio, fallbackLabel);
  // 与工作台「界面显示」对齐的基准像素，再交 seedreamOutputSize 放大
  const uiBase: Record<string, [number, number]> = {
    "1:1": [1080, 1080],
    "3:5": [1080, 1800],
    "5:3": [1800, 1080],
    "16:9": [1920, 1080],
    "9:16": [1080, 1920],
    "3:4": [1080, 1440],
    "4:3": [1440, 1080],
  };
  const base = uiBase[label];
  if (base) return seedreamOutputSize(base[0], base[1]);
  const [aw, ah] = label.split(":").map((x) => Number(x) || 1);
  // 未知比例：用比例单位放大（等同界面未给出绝对 px 时）
  return seedreamOutputSize(Math.max(1, aw), Math.max(1, ah));
}

function platformToApi(p?: string): string[] {
  if (!p) return ["微信朋友圈"];
  if (p.includes("小红书")) return ["小红书"];
  if (p.includes("抖音")) return ["抖音"];
  if (p.includes("微博")) return ["微博"];
  if (p.includes("朋友圈") || p.includes("微信")) return ["微信朋友圈"];
  return ["微信朋友圈"];
}

function skipOutline(v?: string) {
  return !v || v === "跳过" || v === "跳过大纲" || v === "我自己写";
}

/** 社媒平台大纲 → API outline 字段 */
function buildSocialOutline(state: AgentRuntimeState, platformLabel: string): string | undefined {
  const title = state.slots.outlineTitle;
  const subtitle = state.slots.outlineSubtitle;
  const keywords = state.slots.outlineKeywords;
  const bits = [
    !skipOutline(title) && `主标题：${title}`,
    !skipOutline(subtitle) && `副标题：${subtitle}`,
    !skipOutline(keywords) && `关键词：${keywords}`,
  ].filter(Boolean);
  if (!bits.length) return undefined;
  return `【${platformLabel}】${bits.join("；")}`;
}

function socialPlatformLabel(skillId: string, slotPlatform?: string): string {
  if (skillId === "skill.content.social_xhs" || slotPlatform?.includes("小红书")) return "小红书";
  return "微信朋友圈";
}

function isSocialSkill(id: string) {
  return (
    id === "skill.content.social" ||
    id === "skill.content.social_wechat" ||
    id === "skill.content.social_xhs"
  );
}

function needSpec(state: AgentRuntimeState) {
  const spec = state.specialistId ? getSpecialist(state.specialistId) : undefined;
  return spec;
}

/** 真实提案：按 Skill.proposeScene 调 /api/generate */
export async function runSkillPropose(state: AgentRuntimeState): Promise<ExecuteResult> {
  const spec = needSpec(state);
  if (!spec) return { ok: false, text: "", error: "尚未识别创作方向" };

  const skill = resolveActiveSkill(state);
  if (!skill?.exits.includes("propose")) {
    return { ok: false, text: "", error: `当前 Skill「${skill?.name || "未知"}」不支持提案` };
  }

  const brief = buildCreativeBrief(
    spec,
    state.slots,
    state.proposals?.find((p) => p.id === state.chosenProposalId)
  );

  const scene = skill.proposeScene || "ip-propose";

  if (isSocialSkill(skill.id)) {
    const plat = socialPlatformLabel(skill.id, state.slots.platform);
    const advantage =
      state.slots.advantage && state.slots.advantage !== "暂无" ? state.slots.advantage : undefined;
    const raw = await llm({
      scene: "social",
      product: state.slots.topic || brief,
      brand: state.slots.brand && state.slots.brand !== "暂无" ? state.slots.brand : undefined,
      audience: state.slots.audience || "通用人群",
      platforms: [plat],
      advantage,
      outline: buildSocialOutline(state, plat),
      tone: state.slots.audience || "亲切口语",
    });
    if (!raw) return { ok: false, text: "", error: "文案提案生成失败，请检查 LLM 配置后重试" };
    const formatted = formatSocialOutput(raw);
    const segs = formatted.split(/\n{2,}/).filter(Boolean);
    const proposals =
      segs.length >= 2
        ? segs.slice(0, 3).map((t, i) => ({
            id: `p${i + 1}`,
            title: `方案${["一", "二", "三"][i]}`,
            text: t,
          }))
        : parseProposals(formatted);
    return { ok: true, text: `已生成${plat}文案方向，点选用后可再生成完整版：`, proposals };
  }

  const description =
    skill.id === "skill.image.ip"
      ? brief || Object.values(state.slots).join("，")
      : `${spec.label}需求：${brief}`;

  const full =
    scene === "avatar-script"
      ? await llm({
          scene: "avatar-script",
          input: state.slots.script || brief,
          description: state.slots.role || "农技推广",
        })
      : scene === "t2i-associate"
        ? await llm({ scene: "t2i-associate", input: brief })
        : await llm({ scene: "ip-propose", description });

  if (!full) return { ok: false, text: "", error: "提案生成失败，请检查网络与 LLM_API_KEY 后重试" };

  if (skill.id === "skill.video.avatar") {
    const proposals =
      parseProposals(full).length >= 2
        ? parseProposals(full)
        : [{ id: "p1", title: "口播稿一", text: full }];
    return { ok: true, text: "已生成口播稿方向，请选用一版：", proposals };
  }

  if (skill.id === "skill.image.event" || skill.id === "skill.image.event_i2i") {
    const lead =
      skill.id === "skill.image.event_i2i"
        ? "已生成 3 个「基于参考图」的改图方向，请选用："
        : "已生成 3 个画面方向，请选用：";
    const proposals = [
      { id: "p1", title: "方案一", text: full },
      {
        id: "p2",
        title: "方案二",
        text:
          skill.id === "skill.image.event_i2i"
            ? `${brief}，在保留原图主体的前提下偏清新田园光影，主标题清晰可读。`
            : `${brief}，偏清新田园光影，主标题清晰可读。`,
      },
      {
        id: "p3",
        title: "方案三",
        text:
          skill.id === "skill.image.event_i2i"
            ? `${brief}，在保留原图构图的前提下偏国潮节庆氛围，色块对比强。`
            : `${brief}，偏国潮节庆氛围，色块对比强。`,
      },
    ];
    const b = await llm({
      scene: "t2i-associate",
      input:
        skill.id === "skill.image.event_i2i"
          ? `${brief}，图生图改图，保留原图主体，清新田园`
          : `${brief}，清新田园`,
    });
    const c = await llm({
      scene: "t2i-associate",
      input:
        skill.id === "skill.image.event_i2i"
          ? `${brief}，图生图改图，保留原图构图，国潮节庆`
          : `${brief}，国潮节庆`,
    });
    if (b) proposals[1].text = b;
    if (c) proposals[2].text = c;
    return { ok: true, text: lead, proposals };
  }

  const proposals = parseProposals(full);
  if (!proposals.length) return { ok: false, text: "", error: "未能解析提案内容，请换个描述再试" };
  return { ok: true, text: "给你 3 个方向（点选用）：", proposals };
}

/** 真实生成：按 Skill.generateScene / output 调 LLM 或文生图 */
export async function runSkillGenerate(
  state: AgentRuntimeState,
  opts?: { refImage?: string; skill?: SkillId | "vi_extend" | string }
): Promise<ExecuteResult> {
  const skill = resolveActiveSkill(state, opts);
  if (!skill) return { ok: false, text: "", error: "尚未识别创作方向或可用 Skill" };

  if (skill.output === "guide") {
    if (skill.id === "skill.template.apply") {
      return {
        ok: true,
        text: "模版库可按品类筛选案例后套用到对应工作台。你也可以直接在对话里告诉我想做的品类（IP / Logo / 海报等），我按对应 Skill 帮你生成。",
      };
    }
    if (skill.id === "skill.storage.works") {
      return {
        ok: true,
        text: "「我的作品」在仓库里可查看历史生成。你也可以直接说想继续做什么（如再出一版 IP、改海报），我按对应 Skill 接着做。",
      };
    }
    if (skill.id === "skill.storage.materials") {
      return {
        ok: true,
        text: "「我的素材」可管理参考图。创作时也可点输入框旁附件上传素材，我按当前 Skill 调用。",
      };
    }
    return {
      ok: true,
      text: "我可以根据品牌记忆帮你回忆已确认的品牌事实，并用于后续创作填槽。也可以直接说要做什么（如 IP、店招、社媒文案）。",
    };
  }

  const spec = needSpec(state);
  if (!spec && skill.specialistId) {
    return { ok: false, text: "", error: "尚未识别创作方向" };
  }
  if (!spec) return { ok: false, text: "", error: "尚未识别创作方向" };

  const chosen = state.proposals?.find((p) => p.id === state.chosenProposalId);
  const brief = buildCreativeBrief(spec, state.slots, chosen);
  const isVi = skill.id === "skill.image.vi_extend";

  // —— 纯文本 Skill ——
  if (skill.output === "text") {
    let raw = "";
    switch (skill.id) {
      case "skill.content.social":
      case "skill.content.social_wechat":
      case "skill.content.social_xhs": {
        const plat = socialPlatformLabel(skill.id, state.slots.platform);
        const brand = state.slots.brand && state.slots.brand !== "暂无" ? state.slots.brand : undefined;
        const advantage =
          state.slots.advantage && state.slots.advantage !== "暂无" ? state.slots.advantage : undefined;
        raw = await llm({
          scene: "social",
          product: state.slots.topic || brief,
          brand,
          audience: state.slots.audience || "通用人群",
          platforms: [plat],
          advantage,
          outline: buildSocialOutline(state, plat),
          tone: state.slots.audience || "亲切口语",
        });
        if (raw) raw = formatSocialOutput(raw);
        break;
      }
      case "skill.content.official":
        raw = await llm({
          scene: "official",
          title: state.slots.topic || brief,
          keywords: state.slots.keywords,
          length: state.slots.length || "800-1200字",
          tone: state.slots.style || "干货科普",
          outline: state.slots.outline,
          input: [state.slots.keywords, brief].filter(Boolean).join("，"),
        });
        if (raw) raw = stripOfficialMarkdown(raw);
        break;
      case "skill.content.brand":
        raw = await llm({
          scene: "brand",
          brand: state.slots.brand || brief,
          product: state.slots.sellingPoints || brief,
          advantage: state.slots.sellingPoints,
          platforms: ["微信朋友圈", "小红书"],
        });
        break;
      case "skill.research.brand":
        raw = await llm({
          scene: "research-brand",
          brand: state.slots.brand || brief,
          input: state.slots.market || "",
        });
        break;
      case "skill.research.industry":
        raw = await llm({
          scene: "research-industry",
          input: [
            state.slots.industry || brief,
            state.slots.region ? `地区：${state.slots.region}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
          styleHint: state.slots.reportFocus || "完整投资分析报告",
          length: state.slots.timeSpan,
        });
        break;
      case "skill.research.hotsale":
        raw = await llm({
          scene: "research-hotsale",
          input: state.slots.category || brief,
          product: state.slots.platform,
        });
        break;
      case "skill.video.avatar":
        raw = await llm({
          scene: "avatar-script",
          input: state.slots.script || chosen?.text || brief,
          description: state.slots.role || "农技推广",
        });
        break;
      case "skill.video.studio":
        raw = await llm({
          scene: "studio-script",
          input: state.slots.brief || brief,
          styleHint: state.slots.type,
        });
        break;
      case "skill.video.studio_assets":
        raw = await llm({
          scene: "studio-assets",
          input: state.slots.brief || brief,
          styleHint: state.slots.type,
        });
        break;
      case "skill.video.studio_storyboard":
        raw = await llm({
          scene: "studio-shots",
          input: state.slots.brief || brief,
          styleHint: state.slots.type,
        });
        break;
      case "skill.video.studio_preview":
        raw = await llm({
          scene: "studio-summary",
          input: state.slots.brief || brief,
          styleHint: state.slots.type,
        });
        break;
      case "skill.video.oneline":
        raw = await llm({
          scene: "t2i-associate",
          input: `一句话短视频（文生视频）分镜文案：${state.slots.oneLiner || brief}，氛围${state.slots.mood || "清新田园"}`,
        });
        break;
      case "skill.video.oneline_i2v":
        raw = await llm({
          scene: "t2i-associate",
          input: `一句话短视频（图生视频）镜头说明：基于参考图，${state.slots.oneLiner || brief}，氛围${state.slots.mood || "清新田园"}，写清运动与镜头节奏`,
        });
        break;
      case "skill.image.ip_story":
        raw = await llm({
          scene: "ip-story",
          description: state.slots.creativeDesc || brief,
          ipName: state.slots.brandName || "品牌IP",
          supplement: [state.slots.colors, state.slots.ratio].filter(Boolean).join("，"),
        });
        break;
      default:
        if (skill.generateScene) {
          raw = await llm({
            scene: skill.generateScene as "t2i-associate",
            input: brief,
          });
        }
    }
    if (!raw) return { ok: false, text: "", error: "生成失败，请检查 LLM 配置（LLM_API_KEY）后重试" };
    return { ok: true, text: raw };
  }

  // —— 商拍二级功能（换底六模式）——
  const productSkills = new Set([
    "skill.image.product",
    "skill.image.product_bg",
    "skill.image.product_multi",
    "skill.image.product_cutwhite",
    "skill.image.product_transparent",
    "skill.image.product_color",
    "skill.image.product_scene",
  ]);
  if (productSkills.has(skill.id)) {
    const ref = opts?.refImage;
    if (!ref) {
      return {
        ok: false,
        text: "",
        error: "商拍需要商品实拍图。请先点输入框旁的附件上传商品图，再点「直接出图」。",
      };
    }
    const modeHint: Record<string, string> = {
      "skill.image.product_bg": `商品换背景，场景「${state.slots.scene || "高山茶园"}」`,
      "skill.image.product": `商品换背景，场景「${state.slots.scene || "高山茶园"}」`,
      "skill.image.product_multi": "商品多角度展示，同一商品不同视角阵列，电商详情页质感",
      "skill.image.product_cutwhite": "商品抠图白底主图，纯白背景，商品居中清晰",
      "skill.image.product_transparent": "商品抠图透明底，仅保留商品主体，无背景杂物",
      "skill.image.product_color": "商品抠图纯色背景，干净电商主图",
      "skill.image.product_scene": `商品融入场景底「${state.slots.scene || "高山茶园"}」，写实摄影`,
    };
    const hint = modeHint[skill.id] || state.slots.scene || "白底主图";
    const expanded =
      (await llm({
        scene: "t2i-product",
        input: hint,
        eventSub: hint,
        artStyle: "写实摄影",
      })) || `${brief}，${hint}，真实商品主体清晰`;
    const productSize = slotRatioToSize(state.slots.ratio, "1:1");
    const { images, error } = await genImage(expanded, 1, ref, productSize);
    if (!images.length) return { ok: false, text: "", error: error || "商拍出图失败" };
    return { ok: true, text: `已生成（${skill.name}），点击图片可查看大图：`, images };
  }

  if (skill.id === "skill.image.ip_extend" || (skill.id === "skill.image.ip" && state.slots.mode === "扩展设计")) {
    if (!opts?.refImage) {
      return { ok: false, text: "", error: "请先点附件上传 IP 图，再生成。" };
    }
  }

  if (skill.id === "skill.image.event_i2i" && !opts?.refImage) {
    return { ok: false, text: "", error: "图生图需要参考图。请先点附件上传，再生成。" };
  }

  let prompt = brief;
  const ratioFallback =
    skill.id === "skill.image.event" || skill.id === "skill.image.event_i2i"
      ? "3:4"
      : skill.id === "skill.image.font"
        ? /竖/.test(state.slots.dir || "")
          ? "3:5"
          : "5:3"
        : "1:1";
  const ratioLabel = slotRatioLabel(state.slots.ratio, ratioFallback);
  // Logo 固定方图；字体按横/竖；其余按槽位比例 — 均走界面显示→Seedream 放大
  const imageSize =
    skill.id === "skill.image.logo"
      ? seedreamOutputSize(1080, 1080)
      : skill.id === "skill.image.font"
        ? /竖/.test(state.slots.dir || "")
          ? seedreamOutputSize(1080, 1800)
          : seedreamOutputSize(1800, 1080)
        : slotRatioToSize(state.slots.ratio, ratioFallback);

  if (isVi) {
    prompt =
      (await llm({
        scene: "t2i-associate",
        input: `品牌 VI 延展物料套装，基于「${brief}」，包含：主视觉应用示意、配色色板展示、包装/名片/社交头图延展，统一色系${state.slots.colors || ""}，专业品牌手册质感，平面拼贴清晰可读，画面比例 ${ratioLabel}`,
      })) ||
      `${brief}，VI 延展：配色色板 + 包装应用 + 物料示意，统一视觉，比例 ${ratioLabel}`;
  } else if (skill.id === "skill.image.ip" || skill.id === "skill.image.ip_extend") {
    prompt =
      (await llm({
        scene: "ip",
        description: brief,
        canvasSize: state.slots.ratio || ratioLabel,
        preferredColors: state.slots.colors ? [state.slots.colors] : undefined,
        hasReference: Boolean(opts?.refImage),
      })) || `${brief}，画面比例 ${ratioLabel}`;
    // 创新设计：白底 + 禁止画面角色名文字；扩展设计不强制
    if (skill.id === "skill.image.ip" && state.slots.mode !== "扩展设计") {
      prompt = enforceIpCreatePrompt(prompt);
    }
  } else if (skill.id === "skill.image.event" || skill.id === "skill.image.event_i2i") {
    prompt =
      skill.id === "skill.image.event_i2i"
        ? `${state.slots.theme || brief}，基于参考图改图，画面比例严格为 ${ratioLabel}`
        : (await llm({
            scene: "t2i-event",
            input: brief,
            eventSub: state.slots.format || "海报",
            artStyle: state.slots.style || "智能匹配",
            imageRatio: ratioLabel,
          })) || `${brief}，画面比例严格为 ${ratioLabel}`;
  } else if (skill.id === "skill.image.logo") {
    const desc =
      state.slots.creativeDesc &&
      state.slots.creativeDesc !== "无特殊要求" &&
      state.slots.creativeDesc !== "我来补充"
        ? `，创意描述：${state.slots.creativeDesc}`
        : "";
    prompt =
      (await llm({
        scene: "t2i-associate",
        input: `品牌 Logo 设计：名称「${state.slots.brandName || ""}」，logo 风格「${state.slots.style || "智能匹配"}」${desc}，平面标志，白底，居中，无多余文字堆砌，画面比例 ${ratioLabel}`,
      })) || brief;
  } else if (skill.id === "skill.image.font") {
    const fontText = state.slots.text || brief;
    const fontStyle = state.slots.style || "书法体";
    prompt =
      (await llm({
        scene: "t2i-associate",
        input: `严格按照参考字体样张的笔触与字形气质，生成艺术字「${fontText}」，文字方向${state.slots.dir || "横向"}，效果分类${fontStyle}，单行文字居中，高清标题字效，不要复现样张原文，画面比例 ${ratioLabel}`,
      })) || brief;
  } else if (skill.id === "skill.image.signage" || skill.id === "skill.image.signage_storefront") {
    const channel =
      skill.id === "skill.image.signage_storefront"
        ? "实体门头"
        : state.slots.channel || "线上店招";
    prompt =
      (await llm({
        scene: "t2i-associate",
        input: `${channel}，店名「${state.slots.shopName || brief}」清晰可读，行业${state.slots.industry || ""}，风格${state.slots.style || "新中式"}，${channel === "实体门头" ? "实景门头招牌，建筑立面" : "宽幅横幅构图"}，画面比例 ${ratioLabel}`,
      })) || brief;
  }

  if (prompt && !prompt.includes(ratioLabel) && state.slots.ratio) {
    prompt = `${prompt}。画面比例严格为 ${ratioLabel}，按此比例构图出图。`;
  }

  // AI 字体：尽量带上对应文字效果的预览样张，按图生贴近字效
  let fontStyleRef = opts?.refImage;
  if (skill.id === "skill.image.font" && !fontStyleRef) {
    try {
      const { fontEffects } = await import("@/data/image");
      const { asset } = await import("@/lib/asset");
      const { imgToDataUrl } = await import("@/lib/image");
      const styleName = state.slots.style || "";
      const hit =
        fontEffects.find((f) => f.name === styleName) ||
        fontEffects.find((f) => f.cat === styleName && f.img);
      if (hit?.img) fontStyleRef = (await imgToDataUrl(asset(hit.img))) || undefined;
    } catch {
      /* 样张加载失败则退回纯文生 */
    }
  }

  const useRef =
    skill.id === "skill.image.ip_extend" ||
    skill.id === "skill.image.event_i2i" ||
    skill.id === "skill.image.font" ||
    (skill.id === "skill.image.ip" && state.slots.mode === "扩展设计")
      ? skill.id === "skill.image.font"
        ? fontStyleRef
        : opts?.refImage
      : undefined;

  const n =
    isVi || skill.id === "skill.image.event_i2i"
      ? 1
      : skill.id === "skill.image.ip" || skill.id === "skill.image.ip_extend"
        ? 2
        : 1;

  const { images, error } = await genImage(prompt, n, useRef, imageSize);
  if (!images.length) return { ok: false, text: "", error: error || "出图失败" };
  return {
    ok: true,
    text: isVi
      ? "VI 延展出来了！点击图片可查看大图。"
      : `出来了！点击图片可查看大图；确认后可继续延展或微调。`,
    images,
  };
}

export type { SkillDef };
