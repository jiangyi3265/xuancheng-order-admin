import { ref } from 'vue'
import { hasPendingUploads } from '@/customer/utils/upload'

const REQUEST_TIMEOUT = 15000

import { customerToken, customerName, friendlyMessage } from '@/mock/store'
export { customerToken, customerName }

export async function getCaptcha() {
  const res = await fetch('/captchaImage')
  const json = await res.json()
  if (json.code !== 200) throw new Error(json.msg || 'captcha failed')
  return json
}

export async function customerLogin(username, password, captcha = {}) {
  const res = await fetch('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, code: captcha.code || '', uuid: captcha.uuid || '' })
  })
  const json = await res.json()
  if (json.code !== 200) throw new Error(json.msg || '登录失败')
  customerToken.value = json.token
  customerName.value = username
  localStorage.setItem('customerToken', json.token)
  localStorage.setItem('customerName', username)
}

export function customerLogout() {
  customerToken.value = ''
  customerName.value = ''
  localStorage.removeItem('customerToken')
  localStorage.removeItem('customerName')
}

export async function listMyOrders() {
  return await customerHttp('/jiedan/portal/orders')
}

export async function getMyOrder(id) {
  return await customerHttp('/jiedan/portal/orders/' + id)
}

export async function getMyOrderVersion(id) {
  return await customerHttp('/jiedan/portal/orders/' + id + '/version')
}

// 撤回自己提交的问题：只有还在“待确认”时才允许，团队接手后服务端会拒绝
export async function removeMyOrder(id) {
  return await customerHttp('/jiedan/portal/orders/' + id, { method: 'DELETE' })
}

// 确认验收：团队提交验收后，客户自己点确认，项目直接变成「已完成」
export async function acceptMyOrder(id) {
  return await customerHttp('/jiedan/portal/orders/' + id + '/accept', { method: 'PUT' })
}

export async function changeMyPassword(oldPassword, newPassword) {
  return await customerHttp('/jiedan/account/password', {
    method: 'PUT',
    body: JSON.stringify({ oldPassword, newPassword })
  })
}

export async function createBug(orderId, content, attachments = []) {
  return await customerHttp('/jiedan/portal/bug', {
    method: 'POST',
    body: JSON.stringify({ orderId, content, attachments })
  })
}

export async function deleteBug(id) {
  return await customerHttp('/jiedan/portal/bug/' + id, { method: 'DELETE' })
}

export async function appendBugUpdate(id, content, attachments = []) {
  return await customerHttp('/jiedan/portal/bug/' + id + '/update', {
    method: 'POST',
    body: JSON.stringify({ content, attachments })
  })
}

export async function updateBugStatus(id, status) {
  return await customerHttp('/jiedan/portal/bug/' + id + '/status', {
    method: 'PUT',
    body: JSON.stringify({ status })
  })
}

export async function sendMessage(orderId, content, attachments = []) {
  return await customerHttp('/jiedan/portal/message', {
    method: 'POST',
    body: JSON.stringify({ orderId, content, attachments })
  })
}

export async function customerHttp(url, opts = {}) {
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
          ...(customerToken.value ? { Authorization: 'Bearer ' + customerToken.value } : {}),
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
      if (attempt + 1 < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 450))
      }
    } finally {
      clearTimeout(timeout)
    }
  }
  if (!json) {
    if (lastError?.name === 'AbortError') throw new Error('加载超时，请检查网络后重试')
    throw new Error(lastError?.message || '网络连接失败，请稍后重试')
  }
  if (json.code === 401) {
    const redirect = encodeURIComponent((location.hash || '#/projects').replace(/^#/, ''))
    customerLogout()
    if (!location.hash.startsWith('#/customer-login')) location.hash = '#/customer-login?redirect=' + redirect
    throw new Error('客户登录已过期，请重新登录')
  }
  if (json.code !== 200) throw new Error(friendlyMessage(json.msg))
  return json.data
}
