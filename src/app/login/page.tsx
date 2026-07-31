"use client";

import { Suspense, FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { asset } from "@/lib/asset";
import { DEMO_LOGIN } from "@/lib/auth";
import { useAuth } from "@/lib/AuthContext";

function LoginInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") || "/";
  const { user, ready, login } = useAuth();
  const [account, setAccount] = useState(DEMO_LOGIN.account);
  const [password, setPassword] = useState(DEMO_LOGIN.password);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && user) router.replace(next.startsWith("/") ? next : "/");
  }, [ready, user, next, router]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const r = login(account, password);
    setBusy(false);
    if (!r.ok) {
      setErr(r.message || "登录失败");
      return;
    }
    router.replace(next.startsWith("/") ? next : "/");
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={asset("/brand-logo.png")} alt="魔方智绘" />
          <div>
            <h1>魔方智绘</h1>
            <p>企业管理员登录</p>
          </div>
        </div>

        <form className="login-form" onSubmit={onSubmit}>
          <label>
            <span>账号</span>
            <input
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder="用户名 / 邮箱"
              autoComplete="username"
            />
          </label>
          <label>
            <span>密码</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              autoComplete="current-password"
            />
          </label>
          {err && <div className="login-err">{err}</div>}
          <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
            <Icon name="sparkle" size={15} /> {busy ? "登录中…" : "登录"}
          </button>
          <div className="login-hint">
            演示账号：{DEMO_LOGIN.account} / {DEMO_LOGIN.password}
          </div>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
