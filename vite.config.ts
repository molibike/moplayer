import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    target: process.env.TAURI_PLATFORM == 'windows' ? 'chrome105' : 'safari13',
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
    // 不将 Tauri API 标记为 external；确保在生产构建中正常打包
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      onwarn(warning, warn) {
        // 过滤第三方依赖 file-type 的 eval 提示，避免问题窗口的噪音
        if (warning.code === 'EVAL' && typeof warning.id === 'string' && warning.id.includes('node_modules/file-type/core.js')) {
          return;
        }
        warn(warning);
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@tauri-apps')) return 'tauri';
            if (id.includes('react')) return 'react';
            return 'vendor';
          }
        }
      }
    }
  },
  define: {
    global: 'globalThis',
  },
  resolve: {
    alias: {
      buffer: 'buffer',
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
    exclude: ['@tauri-apps/api', '@tauri-apps/plugin-dialog', '@tauri-apps/plugin-fs']
  },
})