<template>
  <div class="login-page">
    <div class="login-card">
      <div class="brand">
        <el-icon :size="28" color="#409eff"><Histogram /></el-icon>
        <span>玄成科技 · 接单系统</span>
      </div>
      <p class="sub">登录后进入工作台</p>
      <el-form @submit.prevent="doLogin">
        <el-form-item>
          <el-input v-model="username" size="large" placeholder="账号" :prefix-icon="User" @keyup.enter="doLogin" />
        </el-form-item>
        <el-form-item>
          <el-input v-model="password" size="large" type="password" show-password placeholder="密码" :prefix-icon="Lock" @keyup.enter="doLogin" />
        </el-form-item>
        <el-button type="primary" size="large" style="width: 100%" :loading="loading" @click="doLogin">登 录</el-button>
      </el-form>
      <p class="hint">默认账号 admin / admin123（可在若依后台改密、加人）</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Histogram, User, Lock } from '@element-plus/icons-vue'
import { login } from '@/mock/store'

const router = useRouter()
const username = ref('admin')
const password = ref('')
const loading = ref(false)

async function doLogin() {
  if (!username.value || !password.value) return ElMessage.warning('请输入账号和密码')
  loading.value = true
  try {
    await login(username.value, password.value)
    ElMessage.success('登录成功')
    router.push('/')
  } catch (e) {
    ElMessage.error(e.message || '登录失败')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #304156;
  padding: 16px;
}
.login-card {
  width: 100%;
  max-width: 380px;
  background: #fff;
  border-radius: 12px;
  padding: 32px 28px;
  box-shadow: 0 6px 30px rgba(0, 0, 0, 0.2);
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 20px;
  font-weight: 700;
  color: #303133;
  justify-content: center;
}
.sub {
  text-align: center;
  color: #909399;
  font-size: 14px;
  margin: 8px 0 24px;
}
.hint {
  text-align: center;
  color: #c0c4cc;
  font-size: 12px;
  margin: 14px 0 0;
}
</style>
