"use client";

import { useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Skeleton, Container, Stack } from "@mantine/core";

function OkrRedirectContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Redirect to goals page with okrs tab active, preserving year/period params
    const workspaceSlug = pathname.split("/w/")[1]?.split("/")[0];
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "okrs");
    router.replace(`/w/${workspaceSlug}/goals?${params.toString()}`);
  }, [router, pathname, searchParams]);

  return (
    <Container size="lg" className="py-8">
      <Stack gap="md">
        <Skeleton height={60} />
        <Skeleton height={100} />
        <Skeleton height={200} />
      </Stack>
    </Container>
  );
}

export default function OkrsPage() {
  return (
    <main className="flex h-full flex-col items-center justify-start text-text-primary">
      <Suspense
        fallback={
          <Container size="lg" className="py-8">
            <Stack gap="md">
              <Skeleton height={60} />
              <Skeleton height={100} />
              <Skeleton height={200} />
            </Stack>
          </Container>
        }
      >
        <OkrRedirectContent />
      </Suspense>
    </main>
  );
}
