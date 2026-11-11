<template>
  <span v-if="reply || openCount" class="customer-wait-badges">
    <span v-if="reply" class="reply">客户等回复</span>
    <span v-if="openCount">{{ openCount }} 条问题{{ order.newBugCount > 0 ? '（' + order.newBugCount + ' 条新的）' : '未解决' }}</span>
  </span>
</template>
<script setup>
import {computed} from 'vue'
import {waitingReply} from '@/utils/todos'

const props = defineProps({order: {type: Object, required: true}})
const reply = computed(() => waitingReply(props.order))
const openCount = computed(() => Number(props.order.openBugCount) || 0)
</script>
<style scoped>
.customer-wait-badges {display:flex; flex-wrap:wrap; gap:4px;}
.customer-wait-badges > span {padding:2px 6px; background:#edf2ff; color:#354f92; border-radius:5px; font-size:12px; line-height:1.5;}
.customer-wait-badges > .reply {background:#fff2da; color:#86520a;}
</style>
