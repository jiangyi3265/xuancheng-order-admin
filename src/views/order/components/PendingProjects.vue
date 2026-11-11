<template>
  <section class="pending-projects" aria-labelledby="pending-projects-heading">
    <header>
      <h2 id="pending-projects-heading">
        <button v-if="isMobile" type="button" class="pending-toggle" aria-controls="pending-project-content" :aria-expanded="mobileOpen" @click="mobileOpen = !mobileOpen">
          待处理 <span>{{ items.length }} 条</span><el-icon aria-hidden="true"><component :is="mobileOpen ? 'ArrowDown' : 'ArrowRight'"/></el-icon>
        </button>
        <template v-else>待处理 <span>{{ items.length }} 条</span></template>
      </h2>
      <button v-if="(!isMobile || mobileOpen) && (items.length || onlyUnreminded)" class="pending-filter" type="button"
        :aria-pressed="onlyUnreminded" @click="onlyUnreminded = !onlyUnreminded; expanded = false">
        只看未提醒 <span>{{ unreminded.length }}</span>
      </button>
      <button v-if="(!isMobile || mobileOpen) && filteredItems.length > limit" class="pending-expand" type="button" :aria-expanded="expanded" aria-controls="pending-project-links"
        @click="expanded = !expanded">{{ expanded ? '收起' : '查看全部 ' + filteredItems.length + ' 条' }}</button>
      <span v-if="(!isMobile || mobileOpen) && !items.length" class="pending-empty">当前没有待处理事项</span>
    </header>
    <div v-show="!isMobile || mobileOpen" id="pending-project-content">
    <p v-if="items.length && !filteredItems.length" class="pending-empty">当前待处理事项都已提醒。</p>
    <ul v-if="filteredItems.length" id="pending-project-links">
      <li v-for="item in visibleItems" :key="item.key">
        <router-link :to="pendingDestination(item, route.query)" class="pending-link">
          <span class="pending-kind" :class="item.kind">{{ labels[item.kind] }}</span>
          <span class="pending-copy">
            <strong>{{ item.title }}</strong>
            <span><IssueNumber v-if="item.kind === 'bug' && item.bugId" :id="item.bugId" /> {{ item.text }}</span>
            <small v-if="item.meta">{{ item.meta }}</small>
            <small v-if="item.receipt" class="pending-receipt" :title="receiptLabel(item)">{{ receiptLabel(item) }}</small>
          </span>
          <el-icon aria-hidden="true"><ArrowRight /></el-icon>
        </router-link>
        <button v-if="!item.fresh" type="button" class="pending-remind" :disabled="sending.has(item.key)"
          :aria-label="item.title + (item.receipt ? '，再提醒' : '，提醒') + (item.recipient || '负责人') + '处理' + labels[item.kind]"
          :title="'微信提醒' + (item.recipient || '负责人')" @click.stop="remind(item, $event)">
          {{ sending.has(item.key) ? '发送中' : item.receipt ? '再提醒' : '提醒' }}
        </button>
      </li>
    </ul>
    </div>
  </section>
</template>

<script setup>
import IssueNumber from '@/components/IssueNumber.vue'
import { computed, reactive, ref } from 'vue'
import { toast as ElMessage } from '@/utils/toast'
import { loadOrders, remindPendingItem } from '@/mock/store'
import { useRoute } from 'vue-router'
import { ArrowRight } from '@element-plus/icons-vue'
import { pendingItems, pendingLabels as labels, pendingDestination } from '@/utils/pendingItems'
import { isMobile } from '@/utils/useMobile'
import { fmtTime } from '@/utils/time'

const props = defineProps({ orders: { type: Array, required: true } })
const route = useRoute()
const mobileOpen = ref(false)
const expanded = ref(false)
const onlyUnreminded = ref(false)
const sending = reactive(new Set())
const limit = computed(() => isMobile.value ? 2 : 3)
const items = computed(() => pendingItems(props.orders))
const unreminded = computed(() => items.value.filter(item => !item.receipt))
const filteredItems = computed(() => onlyUnreminded.value ? unreminded.value : items.value)
const visibleItems = computed(() => expanded.value ? filteredItems.value : filteredItems.value.slice(0, limit.value))

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
.pending-projects li { display: flex; min-width: 0; background: #f7f9fc; border: 1px solid #e5ebf4; border-radius: 9px; }
.pending-link { flex: 1; min-width: 0; display: flex; align-items: flex-start; gap: 8px; padding: 10px; border-radius: 8px; text-decoration: none; color: #263958; }
.pending-link:hover, .pending-link:focus-visible { background: #edf3ff; }
.pending-remind { align-self: center; flex: none; margin: 0 8px 0 2px; padding: 5px 9px; color: #1757c7; background: white; border: 1px solid #c3d5f3; border-radius: 7px; font: inherit; font-size: 13px; cursor: pointer; }
.pending-remind:hover, .pending-remind:focus-visible { background: #eaf1ff; border-color: #7b9de4; }
.pending-remind:disabled { color: #68788d; cursor: wait; }
.pending-kind { flex: none; padding: 2px 6px; border-radius: 5px; background: #e8f0ff; color: #2355a4; font-size: 12px; line-height: 18px; }
.pending-kind.urgent { color: #aa3029; background: #ffebe9; }
.pending-kind.bug { color: #854403; background: #fff0d6; }
.pending-kind.manual { color: #57428c; background: #efeafa; }
.pending-copy { display: grid; min-width: 0; gap: 3px; flex: 1; }
.pending-copy strong { font-size: 14px; }
.pending-copy > span { color: #40536e; font-size: 13px; line-height: 1.45; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; overflow-wrap: anywhere; }
.pending-copy strong, .pending-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pending-copy small { color: #64748b; font-size: 12px; }
.pending-link > .el-icon { margin: auto 0; color: #6a7e9e; }
@media (max-width: 768px) {
  .pending-projects { margin: 6px 0 8px; padding: 10px; }
  .pending-projects ul { grid-template-columns: 1fr; gap: 5px; }
  .pending-link { padding: 7px 9px; }
  .pending-remind { min-height: 44px; min-width: 44px; }
}
</style>
