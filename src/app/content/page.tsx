"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ContentEditor } from "@/components/content/ContentEditor";
import { resolveTplInitial } from "@/lib/templateApply";

function ContentInner() {
  const sp = useSearchParams();
  const sub = sp.get("sub") ?? undefined;
  const query: Record<string, string | undefined> = {};
  sp.forEach((v, k) => {
    if (k !== "tpl" && k !== "sub") query[k] = v;
  });
  const initial = resolveTplInitial(sp.get("tpl"), sub ?? "social", query);
  return (
    <ContentEditor
      initialSub={sub}
      initialInput={initial.input ?? initial.title}
      initialProduct={initial.product}
      initialBrand={initial.brand}
      initialAudience={initial.audience}
      initialAdvantage={initial.advantage}
      initialKeywords={initial.keywords}
      initialTitle={initial.title}
      initialPlatforms={initial.platforms}
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
