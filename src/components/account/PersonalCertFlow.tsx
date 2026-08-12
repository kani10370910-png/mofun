"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/AuthContext";
import { applyPersonalCertPatch } from "@/lib/auth";

function isDemoIdOk(raw: string) {
  const v = raw.trim();
  if (!v) return false;
  if (v.toUpperCase() === "DEMO") return true;
  if (/^\d{17}[\dXx]$/.test(v)) return true;
  if (/^[0-9A-Za-z]{4,}$/.test(v)) return true;
  return false;
}

/** 个人实名认证弹窗（对齐参考：说明 + 姓名/身份证 + 提交信息） */
export function PersonalCertFlow({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone?: () => void;
}) {
  const toast = useToast();
  const { user, updateUser } = useAuth();
  const [realName, setRealName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState("");
  const editing = !!user.personalVerified;

  useEffect(() => {
    if (!open) return;
    setRealName(user.realName?.trim() || "");
    setIdNumber("");
    setBusy(false);
    setFormErr("");
  }, [open, user.realName]);

  if (!open) return null;

  function fail(msg: string) {
    setFormErr(msg);
    toast(msg, "warn");
  }

  function onSubmit() {
    setFormErr("");
    if (!realName.trim() || realName.trim().length < 2) {
      fail("请填写真实姓名");
      return;
    }
    if (!isDemoIdOk(idNumber)) {
      fail("请填写中国大陆居民身份证号（演示可填 DEMO）");
      return;
    }
    setBusy(true);
    window.setTimeout(() => {
      try {
        updateUser({
          ...applyPersonalCertPatch({ realName: realName.trim(), idNumber: idNumber.trim() }),
        });
        toast(editing ? "实名认证已更新" : "实名认证已完成");
        onDone?.();
        onClose();
      } catch (e) {
        fail(e instanceof Error ? e.message : "提交失败，请重试");
      } finally {
        setBusy(false);
      }
    }, 400);
  }

  return (
    <div className="am-cs-overlay" role="dialog" aria-modal="true" aria-labelledby="am-pcert-title">
      <button type="button" className="am-cs-backdrop" aria-label="关闭" onClick={onClose} />
      <div className="am-cert-card am-pcert-card">
        <button type="button" className="am-cs-close" onClick={onClose} aria-label="关闭">
          <Icon name="close" size={16} />
        </button>
        <h3 id="am-pcert-title">{editing ? "修改实名认证" : "实名认证"}</h3>
        <div className="am-cert-notice">
          <span className="am-cert-notice-ico" aria-hidden>
            ☀
          </span>
          <p>
            {editing
              ? "您已完成实名认证。如信息有误，可在此更新真实姓名与证件号；平台仅用于安全风控。"
              : "感谢您使用魔方智绘平台，为配合国家相关法律法规、维护网络安全环境，更好地提供健康、文明、合法的服务，我们需要您进行实名认证。"}
          </p>
        </div>
        <div className="am-cert-form">
          <input
            value={realName}
            onChange={(e) => {
              setRealName(e.target.value);
              setFormErr("");
            }}
            placeholder="真实姓名"
            autoFocus
          />
          <input
            value={idNumber}
            onChange={(e) => {
              setIdNumber(e.target.value);
              setFormErr("");
            }}
            placeholder={editing ? "请重新填写身份证号（演示可填 DEMO）" : "中国大陆居民身份证"}
          />
        </div>
        {formErr ? <div className="am-cert-form-err">{formErr}</div> : null}
        <button type="button" className="am-cert-submit" disabled={busy} onClick={onSubmit}>
          {busy ? "提交中…" : editing ? "保存修改" : "提交信息"}
        </button>
        <p className="am-cert-foot">用户须知：平台进行实名认证仅用于安全风控</p>
      </div>
    </div>
  );
}
