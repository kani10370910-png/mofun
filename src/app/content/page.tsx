"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ContentEditor } from "@/components/content/ContentEditor";

function ContentInner() {
  const sp = useSearchParams();
  return (
    <ContentEditor
      initialSub={sp.get("sub") ?? undefined}
      initialInput={sp.get("input") ?? undefined}
      initialProduct={sp.get("product") ?? undefined}
    />
  );
}

export default function ContentPage() {
  return (
    <Suspense fallback={null}>
      <ContentInner />
    </Suspense>
  );
}
