import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';

interface NodeProcessLike {
  env?: Record<string, string | undefined>;
}

const nodeEnv = (globalThis as { process?: NodeProcessLike }).process?.env;
const appBuildId =
  nodeEnv?.VERCEL_GIT_COMMIT_SHA ||
  nodeEnv?.GITHUB_SHA ||
  new Date().toISOString();

function emitVersionFilePlugin(buildId: string): Plugin {
  return {
    name: 'emit-version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ buildId }, null, 2),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), emitVersionFilePlugin(appBuildId)],
  define: {
    __APP_BUILD_ID__: JSON.stringify(appBuildId),
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    css: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/test/**',
        'src/types/**',
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
  },
});
