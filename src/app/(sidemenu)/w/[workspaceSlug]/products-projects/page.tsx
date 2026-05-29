'use client';

import { ProductsViewTabs } from '~/app/_components/products/ProductsViewTabs';
import { WorkspaceProductsProjects } from '~/app/_components/products/WorkspaceProductsProjects';

export default function ProductsProjectsPage() {
  return (
    <div className="flex h-full flex-col text-text-primary">
      <ProductsViewTabs />
      <WorkspaceProductsProjects />
    </div>
  );
}
