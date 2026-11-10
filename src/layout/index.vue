<template>
  <el-container class="app-wrapper design-app">
    <el-aside width="220px" class="sidebar" :class="{ 'mobile-open': mobileOpen }">
      <div class="logo">
        <BrandLogo/>
        <span class="logo-text">玄成接单</span>
      </div>
      <el-menu
        :default-active="activeMenu"
        :default-openeds="moreActive ? ['more'] : []"
        router
        class="side-menu"
        background-color="transparent"
        text-color="#64748b"
        active-text-color="#165dff"
        @select="mobileOpen = false"
      >
        <el-menu-item v-for="r in mainRoutes" :key="r.path" :index="'/' + r.path">
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
        <!-- 不常用的页面收进「更多」，侧栏只留每天要用的 -->
        <el-sub-menu v-if="moreRoutes.length" index="more">
          <template #title>
            <el-icon><Menu /></el-icon>
            <span class="menu-title">更多</span>
          </template>
          <el-menu-item v-for="r in moreRoutes" :key="r.path" :index="'/' + r.path">
            <el-icon><component :is="r.meta.icon" /></el-icon>
            <span class="menu-title">{{ r.meta.title }}</span>
          </el-menu-item>
        </el-sub-menu>
      </el-menu>
    </el-aside>

    <div v-if="mobileOpen" class="mobile-mask" @click="mobileOpen = false"></div>

    <el-container>
      <el-header class="header" :class="{'page-owned-header': isMobile}"><BrandLogo class="mobile-brand"/>
        <div class="left">
          <el-icon class="hamburger" :size="22" @click="mobileOpen = !mobileOpen"><Expand /></el-icon>
          <div class="title">{{ currentTitle }}</div>
        </div>
        <WorkSearch v-if="!isMobile" ref="jumpRef" class="header-search" :loading="searchLoading" />
        <el-button v-if="!isMobile" type="primary" plain class="header-quick" title="极速建单（Alt+N）" @click="quickCapture.show()"><el-icon><Lightning /></el-icon>极速建单</el-button>
        <div class="user">
          <el-avatar :size="30" :style="{ background: currentMember.color }">
            {{ currentMember.name.slice(-1) }}
          </el-avatar>
          <span class="name">{{ currentMember.name }}</span>
          <PendingBell v-if="!isMobile" />
          <el-icon class="key-icon" :size="18" title="修改密码" @click="pwdVisible = true"><Key /></el-icon>
          <el-icon class="logout" :size="18" title="退出登录" @click="doLogout"><SwitchButton /></el-icon>
        </div>
      </el-header>

      <el-main ref="mainRef" class="main thin-scroll" :data-page="route.path.slice(1)">
        <WorkSearch v-if="isMobile && route.name === 'Workbench'" :loading="searchLoading" />
        <router-view />
      </el-main>
    </el-container>

    <nav class="mobile-nav" aria-label="主导航">
      <router-link v-for="item in primaryNav" :key="item.path" :to="item.path" :class="{selected: route.path === item.path}" :aria-label="item.label">
        <el-badge :is-dot="item.path === '/workbench' && todoCount > 0"><el-icon><component :is="route.path===item.path && item.icon==='House'?'HomeFilled':route.path===item.path && item.icon==='User'?'UserFilled':item.icon" /></el-icon></el-badge><span>{{ item.label }}</span>
      </router-link>
    </nav>
    <QuickCapture ref="quickCapture" :show-fab="false" />
    <SettleDialog />
    <ChangePasswordDialog v-model:visible="pwdVisible" />
  </el-container>
</template>

<script setup>
import {syncQuotes,unreadQuotes,quotes} from '@/stores/quotes'
import WorkSearch from '@/components/WorkSearch.vue'
import PendingBell from '@/components/PendingBell.vue'
import BrandLogo from '@/components/board/BrandLogo.vue'
import { isMobile } from '@/utils/useMobile'
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { SwitchButton, Key, Menu } from '@element-plus/icons-vue'
import { ElMessageBox, ElNotification } from 'element-plus'
import { toast as ElMessage } from '@/utils/toast'
import { menuRoutes } from '@/router'

import QuickCapture from '@/components/QuickCapture.vue'
import SettleDialog from '@/components/SettleDialog.vue'
import ChangePasswordDialog from '@/components/ChangePasswordDialog.vue'
import { orders, approvals, pendingApprovals, currentMember, isBoss, syncOrders, signOutDevice, loadCollabConfig } from '@/mock/store'
import { applyPhraseConfig } from '@/utils/phrases'
import { todoItems } from '@/utils/todos'
import { hasBackgroundPush, showNotify } from '@/utils/notify'

// 浏览器标签页标题：有待办时前面带数字，切到别的标签也能看见
const BASE_TITLE = '玄成科技 · 接单系统'

const route = useRoute()
const router = useRouter()
const quickCapture = ref(null)
const activeMenu = computed(() => route.path)
// 「成员管理」「操作日志」只有总管理员看得到；员工的菜单里不放“数据站”，只留干活用得到的
const visibleRoutes = computed(() =>
  menuRoutes.filter((r) => !r.meta.hidden && (!r.meta.bossOnly || isBoss.value) && (!r.meta.bossMenuOnly || isBoss.value)).sort((a,b)=>['workbench','order','quotes','messages','approvals','customers','staff','dashboard','trash','audit','settings','mine'].indexOf(a.path)-['workbench','order','quotes','messages','approvals','customers','staff','dashboard','trash','audit','settings','mine'].indexOf(b.path))
)
// 侧栏分两组：每天用的直接摆出来，成员 / 回收站 / 日志 / 设置 / 我的 放进「更多」
const MORE_PATHS = ['staff', 'trash', 'audit', 'settings', 'mine']
const mainRoutes = computed(() => visibleRoutes.value.filter((r) => !MORE_PATHS.includes(r.path)))
const moreRoutes = computed(() => visibleRoutes.value.filter((r) => MORE_PATHS.includes(r.path)))
const moreActive = computed(() => MORE_PATHS.includes(route.path.slice(1)))
const primaryNav = [{path:'/workbench', label:'工作台', icon:'House'}, {path:'/order', label:'项目', icon:'FolderOpened'}, {path:'/messages', label:'消息', icon:'ChatDotRound'}, {path:'/mine', label:'我的', icon:'User'}]
const currentTitle = computed(() => route.meta.title || '玄成接单系统')
const mobileOpen = ref(false)

// ---- 顶部全局搜索 ----
const jumpRef = ref(null)
const searchLoading = ref(true)
function onJumpKey(event) {
  if (isMobile.value || event.defaultPrevented || event.isComposing || event.keyCode === 229) return
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName) || event.target?.isContentEditable
  const shortcut = (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) ||
    (event.key === '/' && !typing && !event.metaKey && !event.ctrlKey && !event.altKey)
  if (!shortcut) return
  const dialogs = document.querySelectorAll('[role="dialog"], [role="alertdialog"]')
  if (Array.from(dialogs).some(dialog => dialog.getClientRects().length > 0)) return
  event.preventDefault()
  jumpRef.value?.focus()
}
const pwdVisible = ref(false)
let orderPoller = null
let alive = true

// 每次只问服务端一个很轻的“变更戳”，项目有变化才重新拉列表；
// 第一次进入（force）一定拉一遍。
// 页面在后台（切到别的标签 / 最小化）也要继续查：不然标签页上的数字和桌面提醒都更新不了。
function refreshOrders(force = false) {
  const quoteRefresh = syncQuotes().then(checkAttention).catch(()=>{})
  const projectRefresh = syncOrders(force === true)
    .then(checkAttention)
    .catch((e) => {
      if (force === true) ElMessage.error('加载项目失败：' + e.message)
    })
  if (searchLoading.value) {
    Promise.all([quoteRefresh, projectRefresh]).then(() => { searchLoading.value = false })
  }
}

function refreshWhenVisible() {
  if (document.visibilityState === 'visible') refreshOrders()
}

onMounted(() => {
  refreshOrders(true)
  // 同一份设置里还带着客户沟通的「常用语」，顺手读出来
  loadCollabConfig().then(applyPhraseConfig)
  orderPoller = setInterval(refreshOrders, 10000)
  window.addEventListener('focus', refreshOrders)
  document.addEventListener('visibilitychange', refreshWhenVisible)
  window.addEventListener('keydown', onJumpKey)
})

onBeforeUnmount(() => {
  alive = false
  attnPrev = null
  document.title = BASE_TITLE
  if (orderPoller) clearInterval(orderPoller)
  window.removeEventListener('focus', refreshOrders)
  document.removeEventListener('visibilitychange', refreshWhenVisible)
  window.removeEventListener('keydown', onJumpKey)
})

async function doLogout() {
  // 顶部这个图标很小、紧挨着「修改密码」，先问一句，免得点错就被踢回登录页
  try {
    await ElMessageBox.confirm('确定退出登录吗？', '退出登录', { confirmButtonText: '退出', cancelButtonText: '取消', type: 'warning' })
  } catch {
    return
  }
  // 退出登录：清掉提醒的记录，标签页标题也恢复原样
  attnPrev = null
  document.title = BASE_TITLE
  try { await signOutDevice(); router.push('/login') }
  catch(e){ ElMessage.error(e.message || '退出未完成，请重试') }
}

const todoCount = computed(
  () =>
    // 和工作台「需要我处理」同一份清单（含老板的审批），再加上待处理的报价单
    todoItems.value.length + unreadQuotes.value.length
)

// 换页面时回到顶部（以前会停在上一个页面滚到的位置，打开项目管理看到的是半截看板）
const mainRef = ref(null)
watch(
  () => route.path,
  () => {
    const el = mainRef.value?.$el
    if (el) el.scrollTop = 0
    window.scrollTo(0, 0)
  }
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
  unreadQuotes.value.forEach(q=>list.push('q:'+q.id+':'+q.noticeVersion+':'+(q.replyVersion || 0)))
  if (isBoss.value) {
    quotes.value.filter(q=>q.creatorId===me && q.status==='pending')
      .forEach(q=>list.push('sent:'+q.id+':'+q.noticeVersion))
    pendingApprovals.value.forEach((a) => list.push('a:' + a.id))
    orders.forEach((o) => {
      if (o.unread?.includes(me)) list.push('u:' + o.id + ':' + (o.bugCount || 0) + ':' + (o.messageCount || 0) + ':' + (o.actionBugCount || 0))
    })
  } else {
    orders.forEach((o) => {
      if (o.assignState === 'pending') list.push('p:' + o.id)
      if (o.unread?.includes(me)) list.push('u:' + o.id + ':' + (o.bugCount || 0) + ':' + (o.messageCount || 0) + ':' + (o.actionBugCount || 0))
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
let lastProjectCounts = new Map()
let attnOwner = 0 // 上一次清单属于谁（换了人就当第一次）

function notifyItem(title, body, path) {
  showNotify('玄成接单 · ' + title, body, 'xc-' + path + '-' + title, '/#' + path).catch(() => {})
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
    const counts = new Map(orders.map(o => [o.id, { bugs: Number(o.bugCount || 0), messages: Number(o.messageCount || 0), actions: Number(o.actionBugCount || 0) }]))
    const arrivals = []
    if (attnPrev && attnOwner === me) for (const o of orders) {
      const previous = lastProjectCounts.get(o.id)
      if (!previous || !o.unread?.includes(me)) continue
      const latest = counts.get(o.id)
      const path = '/order?id=' + o.id
      if (latest.actions > previous.actions) arrivals.push({ title:'问题需处理', order:o, path:path+'&tab=bugs'+(o.actionBugId?'&bug='+o.actionBugId:'') })
      if (latest.bugs > previous.bugs) arrivals.push({ title:'新问题', order:o, path:path+'&tab=bugs'+(o.lastBugId?'&bug='+o.lastBugId:'') })
      if (latest.messages > previous.messages) arrivals.push({ title:'新消息', order:o, path:path+'&tab=chat'+(o.lastMessageId?'&entry='+o.lastMessageId:'') })
    }
    lastProjectCounts = counts
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
    for (const key of added) {
      const [kind,id]=key.split(':')
      if(kind!=='q' && kind!=='sent')continue
      const quote=quotes.value.find(q=>String(q.id)===id)
      if(!quote)continue
      const reply=kind==='q' && quote.replyVersion>0
      let title='新需求待报价'
      if(kind==='sent')title='报价邀请已发出'
      else if(reply)title='报价有新回复'
      else if(isBoss.value)title='收到新报价'
      const path='/quotes?id='+id+(reply?'&tab=chat':'')
      const body=[quote.quoteNo,quote.title===quote.quoteNo?'':quote.title].filter(Boolean).join(' · ')
      if(!document.hidden){
        const notice=ElNotification({title,message:body, duration:5500,onClick:()=>{router.push(path);notice.close()}})
      }
      if(!hasBackgroundPush())notifyItem(title,body,path)
    }
    if (hasBackgroundPush()) return
    const covered = new Set()
    for (const event of arrivals) {
      notifyItem(event.title, event.order.title, event.path)
      covered.add(String(event.order.id))
    }
    for (const key of added) {
      const [kind, id] = key.split(':')
      if (kind === 'a' || kind === 'r') {
        const approval = approvals.find(a => String(a.id) === id)
        if (approval) {
          notifyItem(kind === 'a' ? '待审批' : '申请有结果了', approval.orderTitle, '/approvals?id=' + id)
          covered.add(String(approval.orderId))
        }
      } else if (kind === 'p') {
        const project = orders.find(o => String(o.id) === id)
        if (project) notifyItem('新项目待接收', project.title, '/order?id=' + id)
        covered.add(id)
      }
    }
    for (const key of added.filter(k => k.startsWith('u:'))) {
      const id = key.split(':')[1]
      const project = orders.find(o => String(o.id) === id)
      if (project && !covered.has(id)) notifyItem('项目有新动态', project.title, '/order?id=' + id)
    }
  } catch (e) {
    // 提醒是锦上添花，出任何问题都不能影响页面
  }
}

function badgeOf(path) {
  if(path==='quotes')return unreadQuotes.value.length
  // 要处理的事都汇总在工作台「需要我处理」里：红点只挂在工作台；消息中心只是动态记录，不再挂一个几十的数字催人
  if (path === 'workbench') return todoCount.value
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
.header .left,
.header .user {
  flex: none;
  white-space: nowrap;
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
.key-icon {
  cursor: pointer;
  color: #909399;
  margin-left: 2px;
}
.key-icon:hover {
  color: #409eff;
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
