<template>
  <el-dialog
    :model-value="visible"
    title="修改登录密码"
    width="420px"
    :close-on-click-modal="false"
    @update:model-value="(v) => emit('update:visible', v)"
    @closed="reset"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="92px" @submit.prevent>
      <el-form-item label="旧密码" prop="oldPassword">
        <el-input v-model="form.oldPassword" type="password" show-password autocomplete="current-password" />
      </el-form-item>
      <el-form-item label="新密码" prop="newPassword">
        <el-input v-model="form.newPassword" type="password" show-password placeholder="5-20 位" autocomplete="new-password" />
      </el-form-item>
      <el-form-item label="确认新密码" prop="confirm">
        <el-input v-model="form.confirm" type="password" show-password autocomplete="new-password" @keyup.enter="submit" />
      </el-form-item>
    </el-form>
    <el-alert type="info" :closable="false" show-icon>
      修改成功后，这个账号在其他设备上的登录会自动退出，当前这台不受影响。
    </el-alert>
    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submit">确认修改</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { changeMyPassword } from '@/mock/store'

defineProps({ visible: { type: Boolean, default: false } })
const emit = defineEmits(['update:visible'])

const formRef = ref()
const saving = ref(false)
const form = reactive({ oldPassword: '', newPassword: '', confirm: '' })

const rules = {
  oldPassword: [{ required: true, message: '请输入旧密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 5, max: 20, message: '密码需为 5-20 位', trigger: 'blur' }
  ],
  confirm: [
    { required: true, message: '请再输入一次新密码', trigger: 'blur' },
    {
      validator: (_rule, value, callback) =>
        value === form.newPassword ? callback() : callback(new Error('两次输入的新密码不一致')),
      trigger: 'blur'
    }
  ]
}

function reset() {
  form.oldPassword = ''
  form.newPassword = ''
  form.confirm = ''
  formRef.value?.clearValidate()
}

function submit() {
  formRef.value.validate(async (valid) => {
    if (!valid) return
    saving.value = true
    try {
      await changeMyPassword(form.oldPassword, form.newPassword)
      ElMessage.success('密码已修改')
      emit('update:visible', false)
    } catch (e) {
      ElMessage.error(e.message || '修改失败')
    } finally {
      saving.value = false
    }
  })
}
</script>
