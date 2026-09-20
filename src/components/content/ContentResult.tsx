"use client";

import { Icon } from "@/components/ui/Icon";
import { CONTENT_ICON } from "@/data/icons";
import { useToast } from "@/components/ui/Toast";
import { useLibrary } from "@/lib/store";
import { nowStamp } from "@/lib/datetime";
import type { ContentScene } from "@/lib/types";
import { RegionEnhanceBadge } from "@/components/image/RegionEnhanceStrip";

/* 普通文案结果卡（流式逐字填充 text；loading 时显示生成中光标） */
export function ContentResult({
  scene,
  text,
  loading,
  isOutline,
  onReOutline,
  onToFull,
  regionEnhance,
  regionId,
  product,
}: {
  scene: ContentScene;
  text: string;
  loading: boolean;
  isOutline?: boolean;
  onReOutline?: () => void;
  onToFull?: () => void;
  regionEnhance?: boolean;
  regionId?: string;
  /** 可选产品名，写入作品标题 */
  product?: string;
}) {
  const toast = useToast();
  const { addWork } = useLibrary();

  function saveToLibrary() {
    const body = (text || "").trim();
    if (!body) {
      toast("暂无文案可存入", "warn");
      return;
    }
    const titleBase = (product || "").trim() || scene.title;
    const name = `${titleBase} · ${scene.title}`.slice(0, 40);
    const res = addWork({
      emoji: "",
      grad: "thumb-grad-3",
      kind: "文案",
      name,
      sub: `内容创作 · ${scene.title}`,
      module: "content",
      text: body,
      time: nowStamp(),
      edit: {
        sub: scene.key,
        input: titleBase,
        ...(product ? { product } : {}),
      },
    });
    if (!res.ok) {
      toast(res.reason === "quota" ? "本地空间不足，存入失败" : "存入失败", "warn");
      return;
    }
    toast(res.action === "updated" ? "已更新仓库中的同名文案" : "已存入个人仓库");
  }

  if (isOutline) {
    return (
      <>
        <div className="result-card">
          <div className="result-head">
            <span className="rh-title">
              <Icon name="official" size={16} /> 公众号 · 提纲
            </span>
            <span className="result-head-tags">
              <span className="tag green">确认后写全文</span>
              {regionEnhance && <RegionEnhanceBadge regionId={regionId} />}
            </span>
          </div>
          <div className="result-body">
            {text}
            {loading && <span className="gen-cursor" />}
          </div>
          <div className="result-foot">
            <button className="btn btn-ghost btn-sm" disabled={loading} onClick={onReOutline}>
              <Icon name="refresh" size={15} /> 换个提纲
            </button>
            <button className="btn btn-primary btn-sm" disabled={loading || !text} onClick={onToFull}>
              <Icon name="pencil" size={15} /> 按此提纲生成全文 →
            </button>
          </div>
        </div>
        <p className="empty-note" style={{ marginTop: 10 }}>
          提纲可参考确认，满意后再生成全文，避免长文返工。
        </p>
      </>
    );
  }

  return (
    <>
      <div className="result-card">
        <div className="result-head">
          <span className="rh-title">
            <Icon name={CONTENT_ICON[scene.key] ?? "content"} size={16} />
            {scene.title} · 生成结果
          </span>
          <span className="result-head-tags">
            <span className="tag green">{scene.tag}</span>
            {regionEnhance && <RegionEnhanceBadge regionId={regionId} />}
          </span>
        </div>
        <div className="result-body">
          {text}
          {loading && <span className="gen-cursor" />}
        </div>
        <div className="result-foot" style={{ flexWrap: "wrap" }}>
          <button
            className="btn btn-soft btn-sm"
            disabled={!text}
            onClick={() => {
              if (navigator.clipboard) {
                navigator.clipboard.writeText(text);
                toast("已复制到剪贴板");
              }
            }}
          >
            <Icon name="copy" size={15} /> 复制
          </button>
          <button className="btn btn-ghost btn-sm" disabled={!text} onClick={() => toast("已对文案执行「润色」（演示）")}>
            润色
          </button>
          <button className="btn btn-ghost btn-sm" disabled={!text} onClick={() => toast("已对文案执行「续写」（演示）")}>
            <Icon name="plus" size={15} /> 续写
          </button>
          <button className="btn btn-ghost btn-sm" disabled={!text} onClick={() => toast("已对文案执行「改写」（演示）")}>
            <Icon name="refresh" size={15} /> 改写
          </button>
          <button className="btn btn-primary btn-sm" disabled={!text || loading} onClick={saveToLibrary}>
            <Icon name="storage" size={15} /> 存入个人仓库
          </button>
        </div>
      </div>
      <p className="empty-note" style={{ marginTop: 10 }}>
        提示：文案为真实 AI 生成结果，可复制后二次编辑；也可一键存入仓库回看全文。
      </p>
    </>
  );
}
