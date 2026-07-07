"use client";

import { useParams } from "next/navigation";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";
import {
  ProductOverview,
  OverviewSkeleton,
} from "~/app/_components/product/overview/ProductOverview";

export default function ProductOverviewPage() {
  const params = useParams();
  const productSlug = params.productSlug as string;
  const { workspace, workspaceId } = useWorkspace();

  const { data: product, isLoading } = api.product.product.getBySlug.useQuery(
    { workspaceId: workspaceId ?? "", slug: productSlug },
    { enabled: !!workspaceId && !!productSlug },
  );

  if (!workspace) return null;
  const basePath = `/w/${workspace.slug}/products/${productSlug}`;

  if (!product) {
    // Skeleton while the product resolves; the layout handles not-found.
    return isLoading ? (
      <div className="product-overview">
        <OverviewSkeleton />
      </div>
    ) : null;
  }

  return (
    <ProductOverview
      product={{
        id: product.id,
        name: product.name,
        slug: product.slug,
        color: product.color,
        funTicketIds: product.funTicketIds,
      }}
      basePath={basePath}
    />
  );
}
