<template>
  <el-dialog
    :model-value="visible"
    :title="isBoss ? '记收款' : '申请收款'"
    width="480px"
    append-to-body
    @update:model-value="(v) => emit('update:visible', v)"
    @open="onOpen"
  >
    <div v-if="cur" v-loading="loading">
      <div class="pay-title">{{ cur.title }}<span v-if="cur.customer" class="pay-customer"> · {{ cur.customer }}</span></div>

      <div class="pay-sum">
        <div class="cell"><span>报价</span><b>{{ money(cur.amount) }}</b></div>
        <div class="cell"><span>已收</span><b class="green">{{ money(cur.receivedAmount) }}</b></div>
        <div class="cell"><span>还欠</span><b :class="{ red: owedNow > 0 }">{{ money(owedNow) }}</b></div>
      </div>
      <div v-if="!isBoss" class="pay-tip">你提交后要老板确认，确认了才会计入“已收”。</div>
      <div v-if="!Number(cur.amount)" class="pay-tip">这单还没填报价。收款照样可以记，填上报价后会自动算出还欠多少。</div>

      <el-form label-width="52px" class="pay-form" @submit.prevent>
        <el-form-item label="收到">
          <el-input-number v-model="form.amount" :min="0" :precision="2" :step="100" controls-position="right" style="width: 170px" />
          <el-button v-if="owedNow > 0" link type="primary" class="fill-btn" @click="form.amount = owedNow">
            收清 {{ money(owedNow) }}
          </el-button>
        </el-form-item>
        <el-form-item label="日期">
          <el-date-picker
            v-model="form.payDate"
            type="date"
            value-format="YYYY-MM-DD"
            :clearable="false"
            :disabled-date="afterToday"
            style="width: 170px"
          />
        </el-form-item>
        <el-form-item label="备注">
          <div class="note-box">
            <el-input v-model="form.note" maxlength="200" placeholder="选填，如 定金 / 尾款 / 微信转账" />
            <div class="note-chips">
              <span v-for="t in NOTE_TAGS" :key="t" class="chip" @click="form.note = t">{{ t }}</span>
            </div>
          </div>
        </el-form-item>
      </el-form>

      <div v-if="waiting.length" class="history">
        <div class="history-title">等老板确认的收款（{{ waiting.length }} 笔）</div>
        <div v-for="w in waiting" :key="w.id" class="history-row">
          <span class="h-date">{{ w.payload.payDate }}</span>
          <b class="h-amount wait">{{ money(w.payload.amount) }}</b>
          <span class="h-note">{{ w.payload.note || '—' }}</span>
          <el-tag size="small" type="warning" effect="plain">待确认</el-tag>
        </div>
      </div>

      <div v-if="payments.length" class="history">
        <div class="history-title">已记录的收款（{{ payments.length }} 笔）</div>
        <div v-for="p in payments" :key="p.id" class="history-row">
          <span class="h-date">{{ p.payDate }}</span>
          <b class="h-amount">{{ money(p.amount) }}</b>
          <span class="h-note">{{ p.note || '—' }}</span>
          <el-button v-if="isBoss" link type="danger" size="small" :loading="deletingId === p.id" @click="removeOne(p)">删除</el-button>
        </div>
      </div>
    </div>

    <template #footer>
      <el-button @click="emit('update:visible', false)">关闭</el-button>
      <el-button type="primary" :loading="saving" @click="submit">{{ isBoss ? '记这一笔' : '提交收款申请' }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getOrder, addPayment, removePayment, requestApproval, approvals, isBoss } from '@/mock/store'
import { owed, money } from '@/utils/payment'
import { todayStr } from '@/utils/date'

const props = defineProps({
  visible: { type: Boolean, default: false },
  order: { type: Object, default: null }
})
const emit = defineEmits(['update:visible'])

const NOTE_TAGS = ['定金', '尾款', '全款']
const cur = ref(null)
const loading = ref(false)
const saving = ref(false)
const deletingId = ref(null)
const form = reactive({ amount: 0, payDate: todayStr(), note: '' })

const owedNow = computed(() => owed(cur.value))
const payments = computed(() => cur.value?.payments || [])
// 员工提交、老板还没确认的收款
const waiting = computed(() =>
  approvals.filter((a) => a.orderId === cur.value?.id && a.type === 'payment' && a.status === 'pending')
)
const afterToday = (d) => d.getTime() > Date.now() + 24 * 3600 * 1000

async function onOpen() {
  cur.value = props.order
  form.payDate = todayStr()
  form.note = ''
  form.amount = owed(props.order)
  if (!props.order?.id) return
  loading.value = true
  try {
    // 列表里的项目不带收款明细，打开时取一次完整详情
    cur.value = await getOrder(props.order.id)
    form.amount = owed(cur.value)
  } catch (e) {
    ElMessage.error('加载收款记录失败：' + e.message)
  } finally {
    loading.value = false
  }
}

async function submit() {
  const amount = Number(form.amount) || 0
  if (amount <= 0) {
    ElMessage.warning('先填一下这次收到多少钱')
    return
  }
  const quoted = Number(cur.value?.amount) || 0
  const after = (Number(cur.value?.receivedAmount) || 0) + amount
  if (quoted > 0 && after > quoted) {
    try {
      await ElMessageBox.confirm(
        `这笔收款会让已收 ${money(after)}，比报价 ${money(quoted)} 多了 ${money(after - quoted)}。确定要记吗？`,
        '超过报价了',
        { type: 'warning', confirmButtonText: '确定记下', cancelButtonText: '我再看看' }
      )
    } catch (e) {
      return
    }
  }
  saving.value = true
  try {
    if (!isBoss.value) {
      // 员工：提交申请，老板确认后才入账
      await requestApproval({
        orderId: cur.value.id,
        type: 'payment',
        reason: form.note.trim() || '已收到款项，请老板确认',
        payload: { amount, payDate: form.payDate, note: form.note.trim() }
      })
      ElMessage.success(`已提交 ${money(amount)} 的收款申请，等老板确认`)
      emit('update:visible', false)
      return
    }
    cur.value = await addPayment(cur.value.id, {
      amount,
      payDate: form.payDate,
      note: form.note.trim()
    })
    ElMessage.success(`已记收款 ${money(amount)}`)
    emit('update:visible', false)
  } catch (e) {
    ElMessage.error(e.message || '记录失败')
  } finally {
    saving.value = false
  }
}

async function removeOne(p) {
  try {
    await ElMessageBox.confirm(`确定删除这笔收款吗？${p.payDate}  ${money(p.amount)}${p.note ? '（' + p.note + '）' : ''}`, '删除收款', {
      type: 'warning'
    })
  } catch (e) {
    return
  }
  deletingId.value = p.id
  try {
    cur.value = await removePayment(p.id)
    form.amount = owed(cur.value)
    ElMessage.success('已删除')
  } catch (e) {
    ElMessage.error(e.message || '删除失败')
  } finally {
    deletingId.value = null
  }
}
</script>

<style scoped>
.pay-title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 12px;
}
.pay-customer {
  font-weight: 400;
  color: #909399;
  font-size: 13px;
}
.pay-sum {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  background: #f5f7fa;
  border-radius: 8px;
  padding: 12px 8px;
  text-align: center;
}
.pay-sum .cell span {
  display: block;
  font-size: 12px;
  color: #909399;
}
.pay-sum .cell b {
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
.pay-tip {
  margin-top: 8px;
  font-size: 12px;
  color: #e6a23c;
}
.pay-form {
  margin-top: 16px;
}
.fill-btn {
  margin-left: 10px;
}
.note-box {
  width: 100%;
}
.note-chips {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.chip {
  padding: 2px 12px;
  border: 1px solid #dcdfe6;
  border-radius: 14px;
  font-size: 12px;
  color: #606266;
  cursor: pointer;
}
.chip:hover {
  color: #409eff;
  border-color: #409eff;
}
.history {
  margin-top: 8px;
  border-top: 1px solid #ebeef5;
  padding-top: 10px;
}
.history-title {
  font-size: 13px;
  color: #909399;
  margin-bottom: 6px;
}
.history-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  font-size: 13px;
  border-bottom: 1px dashed #f0f2f5;
}
.h-date {
  color: #909399;
  width: 84px;
  flex-shrink: 0;
}
.h-amount {
  color: #67c23a;
  width: 90px;
  flex-shrink: 0;
}
.h-amount.wait {
  color: #e6a23c;
}
.h-note {
  flex: 1;
  min-width: 0;
  color: #606266;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
