<template>
  <el-dialog
    :model-value="visible"
    class="ai-project-dialog"
    :title="data?.id ? '编辑代码项目' : '添加代码项目'"
    width="720px"
    destroy-on-close
    @update:model-value="$emit('update:visible', $event)"
    @open="fill"
  >
    <el-alert type="warning" :closable="false" class="project-tip">
      这里只保存不含凭证的 GitHub 地址。GitHub 和模型密钥只放在 Worker 主机环境变量中。
    </el-alert>
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
      <div class="form-grid">
        <el-form-item label="项目名称" prop="name">
          <el-input v-model="form.name" maxlength="80" placeholder="例如：接单系统后台" />
        </el-form-item>
        <el-form-item label="默认分支" prop="defaultBranch">
          <el-input v-model="form.defaultBranch" placeholder="main" />
        </el-form-item>
      </div>
      <el-form-item label="GitHub 仓库" prop="repoUrl">
        <el-input v-model="form.repoUrl" placeholder="https://github.com/org/repo.git" />
      </el-form-item>
      <div class="form-grid three">
        <el-form-item label="执行器">
          <el-select v-model="form.provider" style="width: 100%">
            <el-option label="Codex" value="codex" />
            <el-option label="Claude Code" value="claude" />
            <el-option label="Hermes" value="hermes" />
            <el-option label="自定义" value="custom" />
          </el-select>
        </el-form-item>
        <el-form-item label="模型（可留空）">
          <el-input v-model="form.model" placeholder="由 Worker 默认配置决定" />
        </el-form-item>
        <el-form-item label="Worker 配置键" prop="profileKey">
          <el-input v-model="form.profileKey" placeholder="default" />
        </el-form-item>
      </div>
      <el-form-item label="确定性验证命令" prop="validationText">
        <el-input
          v-model="form.validationText"
          type="textarea"
          :rows="4"
          placeholder="每行一条，不支持 shell 管道，例如：&#10;npm ci&#10;npm run build"
        />
      </el-form-item>
      <el-form-item label="额外禁止改动路径">
        <el-input
          v-model="form.forbiddenText"
          type="textarea"
          :rows="4"
          placeholder="每行一个 glob。系统已强制保护 CI、密钥、deploy 和 sql 目录。"
        />
      </el-form-item>
      <div class="form-grid">
        <el-form-item label="单项目最大并发">
          <el-input-number v-model="form.maxParallel" :min="1" :max="4" />
          <span class="hint">建议 1；确认机器余量后再提高</span>
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="form.enabled" inline-prompt active-text="启用" inactive-text="停用" />
        </el-form-item>
      </div>
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submit">保存项目</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { reactive, ref } from 'vue'

const props = defineProps({ visible: Boolean, data: Object, saving: Boolean })
const emit = defineEmits(['update:visible', 'submit'])
const formRef = ref()
const initial = () => ({
  id: null,
  version: null,
  name: '',
  repoUrl: '',
  defaultBranch: 'main',
  provider: 'codex',
  model: '',
  profileKey: 'default',
  validationText: '',
  forbiddenText: '',
  maxParallel: 1,
  enabled: true
})
const form = reactive(initial())
const rules = {
  name: [{ required: true, message: '请填写项目名称', trigger: 'blur' }],
  repoUrl: [
    { required: true, message: '请填写 GitHub 仓库', trigger: 'blur' },
    { pattern: /^(https:\/\/github\.com\/|git@github\.com:)[^/]+\/[^/]+(?:\.git)?$/, message: '只支持不含凭证的 GitHub 仓库地址', trigger: 'blur' }
  ],
  defaultBranch: [{ required: true, message: '请填写默认分支', trigger: 'blur' }],
  profileKey: [{ required: true, message: '请填写 Worker 配置键', trigger: 'blur' }],
  validationText: [{ required: true, message: '至少配置一条构建或测试命令', trigger: 'blur' }]
}

function lines(value) {
  if (Array.isArray(value)) return value.join('\n')
  return value || ''
}
function array(value) {
  return [...new Set(String(value || '').split('\n').map((item) => item.trim()).filter(Boolean))]
}
function fill() {
  const data = props.data || {}
  Object.assign(form, initial(), data, {
    enabled: Number(data.enabled ?? 1) === 1,
    validationText: lines(data.validationCommands),
    forbiddenText: lines(data.forbiddenPaths)
  })
  formRef.value?.clearValidate()
}
async function submit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  emit('submit', {
    id: form.id || undefined,
    version: form.version || undefined,
    name: form.name,
    repoUrl: form.repoUrl,
    defaultBranch: form.defaultBranch,
    provider: form.provider,
    model: form.model,
    profileKey: form.profileKey,
    validationCommands: array(form.validationText),
    forbiddenPaths: array(form.forbiddenText),
    maxParallel: form.maxParallel,
    enabled: form.enabled
  })
}
</script>

<style scoped>
.project-tip {
  margin-bottom: 18px;
}
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.form-grid.three {
  grid-template-columns: 0.8fr 1fr 1fr;
}
.hint {
  margin-left: 10px;
  color: #909399;
  font-size: 12px;
}
@media (max-width: 680px) {
  .form-grid,
  .form-grid.three {
    grid-template-columns: 1fr;
    gap: 0;
  }
  :global(.ai-project-dialog) {
    width: calc(100vw - 24px) !important;
  }
}
</style>
