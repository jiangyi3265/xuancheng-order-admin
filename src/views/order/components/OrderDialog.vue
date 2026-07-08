<template>
  <el-dialog
    :model-value="visible"
    :title="form.id ? '编辑订单' : '快速接单'"
    width="560px"
    @update:model-value="(v) => emit('update:visible', v)"
    @open="onOpen"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="84px">
      <el-form-item label="项目名" prop="title">
        <el-input v-model="form.title" placeholder="一句话写清做什么，比如：餐饮点餐小程序" />
      </el-form-item>

      <el-row :gutter="12">
        <el-col :span="12">
          <el-form-item label="来源渠道" prop="channel">
            <el-select v-model="form.channel" style="width: 100%">
              <el-option v-for="c in CHANNEL" :key="c.value" :label="c.label" :value="c.value" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="负责人">
            <el-select v-model="form.ownerId" style="width: 100%">
              <el-option v-for="m in MEMBERS" :key="m.id" :label="m.name" :value="m.id" />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>

      <el-row :gutter="12">
        <el-col :span="12">
          <el-form-item label="客户">
            <el-input v-model="form.customer" placeholder="选填" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="联系方式">
            <el-input v-model="form.contact" placeholder="微信/旺旺号，选填" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-form-item label="客户账号">
        <div class="cust-account">
          <el-select
            v-model="form.customerAccount"
            filterable
            clearable
            placeholder="选填：绑定后该客户可登录查看此项目并与你沟通"
            style="flex: 1"
          >
            <el-option
              v-for="c in customers"
              :key="c.userId"
              :label="`${c.userName}（${c.nickName}）`"
              :value="c.userName"
            />
          </el-select>
          <el-button :icon="Plus" @click="openQuickCreate">新建账号</el-button>
        </div>
      </el-form-item>

      <el-row :gutter="12">
        <el-col :span="8">
          <el-form-item label="报价(元)">
            <el-input-number v-model="form.amount" :min="0" :step="100" controls-position="right" style="width: 100%" />
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="优先级">
            <el-select v-model="form.priority" style="width: 100%">
              <el-option v-for="p in PRIORITY" :key="p.value" :label="p.label" :value="p.value" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="状态">
            <el-select v-model="form.status" style="width: 100%">
              <el-option v-for="s in STATUS" :key="s.value" :label="s.label" :value="s.value" />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>

      <el-form-item label="截止日期">
        <div style="width: 100%">
          <el-date-picker
            v-model="form.deadline"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="选填，建议都填上以便提醒"
            style="width: 100%; margin-bottom: 8px"
          />
          <DeadlineChips v-model="form.deadline" />
        </div>
      </el-form-item>

      <el-form-item label="需求描述">
        <el-input
          v-model="form.requirement"
          type="textarea"
          :rows="3"
          placeholder="把客户需求贴进来，避免来回翻聊天记录"
        />
      </el-form-item>

      <el-form-item label="需求材料">
        <AttachmentUploader v-model="form.attachments" />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button type="primary" @click="submit">保存</el-button>
    </template>

    <!-- 快捷新建客户账号 -->
    <el-dialog v-model="quickVisible" title="新建客户账号" width="420px" append-to-body>
      <el-form ref="qFormRef" :model="quickForm" :rules="quickRules" label-width="64px">
        <el-form-item label="账号" prop="userName">
          <el-input v-model="quickForm.userName" placeholder="客户登录用，字母/数字" />
        </el-form-item>
        <el-form-item label="昵称" prop="nickName">
          <el-input v-model="quickForm.nickName" placeholder="选填，如公司/称呼" />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input v-model="quickForm.password" placeholder="5-20 位" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="quickVisible = false">取消</el-button>
        <el-button type="primary" :loading="quickSaving" @click="submitQuickCreate">创建并绑定</el-button>
      </template>
    </el-dialog>
  </el-dialog>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import AttachmentUploader from '@/components/AttachmentUploader.vue'
import DeadlineChips from '@/components/DeadlineChips.vue'
import { CHANNEL, PRIORITY, STATUS, MEMBERS } from '@/constants/options'
import { listCustomers, createCustomer } from '@/mock/store'

const props = defineProps({
  visible: { type: Boolean, default: false },
  data: { type: Object, default: null }
})
const emit = defineEmits(['update:visible', 'save'])

const formRef = ref()
const customers = ref([])

// ---- 快捷新建客户账号 ----
const quickVisible = ref(false)
const quickSaving = ref(false)
const qFormRef = ref()
const quickForm = reactive({ userName: '', nickName: '', password: '' })
const quickRules = {
  userName: [
    { required: true, message: '请填写账号', trigger: 'blur' },
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

function openQuickCreate() {
  quickForm.userName = ''
  quickForm.nickName = ''
  quickForm.password = ''
  quickVisible.value = true
  qFormRef.value?.clearValidate()
}

function submitQuickCreate() {
  qFormRef.value.validate(async (ok) => {
    if (!ok) return
    quickSaving.value = true
    try {
      await createCustomer({ ...quickForm })
      ElMessage.success('账号已创建并绑定到本项目')
      await loadCustomers()
      form.customerAccount = quickForm.userName
      quickVisible.value = false
    } catch (e) {
      ElMessage.error(e.message || '创建失败')
    } finally {
      quickSaving.value = false
    }
  })
}
const blank = () => ({
  title: '',
  channel: 'wechat',
  ownerId: MEMBERS[0].id,
  customer: '',
  customerAccount: '',
  contact: '',
  amount: 0,
  priority: 'medium',
  status: 'pending',
  deadline: '',
  requirement: '',
  attachments: []
})
const form = reactive(blank())

const rules = {
  title: [{ required: true, message: '请填写项目名', trigger: 'blur' }],
  channel: [{ required: true, message: '请选择渠道', trigger: 'change' }]
}

function onOpen() {
  Object.assign(form, blank(), props.data || {})
  formRef.value?.clearValidate()
  loadCustomers()
}

function submit() {
  formRef.value.validate((ok) => {
    if (ok) emit('save', { ...form })
  })
}
</script>

<style scoped>
.cust-account {
  display: flex;
  gap: 8px;
  width: 100%;
}
</style>
