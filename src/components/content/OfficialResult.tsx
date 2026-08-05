"use client";

import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import type { OfficialArticle } from "@/lib/officialArticlesStorage";
import { RegionEnhanceBadge } from "@/components/image/RegionEnhanceStrip";

/** 公众号帮写右栏：文章内容 + 历史文章 */
export function OfficialResult({
  text,
  loading,
  title,
  history: _history,
  onPickHistory: _onPickHistory,
  onDeleteHistory: _onDeleteHistory,
  regionEnhance,
  regionId,
}: {
  text: string;
  loading: boolean;
  title?: string;
  history: OfficialArticle[];
  onPickHistory: (row: OfficialArticle) => void;
  onDeleteHistory?: (id: string) => void;
  regionEnhance?: boolean;
  regionId?: string;
}) {
  const toast = useToast();
  const hasText = !!text.trim();
  const empty = !hasText && !loading;

  return (
    <div className="official-result">
      {empty ? (
        <div className="preview-empty" style={{ minHeight: 320 }}>
          <div>
            <div className="pe-ico">
              <Icon name="content" size={46} />
            </div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>公众号文章助手</div>
            配置文章主题与风格，一键生成深度公众号长文
          </div>
        </div>
      ) : (
        <>
          <div className="result-card">
            <div className="result-head">
              <span className="rh-title">
                <Icon name="official" size={16} /> {title?.trim() || "公众号文章"}
              </span>
              <span className="result-head-tags">
                <span className="tag green">公众号长文</span>
                {regionEnhance && <RegionEnhanceBadge regionId={regionId} />}
              </span>
            </div>
            <div className="result-body" style={{ whiteSpace: "pre-wrap" }}>
              {text}
              {loading && <span className="gen-cursor" />}
            </div>
            <div className="result-foot" style={{ flexWrap: "wrap" }}>
              <button
                className="btn btn-soft btn-sm"
                disabled={!hasText}
                onClick={() => {
                  if (navigator.clipboard) {
                    navigator.clipboard.writeText(text);
                    toast("已复制到剪贴板");
                  }
                }}
              >
                <Icon name="copy" size={15} /> 复制
              </button>
              <button className="btn btn-ghost btn-sm" disabled={!hasText} onClick={() => toast("已对文案执行「润色」（演示）")}>
                <Icon name="sparkle" size={15} /> 润色
              </button>
              <button className="btn btn-ghost btn-sm" disabled={!hasText} onClick={() => toast("已对文案执行「续写」（演示）")}>
                <Icon name="plus" size={15} /> 续写
              </button>
              <button className="btn btn-ghost btn-sm" disabled={!hasText} onClick={() => toast("已对文案执行「改写」（演示）")}>
                <Icon name="refresh" size={15} /> 改写
              </button>
            </div>
          </div>
          <p className="empty-note" style={{ marginTop: 10 }}>
            提示：文案为真实 AI 生成结果，可复制后二次编辑；润色 / 续写 / 改写为演示操作。
          </p>
        </>
      )}
    </div>
  );
}
