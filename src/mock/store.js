import { reactive, ref, computed } from 'vue'
import { setStaff, memberMap } from '@/constants/options'
import { hasPendingUploads } from '@/utils/upload'

const BASE = '/jiedan/order'
const REQUEST_TIMEOUT = 15000

export const token = ref(localStorage.getItem('token') || '')
export const customerToken = ref(localStorage.getItem('customerToken') || '')
export const customerName = ref(localStorage.getItem('customerName') || '')

export function isAuthed() {
  return !!token.value
}

export function isCustomerAuthed() {
  return !!customerToken.value
}

export async function getCaptcha() {
  const res = await fetch('/captchaImage')
  const json = await res.json()
  if (json.code !== 200) throw new Error(json.msg || 'captcha failed')
  return json
}

async function postLogin(username, password, captcha = {}) {
  const res = await fetch('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, code: captcha.code || '', uuid: captcha.uuid || '' })
  })
  const j = await res.json()
  if (j.code !== 200) throw new Error(j.msg || '登录失败')
  return j.token
}

export async function login(username, password, captcha) {
  const nextToken = await postLogin(username, password, captcha)
  token.value = nextToken
  localStorage.setItem('token', nextToken)
  try {
    await loadMe()
  } catch (e) {
    logout()
    // 客户账号能登录成功，但没有后台权限
    if (String(e.message || '').includes('没有权限')) {
      throw new Error('该账号不是后台账号，客户请从客户端登录')
    }
    throw e
  }
  return true
}

export function logout() {
  token.value = ''
  localStorage.removeItem('token')
  // 清掉内存里的身份和项目，避免同一浏览器换账号登录后看到上一个人的数据
  me.value = null
  orders.splice(0, orders.length)
  setStaff([])
}

export async function customerLogin(username, password, captcha) {
  const nextToken = await postLogin(username, password, captcha)
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
  const { headers: h, retry = true, ...rest } = opts
  const method = String(rest.method || 'GET').toUpperCase()
  if (!['GET', 'HEAD'].includes(method) && hasPendingUploads()) {
    throw new Error('附件正在上传，请稍候')
  }

  let json
  let lastError
  const attempts = retry && method === 'GET' ? 2 : 1
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
    try {
      const res = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...(tokenRef.value ? { Authorization: 'Bearer ' + tokenRef.value } : {}),
          ...(h || {})
        },
        signal: controller.signal,
        ...rest
      })
      json = await res.json().catch(() => null)
      if (!json) throw new Error(res.ok ? '服务器返回异常' : `服务器暂时不可用（${res.status}）`)
      if (res.status >= 500 && attempt + 1 < attempts) throw new Error('服务器暂时繁忙')
      break
    } catch (e) {
      json = null
      lastError = e
      if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, 450))
    } finally {
      clearTimeout(timeout)
    }
  }
  if (!json) {
    if (lastError?.name === 'AbortError') throw new Error('加载超时，请检查网络后重试')
    throw new Error(lastError?.message || '网络连接失败，请稍后重试')
  }
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

export async function adminHttp(url, opts = {}) {
  return http(url, opts)
}

export async function customerHttp(url, opts = {}) {
  return authedHttp(url, opts, customerToken, customerLogout, '#/customer-login')
}

// 当前登录人：身份来自登录令牌，由后端 /jiedan/staff/me 返回，页面上不能手动切换
export const me = ref(null)
export const isBoss = computed(() => me.value?.role === 'boss')
export const currentMember = computed(() => {
  const m = me.value
  if (!m) return { id: 0, name: '', role: 'employee', roleLabel: '', color: '#909399' }
  return (
    memberMap[m.id] || {
      id: m.id,
      name: m.nickName || m.userName,
      role: m.role,
      roleLabel: m.roleLabel,
      color: m.role === 'boss' ? '#409eff' : '#67c23a'
    }
  )
})

export async function loadStaff() {
  const list = await http('/jiedan/staff/list')
  setStaff(list || [])
  return list
}

export async function loadMe() {
  me.value = await http('/jiedan/staff/me')
  await loadStaff().catch(() => {})
}

// 路由守卫用：有令牌但还没取过身份时去取一次；失败（过期/无权限）就清掉令牌
export async function ensureMe() {
  if (!token.value) return false
  if (me.value) return true
  try {
    await loadMe()
    return true
  } catch (e) {
    logout()
    return false
  }
}

// ---------- 成员管理（仅总管理员） ----------
export async function createStaff(payload) {
  return await http('/jiedan/staff', { method: 'POST', body: JSON.stringify(payload) })
}

export async function resetStaffPwd(userId, password) {
  return await http('/jiedan/staff/reset', {
    method: 'PUT',
    body: JSON.stringify({ userId, password })
  })
}

export async function setStaffStatus(userId, status) {
  return await http('/jiedan/staff/status', {
    method: 'PUT',
    body: JSON.stringify({ userId, status })
  })
}

export async function deleteStaff(userId) {
  return await http('/jiedan/staff/' + userId, { method: 'DELETE' })
}

export const orders = reactive([])

function upsert(vo) {
  if (!vo) return null
  const i = orders.findIndex((o) => o.id === vo.id)
  if (i > -1) {
    Object.assign(orders[i], vo)
    return orders[i]
  }
  orders.unshift(vo)
  return vo
}

export async function loadOrders() {
  const data = await http(`${BASE}/list`)
  const existing = new Map(orders.map((o) => [o.id, o]))
  const next = (data || []).map((vo) => {
    const current = existing.get(vo.id)
    if (!current) return vo
    const loadedVersion = current.version
    const hasLoadedDetail = Array.isArray(current.timeline)
    Object.assign(current, vo)
    // The detail poll compares its loaded version with the server version.
    // Do not let a lightweight list refresh acknowledge unseen detail changes.
    if (hasLoadedDetail) current.version = loadedVersion
    return current
  })
  orders.splice(0, orders.length, ...next)
  return orders
}

export async function getOrder(id) {
  return upsert(await http(`${BASE}/${id}`))
}

export async function getOrderVersion(id) {
  return await http(`${BASE}/${id}/version`)
}

// 操作人由后端按登录令牌确定，请求里不再带“我是谁”
export async function createOrder(data) {
  const vo = await http(BASE, { method: 'POST', body: JSON.stringify({ ...data }) })
  if (vo) orders.unshift(vo)
  return vo
}

export async function editOrder(data) {
  const vo = await http(BASE, { method: 'PUT', body: JSON.stringify({ ...data }) })
  upsert(vo)
  return vo
}

export async function removeOrder(id) {
  await http(`${BASE}/${id}`, { method: 'DELETE' })
  const i = orders.findIndex((o) => o.id === id)
  if (i > -1) orders.splice(i, 1)
}

export async function createBug(id, content, attachments = []) {
  const payload = {
    orderId: id,
    content,
    attachments: attachments || []
  }
  const vo = await http(`${BASE}/bug`, { method: 'POST', body: JSON.stringify(payload) })
  upsert(vo)
  return vo
}

export async function deleteBug(id) {
  const vo = await http(`${BASE}/bug/${id}`, { method: 'DELETE' })
  upsert(vo)
  return vo
}

export async function appendBugUpdate(id, content, attachments = []) {
  const payload = {
    content,
    attachments: attachments || []
  }
  const vo = await http(`${BASE}/bug/${id}/update`, { method: 'POST', body: JSON.stringify(payload) })
  upsert(vo)
  return vo
}

export async function updateBugStatus(id, status) {
  const vo = await http(`${BASE}/bug/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status })
  })
  upsert(vo)
  return vo
}

export async function addProgress(id, content, type = 'note', attachments = []) {
  const payload = {
    orderId: id,
    content,
    type,
    attachments: attachments || []
  }
  const vo = await http(`${BASE}/progress`, { method: 'POST', body: JSON.stringify(payload) })
  upsert(vo)
  return vo
}

export async function setStatus(id, status) {
  const vo = await http(`${BASE}/status`, {
    method: 'PUT',
    body: JSON.stringify({ id, status })
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
  const vo = await http(`${BASE}/revision`, {
    method: 'POST',
    body: JSON.stringify({ id })
  })
  upsert(vo)
  return vo
}

export async function nudge(id) {
  const vo = await http(`${BASE}/nudge`, {
    method: 'POST',
    body: JSON.stringify({ id })
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

// ---------- 项目记事本（内部台账） ----------
export async function getOrderNotes(id) {
  return await http(`${BASE}/notes/${id}`)
}

export async function saveOrderNotes(id, notes, noteAttachments = []) {
  return await http(`${BASE}/notes`, {
    method: 'PUT',
    body: JSON.stringify({ id, notes, noteAttachments })
  })
}

// ---------- 客户账号管理 ----------
export async function listCustomers() {
  return await http('/jiedan/customer/list')
}

export async function createCustomer(payload) {
  return await http('/jiedan/customer', { method: 'POST', body: JSON.stringify(payload) })
}

export async function resetCustomerPwd(userId, password) {
  return await http('/jiedan/customer/reset', {
    method: 'PUT',
    body: JSON.stringify({ userId, password })
  })
}

export async function deleteCustomer(userId) {
  return await http('/jiedan/customer/' + userId, { method: 'DELETE' })
}

// 把客户转交给另一位管理员负责（仅总管理员）
export async function setCustomerOwner(userId, ownerId) {
  return await http('/jiedan/customer/owner', {
    method: 'PUT',
    body: JSON.stringify({ userId, ownerId })
  })
}

export function now() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
