"use client";

import { Icon } from "@/components/ui/Icon";
import type { IconName } from "@/data/icons";

export interface RailItem {
  key: string;
  name?: string;
  title?: string;
}

export interface RailFlyout {
  pick: string; // 子菜单项标签
}

/* 编辑器左侧竖排导航（图标 + 文字），可选悬浮子菜单 */
export function EditorRail({
  items,
  activeKey,
  iconOf,
  flyoutOf,
  onPick,
  onFlyoutPick,
}: {
  items: RailItem[];
  activeKey: string;
  iconOf: (key: string) => IconName;
  flyoutOf?: (key: string) => string[] | null;
  onPick: (key: string) => void;
  onFlyoutPick?: (key: string, pick: string) => void;
}) {
  return (
    <aside className="editor-rail">
      {items.map((it) => {
        const subs = flyoutOf ? flyoutOf(it.key) : null;
        const hasFlyout = !!(subs && subs.length);
        return (
          <div
            key={it.key}
            className={`rail-item ${it.key === activeKey ? "on" : ""} ${hasFlyout ? "has-flyout" : ""}`}
            onClick={() => onPick(it.key)}
          >
            <span className="rail-ico">
              <Icon name={iconOf(it.key)} size={22} />
            </span>
            <span className="rail-txt">
              {it.name || it.title}
              {hasFlyout && <span className="rail-caret"> ▸</span>}
            </span>
            {hasFlyout && (
              <div className="rail-flyout">
                {subs!.map((s) => (
                  <div
                    key={s}
                    className="rail-flyout-item"
                    onClick={(e) => {
                      e.stopPropagation();
                      onFlyoutPick?.(it.key, s);
                    }}
                  >
                    {s}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </aside>
  );
}
