import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// BASE: '/baller-connection/' for GitHub Pages (demo), '/' when the Worker serves the app.
export default defineConfig({ plugins: [react()], base: process.env.BASE ?? '/baller-connection/' });
