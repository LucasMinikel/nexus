// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// Site 100% estático: o build gera HTML/CSS/JS servidos por CDN, sem servidor ligado.
export default defineConfig({
  // URL pública, usada no feed RSS. No Cloudflare Pages, CF_PAGES_URL é definida automaticamente no build;
  // com domínio próprio, defina SITE_URL.
  site: process.env.SITE_URL ?? process.env.CF_PAGES_URL ?? 'http://localhost:4321',
  output: 'static',
  integrations: [react()],
  vite: {
    // O chunk do Three.js (~145 KB gzip) passa do aviso padrão; ele é carregado sob demanda só na home.
    build: { chunkSizeWarningLimit: 700 },
    // Um React só: se o doc-check for ligado por caminho local para desenvolver os dois juntos, ele traz o próprio
    // node_modules, e duas cópias do React quebram os hooks.
    resolve: { dedupe: ['react', 'react-dom'] },
    // O verificador analisa num Web Worker que importa módulos (ESM).
    worker: { format: 'es' },
  },
});
