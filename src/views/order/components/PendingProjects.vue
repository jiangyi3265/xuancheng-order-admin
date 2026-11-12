<template>
  <section class="pending-projects" aria-label="待处理">
    <header>
      <h2><button v-if="isMobile" type="button" class="toggle" :aria-expanded="mobileOpen" @click="mobileOpen = !mobileOpen">
        待处理 · 轮到我 {{ mine.length }}<el-icon><component :is="mobileOpen ? ArrowUp : ArrowDown" /></el-icon>
      </button><template v-else>待处理</template></h2>
      <button v-if="showContent && (remindable.length || onlyUnreminded)" class="filter" :aria-pressed="onlyUnreminded" @click="filterReminders">
        只看未提醒 {{ unreminded.length }}
      </button>
    </header>
    <div v-if="showContent">
      <HandoffTabs :tabs="tabs" :active="lane" label="按交接阶段筛选" @select="selectLane" />
      <p v-if="!filtered.length" class="empty" role="status">{{ onlyUnreminded ? '当前待处理事项都已提醒' : lane === 'mine' ? '当前没有轮到你的事项' : lane === 'waiting' ? '当前没有等对方的事项' : '当前没有待处理事项' }}</p>
      <ul v-else><li v-for="item in visible" :key="item.key"><HandoffCard :item="item" self-reminder /></li></ul>
      <button v-if="filtered.length > limit" type="button" class="expand" :aria-expanded="expanded" @click="expanded = !expanded">
        {{ expanded ? '收起' : '查看全部 ' + filtered.length + ' 条' }}
      </button>
    </div>
  </section>
</template>
<script setup>
import { computed, ref } from 'vue'
import { ArrowDown, ArrowUp } from '@element-plus/icons-vue'
import { currentMember, isBoss } from '@/mock/store'
import HandoffTabs from '@/components/HandoffTabs.vue'
import HandoffCard from '@/components/HandoffCard.vue'
import { handoffItems } from '@/utils/handoffs'
import { inboxRank } from '@/utils/todos'
import { handoffDate } from '@/utils/pendingItems'
import { isMobile } from '@/utils/useMobile'
const props = defineProps({ orders: { type: Array, required: true } })
const mobileOpen = ref(false)
const expanded = ref(false)
const onlyUnreminded = ref(false)
const lane = ref('mine')
const showContent = computed(() => !isMobile.value || mobileOpen.value)
const limit = computed(() => isMobile.value ? 4 : 8)
const items = computed(() => {
  const today = handoffDate()
  return handoffItems(props.orders, currentMember.value.id, isBoss.value)
    .sort((a, b) => inboxRank(a, today) - inboxRank(b, today) || String(b.turn?.returnedAt || '').localeCompare(String(a.turn?.returnedAt || '')))
})
const mine = computed(() => items.value.filter(item => item.mine))
const waiting = computed(() => items.value.filter(item => !item.mine && item.personal))
const tabs = computed(() => [
  { key:'mine', label:'轮到我', count:mine.value.length },
  { key:'waiting', label:'等对方', count:waiting.value.length },
  ...(isBoss.value ? [{ key:'all', label:'全部', count:items.value.length }] : [])
])
const rows = computed(() => lane.value === 'all' && isBoss.value ? items.value : lane.value === 'waiting' ? waiting.value : mine.value)
const remindable = computed(() => rows.value.filter(item => !item.mine && !item.fresh && item.recipientId != null && (!item.review || item.personal)))
const unreminded = computed(() => remindable.value.filter(item => !item.receipt))
const filtered = computed(() => onlyUnreminded.value ? unreminded.value : rows.value)
const visible = computed(() => expanded.value ? filtered.value : filtered.value.slice(0, limit.value))
function selectLane(key) {
  lane.value = key
  expanded.value = false
  onlyUnreminded.value = false
}
function filterReminders() {
  onlyUnreminded.value = !onlyUnreminded.value
  expanded.value = false
}
</script>
<style scoped>
.pending-projects {background:white;border:1px solid #dfe7f2;border-radius:14px;padding:13px 16px;margin-bottom:12px;color:#223852}
header {display:flex;align-items:center;gap:14px;flex-wrap:wrap}
h2 {margin:0;font-size:16px}
button {font:inherit;cursor:pointer;color:#275798}
.toggle,.expand {border:0;background:none;padding:4px 0}
.toggle {display:inline-flex;gap:9px;align-items:center;min-height:40px}
.filter {padding:4px 8px;border:1px solid #d4dfea;border-radius:6px;background:white;font-size:12px}
.filter[aria-pressed=true] {background:#eaf1ff}
ul {display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,250px),1fr));gap:8px;padding:0;margin:8px 0 0;list-style:none}
li {min-width:0}.empty,.expand {font-size:13px}.expand {margin-top:8px}
@media(max-width:768px){.pending-projects {padding:6px 10px}.filter,.expand {min-height:44px}}
</style>
