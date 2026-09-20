"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";

/** /login 仅唤起全局登录弹窗并回到首页（或 next） */
function LoginRedirect() {
  const router = useRouter();
  const sp = useSearchParams();
  const { user, ready, openLogin } = useAuth();
  const next = sp.get("next") || "/";

  useEffect(() => {
    if (!ready) return;
    if (user) {
      router.replace(next.startsWith("/") ? next : "/");
      return;
    }
    openLogin();
    router.replace(next.startsWith("/") ? next : "/");
  }, [ready, user, next, router, openLogin]);

  return null;
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginRedirect />
    </Suspense>
  );
}
