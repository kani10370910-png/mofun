"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { VideoEditor } from "@/components/video/VideoEditor";

function VideoInner() {
  const sp = useSearchParams();
  return <VideoEditor initialSub={sp.get("sub") ?? undefined} initialInput={sp.get("input") ?? undefined} />;
}

export default function VideoPage() {
  return (
    <Suspense fallback={null}>
      <VideoInner />
    </Suspense>
  );
}
