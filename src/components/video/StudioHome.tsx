"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { EditorRail, type RailItem } from "@/components/ui/EditorRail";
import { posterFor } from "@/lib/videoFx";
import type { IconName } from "@/data/icons";

/* 制作大片首页：我制作的大片 + 视频模板。
   点「新建大片 / 某个视频 / 模板」→ 进入现有的制作大片编辑器（studio:script）。 */

const MY_FILMS = [
  { id: "p1", name: "安吉白茶推广片", dur: "00:32", updated: "07-01", seed: "sh-folder-tea" },
  { id: "p2", name: "余村文旅宣传片", dur: "00:45", updated: "06-28", seed: "sh-folder-yucun" },
  { id: "p3", name: "民宿种草短片", dur: "00:18", updated: "06-25", seed: "sh-folder-minsu" },
];

const TEMPLATES = [
  { id: "t1", name: "农产品带货", tag: "带货", seed: "sh-tpl-nongchan" },
  { id: "t2", name: "景区宣传", tag: "文旅", seed: "sh-tpl-jingqu" },
  { id: "t3", name: "民宿种草", tag: "民宿", seed: "sh-tpl-minsu" },
  { id: "t4", name: "门店开业", tag: "门店", seed: "sh-tpl-mendian" },
];

export function StudioHome({
  railItems,
  iconOf,
  onPickType,
  onOpen,
}: {
  railItems: RailItem[];
  iconOf: (k: string) => IconName;
  onPickType: (k: string) => void;
  onOpen: (name?: string) => void; // 进入编辑器（可带项目名）
}) {
  const [naming, setNaming] = useState(false);
  const [draftName, setDraftName] = useState("");

  function confirmNew() {
    onOpen(draftName.trim() || "未命名大片");
  }

  return (
    <div className="page">
      <div className="editor-layout">
        <EditorRail items={railItems} activeKey="studio" iconOf={iconOf} onPick={onPickType} />
        <div className="studio-home">
          {/* 我制作的大片 */}
          <section className="sh-section">
            <div className="sh-head">
              <h3>我制作的大片</h3>
              <span className="sh-sub">点击视频进入编辑</span>
            </div>
            <div className="sh-folders">
              <button className="sh-folder sh-folder-new" onClick={() => { setDraftName(""); setNaming(true); }}>
                <Icon name="plus" size={26} />
                <span>新建大片</span>
              </button>
              {MY_FILMS.map((f) => (
                <button className="sh-folder" key={f.id} onClick={() => onOpen(f.name)}>
                  <div className="sh-folder-cover" style={{ backgroundImage: `url(${posterFor(f.seed)})` }}>
                    <span className="sh-folder-play">▶</span>
                    <span className="sh-folder-count">{f.dur}</span>
                  </div>
                  <div className="sh-folder-meta">
                    <span className="sh-folder-name">{f.name}</span>
                    <span className="sh-folder-time">{f.updated}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* 视频模板 */}
          <section className="sh-section">
            <div className="sh-head">
              <h3>视频模板</h3>
              <span className="sh-sub">套用模板快速起稿</span>
            </div>
            <div className="sh-templates">
              {TEMPLATES.map((t) => (
                <button className="sh-tpl" key={t.id} onClick={() => onOpen(t.name)}>
                  <div className="sh-tpl-cover" style={{ backgroundImage: `url(${posterFor(t.seed)})` }}>
                    <span className="sh-tpl-play">▶</span>
                  </div>
                  <div className="sh-tpl-meta">
                    <span className="sh-tpl-name">{t.name}</span>
                    <span className="tag green">{t.tag}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>

      {naming && (
        <div className="sh-mask" onClick={() => setNaming(false)}>
          <div className="sh-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="sh-dialog-title">新建大片</div>
            <div className="sh-dialog-label">给你的大片起个名字</div>
            <input
              className="sh-dialog-input"
              value={draftName}
              autoFocus
              maxLength={40}
              placeholder="例如：安吉白茶推广片"
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmNew();
                if (e.key === "Escape") setNaming(false);
              }}
            />
            <div className="sh-dialog-acts">
              <button className="btn btn-ghost btn-sm" onClick={() => setNaming(false)}>
                取消
              </button>
              <button className="btn btn-primary btn-sm" onClick={confirmNew}>
                创建并进入
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
