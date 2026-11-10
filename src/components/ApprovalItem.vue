<template>
  <div class="ai" :class="a.status">
    <button v-if="isMobile" class="board-approval-card" @click="detailVisible=true"><span class="approval-symbol"><el-icon><DocumentChecked/></el-icon></span><div><h3>{{ a.typeLabel }}<el-tag :type="a.status==='pending'?'warning':'info'">{{ a.statusLabel }}</el-tag></h3><p>{{ a.orderTitle }}</p><strong>{{ a.summary }}</strong><small>{{ a.requesterName }} · {{ a.createTime }}</small><p v-if="a.reason">{{ a.reason }}</p></div><el-icon><ArrowRight/></el-icon></button>
    <div v-if="!isMobile" class="ai-main">
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
    <div v-if="!isMobile && a.status === 'pending'" class="ai-actions">
      <!-- 申请内容卡片上已经写清楚了，直接「通过」；要看全部信息再点「详情」 -->
      <template v-if="isBoss">
        <el-button size="small" type="primary" :loading="busy" @click.stop="approve">通过</el-button>
        <el-button size="small" :disabled="busy" @click.stop="rejectVisible = true">驳回…</el-button>
        <el-button size="small" link type="primary" :disabled="busy" @click.stop="detailVisible = true">详情</el-button>
      </template>
      <el-button v-else-if="mine" size="small" :loading="busy" @click.stop="withdraw">撤回</el-button>
      <el-tag v-else size="small" type="warning" effect="plain">等待审批</el-tag>
    </div>
    <el-tag v-else-if="!isMobile && !compact" size="small" :type="a.status === 'approved' ? 'success' : 'info'" effect="plain">
      {{ a.statusLabel }}
    </el-tag>

    <el-dialog v-model="detailVisible" title="审批详情" class="design-approval-dialog" width="520px" append-to-body>
      <div class="approval-detail"><el-tag :type="typeTag">{{ a.typeLabel }}</el-tag><h2>{{ a.orderTitle }}</h2><div class="approval-summary">{{ a.summary }}</div><dl><dt>申请人</dt><dd>{{ a.requesterName }}</dd><dt>申请原因</dt><dd>{{ a.reason || '未填写' }}</dd><dt>提交时间</dt><dd>{{ a.createTime }}</dd></dl></div><section class="approval-flow"><h3>审批流程</h3><div><i>✓</i><b>已提交</b><span>{{ a.createTime }}</span></div><div><i>○</i><b>{{ a.statusLabel }}</b><span>{{ a.status==='pending'?'等待处理':a.handlerName || a.requesterName }}</span></div></section><div class="approval-detail"><el-alert title="审批通过后，项目数据将同步更新。" :closable="false" type="info" show-icon /></div>
      <template #footer><template v-if="isBoss && a.status==='pending'"><el-button :disabled="busy" @click="detailVisible=false; rejectVisible=true">驳回</el-button><el-button type="primary" :loading="busy" @click="approve">通过审批</el-button></template><el-button v-else-if="mine && a.status==='pending'" :loading="busy" @click="withdraw">撤回申请</el-button></template>
    </el-dialog>
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
import { isMobile } from '@/utils/useMobile'
import { ref, computed, watch } from 'vue'
import { toast as ElMessage } from '@/utils/toast'
import ReasonDialog from '@/components/ReasonDialog.vue'
import { isBoss, currentMember, approveApproval, rejectApproval, withdrawApproval } from '@/mock/store'

const props = defineProps({
  a: { type: Object, required: true },
  openDetail: { type: Boolean, default: false },
  showOrder: { type: Boolean, default: true },
  compact: { type: Boolean, default: false }
})

const busy = ref(false)
const emit = defineEmits(['dismiss-target'])
const detailVisible = ref(false)
watch(() => props.openDetail, value => { detailVisible.value = value }, { immediate: true })
watch(detailVisible, value => { if (!value && props.openDetail) emit('dismiss-target') })
const rejectVisible = ref(false)
const mine = computed(() => props.a.requesterId === currentMember.value.id)
const typeTag = computed(() => ({ amount: 'warning', cancel: 'danger', delete: 'danger', payment: 'success' }[props.a.type] || 'info'))

async function approve() {
  busy.value = true
  try {
    await approveApproval(props.a.id)
    ElMessage.success('已批准，已生效')
    detailVisible.value=false
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

/* 手机：改成上下排——标题 / 申请人和时间 / 内容 / 整行按钮，不再横向挤 */
@media (max-width: 640px) {
  .ai {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
    min-width: 0;
    padding: 12px;
  }
  .ai-main {
    flex: none;
    width: 100%;
  }
  .ai-head {
    gap: 6px 8px;
  }
  .ai-order {
    flex: 1;
    min-width: 0;
    line-height: 1.4;
    overflow-wrap: anywhere;
  }
  /* 申请人和时间单独占一行，长了也不会把标签挤出屏幕 */
  .ai-who {
    flex-basis: 100%;
    margin-left: 0;
    line-height: 1.4;
  }
  .ai-sum,
  .ai-reason,
  .ai-done {
    overflow-wrap: anywhere;
  }
  /* 处理结果的小标签靠左，不要被拉成整行 */
  .ai > :deep(.el-tag) {
    align-self: flex-start;
  }
  /* 按钮占满一行，左右并排，手指好点 */
  .ai-actions {
    flex-shrink: 1;
    width: 100%;
    gap: 10px;
  }
  .ai-actions :deep(.el-button) {
    flex: 1;
    height: auto;
    min-height: 36px;
    padding: 8px 12px;
    font-size: 14px;
  }
  .ai-actions :deep(.el-button + .el-button) {
    margin-left: 0;
  }
}
</style>
