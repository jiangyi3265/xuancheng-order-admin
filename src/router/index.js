import { createRouter, createWebHashHistory } from 'vue-router'
import Layout from '@/layout/index.vue'
import { ensureMe, isBoss } from '@/mock/store'

export const menuRoutes = [
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
    meta: { title: '接单管理', icon: 'Tickets' }
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
    meta: { title: '数据站', icon: 'DataLine' }
  },
  {
    path: 'settings',
    name: 'Settings',
    component: () => import('@/views/settings/index.vue'),
    meta: { title: '设置', icon: 'Setting' }
  }
]

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login/index.vue')
  },
  {
    path: '/customer-login',
    name: 'CustomerLogin',
    component: () => import('@/views/customer-login/index.vue')
  },
  {
    path: '/intake',
    name: 'Intake',
    component: () => import('@/views/intake/index.vue')
  },
  {
    path: '/',
    component: Layout,
    redirect: '/workbench',
    children: menuRoutes
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

router.beforeEach(async (to) => {
  if (to.path === '/login') {
    return localStorage.getItem('token') ? '/' : true
  }
  if (to.path === '/customer-login') {
    return localStorage.getItem('customerToken') ? (to.query.redirect || '/intake') : true
  }
  if (to.path === '/intake') {
    if (!localStorage.getItem('customerToken')) {
      return { path: '/customer-login', query: { redirect: to.fullPath } }
    }
    return true
  }
  if (!localStorage.getItem('token')) return '/login'
  // 先确认“我是谁”（总管理员 / 下属管理员），取不到就回登录页
  if (!(await ensureMe())) return '/login'
  if (to.meta.bossOnly && !isBoss.value) return '/workbench'
  return true
})

export default router
