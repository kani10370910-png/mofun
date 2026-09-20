"use client";

import { FormEvent, MouseEvent, useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { asset } from "@/lib/asset";
import { DEMO_CODE } from "@/lib/auth";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { applyInviteCode } from "@/lib/inviteGift";
import { LegalDocModal } from "@/components/auth/LegalDocModal";

function unlockField(e: { currentTarget: HTMLInputElement }) {
  e.currentTarget.readOnly = false;
}

function readInviteQuery(): string {
  if (typeof window === "undefined") return "";
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("code")?.trim() || "";
    const fromStore = window.sessionStorage.getItem("mofun.invite.code")?.trim() || "";
    return fromUrl || fromStore;
  } catch {
    return "";
  }
}

export function LoginModal() {
  const { loginOpen, closeLogin, loginPhone, loginPhonePassword } = useAuth();
  const toast = useToast();
  const [panel, setPanel] = useState<"login" | "register">("login");
  const [smsOpen, setSmsOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [code, setCode] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [autoLogin, setAutoLogin] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);
  const [err, setErr] = useState("");
  const [smsErr, setSmsErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [legalOpen, setLegalOpen] = useState(false);
  const [fieldKey, setFieldKey] = useState(0);

  function resetFields() {
    setPhone("");
    setPassword("");
    setCode("");
    setInviteCode("");
    setShowPwd(false);
    setAgreed(false);
    setAutoLogin(false);
    setErr("");
    setSmsErr("");
    setTipOpen(false);
    setSmsOpen(false);
    setLegalOpen(false);
    setCountdown(0);
    setFieldKey((n) => n + 1);
  }

  useEffect(() => {
    if (!loginOpen) return;
    resetFields();
    setPanel("login");
  }, [loginOpen]);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = window.setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [countdown]);

  useEffect(() => {
    if (!loginOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (legalOpen) setLegalOpen(false);
      else if (tipOpen) setTipOpen(false);
      else if (smsOpen) setSmsOpen(false);
      else closeLogin();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [loginOpen, legalOpen, tipOpen, smsOpen, closeLogin]);

  if (!loginOpen) return null;

  const phoneOk = /^1\d{10}$/.test(phone.trim());
  const pwdOk = password.trim().length >= 6;
  const accountReady = phoneOk && pwdOk;
  const registerReady = phoneOk && pwdOk && code.trim().length >= 4;

  function finishInvite() {
    const codeFromLink = inviteCode.trim() || readInviteQuery();
    if (codeFromLink) {
      applyInviteCode(codeFromLink, phone.trim() || "新用户");
    }
    try {
      window.sessionStorage.removeItem("mofun.invite.code");
    } catch {
      /* ignore */
    }
  }

  function doAccountLogin() {
    setBusy(true);
    setErr("");
    const r = loginPhonePassword(phone, password);
    setBusy(false);
    if (!r.ok) {
      setErr(r.message || "登录失败");
      return;
    }
    finishInvite();
  }

  function doRegister() {
    setBusy(true);
    setErr("");
    if (code.trim() !== DEMO_CODE) {
      setBusy(false);
      setErr("验证码错误（演示验证码：123456）");
      return;
    }
    const r = loginPhonePassword(phone, password);
    setBusy(false);
    if (!r.ok) {
      setErr(r.message || "注册失败");
      return;
    }
    finishInvite();
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!agreed) {
      setTipOpen(true);
      return;
    }
    if (panel === "register") doRegister();
    else doAccountLogin();
  }

  function onAgreeTip() {
    setAgreed(true);
    setTipOpen(false);
    queueMicrotask(() => {
      if (smsOpen) doSmsLogin();
      else if (panel === "register") doRegister();
      else doAccountLogin();
    });
  }

  function sendCode() {
    if (countdown > 0) return;
    if (!phoneOk) {
      if (smsOpen) setSmsErr("请输入正确的11位手机号");
      else setErr("请输入正确的11位手机号");
      return;
    }
    setErr("");
    setSmsErr("");
    setCountdown(60);
    toast(`验证码已发送（演示码：${DEMO_CODE}）`);
  }

  function doSmsLogin() {
    setBusy(true);
    setSmsErr("");
    const r = loginPhone(phone, code);
    setBusy(false);
    if (!r.ok) {
      setSmsErr(r.message || "登录失败");
      return;
    }
    finishInvite();
  }

  function onSmsSubmit(e: FormEvent) {
    e.preventDefault();
    if (!agreed) {
      setTipOpen(true);
      return;
    }
    doSmsLogin();
  }

  function openLegal(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setLegalOpen(true);
  }

  function switchPanel(next: "login" | "register") {
    if (next === panel) return;
    resetFields();
    setPanel(next);
  }

  return (
    <div className="lm-overlay" role="dialog" aria-modal="true" aria-label="登录">
      <button type="button" className="lm-backdrop" aria-label="关闭" onClick={closeLogin} />
      <div className="lm-modal">
        <aside className="lm-left" style={{ backgroundImage: `url(${asset("/home/hero-bg.png")})` }}>
          <div className="lm-left-mask" />
          <span className="lm-badge">魔方智绘</span>
          <div className="lm-left-copy">
            <h2>
              AI重构乡村品牌基因
              <br />
              智慧农业点亮华夏大地
            </h2>
            <p>
              通过AIGC技术活化地区文化元素，助力用户高效创作具有地方辨识度的设计及营销方案，激活乡土内生动力，推动三产融合与乡村全面振兴。
            </p>
          </div>
        </aside>

        <div className="lm-right">
          <button type="button" className="lm-close" aria-label="关闭" onClick={closeLogin}>
            <Icon name="close" size={18} />
          </button>
          <div className="lm-brand-title">魔方智绘</div>
          <div className="lm-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              className={`lm-tab${panel === "login" ? " on" : ""}`}
              aria-selected={panel === "login"}
              onClick={() => switchPanel("login")}
            >
              登录
            </button>
            <button
              type="button"
              role="tab"
              className={`lm-tab${panel === "register" ? " on" : ""}`}
              aria-selected={panel === "register"}
              onClick={() => switchPanel("register")}
            >
              注册
            </button>
          </div>

          <form className="lm-form" key={`form-${panel}-${fieldKey}`} onSubmit={onSubmit} autoComplete="off">
            {panel === "register" && (
              <div className="lm-invite-banner">
                <Icon name="gift" size={16} />
                新用户注册邀友最高 10000 算力
              </div>
            )}
            <div className="lm-phone-field">
              <span>+86</span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                placeholder="请输入手机号"
                inputMode="numeric"
                autoComplete="off"
                name="mofun-phone"
                maxLength={11}
                readOnly
                onFocus={unlockField}
              />
            </div>
            {panel === "register" && (
              <div className="lm-code-row">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="请输入验证码"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={6}
                  readOnly
                  onFocus={unlockField}
                />
                <button
                  type="button"
                  className="lm-code-btn lm-code-btn--solid"
                  disabled={countdown > 0}
                  onClick={sendCode}
                >
                  {countdown > 0 ? `${countdown}s` : "获取验证码"}
                </button>
              </div>
            )}
            <div className="lm-pwd-field">
              <input
                type={showPwd ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={panel === "register" ? "设置登录密码（至少6位）" : "请输入密码"}
                autoComplete="new-password"
                name="mofun-password"
                readOnly
                onFocus={unlockField}
              />
              <button
                type="button"
                className="lm-pwd-toggle"
                aria-label={showPwd ? "隐藏密码" : "显示密码"}
                onClick={() => setShowPwd((v) => !v)}
              >
                <Icon name={showPwd ? "eyeOff" : "eye"} size={16} />
              </button>
            </div>
            {panel === "register" && (
              <div className="lm-invite-field">
                <Icon name="gift" size={16} />
                <input
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="输入邀请码（选填）"
                  autoComplete="off"
                  maxLength={16}
                  readOnly
                  onFocus={unlockField}
                />
              </div>
            )}

            {err && <div className="lm-err">{err}</div>}

            <button
              type="submit"
              className="lm-submit"
              disabled={busy || (panel === "register" ? !registerReady : !accountReady)}
            >
              {busy
                ? panel === "register"
                  ? "注册中…"
                  : "登录中…"
                : panel === "register"
                  ? "注册并登录"
                  : "登录"}
            </button>

            {panel === "login" && (
              <div className="lm-extra">
                <label className="lm-auto">
                  <input
                    type="checkbox"
                    checked={autoLogin}
                    onChange={(e) => setAutoLogin(e.target.checked)}
                  />
                  <span>自动登录</span>
                </label>
                <div className="lm-extra-links">
                  <button
                    type="button"
                    onClick={() => {
                      setCode("");
                      setSmsErr("");
                      setSmsOpen(true);
                    }}
                  >
                    其他验证方式
                  </button>
                </div>
              </div>
            )}

            <label className="lm-agree">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              <span className="lm-agree-box" aria-hidden />
              <span>
                我已认真阅读
                <a href="#" onClick={openLegal}>
                  用户协议
                </a>
                和
                <a href="#" onClick={openLegal}>
                  隐私政策
                </a>
              </span>
            </label>
          </form>

          {smsOpen && (
            <div className="lm-sms" role="dialog" aria-label="验证码登录">
              <button type="button" className="lm-sms-back" onClick={() => setSmsOpen(false)}>
                返回账号登录
              </button>
              <h2 className="lm-sms-title">验证码登录</h2>
              <form className="lm-form" key={`sms-${fieldKey}`} onSubmit={onSmsSubmit} autoComplete="off">
                <div className="lm-phone-field">
                  <span>+86</span>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                    placeholder="请输入手机号"
                    inputMode="numeric"
                    autoComplete="off"
                    name="mofun-sms-phone"
                    maxLength={11}
                    readOnly
                    onFocus={unlockField}
                  />
                </div>
                <div className="lm-code-row">
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="请输入验证码"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={6}
                    readOnly
                    onFocus={unlockField}
                  />
                  <button
                    type="button"
                    className="lm-code-btn lm-code-btn--solid"
                    disabled={countdown > 0}
                    onClick={sendCode}
                  >
                    {countdown > 0 ? `${countdown}s` : "获取验证码"}
                  </button>
                </div>
                {smsErr && <div className="lm-err">{smsErr}</div>}
                <button type="submit" className="lm-submit" disabled={busy}>
                  {busy ? "登录中…" : "登录"}
                </button>
                <p className="lm-sms-legal">
                  登录即表示您同意并遵守
                  <a href="#" onClick={openLegal}>
                    《用户协议》
                  </a>
                  与
                  <a href="#" onClick={openLegal}>
                    《隐私政策》
                  </a>
                </p>
              </form>
            </div>
          )}
        </div>
      </div>

      {legalOpen && <LegalDocModal onClose={() => setLegalOpen(false)} />}

      {tipOpen && (
        <div className="lm-tip" role="alertdialog" aria-labelledby="lm-tip-title">
          <div className="lm-tip-card">
            <h3 id="lm-tip-title">提示</h3>
            <p>
              请先阅读并同意
              <a href="#" onClick={openLegal}>
                用户协议
              </a>
              和
              <a href="#" onClick={openLegal}>
                隐私政策
              </a>
              后进行{panel === "register" ? "注册" : "登录"}
            </p>
            <div className="lm-tip-actions">
              <button type="button" className="lm-tip-cancel" onClick={() => setTipOpen(false)}>
                取消
              </button>
              <button type="button" className="lm-tip-ok" onClick={onAgreeTip}>
                同意
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
