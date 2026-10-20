import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { federation } from '@module-federation/vite';

const PORT = 4201;

export default defineConfig(({ command, isPreview }) => ({
  // No build/preview, o remoto é servido pelo shell em /remotes/mapa/ (proxy no dev, mesmo caminho no deploy).
  base: command === 'build' || isPreview ? (process.env.MAPA_PUBLIC_URL ?? '/remotes/mapa/') : '/',
  plugins: [
    react(),
    federation({
      name: 'mapa',
      filename: 'remoteEntry.js',
      exposes: { './mount': './src/mount.tsx' },
      shared: {},
      dts: false,
    }),
  ],
  server: { port: PORT, strictPort: true, origin: `http://localhost:${PORT}` },
  preview: { port: PORT, strictPort: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 }, // maplibre-gl sozinho passa de 1 MB
}));
