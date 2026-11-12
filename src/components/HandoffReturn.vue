<template>
  <span v-if="turn?.returnedAt && !turn.submittedAt" class="return-info">
    <strong>{{ turn.requesterId === currentMember.id ? '你' : (turn.requesterName || '发起人') }}{{ delivery ? '退回返工' : '退回' }}{{ turn.returnNote ? '：' + turn.returnNote : '' }}</strong>
    <small v-if="!compact">{{ fmtTime(turn.returnedAt) }}</small>
  </span>
  <span v-else-if="turn?.submittedAt && turn.submitNote" class="return-info resubmitted">
    <strong>{{ turn.submittedBy === currentMember.id ? '你' : (turn.submittedName || '提交人') }}：{{ turn.submitNote }}</strong>
  </span>
</template>
<script setup>
import { currentMember } from '@/mock/store'
import { fmtTime } from '@/utils/time'
defineProps({ turn: Object, compact: Boolean, delivery: Boolean })
</script>
<style scoped>
.return-info {display:inline-flex;flex-wrap:wrap;align-items:baseline;gap:3px 7px;max-width:100%;box-sizing:border-box;
  border-left:3px solid #d66c38;border-radius:3px;background:#fff3eb;color:#923f1d;padding:4px 8px;font-size:12px;line-height:1.5}
.return-info strong {font-weight:600;white-space:pre-wrap;overflow-wrap:anywhere}.return-info small {font:inherit;font-size:11px}
.resubmitted {background:#f0f6ff;color:#2c5485;border-color:#5f8abf}
</style>
