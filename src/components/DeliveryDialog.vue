<template><el-dialog :close-on-click-modal="false" :before-close="requestClose" :model-value="visible" :title="reviewing?'项目验收':'提交验收'" append-to-body @update:model-value="v=>emit('update:visible',v)"><template v-if="order"><section class="delivery-project"><ProjectCover :order="order" compact/><div><h3>{{ order.title }}</h3><p>{{ order.customer || '未填写客户' }}</p><el-tag>{{ statusMap[order.status]?.label }}</el-tag></div></section><section class="delivery-checks"><h3>交付检查</h3><p v-if="openIssues" class="issue-warning"><strong>还有 {{ openIssues }} 条问题没处理</strong><el-button link type="warning" :disabled="busy" @click="showIssues">去看看</el-button></p><p v-else><span>问题处理</span><b>0 个待处理</b></p><p><span>修改次数</span><b>{{ order.revisions || 0 }} 次</b></p><p><span>需求附件</span><b>{{ order.attachments?.length || 0 }} 份</b></p></section><section v-if="reviewing" class="surface delivery-submission"><h3>交付记录</h3><p>{{ lastDelivery?.content || '暂无交付说明，请结合项目需求与问题记录进行验收。' }}</p><AttachmentView v-if="lastDelivery?.attachments?.length" :items="lastDelivery.attachments" :size="64"/></section><section v-else class="surface" data-paste-zone="交付说明"><h3>{{ reviewing?'验收说明':'交付说明' }}</h3><el-input v-model="note" type="textarea" :rows="5" maxlength="300" show-word-limit placeholder="填写本次交付内容、需要注意的事项"/><AttachmentUploader v-model="files"/><p class="muted">说明和材料保存到内部记录，客户不可见。</p></section><el-alert :title="reviewing?'通过后项目将标记为已完成。未收款项可继续登记。':'提交后等待验收，退回时会附带修改意见。'" :closable="false" type="info"/><div v-if="reviewing" class="delivery-return"><h3>退回原因</h3><el-input v-model="returnReason" type="textarea" :rows="3" placeholder="退回时必填，说明需要修改的位置"/></div></template><template #footer><el-button v-if="reviewing" :loading="busy" @click="returnDelivery">退回返工</el-button><el-button v-else @click="requestClose">取消</el-button><el-button type="primary" :loading="busy" @click="confirm">{{ (openIssues ? '仍然' : '') + (reviewing ? '验收通过' : '提交验收') }}</el-button></template></el-dialog></template>
<script setup>
import { useRoute, useRouter } from 'vue-router'
import { confirmDiscard, useFormClose } from '@/utils/dialogGuard'
import {ref,computed,watch} from 'vue'
import { toast as ElMessage } from '@/utils/toast'
import {latestOrderVersion,returnOrder,versionSince} from '@/mock/store'
import {changeOrderStatus} from '@/utils/settle'
import {statusMap} from '@/constants/options'
import ProjectCover from '@/components/ProjectCover.vue'
import AttachmentView from '@/components/AttachmentView.vue'
import AttachmentUploader from '@/components/AttachmentUploader.vue'
const props=defineProps({visible:Boolean,order:Object,target:String})
const emit=defineEmits(['update:visible'])
const reviewing = computed(() => props.target === 'done')
const note=ref(''),files=ref([]),returnReason=ref(''),busy=ref(false)
const lastDelivery = computed(() => {
  const history = props.order?.timeline || []
  const delivery = history.findLast(entry => entry.type === 'delivery')
  if (delivery) return delivery
  // Existing deliveries stored their material as an internal note immediately before the status transition.
  const review = history.findLastIndex(entry => entry.type === 'status' && entry.content?.includes('待验收'))
  return review > 0 && history[review - 1].type === 'note' ? history[review - 1] : undefined
})
let openedVersion
let openedTarget
let openedId
const openIssues=computed(()=>props.order?.bugs?.filter(b=>!['resolved','closed'].includes(b.status)).length||0)
const router = useRouter()
const route = useRoute()
async function showIssues() {
  if (busy.value || !await confirmDiscard(note.value || returnReason.value || files.value.length)) return
  const {open, bug, todo, entry, followup, ...query} = route.query
  await router.replace({path:route.path, query:{...query, id:String(props.order.id), tab:'bugs'}})
  emit('update:visible',false)
}
function reset() {
  note.value = ''
  files.value = []
  returnReason.value = ''
  openedId = props.order?.id
  openedVersion = props.order && latestOrderVersion(props.order)
  openedTarget = props.target
}
// A card mounts its dialog already open, whereas detail keeps its dialog mounted between uses.
watch(() => [props.visible, props.order?.id], ([visible, id], old) => {
  if (visible && id != null && (!old || !old[0] || old[1] !== id)) reset()
}, { immediate:true })

async function confirm() {
  if (busy.value || !props.order || openedId !== props.order.id) return
  busy.value = true
  try {
    const delivery = {version:versionSince(props.order, openedVersion)}
    if (openedTarget === 'review') {
      delivery.note = note.value.trim()
      delivery.attachments = files.value
    }
    await changeOrderStatus(props.order, openedTarget, reviewing.value ? '已验收完成' : '已提交验收', delivery)
    emit('update:visible', false)
  } catch (error) {
    ElMessage.error(error.message || '提交失败')
  } finally { busy.value = false }
}
async function returnDelivery() {
  if (!returnReason.value.trim()) return ElMessage.warning('请填写退回原因')
  if (busy.value || openedId !== props.order?.id) return
  busy.value = true
  try {
    await returnOrder(openedId, returnReason.value.trim(), versionSince(props.order, openedVersion))
    emit('update:visible', false)
    ElMessage.success('已退回返工')
  } catch (error) { ElMessage.error(error.message || '退回失败') }
  finally { busy.value = false }
}
const requestClose = useFormClose({
  visible: () => props.visible, close: () => emit('update:visible', false), name: 'delivery',
  isDirty: () => !!(note.value || returnReason.value || files.value.length), isBusy: () => busy.value
})
</script>
<style scoped>.delivery-project{display:flex;align-items:center;gap:15px;background:white;padding:16px;border-radius:13px;margin-bottom:15px}.delivery-project h3{font-size:16px;margin:0 0 9px}.delivery-project p{font-size:12px;color:#8b98aa}.delivery-checks{padding:18px;background:white;border-radius:13px;margin-bottom:15px}.delivery-checks h3,.delivery-return h3,.surface h3{font-size:15px;margin:0 0 15px}.delivery-checks p{display:flex;justify-content:space-between;font-size:12px;color:#8998ad}.delivery-checks .issue-warning{align-items:center;gap:12px;padding:8px 12px;background:#fff4df;border-radius:6px;color:#86520a}.delivery-checks b{font-weight:500;color:#33547b}.delivery-return{margin-top:18px;padding:18px;border-radius:13px;background:#fff4f2}</style>
