"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { useGenerateStream } from "@/lib/useGenerateStream";
import { accountRegionId, kbFields } from "@/lib/regionEnhance";
import { useAuth } from "@/lib/AuthContext";

/* IP 故事弹窗：
   - 左侧展示当前 IP 图片
   - 右侧三段：① IP描述（可编辑，据此生成故事）② 补充信息（项目/公司/行业关键词）③ 历史记录（每次生成的故事累积保留）
   - 底部「生成IP故事」，生成过一次后变「再次生成」 */
export function IpStoryModal({
  img,
  name,
  baseDesc,
  rawDesc,
  colors,
  ratioName,
  preDesc,
  onClose,
}: {
  img?: string;
  name: string;
  baseDesc?: string; // 当时优化后的画面描述（rawDesc 缺失时回退用）
  rawDesc?: string; // 用户原始创意描述（据此生成故事）
  colors?: string[]; // 偏好颜色
  ratioName?: string; // 画面尺寸/比例名
  preDesc?: string; // 出图后后台已预加载好的首版 IP 故事（有则作为历史记录首条）
  onClose: () => void;
}) {
  const toast = useToast();
  const { user } = useAuth();
  const regionId = accountRegionId(user);
  // 统一的形象依据
  const formDesc = (rawDesc && rawDesc.trim()) || (baseDesc && baseDesc.trim()) || "";

  const [ipDesc, setIpDesc] = useState(formDesc); // ① IP描述（可编辑）
  const [supplement, setSupplement] = useState(""); // ② 补充信息
  const [history, setHistory] = useState<string[]>(preDesc?.trim() ? [preDesc.trim()] : []); // ③ 历史记录
  const [current, setCurrent] = useState(""); // 当前流式生成中的故事

  const storyGen = useGenerateStream();

  // Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 点「生成IP故事 / 再次生成」：据 IP描述 + 补充信息生成，完成后压入历史记录
  async function handleGenStory() {
    if (storyGen.state.loading) return;
    if (!ipDesc.trim()) {
      toast("请先填写 IP 描述！", "warn");
      return;
    }
    setCurrent("");
    const full = await storyGen.generate(
      {
        scene: "ip-story",
        ipName: name,
        description: ipDesc.trim(),
        supplement: supplement.trim(),
        preferredColors: colors,
        canvasSize: ratioName,
        ...kbFields(true, regionId),
      },
      (f) => setCurrent(f),
    );
    if (storyGen.state.error) {
      toast(storyGen.state.error, "warn");
      return;
    }
    if (full.trim()) {
      setHistory((prev) => [full.trim(), ...prev]);
      setCurrent("");
    }
  }

  function copyText(text: string) {
    if (!text.trim()) return;
    navigator.clipboard?.writeText(text.trim());
    toast("已复制 IP 故事");
  }

  function deleteStory(index: number) {
    setHistory((prev) => prev.filter((_, i) => i !== index));
    toast("已删除该条故事");
  }

  const storyLoading = storyGen.state.loading;
  const showStoryIndex = history.length > 1; // 仅一条时不显示「故事 N」

  return (
    <div className="ipstory-mask" onClick={onClose}>
      <div className="ipstory-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ipstory-head">
          <span className="ipstory-title">IP故事</span>
          <button className="ipstory-close" aria-label="关闭" onClick={onClose}>
            <Icon name="close" size={22} />
          </button>
        </div>

        <div className="ipstory-body">
          {/* 左：IP 图片 */}
          <div className="ipstory-pic">
            {img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={img} alt={name} />
            ) : (
              <span className="ipstory-pic-ph"></span>
            )}
          </div>

          {/* 右：IP描述 + 补充信息 + 历史记录 */}
          <div className="ipstory-form">
            {/* ① IP描述 */}
            <div className="ipstory-field">
              <div className="ipstory-label">IP描述</div>
              <textarea
                className="ipstory-desc"
                value={ipDesc}
                onChange={(e) => setIpDesc(e.target.value)}
                placeholder="描述这个 IP 形象，如：火锅"
              />
            </div>

            {/* ② 补充信息 */}
            <div className="ipstory-field">
              <div className="ipstory-label">补充信息</div>
              <input
                className="ipstory-sup"
                value={supplement}
                onChange={(e) => setSupplement(e.target.value)}
                placeholder="可输入补充项目、公司、行业等关键词"
              />
            </div>

            {/* ③ 历史记录 */}
            <div className="ipstory-field ipstory-result">
              <div className="ipstory-label">历史记录</div>
              <div className="ipstory-history">
                {storyLoading && (
                  <div className="ipstory-hist-item">
                    <div className="ipstory-hist-hd">
                      <span className="ipstory-hist-name">
                        <Icon name="refresh" size={13} className="ico-spin" /> 生成中
                      </span>
                    </div>
                    <div className="ipstory-text">
                      {current}
                      <span className="ipstory-caret" />
                    </div>
                  </div>
                )}
                {history.map((h, i) => (
                  <div key={`${history.length - i}-${h.slice(0, 24)}`} className="ipstory-hist-item">
                    <div className="ipstory-hist-hd">
                      {showStoryIndex ? (
                        <span className="ipstory-hist-name">故事 {history.length - i}</span>
                      ) : (
                        <span className="ipstory-hist-name" aria-hidden />
                      )}
                      <div className="ipstory-hist-actions">
                        <button
                          className="ipstory-copy"
                          onClick={() => deleteStory(i)}
                          title="删除故事"
                          aria-label="删除故事"
                        >
                          <Icon name="trash" size={13} /> 删除
                        </button>
                        <button className="ipstory-copy" onClick={() => copyText(h)} title="复制故事">
                          <Icon name="copy" size={13} /> 复制
                        </button>
                      </div>
                    </div>
                    <div className="ipstory-text">{h}</div>
                  </div>
                ))}
                {!storyLoading && history.length === 0 && (
                  <div className="ipstory-hist-empty">点下方「生成IP故事」，生成的故事会保留在这里</div>
                )}
              </div>
            </div>

            <button className="ipstory-go" onClick={handleGenStory} disabled={storyLoading}>
              {storyLoading ? (
                <span className="ipstory-go-load">
                  <Icon name="refresh" size={15} className="ico-spin" /> 生成中
                </span>
              ) : history.length > 0 ? (
                <>再次生成</>
              ) : (
                <>生成IP故事</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
