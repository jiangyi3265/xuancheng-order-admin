<template>
  <section v-if="ordersError" class="project-load-state" role="alert">
    <strong>项目没加载出来</strong><p>{{ ordersError }}</p>
    <el-button type="primary" plain @click="retry">重试</el-button>
  </section>
  <section v-else class="project-load-state" role="status" aria-live="polite" aria-label="正在加载项目">
    <div class="skeleton-metrics"><el-skeleton animated :rows="1" v-for="n in 4" :key="n" /></div>
    <el-skeleton animated :rows="2" v-for="n in 3" :key="n" />
  </section>
</template>
<script setup>
import { ordersError, syncOrders } from '@/mock/store'
async function retry() { try { await syncOrders(true) } catch { /* ordersError carries the retry result */ } }
</script>
<style scoped>
.project-load-state { padding:20px; background:white; border-radius:12px }
.project-load-state p {color:#67738a}
.skeleton-metrics {display:grid;grid-template-columns:repeat(auto-fit,minmax(95px,1fr));gap:18px;margin-bottom:26px}
.project-load-state>.el-skeleton {padding:14px 0}
</style>
