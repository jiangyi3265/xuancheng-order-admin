import {inWeChat,rememberWechatSession,restoreWechatSession,forgetWechatSession} from '@/utils/wechatSession'
import { clearProjectDrafts } from '@/utils/projectDraft'
import { clearProjectList } from '@/utils/projectListState'
import { disableNotify } from '@/utils/notify'
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

const systemError = '系统出了点问题，请稍后再试'
const networkError = '网络连不上，请检查网络后重试'

async function requestJson(url, init) {
  let response
  try {
    response = await fetch(url, init)
  } catch (error) {
    if (error.name === 'AbortError') throw error
    throw new Error(networkError)
  }
  if (response.status >= 500) {
    console.error('接口异常', response.status, await response.text())
    throw new Error(systemError)
  }
  try {
    return await response.json()
  } catch (error) {
    console.error('接口响应格式异常', error)
    throw new Error(systemError)
  }
}

export async function getCaptcha() {
  const json = await requestJson('/captchaImage')
  if (json.code !== 200) throw new Error(friendlyMessage(json.msg || '验证码加载失败'))
  return json
}

async function postLogin(username, password, captcha = {}) {
  const j = await requestJson('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, code: captcha.code || '', uuid: captcha.uuid || '' })
  })
  if (j.code !== 200) throw new Error(friendlyMessage(j.msg || '登录失败'))
  return j.token
}

let deviceRestore
export async function recoverWechatLogin() {
  if (!inWeChat || token.value || customerToken.value) return
  if (!deviceRestore) deviceRestore = restoreWechatSession().then(value=>{
    if (value && !token.value && !customerToken.value) {
      token.value=value
      localStorage.setItem('token',value)
    }
  }).catch(()=>{deviceRestore=null})
  await deviceRestore
}

export async function signOutDevice() {
  if(inWeChat) {
    await forgetWechatSession(token.value || customerToken.value)
    deviceRestore = Promise.resolve()
  }
  logout()
  customerLogout()
}

export async function login(username, password, captcha, rememberDevice=inWeChat) {
  const nextToken = await postLogin(username, password, captcha)
  // Determine the role from the server, using the same successful login once.
  const identity = await requestJson('/getInfo', { headers: { Authorization: 'Bearer ' + nextToken } })
  if (identity.code !== 200) throw new Error(friendlyMessage(identity.msg || '无法确认账号身份'))
  const roles = identity.roles || []
  const customer = roles.includes('customer')
  if (inWeChat) {
    if (rememberDevice && !customer) await rememberWechatSession(nextToken)
    else await forgetWechatSession()
    deviceRestore = Promise.resolve()
  }
  logout()
  customerLogout()
  if (customer) {
    customerToken.value = nextToken
    customerName.value = identity.user?.nickName || username
    localStorage.setItem('customerToken', nextToken)
    localStorage.setItem('customerName', customerName.value)
    localStorage.setItem('customerAccount', identity.user?.userName || username)
    return 'customer'
  }
  token.value = nextToken
  localStorage.setItem('token', nextToken)
  try { await loadMe() } catch (e) { logout(); throw e }
  return 'staff'
}

export function logout() {
  if (token.value || localStorage.getItem('xc.notify.binding')) disableNotify()
  token.value = ''
  localStorage.removeItem('token')
  // 清掉内存里的身份和项目，避免同一浏览器换账号登录后看到上一个人的数据
  me.value = null
  deliverySettings.value = null
  orders.splice(0, orders.length)
  ordersReady.value = false
  ordersError.value = ''
  orderListRequest++
  clearProjectList()
  clearProjectDrafts()
  approvals.splice(0, approvals.length)
  lastStamp = null
  setStaff([])
}

export async function customerLogin(username, password, captcha) {
  const nextToken = await postLogin(username, password, captcha)
  customerToken.value = nextToken
  customerName.value = username
  localStorage.setItem('customerToken', nextToken)
  localStorage.setItem('customerName', username)
  localStorage.setItem('customerAccount', username)
  return true
}

export function customerLogout() {
  customerToken.value = ''
  customerName.value = ''
  localStorage.removeItem('customerToken')
  localStorage.removeItem('customerName')
  localStorage.removeItem('customerAccount')
}

async function authedHttp(url, opts = {}, tokenRef = token, onExpired = logout, redirectHash = '#/login') {
  const { headers: h, retry = true, redirectOnExpiry = true, timeoutMs = REQUEST_TIMEOUT, ...rest } = opts
  const requestToken = tokenRef.value
  const sessionMatches = () => requestToken === tokenRef.value &&
    (tokenRef !== customerToken || requestToken === localStorage.getItem('customerToken'))
  if (tokenRef === customerToken && !sessionMatches()) throw new Error('登录账号已变更，请刷新页面')
  const method = String(rest.method || 'GET').toUpperCase()
  if (!['GET', 'HEAD'].includes(method) && hasPendingUploads()) {
    throw new Error('附件正在上传，请稍候')
  }

  let json
  let lastError
  const attempts = retry && method === 'GET' ? 2 : 1
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      json = await requestJson(url, {
        headers: {
          'Content-Type': 'application/json',
          ...(requestToken ? { Authorization: 'Bearer ' + requestToken } : {}),
          ...(h || {})
        },
        signal: controller.signal,
        ...rest
      })
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
  if (tokenRef === customerToken && !sessionMatches()) throw new Error('登录账号已变更，请刷新页面')
  if (json.code === 401) {
    if (requestToken && requestToken === tokenRef.value) {
      onExpired()
      const current = location.hash.slice(1)
      if (redirectOnExpiry && !/^\/(?:customer-)?login(?:\?|$)/.test(current)) {
        location.hash = redirectHash + (current ? '?redirect=' + encodeURIComponent(current) : '')
      }
    }
    throw new Error('登录已过期，请重新登录')
  }
  if (json.code !== 200) throw Object.assign(new Error(friendlyMessage(json.msg)), { code: json.code })
  return json.data
}

// 服务器内部出错时 msg 里可能是一大段数据库 / 程序报错，用户看不懂也不该看到：换成一句人话
export function friendlyMessage(msg) {
  const text = String(msg || '').trim()
  if (!text) return '请求失败，请稍后重试'
  if (/###|SQL|Exception|java\.|org\.|nested exception|Cause:|\bat [a-z]+\.[a-z]/i.test(text) || text.length > 200) {
    console.error('接口异常', text)
    return systemError
  }
  return text
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
  me.value = await http('/jiedan/staff/me', { redirectOnExpiry: false })
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
export const ordersReady = ref(false)
export const ordersError = ref('')
let orderListRequest = 0

// 申请（员工的改报价/取消/删除/收款）：老板看到全部，员工只看到自己的
export const approvals = reactive([])
export const pendingApprovals = computed(() => approvals.filter((a) => a.status === 'pending'))

// Lists omit these fields. When a newer list arrives first, an older full
// response can still fill the drawer without rolling back the card or its counts.
const detailFields = new Set(['attachments', 'payments', 'collaborators', 'nextOwnerName', 'bugs', 'timeline'])
const orderVersions = new WeakMap()
const reminderVersions = new WeakMap()
export function latestOrderVersion(order) {
  return Math.max(Number(order.version || 0), orderVersions.get(order) || 0)
}
function mergeOrder(current, incoming, summary = false) {
  const { unread, myMention, version: rawVersion, ...fields } = incoming
  const version = Number(rawVersion || 0)
  const currentVersion = Number(current.version || 0)
  const newestOrder = orderVersions.get(current) ?? currentVersion
  const newestReminder = reminderVersions.get(current) ?? currentVersion
  const hasDetail = Array.isArray(current.timeline)
  const acceptDetail = !summary && (!hasDetail || version >= currentVersion)
  const acceptOrder = version >= newestOrder
  orderVersions.set(current, Math.max(newestOrder, version))
  for (const [key, value] of Object.entries(fields)) {
    if (detailFields.has(key) ? acceptDetail : acceptOrder) current[key] = value
  }
  if (summary && acceptOrder) {
    // The summary omits these keys when the last message or single action target disappears.
    current.lastMessage = incoming.lastMessage ?? null
    current.actionBugId = incoming.actionBugId ?? null
  }
  // The drawer polls against the last complete detail version.
  if (acceptDetail || (!hasDetail && acceptOrder)) current.version = version
  reminderVersions.set(current, Math.max(newestReminder, version))
  if (version < newestReminder) return
  if (Array.isArray(unread)) current.unread = unread
  if (summary || myMention !== undefined) current.myMention = myMention || null
}

function upsert(vo) {
  if (!vo) return null
  const i = orders.findIndex((o) => o.id === vo.id)
  if (i > -1) {
    mergeOrder(orders[i], vo)
    return orders[i]
  }
  orders.unshift(vo)
  return vo
}

export async function loadOrders() {
  const request = ++orderListRequest
  if (!ordersReady.value) ordersError.value = ''
  let data
  try {
    data = await http(`${BASE}/list`)
    if (!Array.isArray(data)) throw new Error('服务器未返回项目列表')
  } catch (err) {
    if (request === orderListRequest && !ordersReady.value) ordersError.value = err.message || '连接失败'
    throw err
  }
  if (request !== orderListRequest) return orders
  const existing = new Map(orders.map((o) => [o.id, o]))
  const next = (data || []).map((vo) => {
    const current = existing.get(vo.id)
    if (!current) return vo
    mergeOrder(current, vo, true)
    return current
  })
  orders.splice(0, orders.length, ...next)
  ordersReady.value = true
  ordersError.value = ''
  return orders
}

// 变更戳：服务端用一个很轻的接口告诉我们“项目有没有变化”，没变化就不用重新拉整个列表。
// 每个人每 10 秒一次的整表请求，就变成了一个几十字节的小请求。
let lastStamp = null
export async function syncOrders(force = false) {
  const session = token.value
  let stamp
  try {
    const response = await http(`${BASE}/stamp`)
    stamp = response.stamp
  } catch (err) {
    if (session && session === token.value && !ordersReady.value) ordersError.value = err.message || '连接失败'
    throw err
  }
  if (!session || session !== token.value) return false
  if (ordersReady.value && !force && stamp === lastStamp) return false
  await loadOrders()
  await loadApprovals().catch(() => {})
  if (token.value === session) lastStamp = stamp
  return true
}

// 下载 Excel：带登录令牌请求，再把返回内容保存成文件
export async function exportOrders(filters = {}) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== '' && v !== null && v !== undefined) params.set(k, String(v))
  })
  const res = await fetch(`${BASE}/export?${params.toString()}`, {
    headers: token.value ? { Authorization: 'Bearer ' + token.value } : {}
  })
  const type = res.headers.get('content-type') || ''
  if (type.includes('json')) {
    const j = await res.json().catch(() => null)
    if (j?.code === 401) {
      logout()
      if (location.hash !== '#/login') location.hash = '#/login'
      throw new Error('登录已过期，请重新登录')
    }
    throw new Error(j?.msg || '导出失败')
  }
  if (!res.ok) throw new Error(`导出失败（${res.status}）`)
  const blob = await res.blob()
  const disposition = res.headers.get('content-disposition') || ''
  const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition)
  const filename = star ? decodeURIComponent(star[1]) : '接单列表.xlsx'
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
  return filename
}

// ---------- 回收站 ----------
export async function listTrash() {
  return await http(`${BASE}/trash`)
}

export async function restoreOrder(id) {
  await http(`${BASE}/${id}/restore`, { method: 'PUT' })
  await syncOrders(true)
}

// 彻底删除（仅总管理员），不可恢复
export async function purgeOrder(id) {
  await http(`${BASE}/${id}/purge`, { method: 'DELETE' })
}

// ---------- 操作日志（仅总管理员） ----------
export async function listAudit(params = {}) {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== '' && v !== null && v !== undefined) q.set(k, String(v))
  })
  return await http(`/jiedan/audit/list?${q.toString()}`)
}

// ---------- 修改自己的密码 ----------
export async function changeMyPassword(oldPassword, newPassword) {
  return await http('/jiedan/account/password', {
    method: 'PUT',
    body: JSON.stringify({ oldPassword, newPassword })
  })
}

export function fetchOrderDetail(id) {
  return http(`${BASE}/${id}`)
}

export async function getOrder(id) {
  const session = token.value
  const detail = await fetchOrderDetail(id)
  return session === token.value ? upsert(detail) : null
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

// ---------- 流转：接收 / 拒绝 / 交回 / 退回返工 ----------
function dropLocal(id) {
  const i = orders.findIndex((o) => o.id === id)
  if (i > -1) orders.splice(i, 1)
}

export async function acceptOrder(id) {
  const vo = await http(`${BASE}/${id}/accept`, { method: 'POST', body: '{}' })
  return upsert(vo)
}

// 拒绝 / 交回之后项目回到老板名下，员工就看不到了，本地也一并去掉
export async function rejectOrder(id, reason) {
  await http(`${BASE}/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) })
  dropLocal(id)
}

export async function handbackOrder(id, reason) {
  await http(`${BASE}/${id}/handback`, { method: 'POST', body: JSON.stringify({ reason }) })
  dropLocal(id)
}

export async function returnOrder(id, reason) {
  const vo = await http(`${BASE}/${id}/return`, { method: 'POST', body: JSON.stringify({ reason }) })
  return upsert(vo)
}

// ---------- 申请 ----------
export async function loadApprovals() {
  const list = await http('/jiedan/approval/list')
  approvals.splice(0, approvals.length, ...(list || []))
  return approvals
}

// 申请之后项目的“待批数量”变了，顺手刷新一下
async function afterApproval(orderId) {
  await loadApprovals().catch(() => {})
  if (orderId) await getOrder(orderId).catch(() => {})
}

export async function requestApproval({ orderId, type, reason, payload }) {
  const r = await http('/jiedan/approval', {
    method: 'POST',
    body: JSON.stringify({ orderId, type, reason, payload: payload || {} })
  })
  await afterApproval(orderId)
  return r
}

export async function approveApproval(id, note = '') {
  await http(`/jiedan/approval/${id}/approve`, { method: 'POST', body: JSON.stringify({ note }) })
  await syncOrders(true)
}

export async function rejectApproval(id, note) {
  await http(`/jiedan/approval/${id}/reject`, { method: 'POST', body: JSON.stringify({ note }) })
  await syncOrders(true)
}

export async function withdrawApproval(id) {
  await http(`/jiedan/approval/${id}/withdraw`, { method: 'POST', body: '{}' })
  await syncOrders(true)
}

// ---------- 收款流水：每收一笔记一条，已收金额由服务端按流水合计 ----------
export async function addPayment(orderId, payload) {
  const vo = await http(`${BASE}/${orderId}/payment`, { method: 'POST', body: JSON.stringify(payload) })
  return upsert(vo)
}

export async function removePayment(paymentId) {
  const vo = await http(`${BASE}/payment/${paymentId}`, { method: 'DELETE' })
  return upsert(vo)
}

// 实收统计：{ thisMonth, total, months: [{ month: '2026-11', amount }] }
export async function getIncome() {
  return await http(`${BASE}/income`)
}

export async function removeOrder(id) {
  await http(`${BASE}/${id}`, { method: 'DELETE' })
  const i = orders.findIndex((o) => o.id === id)
  if (i > -1) orders.splice(i, 1)
}

export async function createBug(id, content, attachments = [], needsAction = false) {
  const payload = {
    needsAction,
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

export async function requestIssueReview(id, payload) {
  const order = await http(`${BASE}/bug/${id}/review`, {method:'POST',body:JSON.stringify(payload)})
  return upsert(order)
}

export async function updateBugStatus(id, status, previousStatus, note, submission) {
  const vo = await http(`${BASE}/bug/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status, previousStatus, note, submittedAt:submission?.submittedAt, returnedAt:submission?.returnedAt })
  })
  upsert(vo)
  return vo
}

export async function addProgress(id, content, type = 'note', attachments = [], mentions = []) {
  const payload = {
    orderId: id,
    content,
    type,
    attachments: attachments || []
  }
  // 内部记录 @ 的同事（成员 id），没 @ 人时不带这个字段
  if (mentions?.length) payload.mentions = mentions
  const vo = await http(`${BASE}/progress`, { method: 'POST', body: JSON.stringify(payload) })
  upsert(vo)
  return vo
}

// ---- 项目「下一步」：做什么 / 谁来做 / 哪天前（content 为空表示清除）----
export async function setNextStep(id, { content = '', ownerId = null, due = '' } = {}) {
  const vo = await http(`${BASE}/${id}/next`, { method: 'PUT', body: JSON.stringify({ content, ownerId, due }) })
  upsert(vo)
  return vo
}
// 完成当前下一步；带 content 时接着安排新的
export async function completeNextStep(id, next = {}) {
  const vo = await http(`${BASE}/${id}/next/done`, { method: 'POST', body: JSON.stringify(next) })
  upsert(vo)
  return vo
}

// 协作设置：待确认 / 进行中的项目多少天没动静算「快被忘了」（通知设置里改，默认 3 天）
export const collab = reactive({ stallDays: 3 })
export async function loadCollabConfig() {
  try {
    const cfg = await getPushConfig()
    const n = Number(cfg['push.stallDays'])
    if (Number.isInteger(n) && n >= 1 && n <= 60) collab.stallDays = n
    return cfg
  } catch (e) {
    // 读不到就用默认 3 天
  }
}

export async function setProjectUrgency(id, urgentUntil, previousUntil, reopenVersion) {
  const updated = await http(`${BASE}/${id}/urgency`, {
    method: 'PUT',
    body: JSON.stringify({ urgentUntil, previousUntil, reopenVersion })
  })
  return upsert(updated)
}

export async function reviewUrgency(id, version, decision, note) {
  return upsert(await http(`${BASE}/${id}/urgent-review`, {
    method: 'POST', body: JSON.stringify({ version, decision, note })
  }))
}

export async function setOrderHandled(order, handled) {
  const version = orderVersions.get(order) ?? order.version
  const updated = await http(`${BASE}/${order.id}/handling`, {
    method: 'PUT',
    body: JSON.stringify({ handled, version })
  })
  return upsert(updated)
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
  const order = orders.find(row => row.id === id)
  const version = Number(vo?.version || 0)
  if (order && currentMember.value.id === memberId && (reminderVersions.get(order) ?? Number(order.version || 0)) <= version) {
    reminderVersions.set(order, version)
    order.unread = (order.unread || []).filter(userId => userId !== memberId)
    order.myMention = null
  }
  // This endpoint returns only a version. The detail poll still needs to fetch that version.
  return vo
}

// 把我所有“有新动态”的项目一次标为已读：每批 5 个并发，几十条也不会一下子打满请求
export async function markAllRead(memberId) {
  const ids = orders.filter((o) => o.unread?.includes(memberId)).map((o) => o.id)
  let failed = 0
  for (let i = 0; i < ids.length; i += 5) {
    const rs = await Promise.allSettled(ids.slice(i, i + 5).map((id) => markRead(id, memberId)))
    failed += rs.filter((r) => r.status === 'rejected').length
  }
  return { total: ids.length, failed }
}

export async function addRevision(id) {
  const vo = await http(`${BASE}/revision`, {
    method: 'POST',
    body: JSON.stringify({ id })
  })
  upsert(vo)
  return vo
}

export async function completePendingItem(order, kind, bugId) {
  const updated = await http(`${BASE}/${order.id}/pending-completion`, {
    method: 'POST',
    body: JSON.stringify({ kind, bugId, version: orderVersions.get(order) ?? order.version })
  })
  return upsert(updated)
}

export async function reviewTaskTurn(order, kind, decision, note, version = latestOrderVersion(order)) {
  const updated = await http(`${BASE}/${order.id}/task-review`, {
    method:'POST', body:JSON.stringify({ kind, decision, note, version })
  })
  return upsert(updated)
}

export function remindPendingItem(order, kind, bugId) {
  return http(`${BASE}/${order.id}/pending-reminder`, {
    method: 'POST',
    timeoutMs: 40000,
    body: JSON.stringify({ kind, bugId, version: orderVersions.get(order) ?? order.version })
  })
}

export async function nudge(id, urgency = null) {
  const vo = await http(`${BASE}/nudge`, {
    method: 'POST',
    body: JSON.stringify(urgency ? { id, kind: 'urgent', version: orderVersions.get(urgency) ?? urgency.version } : { id })
  })
  upsert(vo)
  return vo
}

// 只缓存接收方式是否已填，不在组件或持久存储中保留推送凭据。
export const deliverySettings = ref(null)
function rememberDelivery(cfg, merge = false) {
  const prior = merge ? deliverySettings.value : null
  const channels = { ...prior?.channels }
  for (const [key, value] of Object.entries(cfg || {})) {
    if (/^push\.(wecom\.user|sendkey)\.\d+$/.test(key) || ['push.wecom.corpId', 'push.wecom.agentId', 'push.wecom.secret'].includes(key)) {
      channels[key] = !!String(value || '').trim()
    }
  }
  const enabled = cfg?.['push.enabled']
  deliverySettings.value = { channels, enabled: enabled == null ? prior?.enabled ?? true : String(enabled) !== 'false' }
}
export function hasWechatChannel(id) {
  const channels = deliverySettings.value?.channels
  return !!(channels?.['push.wecom.user.' + id] || channels?.['push.sendkey.' + id])
}
export function colleagueSentHint(people) {
  const sent = '已发给 ' + people.map(p => p.name).join('、')
  const settings = deliverySettings.value
  if (!isBoss.value || !settings) return sent
  if (!settings.enabled) return sent + '。微信提醒没开，只能在系统里看到'
  const missing = people.filter(p => !hasWechatChannel(p.id))
  if (missing.length) {
    const who = people.length === 1 ? 'TA' : missing.map(p => p.name).join('、')
    return sent + '。' + who + ' 没填微信接收方式，只能在系统里看到'
  }
  const appReady = ['push.wecom.corpId', 'push.wecom.agentId', 'push.wecom.secret'].every(key => settings.channels[key])
  const needApp = people.filter(p => !settings.channels['push.sendkey.' + p.id])
  if (!appReady && needApp.length) {
    const who = people.length === 1 ? 'TA' : needApp.map(p => p.name).join('、')
    return sent + '。企业微信应用还没配好，' + who + ' 只能在系统里看到'
  }
  return sent + '，' + (people.length === 1 ? 'TA' : '他们') + ' 的微信也会收到'
}
export async function getPushConfig() {
  const session = token.value
  const cfg = await http('/jiedan/push/config')
  if (token.value === session && isBoss.value) rememberDelivery(cfg)
  return cfg
}

export async function savePushConfig(cfg) {
  const session = token.value
  await http('/jiedan/push/config', { method: 'POST', body: JSON.stringify(cfg) })
  if (session === token.value && isBoss.value && deliverySettings.value) rememberDelivery(cfg, true)
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
export async function listCustomers(context) {
  const query = context ? '?' + new URLSearchParams({ picker: 'true', ...context }) : ''
  return await http('/jiedan/customer/list' + query)
}

export async function createCustomer(payload) {
  return await http('/jiedan/customer', { method: 'POST', body: JSON.stringify(payload) })
}

export async function createCustomerBatch(payload) {
  return http('/jiedan/customer/batch', { method: 'POST', body: JSON.stringify(payload), timeoutMs: 60000 })
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
