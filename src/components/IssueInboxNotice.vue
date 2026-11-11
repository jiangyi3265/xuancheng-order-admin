<template>
  <Teleport to="body">
    <section v-if="item" class="issue-inbox-notice" role="region" aria-label="需要我处理的问题">
      <div class="notice-top">
        <strong aria-live="polite">需要我处理 <small v-if="unseen.length > 1">{{ unseen.length }} 条</small></strong>
        <button type="button" class="later" title="30 分钟后再提醒" @click="snooze(item)">稍后处理 · 30 分钟</button>
      </div>
      <div class="notice-project">{{ item.title }} · {{ item.fresh ? '客户提了新问题' : '问题' }} #{{ item.bugId }}</div>
      <p>{{ item.text }}</p>
      <HandoffReturn :turn="item.turn" />
      <div class="notice-actions">
        <button type="button" @click="openIssue(item)">查看问题</button>
        <button v-if="!item.fresh" type="button" class="finish" :disabled="busy" @click="finish(item)">{{ busy ? '处理中…' : item.turn ? submitLabel(item.turn) : '标为已处理' }}</button>
      </div>
    </section>
  </Teleport>
</template>

<script setup>
import HandoffReturn from '@/components/HandoffReturn.vue'
import { submitLabel } from '@/utils/handoffs'
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { me, orders, ordersReady, syncOrders } from '@/mock/store'
import { pendingItems, pendingDestination } from '@/utils/pendingItems'
import { finishPendingWithUndo } from '@/utils/orderUndo'
import { toast } from '@/utils/toast'

const route = useRoute()
const router = useRouter()
const busy = ref(false)
const SNOOZE_MS = 30 * 60 * 1000
const notices = ref({})
const storageKey = computed(() => me.value?.id ? 'xc:issue-notices:' + me.value.id : '')
const mine = computed(() => !storageKey.value || !ordersReady.value ? [] : pendingItems(orders).filter(row =>
  row.kind === 'bug' && row.bugId && String(row.recipientId) === String(me.value.id))
  .map(row => row.turn?.returnedAt ? { ...row, key: row.key + ':return:' + row.turn.returnedAt } : row))
const unseen = computed(() => mine.value.filter(row => !notices.value[row.key]))
const item = computed(() => unseen.value.find(row => !(route.query.tab === 'bugs' &&
  String(route.query.id) === String(row.id) && String(route.query.bug) === String(row.bugId))))

let timer
let checking = false
let disposed = false

function readNotices() {
  if (!storageKey.value) return {}
  try {
    const value = JSON.parse(localStorage.getItem(storageKey.value) || '{}')
    // The previous version only stored hidden keys. Give pending items a fresh reminder.
    if (Array.isArray(value)) {
      const until = Date.now() + SNOOZE_MS
      const migrated = Object.fromEntries(value.map(key => [key, until]))
      localStorage.setItem(storageKey.value, JSON.stringify(migrated))
      return migrated
    }
    return Object.fromEntries(Object.entries(value || {}).filter(([, state]) =>
      state === 'viewed' || Number.isFinite(state)))
  } catch { return notices.value }
}

function changeNotices(edit) {
  if (!storageKey.value) return
  const next = { ...readNotices() }
  edit(next)
  notices.value = next
  try { localStorage.setItem(storageKey.value, JSON.stringify(next)) } catch { /* Still available in this tab. */ }
}

function scheduleReminder() {
  clearTimeout(timer)
  if (disposed || !storageKey.value || !ordersReady.value || checking || document.hidden) return
  const deadlines = Object.values(notices.value).filter(Number.isFinite)
  if (deadlines.length) timer = setTimeout(recheckDue, Math.max(0, Math.min(...deadlines) - Date.now()))
}

async function recheckDue() {
  if (disposed || checking || document.hidden) return
  const account = storageKey.value
  const due = Object.entries(notices.value).filter(([, time]) => Number.isFinite(time) && time <= Date.now())
  if (!due.length) return scheduleReminder()
  checking = true
  let failed = false
  try {
    // A colleague may have finished the issue or reassigned the project while this tab slept.
    await syncOrders(true)
    if (!disposed && account === storageKey.value) changeNotices(next => {
      for (const [key, time] of due) if (next[key] === time) delete next[key]
    })
  } catch { failed = true } finally {
    checking = false
    if (!disposed && failed && account === storageKey.value && !document.hidden) timer = setTimeout(recheckDue, 30_000)
    else scheduleReminder()
  }
}

watch(storageKey, () => {
  notices.value = {}
  notices.value = readNotices()
}, { immediate: true })
watch([mine, ordersReady], ([rows, ready]) => {
  if (!storageKey.value || !ready) return
  const pending = new Set(rows.map(row => row.key))
  const removed = Object.keys(notices.value).filter(key => !pending.has(key))
  if (removed.length) changeNotices(next => { for (const key of removed) delete next[key] })
})
watch([notices, ordersReady], scheduleReminder, { immediate: true })
function onStorage(event) {
  if (event.key === storageKey.value || event.key === null) notices.value = readNotices()
}
onMounted(() => {
  window.addEventListener('storage', onStorage)
  document.addEventListener('visibilitychange', scheduleReminder)
  window.addEventListener('pageshow', scheduleReminder)
})
onBeforeUnmount(() => {
  disposed = true
  clearTimeout(timer)
  window.removeEventListener('storage', onStorage)
  document.removeEventListener('visibilitychange', scheduleReminder)
  window.removeEventListener('pageshow', scheduleReminder)
})
function snooze(row) {
  changeNotices(next => { next[row.key] = Date.now() + SNOOZE_MS })
  toast.success('已稍后处理，30 分钟后提醒')
}
async function openIssue(row) {
  const account = storageKey.value
  await router.push(pendingDestination(row))
  if (storageKey.value === account) changeNotices(next => { next[row.key] = 'viewed' })
}
async function finish(row) {
  if (busy.value || !mine.value.some(entry => entry.key === row.key)) return
  busy.value = true
  try {
    await finishPendingWithUndo(row.order, 'bug', row.bugId, '已处理：' + row.title + ' · 问题 #' + row.bugId)
  } catch (err) {
    toast.error(err.message || '处理失败，请重试')
    await syncOrders(true).catch(() => {})
  } finally { busy.value = false }
}
</script>

<style scoped>
.issue-inbox-notice { position: fixed; z-index: 2050; right: 18px; bottom: 22px; width: min(340px, calc(100vw - 32px)); box-sizing: border-box; padding: 15px 17px; border: 1px solid #d4e3ff; border-left: 3px solid #2866e8; border-radius: 12px; background: white; box-shadow: 0 8px 36px #17386424; color: #172d50; }
/* 临时操作优先，收起菜单或撤销提示后继续展示原提醒。 */
:global(body:has(.el-dropdown [aria-expanded="true"], .el-message button, .el-message-box) .issue-inbox-notice) { visibility: hidden; }
.notice-top, .notice-actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.notice-top small { margin-left: 4px; color: #46618d; font-weight: 500; }
.notice-project { margin-top: 9px; font-size: 12px; color: #526783; overflow-wrap: anywhere; }
.issue-inbox-notice p { margin: 5px 0 12px; line-height: 1.4; overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }
.notice-actions { justify-content: flex-end; }
.issue-inbox-notice button { cursor: pointer; border: 1px solid #cbdaf0; border-radius: 7px; padding: 6px 10px; color: #1754b3; background: white; font: inherit; font-size: 13px; }
.issue-inbox-notice .later { border: none; color: #51647e; padding: 4px; }
.issue-inbox-notice .finish { background: #205ce2; color: white; border-color: #205ce2; }
@media(max-width: 768px) { .issue-inbox-notice { right: 12px; bottom: calc(72px + env(safe-area-inset-bottom)); } }
</style>
