<template>
  <div class="dl-chips">
    <span
      v-for="c in chips"
      :key="c.label"
      class="chip"
      :class="{ on: modelValue === c.val }"
      @click="emit('update:modelValue', c.val)"
    >{{ c.label }}</span>
    <span v-if="modelValue && !isPreset" class="chip on">{{ modelValue }}</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { dateAfterDays } from '@/utils/date'

const props = defineProps({ modelValue: { type: String, default: '' } })
const emit = defineEmits(['update:modelValue'])

const chips = [
  { label: '今天', val: dateAfterDays(0) },
  { label: '明天', val: dateAfterDays(1) },
  { label: '3天', val: dateAfterDays(3) },
  { label: '一周', val: dateAfterDays(7) },
  { label: '两周', val: dateAfterDays(14) },
  { label: '不限', val: '' }
]

const isPreset = computed(() => chips.some((c) => c.val === props.modelValue))
</script>

<style scoped>
.dl-chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.chip {
  padding: 4px 14px;
  border: 1px solid #dcdfe6;
  border-radius: 16px;
  font-size: 13px;
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
