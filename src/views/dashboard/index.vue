<template>
  <div class="dashboard">
    <!-- 干活的指标 -->
    <div class="stat-grid">
      <div class="stat-card" v-for="s in workCards" :key="s.label" :style="{ borderTopColor: s.color }">
        <div class="stat-icon" :style="{ background: s.bg, color: s.color }">
          <el-icon :size="22"><component :is="s.icon" /></el-icon>
        </div>
        <div class="stat-body">
          <div class="stat-value" :style="{ color: s.color }">{{ s.value }}</div>
          <div class="stat-label">{{ s.label }}</div>
        </div>
      </div>
    </div>

    <!-- 收钱的指标 -->
    <div class="stat-grid">
      <div class="stat-card" v-for="s in moneyCards" :key="s.label" :style="{ borderTopColor: s.color }">
        <div class="stat-icon" :style="{ background: s.bg, color: s.color }">
          <el-icon :size="22"><component :is="s.icon" /></el-icon>
        </div>
        <div class="stat-body">
          <div class="stat-value" :style="{ color: s.color }">{{ s.value }}</div>
          <div class="stat-label">{{ s.label }}</div>
          <div v-if="s.hint" class="stat-hint">{{ s.hint }}</div>
        </div>
      </div>
    </div>

    <!-- 已经做完、但钱还没收齐的单子：最该去催的 -->
    <el-alert
      v-if="unpaidDone.length"
      class="overdue-alert"
      type="warning"
      :closable="false"
      show-icon
    >
      <template #title>
        <span>有 {{ unpaidDone.length }} 个已完成的项目还没收齐款（共欠 {{ money(unpaidDoneTotal) }}）：</span>
        <el-tag
          v-for="o in unpaidDone.slice(0, 8)"
          :key="o.id"
          type="warning"
          size="small"
          effect="plain"
          style="margin-left: 6px"
        >
          {{ o.title }}{{ o.customer ? '·' + o.customer : '' }} 欠 {{ money(owed(o)) }}
        </el-tag>
        <span v-if="unpaidDone.length > 8" class="more">…等共 {{ unpaidDone.length }} 个，在「接单管理」选「还欠款」查看</span>
      </template>
    </el-alert>

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
          <template #header><span class="chart-title">近 6 个月实收（按收款日期）</span></template>
          <ChartCard :option="incomeBar" :height="300" />
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
          <template #header><span class="chart-title">订单状态分布</span></template>
          <ChartCard :option="statusPie" :height="300" />
        </el-card>
      </el-col>
      <el-col :xs="24" :md="12">
        <el-card shadow="never" class="chart-card">
          <template #header><span class="chart-title">渠道来源占比</span></template>
          <ChartCard :option="channelPie" :height="300" />
        </el-card>
      </el-col>
    </el-row>

    <!-- 只有一个人的时候，成员对比没有意义，团队有多人时才显示 -->
    <el-row v-if="MEMBERS.length > 1" :gutter="16" class="chart-row">
      <el-col :xs="24">
        <el-card shadow="never" class="chart-card">
          <template #header><span class="chart-title">成员工作量对比</span></template>
          <ChartCard :option="memberBar" :height="300" />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted } from 'vue'
import ChartCard from '@/components/ChartCard.vue'
import { orders, getIncome } from '@/mock/store'
import { todayStr as todayLocal } from '@/utils/date'
import { owed, money } from '@/utils/payment'
import { STATUS, CHANNEL, MEMBERS } from '@/constants/options'

const todayStr = todayLocal()
const isOverdue = (o) =>
  ['pending', 'doing', 'review'].includes(o.status) && o.deadline && o.deadline < todayStr

const count = (fn) => orders.filter(fn).length
const sumBy = (list, fn) => list.reduce((s, o) => s + fn(o), 0)
const num = (v) => Number(v) || 0

const overdueList = computed(() => orders.filter(isOverdue))

// ---- 实收（来自收款流水，服务端统计）----
const income = ref(null)
async function loadIncome() {
  try {
    income.value = await getIncome()
  } catch (e) {
    income.value = null
  }
}
onMounted(loadIncome)
// 在别处记了收款（或别的设备记的、轮询同步过来）后，已收合计会变，重新取一次
const receivedSum = computed(() => sumBy(orders, (o) => num(o.receivedAmount)))
watch(receivedSum, loadIncome)

// 已取消的项目不算“应收”
const live = computed(() => orders.filter((o) => o.status !== 'cancelled'))
const owedTotal = computed(() => sumBy(live.value, owed))
const owedCount = computed(() => live.value.filter((o) => owed(o) > 0).length)
const unpaidDone = computed(() => orders.filter((o) => o.status === 'done' && owed(o) > 0))
const unpaidDoneTotal = computed(() => sumBy(unpaidDone.value, owed))
const pipeline = computed(() =>
  sumBy(orders.filter((o) => ['pending', 'doing', 'review'].includes(o.status)), (o) => num(o.amount))
)

const workCards = computed(() => {
  const cards = [
    { label: '进行中', value: count((o) => o.status === 'doing'), color: '#409eff', bg: '#ecf5ff', icon: 'Loading' },
    { label: '待确认', value: count((o) => o.status === 'pending'), color: '#909399', bg: '#f4f4f5', icon: 'Bell' }
  ]
  // 一个人用时没有“验收”这一步；有下属、或确实有待验收的单子时才显示
  if (MEMBERS.length > 1 || count((o) => o.status === 'review') > 0) {
    cards.push({ label: '待验收', value: count((o) => o.status === 'review'), color: '#e6a23c', bg: '#fdf6ec', icon: 'View' })
  }
  cards.push({ label: '逾期预警', value: overdueList.value.length, color: '#f56c6c', bg: '#fef0f0', icon: 'Warning' })
  return cards
})

const moneyCards = computed(() => [
  {
    label: '本月实收(元)',
    value: income.value ? num(income.value.thisMonth).toLocaleString() : '—',
    color: '#67c23a', bg: '#f0f9eb', icon: 'Wallet'
  },
  {
    label: '累计实收(元)',
    value: income.value ? num(income.value.total).toLocaleString() : '—',
    color: '#409eff', bg: '#ecf5ff', icon: 'Coin'
  },
  {
    label: '待收款(元)',
    value: owedTotal.value.toLocaleString(),
    hint: owedCount.value ? `共 ${owedCount.value} 单还有欠款` : '',
    color: '#f56c6c', bg: '#fef0f0', icon: 'Money'
  },
  {
    label: '在手未完成金额(元)',
    value: pipeline.value.toLocaleString(),
    color: '#e6a23c', bg: '#fdf6ec', icon: 'Timer'
  }
])

// 近 6 个月实收
const incomeBar = computed(() => {
  const months = income.value?.months || []
  return {
    tooltip: { trigger: 'axis', formatter: (p) => `${p[0].name}<br/>实收：¥${num(p[0].value).toLocaleString()}` },
    grid: { left: 56, right: 20, top: 24, bottom: 30 },
    xAxis: { type: 'category', data: months.map((m) => Number(m.month.slice(5)) + '月') },
    yAxis: { type: 'value' },
    series: [
      {
        type: 'bar',
        data: months.map((m) => num(m.amount)),
        barWidth: '45%',
        itemStyle: { color: '#67c23a', borderRadius: [4, 4, 0, 0] },
        label: { show: true, position: 'top', formatter: (p) => (p.value ? p.value.toLocaleString() : '') }
      }
    ]
  }
})

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
  margin-bottom: 14px;
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
.stat-hint {
  font-size: 12px;
  color: #c0c4cc;
  margin-top: 2px;
}
.overdue-alert {
  margin-bottom: 14px;
}
.more {
  margin-left: 8px;
  color: #909399;
  font-size: 12px;
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
