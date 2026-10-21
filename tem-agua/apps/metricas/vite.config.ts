import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { federation } from '@module-federation/vite';

const PORT = 4203;

export default defineConfig(({ command, isPreview }) => ({
  // No build/preview, o remoto é servido pelo shell em /remotes/metricas/ (proxy no dev, mesmo caminho no deploy).
  base: command === 'build' || isPreview ? (process.env.METRICAS_PUBLIC_URL ?? '/remotes/metricas/') : '/',
  plugins: [
    vue(),
    federation({
      name: 'metricas',
      filename: 'remoteEntry.js',
      exposes: { './mount': './src/mount.ts' },
      shared: {},
      dts: false,
    }),
  ],
  // Modo standalone (npm run dev -w apps/metricas): a API vem do proxy, como no shell.
  server: {
    port: PORT,
    strictPort: true,
    origin: `http://localhost:${PORT}`,
    proxy: { '/api': 'http://localhost:4300' },
  },
  preview: { port: PORT, strictPort: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 2500 }, // maplibre-gl + echarts
}));
