<template>
  <nav :class="isMobile ? 'mobile-nav customer-nav' : 'customer-side-links'" aria-label="客户导航">
    <router-link v-for="item in items" :key="item.key" :to="item.path"
      :class="{ selected: active === item.key }" :aria-current="active === item.key ? 'page' : undefined">
      <el-icon aria-hidden="true"><component :is="active === item.key ? (item.activeIcon || item.icon) : item.icon" /></el-icon>
      <span>{{ item.key==='projects' && singleProject ? '我的需求' : item.label }}</span>
    </router-link>
  </nav>
</template>

<script setup>
import { isMobile } from '@/utils/useMobile'

defineProps({ active: { type: String, default: 'projects' }, singleProject: Boolean })
const items = [
  { key: 'projects', path: '/projects', label: '我的项目', icon: 'House', activeIcon: 'HomeFilled' },
  { key: 'intake', path: '/intake', label: '提交需求', icon: 'DocumentAdd' },
  { key: 'messages', path: '/customer/messages', label: '消息', icon: 'ChatDotRound' },
  { key: 'mine', path: '/customer/mine', label: '我的', icon: 'User', activeIcon: 'UserFilled' }
]
</script>

<style scoped>
.customer-side-links { display: grid; gap: 6px; }
.customer-side-links a { display: flex; align-items: center; gap: 12px; min-height: 46px; padding: 0 16px; border-radius: 10px; font-size: 15px; color: #52627a; }
.customer-side-links .el-icon { font-size: 18px; }
.customer-side-links a:hover { background: #f3f6fb; }
.customer-side-links a.selected { background: #eaf1ff; color: #175ad8; font-weight: 600; }
</style>
