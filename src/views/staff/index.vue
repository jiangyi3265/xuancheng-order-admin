<template>
  <div class="staff">
    <div class="head"><button class="mobile-only icon-button entity-back" aria-label="返回我的" @click="$router.push('/mine')"><el-icon><ArrowLeft/></el-icon></button>
      <div class="title">
        <h2>成员管理</h2>
        <span>使用各自的账号登录，按账号权限协作处理项目。</span>
      </div>
      <el-button type="primary" :icon="Plus" @click="openCreate">新增成员</el-button>
    </div>

    <section class="staff-summary mobile-only"><div><el-icon><User/></el-icon><span><b>{{ MEMBERS.length }}</b> 位成员</span></div><div><el-icon><Folder/></el-icon><span><b>{{ MEMBERS.reduce((n,m)=>n+Number(m.unfinishedCount||0),0) }}</b> 个未完成项目</span></div></section>
    <div class="entity-cards" v-loading="loading"><article v-for="row in MEMBERS" :key="row.id" class="entity-card"><div class="entity-card-head"><el-avatar :size="48">{{ row.name.slice(-1) }}</el-avatar><div><h3>{{ row.name }}</h3><p>{{ row.userName }}</p><p>负责 {{ row.orderCount || 0 }} 项 · 未完成 {{ row.unfinishedCount || 0 }} 项</p><p>企业微信：{{ wecomUsers[row.id] || '未填' }}</p></div><el-tag :type="row.status==='0'?'success':'warning'">{{ row.status==='0'?'正常':'已停用' }}</el-tag></div><div v-if="row.role!=='boss'" class="entity-actions"><el-button @click="selectedMember=row">管理</el-button></div><p v-else>此账号受保护</p></article></div>
    <el-dialog :model-value="!!selectedMember" title="成员设置与权限" @close="selectedMember=null"><template v-if="selectedMember"><div class="board-account-profile"><el-avatar :size="58">{{ selectedMember.name.slice(-1) }}</el-avatar><h2>{{ selectedMember.name }}</h2></div><el-form label-position="top"><el-form-item label="登录账号"><el-input :model-value="selectedMember.userName" readonly/></el-form-item><el-form-item label="企业微信账号（填了才能在微信里收到提醒）"><InlineEdit :model-value="wecomUsers[selectedMember.id] || ''" placeholder="未填，点击填写" :maxlength="64" :save="(v) => saveWecom(selectedMember, v)" /></el-form-item></el-form><div class="board-account-actions"><el-button @click="doToggle(selectedMember)">{{ selectedMember.status==='0'?'停用账号':'启用账号' }}</el-button><el-button @click="doReset(selectedMember)">重置密码</el-button></div><table class="permission-table"><thead><tr><th>功能权限</th><th>{{ selectedMember.name }}</th></tr></thead><tbody><tr><td>管理自己的项目 / 客户</td><td>允许</td></tr><tr><td>提交验收 / 报价申请</td><td>允许</td></tr><tr><td>审批 / 完成 / 删除项目</td><td>需审批</td></tr><tr><td>成员管理 / 全局统计</td><td>不可访问</td></tr></tbody></table><p class="muted">权限按账号配置。停用账号后，该成员将无法登录。</p></template><template #footer><el-button type="danger" plain @click="doDelete(selectedMember)">删除成员</el-button><el-button type="primary" @click="selectedMember=null">完成</el-button></template></el-dialog>
    <el-table :data="MEMBERS" v-loading="loading" border stripe>
      <el-table-column label="姓名" min-width="130">
        <template #default="{ row }">
          <el-avatar :size="24" :style="{ background: row.color, fontSize: '12px', marginRight: '8px' }">
            {{ row.name.slice(-1) }}
          </el-avatar>
          {{ row.name }}
        </template>
      </el-table-column>
      <el-table-column label="登录账号" prop="userName" min-width="120" />
      <el-table-column label="企业微信" min-width="150">
        <template #default="{ row }">
          <InlineEdit :model-value="wecomUsers[row.id] || ''" placeholder="未填，点击填写" :maxlength="64" :save="(v) => saveWecom(row, v)" />
        </template>
      </el-table-column>

      <el-table-column label="名下项目" width="150" align="center">
        <template #default="{ row }">
          <span>{{ row.orderCount || 0 }} 个</span>
          <el-tag v-if="Number(row.unfinishedCount) > 0" type="warning" size="small" effect="plain" style="margin-left:6px">
            {{ row.unfinishedCount }} 未完成
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="row.status === '0' ? 'success' : 'info'" size="small">
            {{ row.status === '0' ? '正常' : '已停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" min-width="150"><template #default="{ row }">{{ fmtTime(row.createTime) }}</template></el-table-column>
      <el-table-column label="操作" width="230" align="center" fixed="right">
        <template #default="{ row }">
          <template v-if="row.role !== 'boss'">
            <el-button link type="primary" @click="doReset(row)">重置密码</el-button>
            <el-button link :type="row.status === '0' ? 'warning' : 'success'" @click="doToggle(row)">
              {{ row.status === '0' ? '停用' : '启用' }}
            </el-button>
            <el-button link type="danger" @click="doDelete(row)">删除</el-button>
          </template>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
      <template #empty>
        <el-empty description="还没有成员" />
      </template>
    </el-table>

    
    <el-alert type="info" :closable="false" class="tip">
      停用或重置密码后，对方已登录的设备会立即下线。要换负责人：在项目卡片或详情里点负责人的名字，直接改派；
      要把客户转交给其他成员：在「客户账号」里点“转交”。名下还有项目或客户的成员不能删除，请先转派，或直接停用。
    </el-alert>

    <!-- 打开光标就在「登录账号」里，填完按回车就创建 -->
    <el-dialog v-model="createVisible" title="新增成员" width="440px" @opened="focusField(accountInput)">
      <el-form ref="formRef" :model="createForm" :rules="rules" label-width="82px" @submit.prevent>
        <el-form-item label="登录账号" prop="userName">
          <el-input ref="accountInput" v-model="createForm.userName" placeholder="登录用，字母/数字/下划线" @keydown.enter="enterCreate" />
        </el-form-item>
        <el-form-item label="姓名" prop="nickName">
          <el-input v-model="createForm.nickName" placeholder="显示在项目负责人处，如 费鹏飞" @keydown.enter="enterCreate" />
        </el-form-item>
        <el-form-item label="初始密码" prop="password">
          <!-- 先给一个随机密码，不用自己想；建好后会连同账号一起整理成一段话供复制 -->
          <el-input v-model="createForm.password" placeholder="5-20 位" @keydown.enter="enterCreate" />
        </el-form-item>
        <el-form-item label="企业微信" prop="wecom">
          <el-input v-model="createForm.wecom" placeholder="选填：通讯录里的「账号」，填了能收到微信提醒" clearable @keydown.enter="enterCreate" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitCreate">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
const selectedMember = ref(null)

import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { MEMBERS } from '@/constants/options'
import { loadStaff, createStaff, resetStaffPwd, setStaffStatus, deleteStaff, getPushConfig, savePushConfig } from '@/mock/store'
import { offerLoginInfo } from '@/utils/loginInfo'
import { suggestPassword } from '@/utils/password'
import { onEnter, focusField } from '@/utils/formKeys'
import { fmtTime } from '@/utils/time'
import InlineEdit from '@/components/InlineEdit.vue'

const loading = ref(false)
const saving = ref(false)
const createVisible = ref(false)
const formRef = ref()
const accountInput = ref(null)
const createForm = reactive({ userName: '', nickName: '', password: '', wecom: '' })

// 企业微信账号：以前要另外去「通知设置」里填，现在建成员时、成员列表里直接填（存的是同一项设置）
const WECOM_PREFIX = 'push.wecom.user.'
const wecomUsers = reactive({})
async function loadWecom() {
  try {
    const cfg = (await getPushConfig()) || {}
    for (const [k, v] of Object.entries(cfg)) {
      if (k.startsWith(WECOM_PREFIX)) wecomUsers[k.slice(WECOM_PREFIX.length)] = v || ''
    }
  } catch {
    // 读不到就先显示「未填」，不影响成员管理
  }
}
async function saveWecom(row, value) {
  const v = String(value || '').trim()
  await savePushConfig({ [WECOM_PREFIX + row.id]: v })
  wecomUsers[row.id] = v
}

const rules = {
  userName: [
    { required: true, message: '请填写登录账号', trigger: 'blur' },
    { pattern: /^[a-zA-Z0-9_]{2,20}$/, message: '2-20 位字母/数字/下划线', trigger: 'blur' }
  ],
  nickName: [{ required: true, message: '请填写姓名', trigger: 'blur' }],
  password: [
    { required: true, message: '请填写密码', trigger: 'blur' },
    { min: 5, max: 20, message: '5-20 位', trigger: 'blur' }
  ],
  wecom: [{ pattern: /^[A-Za-z0-9_.@-]{0,64}$/, message: '企业微信账号只能是字母、数字和 _ . @ -', trigger: 'blur' }]
}

async function load() {
  loading.value = true
  try {
    await loadStaff()
  } catch (e) {
    ElMessage.error(e.message || '加载失败')
  } finally {
    loading.value = false
  }
}

function openCreate() {
  createForm.userName = ''
  createForm.nickName = ''
  createForm.password = suggestPassword()
  createForm.wecom = ''
  createVisible.value = true
  formRef.value?.clearValidate()
}

function submitCreate() {
  if (saving.value) return
  formRef.value.validate(async (ok) => {
    if (!ok || saving.value) return
    saving.value = true
    try {
      const info = { name: createForm.nickName.trim(), userName: createForm.userName.trim(), password: createForm.password }
      const wecom = createForm.wecom.trim()
      await createStaff({ userName: createForm.userName, nickName: createForm.nickName, password: createForm.password })
      createVisible.value = false
      await load()
      // 填了企业微信就顺手存上（建成员的接口不回新 id，按登录账号在刚刷新的名单里找）
      let hint = '还没填 TA 的企业微信账号，可以在成员列表里补上，填了 TA 才能在微信里收到提醒。'
      if (wecom) {
        const m = MEMBERS.find((x) => x.userName === info.userName)
        try {
          if (!m) throw new Error('没找到刚建的成员')
          await saveWecom(m, wecom)
          hint = ''
        } catch (e) {
          hint = '企业微信账号没存上（' + (e.message || '请稍后重试') + '），可以在成员列表里再填一次。'
        }
      }
      // 顺手把登录信息整理好发给同事
      offerLoginInfo({ ...info, who: 'staff', hint })
    } catch (e) {
      ElMessage.error(e.message || '创建失败')
    } finally {
      saving.value = false
    }
  })
}

const enterCreate = onEnter(submitCreate)

async function doReset(row) {
  try {
    const { value } = await ElMessageBox.prompt(
      `为「${row.name}」设置新密码（5-20 位）。设置后对方已登录的设备会立即下线。`,
      '重置密码',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputValue: suggestPassword(),
        inputPattern: /^.{5,20}$/,
        inputErrorMessage: '密码需为 5-20 位'
      }
    )
    await resetStaffPwd(row.id, value)
    offerLoginInfo({ name: row.name, userName: row.userName, password: value, who: 'staff', reset: true })
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message || '操作失败')
  }
}

async function doToggle(row) {
  const stopping = row.status === '0'
  try {
    await ElMessageBox.confirm(
      stopping
        ? `停用后「${row.name}」立即下线且无法登录，名下项目保持不变。确定停用？`
        : `确定重新启用「${row.name}」？`,
      stopping ? '停用账号' : '启用账号',
      { type: 'warning', confirmButtonText: '确定', cancelButtonText: '取消' }
    )
    await setStaffStatus(row.id, stopping ? '1' : '0')
    row.status=stopping ? '1' : '0'
    ElMessage.success(stopping ? '已停用' : '已启用')
    load()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message || '操作失败')
  }
}

async function doDelete(row) {
  try {
    await ElMessageBox.confirm(`确定删除「${row.name}」的账号？删除后无法恢复。`, '删除账号', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    })
    await deleteStaff(row.id)
    selectedMember.value=null
    ElMessage.success('已删除')
    load()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message || '删除失败')
  }
}

onMounted(() => {
  load()
  loadWecom()
})
</script>

<style scoped>
.staff {
  padding: 16px;
}
.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 16px;
  gap: 16px;
}
.title h2 {
  margin: 0 0 4px;
  font-size: 20px;
  color: #303133;
}
.title span {
  font-size: 13px;
  color: #909399;
}
.tip {
  margin-top: 16px;
  line-height: 1.7;
}
.muted {
  color: #c0c4cc;
}
</style>
