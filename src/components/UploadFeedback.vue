<template>
  <div v-if="queue.tasks.length" class="upload-feedback" role="status" aria-live="polite">
    <span v-if="queue.uploadingCount">正在上传 {{ queue.uploadingCount }} 个附件…</span>
    <div v-for="task in blocked" :key="task.id" class="unfinished">
      <span :title="task.name + ' · ' + task.error">{{ task.name }} · {{ task.error }}</span>
      <button v-if="task.status === 'failed'" type="button" @click="queue.retry(task)">重试</button>
      <label v-else class="reselect">重新选择<input type="file" :aria-label="'重新选择 ' + task.name" @change="queue.replace(task, $event.target.files[0])"></label>
      <button type="button" :aria-label="'移除 ' + task.name" @click="queue.discard(task)">移除</button>
    </div>
  </div>
</template>
<script setup>
import { computed } from 'vue'
const props = defineProps({ queue: {type: Object, required: true} })
const blocked = computed(() => props.queue.tasks.filter(task => ['failed','reselect'].includes(task.status)))
</script>
<style scoped>
.upload-feedback{max-height:12vh;overflow:auto;font-size:12px;color:#526783;line-height:1.4;padding:3px 0}
.unfinished{display:flex;align-items:center;flex-wrap:wrap;gap:4px 8px;color:#974909}
.unfinished>span{min-width:38px;flex:1;overflow-wrap:anywhere}
.unfinished button,.reselect{position:relative;background:transparent;border:0;color:#1758ba;cursor:pointer;font:inherit;padding:4px 0}
.reselect input{position:absolute;inset:0;width:100%;opacity:0;cursor:pointer}
.reselect:focus-within{outline:2px solid #1758ba}
</style>
