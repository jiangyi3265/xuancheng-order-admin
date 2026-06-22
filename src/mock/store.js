import { reactive, ref, computed } from 'vue'
import { MEMBERS } from '@/constants/options'

// ============================================================
// 数据层：对接若依后端 /jiedan/order/**（vite 代理转发到 :8080）
// 组件依旧 import { orders, createOrder, ... } from '@/mock/store'
// 接口签名保持不变，内部改为调用后端，响应回写到响应式 orders。
// ============================================================

const BASE = '/jiedan/order'

// ---------- 登录态 ----------
export const token = ref(localStorage.getItem('token') || '')
export function isAuthed() {
  return !!token.value
}
export async function login(username, password) {
  const res = await fetch('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })
  const j = await res.json()
  if (j.code !== 200) throw new Error(j.msg || '登录失败')
  token.value = j.token
  localStorage.setItem('token', j.token)
  return true
}
export function logout() {
  token.value = ''
  localStorage.removeItem('token')
}

async function http(url, opts = {}) {
  const { headers: h, ...rest } = opts
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(token.value ? { Authorization: 'Bearer ' + token.value } : {}),
      ...(h || {})
    },
    ...rest
  })
  const json = await res.json()
  if (json.code === 401) {
    logout()
    if (location.hash !== '#/login') location.hash = '#/login'
    throw new Error('登录已过期，请重新登录')
  }
  if (json.code !== 200) throw new Error(json.msg || '请求失败')
  return json.data
}

// ---------- 当前视角（老板 / 员工） ----------
export const currentRole = ref('boss')
export const currentMember = computed(
  () => MEMBERS.find((m) => m.role === currentRole.value) || MEMBERS[0]
)
export function switchRole(role) {
  currentRole.value = role
}

// ---------- 响应式订单列表（组件直接读它） ----------
export const orders = reactive([])

// 用服务器返回对象“原地更新”已存在的订单，保持引用不变（详情抽屉等能实时刷新）
function upsert(vo) {
  if (!vo) return
  const i = orders.findIndex((o) => o.id === vo.id)
  if (i > -1) Object.assign(orders[i], vo)
  else orders.unshift(vo)
}

// ---------- 加载 ----------
export async function loadOrders() {
  const data = await http(`${BASE}/list`)
  orders.splice(0, orders.length, ...(data || []))
  return orders
}

// ---------- 增删改（签名与原来一致） ----------
export async function createOrder(data) {
  const me = currentMember.value
  const payload = { ...data, byMemberId: me.id, byUserName: me.name }
  const vo = await http(BASE, { method: 'POST', body: JSON.stringify(payload) })
  if (vo) orders.unshift(vo)
  return vo
}

export async function editOrder(data) {
  const payload = { ...data, byMemberId: currentMember.value.id }
  const vo = await http(BASE, { method: 'PUT', body: JSON.stringify(payload) })
  upsert(vo)
  return vo
}

export async function removeOrder(id) {
  await http(`${BASE}/${id}`, { method: 'DELETE' })
  const i = orders.findIndex((o) => o.id === id)
  if (i > -1) orders.splice(i, 1)
}

export async function addProgress(id, content, type = 'note', attachments = []) {
  const me = currentMember.value
  const payload = {
    orderId: id,
    content,
    type,
    attachments: attachments || [],
    byMemberId: me.id,
    byUserName: me.name
  }
  const vo = await http(`${BASE}/progress`, { method: 'POST', body: JSON.stringify(payload) })
  upsert(vo)
  return vo
}

export async function setStatus(id, status) {
  const me = currentMember.value
  const vo = await http(`${BASE}/status`, {
    method: 'PUT',
    body: JSON.stringify({ id, status, byMemberId: me.id, byUserName: me.name })
  })
  upsert(vo)
  return vo
}

export async function markRead(id, memberId) {
  const vo = await http(`${BASE}/read`, {
    method: 'PUT',
    body: JSON.stringify({ id, memberId })
  })
  upsert(vo)
  return vo
}

// 改稿 +1
export async function addRevision(id) {
  const me = currentMember.value
  const vo = await http(`${BASE}/revision`, {
    method: 'POST',
    body: JSON.stringify({ id, byMemberId: me.id, byUserName: me.name })
  })
  upsert(vo)
  return vo
}

// 催一下（推送对方）
export async function nudge(id) {
  const me = currentMember.value
  const vo = await http(`${BASE}/nudge`, {
    method: 'POST',
    body: JSON.stringify({ id, byMemberId: me.id, byUserName: me.name })
  })
  upsert(vo)
  return vo
}

// ---------- 推送设置 ----------
export async function getPushConfig() {
  return await http('/jiedan/push/config')
}
export async function savePushConfig(cfg) {
  await http('/jiedan/push/config', { method: 'POST', body: JSON.stringify(cfg) })
}
export async function testPush(memberId) {
  const res = await fetch('/jiedan/push/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memberId })
  })
  const j = await res.json()
  return j.msg || j.data || '已发送'
}

// 兼容旧引用：本地时间字符串
export function now() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// 订单加载由布局在登录后触发（见 layout/index.vue），避免未登录页被 401 跳转
