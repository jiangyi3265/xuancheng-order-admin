import { customerHttp } from '@/mock/store'
export { customerHttp, customerLogin, customerLogout, getCaptcha, customerToken, customerName } from '@/mock/store'

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

export async function appendBugUpdate(id, content, attachments = [], options = {}) {
  return await customerHttp('/jiedan/portal/bug/' + id + '/update', {
    method: 'POST',
    body: JSON.stringify({ content, attachments, ...options })
  })
}

export function markIssueReplyRead(orderId, issueId, updateId) {
  return customerHttp(`/jiedan/portal/orders/${orderId}/issues/${issueId}/replies/${updateId}/read`, {method:'POST'})
}

export function decideIssueReview(issueId, reviewId, decision, content = '', attachments = []) {
  return customerHttp(`/jiedan/portal/bug/${issueId}/review/${reviewId}`, {
    method:'POST', body:JSON.stringify({decision,content,attachments})
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
