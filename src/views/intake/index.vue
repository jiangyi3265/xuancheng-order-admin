<template>
  <div class="intake-page">
    <div class="intake-shell">
      <header class="topbar">
        <div class="brand">
          <el-icon :size="26" color="#409eff"><Histogram /></el-icon>
          <div>
            <strong>玄成科技需求提交</strong>
            <span>登录后提交项目资料</span>
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
            <h1>把需求、资料、联系方式一次说清楚</h1>
            <p>提交后会自动进入接单系统，我们会在后台分配负责人并跟进。</p>
          </div>

          <el-form label-position="top" class="form">
            <el-form-item label="项目 / 需求标题" required>
              <el-input v-model="form.title" placeholder="例如：餐饮门店点餐小程序" />
            </el-form-item>
            <el-form-item label="需求描述" required>
              <el-input
                v-model="form.requirement"
                type="textarea"
                :rows="5"
                placeholder="尽量写清楚想做什么、已有资料、交付时间、参考链接等"
              />
            </el-form-item>
            <el-form-item label="参考图 / 文件">
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
          <el-icon :size="56" color="#67c23a"><CircleCheckFilled /></el-icon>
          <h2>提交成功</h2>
          <p>我们已收到你的需求，会尽快联系你确认细节。</p>
          <el-button type="primary" @click="reset">继续提交</el-button>
        </div>
      </section>

      <p class="foot">玄成科技接单系统</p>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Histogram, CircleCheckFilled } from '@element-plus/icons-vue'
import AttachmentUploader from '@/components/AttachmentUploader.vue'
import { customerHttp, customerLogout, customerName } from '@/mock/store'

const router = useRouter()
const blank = () => ({ title: '', requirement: '', customer: '', contact: '', amount: 0, attachments: [] })
const form = reactive(blank())
const submitting = ref(false)
const done = ref(false)

async function submit() {
  if (!form.title.trim()) return ElMessage.warning('请填写需求标题')
  if (!form.requirement.trim()) return ElMessage.warning('请描述一下需求')
  if (!form.contact.trim()) return ElMessage.warning('请留下联系方式，方便我们联系你')
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
      ownerId: 2,
      status: 'pending',
      priority: 'medium',
      byUserName: form.customer.trim() || customerName.value || '客户提交'
    }
    await customerHttp('/jiedan/order/intake', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
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
  padding: 24px 16px;
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
  margin: 8px 0 22px;
  color: #606266;
  font-size: 14px;
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
}
</style>
