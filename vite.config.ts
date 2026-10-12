import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
// Emits sw.js with a per-build version and the shell file list (relative to the base, so it works under /baller-connection/ and /).
function serviceWorker(): Plugin {
  return {
    name: 'bc-service-worker',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const built = Object.keys(bundle).filter((f) => /\.(js|css)$/.test(f) && f.startsWith('assets/'));
      const shell = ['./', './index.html', './offline.html', './manifest.webmanifest', './icons/icon-192.png', ...built.map((f) => './' + f)];
      const version = Date.now().toString(36);
      const src = readFileSync(new URL('./pwa/sw.js', import.meta.url), 'utf8').replace('__VERSION__', version).replace('__SHELL__', JSON.stringify(shell));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: src });
    },
  };
}

// BASE: '/baller-connection/' for GitHub Pages (demo), '/' when the Worker serves the app.
export default defineConfig({ plugins: [react(), serviceWorker()], base: process.env.BASE ?? '/baller-connection/' });
