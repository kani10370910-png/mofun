"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ImageEditor } from "@/components/image/ImageEditor";
import { resolveTplInitial } from "@/lib/templateApply";

function ImageInner() {
  const sp = useSearchParams();
  const sub = sp.get("sub") ?? undefined;
  const query: Record<string, string | undefined> = {};
  sp.forEach((v, k) => {
    if (k !== "tpl" && k !== "sub") query[k] = v;
  });
  const initial = resolveTplInitial(sp.get("tpl"), sub ?? "event", query);
  return <ImageEditor initialSub={sub} initial={initial} />;
}

export default function ImagePage() {
  return (
    <Suspense fallback={null}>
      <ImageInner />
    </Suspense>
  );
}
