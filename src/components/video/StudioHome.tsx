"use client";

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
  onOpen: () => void; // 进入编辑器
}) {
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
              <button className="sh-folder sh-folder-new" onClick={onOpen}>
                <Icon name="plus" size={26} />
                <span>新建大片</span>
              </button>
              {MY_FILMS.map((f) => (
                <button className="sh-folder" key={f.id} onClick={onOpen}>
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
                <button className="sh-tpl" key={t.id} onClick={onOpen}>
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
    </div>
  );
}
