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
        <el-form-item v-if="captchaEnabled">
          <div class="captcha-row">
            <el-input v-model="captchaCode" size="large" placeholder="验证码" @keyup.enter="doLogin" />
            <img v-if="captchaImage" class="captcha-img" :src="captchaImage" alt="验证码" @click="loadCaptcha" />
          </div>
        </el-form-item>
        <el-button type="primary" size="large" style="width: 100%" :loading="loading" @click="doLogin">登录</el-button>
      </el-form>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Histogram, User, Lock } from '@element-plus/icons-vue'
import { getCaptcha, login } from '@/mock/store'

const router = useRouter()
const username = ref('')
const password = ref('')
const loading = ref(false)
const captchaEnabled = ref(false)
const captchaImage = ref('')
const captchaUuid = ref('')
const captchaCode = ref('')

async function loadCaptcha() {
  try {
    const data = await getCaptcha()
    captchaEnabled.value = data.captchaEnabled !== false
    captchaImage.value = data.img ? 'data:image/gif;base64,' + data.img : ''
    captchaUuid.value = data.uuid || ''
    captchaCode.value = ''
  } catch (e) {
    ElMessage.error(e.message || '验证码加载失败')
  }
}

async function doLogin() {
  if (!username.value || !password.value) return ElMessage.warning('请输入账号和密码')
  if (captchaEnabled.value && !captchaCode.value) return ElMessage.warning('请输入验证码')
  loading.value = true
  try {
    await login(username.value, password.value, { code: captchaCode.value, uuid: captchaUuid.value })
    ElMessage.success('登录成功')
    router.push('/')
  } catch (e) {
    ElMessage.error(e.message || '登录失败')
    if (captchaEnabled.value) loadCaptcha()
  } finally {
    loading.value = false
  }
}

onMounted(loadCaptcha)
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
  border-radius: 8px;
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
.captcha-row {
  display: flex;
  gap: 10px;
  width: 100%;
}
.captcha-img {
  width: 118px;
  height: 40px;
  border-radius: 4px;
  cursor: pointer;
  object-fit: cover;
}
</style>
