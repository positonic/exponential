"use client";

// The insights list moved to /insights (ADR-0036). This route redirects for any
// bookmarked /research URLs. The Research *session* subroutes (/research/new,
// /research/[researchId]) are unaffected — they are the untouched Research entity.

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function ResearchRedirect() {
  const params = useParams();
  const router = useRouter();

  useEffect(() => {
    router.replace(
      `/w/${params.workspaceSlug as string}/products/${params.productSlug as string}/insights`,
    );
  }, [params, router]);

  return null;
}
