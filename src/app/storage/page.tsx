"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { StorageView } from "@/components/storage/StorageView";

type Tab = "works" | "materials" | "brand";

function StorageInner() {
  const sp = useSearchParams();
  const tab = sp.get("tab");
  const valid: Tab[] = ["works", "materials", "brand"];
  const initialTab = (valid.includes(tab as Tab) ? tab : "works") as Tab;
  return <StorageView initialTab={initialTab} />;
}

export default function StoragePage() {
  return (
    <Suspense fallback={null}>
      <StorageInner />
    </Suspense>
  );
}
