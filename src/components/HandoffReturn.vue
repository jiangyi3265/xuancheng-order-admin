<template>
  <span v-if="turn?.returnedAt" class="return-info" :class="{ resubmitted: turn.submittedAt }">
    <strong>{{ turn.submittedAt ? '修改后重新提交' : '退回修改' }}</strong>
    <small v-if="!compact">{{ fmtTime(turn.returnedAt) }} 退回</small>
    <span v-if="!compact && turn.returnNote" class="return-note">{{ turn.returnNote }}</span>
  </span>
</template>
<script setup>
import { fmtTime } from '@/utils/time'
defineProps({ turn: Object, compact: Boolean })
</script>
<style scoped>
.return-info {display:inline-flex;flex-wrap:wrap;align-items:baseline;gap:3px 7px;max-width:100%;box-sizing:border-box;
  border-left:3px solid #d66c38;border-radius:3px;background:#fff3eb;color:#923f1d;padding:4px 8px;font-size:12px;line-height:1.5}
.return-info strong {font-weight:700}.return-info small {font:inherit;font-size:11px}
.return-note {flex-basis:100%;overflow-wrap:anywhere;white-space:pre-wrap}
.resubmitted {background:#f0f6ff;color:#2c5485;border-color:#5f8abf}
</style>
