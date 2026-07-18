import { adminHttp } from '@/mock/store'

const BASE = '/jiedan/ai'

export const listBindableOrders = () => adminHttp('/jiedan/order/list')

function queryString(params = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== '' && value !== null && value !== undefined) query.set(key, value)
  })
  const text = query.toString()
  return text ? `?${text}` : ''
}

export const listAiProjects = (params) => adminHttp(`${BASE}/projects${queryString(params)}`)
export const getAiProject = (id) => adminHttp(`${BASE}/projects/${id}`)
export const createAiProject = (data) => adminHttp(`${BASE}/projects`, {
  method: 'POST', body: JSON.stringify(data)
})
export const updateAiProject = (data) => adminHttp(`${BASE}/projects`, {
  method: 'PUT', body: JSON.stringify(data)
})

export const listAiTasks = (params) => adminHttp(`${BASE}/tasks${queryString(params)}`)
export const getAiTask = (id) => adminHttp(`${BASE}/tasks/${id}`)
export const createAiTask = (data) => adminHttp(`${BASE}/tasks`, {
  method: 'POST', body: JSON.stringify(data)
})
export const dispatchAiTask = (id) => adminHttp(`${BASE}/tasks/${id}/dispatch`, { method: 'POST' })
export const retryAiTask = (id) => adminHttp(`${BASE}/tasks/${id}/retry`, { method: 'POST' })
export const cancelAiTask = (id) => adminHttp(`${BASE}/tasks/${id}/cancel`, { method: 'POST' })
export const approveAiTask = (id, data) => adminHttp(`${BASE}/tasks/${id}/approve`, {
  method: 'POST', body: JSON.stringify(data)
})
export const rejectAiTask = (id, data) => adminHttp(`${BASE}/tasks/${id}/reject`, {
  method: 'POST', body: JSON.stringify(data)
})
export const listAttemptLogs = (id, params) => adminHttp(`${BASE}/attempts/${id}/logs${queryString(params)}`)
