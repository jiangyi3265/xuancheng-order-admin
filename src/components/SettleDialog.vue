<template>
  <el-dialog
    v-model="settlePrompt.visible"
    title="完成了，这单收到钱了吗？"
    width="420px"
    append-to-body
    :close-on-click-modal="false"
  >
    <div v-if="order" class="settle">
      <div class="s-title">{{ order.title }}<span v-if="order.customer"> · {{ order.customer }}</span></div>
      <div class="s-sum">
        <div class="cell"><span>报价</span><b>{{ money(order.amount) }}</b></div>
        <div class="cell"><span>已收</span><b class="green">{{ money(order.receivedAmount) }}</b></div>
        <div class="cell"><span>还欠</span><b class="red">{{ money(owed(order)) }}</b></div>
      </div>
      <div class="s-tip">没收的先挂着，会出现在「接单管理」的「还欠款」和数据站的“待收款”里，收到了随时记。</div>
    </div>
    <template #footer>
      <el-button @click="settlePrompt.visible = false">还没收，先挂着</el-button>
      <el-button @click="openPartial">收了一部分…</el-button>
      <el-button type="primary" :loading="saving" @click="settleAll">已收清 {{ money(order ? owed(order) : 0) }}</el-button>
    </template>
  </el-dialog>

  <PaymentDialog v-model:visible="partialVisible" :order="order" />
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import PaymentDialog from '@/components/PaymentDialog.vue'
import { addPayment } from '@/mock/store'
import { settlePrompt } from '@/utils/settle'
import { owed, money } from '@/utils/payment'
import { todayStr } from '@/utils/date'

const order = computed(() => settlePrompt.order)
const saving = ref(false)
const partialVisible = ref(false)

async function settleAll() {
  const o = order.value
  if (!o) return
  saving.value = true
  try {
    const amount = owed(o)
    await addPayment(o.id, {
      amount,
      payDate: todayStr(),
      note: Number(o.receivedAmount) > 0 ? '尾款' : '全款'
    })
    ElMessage.success(`已记收款 ${money(amount)}，这单收清了`)
    settlePrompt.visible = false
  } catch (e) {
    ElMessage.error(e.message || '记录失败')
  } finally {
    saving.value = false
  }
}

function openPartial() {
  settlePrompt.visible = false
  partialVisible.value = true
}
</script>

<style scoped>
.s-title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 12px;
}
.s-title span {
  font-weight: 400;
  font-size: 13px;
  color: #909399;
}
.s-sum {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  background: #f5f7fa;
  border-radius: 8px;
  padding: 12px 8px;
  text-align: center;
}
.s-sum span {
  display: block;
  font-size: 12px;
  color: #909399;
}
.s-sum b {
  display: block;
  margin-top: 4px;
  font-size: 18px;
  color: #303133;
}
.green {
  color: #67c23a !important;
}
.red {
  color: #f56c6c !important;
}
.s-tip {
  margin-top: 10px;
  font-size: 12px;
  color: #909399;
  line-height: 1.6;
}
</style>
