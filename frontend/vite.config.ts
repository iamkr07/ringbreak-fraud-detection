import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/health': 'http://127.0.0.1:8000',
      '/transactions': 'http://127.0.0.1:8000',
      '/events': 'http://127.0.0.1:8000',
      '/traces': 'http://127.0.0.1:8000',
      '/investigations': 'http://127.0.0.1:8000',
      '/scenarios': 'http://127.0.0.1:8000',
      '/system': 'http://127.0.0.1:8000',
      '/amlsim': 'http://127.0.0.1:8000',
      '/rings': 'http://127.0.0.1:8000',
      '/demo': 'http://127.0.0.1:8000',
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
