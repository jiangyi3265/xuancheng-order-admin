<template>
  <div class="intake-page">
    <div class="intake-shell">
      <header class="topbar">
        <div class="brand">
          <button class="icon-button" aria-label="返回我的项目" @click="router.push('/projects')"><el-icon><ArrowLeft/></el-icon></button>
          <div>
            <strong>提交需求</strong>
            <span>选择模板、补充说明、粘贴图片后提交</span>
          </div>
        </div>
        <div class="account">
          <span>{{ customerName || '客户账号' }}</span>
          <el-button text type="primary" @click="doLogout">退出</el-button>
        </div>
      </header>

      <section class="intake-card">
        <template v-if="!done">
          <div class="intro">
            <h1>需求模板 <small>（可选填，便于快速描述）</small></h1>
            <p>点一个模板会自动填好标题和描述，你可以继续改文字，也可以直接粘贴截图。</p>
          </div>

          <div class="templates">
            <button
              v-for="tpl in templates"
              :key="tpl.title"
              type="button"
              class="template-btn"
              @click="applyTemplate(tpl)"
            >
              <span>{{ tpl.title }}</span>
              <em>{{ tpl.hint }}</em>
            </button>
          </div>

          <el-form label-position="top" class="form" data-paste-zone="提交需求">
            <el-form-item label="项目 / 问题标题" required>
              <el-input v-model="form.title" placeholder="例如：菜单图片需要替换" />
            </el-form-item>
            <el-form-item label="问题说明" required>
              <el-input
                v-model="form.requirement"
                type="textarea"
                :rows="5"
                placeholder="说清楚要改哪里、改成什么、有没有参考图或截止时间"
              />
            </el-form-item>
            <el-form-item label="截图 / 参考图 / 文件">
              <AttachmentUploader v-model="form.attachments" />
            </el-form-item>
            <el-row :gutter="12">
              <el-col :xs="24" :sm="12">
                <el-form-item label="你的称呼 / 公司">
                  <el-input v-model="form.customer" placeholder="怎么称呼你" />
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="12">
                <el-form-item label="联系方式" required>
                  <el-input v-model="form.contact" placeholder="微信号 / 手机号" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-form-item label="预算">
              <el-input-number
                v-model="form.amount"
                :min="0"
                :step="100"
                controls-position="right"
                style="width: 180px"
              />
            </el-form-item>

            <el-button type="primary" size="large" :loading="submitting" class="submit" @click="submit">
              提交需求
            </el-button>
          </el-form>
        </template>

        <div v-else class="done">
          <BoardArtwork kind="success" label="提交成功" class="intake-success-art"/>
          <h2>提交成功</h2>
          <p>我们将尽快确认需求，你可以在项目详情里继续与团队沟通。</p>
          <section class="success-project"><h3>{{ form.title }}</h3><p>{{ form.requirement }}</p><span>{{ form.amount ? '预算 ¥' + form.amount : '预算待定' }} · 等待确认</span></section>
          <div class="done-actions">
            <el-button type="primary" @click="$router.push('/projects')">查看我的项目</el-button>
            <el-button @click="reset">继续提交</el-button>
          </div>
        </div>
      </section>

      <p class="foot">玄成科技接单系统</p>
    </div>

    <AppTabBar active="intake" />
  </div>
</template>

<script setup>
import BoardArtwork from '@/components/board/BoardArtwork.vue'
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Histogram, CircleCheckFilled } from '@element-plus/icons-vue'
import AttachmentUploader from '@/customer/components/AttachmentUploader.vue'
import AppTabBar from '@/customer/components/AppTabBar.vue'
import { customerHttp, customerLogout, customerName } from '@/customer/mock/store'

const router = useRouter()
// 称呼和联系方式记住上一次填的，下次提交不用再打一遍（按客户账号分开存）
const PROFILE_KEY = 'xc.intake.profile.' + (customerName.value || '')
function savedProfile() {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}') || {} } catch { return {} }
}
const blank = () => {
  const p = savedProfile()
  return { title: '', requirement: '', customer: p.customer || customerName.value || '', contact: p.contact || '', amount: 0, attachments: [] }
}
const form = reactive(blank())
const submitting = ref(false)
const done = ref(false)

const templates = [
  {
    title: '图片替换',
    hint: '换图、补图、改尺寸',
    requirement: '需要替换图片：\n1. 当前是哪张图：\n2. 想换成什么：\n3. 是否有参考图或新图片：'
  },
  {
    title: '文字修改',
    hint: '错字、价格、说明',
    requirement: '需要修改文字：\n1. 原文字：\n2. 改成：\n3. 出现位置：'
  },
  {
    title: '新增功能',
    hint: '加按钮、表单、页面',
    requirement: '需要新增功能：\n1. 谁来使用：\n2. 点哪里进入：\n3. 提交后要看到什么结果：'
  },
  {
    title: '页面问题',
    hint: '打不开、显示错乱',
    requirement: '页面出现问题：\n1. 问题页面：\n2. 具体表现：\n3. 手机/电脑型号或浏览器：'
  }
]

// 点模板：标题空着（或还是别的模板名）才填；已经写了说明就把模板接在后面，不覆盖客户自己打的字
function applyTemplate(tpl) {
  const isTemplateText = (text) => templates.some((t) => t.requirement === text.trim())
  if (!form.title.trim() || templates.some((t) => t.title === form.title.trim())) form.title = tpl.title
  if (!form.requirement.trim() || isTemplateText(form.requirement)) form.requirement = tpl.requirement
  else if (!form.requirement.includes(tpl.requirement)) form.requirement = form.requirement.trimEnd() + '\n\n' + tpl.requirement
}

async function submit() {
  if (!form.title.trim()) return ElMessage.warning('请填写问题标题')
  if (!form.requirement.trim()) return ElMessage.warning('请描述一下问题')
  if (!form.contact.trim()) return ElMessage.warning('请留下联系方式，方便我们确认')
  submitting.value = true
  try {
    const payload = {
      title: form.title.trim(),
      requirement: form.requirement.trim(),
      customer: form.customer.trim() || customerName.value,
      contact: form.contact.trim(),
      amount: form.amount || 0,
      attachments: [...form.attachments],
      channel: 'form',
      status: 'pending',
      priority: 'medium',
      byUserName: form.customer.trim() || customerName.value || '客户提交'
    }
    await customerHttp('/jiedan/order/intake', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify({ customer: form.customer.trim(), contact: form.contact.trim() })) } catch {}
    done.value = true
  } catch (e) {
    ElMessage.error('提交失败：' + e.message)
  } finally {
    submitting.value = false
  }
}

function reset() {
  Object.assign(form, blank())
  done.value = false
}

function doLogout() {
  customerLogout()
  router.push('/customer-login')
}
</script>

<style scoped>
.intake-page {
  min-height: 100vh;
  background: #f0f2f5;
  padding: 24px 16px 80px;
}
.intake-shell {
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
}
.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #303133;
}
.brand strong {
  display: block;
  font-size: 18px;
  line-height: 1.2;
}
.brand span {
  display: block;
  margin-top: 3px;
  font-size: 13px;
  color: #909399;
}
.account {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #606266;
  font-size: 14px;
  white-space: nowrap;
}
.intake-card {
  background: #fdfefe;
  border-radius: 8px;
  padding: 28px;
  box-shadow: 0 2px 16px rgba(0, 0, 0, 0.06);
}
.intro h1 {
  margin: 0;
  font-size: 22px;
  line-height: 1.35;
  color: #303133;
}
.intro p {
  margin: 8px 0 18px;
  color: #606266;
  font-size: 14px;
}
.templates {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 18px;
}
.template-btn {
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  background: #fdfefe;
  padding: 10px;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.template-btn:hover {
  border-color: #409eff;
  background: #ecf5ff;
}
.template-btn span {
  display: block;
  color: #303133;
  font-weight: 600;
  margin-bottom: 3px;
}
.template-btn em {
  display: block;
  color: #909399;
  font-size: 12px;
  font-style: normal;
}
.submit {
  width: 100%;
}
.done {
  text-align: center;
  padding: 34px 0;
}
.done h2 {
  margin: 14px 0 6px;
  font-size: 21px;
}
.done p {
  color: #606266;
  margin: 0 0 20px;
}
.done-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
}
.foot {
  color: #c0c4cc;
  font-size: 12px;
  text-align: center;
  margin-top: 18px;
}
@media (max-width: 640px) {
  .topbar {
    align-items: flex-start;
    flex-direction: column;
  }
  .intake-card {
    padding: 22px 18px;
  }
  .templates {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
