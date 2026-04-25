import { defineConfig } from 'vitest/config';
import path from 'path';
import react from '@vitejs/plugin-react';

const alias = {
  '~': path.resolve(__dirname, './src'),
};

export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        plugins: [react()],
        test: {
          name: 'unit',
          environment: 'happy-dom',
          setupFiles: ['./src/test/setup.ts'],
          include: ['**/*.test.{ts,tsx}'],
          exclude: ['node_modules', '.next', '.worktrees', '**/*.integration.test.ts'],
          globals: true,
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'integration',
          environment: 'node',
          setupFiles: ['./src/test/integration-setup.ts'],
          include: ['**/*.integration.test.ts'],
          exclude: ['node_modules', '.next', '.worktrees'],
          globals: true,
          testTimeout: 30000,
          hookTimeout: 120000,
          fileParallelism: false,
        },
      },
    ],
  },
});
