<template>
  <!-- 截止日期一键选：今天 / 明天 / 3天 / 一周 / 两周，比翻日历快 -->
  <div class="dl-chips" role="group" aria-label="快速选择截止日期">
    <button
      v-for="c in chipsNow()"
      :key="c.label"
      type="button"
      class="chip"
      :class="{ on: modelValue === c.val }"
      :aria-pressed="modelValue === c.val"
      @click="emit('update:modelValue', c.val)"
    >{{ c.label }}</button>
  </div>
</template>

<script setup>
import { dateAfterDays } from '@/utils/date'

const props = defineProps({
  modelValue: { type: String, default: '' },
  // 旁边已经有日期框可以清空时，不再多放一个「不限」
  clearable: { type: Boolean, default: true }
})
const emit = defineEmits(['update:modelValue'])

// 每次渲染现算，页面跨过零点也不会错一天
function chipsNow() {
  const list = [
    { label: '今天', val: dateAfterDays(0) },
    { label: '明天', val: dateAfterDays(1) },
    { label: '3天', val: dateAfterDays(3) },
    { label: '一周', val: dateAfterDays(7) },
    { label: '两周', val: dateAfterDays(14) }
  ]
  if (props.clearable) list.push({ label: '不限', val: '' })
  return list
}
</script>

<style scoped>
.dl-chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.chip {
  font: inherit;
  background: #fff;
  line-height: 1.5;
  padding: 3px 12px;
  border: 1px solid #dcdfe6;
  border-radius: 16px;
  font-size: 12px;
  color: #606266;
  cursor: pointer;
  transition: all 0.15s;
}
.chip.on {
  background: #ecf5ff;
  color: #409eff;
  border-color: #409eff;
  font-weight: 600;
}
</style>
