<template>
  <div class="intake-page">
    <div class="intake-card">
      <div class="brand">
        <el-icon :size="26" color="#409eff"><Histogram /></el-icon>
        <span>玄成科技 · 需求提交</span>
      </div>

      <template v-if="!done">
        <p class="sub">填一下你的需求，我们会尽快联系你。带图/文件会更准 👇</p>

        <el-form label-position="top" class="form">
          <el-form-item label="项目/需求标题" required>
            <el-input v-model="form.title" placeholder="例如：餐饮点餐小程序" />
          </el-form-item>
          <el-form-item label="需求描述" required>
            <el-input v-model="form.requirement" type="textarea" :rows="5" placeholder="尽量写清楚想做什么、有什么要求" />
          </el-form-item>
          <el-form-item label="参考图 / 文件（截图直接 Ctrl+V）">
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
                <el-input v-model="form.contact" placeholder="微信号 / 手机，方便联系你" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-form-item label="预算（选填）">
            <el-input-number v-model="form.amount" :min="0" :step="100" controls-position="right" style="width: 180px" />
          </el-form-item>

          <el-button type="primary" size="large" :loading="submitting" style="width: 100%" @click="submit">
            提交需求
          </el-button>
        </el-form>
      </template>

      <div v-else class="done">
        <el-icon :size="56" color="#67c23a"><CircleCheckFilled /></el-icon>
        <h3>提交成功！</h3>
        <p>我们已收到你的需求，会尽快联系你。</p>
        <el-button @click="reset">再提交一个</el-button>
      </div>
    </div>
    <p class="foot">玄成科技接单系统</p>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Histogram, CircleCheckFilled } from '@element-plus/icons-vue'
import AttachmentUploader from '@/components/AttachmentUploader.vue'

const blank = () => ({ title: '', requirement: '', customer: '', contact: '', amount: 0, attachments: [] })
const form = reactive(blank())
const submitting = ref(false)
const done = ref(false)

async function submit() {
  if (!form.title.trim()) return ElMessage.warning('请填写需求标题')
  if (!form.requirement.trim()) return ElMessage.warning('请描述一下需求')
  if (!form.contact.trim()) return ElMessage.warning('请留个联系方式，方便我们联系你')
  submitting.value = true
  try {
    const payload = {
      title: form.title.trim(),
      requirement: form.requirement.trim(),
      customer: form.customer.trim(),
      contact: form.contact.trim(),
      amount: form.amount || 0,
      attachments: [...form.attachments],
      channel: 'form',
      ownerId: 2,
      status: 'pending',
      priority: 'medium',
      byUserName: form.customer.trim() || '客户提交'
    }
    const res = await fetch('/jiedan/order/intake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const j = await res.json()
    if (j.code !== 200) throw new Error(j.msg || '提交失败')
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
</script>

<style scoped>
.intake-page {
  min-height: 100vh;
  background: #f0f2f5;
  padding: 24px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.intake-card {
  width: 100%;
  max-width: 620px;
  background: #fff;
  border-radius: 12px;
  padding: 28px 28px 32px;
  box-shadow: 0 2px 16px rgba(0, 0, 0, 0.06);
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 20px;
  font-weight: 700;
  color: #303133;
}
.sub {
  color: #909399;
  font-size: 14px;
  margin: 8px 0 20px;
}
.form {
  margin-top: 6px;
}
.done {
  text-align: center;
  padding: 30px 0;
}
.done h3 {
  margin: 14px 0 6px;
  font-size: 20px;
}
.done p {
  color: #909399;
  margin: 0 0 20px;
}
.foot {
  color: #c0c4cc;
  font-size: 12px;
  margin-top: 18px;
}
</style>
