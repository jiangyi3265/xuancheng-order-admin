import { createRouter, createWebHashHistory } from 'vue-router'
import Layout from '@/layout/index.vue'
import { ensureMe, isBoss, recoverWechatLogin } from '@/mock/store'
import { prepareChatDraftSession } from '@/utils/chatDraft'

export const menuRoutes = [
  {path:'quotes',component:()=>import('@/views/quotes/index.vue'),meta:{title:'报价中心',icon:'PriceTag'}},
  { path: 'messages', component: () => import('@/views/messages/index.vue'), meta: { title: '消息中心', icon: 'ChatDotRound' } },
  { path: 'mine', component: () => import('@/views/mine/index.vue'), meta: { title: '我的', icon: 'User' } },
  { path: 'approvals', component: () => import('@/views/approvals/index.vue'), meta: { title: '审批中心', icon: 'Finished' } },
  { path: 'security', component: () => import('@/views/security/index.vue'), meta: { title: '账号安全', hidden: true } },
  {
    path: 'workbench',
    name: 'Workbench',
    component: () => import('@/views/workbench/index.vue'),
    meta: { title: '工作台', icon: 'Checked' }
  },
  {
    path: 'order',
    name: 'Order',
    component: () => import('@/views/order/index.vue'),
    meta: { title: '项目管理', icon: 'Tickets' }
  },
  {
    path: 'trash',
    name: 'Trash',
    component: () => import('@/views/trash/index.vue'),
    meta: { title: '回收站', icon: 'Delete' }
  },
  {
    path: 'customers',
    name: 'Customers',
    component: () => import('@/views/customers/index.vue'),
    meta: { title: '客户账号', icon: 'User' }
  },
  {
    path: 'staff',
    name: 'Staff',
    component: () => import('@/views/staff/index.vue'),
    meta: { title: '成员管理', icon: 'UserFilled', bossOnly: true }
  },
  {
    path: 'audit',
    name: 'Audit',
    component: () => import('@/views/audit/index.vue'),
    meta: { title: '操作日志', icon: 'Document', bossOnly: true }
  },
  {
    path: 'dashboard',
    name: 'Dashboard',
    component: () => import('@/views/dashboard/index.vue'),
    meta: { title: '数据统计', icon: 'DataLine', bossMenuOnly: true }
  },
  {
    path: 'settings',
    name: 'Settings',
    component: () => import('@/views/settings/index.vue'),
    meta: { title: '通知设置', icon: 'Setting' }
  }
]

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login/index.vue')
  },
  { path: '/customer-login', redirect: to => ({ path: '/login', query: to.query }) },
  {
    path: '/projects',
    component: () => import('@/customer/Layout.vue'),
    meta: { customer: true },
    children: [
      { path: '', component: () => import('@/customer/views/projects/index.vue'), meta: { customerTab: 'projects' } },
      { path: ':id', component: () => import('@/customer/views/projects/detail.vue'), meta: { customerTab: 'projects' } },
      { path: '/intake', component: () => import('@/customer/views/intake/index.vue'), meta: { customerTab: 'intake' } },
      { path: '/customer/messages', component: () => import('@/customer/views/messages/index.vue'), meta: { customerTab: 'messages' } },
      { path: '/customer/mine', component: () => import('@/views/mine/index.vue'), meta: { customerTab: 'mine' } },
      { path: '/customer/security', component: () => import('@/views/security/index.vue'), meta: { customerTab: 'mine' } }
    ]
  },
  {
    path: '/',
    component: Layout,
    redirect: '/workbench',
    children: menuRoutes
  },
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

router.beforeEach(async (to) => {
  await recoverWechatLogin()
  await prepareChatDraftSession()
  const customer = !!localStorage.getItem('customerToken')
  const staff = !!localStorage.getItem('token')
  if (to.path === '/login') return customer ? '/projects' : staff ? '/workbench' : true
  if (to.meta.customer) {
    if (customer) return true
    if (staff) return '/workbench'
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  // 没登录时记住要去的页面（比如微信推送里的项目链接），登录后直接打开
  if (!staff) return customer ? '/projects' : { path: '/login', query: { redirect: to.fullPath } }
  if (!(await ensureMe())) return { path: '/login', query: { redirect: to.fullPath } }
  if ((to.meta.bossOnly || to.meta.bossMenuOnly) && !isBoss.value) return '/workbench'
  return true
})

export default router
