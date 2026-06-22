import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const BACKEND = 'http://localhost:8080'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5173,
    open: false,
    host: true,
    proxy: {
      // 前端调后端接口自动转发到若依，避免跨域
      '/jiedan': { target: BACKEND, changeOrigin: true },
      '/login': { target: BACKEND, changeOrigin: true }
    }
  },
  preview: {
    port: 4173,
    host: true,
    proxy: {
      '/jiedan': { target: BACKEND, changeOrigin: true },
      '/login': { target: BACKEND, changeOrigin: true }
    }
  }
})
