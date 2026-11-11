<template>
  <section v-if="isBoss || groups.some(g => g.rows.length)" class="handoffs" aria-label="项目交接">
    <header><h2>项目交接</h2></header>
    <HandoffTabs :tabs="tabs" :active="active.key" label="交接事项" @select="key => { selected = key; expanded = false }" />
    <p v-if="!active.rows.length" class="empty">{{ active.empty }}</p>
    <ul v-else>
      <li v-for="r in expanded ? active.rows : active.rows.slice(0,4)" :key="r.key" :class="r.lane">
        <div class="row-main">
          <button class="project" @click="visit(r)">{{ r.order.title }}</button>
          <span class="kind">{{ reviewLabels[r.kind] || pendingLabels[r.kind] }}</span>
          <p><IssueNumber v-if="r.kind === 'bug' && r.bugId" :id="r.bugId" /> {{ r.text }}</p>
          <HandoffStatus :item="r" />
          <small v-if="r.review && r.turn?.submittedAt">提交于 {{ fmtTime(r.turn.submittedAt) }}</small>
          <small v-if="r.kind === 'next' && r.due">截止 {{ r.due }}</small>
          <small v-if="r.receipt">上次提醒 {{ fmtTime(r.receipt.at) }} · {{ r.receipt.by }}</small>
        </div>
        <div class="actions">
          <UrgentReviewActions v-if="r.mine && r.kind === 'urgentReview'" :order="r.order" />
          <TaskReviewActions v-else-if="r.mine && ['manualReview','nextReview'].includes(r.kind)" :item="r" />
          <el-button v-else-if="r.mine && r.kind === 'deliveryReview'" size="small" type="primary" plain @click="$emit('delivery', r.order)">验收项目</el-button>
          <el-button v-else-if="r.lane === 'waitingWork' && !r.fresh" size="small" type="primary" plain :loading="busy.has(r.order.id)" @click="act(r)">微信提醒</el-button>
          <el-button v-else-if="r.lane === 'work' && r.turn && !r.needsAcceptance" size="small" type="primary" plain :loading="busy.has(r.order.id)" @click="act(r)">{{ submitLabel(r.turn) }}</el-button>
          <el-button v-else-if="r.mine && r.kind === 'issueReview'" size="small" type="primary" plain @click="visit(r)">查看问题</el-button>
          <el-button v-else size="small" @click="visit(r)">{{ r.needsAcceptance && r.mine ? '去接单' : r.bugId ? '查看问题' : '查看项目' }}</el-button>
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
import HandoffStatus from './HandoffStatus.vue'
import HandoffTabs from './HandoffTabs.vue'
import IssueNumber from './IssueNumber.vue'
import { pendingLabels, pendingDestination } from '@/utils/pendingItems'
import { handoffItems, handoffGroups, reviewLabels, submitLabel } from '@/utils/handoffs'
import { finishPendingWithUndo } from '@/utils/orderUndo'
import { fmtTime } from '@/utils/time'
import { toast } from '@/utils/toast'
import TaskReviewActions from './TaskReviewActions.vue'
import UrgentReviewActions from './UrgentReviewActions.vue'
const emit = defineEmits(['open', 'delivery'])
const router = useRouter()
const selected = ref('')
const expanded = ref(false)
const busy = reactive(new Set())
const groups = computed(() => handoffGroups(
  handoffItems(orders, currentMember.value.id, isBoss.value).filter(item => item.personal)
))
const tabs = computed(() => groups.value.map(g => ({ key:g.key, label:g.label, count:g.rows.length })))
const active = computed(() => groups.value.find(g => g.key === selected.value) || groups.value.find(g => g.rows.length) || groups.value[0])
function visit(row) {
  if (row.bugId || ['manual', 'manualReview'].includes(row.kind)) router.push(pendingDestination(row))
  else emit('open', row.order)
}
async function act(row) {
  const order = row.order
  if (busy.has(order.id)) return
  busy.add(order.id)
  try {
    if (row.mine) await finishPendingWithUndo(order, row.kind, row.bugId, '事项已处理')
    else {
      await remindPendingItem(order, row.kind, row.bugId)
      toast.success('已通过企业微信提醒' + (row.recipient || '负责人'))
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
.actions { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
.project,.more { cursor:pointer; font:inherit; border:0; background:none; }
ul { list-style:none; padding:0; margin:8px 0 0; }
li { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px 12px; padding:10px 0; border-top:1px solid #edf0f5; }
.row-main { min-width:0; flex:1 1 220px; }
.project { padding:0; text-align:left; font-weight:650; color:#233957; overflow-wrap:anywhere; }
.project:hover,.more { color:#1759c5; }
.kind { font-size:11px; color:#536b88; margin-left:8px; }
.row-main > p,.row-main > small,.empty { margin:4px 0 0; color:#526783; overflow-wrap:anywhere; font-size:13px; }
.row-main > small { display:block; color:#67788f; }
.row-main > p {margin-bottom:6px}
.empty { margin:12px 0 0; }
@media(max-width:768px){ .handoffs {padding:14px; margin:10px 0;} .actions :deep(.el-button) {min-height:34px;} }
</style>
