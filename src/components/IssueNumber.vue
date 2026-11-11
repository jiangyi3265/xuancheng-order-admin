<template>
  <span class="issue-number" :title="'问题编号 #' + id">#{{ id }}</span>
</template>

<script setup>
defineProps({ id: { type: [Number, String], required: true } })
</script>

<style scoped>
.issue-number {
  display: inline-block;
  flex: none;
  padding: 1px 6px;
  border-radius: 5px;
  background: #eaf1ff;
  color: #28569b;
  font: 600 12px/1.6 system-ui, sans-serif;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  vertical-align: middle;
}
</style>
