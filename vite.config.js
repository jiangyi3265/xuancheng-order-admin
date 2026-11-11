import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

// 后端地址默认 8080；本机 8080 被占用时可用环境变量 XC_BACKEND 指向别处
const BACKEND = process.env.XC_BACKEND || 'http://localhost:8080'

export default defineConfig({
  plugins: [vue(), Components({ dts: false, dirs: [], resolvers: [ElementPlusResolver()] })],
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
      '/login': { target: BACKEND, changeOrigin: true },
      '/getInfo': { target: BACKEND, changeOrigin: true },
      '/captchaImage': { target: BACKEND, changeOrigin: true }
    }
  },
  preview: {
    port: 4173,
    host: true,
    proxy: {
      '/jiedan': { target: BACKEND, changeOrigin: true },
      '/login': { target: BACKEND, changeOrigin: true },
      '/getInfo': { target: BACKEND, changeOrigin: true },
      '/captchaImage': { target: BACKEND, changeOrigin: true }
    }
  }
})
