"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { EditorRail, type RailItem } from "@/components/ui/EditorRail";
import { GenModal } from "@/components/ui/GenModal";
import { useToast } from "@/components/ui/Toast";
import { useSimGenerate } from "@/lib/useSimGenerate";
import { useLibrary } from "@/lib/store";
import { nowStamp } from "@/lib/datetime";
import { videoTypes } from "@/data/video";
import { genStages } from "@/data/genStages";
import { VID_ICON } from "@/data/icons";
import type { IconName } from "@/data/icons";
import type { VideoType } from "@/lib/types";
import { Studio } from "./Studio";

const iconOf = (k: string): IconName => VID_ICON[k] ?? "video";
const MOTION = (v: number) => (v < 33 ? "轻微" : v < 67 ? "适中" : "强烈");

export function VideoEditor({ initialSub, initialInput }: { initialSub?: string; initialInput?: string }) {
  const router = useRouter();
  const toast = useToast();
  const sim = useSimGenerate();
  const { addWork } = useLibrary();

  // 「制作大片」：sub === "studio" 或 "studio:step"
  const isStudio = initialSub === "studio" || (initialSub ?? "").startsWith("studio");

  const [active, setActive] = useState<string>(
    isStudio ? "studio" : videoTypes.find((t) => t.key === initialSub)?.key ?? videoTypes[0].key
  );

  const [input, setInput] = useState(
    initialInput || "安吉明前白茶产品介绍：海拔800米高山茶园产地、氨基酸高鲜爽回甘的特点、限量预订产地直发的购买方式"
  );
  const [camera, setCamera] = useState("自动运镜（AI 智能匹配）");
  const [motion, setMotion] = useState(50);
  const [dur, setDur] = useState("5s");
  const [advOpen, setAdvOpen] = useState(false);
  const [advPrompt, setAdvPrompt] = useState("航拍俯瞰高山茶园，晨雾逆光，暖色调，浅景深特写嫩芽");
  const [result, setResult] = useState<VideoType | null>(null);

  const railItems: RailItem[] = videoTypes.map((t) => ({ key: t.key, name: t.name }));

  function switchType(key: string) {
    if (key === "studio") {
      router.push("/video?sub=studio");
      return;
    }
    setActive(key);
    setResult(null);
    sim.close();
  }

  if (active === "studio" || isStudio) {
    return <Studio initialStep={(initialSub ?? "").split(":")[1] || "script"} railItems={railItems} iconOf={iconOf} onPickType={switchType} />;
  }

  const type = videoTypes.find((t) => t.key === active) ?? videoTypes[0];

  function runGenerate() {
    if (!input.trim()) {
      toast("请输入脚本 / 要点！", "warn");
      return;
    }
    setResult(null);
    sim.run(`正在生成${type.name}`, genStages.video, () => {
      setResult(type);
      const name = (input.trim().slice(0, 12) || type.name) + ` ${dur}`;
      addWork({
        emoji: "🎬",
        grad: "thumb-grad-3",
        kind: "视频",
        name,
        sub: "视频生成 · AI 生成",
        time: nowStamp(),
        edit: { sub: active, input: input.trim() },
      });
      toast("视频生成完成，已存入「我的作品」");
    });
  }

  return (
    <div className="page">
      <div className="editor-layout">
        <EditorRail items={railItems} activeKey={active} iconOf={iconOf} onPick={switchType} />
        <div className="workspace">
          <div className="ws-panel sticky">
            <div className="ws-scroll">
            <div className="field">
              <div className="ws-label">
                脚本 / 要点 <span className="req">*</span>
              </div>
              <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="一句话或一段要点，AI 按内置流程自动拆分镜" />
            </div>
            <div className="field">
              <div className="ws-label">首帧 / 尾帧（图生视频时使用）</div>
              <div className="ref-grid">
                <div className="ref-slot">
                  <span className="rs-ico">
                    <Icon name="plus" size={18} />
                  </span>
                  上传首帧<span className="rs-tag">首帧</span>
                </div>
                <div className="ref-slot">
                  <span className="rs-ico">
                    <Icon name="plus" size={18} />
                  </span>
                  上传尾帧<span className="rs-tag">尾帧</span>
                </div>
              </div>
              <div className="field-hint">上传首尾帧可更精细控制画面起止，AI 自动补全中间过渡</div>
            </div>
            <div className="field">
              <div className="ws-label">素材（可选，用于素材剪辑成片）</div>
              <div className="upload compact" onClick={() => toast("从个人仓库选图 / 上传片段（演示）")}>
                <span className="up-ico">
                  <Icon name="film" size={22} />
                </span>
                从个人仓库选图 / 上传片段
                <br />
                <span style={{ fontSize: 12 }}>建议 5-12 张，AI 自动排序剪辑</span>
              </div>
            </div>
            <div className="field">
              <div className="ws-label">运镜控制</div>
              <select value={camera} onChange={(e) => setCamera(e.target.value)}>
                {["自动运镜（AI 智能匹配）", "推进 / 拉远", "水平摇镜", "垂直摇镜", "旋转摇镜", "水平 / 垂直移镜", "固定镜头"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <div className="label-val">
                <span className="lv-name">运动幅度</span>
                <span className="lv-val">{MOTION(motion)}</span>
              </div>
              <input type="range" className="slider" min={0} max={100} value={motion} onChange={(e) => setMotion(Number(e.target.value))} />
              <div className="field-hint">幅度越大画面动态越强，过大可能影响稳定性</div>
            </div>
            <div className="field">
              <div className="ws-label">时长 / 比例</div>
              <div className="chip-row">
                {["5s", "10s", "15s", "竖屏 9:16"].map((d) => (
                  <span key={d} className={dur === d ? "sel-chip on" : "sel-chip"} onClick={() => setDur(d)}>
                    {d}
                  </span>
                ))}
              </div>
            </div>
            <div className={`adv ${advOpen ? "open" : ""}`}>
              <div className="adv-head" onClick={() => setAdvOpen((v) => !v)}>
                <span className="adv-title">
                  <Icon name="gear" size={16} /> 镜头 / 光影提示词
                </span>
                <span className="adv-arrow">›</span>
              </div>
              <div className="adv-body">
                <div className="field" style={{ marginBottom: 0 }}>
                  <textarea style={{ minHeight: 54 }} value={advPrompt} onChange={(e) => setAdvPrompt(e.target.value)} />
                  <div className="field-hint">公式：镜头语言 + 光影 + 主体 + 主体运动 + 场景 + 氛围</div>
                </div>
              </div>
            </div>
            </div>
            <div className="ws-foot">
              <button className="btn btn-primary btn-block gen-btn" disabled={sim.state.open} onClick={runGenerate}>
                <Icon name="sparkle" size={16} /> 生成{type.name}
              </button>
              <p className="empty-note" style={{ textAlign: "center" }}>
                自动套用品牌片头片尾与标准字幕样式
              </p>
            </div>
          </div>

          <div id="vResult">
            {result ? (
              <VideoResultView type={result} dur={dur} camera={camera} motion={MOTION(motion)} toast={toast} />
            ) : (
              <div className="preview-empty">
                <div>
                  <div className="pe-ico">
                    <Icon name="video" size={46} />
                  </div>
                  当前成片：{type.name}
                  <div className="flow-steps" style={{ justifyContent: "center", marginTop: 12 }}>
                    {type.flow.map((f, i) => (
                      <span key={i}>
                        {i ? <span className="flow-arrow">→</span> : null}
                        <span className="flow-step">{f}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <GenModal state={sim.state} title={`正在生成${type.name}`} />
    </div>
  );
}

function VideoResultView({
  type,
  dur,
  camera,
  motion,
  toast,
}: {
  type: VideoType;
  dur: string;
  camera: string;
  motion: string;
  toast: (s: string) => void;
}) {
  const durLabel = dur.includes("s") ? `00:${dur.replace("s", "").padStart(2, "0")}` : "00:05";
  return (
    <>
      <div className="result-card">
        <div className="result-head">
          <span className="rh-title">🎬 {type.name} · 预览</span>
          <span className="tag green">{dur}</span>
        </div>
        <div className="video-result thumb-grad-3">
          <div className="play">▶</div>
          <span className="vr-dur">{durLabel}</span>
        </div>
        <div className="result-foot" style={{ flexWrap: "wrap" }}>
          <button className="btn btn-soft btn-sm" onClick={() => toast("下载 MP4（演示）")}>
            下载 MP4
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => toast("替换片段（演示）")}>
            替换片段
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => toast("改字幕/配乐（演示）")}>
            改字幕/配乐
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => toast("已存入个人仓库（演示）")}>
            📦 存入个人仓库
          </button>
        </div>
      </div>
      <div className="param-recap">
        参数：{camera} · 运动幅度 {motion} · {dur}
      </div>
      <div className="card">
        <div className="ws-label">自动生成的分镜流程（{type.name}）</div>
        <div className="flow-steps">
          {type.flow.map((f, i) => (
            <span key={i}>
              {i ? <span className="flow-arrow">→</span> : null}
              <span className="flow-step">
                {i + 1}. {f}
              </span>
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
