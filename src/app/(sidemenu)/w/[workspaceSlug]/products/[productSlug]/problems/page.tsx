"use client";

// Problems folded into Insights as type=PROBLEM (ADR-0036). This route redirects
// any bookmarked /problems URLs to the unified /insights surface.

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function ProblemsRedirect() {
  const params = useParams();
  const router = useRouter();

  useEffect(() => {
    router.replace(
      `/w/${params.workspaceSlug as string}/products/${params.productSlug as string}/insights`,
    );
  }, [params, router]);

  return null;
}
