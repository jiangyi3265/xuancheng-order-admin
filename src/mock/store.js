import { reactive, ref, computed } from 'vue'
import { MEMBERS } from '@/constants/options'

const BASE = '/jiedan/order'

export const token = ref(localStorage.getItem('token') || '')
export const customerToken = ref(localStorage.getItem('customerToken') || '')
export const customerName = ref(localStorage.getItem('customerName') || '')

export function isAuthed() {
  return !!token.value
}

export function isCustomerAuthed() {
  return !!customerToken.value
}

async function postLogin(username, password) {
  const res = await fetch('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })
  const j = await res.json()
  if (j.code !== 200) throw new Error(j.msg || '登录失败')
  return j.token
}

export async function login(username, password) {
  const nextToken = await postLogin(username, password)
  token.value = nextToken
  localStorage.setItem('token', nextToken)
  return true
}

export function logout() {
  token.value = ''
  localStorage.removeItem('token')
}

export async function customerLogin(username, password) {
  const nextToken = await postLogin(username, password)
  customerToken.value = nextToken
  customerName.value = username
  localStorage.setItem('customerToken', nextToken)
  localStorage.setItem('customerName', username)
  return true
}

export function customerLogout() {
  customerToken.value = ''
  customerName.value = ''
  localStorage.removeItem('customerToken')
  localStorage.removeItem('customerName')
}

async function authedHttp(url, opts = {}, tokenRef = token, onExpired = logout, redirectHash = '#/login') {
  const { headers: h, ...rest } = opts
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(tokenRef.value ? { Authorization: 'Bearer ' + tokenRef.value } : {}),
      ...(h || {})
    },
    ...rest
  })
  const json = await res.json()
  if (json.code === 401) {
    onExpired()
    if (location.hash !== redirectHash) location.hash = redirectHash
    throw new Error('登录已过期，请重新登录')
  }
  if (json.code !== 200) throw new Error(json.msg || '请求失败')
  return json.data
}

async function http(url, opts = {}) {
  return authedHttp(url, opts, token, logout, '#/login')
}

export async function customerHttp(url, opts = {}) {
  return authedHttp(url, opts, customerToken, customerLogout, '#/customer-login')
}

export const currentRole = ref('boss')
export const currentMember = computed(
  () => MEMBERS.find((m) => m.role === currentRole.value) || MEMBERS[0]
)

export function switchRole(role) {
  currentRole.value = role
}

export const orders = reactive([])

function upsert(vo) {
  if (!vo) return
  const i = orders.findIndex((o) => o.id === vo.id)
  if (i > -1) Object.assign(orders[i], vo)
  else orders.unshift(vo)
}

export async function loadOrders() {
  const data = await http(`${BASE}/list`)
  orders.splice(0, orders.length, ...(data || []))
  return orders
}

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

export async function addRevision(id) {
  const me = currentMember.value
  const vo = await http(`${BASE}/revision`, {
    method: 'POST',
    body: JSON.stringify({ id, byMemberId: me.id, byUserName: me.name })
  })
  upsert(vo)
  return vo
}

export async function nudge(id) {
  const me = currentMember.value
  const vo = await http(`${BASE}/nudge`, {
    method: 'POST',
    body: JSON.stringify({ id, byMemberId: me.id, byUserName: me.name })
  })
  upsert(vo)
  return vo
}

export async function getPushConfig() {
  return await http('/jiedan/push/config')
}

export async function savePushConfig(cfg) {
  await http('/jiedan/push/config', { method: 'POST', body: JSON.stringify(cfg) })
}

export async function testPush(memberId) {
  return await http('/jiedan/push/test', {
    method: 'POST',
    body: JSON.stringify({ memberId })
  })
}

export async function runDeadlineReminder() {
  return await http('/jiedan/push/reminder', { method: 'POST' })
}

export function now() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
