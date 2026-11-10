<template>
  <span class="requirement-status" :class="status">
    <el-icon aria-hidden="true"><CircleCheck v-if="status==='resolved'" /><Clock v-else-if="status==='confirm'" /><Document v-else /></el-icon>{{ progressLabel(status) }}
  </span>
</template>
<script setup>
import { CircleCheck, Clock, Document } from '@element-plus/icons-vue'
import { progressLabel } from '@/customer/constants/options'
defineProps({status: String})
</script>
<style scoped>
.requirement-status {
  display:inline-flex; align-items:center; gap:5px; white-space:nowrap; flex:none;
  padding:3px 8px; border-radius:6px; font-size:12px; line-height:1.55; font-weight:550;
  background:#edf2f8; color:#4d627c;
}
.requirement-status.confirm { background:#fff1d8; color:#855000; }
.requirement-status.resolved { background:#e3f4ed; color:#136b51; }
.requirement-status .el-icon {font-size:13px}
.requirement-status {border-radius:20px;padding:4px 9px;background:#ebf1ff;color:#375ca2;font-weight:600}
</style>
