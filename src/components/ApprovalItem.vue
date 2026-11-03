<template>
  <div class="ai" :class="a.status">
    <div class="ai-main">
      <div class="ai-head">
        <el-tag size="small" :type="typeTag" effect="light">{{ a.typeLabel }}</el-tag>
        <span v-if="showOrder" class="ai-order">{{ a.orderTitle }}</span>
        <span class="ai-who">{{ a.requesterName }} · {{ a.createTime }}</span>
      </div>
      <div class="ai-sum">{{ a.summary }}</div>
      <div v-if="a.reason" class="ai-reason">原因：{{ a.reason }}</div>
      <div v-if="a.status !== 'pending'" class="ai-done">
        {{ a.statusLabel }}<template v-if="a.handlerName && a.status !== 'withdrawn'">（{{ a.handlerName }}）</template>
        <template v-if="a.handleNote">：{{ a.handleNote }}</template>
      </div>
    </div>
    <div v-if="a.status === 'pending'" class="ai-actions">
      <template v-if="isBoss">
        <el-button size="small" type="primary" :loading="busy" @click.stop="approve">批准</el-button>
        <el-button size="small" :disabled="busy" @click.stop="rejectVisible = true">驳回…</el-button>
      </template>
      <el-button v-else-if="mine" size="small" :loading="busy" @click.stop="withdraw">撤回</el-button>
      <el-tag v-else size="small" type="warning" effect="plain">等老板批准</el-tag>
    </div>
    <el-tag v-else-if="!compact" size="small" :type="a.status === 'approved' ? 'success' : 'info'" effect="plain">
      {{ a.statusLabel }}
    </el-tag>

    <ReasonDialog
      v-model:visible="rejectVisible"
      title="驳回申请"
      :tip="`${a.requesterName} 申请：${a.summary}`"
      placeholder="写一下为什么不行，对方会看到"
      confirm-text="驳回"
      danger
      :submit="doReject"
    />
  </div>
</template>

<script setup>
// 一条申请：老板看到“批准 / 驳回…”，申请人看到“撤回”。
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import ReasonDialog from '@/components/ReasonDialog.vue'
import { isBoss, currentMember, approveApproval, rejectApproval, withdrawApproval } from '@/mock/store'

const props = defineProps({
  a: { type: Object, required: true },
  showOrder: { type: Boolean, default: true },
  compact: { type: Boolean, default: false }
})

const busy = ref(false)
const rejectVisible = ref(false)
const mine = computed(() => props.a.requesterId === currentMember.value.id)
const typeTag = computed(() => ({ amount: 'warning', cancel: 'danger', delete: 'danger', payment: 'success' }[props.a.type] || 'info'))

async function approve() {
  busy.value = true
  try {
    await approveApproval(props.a.id)
    ElMessage.success('已批准，已生效')
  } catch (e) {
    ElMessage.error(e.message || '批准失败')
  } finally {
    busy.value = false
  }
}

async function doReject(note) {
  await rejectApproval(props.a.id, note)
  ElMessage.success('已驳回')
}

async function withdraw() {
  busy.value = true
  try {
    await withdrawApproval(props.a.id)
    ElMessage.success('已撤回')
  } catch (e) {
    ElMessage.error(e.message || '撤回失败')
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.ai {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #fff;
  border-radius: 8px;
  padding: 12px 14px;
  border-left: 3px solid #e6a23c;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}
.ai.approved {
  border-left-color: #67c23a;
}
.ai.rejected,
.ai.withdrawn {
  border-left-color: #c0c4cc;
}
.ai-main {
  flex: 1;
  min-width: 0;
}
.ai-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 13px;
}
.ai-order {
  font-weight: 600;
  color: #303133;
}
.ai-who {
  margin-left: auto;
  color: #909399;
  font-size: 12px;
}
.ai-sum {
  margin-top: 6px;
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}
.ai-reason,
.ai-done {
  margin-top: 4px;
  font-size: 13px;
  color: #909399;
}
.ai-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
</style>
