<template>
  <div v-if="waitingHandoffs.length" class="waiting-handoffs">
    <button type="button" class="waiting-toggle" :aria-expanded="expanded" @click="expanded = !expanded">
      <strong>等对方 {{ waitingHandoffs.length }} 件</strong>
      <span>{{ summary }}</span>
      <el-icon aria-hidden="true"><component :is="expanded ? ArrowUp : ArrowDown" /></el-icon>
    </button>
    <div v-if="expanded" class="waiting-cards" role="list" aria-label="等对方">
      <HandoffCard v-for="item in waitingHandoffs" :key="item.key" role="listitem" :item="item" />
    </div>
  </div>
</template>
<script setup>
import { computed, ref } from 'vue'
import { ArrowDown, ArrowUp } from '@element-plus/icons-vue'
import { waitingHandoffs } from '@/utils/todos'
import HandoffCard from './HandoffCard.vue'
const expanded = ref(false)
const summary = computed(() => {
  const counts = new Map()
  for (const item of waitingHandoffs.value) {
    const label = '等' + (item.recipient || '指定负责人') + (item.review ? '确认' : '处理')
    counts.set(label, (counts.get(label) || 0) + 1)
  }
  return Array.from(counts, ([label, count]) => label + ' ' + count).join(' · ')
})
</script>
<style scoped>
.waiting-handoffs {margin:10px 0}
.waiting-toggle {display:flex;align-items:center;flex-wrap:wrap;gap:6px 12px;width:100%;min-height:44px;padding:9px 14px;border:1px solid #dbe4ef;border-radius:9px;background:#f8faff;text-align:left;font:inherit;font-size:14px;color:#324a67;cursor:pointer}
.waiting-toggle span {font-size:13px}.waiting-toggle .el-icon {margin-left:auto}
.waiting-cards {display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,270px),1fr));gap:8px;margin-top:8px}
</style>
