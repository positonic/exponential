'use client';

import { ProductsViewTabs } from '~/app/_components/products/ProductsViewTabs';
import { ProductRoadmapBoard } from '~/app/_components/products/ProductRoadmapBoard';

export default function ProductsRoadmapPage() {
  return (
    <div className="flex h-full flex-col text-text-primary">
      <ProductsViewTabs />
      <ProductRoadmapBoard />
    </div>
  );
}
