import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { federation } from '@module-federation/vite';

const PORT = 4202;

export default defineConfig(({ command, isPreview }) => ({
  // No build/preview, o remoto é servido pelo shell em /remotes/painel/ (proxy no dev, mesmo caminho no deploy).
  base: command === 'build' || isPreview ? (process.env.PAINEL_PUBLIC_URL ?? '/remotes/painel/') : '/',
  plugins: [
    vue(),
    federation({
      name: 'painel',
      filename: 'remoteEntry.js',
      exposes: { './mount': './src/mount.ts' },
      shared: {},
      dts: false,
    }),
  ],
  server: { port: PORT, strictPort: true, origin: `http://localhost:${PORT}` },
  preview: { port: PORT, strictPort: true },
  build: { target: 'es2022' },
}));
