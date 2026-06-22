// ============================================================
// 接单管理 - API 层
// 当前 demo 用本地 mock（@/mock/store）实现，便于离线看效果。
// 接入若依后台时：删掉 mock 实现，启用下面注释里的 request 写法即可，
// 页面调用方式完全不变。
// ============================================================

// import request from '@/utils/request'   // 若依自带的 axios 封装

import {
  orders,
  createOrder,
  editOrder,
  removeOrder,
  addProgress,
  setStatus
} from '@/mock/store'

// 查询订单列表
export function listOrder(query) {
  // return request({ url: '/jiedan/order/list', method: 'get', params: query })
  return Promise.resolve({ code: 200, rows: orders, total: orders.length })
}

// 查询订单详情
export function getOrder(id) {
  // return request({ url: '/jiedan/order/' + id, method: 'get' })
  return Promise.resolve({ code: 200, data: orders.find((o) => o.id === id) })
}

// 新增订单
export function addOrder(data) {
  // return request({ url: '/jiedan/order', method: 'post', data })
  return Promise.resolve({ code: 200, data: createOrder(data) })
}

// 修改订单
export function updateOrder(data) {
  // return request({ url: '/jiedan/order', method: 'put', data })
  return Promise.resolve({ code: 200, data: editOrder(data) })
}

// 删除订单
export function delOrder(id) {
  // return request({ url: '/jiedan/order/' + id, method: 'delete' })
  removeOrder(id)
  return Promise.resolve({ code: 200 })
}

// 更新状态
export function changeStatus(id, status) {
  // return request({ url: '/jiedan/order/status', method: 'put', data: { id, status } })
  setStatus(id, status)
  return Promise.resolve({ code: 200 })
}

// 追加一条进度/沟通记录
export function addTimeline(id, content, type) {
  // return request({ url: '/jiedan/order/timeline', method: 'post', data: { id, content, type } })
  addProgress(id, content, type)
  return Promise.resolve({ code: 200 })
}
