<template>
  <div class="login-page unified-login">
    <div class="login-art"><div class="brand"><BrandLogo/><strong>玄成接单</strong></div><p>项目 · 协作 · 交付 · 收款</p><BoardArtwork kind="ribbon" label="蓝色品牌丝带" class="login-ribbon"/><div class="login-promise">把每一份需求<br>变成一次漂亮的交付。</div></div>
    <section class="login-card">
      <h1>欢迎回来</h1><p class="sub">登录玄成接单，进入你的工作台</p>
      <el-form label-position="top" @submit.prevent="doLogin">
        <el-form-item label="账号"><el-input v-model="username" size="large" placeholder="请输入登录账号" :prefix-icon="User" autocomplete="username" /></el-form-item>
        <el-form-item label="密码"><el-input v-model="password" size="large" type="password" show-password placeholder="请输入密码" :prefix-icon="Lock" autocomplete="current-password" /></el-form-item>
        <el-form-item v-if="captchaEnabled" label="验证码"><div class="captcha-row"><el-input v-model="captchaCode" size="large" placeholder="请输入验证码" /><img v-if="captchaImage" class="captcha-img" :src="captchaImage" alt="验证码，点击刷新" @click="loadCaptcha" /></div></el-form-item>
        <el-checkbox v-if="inWeChat" v-model="rememberDevice">在此微信保持登录 30 天</el-checkbox>
        <el-button native-type="submit" type="primary" size="large" class="login-submit" :loading="loading">登录</el-button>
      </el-form>
      <p class="login-help"><el-icon><Lock /></el-icon>使用你的账号登录，开始项目协作</p>
    </section>
  </div>
</template>

<script setup>
import BrandLogo from '@/components/board/BrandLogo.vue'
import BoardArtwork from '@/components/board/BoardArtwork.vue'
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast as ElMessage } from '@/utils/toast'
import { Histogram, User, Lock } from '@element-plus/icons-vue'
import {inWeChat} from '@/utils/wechatSession'
import { getCaptcha, login } from '@/mock/store'

const router = useRouter()
const route = useRoute()
const username = ref('')
const password = ref('')
const loading = ref(false)
const rememberDevice=ref(inWeChat)
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
  if (loading.value) return
  if (!username.value || !password.value) return ElMessage.warning('请输入账号和密码')
  if (captchaEnabled.value && !captchaCode.value) return ElMessage.warning('请输入验证码')
  loading.value = true
  try {
    const role = await login(username.value, password.value, { code: captchaCode.value, uuid: captchaUuid.value },rememberDevice.value)
    ElMessage.success('登录成功')
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : ''
    const safeCustomerRedirect = /^\/(projects(?:\/\d+)?|intake|customer\/(messages|mine|security))(?:[?].*)?$/.test(redirect)
    // 后台成员：只接受站内后台页面（如 /order?id=12），客户页面和外部地址一律回工作台
    const safeStaffRedirect = /^\/(workbench|order|quotes|messages|approvals|customers|staff|audit|dashboard|settings|trash|mine|security)(?:[?].*)?$/.test(redirect)
    router.replace(role === 'customer' ? (safeCustomerRedirect ? redirect : '/projects') : (safeStaffRedirect ? redirect : '/workbench'))
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
@media (max-width: 768px) and (max-height: 700px) {
  .unified-login.login-page { padding: 12px 16px; min-height: 100dvh; }
  .unified-login .login-art { min-height: 0; height: auto; padding: 8px 0 14px; }
  .login-art :is(.login-ribbon,.login-promise,p) { display: none; }
  .unified-login .login-card { margin-top: 0; padding: 18px; }
  .login-card .sub { margin-bottom: 12px; }
  .login-card :deep(.el-form-item) { margin-bottom: 14px; }
  .login-card .login-submit { margin-top: 2px; }
}
</style>
