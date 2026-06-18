"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ResearchView } from "@/components/research/ResearchView";

function ResearchInner() {
  const sp = useSearchParams();
  return <ResearchView initialSub={sp.get("sub") ?? undefined} />;
}

export default function ResearchPage() {
  return (
    <Suspense fallback={null}>
      <ResearchInner />
    </Suspense>
  );
}
