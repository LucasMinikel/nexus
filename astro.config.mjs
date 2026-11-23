// @ts-check
import { realpathSync } from 'node:fs';
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// doc-check é um projeto irmão ligado por caminho local (file:../doc-check). O Vite segue o link até a pasta real,
// que fica fora deste projeto: o servidor de desenvolvimento precisa poder ler de lá.
const docCheck = realpathSync('node_modules/doc-check');

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
    // Um React só: o doc-check tem o próprio node_modules, e duas cópias quebram os hooks.
    resolve: { dedupe: ['react', 'react-dom'] },
    server: { fs: { allow: ['.', docCheck] } },
    // O verificador analisa num Web Worker que importa módulos (ESM).
    worker: { format: 'es' },
  },
});
