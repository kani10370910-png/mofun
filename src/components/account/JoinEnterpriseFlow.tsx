"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/AuthContext";
import { joinEnterpriseForUser } from "@/lib/joinEnterprise";

/** 个人填企业码加入他人企业（成员，不是主账号） */
export function JoinEnterpriseFlow({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const { user, updateUser, switchIdentity } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState("");

  useEffect(() => {
    if (!open) return;
    setCode("");
    setBusy(false);
    setFormErr("");
  }, [open]);

  if (!open) return null;

  function fail(msg: string) {
    setFormErr(msg);
    toast(msg, "warn");
  }

  async function onSubmit() {
    if (!user) {
      fail("请先登录");
      return;
    }
    const raw = code.trim();
    if (raw.length < 4) {
      fail("请填写企业码");
      return;
    }
    setBusy(true);
    setFormErr("");
    try {
      const r = await joinEnterpriseForUser(user, raw);
      if (!r.ok) {
        fail(r.message);
        return;
      }
      updateUser(r.userPatch);
      switchIdentity(r.identityId);
      toast(`已加入「${r.company}」，可在顶栏切换身份`);
      onClose();
    } catch (e) {
      fail(e instanceof Error ? e.message : "加入失败，请重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="am-cs-overlay" role="dialog" aria-modal="true" aria-labelledby="am-join-title">
      <button type="button" className="am-cs-backdrop" aria-label="关闭" onClick={onClose} />
      <div className="am-cert-card am-pcert-card">
        <button type="button" className="am-cs-close" onClick={onClose} aria-label="关闭">
          <Icon name="close" size={16} />
        </button>
        <h3 id="am-join-title">加入企业</h3>
        <div className="am-cert-notice">
          <span className="am-cert-notice-ico" aria-hidden>
            i
          </span>
          <p>
            向企业管理员索取企业码，填入后以成员身份加入。个人空间会一直保留，加入后可在顶栏切换工作身份。这与「企业认证」不同：企业认证是自己开通一家企业（最多 1 家）。
          </p>
        </div>
        <div className="am-cert-form">
          <input
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setFormErr("");
            }}
            placeholder="请输入 6 位企业码"
            autoFocus
            maxLength={12}
            autoComplete="off"
          />
        </div>
        {formErr ? <div className="am-cert-form-err">{formErr}</div> : null}
        <button type="button" className="am-cert-submit" disabled={busy} onClick={() => void onSubmit()}>
          {busy ? "加入中…" : "确认加入"}
        </button>
        <p className="am-cert-foot">加入后不会覆盖个人空间；可随时切换身份或退出该企业。</p>
      </div>
    </div>
  );
}
