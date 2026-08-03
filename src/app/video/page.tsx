"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { VideoEditor } from "@/components/video/VideoEditor";
import { resolveTplInitial } from "@/lib/templateApply";

function VideoInner() {
  const sp = useSearchParams();
  const sub = sp.get("sub") ?? undefined;
  const query: Record<string, string | undefined> = {};
  sp.forEach((v, k) => {
    if (k !== "tpl" && k !== "sub") query[k] = v;
  });
  const initial = resolveTplInitial(sp.get("tpl"), sub ?? "oneline", query);
  return (
    <VideoEditor
      initialSub={sub}
      initialInput={initial.input ?? sp.get("input") ?? undefined}
      initialFrom={sp.get("from") ?? undefined}
      initialName={sp.get("name") ?? undefined}
      initialPid={sp.get("pid") ?? undefined}
      initialReedit={sp.get("reedit") ?? undefined}
    />
  );
}

export default function VideoPage() {
  return (
    <Suspense fallback={null}>
      <VideoInner />
    </Suspense>
  );
}
