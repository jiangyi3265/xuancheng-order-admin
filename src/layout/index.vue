<template>
  <el-container class="app-wrapper">
    <el-aside width="220px" class="sidebar" :class="{ 'mobile-open': mobileOpen }">
      <div class="logo">
        <el-icon :size="22"><Histogram /></el-icon>
        <span class="logo-text">玄成 · 接单系统</span>
      </div>
      <el-menu
        :default-active="activeMenu"
        router
        class="side-menu"
        background-color="#304156"
        text-color="#bfcbd9"
        active-text-color="#ffffff"
        @select="mobileOpen = false"
      >
        <el-menu-item v-for="r in menuRoutes" :key="r.path" :index="'/' + r.path">
          <el-icon><component :is="r.meta.icon" /></el-icon>
          <span>{{ r.meta.title }}</span>
          <el-badge v-if="badgeOf(r.path)" :value="badgeOf(r.path)" class="menu-badge" type="danger" />
        </el-menu-item>
      </el-menu>
    </el-aside>

    <div v-if="mobileOpen" class="mobile-mask" @click="mobileOpen = false"></div>

    <el-container>
      <el-header class="header">
        <div class="left">
          <el-icon class="hamburger" :size="22" @click="mobileOpen = !mobileOpen"><Expand /></el-icon>
          <div class="title">{{ currentTitle }}</div>
        </div>
        <div class="user">
          <span class="role-tip">当前视角</span>
          <el-radio-group :model-value="currentRole" size="small" @change="switchRole">
            <el-radio-button value="boss">老板</el-radio-button>
            <el-radio-button value="employee">员工</el-radio-button>
          </el-radio-group>
          <el-avatar :size="30" :style="{ background: currentMember.color }">
            {{ currentMember.name.slice(-1) }}
          </el-avatar>
          <span class="name">{{ currentMember.name }}</span>
          <el-icon class="logout" :size="18" title="退出登录" @click="doLogout"><SwitchButton /></el-icon>
        </div>
      </el-header>

      <el-main class="main thin-scroll">
        <router-view />
      </el-main>
    </el-container>

    <QuickCapture />
  </el-container>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { SwitchButton } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { menuRoutes } from '@/router'
import QuickCapture from '@/components/QuickCapture.vue'
import { orders, currentRole, currentMember, switchRole, loadOrders, logout } from '@/mock/store'
import { isMyTodo } from '@/utils/workbench'

const route = useRoute()
const router = useRouter()
const activeMenu = computed(() => route.path)
const currentTitle = computed(() => route.meta.title || '玄成接单系统')
const mobileOpen = ref(false)

onMounted(() => {
  loadOrders().catch((e) => ElMessage.error('加载订单失败：' + e.message))
})

function doLogout() {
  logout()
  router.push('/login')
}

const todoCount = computed(
  () => orders.filter((o) => isMyTodo(o, currentMember.value.id)).length
)
const unreadCount = computed(
  () => orders.filter((o) => o.unread?.includes(currentMember.value.id)).length
)
function badgeOf(path) {
  if (path === 'workbench') return todoCount.value
  if (path === 'order') return unreadCount.value
  return 0
}
</script>

<style scoped>
.app-wrapper {
  height: 100vh;
}
.sidebar {
  background: #304156;
  overflow: hidden;
}
.logo {
  height: 56px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 18px;
  color: #fff;
  background: #2b3a4d;
}
.logo-text {
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;
}
.side-menu {
  border-right: none;
}
.menu-badge {
  margin-left: 8px;
}
.header {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  border-bottom: 1px solid #e6e8eb;
}
.header .left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.hamburger {
  display: none;
  cursor: pointer;
  color: #606266;
}
.header .title {
  font-size: 17px;
  font-weight: 600;
}
.header .user {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  color: #606266;
}
.role-tip {
  font-size: 12px;
  color: #909399;
}
.logout {
  cursor: pointer;
  color: #909399;
  margin-left: 2px;
}
.logout:hover {
  color: #f56c6c;
}
.main {
  background: #f0f2f5;
  padding: 16px;
  overflow-y: auto;
}
.mobile-mask {
  display: none;
}

@media (max-width: 768px) {
  .sidebar {
    position: fixed;
    top: 0;
    left: -240px;
    height: 100vh;
    z-index: 2001;
  }
  .sidebar.mobile-open {
    left: 0 !important;
  }
  .hamburger {
    display: inline-flex;
  }
  .mobile-mask {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 2000;
  }
  .header .title {
    font-size: 16px;
  }
  .role-tip,
  .header .name {
    display: none;
  }
  .main {
    padding: 10px;
  }
}
</style>
