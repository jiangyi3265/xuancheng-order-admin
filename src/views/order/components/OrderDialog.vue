<template>
  <el-dialog
    :model-value="visible"
    :close-on-click-modal="false" :before-close="requestClose"
    :title="form.id ? '编辑项目' : '新建项目'"
    width="560px"
    class="design-order-dialog"
    @update:model-value="(v) => emit('update:visible', v)"
    @opened="onOpened"
  >
    <template #header="{ titleId }"><div class="design-form-heading"><h2 :id="titleId" :aria-label="form.id ? '编辑项目' : '新建项目'">{{ form.id ? '编辑项目' : '完整建单' }}</h2><p>完善项目信息，规范管理与交付</p></div></template>
    <p v-if="restored" class="draft-banner" role="status">已恢复上次没建完的内容 <el-button link type="primary" @click="clearDraft">清空</el-button></p>
    <el-form ref="formRef" :model="form" :rules="rules" label-width="84px" class="design-order-form" data-paste-zone="新建项目">
      <el-form-item class="field-title" label="项目名" prop="title"><el-input ref="titleInput" v-model="form.title" placeholder="一句话写清做什么，比如：餐饮点餐小程序" /></el-form-item>
      <el-form-item class="field-customer" label="客户 / 联系方式"><div class="customer-inline"><el-input v-model="form.customer" placeholder="客户称呼"/><el-input v-model="form.contact" placeholder="微信/旺旺号，选填"/></div></el-form-item>
      <el-form-item class="field-account" label="客户账号"><div class="cust-account"><el-select v-model="form.customerAccount" @change="form.testerIds = []" filterable clearable placeholder="选择绑定客户"><el-option v-for="c in customers" :key="c.userId" :label="`${c.userName}（${c.nickName}）`" :value="c.userName"/></el-select><el-button v-if="!form.customerAccount" link type="primary" class="account-batch" @click="batchVisible=true">批量创建</el-button><el-button :icon="Plus" aria-label="新建账号" title="新建账号" @click="openQuickCreate(false)"/></div></el-form-item>
      <el-form-item class="field-owner" label="负责人"><el-select v-model="form.ownerId" :disabled="!isBoss"><el-option v-for="m in MEMBERS" :key="m.id" :label="m.name" :value="m.id" :disabled="m.status !== '0'"/></el-select></el-form-item>
      <el-form-item v-if="form.customerAccount" class="field-testers" label="测试账号">
        <div class="cust-account">
          <el-select v-model="form.testerIds" multiple filterable clearable aria-label="项目测试账号" placeholder="选择一起测试的客户账号（可多选）">
            <el-option v-for="c in customers.filter(c => c.userName !== form.customerAccount)" :key="c.userId"
              :label="`${c.nickName || c.userName}（${c.userName}）`" :value="Number(c.userId)" :disabled="c.status === '1'" />
          </el-select>
          <el-button link type="primary" class="account-batch" @click="batchVisible=true">批量创建</el-button>
          <el-button :icon="Plus" aria-label="新建测试账号" title="新建测试账号" @click="openQuickCreate(true)" />
        </div>
        <small class="tester-help">绑定后可查看本项目、提交问题和确认整体验收。</small>
      </el-form-item>
      <el-form-item class="field-amount" label="报价(元)"><el-input-number v-model="form.amount" :min="0" :step="100" :controls="false" :disabled="!!form.id && !isBoss"/><div v-if="!!form.id && !isBoss" class="amount-hint">改报价请在项目详情申请</div></el-form-item>
      <el-form-item class="field-channel" label="来源渠道" prop="channel"><el-select v-model="form.channel"><el-option v-for="c in CHANNEL" :key="c.value" :label="c.label" :value="c.value"/></el-select></el-form-item>
      <el-form-item class="field-priority" label="优先级"><el-select v-model="form.priority"><el-option v-for="p in PRIORITY" :key="p.value" :label="p.label" :value="p.value"/></el-select></el-form-item>
      <el-form-item class="field-status" label="状态"><el-select v-model="form.status"><el-option v-for="s in statusOpts" :key="s.value" :label="s.label" :value="s.value"/></el-select></el-form-item>
      <el-form-item class="field-deadline" label="截止日期"><div class="deadline-box"><el-date-picker v-model="form.deadline" type="date" value-format="YYYY-MM-DD" placeholder="请选择截止日期"/><DeadlineChips v-model="form.deadline" :clearable="false"/></div></el-form-item>
      <el-form-item class="field-requirement" label="需求描述"><el-input v-model="form.requirement" data-paste-text type="textarea" :rows="3" placeholder="把客户需求贴进来，避免来回翻聊天记录"/></el-form-item>
      <el-form-item class="field-attachments" label="附件（可选）"><AttachmentUploader v-model="form.attachments"/></el-form-item>
    </el-form>

    <template #footer>
      <el-button class="secondary-form-cancel" @click="requestClose">取消</el-button>
      <el-button type="primary" aria-label="保存" :loading="saving" @click="submit">保存项目</el-button>
    </template>

    <CustomerBatchDialog v-model:visible="batchVisible" :scope="'project-'+(form.id || 'new')"
      :project-hint="form.customerAccount ? '创建的账号会选入本项目，保存项目后即可登录测试。' : '第一个账号作为主客户，其余作为测试账号，保存项目后生效。'"
      @created="selectBatch" />
    <!-- 快捷新建客户账号 -->
    <el-dialog v-model="quickVisible" :close-on-click-modal="false" :before-close="closeQuick" title="新建客户账号" width="420px" append-to-body @opened="focusField(quickAccountInput)">
      <el-form ref="qFormRef" :model="quickForm" :rules="quickRules" label-width="64px" @submit.prevent>
        <el-form-item label="账号" prop="userName">
          <el-input ref="quickAccountInput" v-model="quickForm.userName" placeholder="留空自动生成 · 客户登录用，字母/数字" @keydown.enter="enterQuickCreate" />
        </el-form-item>
        <el-form-item label="昵称" prop="nickName">
          <el-input v-model="quickForm.nickName" placeholder="选填，如公司/称呼" @keydown.enter="enterQuickCreate" />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input v-model="quickForm.password" placeholder="5-20 位" @keydown.enter="enterQuickCreate" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="closeQuick">取消</el-button>
        <el-button type="primary" :loading="quickSaving" @click="submitQuickCreate">创建并绑定</el-button>
      </template>
    </el-dialog>
  </el-dialog>
</template>

<script setup>
import { projectDraft } from '@/utils/projectDraft'
import { useFormClose } from '@/utils/dialogGuard'
import { ref, reactive, computed, watch } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import { toast as ElMessage } from '@/utils/toast'
import AttachmentUploader from '@/components/AttachmentUploader.vue'
import DeadlineChips from '@/components/DeadlineChips.vue'
import { CHANNEL, PRIORITY, STATUS, MEMBERS } from '@/constants/options'
import { listCustomers, createCustomer, currentMember, isBoss } from '@/mock/store'
import { offerLoginInfo } from '@/utils/loginInfo'
import CustomerBatchDialog from '@/views/customers/CustomerBatchDialog.vue'
import { onEnter, focusField } from '@/utils/formKeys'

const props = defineProps({
  visible: { type: Boolean, default: false },
  data: { type: Object, default: null },
  save: { type: Function, required: true }
})
const emit = defineEmits(['update:visible'])

const formRef = ref()
const titleInput = ref(null)
const quickAccountInput = ref(null)
// 员工不能自己把项目标成“已完成 / 已取消”（走提交验收 / 申请）
const statusOpts = computed(() =>
  STATUS.filter((s) => isBoss.value || ['pending', 'doing', 'review'].includes(s.value) || s.value === form.status)
)
const customers = ref([])
const batchVisible = ref(false)
async function selectBatch(accounts) {
  const [first, ...rest] = accounts
  const testers = form.customerAccount ? accounts : rest
  if (!form.customerAccount) form.customerAccount = first.userName
  form.testerIds = [...new Set([...form.testerIds, ...testers.map(a => Number(a.userId))])]
  customers.value = [...customers.value.filter(c => !accounts.some(a => a.userId === c.userId)), ...accounts]
  await loadCustomers()
}

// ---- 快捷新建客户账号 ----
const quickVisible = ref(false)
const quickSaving = ref(false)
const qFormRef = ref()
const quickForm = reactive({ userName: '', nickName: '', password: '' })
let initialQuick = ''
const closeQuick = useFormClose({
  visible: () => quickVisible.value, close: () => { quickVisible.value = false },
  isDirty: () => JSON.stringify(quickForm) !== initialQuick, isBusy: () => quickSaving.value, name: 'project-account'
})
const quickRules = {
  userName: [
    { pattern: /^[a-zA-Z0-9_]{2,20}$/, message: '2-20 位字母/数字/下划线', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请填写密码', trigger: 'blur' },
    { min: 5, max: 20, message: '5-20 位', trigger: 'blur' }
  ]
}

async function loadCustomers() {
  try {
    customers.value = (await listCustomers()) || []
  } catch (e) {
    // 账号列表加载失败不阻塞建单
  }
}

let creatingTester = false
function openQuickCreate(tester) {
  creatingTester = tester
  quickForm.userName = ''
  quickForm.nickName = tester ? '' : String(form.customer || '').trim().slice(0, 30)
  quickForm.password = '123456'
  initialQuick = JSON.stringify(quickForm)
  quickVisible.value = true
  qFormRef.value?.clearValidate()
}

function submitQuickCreate() {
  if (quickSaving.value) return
  qFormRef.value.validate(async (ok) => {
    if (!ok || quickSaving.value) return
    quickSaving.value = true
    try {
      const account = await createCustomer({ ...quickForm, autoUsername: !quickForm.userName.trim() })
      const username = account?.userName || quickForm.userName
      ElMessage.success('账号已创建，保存项目后生效')
      offerLoginInfo({ name: quickForm.nickName, userName: username, password: quickForm.password, who: 'customer' })
      await loadCustomers()
      if (creatingTester) {
        const id = Number(account?.userId || customers.value.find(c => c.userName === username)?.userId)
        if (id) form.testerIds = [...new Set([...form.testerIds, id])]
        else ElMessage.warning('账号已创建，请重新打开项目选择测试账号')
      } else {
        form.customerAccount = username
        form.testerIds = []
      }
      quickVisible.value = false
    } catch (e) {
      ElMessage.error(e.message || '创建失败')
    } finally {
      quickSaving.value = false
    }
  })
}
const enterQuickCreate = onEnter(submitQuickCreate)
const blank = () => ({
  title: '',
  channel: 'wechat',
  ownerId: currentMember.value.id,
  customer: '',
  customerAccount: '',
  testerIds: [],
  contact: '',
  amount: 0,
  priority: 'medium',
  status: 'pending',
  deadline: '',
  requirement: '',
  attachments: []
})
const form = reactive(blank())
const saving = ref(false)
const restored = ref(false)
let initial = ''
let initializing = false
const draft = () => projectDraft('project', currentMember.value.id)
function resetForm(values) {
  initializing = true
  for (const key of Object.keys(form)) delete form[key]
  Object.assign(form, blank(), values)
  initializing = false
}
function clearDraft() {
  draft().write(null)
  restored.value = false
  resetForm()
  formRef.value?.clearValidate()
}
watch(form, () => {
  if (initializing || !props.visible || form.id) return
  draft().write(JSON.stringify(form) === initial ? null : form)
}, { flush: 'sync' })
const requestClose = useFormClose({
  visible: () => props.visible, close: () => emit('update:visible', false),
  isDirty: () => !!form.id && JSON.stringify(form) !== initial, isBusy: () => saving.value, name: () => props.data?.id ? 'edit-project' : 'project'
})

const rules = {
  title: [{ required: true, message: '请填写项目名', trigger: 'blur' }],
  channel: [{ required: true, message: '请选择渠道', trigger: 'change' }]
}

function onOpen() {
  resetForm(props.data ? JSON.parse(JSON.stringify(props.data)) : {})
  initial = JSON.stringify(form)
  const saved = !form.id && draft().read()
  restored.value = !!saved
  if (saved) resetForm(saved)
  formRef.value?.clearValidate()
  loadCustomers()
}

watch(() => props.visible, shown => { if (shown) onOpen() }, { immediate: true })

// 新建时光标直接放进「项目名」；编辑时不抢（多半只是来改某一栏）
function onOpened() {
  if (!form.id) focusField(titleInput)
}

async function submit() {
  if (saving.value) return
  saving.value = true
  try {
    if (!await formRef.value.validate().catch(() => false)) return
    const payload = { ...form }
    if (form.id) {
      const previous = JSON.parse(initial)
      const ids = values => [...values].sort((a,b) => a-b).join(',')
      if ((previous.customerAccount || '') === (form.customerAccount || '') && ids(previous.testerIds) === ids(form.testerIds)) {
        delete payload.testerIds
        delete payload.customerAccount
      } else {
        payload.previousTesterIds = previous.testerIds
        payload.previousCustomerAccount = previous.customerAccount || ''
      }
    }
    if (await props.save(payload)) {
      if (!form.id) clearDraft()
      emit('update:visible', false)
    }
  } finally { saving.value = false }
}
</script>

<style scoped>
.tester-help { color: #58677e; font-size: 12px; line-height: 1.5; margin-top: 4px; }
.design-order-form .cust-account .el-button.account-batch { width: auto; padding: 0 4px; }
.field-testers { grid-column: 1 / -1; }
.draft-banner { margin: 0 0 12px; color: #546981; font-size: 13px; }
.deadline-box { display: flex; flex-direction: column; gap: 8px; width: 100%; }

.amount-hint {
  font-size: 12px;
  color: #909399;
  line-height: 1.4;
  margin-top: 4px;
}
.cust-account {
  display: flex;
  gap: 8px;
  width: 100%;
}
</style>
