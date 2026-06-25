"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { useGenerateStream } from "@/lib/useGenerateStream";

/* IP 故事弹窗：
   - 左侧展示当前 IP 图片
   - 右侧「IP故事」（上栏）：打开时据创意描述/颜色/尺寸自动生成一版 IP 故事（不识别图片，可编辑）
   - 「补充信息」：用户可填项目/公司/行业关键词
   - 「生成IP故事」：结合上栏故事 + 补充信息生成「重生版」，在下方单独展示（上栏初版保留） */
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
  preDesc?: string; // 出图后后台已预加载好的首版 IP 故事（有则直接用，无需现场生成）
  onClose: () => void;
}) {
  const toast = useToast();
  // 上栏初版 IP 故事（自动生成，可编辑）
  const [initStory, setInitStory] = useState(preDesc?.trim() || "");
  const [supplement, setSupplement] = useState("");
  // 下方「重生版」故事（结合补充信息）
  const [story, setStory] = useState("");
  const [initLoading, setInitLoading] = useState(false);

  const storyGen = useGenerateStream(); // 下方重生版
  const initGen = useGenerateStream(); // 上栏初版（现场兜底）

  // 统一的形象依据
  const formDesc = (rawDesc && rawDesc.trim()) || (baseDesc && baseDesc.trim()) || "";

  // 打开即拿到上栏「初版 IP 故事」：优先用后台预加载结果；没有才现场生成
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (preDesc && preDesc.trim()) return; // 已有预加载初版，直接用
    let alive = true;
    (async () => {
      setInitLoading(true);
      const full = await initGen.generate(
        {
          scene: "ip-story",
          ipName: name,
          description: formDesc,
          preferredColors: colors,
          canvasSize: ratioName,
        },
        (f) => alive && setInitStory(f),
      );
      if (alive && initGen.state.error) toast(initGen.state.error, "warn");
      if (alive && full.trim()) setInitStory(full.trim());
      if (alive) setInitLoading(false);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 点「生成IP故事」：以上栏故事为基础 + 补充信息，生成重生版展示在下方
  async function handleGenStory() {
    if (storyGen.state.loading) return;
    if (!initStory.trim()) {
      toast("请先等待或填写上方 IP 故事！", "warn");
      return;
    }
    setStory("");
    const full = await storyGen.generate(
      {
        scene: "ip-story",
        ipName: name,
        // 以上栏故事 + 原始形象描述为依据，避免跑偏
        description: `${initStory.trim()}\n\n（形象参考：${formDesc}）`,
        supplement: supplement.trim(),
        preferredColors: colors,
        canvasSize: ratioName,
      },
      (f) => setStory(f),
    );
    if (storyGen.state.error) {
      toast(storyGen.state.error, "warn");
      return;
    }
    if (full.trim()) setStory(full.trim());
  }

  function copyText(text: string) {
    if (!text.trim()) return;
    navigator.clipboard?.writeText(text.trim());
    toast("已复制 IP 故事");
  }

  const initBusy = initLoading || initGen.state.loading;
  const storyLoading = storyGen.state.loading;

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
              <span className="ipstory-pic-ph">🧸</span>
            )}
          </div>

          {/* 右：IP 故事（初版）+ 补充信息 + 重生版 */}
          <div className="ipstory-form">
            <div className="ipstory-field">
              <div className="ipstory-label">
                <span className="ipstory-label-l">
                  IP故事
                  {initBusy && (
                    <span className="ipstory-mini-load">
                      <Icon name="refresh" size={13} className="ico-spin" /> 生成中
                    </span>
                  )}
                </span>
                {!initBusy && initStory && (
                  <button className="ipstory-copy" onClick={() => copyText(initStory)} title="复制故事">
                    <Icon name="copy" size={13} /> 复制
                  </button>
                )}
              </div>
              <textarea
                className="ipstory-desc ipstory-story"
                value={initStory}
                onChange={(e) => setInitStory(e.target.value)}
                placeholder={initBusy ? "正在生成 IP 故事…" : "IP 故事将显示在这里，可编辑"}
              />
            </div>

            <div className="ipstory-field">
              <div className="ipstory-label">补充信息</div>
              <input
                className="ipstory-sup"
                value={supplement}
                onChange={(e) => setSupplement(e.target.value)}
                placeholder="可输入补充项目、公司、行业等关键词"
              />
            </div>

            {/* 重生版 IP 故事：结合补充信息生成，下方单独展示 */}
            {(story || storyLoading) && (
              <div className="ipstory-field ipstory-result">
                <div className="ipstory-label">
                  <span className="ipstory-label-l">结合补充信息的 IP 故事</span>
                  {!storyLoading && story && (
                    <button className="ipstory-copy" onClick={() => copyText(story)} title="复制故事">
                      <Icon name="copy" size={13} /> 复制
                    </button>
                  )}
                </div>
                <div className="ipstory-text">
                  {story}
                  {storyLoading && <span className="ipstory-caret" />}
                </div>
              </div>
            )}

            <button
              className="ipstory-go"
              onClick={handleGenStory}
              disabled={storyLoading || initBusy}
            >
              {storyLoading ? (
                <span className="ipstory-go-load">
                  <Icon name="refresh" size={15} className="ico-spin" /> 生成中
                </span>
              ) : story ? (
                "重新生成IP故事"
              ) : (
                "生成IP故事"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
