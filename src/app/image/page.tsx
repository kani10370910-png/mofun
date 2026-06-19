"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ImageEditor } from "@/components/image/ImageEditor";

function ImageInner() {
  const sp = useSearchParams();
  const initial: Record<string, string | undefined> = {};
  sp.forEach((v, k) => (initial[k] = v));
  return <ImageEditor initialSub={sp.get("sub") ?? undefined} initial={initial} />;
}

export default function ImagePage() {
  return (
    <Suspense fallback={null}>
      <ImageInner />
    </Suspense>
  );
}
