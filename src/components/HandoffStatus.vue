<template>
  <span class="handoff-status" :class="item.lane">
    <span class="turn-owner"><el-icon aria-hidden="true"><component :is="item.review ? Checked : item.mine ? UserFilled : Clock" /></el-icon>{{ item.currentAction }}</span>
    <span v-if="item.handoffNote" class="direction">{{ item.handoffNote }}</span>
    <HandoffReturn :turn="item.turn" />
  </span>
</template>
<script setup>
import { Checked, Clock, UserFilled } from '@element-plus/icons-vue'
import HandoffReturn from './HandoffReturn.vue'
defineProps({ item: { type: Object, required: true } })
</script>
<style scoped>
.handoff-status {display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 8px}
.turn-owner {display:inline-flex;gap:5px;align-items:center;max-width:100%;border-radius:6px;padding:3px 7px;
  color:#354962;background:#ebeff5;font-weight:700;font-size:13px;line-height:1.5;overflow-wrap:anywhere}
.turn-owner .el-icon {flex:none}
.review .turn-owner {color:#874200;background:#ffedcd}
.work .turn-owner {color:#164b9b;background:#e1edff}
.direction {font-size:12px;color:#52647b;line-height:1.5;overflow-wrap:anywhere}
</style>
