<template>
  <Teleport to="body">
    <section v-if="item" class="issue-inbox-notice" role="region" aria-label="需要我处理的问题">
      <div class="notice-top">
        <strong aria-live="polite">需要我处理 <small v-if="unseen.length > 1">{{ unseen.length }} 条</small></strong>
        <button type="button" class="later" @click="dismiss(item)">稍后处理</button>
      </div>
      <div class="notice-project">{{ item.title }} · 问题 #{{ item.bugId }}</div>
      <p>{{ item.text }}</p>
      <div class="notice-actions">
        <button type="button" @click="openIssue(item)">查看问题</button>
        <button type="button" class="finish" :disabled="busy" @click="finish(item)">{{ busy ? '处理中…' : '标为已处理' }}</button>
      </div>
    </section>
  </Teleport>
</template>

<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { me, orders, ordersReady, syncOrders } from '@/mock/store'
import { pendingItems, pendingDestination } from '@/utils/pendingItems'
import { finishPendingWithUndo } from '@/utils/orderUndo'
import { toast } from '@/utils/toast'

const route = useRoute()
const router = useRouter()
const busy = ref(false)
const dismissed = ref([])
const storageKey = computed(() => me.value?.id ? 'xc:issue-notices:' + me.value.id : '')
const mine = computed(() => pendingItems(orders).filter(row =>
  row.kind === 'bug' && row.bugId && String(row.recipientId) === String(me.value?.id)))
const unseen = computed(() => mine.value.filter(row => !dismissed.value.includes(row.key)))
const item = computed(() => unseen.value.find(row => !(route.query.tab === 'bugs' &&
  String(route.query.id) === String(row.id) && String(route.query.bug) === String(row.bugId))))

function loadDismissed() {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey.value) || '[]')
    dismissed.value = Array.isArray(value) ? value : []
  } catch { dismissed.value = [] }
}
function remember(keys) {
  dismissed.value = keys
  try { localStorage.setItem(storageKey.value, JSON.stringify(keys)) } catch { /* 当前页面仍可稍后处理 */ }
}
watch(storageKey, loadDismissed, { immediate: true })
watch([mine, ordersReady], ([rows, ready]) => {
  if (!storageKey.value || !ready) return
  const pending = new Set(rows.map(row => row.key))
  const keep = dismissed.value.filter(key => pending.has(key))
  if (keep.length !== dismissed.value.length) remember(keep)
})
function onStorage(event) { if (event.key === storageKey.value) loadDismissed() }
onMounted(() => window.addEventListener('storage', onStorage))
onBeforeUnmount(() => window.removeEventListener('storage', onStorage))
function dismiss(row) {
  if (!dismissed.value.includes(row.key)) remember([...dismissed.value, row.key])
}
async function openIssue(row) {
  await router.push(pendingDestination(row))
  dismiss(row)
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
