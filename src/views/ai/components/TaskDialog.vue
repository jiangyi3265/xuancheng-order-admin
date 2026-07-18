<template>
  <el-dialog
    :model-value="visible"
    class="ai-task-dialog"
    title="新建 AI 改码任务"
    width="680px"
    destroy-on-close
    @update:model-value="$emit('update:visible', $event)"
    @closed="reset"
  >
    <el-alert type="info" :closable="false" class="task-tip">
      Worker 只会创建独立分支和 PR；批准不会自动合并或发布生产。
    </el-alert>
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
      <div class="form-grid">
        <el-form-item label="代码项目" prop="projectId">
          <el-select v-model="form.projectId" placeholder="选择仓库" filterable style="width: 100%">
            <el-option
              v-for="project in enabledProjects"
              :key="project.id"
              :label="project.name"
              :value="project.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="风险等级" prop="riskLevel">
          <el-select v-model="form.riskLevel" style="width: 100%">
            <el-option label="低 · 常规小改" value="low" />
            <el-option label="中 · 跨模块或数据逻辑" value="medium" />
            <el-option label="高 · 权限、支付、核心链路" value="high" />
          </el-select>
        </el-form-item>
      </div>
      <el-form-item label="任务标题" prop="title">
        <el-input v-model="form.title" maxlength="120" show-word-limit placeholder="例如：修复订单详情重复提交问题" />
      </el-form-item>
      <el-form-item label="改码说明" prop="prompt">
        <el-input
          v-model="form.prompt"
          type="textarea"
          :rows="10"
          maxlength="30000"
          show-word-limit
          placeholder="写清现象、期望行为、复现步骤、不可改动范围和验收条件。"
        />
      </el-form-item>
      <div class="form-grid">
        <el-form-item label="关联订单 ID（可选）">
          <el-input-number v-model="form.orderId" :min="1" :controls="false" placeholder="订单 ID" style="width: 100%" />
        </el-form-item>
        <el-form-item label="关联 Bug ID（可选）">
          <el-input-number v-model="form.bugId" :min="1" :controls="false" placeholder="Bug ID" style="width: 100%" />
        </el-form-item>
      </div>
      <el-form-item>
        <el-checkbox v-model="form.dispatch">创建后立即进入执行队列</el-checkbox>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submit">
        {{ form.dispatch ? '创建并排队' : '保存草稿' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'

const props = defineProps({
  visible: Boolean,
  projects: { type: Array, default: () => [] },
  saving: Boolean
})
const emit = defineEmits(['update:visible', 'submit'])

const formRef = ref()
const initial = () => ({
  projectId: null,
  title: '',
  prompt: '',
  riskLevel: 'low',
  orderId: null,
  bugId: null,
  dispatch: true
})
const form = reactive(initial())
const enabledProjects = computed(() => props.projects.filter((item) => Number(item.enabled) === 1))
const rules = {
  projectId: [{ required: true, message: '请选择代码项目', trigger: 'change' }],
  title: [{ required: true, message: '请填写任务标题', trigger: 'blur' }],
  prompt: [
    { required: true, message: '请填写改码说明', trigger: 'blur' },
    { min: 20, message: '至少写 20 个字符，补充现象和验收条件', trigger: 'blur' }
  ]
}

function reset() {
  Object.assign(form, initial())
  formRef.value?.clearValidate()
}

async function submit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  emit('submit', { ...form })
}
</script>

<style scoped>
.task-tip {
  margin-bottom: 18px;
}
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
@media (max-width: 640px) {
  .form-grid {
    grid-template-columns: 1fr;
    gap: 0;
  }
  :global(.ai-task-dialog) {
    width: calc(100vw - 24px) !important;
  }
}
</style>
