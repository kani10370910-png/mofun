"use client";

import { FormEvent, useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { asset } from "@/lib/asset";
import { DEMO_CODE, DEMO_LOGIN } from "@/lib/auth";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/Toast";

export function LoginModal() {
  const { loginOpen, loginTab, closeLogin, loginEnterprise, loginPhone, openLogin } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<"phone" | "enterprise">(loginTab);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [account, setAccount] = useState(DEMO_LOGIN.account);
  const [password, setPassword] = useState(DEMO_LOGIN.password);
  const [agreed, setAgreed] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (loginOpen) {
      setTab(loginTab);
      setErr("");
      setTipOpen(false);
    }
  }, [loginOpen, loginTab]);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = window.setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [countdown]);

  useEffect(() => {
    if (!loginOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (tipOpen) setTipOpen(false);
        else closeLogin();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [loginOpen, tipOpen, closeLogin]);

  if (!loginOpen) return null;

  function doLogin() {
    setBusy(true);
    setErr("");
    const r =
      tab === "phone"
        ? loginPhone(phone, code)
        : loginEnterprise(account, password);
    setBusy(false);
    if (!r.ok) setErr(r.message || "登录失败");
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!agreed) {
      setTipOpen(true);
      return;
    }
    doLogin();
  }

  function onAgreeTip() {
    setAgreed(true);
    setTipOpen(false);
    // 同意后直接提交一次
    queueMicrotask(() => doLogin());
  }

  function sendCode() {
    if (countdown > 0) return;
    if (!/^1\d{10}$/.test(phone.trim())) {
      setErr("请输入正确的11位手机号");
      return;
    }
    setErr("");
    setCountdown(60);
    setCode(DEMO_CODE);
    toast(`验证码已发送（演示码：${DEMO_CODE}）`);
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
              aria-selected={tab === "phone"}
              className={tab === "phone" ? "lm-tab on" : "lm-tab"}
              onClick={() => {
                setTab("phone");
                openLogin("phone");
                setErr("");
              }}
            >
              手机号登录
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "enterprise"}
              className={tab === "enterprise" ? "lm-tab on" : "lm-tab"}
              onClick={() => {
                setTab("enterprise");
                openLogin("enterprise");
                setErr("");
              }}
            >
              企业账户登录
            </button>
          </div>

          <form className="lm-form" onSubmit={onSubmit}>
            {tab === "phone" ? (
              <>
                <p className="lm-phone-hint">
                  个人用户以手机号作为登录账户，获取验证码后登录（演示码会自动填入）。
                </p>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="请输入手机号"
                  inputMode="numeric"
                  autoComplete="tel"
                  maxLength={11}
                />
                <div className="lm-code-row">
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="请输入验证码"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                  />
                  <button
                    type="button"
                    className="lm-code-btn"
                    disabled={countdown > 0}
                    onClick={sendCode}
                  >
                    {countdown > 0 ? `${countdown}s` : "获取验证码"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <input
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  placeholder="请输入企业账号"
                  autoComplete="username"
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入密码"
                  autoComplete="current-password"
                />
              </>
            )}

            {err && <div className="lm-err">{err}</div>}

            <button type="submit" className="lm-submit" disabled={busy}>
              {busy ? "登录中…" : "登录"}
            </button>

            <label className="lm-agree">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              <span className="lm-agree-box" aria-hidden />
              <span>
                我已认真阅读
                <a href="#" onClick={(e) => e.preventDefault()}>
                  用户协议
                </a>
                和
                <a href="#" onClick={(e) => e.preventDefault()}>
                  隐私政策
                </a>
              </span>
            </label>
          </form>
        </div>
      </div>

      {tipOpen && (
        <div className="lm-tip" role="alertdialog" aria-labelledby="lm-tip-title">
          <div className="lm-tip-card">
            <h3 id="lm-tip-title">提示</h3>
            <p>
              请先阅读并同意
              <a href="#" onClick={(e) => e.preventDefault()}>
                用户协议
              </a>
              和
              <a href="#" onClick={(e) => e.preventDefault()}>
                隐私政策
              </a>
              后进行登录
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
