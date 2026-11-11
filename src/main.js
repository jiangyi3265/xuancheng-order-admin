import { createApp } from 'vue'
import 'element-plus/theme-chalk/base.css'
import 'element-plus/theme-chalk/el-message.css'
import 'element-plus/theme-chalk/el-message-box.css'
import 'element-plus/theme-chalk/el-notification.css'
import * as icons from './icons'
import App from './App.vue'
import router from './router'
import './styles/index.scss'

const app = createApp(App)

for (const [key, component] of Object.entries(icons)) {
  app.component(key, component)
}

app.use(router)
app.mount('#app')

import "./styles/design.scss"

import "./styles/faithful.scss"

if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', ({ data }) => {
  if (data?.type !== 'open-notification' || typeof data.path !== 'string') return
  if (['/messages', '/workbench', '/order', '/quotes', '/approvals'].includes(data.path.split('?')[0])) router.push(data.path)
})
