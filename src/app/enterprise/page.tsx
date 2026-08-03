"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function EnterpriseRedirect() {
  const router = useRouter();
  const sp = useSearchParams();
  useEffect(() => {
    const tab = sp.get("tab");
    if (tab === "team" || tab === "ai") {
      router.replace("/account?tab=members");
    } else {
      router.replace("/account");
    }
  }, [router, sp]);
  return null;
}

export default function EnterprisePage() {
  return (
    <Suspense fallback={null}>
      <EnterpriseRedirect />
    </Suspense>
  );
}
