import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'

import App from './App.vue'
import router from './router'
import './styles/index.scss'

const app = createApp(App)

// 全量注册 Element Plus 图标，模板里可直接用 <DataLine /> 等
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.use(ElementPlus, { locale: zhCn })
app.use(router)
app.mount('#app')

import "./styles/design.scss"

import "./styles/faithful.scss"

if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', ({ data }) => {
  if (data?.type !== 'open-notification' || typeof data.path !== 'string') return
  if (['/messages', '/workbench', '/order', '/quotes', '/approvals'].includes(data.path.split('?')[0])) router.push(data.path)
})
