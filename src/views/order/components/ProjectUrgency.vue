<template>
  <span v-if="order.urgentHandoff?.submittedAt" class="urgency-actions" @click.stop>
    <el-tag size="small" type="warning">加急已提交 · 等{{ order.urgentHandoff.requesterId === currentMember.id ? '我' : order.urgentHandoff.requesterName }}确认</el-tag>
    <UrgentReviewActions v-if="!selecting && order.urgentHandoff.requesterId === currentMember.id" :order="order" />
  </span>
  <span v-else-if="canEdit || order.urgentUntil" class="urgency-actions" :class="{ 'urgency-card-row': compact }">
    <el-button v-if="canEdit" size="small" :icon="AlarmClock" type="danger" plain class="urgency-trigger"
      :aria-label="fullLabel" :title="order.urgentUntil ? fullLabel + '（北京时间）' : undefined"
      @click.stop="open">{{ label }}</el-button>
    <el-tag v-else size="small" type="danger" :title="fullLabel + '（北京时间）'">{{ label }}</el-tag>
    <el-button v-if="!selecting && order.urgentHandoff && !closed && order.urgentUntil && !order.handled && order.ownerId === currentMember.id && order.urgentHandoff.requesterId !== currentMember.id && order.assignState !== 'pending'"
      size="small" link type="primary" :loading="submitting" @click.stop="submit">提交确认</el-button>
    <el-button v-if="canRemind" size="small" link type="primary" :loading="reminding" :aria-label="'提醒' + ownerName" :title="'提醒' + ownerName" @click.stop="remind">{{ compact ? '提醒' : '提醒' + ownerName }}</el-button>
  </span>
  <el-dialog v-if="visible" v-model="visible" title="加急截止时间" width="360px" align-center append-to-body
    class="project-urgency-dialog" :close-on-click-modal="false" :before-close="closeDraft" :close-on-press-escape="!saving" :show-close="!saving">
    <el-date-picker-panel v-model="day" type="date" value-format="YYYY-MM-DD" />
    <label class="urgency-clock">截止时间（北京时间）<input v-model="clock" type="time" required></label>
    <el-checkbox v-if="canReopen" v-model="reopen" :disabled="saving">将项目改为未处理，重新放入{{ ownerName }}的待办</el-checkbox>
    <p v-if="error" role="alert" class="urgency-error">{{ error }}</p>
    <template #footer>
      <el-button v-if="previousUntil" :disabled="saving" link type="danger" @click="save(null)">取消加急</el-button>
      <el-button :disabled="saving" @click="closeDraft">返回</el-button>
      <el-button type="primary" :loading="saving" :disabled="!deadline || (deadline === previousUntil && !(canReopen && reopen))" @click="save(deadline)">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import UrgentReviewActions from '@/components/UrgentReviewActions.vue'
import { finishPendingWithUndo } from '@/utils/orderUndo'
import { useFormClose } from '@/utils/dialogGuard'
import { ref, computed } from 'vue'
import { AlarmClock } from '@element-plus/icons-vue'
import { toast as ElMessage } from '@/utils/toast'
import { memberMap } from '@/constants/options'
import { currentMember, getOrder, isBoss, remindPendingItem, setProjectUrgency } from '@/mock/store'

const props = defineProps({ order: { type: Object, required: true }, selecting: Boolean, compact: Boolean })
const fullLabel = computed(() => props.order.urgentUntil ? '加急至 ' + props.order.urgentUntil : '加急')
const label = computed(() => {
  const due = props.order.urgentUntil
  if (!props.compact || !due) return fullLabel.value
  const year = new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Shanghai' }).format(new Date())
  return '加急 ' + (due.startsWith(year + '-') ? due.slice(5) : due)
})
// 已完成 / 已取消的项目不用再加急，不占标题栏的位置（之前设过加急的还能点开取消）
const closed = computed(() => ['done', 'cancelled'].includes(props.order.status))
const canEdit = computed(() => !props.selecting && (!closed.value || !!props.order.urgentUntil) &&
  (isBoss.value || (props.order.ownerId === currentMember.value.id && props.order.assignState !== 'pending')))
const canRemind = computed(() => canEdit.value && props.order.urgentUntil && !props.order.handled &&
  props.order.ownerId && props.order.ownerId !== currentMember.value.id && !['done', 'cancelled'].includes(props.order.status))
const ownerName = computed(() => memberMap[props.order.ownerId]?.name || '负责人')
const visible = ref(false)
const saving = ref(false)
const reminding = ref(false)
const submitting = ref(false)
async function submit() {
  if (submitting.value) return
  submitting.value = true
  try { await finishPendingWithUndo(props.order, 'urgent', null, '已提交加急结果') }
  catch (err) {
    ElMessage.error(err.message || '提交失败')
    await getOrder(props.order.id).catch(() => {})
  } finally { submitting.value = false }
}
const reopen = ref(false)
const openedVersion = ref(null)
const canReopen = computed(() => props.order.handled && props.order.ownerId && !['done','cancelled'].includes(props.order.status))
const previousUntil = ref(null)
const day = ref(null)
const clock = ref('')
const deadline = computed(() => day.value && clock.value ? day.value + ' ' + clock.value : null)
const error = ref('')

const closeDraft = useFormClose({
  visible: () => visible.value, close: () => { visible.value = false },
  isDirty: () => !!reopen.value || day.value !== (previousUntil.value?.slice(0, 10) || null) ||
    clock.value !== (previousUntil.value?.slice(11, 16) || '23:59'),
  isBusy: () => saving.value
})

function resetDraft(value) {
  previousUntil.value = value || null
  day.value = value?.slice(0, 10) || null
  clock.value = value?.slice(11, 16) || '23:59'
}

function open() {
  reopen.value = !!canReopen.value
  openedVersion.value = props.order.version
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
    const reactivating = until && canReopen.value && reopen.value
    await setProjectUrgency(id, until, previousUntil.value, reactivating ? openedVersion.value : undefined)
    visible.value = false
    ElMessage.success(reactivating ? '已重新加入负责人的待办' : until ? '已设置加急截止时间' : '已取消加急')
  } catch (e) {
    error.value = e.message || '保存失败，请重试'
    try {
      const current = await getOrder(id)
      openedVersion.value = current.version
      reopen.value = false
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
    await remindPendingItem(props.order, 'urgent')
    await getOrder(props.order.id).catch(() => {})
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
.urgency-card-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px 6px;
  padding-top: 8px;
  border-top: 1px solid #e6ebf3;
  min-width: 0;
}
.urgency-card-row .urgency-trigger {
  max-width: 100%;
  min-height: 26px;
  height: auto;
  padding: 3px 7px;
  border-radius: 6px;
  white-space: normal;
  line-height: 1.3;
}
.urgency-card-row .el-button.is-link { margin-left: auto; }
@media (max-width: 768px) {
  .urgency-card-row { margin-top: 8px; }
  .urgency-card-row .el-button { min-height: 32px; }
  .urgency-card-row:has(.is-link) {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .urgency-card-row:has(.is-link) .urgency-trigger {
    justify-self: start;
    padding-inline: 5px;
    font-size: 12px;
  }
  .urgency-card-row:has(.is-link) .urgency-trigger .el-icon { display: none; }
  .urgency-card-row:has(.is-link) .urgency-trigger .el-icon + span { margin-left: 0; }
}
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
