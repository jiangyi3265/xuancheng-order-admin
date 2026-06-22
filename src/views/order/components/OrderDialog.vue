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
  </el-dialog>
</template>

<script setup>
import { ref, reactive } from 'vue'
import AttachmentUploader from '@/components/AttachmentUploader.vue'
import DeadlineChips from '@/components/DeadlineChips.vue'
import { CHANNEL, PRIORITY, STATUS, MEMBERS } from '@/constants/options'

const props = defineProps({
  visible: { type: Boolean, default: false },
  data: { type: Object, default: null }
})
const emit = defineEmits(['update:visible', 'save'])

const formRef = ref()
const blank = () => ({
  title: '',
  channel: 'wechat',
  ownerId: MEMBERS[0].id,
  customer: '',
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
}

function submit() {
  formRef.value.validate((ok) => {
    if (ok) emit('save', { ...form })
  })
}
</script>
