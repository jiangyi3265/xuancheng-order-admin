<template>
  <Teleport to="body">
    <section v-if="item" class="issue-inbox-notice" :class="{'above-create': ['/staff', '/customers'].includes(route.path) || (route.path === '/order' && !route.query.id)}" role="region" aria-label="需要我处理的问题">
      <div class="notice-top">
        <button class="notice-toggle" type="button" :aria-expanded="expanded" aria-controls="current-issue-notice"
          :aria-label="expanded ? '收起问题提醒' : '展开问题提醒'" @click="expanded = !expanded">
          <strong aria-live="polite">需要我处理 <small v-if="unseen.length > 1">{{ unseen.length }} 条</small></strong>
          <span aria-hidden="true">{{ expanded ? '⌃' : '⌄' }}</span>
        </button>
        <span class="notice-tools">
          <!-- 「稍后处理」只推迟这一条（有下一条就接着显示）；× 是整个提醒 30 分钟内都不弹 -->
          <button type="button" class="later" title="这一条 30 分钟后再提醒" @click="snooze(item)">稍后处理 · 30 分钟</button>
          <button type="button" class="close" aria-label="关闭，30 分钟内不再弹出" title="看到了，30 分钟内不再弹出" @click="quietAll">×</button>
        </span>
      </div>
      <HandoffCard v-if="expanded" id="current-issue-notice" :item="item" @open="markViewed" />
    </section>
  </Teleport>
</template>

<script setup>
import HandoffCard from '@/components/HandoffCard.vue'
import { handoffItems } from '@/utils/handoffs'
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { isBoss, me, orders, ordersReady, syncOrders } from '@/mock/store'
import { isMobile } from '@/utils/useMobile'
import { toast } from '@/utils/toast'

const route = useRoute()
const SNOOZE_MS = 30 * 60 * 1000
const notices = ref({})
const storageKey = computed(() => me.value?.id ? 'xc:issue-notices:' + me.value.id : '')
const mine = computed(() => !storageKey.value || !ordersReady.value ? [] : handoffItems(orders, me.value.id, isBoss.value).filter(row =>
  row.mine && row.kind === 'bug' && row.bugId)
  .map(row => row.turn?.returnedAt ? { ...row, key: row.key + ':return:' + row.turn.returnedAt } : row))
const unseen = computed(() => mine.value.filter(row => !notices.value[row.key]))
// 工作台和电脑上的项目管理（「待处理」面板一直展开着）已经列出这件事，不再弹一遍；手机上项目管理的面板默认收起，照常弹
const listedOnPage = computed(() => route.path === '/workbench' || (route.path === '/order' && !route.query.id && !isMobile.value))
// 点 × 表示「看到了」：30 分钟内整个提醒都不弹，期间新来的也先不弹；到点后还没处理的照常弹出。
// 存在本机，换页、刷新、另开标签页都算数；事情本身一直在铃铛和工作台里。
const quietKey = computed(() => me.value?.id ? 'xc:issue-notices-quiet:' + me.value.id : '')
const quietUntil = ref(0)
const now = ref(Date.now())
const quiet = computed(() => quietUntil.value > now.value)
function readQuiet() {
  try { return Number(localStorage.getItem(quietKey.value)) || 0 } catch { return quietUntil.value }
}
let quietTimer
watch(quietKey, key => { quietUntil.value = key ? readQuiet() : 0 }, { immediate: true })
watch(quietUntil, until => {
  clearTimeout(quietTimer)
  now.value = Date.now()
  if (until > now.value) quietTimer = setTimeout(() => { now.value = Date.now() }, until - now.value + 50)
}, { immediate: true })
function quietAll() {
  const until = Date.now() + SNOOZE_MS
  quietUntil.value = until
  try { localStorage.setItem(quietKey.value, String(until)) } catch { /* 本页仍然生效 */ }
  toast.success('30 分钟内不再弹出，要处理的还在铃铛里')
}
const item = computed(() => listedOnPage.value || quiet.value ? null : unseen.value.find(row => !(route.query.tab === 'bugs' &&
  String(route.query.id) === String(row.id) && String(route.query.bug) === String(row.bugId))))

const expanded = ref(true)
watch(() => item.value?.key, () => { expanded.value = true })

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
  if (event.key === quietKey.value || event.key === null) quietUntil.value = quietKey.value ? readQuiet() : 0
}
// 手机锁屏、切到别的应用时计时器可能被暂停，回来时按当前时间重新判断
const refreshNow = () => { now.value = Date.now() }
onMounted(() => {
  window.addEventListener('storage', onStorage)
  document.addEventListener('visibilitychange', scheduleReminder)
  window.addEventListener('pageshow', scheduleReminder)
  document.addEventListener('visibilitychange', refreshNow)
  window.addEventListener('pageshow', refreshNow)
})
onBeforeUnmount(() => {
  disposed = true
  clearTimeout(timer)
  clearTimeout(quietTimer)
  window.removeEventListener('storage', onStorage)
  document.removeEventListener('visibilitychange', scheduleReminder)
  window.removeEventListener('pageshow', scheduleReminder)
  document.removeEventListener('visibilitychange', refreshNow)
  window.removeEventListener('pageshow', refreshNow)
})
function snooze(row) {
  changeNotices(next => { next[row.key] = Date.now() + SNOOZE_MS })
  toast.success('已稍后处理，30 分钟后提醒')
}
function markViewed(row) {
  if (row) changeNotices(next => { next[row.key] = 'viewed' })
}
</script>

<style scoped>
.issue-inbox-notice { position: fixed; z-index: 2050; right: 18px; bottom: 22px; width: min(340px, calc(100vw - 32px)); box-sizing: border-box; padding: 15px 17px; border: 1px solid #d4e3ff; border-left: 3px solid #2866e8; border-radius: 12px; background: white; box-shadow: 0 8px 36px #17386424; color: #172d50; }
/* 临时操作优先，收起菜单或撤销提示后继续展示原提醒。 */
:global(body:has(.el-dropdown [aria-expanded="true"], .el-message button, .el-message-box, .bell-panel, .el-overlay:not([style*="display: none"]) > .el-overlay-dialog .el-dialog) .issue-inbox-notice) { visibility: hidden; }
.notice-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.notice-top small { margin-left: 4px; color: #46618d; font-weight: 500; }
.notice-top {background:white}
.notice-toggle {display:inline-flex;align-items:center;gap:6px;cursor:pointer;border:0;background:none;color:inherit;font:inherit;padding:3px 0}
.notice-toggle span {font-size:14px;color:#577299}
.issue-inbox-notice :deep(.handoff-card) {margin-top:8px}
.issue-inbox-notice .later { cursor:pointer; background:transparent; border:none; color:#51647e; padding:4px; font:inherit; font-size:13px; }
.notice-tools { display:inline-flex; align-items:center; gap:2px; flex:none; }
.issue-inbox-notice .close { cursor:pointer; display:inline-grid; place-items:center; width:30px; height:30px; margin-right:-6px; border:none; border-radius:8px;
  background:transparent; color:#51647e; font-size:22px; line-height:1; padding:0; }
.issue-inbox-notice .close:hover { background:#eef3fb; color:#172d50; }
@media(max-width:768px) {
  .issue-inbox-notice {--notice-bottom:calc(72px + env(safe-area-inset-bottom));right:12px;bottom:var(--notice-bottom);
    max-height:calc(100dvh - var(--notice-bottom) - 12px);overflow:auto;padding:8px 12px;overscroll-behavior:contain}
  .issue-inbox-notice.above-create {--notice-bottom:calc(158px + env(safe-area-inset-bottom))}
  .notice-top {position:sticky;top:-8px;z-index:1}
  .notice-toggle,.issue-inbox-notice .later {min-height:40px}
  .issue-inbox-notice .close {width:40px;height:40px}
}
</style>
