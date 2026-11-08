<template>
  <div class="settings">
    <BoardHeader v-if="isMobile" title="通知与提醒" back @back="$router.push('/mine')"/>
    <el-card shadow="never" class="card"><template #header><span class="title"><el-icon><Monitor /></el-icon> 系统通知</span></template><div class="notification-row"><div><b>本机提醒</b><p class="muted">{{ notifyDescription }}</p></div><el-button v-if="notification==='on'" size="small" @click="sendTest" :loading="testingBrowser">测试通知</el-button><el-switch :model-value="notification==='on'" :loading="notificationBusy" aria-label="开启本机系统通知" :disabled="!notifySupported" @change="toggleNotification" /></div></el-card>
    <!-- 企业微信：免费、不限条数，开微信插件后个人微信就能收到 -->
    <el-card v-if="isBoss" shadow="never" class="card">
      <template #header>
        <span class="title"><el-icon><ChatDotSquare /></el-icon> 企业微信通知（推荐）</span>
        <el-tag v-if="wecomReady" type="success" size="small" class="wecom-state">已配置</el-tag>
      </template>
      <p class="push-help">免费、不限条数。同事在企业微信里开启「微信插件」后，用个人微信就能收到提醒，点一下直达项目。下面填了企业微信账号的人走企业微信，没填的仍走 Server酱。</p>
      <el-collapse class="wecom-steps">
        <el-collapse-item title="第一次配置？按这 5 步来" name="steps">
          <ol>
            <li>打开 <a href="https://work.weixin.qq.com" target="_blank" rel="noopener">work.weixin.qq.com</a> 注册企业微信（不需要认证）。</li>
            <li>「应用管理」→「自建」→ 创建应用（名称如「接单提醒」，可见范围选你和同事）。在应用详情复制 <b>AgentId</b>、<b>Secret</b>；在「我的企业」页面最下面复制 <b>企业 ID</b>，填到下面。</li>
            <li>应用详情 →「接收消息」→「设置API接收」：URL 填下面的<b>回调地址</b>；Token 和 EncodingAESKey 点企业微信的「随机获取」，复制到下面。<b>先在这里点保存，再回企业微信点保存</b>。</li>
            <li>应用详情 →「企业可信IP」：填服务器的公网 IP。不知道填什么，先点下面任意成员的「发送测试」，失败提示里会写出要填的 IP。</li>
            <li>「通讯录」里点开每个成员，复制他的「账号」填到下面对应的人；再到「我的企业」→「微信插件」，让同事用微信扫码关注，之后个人微信就能收到。</li>
          </ol>
        </el-collapse-item>
      </el-collapse>
      <el-form label-width="120px" class="form">
        <el-form-item label="企业 ID"><el-input v-model="wecom.corpId" placeholder="ww 开头的一串字母数字" clearable class="field-md" /></el-form-item>
        <el-form-item label="AgentId"><el-input v-model="wecom.agentId" placeholder="一串数字，如 1000002" clearable class="field-md" /></el-form-item>
        <el-form-item label="Secret">
          <el-input v-model="wecom.secret" type="password" show-password placeholder="应用详情里的 Secret" clearable class="field-md" />
          <span v-if="wecom.secret === MASK" class="hint">已保存，不改就保持原样</span>
        </el-form-item>
        <el-form-item label="回调地址">
          <div class="key-row field-lg"><el-input :model-value="callbackUrl" readonly /><el-button :icon="CopyDocument" @click="copy(callbackUrl, '回调地址已复制')">复制</el-button></div>
        </el-form-item>
        <el-form-item label="Token"><el-input v-model="wecom.token" placeholder="企业微信「随机获取」的 Token" clearable class="field-md" /></el-form-item>
        <el-form-item label="EncodingAESKey">
          <el-input v-model="wecom.aesKey" type="password" show-password placeholder="企业微信「随机获取」的 43 位密钥" clearable class="field-md" />
          <span v-if="wecom.aesKey === MASK" class="hint">已保存，不改就保持原样</span>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Check" @click="save" :loading="saving">保存设置</el-button>
          <span class="hint">保存后，在下面给自己点「发送测试」试一下</span>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" class="card">
      <template #header>
        <span class="title"><el-icon><Bell /></el-icon> 微信提醒</span>
      </template>

      <p class="push-help">每个人填一种接收方式：<b>企业微信账号</b>（推荐，见上方配置），或 Server酱 SendKey（<a href="https://sct.ftqq.com" target="_blank" rel="noopener">获取 SendKey</a>，免费版每天条数有限）。两个都填时只走企业微信。</p>
      <el-form label-width="120px" class="form">
        <el-form-item v-if="isBoss" label="启用推送">
          <el-switch v-model="enabled" />
        </el-form-item>

        <el-form-item v-if="isBoss" label="我的第二个微信">
          <el-input v-model="quoteCopy" clearable placeholder="企业通讯录里的账号" style="max-width: 360px" />
          <span class="hint">我发起的报价邀请和报价结果，同时发到这个微信。</span>
        </el-form-item>

        <el-form-item v-if="isBoss" label="提前提醒天数">
          <el-input-number v-model="aheadDays" :min="0" :max="30" />
          <span class="hint">截止前几天开始提醒，每天 9:00 自动检查</span>
        </el-form-item>

        <el-form-item v-if="isBoss" label="系统网址">
          <el-input v-model="siteUrl" placeholder="例如 https://jiedanxt.oksja.cn" clearable style="max-width: 360px" />
          <span class="hint">微信推送末尾会带「打开项目」链接，点一下直达项目</span>
        </el-form-item>

        <el-form-item v-if="isBoss" label="停滞提醒天数">
          <el-input-number v-model="stallDays" :min="1" :max="60" />
          <span class="hint">待确认 / 进行中的项目超过几天没动静，就进「快被忘了」并写进每日汇总</span>
        </el-form-item>

        <el-form-item v-for="m in MEMBERS" :key="m.id" :label="m.name">
          <div class="key-row">
            <el-input v-model="wecomUsers[m.id]" placeholder="企业微信账号（通讯录里的「账号」）" clearable />
            <el-input v-model="keys[m.id]" type="password" show-password placeholder="或 Server酱 SendKey" clearable />
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
        每位成员使用自己的账号登录。在「成员管理」中创建协作账号，项目按账号权限展示。
      </p>
      <p v-else class="muted">
        你用自己的账号登录，只能看到负责人是你的项目；新单、验收、催办等提醒也只会推送给你自己。
      </p>
    </el-card>
  </div>
</template>

<script setup>
import BoardHeader from '@/components/board/BoardHeader.vue'
import {isMobile} from '@/utils/useMobile'
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Bell, User, Promotion, Check, AlarmClock, Share, CopyDocument, Link } from '@element-plus/icons-vue'
import { isNotifySupported, notifyState, enableNotify, disableNotify, hasBackgroundPush, testSystemNotification } from '@/utils/notify'
import { MEMBERS } from '@/constants/options'
import { getPushConfig, savePushConfig, testPush, runDeadlineReminder, isBoss, collab, currentMember } from '@/mock/store'

const notifySupported = isNotifySupported()
const notification = ref(notifyState())
const testingBrowser=ref(false)
const backgroundAvailable=ref(hasBackgroundPush())
const notifyDescription = computed(() => {
 if (!notifySupported) return '请使用支持系统通知的浏览器，iPhone 或 iPad 可添加到主屏幕后打开。'
 if (notification.value === 'denied') return '请在浏览器的网站权限中允许通知。'
 if (notification.value === 'on') return backgroundAvailable.value ? '系统推送已开启，关闭项目页面后仍可接收。' : '当前使用页面提醒，请保持页面打开。'
 return '接收新消息、问题和交办提醒。'
})
async function sendTest() {
 if(testingBrowser.value)return
 testingBrowser.value=true
 try {
   const delivery=await testSystemNotification()
   ElMessage.success(delivery==='background'?'推送服务已接收，请查看本机系统通知':'页面通知已发送，请查看本机系统通知')
 } catch(e) { ElMessage.warning((e.message || '测试失败')+'，请查看本机的页面通知') }
 finally {testingBrowser.value=false;backgroundAvailable.value=hasBackgroundPush()}
}
const notificationBusy = ref(false)
async function toggleNotification(value) {
 notificationBusy.value = true
 try {
 if(value) { notification.value=await enableNotify(); if(notification.value!=='on') ElMessage.warning('请在浏览器设置中允许通知') }
 else { disableNotify();notification.value=notifyState() }
 } finally { notificationBusy.value = false; backgroundAvailable.value=hasBackgroundPush() }
}
const enabled = ref(false)
const aheadDays = ref(1)
const siteUrl = ref('')
const stallDays = ref(3)
// 企业微信：Secret / EncodingAESKey 后端只回 ******** 表示已填，原样存回去就是“不改”
const MASK = '********'
const wecom = reactive({ corpId: '', agentId: '', secret: '', token: '', aesKey: '' })
const wecomUsers = reactive({})
const quoteCopy = ref('')
const wecomReady = computed(() => !!(wecom.corpId && wecom.agentId && wecom.secret))
const callbackUrl = computed(() => (siteUrl.value || window.location.origin).replace(/\/+$/, '') + '/jiedan/wecom/callback')
function copy(text, ok) {
  navigator.clipboard?.writeText(text).then(
    () => ElMessage.success(ok || '已复制'),
    () => ElMessage.warning('复制失败，请手动复制')
  )
}
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
    quoteCopy.value = cfg['push.wecom.quoteCopy.' + currentMember.value.id] || ''
    enabled.value = cfg['push.enabled'] !== 'false'
    aheadDays.value = Number.isFinite(Number(cfg['push.aheadDays'])) ? Math.min(30, Math.max(0, Number(cfg['push.aheadDays']))) : 1
    // 还没填过系统网址时，先用当前打开的网址，保存后推送就带链接
    siteUrl.value = cfg['push.siteUrl'] || window.location.origin
    const sd = Number(cfg['push.stallDays'])
    stallDays.value = Number.isInteger(sd) && sd >= 1 && sd <= 60 ? sd : 3
    MEMBERS.forEach((m) => {
      keys[m.id] = cfg['push.sendkey.' + m.id] || ''
      wecomUsers[m.id] = cfg['push.wecom.user.' + m.id] || ''
    })
    for (const k of Object.keys(wecom)) wecom[k] = cfg['push.wecom.' + k] || ''
  } catch (e) {
    ElMessage.error('读取设置失败：' + e.message)
  }
}

async function save() {
  saving.value = true
  try {
    // 全局开关只有总管理员能改；下属管理员只保存自己的 SendKey（MEMBERS 里只有自己）
    const cfg = isBoss.value
      ? { 'push.enabled': String(enabled.value), 'push.aheadDays': String(aheadDays.value), 'push.siteUrl': siteUrl.value.trim(), 'push.stallDays': String(stallDays.value) }
      : {}
    MEMBERS.forEach((m) => {
      cfg['push.sendkey.' + m.id] = keys[m.id] || ''
      cfg['push.wecom.user.' + m.id] = (wecomUsers[m.id] || '').trim()
    })
    if (isBoss.value) for (const k of Object.keys(wecom)) cfg['push.wecom.' + k] = (wecom[k] || '').trim()
    if (isBoss.value) cfg['push.wecom.quoteCopy.' + currentMember.value.id] = quoteCopy.value.trim()
    await savePushConfig(cfg)
    if (isBoss.value) collab.stallDays = stallDays.value
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
.card :deep(.el-card__header) {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.field-md {
  max-width: 360px;
}
.field-lg {
  max-width: 520px;
}
.wecom-steps {
  margin: 0 0 16px;
}
.wecom-steps ol {
  margin: 0;
  padding-left: 20px;
  color: #4a5a75;
  font-size: 13px;
  line-height: 1.9;
}
.wecom-steps a {
  color: #165dff;
}
@media (max-width: 768px) {
  .key-row {
    flex-wrap: wrap;
  }
  .field-md,
  .field-lg {
    max-width: none;
  }
}
</style>
