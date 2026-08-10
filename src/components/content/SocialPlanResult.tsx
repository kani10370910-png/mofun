"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { PointsCost } from "@/components/ui/PointsCost";
import { imageShotPoints } from "@/lib/pointCosts";
import { RegionEnhanceBadge } from "@/components/image/RegionEnhanceStrip";

export interface ParsedSocialPlan {
  product: string;
  titles: string[];
  highlights: { tag: string; text: string }[];
  posts: {
    xhs?: { title?: string; body: string; tags?: string[] };
    wechat?: { body: string };
    douyin?: { title?: string; body: string; tags?: string[] };
    official?: { title?: string; body: string };
  };
}

/** 把模型返回的文本尽量解析成结构化策划案；失败返回 null（调用方走纯文本回退） */
export function parseSocialPlan(raw: string, product: string): ParsedSocialPlan | null {
  if (!raw) return null;
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
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
  posterLoading = false,
  onMakeImage,
  imageLoading = false,
  regionEnhance,
  regionId,
}: {
  plan: ParsedSocialPlan;
  onMakePoster: (picked: { title: string; highlights: string[] }) => Promise<string | void> | string | void;
  posterLoading?: boolean;
  onMakeImage: (picked: {
    platform: string;
    text: string;
    style?: string;
  }) => Promise<string | void> | string | void;
  imageLoading?: boolean;
  regionEnhance?: boolean;
  regionId?: string;
}) {
  const toast = useToast();
  const [posterOpen, setPosterOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [posterUrl, setPosterUrl] = useState("");
  /** 各平台独立配图：微信配图在微信下，小红书配图在小红书下 */
  const [platformImages, setPlatformImages] = useState<
    Record<string, { url: string; style: string }>
  >({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [imageStyle, setImageStyle] = useState("实拍感");
  const [titlePick, setTitlePick] = useState(0);
  const [hlPicks, setHlPicks] = useState<number[]>(() => (plan.highlights[0] ? [0] : []));
  const [imagePick, setImagePick] = useState(0);
  const IMAGE_STYLES = ["实拍感", "餐桌场景", "产地空镜", "人物手持"] as const;
  const pickedHlText = useMemo(
    () =>
      hlPicks
        .map((i) => plan.highlights[i])
        .filter(Boolean)
        .map((h) => `${h.tag} ${h.text}`),
    [hlPicks, plan.highlights],
  );

  const copy = (text: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      toast("已复制文案");
    }
  };
  const toggleHlPick = (idx: number) => {
    setHlPicks((prev) => (prev.includes(idx) ? prev.filter((n) => n !== idx) : [...prev, idx]));
  };

  const x = plan.posts.xhs;
  const w = plan.posts.wechat;
  const d = plan.posts.douyin;
  const o = plan.posts.official;
  const hasPosts = !!(x || w || d || o);
  const imageCandidates = [
    w ? { key: "wechat", label: "微信朋友圈", text: w.body } : null,
    x ? { key: "xhs", label: "小红书", text: `${x.title ?? ""}\n${x.body}`.trim() } : null,
    d ? { key: "douyin", label: "抖音", text: `${d.title ?? ""}\n${d.body}`.trim() } : null,
    o ? { key: "official", label: "微信公众号", text: `${o.title ?? ""}\n${o.body}`.trim() } : null,
  ].filter(Boolean) as Array<{ key: string; label: string; text: string }>;

  const confirmMakePoster = async () => {
    const title = plan.titles[titlePick] || plan.titles[0] || `${plan.product} 推广海报`;
    try {
      const url = await Promise.resolve(onMakePoster({ title, highlights: pickedHlText }));
      if (typeof url === "string" && url) setPosterUrl(url);
      setPosterOpen(false);
    } catch {
      // 失败时保留弹窗，便于重试
    }
  };

  const makeImageFor = async (key: string, style = imageStyle) => {
    const picked = imageCandidates.find((c) => c.key === key);
    if (!picked?.text?.trim()) {
      toast("该平台暂无可用文案", "warn");
      return;
    }
    setBusyKey(key);
    try {
      const url = await Promise.resolve(
        onMakeImage({ platform: picked.label, text: picked.text.trim(), style })
      );
      if (typeof url === "string" && url) {
        setPlatformImages((prev) => ({ ...prev, [key]: { url, style } }));
        setImageOpen(false);
      }
    } catch {
      // 失败时保留弹窗，便于重试
    } finally {
      setBusyKey(null);
    }
  };

  const confirmMakeImage = async () => {
    const picked = imageCandidates[imagePick];
    if (!picked) {
      toast("请先选择有内容的文案来源", "warn");
      return;
    }
    await makeImageFor(picked.key, imageStyle);
  };

  const openSuiteFor = (key: string) => {
    const idx = imageCandidates.findIndex((c) => c.key === key);
    if (idx >= 0) setImagePick(idx);
    setImageOpen(true);
  };

  function PlatformImageBlock({ platKey, label }: { platKey: string; label: string }) {
    const img = platformImages[platKey];
    const busy = busyKey === platKey;
    return (
      <div className="platform-image-block">
        <div className="suite-label">
          配图 · {label}
          {img?.style ? ` · ${img.style}` : ""}
        </div>
        <div className="poster-preview suite-poster platform-image-preview">
          {busy && !img ? (
            <div className="poster-preview-loading">配图生成中…</div>
          ) : img ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={`${plan.product}${label}配图`} />
              {busy && <div className="poster-preview-loading platform-image-overlay">换构图中…</div>}
              <div className="poster-preview-acts">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => makeImageFor(platKey, img.style || imageStyle)}
                  disabled={!!busyKey || imageLoading}
                >
                  换构图
                </button>
                <a
                  className="btn btn-ghost btn-sm"
                  href={img.url}
                  download={`${plan.product || "推广配图"}-${label}.png`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Icon name="download" size={14} /> 下载配图
                </a>
              </div>
            </>
          ) : (
            <div className="platform-image-empty">
              <span>尚未生成配图</span>
              <button
                type="button"
                className="btn btn-soft btn-sm"
                onClick={() => openSuiteFor(platKey)}
                disabled={!!busyKey || imageLoading}
              >
                生成配图 <PointsCost amount={imageShotPoints()} />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div id="planView">
        <div className="plan-section">
          <div className="plan-sec-head">
            <h3 className="plan-title-bar">
              {plan.product || "产品"} 品牌策划方案
              {regionEnhance && (
                <span style={{ marginLeft: 8, verticalAlign: "middle" }}>
                  <RegionEnhanceBadge regionId={regionId} />
                </span>
              )}
            </h3>
            <button className="btn btn-primary btn-sm" onClick={() => setPosterOpen(true)} disabled={posterLoading}>
              {posterLoading ? "生成中…" : <>生成推广海报 <PointsCost amount={imageShotPoints()} /></>}
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

          {(posterUrl || posterLoading) && (
            <>
              <div className="plan-sub">推广海报</div>
              <div className="poster-preview">
                {posterLoading && !posterUrl ? (
                  <div className="poster-preview-loading">海报生成中…</div>
                ) : (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={posterUrl} alt={`${plan.product}推广海报`} />
                    <div className="poster-preview-acts">
                      <a
                        className="btn btn-ghost btn-sm"
                        href={posterUrl}
                        download={`${plan.product || "推广海报"}.png`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Icon name="download" size={14} /> 下载海报
                      </a>
                      <span className="poster-preview-tip">已同步存入「仓库 → 我的作品」</span>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {hasPosts && (
          <div className="plan-section">
            <div className="plan-sec-head">
              <h3 className="plan-title-bar">平台推广文案</h3>
            </div>

            {w && (
              <>
                <div className="plan-sub wechat">微信朋友圈推广文案</div>
                <div className="post-card post-wechat">
                  <div className="post-head">
                    <div className="post-user">
                      <span className="post-avatar" aria-hidden>
                        <Icon name="wechat" size={16} />
                      </span>
                      <span className="post-name">品牌主理人</span>
                      <span className="post-badge wechat">微信</span>
                    </div>
                    <div className="suite-card-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => openSuiteFor("wechat")}>
                        生成配图 <PointsCost amount={imageShotPoints()} />
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => copy(w.body)}>
                        <Icon name="copy" size={15} /> 复制文案
                      </button>
                    </div>
                  </div>
                  <div className="post-body" style={{ whiteSpace: "pre-wrap" }}>
                    {w.body}
                  </div>
                  <div className="post-foot">
                    <span className="post-corner wechat">微信</span>
                    <span className="post-count">{w.body.length} 字</span>
                  </div>
                  <PlatformImageBlock platKey="wechat" label="微信朋友圈" />
                </div>
              </>
            )}

            {x && (
              <>
                <div className="plan-sub xhs">小红书推广文案</div>
                <div className="post-card post-xhs">
                  <div className="post-head">
                    <div className="post-user">
                      <span className="post-avatar" aria-hidden>
                        <Icon name="xhs" size={16} />
                      </span>
                      <span className="post-name">小红书种草号</span>
                      <span className="post-badge xhs">小红书</span>
                    </div>
                    <div className="suite-card-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => openSuiteFor("xhs")}>
                        生成配图 <PointsCost amount={imageShotPoints()} />
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => copy(`${x.title ?? ""}\n${x.body}\n${(x.tags ?? []).join(" ")}`)}
                      >
                        <Icon name="copy" size={15} /> 复制文案
                      </button>
                    </div>
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
                    <span className="post-count">{(x.title?.length || 0) + x.body.length} 字</span>
                  </div>
                  <PlatformImageBlock platKey="xhs" label="小红书" />
                </div>
              </>
            )}

            {d && (
              <>
                <div className="plan-sub douyin">抖音推广文案</div>
                <div className="post-card post-douyin">
                  <div className="post-head">
                    <div className="post-user">
                      <span className="post-avatar" aria-hidden>
                        <Icon name="douyin" size={16} />
                      </span>
                      <span className="post-name">短视频账号</span>
                      <span className="post-badge douyin">抖音</span>
                    </div>
                    <div className="suite-card-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => openSuiteFor("douyin")}>
                        生成配图 <PointsCost amount={imageShotPoints()} />
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => copy(`${d.title ?? ""}\n${d.body}\n${(d.tags ?? []).join(" ")}`)}
                      >
                        <Icon name="copy" size={15} /> 复制文案
                      </button>
                    </div>
                  </div>
                  {d.title && <div className="post-title">{d.title}</div>}
                  <div className="post-body" style={{ whiteSpace: "pre-wrap" }}>
                    {d.body}
                  </div>
                  {d.tags && d.tags.length > 0 && (
                    <div className="post-tags">
                      {d.tags.map((t) => (
                        <span className="post-tag" key={t}>
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="post-foot">
                    <span className="post-corner douyin">抖音</span>
                  </div>
                  <PlatformImageBlock platKey="douyin" label="抖音" />
                </div>
              </>
            )}

            {o && (
              <>
                <div className="plan-sub official">微信公众号推广文案</div>
                <div className="post-card post-official">
                  <div className="post-head">
                    <div className="post-user">
                      <span className="post-avatar" aria-hidden>
                        <Icon name="official" size={16} />
                      </span>
                      <span className="post-name">公众号编辑</span>
                      <span className="post-badge official">公众号</span>
                    </div>
                    <div className="suite-card-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => openSuiteFor("official")}>
                        生成配图 <PointsCost amount={imageShotPoints()} />
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => copy(`${o.title ?? ""}\n${o.body}`)}>
                        <Icon name="copy" size={15} /> 复制文案
                      </button>
                    </div>
                  </div>
                  {o.title && <div className="post-title">{o.title}</div>}
                  <div className="post-body" style={{ whiteSpace: "pre-wrap" }}>
                    {o.body}
                  </div>
                  <div className="post-foot">
                    <span className="post-corner official">公众号</span>
                  </div>
                  <PlatformImageBlock platKey="official" label="微信公众号" />
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {posterOpen && (
        <div className="vp-mask" onClick={() => setPosterOpen(false)}>
          <div className="pp-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pp-head">
              <div>
                <div className="pp-title">配置推广海报</div>
                <div className="pp-sub">精选文案与亮点，打造高转化海报</div>
              </div>
              <button type="button" className="pp-x" onClick={() => setPosterOpen(false)} aria-label="关闭">
                <Icon name="close" size={16} />
              </button>
            </div>

            <div className="pp-block">
              <div className="pp-row-head">
                <span>选择营销主标题</span>
                <em>单选</em>
              </div>
              <div className="pp-list">
                {plan.titles.map((t, i) => (
                  <button
                    key={i}
                    type="button"
                    className={titlePick === i ? "pp-item on" : "pp-item"}
                    onClick={() => setTitlePick(i)}
                  >
                    <span className="pp-text">{t}</span>
                    <span className={titlePick === i ? "pp-check on" : "pp-check"}>{titlePick === i ? "●" : ""}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="pp-block">
              <div className="pp-row-head">
                <span>选择营销亮点</span>
                <em>可多选</em>
              </div>
              <div className="pp-grid">
                {plan.highlights.map((h, i) => {
                  const on = hlPicks.includes(i);
                  return (
                    <button
                      key={i}
                      type="button"
                      className={on ? "pp-item on" : "pp-item"}
                      onClick={() => toggleHlPick(i)}
                    >
                      <span className="pp-text">
                        {h.tag}
                        {h.text ? `，${h.text}` : ""}
                      </span>
                      <span className={on ? "pp-check on" : "pp-check"}>{on ? "●" : ""}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pp-foot">
              <div className="pp-note">
                已选标题 x1，亮点 x{hlPicks.length}
              </div>
              <div className="pp-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPosterOpen(false)}>
                  取消
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={confirmMakePoster}
                  disabled={posterLoading}
                >
                  {posterLoading ? "生成中…" : <>生成推广海报 <PointsCost amount={imageShotPoints()} /></>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {imageOpen && (
        <div className="vp-mask" onClick={() => setImageOpen(false)}>
          <div className="pp-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pp-head">
              <div>
                <div className="pp-title">为平台生成配图</div>
                <div className="pp-sub">配图会显示在对应平台文案下方</div>
              </div>
              <button type="button" className="pp-x" onClick={() => setImageOpen(false)} aria-label="关闭">
                <Icon name="close" size={16} />
              </button>
            </div>

            <div className="pp-block">
              <div className="pp-row-head">
                <span>选择平台</span>
                <em>单选</em>
              </div>
              <div className="pp-list">
                {imageCandidates.map((c, i) => (
                  <button
                    key={c.key}
                    type="button"
                    className={imagePick === i ? "pp-item on" : "pp-item"}
                    onClick={() => setImagePick(i)}
                  >
                    <span className="pp-text">{c.label}</span>
                    <span className={imagePick === i ? "pp-check on" : "pp-check"}>
                      {imagePick === i ? "●" : ""}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="pp-block">
              <div className="pp-row-head">
                <span>配图风格</span>
                <em>单选</em>
              </div>
              <div className="chip-row social-intent-row" style={{ padding: "0 2px 8px" }}>
                {IMAGE_STYLES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`plat-chip ${imageStyle === s ? "on" : ""}`}
                    onClick={() => setImageStyle(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="pp-block" style={{ paddingTop: 0 }}>
              <div className="pp-row-head">
                <span>文案预览</span>
              </div>
              <div className="pp-preview">{imageCandidates[imagePick]?.text || "暂无可用文案"}</div>
            </div>

            <div className="pp-foot">
              <div className="pp-note">
                已选：{imageCandidates[imagePick]?.label || "-"} · {imageStyle}
              </div>
              <div className="pp-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setImageOpen(false)}>
                  取消
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => confirmMakeImage()}
                  disabled={!!busyKey || imageLoading || !imageCandidates[imagePick]?.text?.trim()}
                >
                  {busyKey ? "生成中…" : <>生成配图 <PointsCost amount={imageShotPoints()} /></>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
