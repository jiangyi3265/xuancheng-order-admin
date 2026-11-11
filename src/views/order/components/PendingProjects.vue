<template>
  <section class="pending-projects" aria-labelledby="pending-projects-heading">
    <header>
      <h2 id="pending-projects-heading">
        <button v-if="isMobile" type="button" class="pending-toggle" aria-controls="pending-project-content" :aria-expanded="mobileOpen" @click="mobileOpen = !mobileOpen">
          待处理 <span>{{ items.length }} 条</span><el-icon aria-hidden="true"><component :is="mobileOpen ? 'ArrowDown' : 'ArrowRight'"/></el-icon>
        </button>
        <template v-else>待处理 <span>{{ items.length }} 条</span></template>
      </h2>
      <div v-if="isMobile && !mobileOpen && items.length" class="mobile-turn-count">
        <button v-for="group in personalGroups" :key="group.key" type="button" :class="group.key" aria-controls="pending-project-content"
          @click="selectLane(group.key); mobileOpen = true">{{ group.label }} <b>{{ group.rows.length }}</b></button>
      </div>
      <button v-if="(!isMobile || mobileOpen) && canFilterReminders && (unreminded.length || laneItems.some(item => item.receipt))" class="pending-filter" type="button"
        :aria-pressed="onlyUnreminded" @click="onlyUnreminded = !onlyUnreminded; expanded = false">
        只看未提醒 <span>{{ unreminded.length }}</span>
      </button>
      <button v-if="(!isMobile || mobileOpen) && filteredItems.length > limit" class="pending-expand" type="button" :aria-expanded="expanded" aria-controls="pending-project-links"
        @click="expanded = !expanded">{{ expanded ? '收起' : '查看全部 ' + filteredItems.length + ' 条' }}</button>
      <span v-if="(!isMobile || mobileOpen) && !items.length" class="pending-empty">当前没有待处理事项</span>
    </header>
    <div v-show="!isMobile || mobileOpen" id="pending-project-content">
    <HandoffTabs v-if="items.length" :tabs="tabs" :active="activeLane" label="按交接阶段筛选" @select="selectLane" />
    <p v-if="items.length && !filteredItems.length" class="pending-empty">{{ onlyUnreminded && canFilterReminders ? '当前待处理事项都已提醒。' : groups.find(g => g.key === activeLane)?.empty }}</p>
    <ul v-if="filteredItems.length" id="pending-project-links">
      <li v-for="item in visibleItems" :key="item.key" :class="item.lane">
        <router-link :to="pendingDestination(item, route.query)" class="pending-link">
          <span class="pending-kind" :class="item.kind">{{ labels[item.kind] }}</span>
          <span class="pending-copy">
            <strong>{{ item.title }}</strong>
            <span class="item-text"><IssueNumber v-if="item.kind === 'bug' && item.bugId" :id="item.bugId" /> {{ item.text }}</span>
            <HandoffStatus :item="item" />
            <small v-if="item.kind === 'next' && item.due">截止 {{ item.due }}</small>
            <small v-if="item.receipt" class="pending-receipt" :title="receiptLabel(item)">{{ receiptLabel(item) }}</small>
          </span>
          <el-icon aria-hidden="true"><ArrowRight /></el-icon>
        </router-link>
        <div class="turn-actions">
          <template v-if="item.review && item.mine">
            <UrgentReviewActions v-if="item.kind === 'urgentReview'" :order="item.order" />
            <TaskReviewActions v-else-if="item.kind !== 'deliveryReview'" :item="item" />
            <router-link v-else :to="pendingDestination(item)" class="pending-remind">去验收</router-link>
          </template>
          <template v-else-if="item.mine && !item.review">
            <router-link v-if="item.needsAcceptance || item.fresh || item.kind === 'bug' && !item.bugId" :to="pendingDestination(item)" class="pending-remind">{{ item.needsAcceptance ? '去接单' : '查看问题' }}</router-link>
            <button v-else class="pending-remind primary-action" type="button" :disabled="sending.has(item.key)" @click="submitItem(item)">{{ item.turn ? submitLabel(item.turn) : '标为已处理' }}</button>
          </template>
          <button v-if="!item.review && !item.fresh && (!item.mine || !item.turn) && item.recipientId != null" type="button" class="pending-remind" :disabled="sending.has(item.key)"
            :aria-label="item.title + (item.receipt ? '，再提醒' : '，提醒') + (item.recipient || '负责人') + '处理' + labels[item.kind]"
            @click.stop="remind(item, $event)">{{ sending.has(item.key) ? '发送中' : item.receipt ? '再提醒' : item.mine ? '提醒自己' : '提醒' }}</button>
        </div>
      </li>
    </ul>
    </div>
  </section>
</template>

<script setup>
import HandoffStatus from '@/components/HandoffStatus.vue'
import HandoffTabs from '@/components/HandoffTabs.vue'
import TaskReviewActions from '@/components/TaskReviewActions.vue'
import UrgentReviewActions from '@/components/UrgentReviewActions.vue'
import { handoffGroups, handoffItems, reviewLabels, submitLabel } from '@/utils/handoffs'
import { finishPendingWithUndo } from '@/utils/orderUndo'
import IssueNumber from '@/components/IssueNumber.vue'
import { computed, reactive, ref } from 'vue'
import { toast as ElMessage } from '@/utils/toast'
import { currentMember, isBoss, loadOrders, remindPendingItem } from '@/mock/store'
import { useRoute } from 'vue-router'
import { ArrowRight } from '@element-plus/icons-vue'
import { pendingLabels, pendingDestination } from '@/utils/pendingItems'
import { isMobile } from '@/utils/useMobile'
import { fmtTime } from '@/utils/time'

const props = defineProps({ orders: { type: Array, required: true } })
const route = useRoute()
const mobileOpen = ref(false)
const expanded = ref(false)
const onlyUnreminded = ref(false)
const sending = reactive(new Set())
const limit = computed(() => isMobile.value ? 2 : 3)
const labels = { ...pendingLabels, ...reviewLabels }
const lane = ref('')
const items = computed(() => handoffItems(props.orders, currentMember.value.id, isBoss.value))
const groups = computed(() => handoffGroups(items.value))
const personalGroups = computed(() => groups.value.filter(g => g.key === 'work' || g.key === 'review'))
const tabs = computed(() => [
  ...groups.value.map(group => ({ key: group.key, label: group.label, count: group.rows.length })),
  { key: 'all', label: '全部', count: items.value.length }
])
const activeLane = computed(() => lane.value || groups.value.find(group => group.rows.length)?.key || 'work')
const laneItems = computed(() => activeLane.value === 'all'
  ? groups.value.flatMap(group => group.rows)
  : groups.value.find(group => group.key === activeLane.value).rows)
const canFilterReminders = computed(() => !['review', 'waitingReview'].includes(activeLane.value))
const unreminded = computed(() => laneItems.value.filter(item => !item.receipt && !item.review && !item.fresh))
const filteredItems = computed(() => onlyUnreminded.value && canFilterReminders.value ? unreminded.value : laneItems.value)
function selectLane(key) {
  lane.value = key
  expanded.value = false
  onlyUnreminded.value = false
}
const visibleItems = computed(() => expanded.value ? filteredItems.value : filteredItems.value.slice(0, limit.value))

async function submitItem(item) {
  if (sending.has(item.key)) return
  lane.value = activeLane.value
  sending.add(item.key)
  try { await finishPendingWithUndo(item.order,item.kind,item.bugId, item.turn ? '已提交处理结果' : '已处理：' + item.title) }
  catch (err) { ElMessage.error(err.message || '提交失败'); await loadOrders().catch(() => {}) }
  finally { sending.delete(item.key) }
}

function receiptLabel(item) {
  return fmtTime(item.receipt.at) + ' · ' + item.receipt.by + ' 已提醒'
}

async function remind(item, event) {
  if (sending.has(item.key) || event.detail > 1) return
  sending.add(item.key)
  try {
    await remindPendingItem(item.order, item.kind, item.bugId)
    ElMessage.success('已向' + (item.recipient || '负责人') + '发送微信提醒')
  } catch (err) {
    ElMessage.error(err.message || '微信提醒发送失败')
  } finally {
    await loadOrders().catch(() => {})
    sending.delete(item.key)
  }
}

</script>

<style scoped>
.turn-actions {display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:0 12px 10px;margin-top:auto}
.turn-actions:empty {display:none}
.pending-copy small {line-height:1.45}
.mobile-turn-count {display:flex;flex-wrap:wrap;gap:5px}
.pending-projects header .mobile-turn-count button {min-height:36px;padding:4px 7px;border-radius:7px;font-size:12px;font-weight:600}
.mobile-turn-count .review {color:#874200;background:#fff1dd}
.mobile-turn-count .work {color:#164b9b;background:#eaf2ff}

.pending-projects { background: #fff; border: 1px solid #e2e9f4; border-radius: 14px; padding: 12px 16px; margin: 0 0 12px; }
.pending-projects header { flex-wrap: wrap; display: flex; align-items: center; gap: 12px; }
.pending-projects h2 { display: flex; align-items: baseline; gap: 8px; margin: 0; font-size: 16px; color: #1e304f; }
.pending-projects h2 span, .pending-empty { color: #64748b; font-size: 12px; font-weight: 400; }
.pending-projects header button { padding: 4px; border: 0; background: transparent; color: #1757c7; font: inherit; font-size: 13px; cursor: pointer; }
.pending-projects h2 .pending-toggle { display:flex; align-items:center; gap:6px; padding:3px 2px; color:inherit; font:inherit; }
.pending-projects .pending-expand { margin-left: auto; }
.pending-projects .pending-filter { padding: 4px 8px; border: 1px solid #d6e0ef; border-radius: 6px; color: #455977; }
.pending-filter[aria-pressed="true"] { color: #1757c7; background: #edf3ff; border-color: #8fb1ed; }
.pending-projects p.pending-empty { margin: 9px 0 0; }
.pending-projects .pending-receipt { color: #346453; white-space: normal; overflow-wrap: anywhere; }
.pending-projects ul { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(245px,100%),1fr)); gap: 8px; padding: 0; margin: 8px 0 0; list-style: none; }
.pending-projects li { display: flex; flex-direction:column; min-width: 0; background: #f7f9fc; border: 1px solid #e5ebf4; border-radius: 9px; }
.pending-link { flex: 1; min-width: 0; display: flex; align-items: flex-start; gap: 8px; padding: 10px; border-radius: 8px; text-decoration: none; color: #263958; }
.pending-link:hover, .pending-link:focus-visible { background: #edf3ff; }
.pending-remind { align-self: center; flex: none; margin: 0; padding: 5px 9px; color: #1757c7; background: white; border: 1px solid #c3d5f3; border-radius: 7px; font: inherit; font-size: 13px; cursor: pointer; }
.pending-remind:hover, .pending-remind:focus-visible { background: #eaf1ff; border-color: #7b9de4; }
.pending-remind:disabled { color: #68788d; cursor: wait; }
.pending-kind { flex: none; padding: 2px 6px; border-radius: 5px; background: #e8f0ff; color: #2355a4; font-size: 12px; line-height: 18px; }
.pending-kind.urgent { color: #aa3029; background: #ffebe9; }
.pending-kind.bug { color: #854403; background: #fff0d6; }
.pending-kind.manual { color: #57428c; background: #efeafa; }
.pending-copy { display: grid; min-width: 0; gap: 3px; flex: 1; }
.pending-copy strong { font-size: 15px; }
.pending-copy .item-text { color: #40536e; font-size: 13px; line-height: 1.45; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; overflow-wrap: anywhere; }
.pending-copy strong, .pending-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pending-copy small { color: #64748b; font-size: 12px; }
.pending-link > .el-icon { margin: auto 0; color: #6a7e9e; }
.pending-projects li.work {border-top:3px solid #3981da}
.pending-projects li.review {border-top:3px solid #dc8b2d}
.pending-projects .primary-action {background:#1959bd;color:#fff;border-color:#1959bd;font-weight:650}
.pending-copy {gap:6px}
@media (max-width: 768px) {
  .pending-projects { margin: 6px 0 8px; padding: 10px; }
  .pending-projects ul { grid-template-columns: 1fr; gap: 5px; }
  .pending-link { padding: 7px 9px; }
  .pending-remind { min-height: 44px; min-width: 44px; }
}
</style>
