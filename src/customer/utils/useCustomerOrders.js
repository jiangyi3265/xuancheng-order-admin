import { inject, onMounted, onBeforeUnmount, provide, ref, watch } from 'vue'
import { customerToken, listMyOrders } from '@/customer/mock/store'

const ordersKey = Symbol('customer-orders')

export function useCustomerOrders() {
  const state = inject(ordersKey)
  onMounted(state.load)
  return state
}

export function provideCustomerOrders() {
  const orders = ref([])
  const loading = ref(true)
  const refreshing = ref(false)
  const error = ref('')
  let timer
  let active = true
  let owner = customerToken.value
  let account = localStorage.getItem('customerAccount')
  let generation = 0
  const decided = new Map()
  const seenReplies = new Map()

  function syncSeenReplies(rows) {
    for (const project of rows) {
      for (const issue of project.requirements || []) {
        const decision = decided.get(project.id + '/' + issue.id)
        if (decision && issue.status === 'confirm' && Number(issue.reviewId) === Number(decision.reviewId)) {
          issue.status = decision.status
          issue.progressStatus = decision.status
          issue.reviewId = null
        }
        const reply = issue.latestTeamReply
        if (reply?.unread && Number(reply.id) <= seenReplies.get(project.id + '/' + issue.id)) reply.unread = false
      }
    }
  }
  function onReplyRead(event) {
    const receipt = event.detail
    if (!account || receipt?.account !== account || localStorage.getItem('customerAccount') !== account) return
    const id = Number(receipt.updateId)
    if (!Number.isSafeInteger(id) || id <= 0) return
    const key = receipt.projectId + '/' + receipt.issueId
    seenReplies.set(key, Math.max(seenReplies.get(key) || 0, id))
    syncSeenReplies(orders.value)
  }

  function onReviewed(event) {
    const receipt = event.detail
    if (!account || account !== localStorage.getItem('customerAccount') || receipt?.account !== account ||
        !['resolved','action'].includes(receipt.status) || !Number(receipt.reviewId)) return
    const key = receipt.projectId + '/' + receipt.issueId
    if (Number(decided.get(key)?.reviewId) >= Number(receipt.reviewId)) return
    decided.set(key, receipt)
    seenReplies.set(key, Math.max(seenReplies.get(key) || 0, Number(receipt.reviewId)))
    syncSeenReplies(orders.value)
  }

  function refreshSession() {
    generation++
    owner = customerToken.value
    account = localStorage.getItem('customerAccount')
    refreshing.value = false
    orders.value = []
    error.value = ''
    seenReplies.clear()
    decided.clear()
    if (owner && owner === localStorage.getItem('customerToken')) load()
    else loading.value = false
  }
  function onStorage(event) {
    if (event.key === 'customerToken' || event.key === 'customerAccount' || event.key === null) refreshSession()
  }
  watch(customerToken, refreshSession)

  async function load() {
    if (refreshing.value || !active || !owner || owner !== localStorage.getItem('customerToken')) return
    const request = generation
    refreshing.value = true
    try {
      const rows = await listMyOrders()
      if (active && request === generation && owner === localStorage.getItem('customerToken')) {
        // A read can finish while an older list response is in flight.
        if (seenReplies.size || decided.size) syncSeenReplies(rows || [])
        orders.value = rows || []
        error.value = ''
      }
    } catch (e) {
      if (active && request === generation) error.value = e.message || '网络连接失败，请稍后重试'
    } finally {
      if (request === generation) {
        refreshing.value = false
        loading.value = false
      }
    }
  }
  function refreshWhenVisible() {
    if (!document.hidden) load()
  }
  onMounted(() => {
    window.addEventListener('customer-issue-reply-read', onReplyRead)
    window.addEventListener('customer-issue-reviewed', onReviewed)
    window.addEventListener('storage', onStorage)
    load()
    timer = setInterval(refreshWhenVisible, 15000)
    window.addEventListener('online', refreshWhenVisible)
    window.addEventListener('focus', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)
  })
  onBeforeUnmount(() => {
    active = false
    window.removeEventListener('customer-issue-reply-read', onReplyRead)
    window.removeEventListener('customer-issue-reviewed', onReviewed)
    window.removeEventListener('storage', onStorage)
    clearInterval(timer)
    window.removeEventListener('online', refreshWhenVisible)
    window.removeEventListener('focus', refreshWhenVisible)
    document.removeEventListener('visibilitychange', refreshWhenVisible)
  })
  const state = { orders, loading, refreshing, error, load }
  provide(ordersKey, state)
  return state
}
