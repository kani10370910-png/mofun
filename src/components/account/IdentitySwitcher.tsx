"use client";

import { useAuth } from "@/lib/AuthContext";
import { identityKindLabel } from "@/lib/identity";

export function IdentitySwitcher({
  variant = "page",
  onPicked,
}: {
  variant?: "page" | "menu";
  onPicked?: () => void;
}) {
  const { user, identities, currentIdentity, switchIdentity } = useAuth();
  if (!user || identities.length === 0) return null;

  function pick(id: string, on: boolean) {
    if (!on) switchIdentity(id);
    onPicked?.();
  }

  if (variant === "menu") {
    return (
      <div className="ident-switch ident-switch-compact">
        <div className="ident-switch-label">工作身份</div>
        <div className="ident-switch-list" role="listbox" aria-label="切换工作身份">
          {identities.map((item) => {
            const on = currentIdentity?.id === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={on}
                className={on ? "ident-switch-item on" : "ident-switch-item"}
                onClick={() => pick(item.id, on)}
              >
                <span className="ident-switch-name">{item.name}</span>
                <span className="ident-switch-kind">
                  {identityKindLabel(item.kind)} · {item.roleLabel}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <section className="am-person-card">
      <h2 className="am-person-card-title">工作身份</h2>
      <div className="am-rows">
        {identities.map((item) => {
          const on = currentIdentity?.id === item.id;
          return (
            <div className="am-row" key={item.id}>
              <span className="am-row-label">{identityKindLabel(item.kind)}</span>
              <span className="am-row-val">
                {item.name} · {item.roleLabel}
              </span>
              {on ? (
                <span className="am-ident-current">当前</span>
              ) : (
                <button type="button" className="am-row-btn" onClick={() => pick(item.id, false)}>
                  切换
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
