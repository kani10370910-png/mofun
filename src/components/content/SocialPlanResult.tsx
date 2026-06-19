"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { planHistory } from "@/data/content";

export interface ParsedSocialPlan {
  product: string;
  titles: string[];
  highlights: { tag: string; text: string }[];
  posts: {
    xhs?: { title?: string; body: string; tags?: string[] };
    wechat?: { body: string };
  };
}

/** 把模型返回的文本尽量解析成结构化策划案；失败返回 null（调用方走纯文本回退） */
export function parseSocialPlan(raw: string, product: string): ParsedSocialPlan | null {
  if (!raw) return null;
  // 容错：剥离可能的 ```json ... ``` 包裹
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  // 截取第一个 { 到最后一个 }
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a === -1 || b === -1 || b <= a) return null;
  try {
    const obj = JSON.parse(s.slice(a, b + 1));
    if (!obj || (!obj.titles && !obj.posts)) return null;
    return {
      product,
      titles: Array.isArray(obj.titles) ? obj.titles : [],
      highlights: Array.isArray(obj.highlights) ? obj.highlights : [],
      posts: obj.posts ?? {},
    };
  } catch {
    return null;
  }
}

export function SocialPlanResult({
  plan,
  onMakePoster,
}: {
  plan: ParsedSocialPlan;
  onMakePoster: () => void;
}) {
  const toast = useToast();
  const [tab, setTab] = useState<"plan" | "history">("plan");

  const copy = (text: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      toast("已复制文案");
    }
  };

  const x = plan.posts.xhs;
  const w = plan.posts.wechat;

  return (
    <>
      <div className="plan-tabs">
        <span className={tab === "plan" ? "plan-tab on" : "plan-tab"} onClick={() => setTab("plan")}>
          文案策划
        </span>
        <span className={tab === "history" ? "plan-tab on" : "plan-tab"} onClick={() => setTab("history")}>
          策划记录
        </span>
      </div>

      {tab === "history" ? (
        <div id="historyView">
          <div className="grid grid-3">
            {planHistory.map((h) => (
              <div className="ph-card" key={h.name}>
                <div className="ph-title">{h.name} 文案策划</div>
                <div className="ph-plats">
                  {h.platforms.map((p) => (
                    <span key={p} className={`ph-plat ${p === "小红书" ? "xhs" : "wechat"}`}>
                      {p}
                    </span>
                  ))}
                </div>
                <div className="ph-block">
                  <div className="ph-label">营销主标题：</div>
                  <div className="ph-fade">
                    {h.titles.map((t, i) => (
                      <div className="ph-line" key={i}>
                        {t}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="ph-block">
                  <div className="ph-label">营销亮点：</div>
                  <div className="ph-fade">
                    {h.highlights.map((hl, i) => (
                      <div className="ph-line" key={i}>
                        {hl.tag}
                        <br />
                        <span className="ph-line-sub">{hl.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="ph-foot">
                  {h.by} · {h.date}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div id="planView">
          <div className="plan-section">
            <div className="plan-sec-head">
              <h3 className="plan-title-bar">{plan.product || "产品"} 推广策划案</h3>
              <button className="btn btn-primary btn-sm" onClick={onMakePoster}>
                生成推广海报
              </button>
            </div>

            {plan.titles.length > 0 && (
              <>
                <div className="plan-sub">营销主标题</div>
                <div className="plan-grid plan-grid-3">
                  {plan.titles.map((t, i) => (
                    <div className="plan-card" key={i} onClick={() => copy(t)}>
                      <span className="plan-no">{i + 1}</span>
                      <div className="plan-card-text">{t}</div>
                      <button className="plan-copy" title="复制" onClick={() => copy(t)}>
                        <Icon name="copy" size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {plan.highlights.length > 0 && (
              <>
                <div className="plan-sub">营销亮点</div>
                <div className="plan-grid plan-grid-2">
                  {plan.highlights.map((h, i) => (
                    <div className="plan-card" key={i} onClick={() => copy(`${h.tag}：${h.text}`)}>
                      <span className="plan-no">{i + 1}</span>
                      <div className="plan-card-text">
                        <div className="plan-hl-tag">{h.tag}</div>
                        <div className="plan-hl-desc">{h.text}</div>
                      </div>
                      <button className="plan-copy" title="复制" onClick={() => copy(`${h.tag}：${h.text}`)}>
                        <Icon name="copy" size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {(x || w) && (
            <div className="plan-section">
              <div className="plan-sec-head">
                <h3 className="plan-title-bar">平台推广文案</h3>
                <button className="btn btn-primary btn-sm" onClick={() => toast("已生成配图（演示）")}>
                  生成配图
                </button>
              </div>

              {x && (
                <>
                  <div className="plan-sub xhs">小红书推广文案</div>
                  <div className="post-card post-xhs">
                    <div className="post-head">
                      <div className="post-user">
                        <span className="post-avatar">🧑</span>
                        <span className="post-name">小红书种草号</span>
                        <span className="post-badge xhs">小红书</span>
                      </div>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => copy(`${x.title ?? ""}\n${x.body}\n${(x.tags ?? []).join(" ")}`)}
                      >
                        <Icon name="copy" size={15} /> 复制文案
                      </button>
                    </div>
                    {x.title && <div className="post-title">{x.title}</div>}
                    <div className="post-body" style={{ whiteSpace: "pre-wrap" }}>
                      {x.body}
                    </div>
                    {x.tags && x.tags.length > 0 && (
                      <div className="post-tags">
                        {x.tags.map((t) => (
                          <span className="post-tag" key={t}>
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="post-foot">
                      <span className="post-corner xhs">小红书</span>
                    </div>
                  </div>
                </>
              )}

              {w && (
                <>
                  <div className="plan-sub wechat">微信朋友圈推广文案</div>
                  <div className="post-card post-wechat">
                    <div className="post-head">
                      <div className="post-user">
                        <span className="post-avatar">🧑‍💼</span>
                        <span className="post-name">品牌主理人</span>
                        <span className="post-badge wechat">微信</span>
                      </div>
                      <button className="btn btn-ghost btn-sm" onClick={() => copy(w.body)}>
                        <Icon name="copy" size={15} /> 复制文案
                      </button>
                    </div>
                    <div className="post-body" style={{ whiteSpace: "pre-wrap" }}>
                      {w.body}
                    </div>
                    <div className="post-foot">
                      <span className="post-corner wechat">微信</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
