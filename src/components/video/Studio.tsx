"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { EditorRail, type RailItem } from "@/components/ui/EditorRail";
import { useToast } from "@/components/ui/Toast";
import { studioSteps } from "@/data/video";
import type { IconName } from "@/data/icons";
import type { StudioStep } from "@/lib/types";

/* 制作大片 · 6 步深色编辑器（内嵌于视频编辑器右侧） */
export function Studio({
  initialStep = "script",
  railItems,
  iconOf,
  onPickType,
}: {
  initialStep?: string;
  railItems: RailItem[];
  iconOf: (k: string) => IconName;
  onPickType: (k: string) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [stepKey, setStepKey] = useState(studioSteps.find((s) => s.key === initialStep)?.key ?? "script");

  // 制作大片：全屏沉浸模式（隐藏顶栏），离开时还原
  useEffect(() => {
    document.body.classList.add("studio-mode");
    return () => document.body.classList.remove("studio-mode");
  }, []);

  const activeIdx = studioSteps.findIndex((s) => s.key === stepKey);
  const active = studioSteps[activeIdx] ?? studioSteps[0];

  return (
    <div className="page">
      <div className="editor-layout">
        <EditorRail items={railItems} activeKey="studio" iconOf={iconOf} onPick={onPickType} />
        <div className="studio studio-inline">
          <header className="studio-top">
            <div className="st-left">
              <button className="st-back" onClick={() => router.push("/video?sub=oneline")} title="返回视频宣传">
                <Icon name="chevron" size={18} />
              </button>
              <span className="st-proj">未命名项目 · {active.name}</span>
            </div>
            <div className="st-right">
              <button className="btn btn-ghost btn-sm st-ghost" onClick={() => toast("更新视频到时间轴（演示）")}>
                <Icon name="refresh" size={14} /> 更新视频到时间轴
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => toast("导出视频（演示）")}>
                <Icon name="upload" size={14} /> 导出视频
              </button>
            </div>
          </header>

          <div className="studio-body">
            <aside className="studio-rail">
              {studioSteps.map((s, i) => {
                const state = i < activeIdx ? "done" : i === activeIdx ? "on" : "";
                return (
                  <div key={s.key} className={`ss-step ${state}`} onClick={() => setStepKey(s.key)}>
                    <span className="ss-no">{s.no}</span>
                    <span className="ss-name">{s.name}</span>
                    {i < activeIdx ? (
                      <span className="ss-state ok">
                        <Icon name="check" size={13} />
                      </span>
                    ) : i === activeIdx ? (
                      <span className="ss-state cur">
                        <Icon name="pencil" size={12} />
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </aside>

            <main className="studio-stage">
              <div className="stage-canvas">
                <StudioStepView step={active} goStep={setStepKey} toast={toast} />
              </div>

              <div className="timeline">
                <div className="tl-playhead" />
                <div className="tl-row">
                  <span className="tl-label">视频</span>
                  <div className="tl-track tl-video">
                    <span className="tl-empty">＋ 还没有视频，快去生成吧～</span>
                  </div>
                </div>
                <div className="tl-row">
                  <span className="tl-label">配音</span>
                  <div className="tl-track">
                    <span className="tl-none">
                      <Icon name="film" size={13} /> 无
                    </span>
                  </div>
                </div>
                <div className="tl-row">
                  <span className="tl-label">字幕</span>
                  <div className="tl-track tl-sub">
                    <span className="tl-none">字 无</span>
                  </div>
                </div>
                <div className="tl-row">
                  <span className="tl-label">音乐</span>
                  <div className="tl-track tl-music">
                    <span className="tl-none">♪ 无</span>
                  </div>
                </div>
              </div>
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}

function StudioStepView({ step, goStep, toast }: { step: StudioStep; goStep: (k: string) => void; toast: (s: string) => void }) {
  if (step.key === "script") {
    return (
      <div className="stage-panel">
        <div className="sp-title">① 剧本编辑</div>
        <div className="sp-sub">填写要点，AI 自动生成视频剧本；也可直接粘贴文案。</div>
        <textarea
          className="sp-textarea"
          defaultValue="安吉明前白茶产品介绍：海拔800米高山茶园产地、氨基酸高鲜爽回甘的特点、限量预订产地直发的购买方式"
        />
        <div className="sp-actions">
          <button className="btn btn-soft btn-sm" onClick={() => toast("AI 生成剧本（演示）")}>
            <Icon name="sparkle" size={14} /> AI 生成剧本
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => goStep("setting")}>
            下一步 · 视频设定 →
          </button>
        </div>
      </div>
    );
  }
  if (step.key === "setting") {
    const groups = [
      { label: "画幅", opts: ["竖屏 9:16", "横屏 16:9", "方形 1:1"] },
      { label: "整体风格", opts: ["国风清新", "真实纪实", "活泼种草"] },
      { label: "时长", opts: ["15s", "30s", "60s"] },
      { label: "配音", opts: ["温柔女声", "沉稳男声", "不配音"] },
    ];
    return (
      <div className="stage-panel">
        <div className="sp-title">② 视频设定</div>
        <div className="sp-grid">
          {groups.map((g) => (
            <SettingField key={g.label} label={g.label} opts={g.opts} />
          ))}
        </div>
        <div className="sp-actions">
          <button className="btn btn-primary btn-sm" onClick={() => goStep("assets")}>
            下一步 · 场景角色道具 →
          </button>
        </div>
      </div>
    );
  }
  if (step.key === "assets") {
    return (
      <div className="stage-panel">
        <div className="sp-title">③ 场景角色道具</div>
        <div className="sp-sub">设定出镜元素，AI 在分镜里保持一致性。</div>
        <div className="sp-cards">
          <div className="sp-card">
            <div className="sp-card-ico">🏞️</div>
            <div>高山云雾茶园</div>
            <span className="tag green">场景</span>
          </div>
          <div className="sp-card">
            <div className="sp-card-ico">👩‍🌾</div>
            <div>采茶姑娘</div>
            <span className="tag green">角色</span>
          </div>
          <div className="sp-card">
            <div className="sp-card-ico">🍵</div>
            <div>白茶罐装</div>
            <span className="tag green">道具</span>
          </div>
          <div className="sp-card sp-card-add" onClick={() => toast("添加元素（演示）")}>
            ＋ 添加元素
          </div>
        </div>
        <div className="sp-actions">
          <button className="btn btn-primary btn-sm" onClick={() => goStep("storyboard")}>
            下一步 · 分镜脚本 →
          </button>
        </div>
      </div>
    );
  }
  if (step.key === "storyboard") {
    const shots = [
      { n: 1, img: "🏞️", line: "航拍高山茶园，晨雾缭绕", dur: "4s" },
      { n: 2, img: "🍃", line: "特写嫩芽，露珠滚动", dur: "3s" },
      { n: 3, img: "🍵", line: "冲泡白茶，汤色清亮", dur: "4s" },
      { n: 4, img: "📦", line: "产地直发打包，二维码引导", dur: "4s" },
    ];
    return (
      <div className="stage-panel">
        <div className="sp-title">④ 分镜脚本</div>
        <div className="sp-sub">AI 已按剧本拆出 4 个镜头，可逐镜调整画面与旁白。</div>
        <div className="sb-list">
          {shots.map((s) => (
            <div className="sb-shot" key={s.n}>
              <div className="sb-thumb">{s.img}</div>
              <div className="sb-meta">
                <div className="sb-no">镜头 {s.n}</div>
                <div className="sb-line">{s.line}</div>
              </div>
              <span className="sb-dur">{s.dur}</span>
            </div>
          ))}
        </div>
        <div className="sp-actions">
          <button className="btn btn-soft btn-sm" onClick={() => toast("重新拆分镜（演示）")}>
            <Icon name="sparkle" size={14} /> 重新拆分镜
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => goStep("clips")}>
            下一步 · 分镜视频 →
          </button>
        </div>
      </div>
    );
  }
  if (step.key === "clips") {
    const clips = ["🏞️", "🍃", "🍵", "📦"];
    return (
      <div className="stage-panel">
        <div className="sp-title">⑤ 分镜视频</div>
        <div className="sp-sub">逐镜生成视频片段，满意后合成到时间轴。</div>
        <div className="clip-grid">
          {clips.map((e, i) => (
            <div className="clip-card" key={i}>
              <div className={`clip-thumb thumb-grad-${(i % 6) + 1}`}>
                <span>{e}</span>
                <div className="clip-play">▶</div>
              </div>
              <div className="clip-foot">
                <span>镜头 {i + 1}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => toast("重生成（演示）")}>
                  <Icon name="refresh" size={12} /> 重生成
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="sp-actions">
          <button className="btn btn-soft btn-sm" onClick={() => toast("批量生成全部（演示）")}>
            <Icon name="sparkle" size={14} /> 批量生成全部
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => goStep("preview")}>
            下一步 · 视频预览 →
          </button>
        </div>
      </div>
    );
  }
  // preview
  return (
    <div className="stage-preview">
      <div className="stage-logo">
        <Icon name="video" size={56} />
      </div>
      <div className="stage-tip">请先在「分镜视频」生成片段，再合成预览</div>
      <button className="btn btn-primary btn-sm" style={{ marginTop: 14 }} onClick={() => goStep("clips")}>
        去生成分镜视频
      </button>
    </div>
  );
}

function SettingField({ label, opts }: { label: string; opts: string[] }) {
  const [sel, setSel] = useState(opts[0]);
  return (
    <div className="sp-field">
      <div className="sp-label">{label}</div>
      <div className="chip-row">
        {opts.map((o) => (
          <span key={o} className={sel === o ? "sel-chip on" : "sel-chip"} onClick={() => setSel(o)}>
            {o}
          </span>
        ))}
      </div>
    </div>
  );
}
