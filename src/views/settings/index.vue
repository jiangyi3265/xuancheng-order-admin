<template>
  <div class="settings">
    <el-card shadow="never" class="card">
      <template #header>
        <span class="title"><el-icon><Bell /></el-icon> 微信推送提醒</span>
      </template>

      <el-alert type="info" :closable="false" class="tip">
        填上各自的 Server酱 SendKey，新单、待验收、改稿、催办、逾期都会自动推送到微信服务通知。
        获取方式：手机微信扫码登录 <b>sct.ftqq.com</b>，复制 SendKey 粘贴到下面即可。
      </el-alert>
      <el-alert type="info" :closable="false" class="tip">
        想在没开网页时也在手机上收到提醒，请配置微信推送（Server酱）。还没配之前，电脑浏览器可以点右上角的小铃铛开启桌面提醒。
      </el-alert>

      <el-form label-width="120px" class="form">
        <el-form-item v-if="isBoss" label="启用推送">
          <el-switch v-model="enabled" />
        </el-form-item>

        <el-form-item v-if="isBoss" label="提前提醒天数">
          <el-input-number v-model="aheadDays" :min="0" :max="30" />
          <span class="hint">截止前几天开始提醒，每天 9:00 自动检查</span>
        </el-form-item>

        <el-form-item v-for="m in MEMBERS" :key="m.id" :label="m.name + '（' + m.roleLabel + '）'">
          <div class="key-row">
            <el-input v-model="keys[m.id]" placeholder="粘贴该成员的 Server酱 SendKey" clearable />
            <el-button :icon="Promotion" @click="doTest(m.id)" :loading="testing === m.id">发送测试</el-button>
          </div>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" :icon="Check" @click="save" :loading="saving">保存设置</el-button>
          <el-button v-if="isBoss" :icon="AlarmClock" @click="triggerReminder">立即检查逾期并推送</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" class="card">
      <template #header>
        <span class="title"><el-icon><Share /></el-icon> 客户需求提交链接</span>
      </template>
      <el-alert type="success" :closable="false" class="tip">
        把这个链接发给客户，客户先用账号密码登录，再填写需求和上传资料。提交后会自动建单并提醒负责人。
      </el-alert>
      <div class="key-row">
        <el-input :model-value="intakeUrl" readonly />
        <el-button type="primary" :icon="CopyDocument" @click="copyIntake">复制链接</el-button>
        <el-button :icon="Link" @click="openIntake">预览</el-button>
      </div>
    </el-card>

    <el-card shadow="never" class="card">
      <template #header>
        <span class="title"><el-icon><User /></el-icon> 成员</span>
      </template>
      <p v-if="isBoss" class="muted">
        每位成员用自己的账号登录。在「成员管理」里创建下属管理员：下属只能看到负责人是自己的项目，看不到你的项目；你能看到全部。
      </p>
      <p v-else class="muted">
        你用自己的账号登录，只能看到负责人是你的项目；新单、验收、催办等提醒也只会推送给你自己。
      </p>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Bell, User, Promotion, Check, AlarmClock, Share, CopyDocument, Link } from '@element-plus/icons-vue'
import { MEMBERS } from '@/constants/options'
import { getPushConfig, savePushConfig, testPush, runDeadlineReminder, isBoss } from '@/mock/store'

const enabled = ref(true)
const aheadDays = ref(1)
const keys = reactive({})
const saving = ref(false)
const testing = ref(0)
const intakeUrl = window.location.origin + '/#/intake'

function copyIntake() {
  navigator.clipboard?.writeText(intakeUrl).then(
    () => ElMessage.success('链接已复制，发给客户即可'),
    () => ElMessage.warning('复制失败，请手动复制')
  )
}

function openIntake() {
  window.open(intakeUrl, '_blank')
}

onMounted(load)

async function load() {
  try {
    const cfg = await getPushConfig()
    enabled.value = cfg['push.enabled'] !== 'false'
    aheadDays.value = parseInt(cfg['push.aheadDays'] || '1') || 1
    MEMBERS.forEach((m) => { keys[m.id] = cfg['push.sendkey.' + m.id] || '' })
  } catch (e) {
    ElMessage.error('读取设置失败：' + e.message)
  }
}

async function save() {
  saving.value = true
  try {
    // 全局开关只有总管理员能改；下属管理员只保存自己的 SendKey（MEMBERS 里只有自己）
    const cfg = isBoss.value
      ? { 'push.enabled': String(enabled.value), 'push.aheadDays': String(aheadDays.value) }
      : {}
    MEMBERS.forEach((m) => { cfg['push.sendkey.' + m.id] = keys[m.id] || '' })
    await savePushConfig(cfg)
    ElMessage.success('已保存')
  } catch (e) {
    ElMessage.error('保存失败：' + e.message)
  } finally {
    saving.value = false
  }
}

async function doTest(memberId) {
  testing.value = memberId
  try {
    const msg = await testPush(memberId)
    ElMessage({ message: msg, type: String(msg).includes('已发送') ? 'success' : 'warning', duration: 4000 })
  } catch (e) {
    ElMessage.error('测试失败：' + e.message)
  } finally {
    testing.value = 0
  }
}

async function triggerReminder() {
  try {
    const msg = await runDeadlineReminder()
    ElMessage.success(msg || '已触发')
  } catch (e) {
    ElMessage.error('触发失败：' + e.message)
  }
}
</script>

<style scoped>
.settings {
  max-width: 760px;
}
.card {
  border-radius: 8px;
  margin-bottom: 16px;
}
.title {
  font-weight: 600;
  font-size: 15px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.tip {
  margin-bottom: 18px;
  line-height: 1.7;
}
.form {
  max-width: 640px;
}
.key-row {
  display: flex;
  gap: 8px;
  width: 100%;
}
.hint {
  margin-left: 10px;
  color: #909399;
  font-size: 12px;
}
.muted {
  color: #909399;
  font-size: 13px;
  line-height: 1.7;
  margin: 0;
}
</style>
