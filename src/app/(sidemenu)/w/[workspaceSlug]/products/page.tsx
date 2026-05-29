'use client';

import Link from 'next/link';
import { Button } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { ProductsViewTabs } from '~/app/_components/products/ProductsViewTabs';
import { WorkspaceProductsList } from '~/app/_components/products/WorkspaceProductsList';

export default function ProductsListPage() {
  const { workspace } = useWorkspace();
  const basePath = workspace ? `/w/${workspace.slug}/products` : '';

  return (
    <div className="flex h-full flex-col text-text-primary">
      <ProductsViewTabs
        actions={
          workspace ? (
            <Button
              component={Link}
              href={`${basePath}/new`}
              leftSection={<IconPlus size={16} />}
              color="brand"
              size="xs"
            >
              New product
            </Button>
          ) : undefined
        }
      />
      <WorkspaceProductsList />
    </div>
  );
}
