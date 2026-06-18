"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { EditorRail } from "@/components/ui/EditorRail";
import { useToast } from "@/components/ui/Toast";
import { useGenerateStream } from "@/lib/useGenerateStream";
import { useLibrary } from "@/lib/store";
import { nowStamp } from "@/lib/datetime";
import { contentScenes } from "@/data/content";
import { CONTENT_ICON } from "@/data/icons";
import type { IconName } from "@/data/icons";
import type { ContentSceneKey, GenerateRequest } from "@/lib/types";
import {
  ContentDefaultPanel,
  ContentSocialPanel,
  type DefaultFormState,
  type SocialFormState,
} from "./ContentForms";
import { ContentResult } from "./ContentResult";
import { SocialPlanResult, parseSocialPlan, type ParsedSocialPlan } from "./SocialPlanResult";

const iconOf = (k: string): IconName => CONTENT_ICON[k] ?? "content";

export function ContentEditor({
  initialSub,
  initialInput,
  initialProduct,
}: {
  initialSub?: string;
  initialInput?: string;
  initialProduct?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const { state, generate, stop, reset } = useGenerateStream();
  const { addWork } = useLibrary();

  // 文案生成完成后默认存入「我的作品」
  function saveContentWork(text: string, label: string) {
    if (!text.trim()) return;
    const name = (text.trim().replace(/\s+/g, "").slice(0, 12) || label) + "…";
    addWork({
      emoji: scene.key === "social" ? "📕" : "📰",
      grad: "thumb-grad-6",
      kind: "文案",
      name,
      sub: `内容创作 · ${scene.title}`,
      time: nowStamp(),
      edit: { sub: active, input: defForm.input },
    });
    toast("文案已生成并存入「我的作品」");
  }

  const [active, setActive] = useState<ContentSceneKey>(
    (contentScenes.find((s) => s.key === initialSub)?.key as ContentSceneKey) ?? contentScenes[0].key
  );
  const scene = contentScenes.find((s) => s.key === active) ?? contentScenes[0];

  // 各场景表单状态
  const [defForm, setDefForm] = useState<DefaultFormState>({
    input: (initialSub !== "social" && initialInput) || "安吉明前白茶上市，海拔800米高山云雾茶园，氨基酸高、鲜爽回甘，限量预订、产地直发",
    tone: "亲切口语",
    length: active === "official" ? "标准" : "精简",
    customLen: "120",
    brandAsset: "安吉白茶 · 产业品牌（已定稿）",
  });
  const [socialForm, setSocialForm] = useState<SocialFormState>({
    product: initialProduct || "",
    brand: "",
    audience: "宝妈",
    advantage: "",
    platforms: ["微信朋友圈"],
    outlines: {},
  });

  // 结果区状态
  const [mode, setMode] = useState<"none" | "text" | "outline" | "social">("none");
  const [lastOutline, setLastOutline] = useState(""); // 提纲全文，供「生成全文」用
  const [socialPlan, setSocialPlan] = useState<ParsedSocialPlan | null>(null);
  const [socialFallback, setSocialFallback] = useState(""); // 解析失败时的纯文本

  function switchScene(key: string) {
    setActive(key as ContentSceneKey);
    setMode("none");
    setSocialPlan(null);
    setSocialFallback("");
    reset();
    if (key !== "social") {
      setDefForm((f) => ({ ...f, length: key === "official" ? "标准" : "精简" }));
    }
  }

  function buildDefaultReq(extra?: Partial<GenerateRequest>): GenerateRequest {
    const length = defForm.length === "自定义" ? defForm.customLen : defForm.length;
    return {
      scene: active,
      tone: defForm.tone,
      length,
      brandAsset: defForm.brandAsset,
      input: defForm.input,
      ...extra,
    };
  }

  // 普通文案（brand / official-full）
  async function genText(extra?: Partial<GenerateRequest>) {
    if (!defForm.input.trim()) {
      toast("请输入「写什么」！", "warn");
      return;
    }
    setMode("text");
    const full = await generate(buildDefaultReq(extra));
    saveContentWork(full, scene.title);
  }

  // 公众号：先生成提纲
  async function genOutline() {
    if (!defForm.input.trim()) {
      toast("请输入「写什么」！", "warn");
      return;
    }
    setMode("outline");
    setLastOutline("");
    const full = await generate(buildDefaultReq({ mode: "outline" }));
    setLastOutline(full);
  }

  // 公众号：按提纲生成全文
  async function genFull() {
    setMode("text");
    const full = await generate(buildDefaultReq({ mode: "full", outline: lastOutline }));
    saveContentWork(full, scene.title);
  }

  // 社媒推文：结构化策划案
  async function genSocial() {
    if (!socialForm.product.trim()) {
      toast("请输入产品名！", "warn");
      return;
    }
    setMode("social");
    setSocialPlan(null);
    setSocialFallback("");
    const req: GenerateRequest = {
      scene: "social",
      product: socialForm.product,
      brand: socialForm.brand,
      audience: socialForm.audience,
      advantage: socialForm.advantage,
      platforms: socialForm.platforms,
    };
    const full = await generate(req);
    const parsed = parseSocialPlan(full, socialForm.product);
    if (parsed) setSocialPlan(parsed);
    else setSocialFallback(full); // 回退纯文本
    if (full.trim()) {
      addWork({
        emoji: "📕",
        grad: "thumb-grad-2",
        kind: "文案",
        name: `${socialForm.product.trim() || "社媒推文"} · 推广文案`,
        sub: `内容创作 · ${scene.title}`,
        time: nowStamp(),
        edit: { sub: "social", product: socialForm.product, brand: socialForm.brand, advantage: socialForm.advantage },
      });
      toast("文案已生成并存入「我的作品」");
    }
  }

  const panel =
    active === "social" ? (
      <ContentSocialPanel state={socialForm} setState={setSocialForm} onGenerate={genSocial} loading={state.loading} />
    ) : (
      <ContentDefaultPanel
        scene={scene}
        state={defForm}
        setState={setDefForm}
        onOutline={genOutline}
        onGenerate={() => genText()}
        loading={state.loading}
      />
    );

  return (
    <div className="page">
      <div className="editor-layout">
        <EditorRail items={contentScenes} activeKey={active} iconOf={iconOf} onPick={switchScene} />
        <div className="workspace">
          <div className="ws-panel sticky">{panel}</div>

          <div id="cResult">
            {state.error ? (
              <div className="preview-empty" style={{ minHeight: 300 }}>
                <div>
                  <div className="pe-ico">⚠️</div>
                  {state.error}
                </div>
              </div>
            ) : mode === "none" ? (
              <div className="preview-empty">
                <div>
                  <div className="pe-ico">
                    <Icon name="content" size={46} />
                  </div>
                  填好左侧需求，点击「生成」
                  <br />
                  AI 将按「{scene.tag}」格式产出
                </div>
              </div>
            ) : mode === "social" ? (
              socialPlan ? (
                <SocialPlanResult plan={socialPlan} onMakePoster={() => toast("已生成推广海报（演示）")} />
              ) : socialFallback && !state.loading ? (
                <ContentResult scene={scene} text={socialFallback} loading={false} />
              ) : (
                <div className="preview-empty" style={{ minHeight: 300 }}>
                  <div>
                    <div className="pe-ico">
                      <span className="gen-cursor" />
                    </div>
                    正在生成推广策划案…
                  </div>
                </div>
              )
            ) : mode === "outline" ? (
              <ContentResult
                scene={scene}
                text={state.text}
                loading={state.loading}
                isOutline
                onReOutline={genOutline}
                onToFull={genFull}
              />
            ) : (
              <ContentResult scene={scene} text={state.text} loading={state.loading} />
            )}

            {state.loading && (
              <div style={{ textAlign: "center", marginTop: 12 }}>
                <button className="btn btn-ghost btn-sm" onClick={stop}>
                  停止生成
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
