<template>
  <div class="dashboard">
    <!-- 指标卡 -->
    <div class="stat-grid">
      <div class="stat-card" v-for="s in statCards" :key="s.label" :style="{ borderTopColor: s.color }">
        <div class="stat-icon" :style="{ background: s.bg, color: s.color }">
          <el-icon :size="22"><component :is="s.icon" /></el-icon>
        </div>
        <div class="stat-body">
          <div class="stat-value" :style="{ color: s.color }">{{ s.value }}</div>
          <div class="stat-label">{{ s.label }}</div>
        </div>
      </div>
    </div>

    <!-- 逾期预警条 -->
    <el-alert
      v-if="overdueList.length"
      class="overdue-alert"
      type="error"
      :closable="false"
      show-icon
    >
      <template #title>
        <span>有 {{ overdueList.length }} 个项目已逾期未交付：</span>
        <el-tag
          v-for="o in overdueList"
          :key="o.id"
          type="danger"
          size="small"
          effect="plain"
          style="margin-left: 6px"
        >
          {{ o.title }}（截止 {{ o.deadline }}）
        </el-tag>
      </template>
    </el-alert>

    <!-- 图表区 -->
    <el-row :gutter="16" class="chart-row">
      <el-col :xs="24" :md="12">
        <el-card shadow="never" class="chart-card">
          <template #header><span class="chart-title">订单状态分布</span></template>
          <ChartCard :option="statusPie" :height="300" />
        </el-card>
      </el-col>
      <el-col :xs="24" :md="12">
        <el-card shadow="never" class="chart-card">
          <template #header><span class="chart-title">近 6 个月接单趋势</span></template>
          <ChartCard :option="trendBar" :height="300" />
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16" class="chart-row">
      <el-col :xs="24" :md="12">
        <el-card shadow="never" class="chart-card">
          <template #header><span class="chart-title">渠道来源占比</span></template>
          <ChartCard :option="channelPie" :height="300" />
        </el-card>
      </el-col>
      <el-col :xs="24" :md="12">
        <el-card shadow="never" class="chart-card">
          <template #header><span class="chart-title">成员工作量对比</span></template>
          <ChartCard :option="memberBar" :height="300" />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import ChartCard from '@/components/ChartCard.vue'
import { orders } from '@/mock/store'
import { todayStr as todayLocal } from '@/utils/date'
import { STATUS, CHANNEL, MEMBERS, statusMap, channelMap } from '@/constants/options'

const todayStr = todayLocal()
const isOverdue = (o) =>
  ['pending', 'doing', 'review'].includes(o.status) && o.deadline && o.deadline < todayStr

const count = (fn) => orders.filter(fn).length
const sum = (fn) => orders.filter(fn).reduce((s, o) => s + (Number(o.amount) || 0), 0)

const overdueList = computed(() => orders.filter(isOverdue))

const statCards = computed(() => [
  { label: '进行中', value: count((o) => o.status === 'doing'), color: '#409eff', bg: '#ecf5ff', icon: 'Loading' },
  { label: '待确认', value: count((o) => o.status === 'pending'), color: '#909399', bg: '#f4f4f5', icon: 'Bell' },
  { label: '待验收', value: count((o) => o.status === 'review'), color: '#e6a23c', bg: '#fdf6ec', icon: 'View' },
  { label: '逾期预警', value: overdueList.value.length, color: '#f56c6c', bg: '#fef0f0', icon: 'Warning' },
  { label: '已完成营收(元)', value: sum((o) => o.status === 'done').toLocaleString(), color: '#67c23a', bg: '#f0f9eb', icon: 'Wallet' },
  { label: '进行中金额(元)', value: sum((o) => ['pending', 'doing', 'review'].includes(o.status)).toLocaleString(), color: '#409eff', bg: '#ecf5ff', icon: 'Coin' }
])

// 订单状态分布（环形）
const statusPie = computed(() => ({
  tooltip: { trigger: 'item' },
  legend: { bottom: 0 },
  series: [
    {
      type: 'pie',
      radius: ['42%', '68%'],
      center: ['50%', '45%'],
      avoidLabelOverlap: true,
      label: { formatter: '{b}\n{c}' },
      data: STATUS.map((s) => ({
        name: s.label,
        value: count((o) => o.status === s.value),
        itemStyle: { color: s.color }
      }))
    }
  ]
}))

// 近 6 个月接单趋势
const trendBar = computed(() => {
  const months = []
  const base = new Date()
  base.setDate(1)
  for (let i = 5; i >= 0; i--) {
    const d = new Date(base)
    d.setMonth(d.getMonth() - i)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const data = months.map((m) => count((o) => (o.createTime || '').slice(0, 7) === m))
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 20, top: 20, bottom: 30 },
    xAxis: { type: 'category', data: months.map((m) => m.slice(5) + '月') },
    yAxis: { type: 'value', minInterval: 1 },
    series: [
      {
        type: 'bar',
        data,
        barWidth: '45%',
        itemStyle: { color: '#409eff', borderRadius: [4, 4, 0, 0] },
        label: { show: true, position: 'top' }
      }
    ]
  }
})

// 渠道来源占比
const channelPie = computed(() => ({
  tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
  legend: { bottom: 0 },
  series: [
    {
      type: 'pie',
      radius: '62%',
      center: ['50%', '45%'],
      data: CHANNEL.map((c) => ({
        name: c.label,
        value: count((o) => o.channel === c.value),
        itemStyle: { color: c.color }
      })).filter((d) => d.value > 0)
    }
  ]
}))

// 成员工作量对比（堆叠柱）
const memberBar = computed(() => {
  const cats = [
    { key: 'doing', label: '进行中', color: '#409eff' },
    { key: 'review', label: '待验收', color: '#e6a23c' },
    { key: 'done', label: '已完成', color: '#67c23a' }
  ]
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { bottom: 0 },
    grid: { left: 50, right: 20, top: 20, bottom: 40 },
    xAxis: { type: 'category', data: MEMBERS.map((m) => m.name) },
    yAxis: { type: 'value', minInterval: 1 },
    series: cats.map((c) => ({
      name: c.label,
      type: 'bar',
      stack: 'total',
      barWidth: '40%',
      itemStyle: { color: c.color },
      data: MEMBERS.map((m) => count((o) => o.ownerId === m.id && o.status === c.key))
    }))
  }
})
</script>

<style scoped>
.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 14px;
  margin-bottom: 16px;
}
.stat-card {
  background: #fff;
  border-radius: 8px;
  border-top: 3px solid #409eff;
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 14px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}
.stat-icon {
  width: 46px;
  height: 46px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.stat-value {
  font-size: 24px;
  font-weight: 700;
  line-height: 1.2;
}
.stat-label {
  font-size: 13px;
  color: #909399;
  margin-top: 2px;
}
.overdue-alert {
  margin-bottom: 16px;
}
.chart-row {
  margin-bottom: 16px;
}
.chart-card {
  border-radius: 8px;
}
.chart-title {
  font-weight: 600;
  font-size: 15px;
}
</style>
