import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    strictPort: true,
    proxy: { '/api': process.env.DEVRECALL_API_URL || 'http://127.0.0.1:3001' },
    host: '127.0.0.1',
  },
  build: { outDir: 'dist' },
});
