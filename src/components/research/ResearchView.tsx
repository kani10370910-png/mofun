"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { EditorRail } from "@/components/ui/EditorRail";
import { researchTypes } from "@/data/research";
import { RESEARCH_ICON } from "@/data/icons";
import type { IconName } from "@/data/icons";

export function ResearchView({ initialSub }: { initialSub?: string }) {
  const [active, setActive] = useState(
    researchTypes.find((t) => t.key === initialSub)?.key ?? researchTypes[0].key
  );
  const type = researchTypes.find((t) => t.key === active) ?? researchTypes[0];
  const iconOf = (k: string): IconName => RESEARCH_ICON[k] ?? "search";

  return (
    <div className="page">
      <div className="editor-layout">
        <EditorRail items={researchTypes} activeKey={active} iconOf={iconOf} onPick={setActive} />
        <div className="workspace" style={{ gridTemplateColumns: "1fr" }}>
          <div>
            <div className="preview-empty">
              <div>
                <div className="pe-ico">
                  <Icon name={iconOf(type.key)} size={46} />
                </div>
                {type.name} · 功能建设中
                <br />
                <span style={{ fontSize: 13, color: "var(--c-muted)" }}>{type.desc}</span>
                <br />
                <span style={{ fontSize: 13, color: "var(--c-muted)" }}>详细功能待细化后逐步开放</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
