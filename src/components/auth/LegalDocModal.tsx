"use client";

import { Icon } from "@/components/ui/Icon";
import { USER_SERVICE_AGREEMENT } from "@/data/legalDocs";

export function LegalDocModal({ onClose }: { onClose: () => void }) {
  const doc = USER_SERVICE_AGREEMENT;
  return (
    <div className="lm-legal" role="dialog" aria-modal="true" aria-labelledby="lm-legal-title">
      <button type="button" className="lm-legal-mask" aria-label="关闭" onClick={onClose} />
      <div className="lm-legal-card">
        <button type="button" className="lm-legal-close" aria-label="关闭" onClick={onClose}>
          <Icon name="close" size={18} />
        </button>
        <div className="lm-legal-scroll">
          <h2 id="lm-legal-title">{doc.title}</h2>
          <p className="lm-legal-meta">
            更新日期：{doc.updatedAt}
            <br />
            生效日期：{doc.effectiveAt}
          </p>
          {doc.intro.map((p) => (
            <p key={p.slice(0, 24)}>{p}</p>
          ))}
          {doc.sections.map((sec) => (
            <section key={sec.title}>
              <h3>{sec.title}</h3>
              {sec.paragraphs.map((p) => (
                <p key={p.slice(0, 40)} className={/^（\d+）/.test(p) ? "lm-legal-item" : undefined}>
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
