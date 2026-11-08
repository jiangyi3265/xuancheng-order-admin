<template>
  <!-- 客户看进度：确认需求 → 制作中 → 验收中 → 已完成，不用再去微信上问「做到哪了」 -->
  <div class="ps-wrap">
  <div v-if="status === 'cancelled'" class="progress-steps cancelled">项目已取消</div>
  <div v-else class="progress-steps" :class="{ compact }" role="list" aria-label="项目进度">
    <div v-for="(s, i) in STEPS" :key="s.key" class="ps-step" role="listitem"
      :class="{ done: i < current, current: i === current }" :aria-current="i === current ? 'step' : undefined">
      <span class="ps-dot"><el-icon v-if="i < current"><Check /></el-icon></span>
      <span class="ps-label">{{ s.label }}</span>
    </div>
  </div>
  <p v-if="!compact && hint" class="ps-hint">{{ hint }}</p>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Check } from '@element-plus/icons-vue'

const props = defineProps({
  status: { type: String, default: 'pending' },
  deadline: { type: String, default: '' },
  compact: { type: Boolean, default: false }
})
const STEPS = [
  { key: 'pending', label: '确认需求' },
  { key: 'doing', label: '制作中' },
  { key: 'review', label: '验收中' },
  { key: 'done', label: '已完成' }
]
// 已完成时四步都打勾，没有「当前」这一步
const current = computed(() => (props.status === 'done' ? STEPS.length : Math.max(0, STEPS.findIndex((s) => s.key === props.status))))
const hint = computed(() => {
  // 截止日期已经过了就不再写「预计」，免得客户看到一个过去的日期
  const d = new Date(), pad = (n) => String(n).padStart(2, '0')
  const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const by = props.deadline && props.deadline >= today ? `，预计 ${Number(props.deadline.slice(5, 7))}月${Number(props.deadline.slice(8, 10))}日前完成` : ''
  return {
    pending: '团队正在确认需求，确认后开始制作',
    doing: '正在制作' + by,
    review: '已经做完，团队正在做最后检查',
    done: '项目已完成，有问题可以随时反馈'
  }[props.status] || ''
})
</script>

<style scoped>
.progress-steps {
  display: flex;
  align-items: flex-start;
  margin: 4px 0 2px;
}
.ps-step {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #9aa6b8;
}
/* 两个点之间的连线 */
.ps-step + .ps-step::before {
  content: '';
  position: absolute;
  top: 9px;
  right: 50%;
  width: 100%;
  height: 2px;
  background: #e3e9f2;
}
.ps-step.done + .ps-step::before,
.ps-step.done + .ps-step.current::before {
  background: #3b6cff;
}
.ps-dot {
  position: relative;
  z-index: 1;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  border: 2px solid #d6dee9;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 12px;
}
.ps-step.done .ps-dot {
  background: #3b6cff;
  border-color: #3b6cff;
}
.ps-step.current .ps-dot {
  border-color: #3b6cff;
  box-shadow: 0 0 0 4px #e3ebff;
}
.ps-step.current .ps-dot:empty::after {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #3b6cff;
}
.ps-step.done,
.ps-step.current {
  color: #1d2b45;
}
.ps-step.current .ps-label {
  font-weight: 650;
  color: #3b6cff;
}
.ps-hint {
  margin: 8px 0 0;
  font-size: 13px;
  color: #5b6b85;
  text-align: center;
}
.compact .ps-dot {
  width: 14px;
  height: 14px;
  font-size: 9px;
}
.compact .ps-step {
  font-size: 11px;
  gap: 4px;
}
.compact .ps-step + .ps-step::before {
  top: 6px;
}
.compact .ps-step.current .ps-dot:empty::after {
  width: 6px;
  height: 6px;
}
.progress-steps.cancelled {
  justify-content: center;
  font-size: 13px;
  color: #909399;
}
</style>
