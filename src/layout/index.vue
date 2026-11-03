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
        <el-menu-item v-for="r in visibleRoutes" :key="r.path" :index="'/' + r.path">
          <el-icon><component :is="r.meta.icon" /></el-icon>
          <span class="menu-content">
            <span class="menu-title">{{ r.meta.title }}</span>
            <el-badge
              v-if="badgeOf(r.path)"
              :value="badgeOf(r.path)"
              :max="99"
              class="menu-badge"
              type="danger"
            />
          </span>
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
          <el-tag size="small" effect="plain" :type="isBoss ? 'primary' : 'info'">
            {{ roleName(currentMember.role) }}
          </el-tag>
          <el-avatar :size="30" :style="{ background: currentMember.color }">
            {{ currentMember.name.slice(-1) }}
          </el-avatar>
          <span class="name">{{ currentMember.name }}</span>
          <el-icon
            v-if="notifySupported"
            class="bell"
            :class="{ 'bell-on': notifyStatus === 'on', 'bell-denied': notifyStatus === 'denied' }"
            :size="18"
            :title="bellTitle"
            @click="onBellClick"
          >
            <component :is="notifyStatus === 'on' ? BellFilled : Bell" />
          </el-icon>
          <el-icon class="logout" :size="18" title="修改密码" @click="pwdVisible = true"><Key /></el-icon>
          <el-icon class="logout" :size="18" title="退出登录" @click="doLogout"><SwitchButton /></el-icon>
        </div>
      </el-header>

      <el-main class="main thin-scroll">
        <router-view />
      </el-main>
    </el-container>

    <QuickCapture />
    <SettleDialog />
    <ChangePasswordDialog v-model:visible="pwdVisible" />
  </el-container>
</template>

<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { SwitchButton, Key, Bell, BellFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { menuRoutes } from '@/router'
import { roleName } from '@/constants/options'
import QuickCapture from '@/components/QuickCapture.vue'
import SettleDialog from '@/components/SettleDialog.vue'
import ChangePasswordDialog from '@/components/ChangePasswordDialog.vue'
import { orders, approvals, pendingApprovals, currentMember, isBoss, syncOrders, logout } from '@/mock/store'
import { isMyTodo } from '@/utils/workbench'
import { isNotifySupported, notifyState, enableNotify, disableNotify, showNotify } from '@/utils/notify'

// 浏览器标签页标题：有待办时前面带数字，切到别的标签也能看见
const BASE_TITLE = '玄成科技 · 接单系统'

const route = useRoute()
const router = useRouter()
const activeMenu = computed(() => route.path)
// 「成员管理」「操作日志」只有总管理员看得到；员工的菜单里不放“数据站”，只留干活用得到的
const visibleRoutes = computed(() =>
  menuRoutes.filter((r) => (!r.meta.bossOnly || isBoss.value) && (!r.meta.bossMenuOnly || isBoss.value))
)
const currentTitle = computed(() => route.meta.title || '玄成接单系统')
const mobileOpen = ref(false)
const pwdVisible = ref(false)
let orderPoller = null
let alive = true

// 桌面提醒（浏览器通知）：手机浏览器大多不支持，这时小铃铛整个不显示
const notifySupported = isNotifySupported()
const notifyStatus = ref(notifyState())
const bellTitle = computed(() => {
  if (notifyStatus.value === 'on') return '桌面提醒已开启，点一下关闭'
  if (notifyStatus.value === 'denied') return '浏览器里禁止了通知，请在地址栏左边的设置里允许'
  return '点这里开启桌面提醒（网页开着、最小化也能收到）'
})

// 每次只问服务端一个很轻的“变更戳”，项目有变化才重新拉列表；
// 第一次进入（force）一定拉一遍。
// 页面在后台（切到别的标签 / 最小化）也要继续查：不然标签页上的数字和桌面提醒都更新不了。
function refreshOrders(force = false) {
  // 浏览器里随时可能改通知权限，顺手同步一下铃铛状态
  notifyStatus.value = notifyState()
  syncOrders(force === true)
    .then(checkAttention)
    .catch((e) => {
      if (force === true) ElMessage.error('加载订单失败：' + e.message)
    })
}

onMounted(() => {
  refreshOrders(true)
  orderPoller = setInterval(refreshOrders, 10000)
  window.addEventListener('focus', refreshOrders)
  document.addEventListener('visibilitychange', refreshOrders)
})

onBeforeUnmount(() => {
  alive = false
  attnPrev = null
  document.title = BASE_TITLE
  if (orderPoller) clearInterval(orderPoller)
  window.removeEventListener('focus', refreshOrders)
  document.removeEventListener('visibilitychange', refreshOrders)
})

function doLogout() {
  // 退出登录：清掉提醒的记录，标签页标题也恢复原样
  attnPrev = null
  document.title = BASE_TITLE
  logout()
  router.push('/login')
}

const todoCount = computed(
  () =>
    orders.filter((o) => isMyTodo(o, currentMember.value.id)).length +
    (isBoss.value ? pendingApprovals.value.length : 0)
)

// 标签页标题：(3) 玄成科技 · 接单系统
watch(
  todoCount,
  (n) => {
    document.title = (n > 0 ? '(' + n + ') ' : '') + BASE_TITLE
  },
  { immediate: true }
)

// ---------- 桌面提醒 ----------
// 「等我处理的事」的清单，每一项是一个字符串键：
//   老板：a:申请号（待批准的申请）、u:项目号（有新动态没看的项目）
//   员工：p:项目号（老板派来、还没接收）、u:项目号（有新动态没看）、r:申请号:结果（我的申请有结果了）
const attention = computed(() => {
  const me = currentMember.value.id
  const list = []
  if (!me) return list
  if (isBoss.value) {
    pendingApprovals.value.forEach((a) => list.push('a:' + a.id))
    orders.forEach((o) => {
      if (o.unread?.includes(me)) list.push('u:' + o.id)
    })
  } else {
    orders.forEach((o) => {
      if (o.assignState === 'pending') list.push('p:' + o.id)
      if (o.unread?.includes(me)) list.push('u:' + o.id)
    })
    approvals.forEach((a) => {
      if (a.requesterId === me && (a.status === 'approved' || a.status === 'rejected')) {
        list.push('r:' + a.id + ':' + a.status)
      }
    })
  }
  return list
})

let attnPrev = null // 上一次的清单；null 表示登录后还没算过
let attnOwner = 0 // 上一次清单属于谁（换了人就当第一次）

// 把“新出现的事”写成一句人话
function notifyText(added) {
  const addedSet = new Set(added)
  const count = (prefix) => added.filter((k) => k.startsWith(prefix)).length
  const parts = []
  if (isBoss.value) {
    const a = count('a:')
    // 有待批申请的项目本身会变成“未读”，不再重复算成“新动态”
    const waiting = new Set(pendingApprovals.value.map((x) => String(x.orderId)))
    const u = added.filter((k) => k.startsWith('u:') && !waiting.has(k.slice(2))).length
    if (a) parts.push(`有 ${a} 条新申请等你批准`)
    if (u) parts.push(`${u} 个项目有新动态`)
  } else {
    const p = count('p:')
    // 新派来的项目本身带着“未读”，不再重复算成“新动态”
    // 申请有结果的项目也会变成“未读”，同样不重复算
    const decided = new Set(
      added
        .filter((k) => k.startsWith('r:'))
        .map((k) => {
          const a = approvals.find((x) => 'r:' + x.id + ':' + x.status === k)
          return a ? String(a.orderId) : ''
        })
    )
    const u = added.filter((k) => k.startsWith('u:') && !addedSet.has('p:' + k.slice(2)) && !decided.has(k.slice(2))).length
    const r = count('r:')
    if (p) parts.push(`老板派给你 ${p} 个新项目，请接收`)
    if (u) parts.push(`${u} 个项目有新动态`)
    if (r) parts.push(r === 1 ? '你的申请有结果了' : `你的 ${r} 条申请有结果了`)
  }
  return parts.join('；')
}

// 每次刷新完项目后对一下清单：
// 登录后第一次只记下来（不提醒）；之后出现新的项目才提醒，而且只在人不在页面上时才弹。
function checkAttention() {
  if (!alive) return
  try {
    const me = currentMember.value.id
    if (!me) {
      // 已经退出登录
      attnPrev = null
      attnOwner = 0
      return
    }
    const list = attention.value
    const now = new Set(list)
    if (attnPrev === null || attnOwner !== me) {
      attnPrev = now
      attnOwner = me
      return
    }
    const added = list.filter((k) => !attnPrev.has(k))
    attnPrev = now
    if (!added.length) return
    // 人就在页面上（没切走、没最小化），不用再弹
    if (!document.hidden && document.hasFocus()) return
    const text = notifyText(added)
    if (text) showNotify('玄成 · 接单系统', text, 'xc-todo')
  } catch (e) {
    // 提醒是锦上添花，出任何问题都不能影响页面
  }
}

async function onBellClick() {
  const state = notifyStatus.value
  if (state === 'denied') {
    ElMessage.warning('浏览器里禁止了通知，请在地址栏左边的设置里允许')
    return
  }
  if (state === 'on') {
    disableNotify()
    notifyStatus.value = notifyState()
    ElMessage.info('桌面提醒已关闭')
    return
  }
  const next = await enableNotify()
  notifyStatus.value = next
  if (next === 'on') {
    ElMessage.success('已开启：有新的待办会弹出提醒（需要保持这个网页开着）')
  } else if (next === 'denied') {
    ElMessage.warning('浏览器里禁止了通知，请在地址栏左边的设置里允许')
  } else {
    ElMessage.info('没有开启成功，请在浏览器弹出的询问里选「允许」')
  }
}
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
.side-menu :deep(.el-menu-item) {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-right: 18px;
}
.menu-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
  flex: 1;
}
.menu-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.menu-badge {
  flex: 0 0 auto;
  line-height: 1;
}
.menu-badge :deep(.el-badge__content) {
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  border: 1px solid #fff;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  line-height: 16px;
  box-shadow: 0 2px 8px rgba(245, 108, 108, 0.24);
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
.logout {
  cursor: pointer;
  color: #909399;
  margin-left: 2px;
}
.logout:hover {
  color: #f56c6c;
}
.bell {
  cursor: pointer;
  color: #909399;
  margin-left: 2px;
}
.bell:hover {
  color: #409eff;
}
.bell.bell-on {
  color: #409eff;
}
.bell.bell-denied {
  color: #c0c4cc;
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
  /* 手机浏览器的地址栏、工具栏不会收起（页面是在 .main 里滚的），100vh 会比看得见的区域高，
     底部那一截被藏在工具栏后面；用 100dvh（看得见的高度），不认识的旧浏览器自动沿用上面的 100vh */
  .app-wrapper {
    height: 100dvh;
  }
  .sidebar {
    position: fixed;
    top: 0;
    left: -240px;
    height: 100vh;
    height: 100dvh;
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
  .header .name {
    display: none;
  }
  .main {
    padding: 10px;
    /* 给右下角悬浮的「极速建单」留位置，最后一张卡片不会被它盖住 */
    padding-bottom: 88px;
  }
}
</style>
