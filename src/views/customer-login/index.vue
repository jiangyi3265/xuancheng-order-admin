<template>
  <div class="customer-login-page">
    <section class="login-panel">
      <div class="brand">
        <el-icon :size="28" color="#409eff"><Histogram /></el-icon>
        <div>
          <strong>客户需求提交</strong>
          <span>请输入账号密码后继续</span>
        </div>
      </div>

      <el-form class="form" @submit.prevent="doLogin">
        <el-form-item>
          <el-input v-model="username" size="large" placeholder="客户账号" :prefix-icon="User" @keyup.enter="doLogin" />
        </el-form-item>
        <el-form-item>
          <el-input
            v-model="password"
            size="large"
            type="password"
            show-password
            placeholder="客户密码"
            :prefix-icon="Lock"
            @keyup.enter="doLogin"
          />
        </el-form-item>
        <el-button type="primary" size="large" class="submit" :loading="loading" @click="doLogin">
          登录并提交需求
        </el-button>
      </el-form>

      <p class="hint">默认客户账号：customer / customer123。正式使用时可在后台用户表中单独创建客户账号。</p>
    </section>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Histogram, User, Lock } from '@element-plus/icons-vue'
import { customerLogin } from '@/mock/store'

const route = useRoute()
const router = useRouter()
const username = ref('customer')
const password = ref('')
const loading = ref(false)

async function doLogin() {
  if (!username.value || !password.value) return ElMessage.warning('请输入客户账号和密码')
  loading.value = true
  try {
    await customerLogin(username.value, password.value)
    ElMessage.success('登录成功')
    router.push(route.query.redirect || '/intake')
  } catch (e) {
    ElMessage.error(e.message || '登录失败')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.customer-login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #eef2f7;
  padding: 16px;
}
.login-panel {
  width: 100%;
  max-width: 390px;
  background: #fdfefe;
  border-radius: 8px;
  padding: 30px 28px;
  box-shadow: 0 8px 32px rgba(42, 62, 86, 0.16);
}
.brand {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #303133;
}
.brand strong {
  display: block;
  font-size: 20px;
  line-height: 1.2;
}
.brand span {
  display: block;
  margin-top: 4px;
  color: #909399;
  font-size: 13px;
}
.form {
  margin-top: 24px;
}
.submit {
  width: 100%;
}
.hint {
  margin: 14px 0 0;
  color: #909399;
  font-size: 12px;
  line-height: 1.7;
  text-align: center;
}
</style>
