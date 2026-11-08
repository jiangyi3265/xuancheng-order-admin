<template>
  <span v-if="canEdit || order.urgentUntil" class="urgency-actions">
    <el-button v-if="canEdit" size="small" :icon="AlarmClock" type="danger" plain class="urgency-trigger"
      @click.stop="open">{{ order.urgentUntil ? '加急至 ' + order.urgentUntil : '加急' }}</el-button>
    <el-tag v-else size="small" type="danger">加急至 {{ order.urgentUntil }}</el-tag>
    <el-button v-if="canRemind" size="small" link type="primary" :loading="reminding" @click.stop="remind">提醒{{ ownerName }}</el-button>
  </span>
  <el-dialog v-if="visible" v-model="visible" title="加急截止时间" width="360px" align-center append-to-body
    class="project-urgency-dialog" :close-on-click-modal="!saving" :close-on-press-escape="!saving" :show-close="!saving">
    <el-date-picker-panel v-model="day" type="date" value-format="YYYY-MM-DD" />
    <label class="urgency-clock">截止时间（北京时间）<input v-model="clock" type="time" required></label>
    <p v-if="error" role="alert" class="urgency-error">{{ error }}</p>
    <template #footer>
      <el-button v-if="previousUntil" :disabled="saving" link type="danger" @click="save(null)">取消加急</el-button>
      <el-button :disabled="saving" @click="visible = false">返回</el-button>
      <el-button type="primary" :loading="saving" :disabled="!deadline || deadline === previousUntil" @click="save(deadline)">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed } from 'vue'
import { AlarmClock } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { memberMap } from '@/constants/options'
import { currentMember, getOrder, isBoss, nudge, setProjectUrgency } from '@/mock/store'

const props = defineProps({ order: { type: Object, required: true }, selecting: Boolean })
const canEdit = computed(() => !props.selecting && (isBoss.value || (props.order.ownerId === currentMember.value.id && props.order.assignState !== 'pending')))
const canRemind = computed(() => canEdit.value && props.order.urgentUntil && !props.order.handled &&
  props.order.ownerId && props.order.ownerId !== currentMember.value.id && !['done', 'cancelled'].includes(props.order.status))
const ownerName = computed(() => memberMap[props.order.ownerId]?.name || '负责人')
const visible = ref(false)
const saving = ref(false)
const reminding = ref(false)
const previousUntil = ref(null)
const day = ref(null)
const clock = ref('')
const deadline = computed(() => day.value && clock.value ? day.value + ' ' + clock.value : null)
const error = ref('')

function resetDraft(value) {
  previousUntil.value = value || null
  day.value = value?.slice(0, 10) || null
  clock.value = value?.slice(11, 16) || '23:59'
}

function open() {
  resetDraft(props.order.urgentUntil)
  error.value = ''
  visible.value = true
}

async function save(until) {
  if (saving.value || !canEdit.value) return
  const id = props.order.id
  saving.value = true
  error.value = ''
  try {
    await setProjectUrgency(id, until, previousUntil.value)
    visible.value = false
    ElMessage.success(until ? '已设置加急截止时间' : '已取消加急')
  } catch (e) {
    error.value = e.message || '保存失败，请重试'
    try {
      const current = await getOrder(id)
      if ((current.urgentUntil || null) !== previousUntil.value) {
        resetDraft(current.urgentUntil)
        error.value = '加急截止时间已更新，请核对后重新选择'
      }
    } catch { /* Keep the draft available for retry when offline. */ }
  } finally {
    saving.value = false
  }
}

async function remind() {
  if (reminding.value || !canRemind.value) return
  reminding.value = true
  const recipient = ownerName.value
  try {
    await nudge(props.order.id, props.order)
    ElMessage.success('已提醒' + recipient)
  } catch (e) {
    ElMessage.error(e.message || '提醒失败，请重试')
    await getOrder(props.order.id).catch(() => {})
  } finally {
    reminding.value = false
  }
}
</script>

<style>
.urgency-actions { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; }
.urgency-actions .el-button + .el-button { margin: 0; }
.urgency-clock { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin: 12px 0; }
.urgency-clock input { font: inherit; color: inherit; border: 1px solid var(--el-border-color); border-radius: 6px; padding: 6px; }
.project-urgency-dialog.el-dialog {
  width: min(360px, calc(100vw - 24px)) !important;
  min-height: 0;
  max-height: calc(100dvh - 24px);
  margin: auto !important;
  padding: 16px;
  overflow-y: auto;
  border-radius: 14px;
}
.project-urgency-dialog .el-picker-panel { width: 100%; box-sizing: border-box; }
.project-urgency-dialog .el-picker-panel__content { width: auto; margin: 8px; }
.project-urgency-dialog .el-dialog__footer { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
.project-urgency-dialog .el-dialog__footer .el-button { margin: 0; }
.project-urgency-dialog .el-dialog__footer .is-link { margin-right: auto; }
.project-urgency-dialog .urgency-error { color: var(--el-color-danger); margin: 8px 0 0; }
</style>
