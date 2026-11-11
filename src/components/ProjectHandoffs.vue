<template>
  <section v-if="isBoss || groups.some(g => g.rows.length)" class="handoffs" aria-label="项目交接">
    <header><h2>项目交接</h2></header>
    <nav aria-label="交接事项">
      <button v-for="g in groups" :key="g.key" type="button" :aria-pressed="active.key === g.key"
        @click="selected = g.key; expanded = false">{{ g.label }} <b>{{ g.rows.length }}</b></button>
    </nav>
    <p v-if="!active.rows.length" class="empty">{{ active.empty }}</p>
    <ul v-else>
      <li v-for="r in expanded ? active.rows : active.rows.slice(0,4)" :key="r.key">
        <div class="row-main">
          <button class="project" @click="visit(r)">{{ r.order.title }}</button>
          <span class="kind">{{ reviewLabels[r.kind] || r.label || '加急' }}</span>
          <p>{{ r.text }}<template v-if="r.kind === 'deliveryReview'"> · {{ owner(r.order) }}</template></p>
          <small v-if="r.kind === 'urgentReview' || r.kind === 'submitted'">提交于 {{ fmtTime(r.order.urgentHandoff.submittedAt) }}</small>
          <small v-if="r.order.reminderReceipts?.urgent && r.kind === 'outgoing'">上次提醒 {{ fmtTime(r.order.reminderReceipts.urgent.at) }} · {{ r.order.reminderReceipts.urgent.by }}</small>
        </div>
        <div class="actions">
          <UrgentReviewActions v-if="r.kind === 'urgentReview'" :order="r.order" />
          <el-button v-else-if="r.kind === 'deliveryReview'" size="small" type="primary" plain @click="$emit('delivery', r.order)">验收项目</el-button>
          <el-button v-else-if="r.kind === 'outgoing'" size="small" type="primary" plain :loading="busy.has(r.order.id)" @click="act(r)">微信提醒</el-button>
          <el-button v-else-if="r.kind === 'incoming' && r.order.assignState !== 'pending'" size="small" type="primary" plain :loading="busy.has(r.order.id)" @click="act(r)">提交确认</el-button>
          <el-button v-else size="small" @click="visit(r)">{{ r.kind === 'issueReview' ? '查看问题' : '查看项目' }}</el-button>
        </div>
      </li>
    </ul>
    <button v-if="active.rows.length > 4" class="more" @click="expanded = !expanded">{{ expanded ? '收起' : '查看全部 ' + active.rows.length + ' 条' }}</button>
  </section>
</template>
<script setup>
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { currentMember, isBoss, orders, getOrder, remindPendingItem } from '@/mock/store'
import { memberMap } from '@/constants/options'
import { reviewItems, reviewLabels } from '@/utils/handoffs'
import { finishPendingWithUndo } from '@/utils/orderUndo'
import { fmtTime } from '@/utils/time'
import { toast } from '@/utils/toast'
import UrgentReviewActions from './UrgentReviewActions.vue'
const emit = defineEmits(['open', 'delivery'])
const router = useRouter()
const owner = o => memberMap[o.ownerId]?.name || '项目负责人'
const selected = ref('')
const expanded = ref(false)
const busy = reactive(new Set())
const groups = computed(() => {
  const me = currentMember.value.id
  const reviews = reviewItems(orders, me, isBoss.value)
  const outgoing = [], incoming = [], submitted = []
  for (const order of orders) {
    const h = order.urgentHandoff
    const closed = ['done', 'cancelled'].includes(order.status)
    if (closed && !h?.submittedAt) continue
    if (!closed && !isBoss.value && order.ownerId === me) {
      if (order.status === 'review')
        submitted.push({ key: order.id + '-delivery', kind:'deliverySent', label:'项目验收', order, text:'项目已交付，等待验收' })
      for (const bug of order.internalReviewIssues || [])
        submitted.push({ key: order.id + '-issue-' + bug.id, kind:'issueSent', label:'问题验收', order,
          text:'问题 #' + bug.id + ' 等内部验收 · ' + (bug.content || '查看修改结果'), bugId:bug.id })
    }
    if (!h) continue
    const row = (kind, text) => ({ key: order.id + kind, order, kind, text })
    if (h.submittedAt) {
      if (h.submittedBy === me && h.requesterId !== me)
        submitted.push(row('submitted', '等' + (h.requesterName || '发起人') + '确认加急结果'))
    } else if (order.urgentUntil && !order.handled && order.ownerId !== h.requesterId) {
      if (h.requesterId === me) outgoing.push(row('outgoing', '交给' + owner(order) + ' · 截止 ' + h.due))
      if (order.ownerId === me) incoming.push(row('incoming', (h.requesterName || '同事') + ' 发起 · 截止 ' + h.due))
    }
  }
  const byDue = (a,b) => a.order.urgentUntil.localeCompare(b.order.urgentUntil) || b.order.id - a.order.id
  const entries = []
  if (isBoss.value || reviews.length) entries.push({ key:'review', label:'等我确认', rows: reviews, empty:'当前没有等你确认的事项' })
  if (isBoss.value || outgoing.length) entries.push({ key:'out', label:'我发出的加急', rows: outgoing.sort(byDue), empty:'当前没有发给同事的加急' })
  if (incoming.length) entries.push({ key:'in', label:'我收到的加急', rows: incoming.sort(byDue) })
  if (submitted.length) entries.push({ key:'submitted', label:'等对方确认', rows: submitted.sort((a,b) => (b.order.urgentHandoff?.submittedAt || b.order.updateTime || '').localeCompare(a.order.urgentHandoff?.submittedAt || a.order.updateTime || '')) })
  return entries
})
const active = computed(() => groups.value.find(g => g.key === selected.value) || groups.value.find(g => g.rows.length) || groups.value[0])
function visit(row) {
  if (row.bugId) router.push({ path:'/order', query:{id:String(row.order.id), tab:'bugs', bug:String(row.bugId)} })
  else emit('open', row.order)
}
async function act(row) {
  const order = row.order
  if (busy.has(order.id)) return
  busy.add(order.id)
  try {
    if (row.kind === 'incoming') await finishPendingWithUndo(order, 'urgent', null, '已提交加急结果')
    else {
      await remindPendingItem(order, 'urgent')
      toast.success('已通过企业微信提醒' + owner(order))
      await getOrder(order.id).catch(() => {})
    }
  } catch (error) {
    toast.error(error.message || '操作失败，请重试')
    await getOrder(order.id).catch(() => {})
  } finally { busy.delete(order.id) }
}
</script>
<style scoped>
.handoffs { background:white; border:1px solid #dfE7F2; border-radius:14px; padding:16px 20px; margin:14px 0; color:#20334e; }
.handoffs h2 { font-size:17px; margin:0 0 12px; }
nav,.actions { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
nav button,.project,.more { cursor:pointer; font:inherit; border:0; background:none; }
nav button { padding:7px 10px; border-radius:7px; font-size:13px; color:#536780; background:#f4f6fa; }
nav [aria-pressed=true] { background:#eaf1ff; color:#1250b8; }
nav b { margin-left:3px; font-variant-numeric:tabular-nums; }
ul { list-style:none; padding:0; margin:8px 0 0; }
li { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px 12px; padding:10px 0; border-top:1px solid #edf0f5; }
.row-main { min-width:0; flex:1 1 220px; }
.project { padding:0; text-align:left; font-weight:650; color:#233957; overflow-wrap:anywhere; }
.project:hover,.more { color:#1759c5; }
.kind { font-size:11px; color:#536b88; margin-left:8px; }
p,small { margin:4px 0 0; color:#526783; overflow-wrap:anywhere; font-size:13px; }
small { display:block; color:#67788f; }
.empty { margin:12px 0 0; }
@media(max-width:768px){ .handoffs {padding:14px; margin:10px 0;} .actions :deep(.el-button) {min-height:34px;} }
</style>
