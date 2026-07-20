"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { EditorRail, type RailItem } from "@/components/ui/EditorRail";
import { posterFor } from "@/lib/videoFx";
import { listProjects, deleteProject, renameProject, reserveProject, uniqueProjectName, cloneProject, toggleProjectFav, type StudioProjectMeta } from "@/lib/studioProjects";
import { appConfirm, appPrompt } from "@/components/ui/Confirm";
import { SETTING_FIELDS, videoStyles } from "@/data/video";
import type { IconName } from "@/data/icons";

// 新建大片时的视频设定默认值（与 Studio 新项目默认保持一致）
const DEFAULT_NEW_SETTINGS: Record<string, string> = {
  模型: "Seedance 2.0 Fast",
  视频比例: "16:9",
  视频风格: videoStyles[0].name,
  视频质量: "480P",
  字幕: "显示",
  知识库: "使用",
};
// 新建时把用户选择的视频设定暂存于此，Studio 初始化新项目时读取并清除
export const NEW_SETTINGS_KEY = "mofun.studio.newSettings";

/* 制作大片首页：我制作的大片 + 视频模板。
   「我制作的大片」展示用户真实生成并自动存下的项目文件（多分镜合集）；
   点「新建大片 / 某个项目 / 模板」→ 进入制作大片编辑器（studio:script）。 */

// 示例项目：仅当用户还没有任何真实项目时展示
const DEMO_FILMS = [
  { id: "安吉白茶推广片", name: "安吉白茶推广片", updated: "2026-07-01 10:00", count: 4, seed: "sh-folder-tea" },
  { id: "余村文旅宣传片", name: "余村文旅宣传片", updated: "2026-06-28 15:20", count: 5, seed: "sh-folder-yucun" },
  { id: "民宿种草短片", name: "民宿种草短片", updated: "2026-06-25 09:10", count: 3, seed: "sh-folder-minsu" },
];

// 视频模板：暂时清空（删除假示例），待接入真实模板后再填充
const TEMPLATES: { id: string; name: string; tag: string; shots: number; seed: string }[] = [];

// 案例：把「西湖文旅宣传视频」项目作为可套用的案例——点「使用」即克隆其完整状态（视频设定 + 五步全部内容）为新项目
const CASE_NAME = "西湖文旅宣传视频";

export function StudioHome({
  railItems,
  iconOf,
  onPickType,
  onOpen,
}: {
  railItems: RailItem[];
  iconOf: (k: string) => IconName;
  onPickType: (k: string) => void;
  onOpen: (pid: string, name?: string) => void; // 进入编辑器：pid=项目唯一 id，name=显示名（新建时）
}) {
  const [naming, setNaming] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftSettings, setDraftSettings] = useState<Record<string, string>>(DEFAULT_NEW_SETTINGS); // 新建时的视频设定
  const [projects, setProjects] = useState<StudioProjectMeta[]>([]);
  const [menuFor, setMenuFor] = useState<string | null>(null); // 打开「⋯」菜单的项目 id
  const [allOpen, setAllOpen] = useState(false); // 「查看更多」：打开「全部大片」页
  const [tab, setTab] = useState<"films" | "inspire">("films"); // 顶部 Tab：我制作的大片 / 参考灵感
  const [onlyFav, setOnlyFav] = useState(false); // 只看收藏
  const PREVIEW_COUNT = 8; // 首页首屏显示的项目数（大卡片网格约两行）
  const favProjects = onlyFav ? projects.filter((p) => p.fav) : projects;
  const shownProjects = favProjects.slice(0, PREVIEW_COUNT);

  // 收藏/取消收藏：写回项目文件并刷新列表
  function toggleFav(id: string) {
    toggleProjectFav(id);
    setProjects(listProjects());
  }

  // 客户端读取真实项目（避免 SSR 不一致）
  useEffect(() => {
    setProjects(listProjects());
  }, []);

  // 新建：每次生成一个全新唯一 id → 保证是新文件；重名自动改为「未命名1」等。
  // 把用户在对话框里选的视频设定暂存到 sessionStorage，Studio 初始化新项目时读取。
  function confirmNew() {
    const pid = `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const name = uniqueProjectName(draftName.trim() || "未命名");
    reserveProject(pid, name); // 立即占位保留名字，避免连续新建产生同名项目
    try {
      sessionStorage.setItem(NEW_SETTINGS_KEY, JSON.stringify(draftSettings));
    } catch {
      /* 隐私模式等禁用 storage 时忽略，Studio 会用默认设定 */
    }
    onOpen(pid, name);
  }

  // 套用案例：克隆源项目（西湖文旅宣传视频）的完整 state 到一个新项目并打开，内容与源项目一模一样
  const caseProj = projects.find((p) => p.name === CASE_NAME);
  function useCase() {
    if (!caseProj) return;
    const pid = `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const name = uniqueProjectName(CASE_NAME);
    if (!cloneProject(caseProj.id, pid, name)) return;
    onOpen(pid, name);
  }

  async function delProject(id: string) {
    setMenuFor(null);
    if (!(await appConfirm({ message: "删除这个项目文件？此操作不可恢复。", danger: true, confirmText: "删除" }))) return;
    deleteProject(id);
    setProjects(listProjects());
  }
  async function renProject(p: StudioProjectMeta) {
    setMenuFor(null);
    const name = (await appPrompt("重命名项目", p.name, "重命名项目"))?.trim();
    if (!name || name === p.name) return;
    renameProject(p.id, uniqueProjectName(name));
    setProjects(listProjects());
  }

  // 单个项目文件卡片（首页预览网格与「全部大片」页共用，保证样式与操作一致）
  const renderFolder = (p: StudioProjectMeta) => (
    <div className="sh-folder sh-folder-file" key={p.id}>
      <button className="sh-folder-main" onClick={() => onOpen(p.id)}>
        <div className="sh-folder-cover">
          {p.cover ? (
            <>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video className="sh-folder-vid" src={`${p.cover}#t=0.1`} muted playsInline preload="metadata" />
              <span className="sh-folder-play">▶</span>
            </>
          ) : (
            <span className="sh-folder-empty">
              <Icon name="film" size={30} />
            </span>
          )}
          <span className="sh-folder-count">{p.count} 镜</span>
        </div>
        <div className="sh-folder-meta2">
          <span className="sh-folder-name">{p.name || "未命名"}</span>
          <span className="sh-folder-time">{p.updated}</span>
        </div>
      </button>
      <button
        className={p.fav ? "sh-folder-fav on" : "sh-folder-fav"}
        aria-label={p.fav ? "取消收藏" : "收藏"}
        title={p.fav ? "取消收藏" : "收藏"}
        onClick={(e) => {
          e.stopPropagation();
          toggleFav(p.id);
        }}
      >
        <Icon name="heart" size={15} />
      </button>
      <button
        className="sh-folder-more"
        aria-label="更多"
        onClick={(e) => {
          e.stopPropagation();
          setMenuFor(menuFor === p.id ? null : p.id);
        }}
      >
        ⋯
      </button>
      {menuFor === p.id && (
        <>
          <div className="sh-menu-mask" onClick={() => setMenuFor(null)} />
          <div className="sh-folder-menu">
            <button onClick={() => renProject(p)}>重命名</button>
            <button className="sh-menu-del" onClick={() => delProject(p.id)}>删除</button>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="page">
      <div className="editor-layout">
        <EditorRail items={railItems} activeKey="studio" iconOf={iconOf} onPick={onPickType} />
        <div className="studio-home">
          {/* 顶部 Tab：我制作的大片 / 参考灵感 + 只看收藏（对标一句话成片布局） */}
          <div className="lg-head sh-lg-head">
            <div className="tabs">
              <div className={tab === "films" ? "tab on" : "tab"} onClick={() => setTab("films")}>我制作的大片</div>
              <div className={tab === "inspire" ? "tab on" : "tab"} onClick={() => setTab("inspire")}>参考灵感</div>
            </div>
            {tab === "films" && projects.length > 0 && (
              <label className="lg-fav-switch">
                <input type="checkbox" checked={onlyFav} onChange={(e) => setOnlyFav(e.target.checked)} />
                <span className="lg-switch" />
                只看收藏
              </label>
            )}
          </div>

          {/* 我制作的大片 */}
          {tab === "films" ? (
          <section className="sh-section">
            <div className="sh-head">
              <span className="sh-sub">点击视频进入编辑</span>
              {favProjects.length > PREVIEW_COUNT && (
                <button className="sh-more-link" onClick={() => setAllOpen(true)}>
                  查看更多（{favProjects.length}）
                </button>
              )}
            </div>
            <div className="sh-folders">
              <button className="sh-folder sh-folder-new" onClick={() => { setDraftName(""); setNaming(true); }}>
                <Icon name="plus" size={26} />
                <span>新建大片</span>
              </button>
              {projects.length > 0
                ? shownProjects.map(renderFolder)
                : DEMO_FILMS.map((f) => (
                    <button className="sh-folder" key={f.id} onClick={() => onOpen(f.id, f.name)}>
                      <div className="sh-folder-cover" style={{ backgroundImage: `url(${posterFor(f.seed)})` }}>
                        <span className="sh-folder-play">▶</span>
                      </div>
                      <div className="sh-folder-meta">
                        <span className="sh-folder-name">{f.name}</span>
                        <span className="sh-folder-time">{f.updated}</span>
                      </div>
                    </button>
                  ))}
            </div>
            {projects.length > 0 && onlyFav && favProjects.length === 0 && (
              <div className="sh-tpl-empty">还没有收藏的大片，把鼠标移到卡片上点右上角 ♡ 收藏</div>
            )}
          </section>
          ) : (
          /* 参考灵感 / 案例 */
          <section className="sh-section">
            {caseProj || TEMPLATES.length > 0 ? (
              <div className="sh-templates">
                {/* 案例：西湖文旅宣传视频（克隆源项目完整内容） */}
                {caseProj && (
                  <div className="sh-tpl sh-tpl-case">
                    <div className="sh-tpl-cover">
                      {caseProj.cover ? (
                        // eslint-disable-next-line jsx-a11y/media-has-caption
                        <video className="sh-folder-vid" src={`${caseProj.cover}#t=0.1`} muted playsInline preload="metadata" />
                      ) : (
                        <span className="sh-folder-empty"><Icon name="film" size={28} /></span>
                      )}
                      <span className="sh-tpl-badge">案例</span>
                      {/* 鼠标移入 → 封面上浮现「套用灵感」按钮，点它克隆整份项目 */}
                      <div className="sh-tpl-hover">
                        <button className="sh-tpl-hover-btn" onClick={useCase}>套用灵感</button>
                      </div>
                    </div>
                    <div className="sh-tpl-meta">
                      <span className="sh-tpl-name">{caseProj.name}</span>
                      <span className="sh-tpl-shots">{caseProj.count} 镜</span>
                    </div>
                  </div>
                )}
                {TEMPLATES.map((t) => (
                  <button className="sh-tpl" key={t.id} onClick={() => onOpen(t.name)}>
                    <div className="sh-tpl-cover" style={{ backgroundImage: `url(${posterFor(t.seed)})` }}>
                      <span className="sh-tpl-play">▶</span>
                    </div>
                    <div className="sh-tpl-meta">
                      <span className="sh-tpl-name">{t.name}</span>
                      <span className="sh-tpl-shots">{t.shots} 镜</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="sh-tpl-empty">模板正在准备中，敬请期待～</div>
            )}
          </section>
          )}
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
            <div className="sh-dialog-label" style={{ marginTop: 16 }}>视频设定</div>
            <div className="sh-dialog-settings">
              {SETTING_FIELDS.map((f) => (
                <div className="sh-set-field" key={f.label}>
                  <div className="sh-set-label">{f.label}</div>
                  <div className="chip-row">
                    {f.opts.map((o) => {
                      const on = (draftSettings[f.label] ?? f.opts[0]) === o;
                      return (
                        <span
                          key={o}
                          className={on ? "sel-chip on" : "sel-chip"}
                          onClick={() => setDraftSettings((s) => ({ ...s, [f.label]: o }))}
                        >
                          {o}
                          {f.notes?.[o] && <em className="sel-chip-note">{f.notes[o]}</em>}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
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

      {/* 「全部大片」页：点击「查看更多」进入，展示全部项目；点返回回到首页 */}
      {allOpen && (
        <div className="sh-allpage">
          <div className="sh-allpage-head">
            <button className="sh-allpage-back" onClick={() => setAllOpen(false)} aria-label="返回">
              ← 返回
            </button>
            <h3>全部大片（{projects.length}）</h3>
            <button className="btn btn-primary btn-sm sh-allpage-new" onClick={() => { setAllOpen(false); setDraftName(""); setNaming(true); }}>
              <Icon name="plus" size={14} /> 新建大片
            </button>
          </div>
          <div className="sh-allpage-body">
            <div className="sh-folders">
              {projects.map(renderFolder)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
