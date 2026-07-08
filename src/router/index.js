import { createRouter, createWebHashHistory } from 'vue-router'
import Layout from '@/layout/index.vue'

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
    path: 'customers',
    name: 'Customers',
    component: () => import('@/views/customers/index.vue'),
    meta: { title: '客户账号', icon: 'User' }
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

router.beforeEach((to) => {
  if (to.path === '/login' || to.path === '/customer-login') return true
  if (to.path === '/intake') {
    if (!localStorage.getItem('customerToken')) {
      return { path: '/customer-login', query: { redirect: to.fullPath } }
    }
    return true
  }
  if (!localStorage.getItem('token')) return '/login'
  return true
})

export default router
