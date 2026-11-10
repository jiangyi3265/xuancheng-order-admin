<template><el-dialog :close-on-click-modal="false" :before-close="requestClose" :model-value="visible" :title="isBoss?'项目验收':'提交验收'" append-to-body @update:model-value="v=>emit('update:visible',v)" @open="reset"><template v-if="order"><section class="delivery-project"><ProjectCover :order="order" compact/><div><h3>{{ order.title }}</h3><p>{{ order.customer || '未填写客户' }}</p><el-tag>{{ statusMap[order.status]?.label }}</el-tag></div></section><section class="delivery-checks"><h3>交付检查</h3><p><span>问题处理</span><b>{{ openIssues }} 个待处理</b></p><p><span>修改次数</span><b>{{ order.revisions || 0 }} 次</b></p><p><span>需求附件</span><b>{{ order.attachments?.length || 0 }} 份</b></p></section><section v-if="isBoss" class="surface delivery-submission"><h3>交付记录</h3><p>{{ lastDelivery?.content || '暂无交付说明，请结合项目需求与问题记录进行验收。' }}</p><AttachmentView v-if="lastDelivery?.attachments?.length" :items="lastDelivery.attachments" :size="64"/></section><section v-else class="surface" data-paste-zone="交付说明"><h3>{{ isBoss?'验收说明':'交付说明' }}</h3><el-input v-model="note" type="textarea" :rows="5" placeholder="填写本次交付内容、需要注意的事项"/><AttachmentUploader v-model="files"/><p class="muted">说明和材料保存到内部记录，客户不可见。</p></section><el-alert :title="isBoss?'通过后项目将标记为已完成。未收款项可继续登记。':'提交后等待验收，退回时会附带修改意见。'" :closable="false" type="info"/><div v-if="isBoss" class="delivery-return"><h3>退回原因</h3><el-input v-model="returnReason" type="textarea" :rows="3" placeholder="退回时必填，说明需要修改的位置"/></div></template><template #footer><el-button v-if="isBoss" :loading="busy" @click="returnDelivery">退回返工</el-button><el-button v-else @click="requestClose">取消</el-button><el-button type="primary" :loading="busy" @click="confirm">{{ isBoss?'验收通过':'提交验收' }}</el-button></template></el-dialog></template>
<script setup>
import { useFormClose } from '@/utils/dialogGuard'
import {ref,computed} from 'vue'
import { toast as ElMessage } from '@/utils/toast'
import {addProgress,returnOrder,isBoss} from '@/mock/store'
import {changeOrderStatus} from '@/utils/settle'
import {statusMap} from '@/constants/options'
import ProjectCover from '@/components/ProjectCover.vue'
import AttachmentView from '@/components/AttachmentView.vue'
import AttachmentUploader from '@/components/AttachmentUploader.vue'
const props=defineProps({visible:Boolean,order:Object,target:String})
const emit=defineEmits(['update:visible'])
const note=ref(''),files=ref([]),returnReason=ref(''),busy=ref(false)
const lastDelivery=computed(()=>props.order?.timeline?.filter(t=>t.type==='note').slice(-1)[0])
const openIssues=computed(()=>props.order?.bugs?.filter(b=>!['resolved','closed'].includes(b.status)).length||0)
function reset(){note.value='';files.value=[];returnReason.value=''}
async function confirm(){if(busy.value)return;busy.value=true;try{if(note.value.trim()||files.value.length){await addProgress(props.order.id,note.value.trim(),'note',[...files.value]);note.value='';files.value=[]}await changeOrderStatus(props.order,props.target,isBoss.value?'已验收完成':'已提交验收');emit('update:visible',false)}catch(e){ElMessage.error(e.message||'提交失败')}finally{busy.value=false}}
async function returnDelivery(){if(!returnReason.value.trim())return ElMessage.warning('请填写退回原因');if(busy.value)return;busy.value=true;try{await returnOrder(props.order.id,returnReason.value.trim());emit('update:visible',false);ElMessage.success('已退回返工')}catch(e){ElMessage.error(e.message||'退回失败')}finally{busy.value=false}}
const requestClose = useFormClose({
  visible: () => props.visible, close: () => emit('update:visible', false), name: 'delivery',
  isDirty: () => !!(note.value || returnReason.value || files.value.length), isBusy: () => busy.value
})
</script>
<style scoped>.delivery-project{display:flex;align-items:center;gap:15px;background:white;padding:16px;border-radius:13px;margin-bottom:15px}.delivery-project h3{font-size:16px;margin:0 0 9px}.delivery-project p{font-size:12px;color:#8b98aa}.delivery-checks{padding:18px;background:white;border-radius:13px;margin-bottom:15px}.delivery-checks h3,.delivery-return h3,.surface h3{font-size:15px;margin:0 0 15px}.delivery-checks p{display:flex;justify-content:space-between;font-size:12px;color:#8998ad}.delivery-checks b{font-weight:500;color:#33547b}.delivery-return{margin-top:18px;padding:18px;border-radius:13px;background:#fff4f2}</style>
