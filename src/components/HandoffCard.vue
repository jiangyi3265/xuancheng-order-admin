<template>
  <article class="handoff-card" :class="{returned: item.turn?.returnedAt && !item.review}" :data-kind="item.kind" :data-order-id="item.id">
    <router-link class="summary-link" :to="destination" @click="opened">
      <header><strong>{{ item.title }}</strong><span>{{ label }}</span></header>
      <p v-if="showText" class="task-text"><IssueNumber v-if="item.kind === 'bug' && item.bugId" :id="item.bugId" /> {{ item.text }}</p>
    </router-link>
    <HandoffStatus :item="item" />
    <div class="card-actions">
      <template v-if="item.mine">
        <template v-if="item.kind === 'deliveryReview'">
          <el-button size="small" type="primary" :disabled="busy" @click="showDelivery('done')">验收通过</el-button>
          <el-button size="small" :disabled="busy" @click="openReturn">退回返工</el-button>
        </template>
        <el-button v-else-if="item.kind === 'delivery'" size="small" type="primary" :disabled="busy" @click="showDelivery('review')">{{ item.turn?.returnedAt ? '改好了，再提交验收' : '提交验收' }}</el-button>
        <UrgentReviewActions v-else-if="item.kind === 'urgentReview'" :order="item.order" />
        <TaskReviewActions v-else-if="item.review" :item="item" />
        <router-link v-else-if="item.needsAcceptance" class="action" :to="destination" @click="opened">去接单</router-link>
        <el-button v-else-if="item.fresh" size="small" :disabled="busy" @click="takeIssue">加入处理</el-button>
        <HandoffCompleteButton v-else-if="item.kind !== 'bug' || item.bugId" :item="item" :submit="submit" @done="emit('done', item)" />
      </template>
      <template v-else>
        <el-button v-if="canWithdraw" size="small" :disabled="busy" @click="withdraw">撤回</el-button>
      </template>
      <el-button v-if="canRemind" size="small" :disabled="busy" @click="remind">{{ item.mine ? '提醒自己' : '催一下' }}</el-button>
      <slot />
      <router-link class="detail-link" :to="destination" @click="opened">看一下</router-link>
    </div>
    <small v-if="item.receipt" class="receipt">{{ fmtTime(item.receipt.at) }} · {{ item.receipt.by }} 已提醒</small>
    <DeliveryDialog v-if="deliveryVisible" v-model:visible="deliveryVisible" :order="deliveryOrder" :target="deliveryTarget" />
    <ReasonDialog v-if="returnOpen" v-model:visible="returnOpen" :order="item.order" title="退回返工" confirm-text="退回返工"
      :placeholder="'写一句哪里要改，' + executorName(item.order, item.kind) + '打开就能看到'" :submit="returnDelivery" />
  </article>
</template>
<script setup>
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { currentMember, getOrder, latestOrderVersion, loadOrders, remindPendingItem, returnOrder, updateBugStatus, withdrawHandoff } from '@/mock/store'
import { executorName, reviewLabels } from '@/utils/handoffs'
import { pendingDestination, pendingLabels } from '@/utils/pendingItems'
import { fmtTime } from '@/utils/time'
import { toast } from '@/utils/toast'
import DeliveryDialog from './DeliveryDialog.vue'
import ReasonDialog from './ReasonDialog.vue'
import HandoffCompleteButton from './HandoffCompleteButton.vue'
import TaskReviewActions from './TaskReviewActions.vue'
import UrgentReviewActions from './UrgentReviewActions.vue'
import HandoffStatus from './HandoffStatus.vue'
import IssueNumber from './IssueNumber.vue'

const props = defineProps({ item: { type: Object, required: true }, submit: Function, selfReminder: Boolean })
const emit = defineEmits(['open', 'done'])
const route = useRoute()
const destination = computed(() => pendingDestination(props.item, route.path === '/order' ? route.query : {}))
const label = computed(() => reviewLabels[props.item.kind] || pendingLabels[props.item.kind])
// 「项目验收」「处理结果确认」这两类，固定的那句话（项目已提交验收 / 核对本次项目处理结果）和标签、状态行说的是同一件事，
// 卡片上就不再多写一行；加急确认的截止时间已经写在状态行里时也不重复
const showText = computed(() => {
  const { kind, due } = props.item
  if (kind === 'deliveryReview' || kind === 'manualReview') return false
  return !(kind === 'urgentReview' && due)
})
const canRemind = computed(() => (!props.item.mine || props.selfReminder && !props.item.turn && !props.item.review) && !props.item.fresh && props.item.recipientId != null && (props.item.review ? props.item.personal : true))
const canWithdraw = computed(() => props.item.review && props.item.turn?.submittedAt &&
  !['done', 'cancelled'].includes(props.item.order.status) && String(props.item.turn.submittedBy) === String(currentMember.value.id))
const busy = ref(false)
const returnOpen = ref(false)
let returnVersion
function openReturn() {
  returnVersion = latestOrderVersion(props.item.order)
  returnOpen.value = true
}
const deliveryVisible = ref(false)
const deliveryTarget = ref('')
const deliveryOrder = ref(null)
const opened = () => emit('open', props.item)

async function perform(action) {
  if (busy.value) return
  busy.value = true
  const id = props.item.id
  try { await action() }
  catch (err) {
    toast.error(err.message || '操作失败，请重试')
    await getOrder(id).catch(() => {})
  } finally { busy.value = false }
}
function takeIssue() {
  const item = props.item
  return perform(async () => {
    await updateBugStatus(item.bugId, 'action')
    toast.success('已加入处理')
    emit('done', item)
  })
}
function remind() {
  const item = props.item
  return perform(async () => {
    await remindPendingItem(item.order, item.kind, item.bugId)
    toast.success('已向' + item.recipient + '发送微信提醒')
    await loadOrders().catch(() => {})
  })
}
const reviewKinds = { urgentReview:'urgent', deliveryReview:'delivery', issueReview:'bug', nextReview:'next', manualReview:'manual' }
function withdraw() {
  const item = props.item
  return perform(async () => {
    await withdrawHandoff(item.order, reviewKinds[item.kind], item.bugId)
    toast.success('已撤回，回到「轮到我」')
  })
}
function showDelivery(target) {
  const item = props.item
  return perform(async () => {
    const order = await getOrder(item.id)
    if (order.status !== (target === 'done' ? 'review' : 'doing')) return toast.info('项目状态已更新')
    deliveryOrder.value = order
    deliveryTarget.value = target
    deliveryVisible.value = true
  })
}
async function returnDelivery(reason) {
  const item = props.item
  await returnOrder(item.id, reason, returnVersion)
  toast.success('已退回，等待负责人修改')
}
</script>
<style scoped>
.handoff-card {display:grid;align-content:start;gap:7px;min-width:0;padding:13px 15px;border:1px solid #dce5f1;border-radius:10px;background:white;color:#233957;box-sizing:border-box}
.handoff-card.returned {border-color:#e7bfaa}
.summary-link {display:grid;gap:7px;color:inherit;text-decoration:none}
header,.card-actions {display:flex;align-items:center;gap:8px;flex-wrap:wrap}
header strong {font-size:15px;font-weight:650;color:#243957;overflow-wrap:anywhere;text-decoration:none}
.summary-link:hover strong,.detail-link:hover {text-decoration:underline}
header span {font-size:12px;color:#526783}
.task-text {margin:0;line-height:1.5;font-size:14px;overflow-wrap:anywhere;white-space:pre-wrap}
.card-actions {margin-top:3px}
.card-actions :deep(.el-button+.el-button) {margin-left:0}
.detail-link,.action {font-size:13px;color:#1759bd;text-decoration:none}
.receipt {font-size:12px;color:#576d84}
@media(max-width:768px){.card-actions :deep(button),.card-actions a {min-height:44px}.card-actions a {display:inline-flex;align-items:center}.handoff-card {padding:12px}}
</style>
