<template>
  <div class="customers">
    <div class="head"><button class="mobile-only icon-button entity-back" aria-label="返回我的" @click="$router.push('/mine')"><el-icon><ArrowLeft/></el-icon></button>
      <div class="title">
        <h2>客户账号</h2>
        <span>为客户创建登录账号并绑定项目；项目完成后可删除账号（会自动解绑其项目）</span>
      </div>
      <div class="account-actions">
        <el-button @click="batchVisible=true">批量创建</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">新建客户账号</el-button>
      </div>
    </div>

    <el-input v-model="keyword" class="entity-search" placeholder="搜索客户名称或登录账号" clearable prefix-icon="Search" />
    <div class="entity-cards" v-loading="loading"><article v-for="row in filtered" :key="row.userId" class="entity-card"><div class="entity-card-head"><el-avatar :size="46">{{ (row.nickName || row.userName).slice(-1) }}</el-avatar><div><h3>{{ row.nickName || row.userName }}</h3><p>账号：{{ row.userName }}</p><p>负责人：{{ row.ownerName || currentMember.name }} · {{ row.projectCount || 0 }} 个项目</p></div><el-tag :type="row.status==='0'?'success':'info'">{{ row.status==='0'?'正常':'停用' }}</el-tag></div><div class="entity-actions"><el-button @click="selectedCustomer=row">编辑</el-button><el-button @click="doReset(row)">重置密码</el-button></div></article><el-empty v-if="!filtered.length && !loading" :description="keyword ? '没找到匹配的客户' : '还没有客户账号'"><el-button v-if="keyword" @click="keyword=''">清空搜索</el-button><el-button v-else type="primary" plain @click="openCreate">新建客户账号</el-button></el-empty></div>
    <el-table :data="filtered" v-loading="loading" border stripe>
      <el-table-column label="账号" prop="userName" min-width="130" />
      <el-table-column label="昵称" prop="nickName" min-width="130" />
      <el-table-column v-if="isBoss" label="负责人" min-width="120">
        <template #default="{ row }">{{ row.ownerName || '—' }}</template>
      </el-table-column>
      <el-table-column label="名下项目" width="140" align="center">
        <template #default="{ row }">
          <span>{{ row.projectCount || 0 }} 个</span>
          <el-tag v-if="Number(row.unfinishedCount) > 0" type="warning" size="small" effect="plain" style="margin-left:6px">
            {{ row.unfinishedCount }} 未完成
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="row.status === '0' ? 'success' : 'info'" size="small">
            {{ row.status === '0' ? '正常' : '停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" min-width="150"><template #default="{ row }">{{ fmtTime(row.createTime) }}</template></el-table-column>
      <el-table-column label="操作" :width="isBoss ? 260 : 200" align="center" fixed="right">
        <template #default="{ row }">
          <el-button v-if="isBoss" link type="primary" @click="openTransfer(row)">转交</el-button>
          <el-button link type="primary" @click="doReset(row)">重置密码</el-button>
          <el-button link type="danger" @click="doDelete(row)">删除</el-button>
        </template>
      </el-table-column>
      <template #empty>
        <el-empty v-if="!filtered.length && !loading" :description="keyword ? '没找到匹配的客户' : '还没有客户账号'"><el-button v-if="keyword" @click="keyword=''">清空搜索</el-button><el-button v-else type="primary" plain @click="openCreate">新建客户账号</el-button></el-empty>
      </template>
    </el-table>

    <el-dialog :model-value="!!selectedCustomer" title="客户信息" @close="selectedCustomer=null"><template v-if="selectedCustomer"><div class="board-account-profile"><el-avatar :size="58">{{ (selectedCustomer.nickName||selectedCustomer.userName).slice(-1) }}</el-avatar><h2>{{ selectedCustomer.nickName || selectedCustomer.userName }}</h2><p>客户账号</p></div><el-form label-position="top"><el-form-item label="登录账号"><el-input :model-value="selectedCustomer.userName" readonly/></el-form-item><el-form-item label="客户名称"><el-input :model-value="selectedCustomer.nickName" readonly/></el-form-item><el-form-item label="所属负责人"><el-input :model-value="selectedCustomer.ownerName || currentMember.name" readonly/></el-form-item></el-form><p class="muted">转交负责人仅影响后续提交的需求，现有项目负责人保持不变。</p><div class="board-account-actions"><el-button v-if="isBoss" @click="openTransfer(selectedCustomer)">转交负责人</el-button><el-button @click="doReset(selectedCustomer)">重置密码</el-button><el-button type="danger" plain @click="doDelete(selectedCustomer)">删除客户账号</el-button></div></template><template #footer><el-button type="primary" @click="selectedCustomer=null">完成</el-button></template></el-dialog>
    <CustomerBatchDialog v-model:visible="batchVisible" @created="load" />
    <!-- 新建账号 -->
    <!-- 打开光标就在「账号」里，填完按回车就创建 -->
    <el-dialog v-model="createVisible" :before-close="closeCreate" :close-on-click-modal="false" title="新建客户账号" width="440px" @opened="focusField(accountInput)">
      <el-form ref="formRef" :model="createForm" :rules="rules" label-width="72px" @submit.prevent>
        <el-form-item label="账号" prop="userName">
          <el-input ref="accountInput" v-model="createForm.userName" placeholder="留空自动生成 · 客户登录用，字母/数字" @keydown.enter="enterCreate" />
        </el-form-item>
        <el-form-item label="昵称" prop="nickName">
          <el-input v-model="createForm.nickName" placeholder="选填，如公司/称呼" @keydown.enter="enterCreate" />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input v-model="createForm.password" placeholder="5-20 位" @keydown.enter="enterCreate" />
        </el-form-item>
        <el-form-item v-if="isBoss" label="负责人">
          <el-select v-model="createForm.ownerId" style="width: 100%">
            <el-option v-for="m in assignable" :key="m.id" :label="m.name" :value="m.id" />
          </el-select>
          <div class="field-hint">该客户提交的需求会自动归这位负责人负责</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="closeCreate()">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitCreate">创建</el-button>
      </template>
    </el-dialog>

    <!-- 转交客户（仅总管理员） -->
    <el-dialog v-model="transferVisible" :before-close="closeTransfer" :close-on-click-modal="false" title="转交客户" width="420px">
      <p class="transfer-tip">
        把「{{ transferRow?.userName }}」转交给：
      </p>
      <el-select v-model="transferOwnerId" style="width: 100%">
        <el-option v-for="m in assignable" :key="m.id" :label="m.name" :value="m.id" />
      </el-select>
      <div class="field-hint">只影响之后提交的新需求；已有项目的负责人不变，需要的话在项目里点负责人名字改派。</div>
      <template #footer>
        <el-button @click="closeTransfer()">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitTransfer">确定转交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { useFormClose } from '@/utils/dialogGuard'
import CustomerBatchDialog from './CustomerBatchDialog.vue'
const selectedCustomer = ref(null)
const batchVisible = ref(false)

import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessageBox } from 'element-plus'
import { toast as ElMessage } from '@/utils/toast'
import { Plus } from '@element-plus/icons-vue'
import { MEMBERS } from '@/constants/options'
import {
  listCustomers, createCustomer, resetCustomerPwd, deleteCustomer, setCustomerOwner,
  isBoss, currentMember
} from '@/mock/store'
import { offerLoginInfo } from '@/utils/loginInfo'
import { suggestPassword } from '@/utils/password'
import { onEnter, focusField } from '@/utils/formKeys'
import { fmtTime } from '@/utils/time'

const list = ref([])
const keyword = ref('')
const filtered = computed(()=>list.value.filter(r=>[r.userName,r.nickName,r.ownerName].some(v=>String(v||'').toLowerCase().includes(keyword.value.toLowerCase()))))
const loading = ref(false)
const saving = ref(false)
const createVisible = ref(false)
const formRef = ref()
const accountInput = ref(null)
const createForm = reactive({ userName: '', nickName: '', password: '', ownerId: null })
let initialForm = ''
const closeCreate = useFormClose({
  visible: () => createVisible.value, close: () => { createVisible.value = false },
  isDirty: () => JSON.stringify(createForm) !== initialForm, isBusy: () => saving.value
})

// 可以当客户负责人的人：总管理员自己 + 未停用的下属
const assignable = computed(() => MEMBERS.filter((m) => m.status === '0'))

const transferVisible = ref(false)
const transferRow = ref(null)
const transferOwnerId = ref(null)

const closeTransfer = useFormClose({
  visible: () => transferVisible.value, close: () => { transferVisible.value = false },
  isDirty: () => transferOwnerId.value !== transferRow.value?.ownerId, isBusy: () => saving.value
})
const rules = {
  userName: [
    { pattern: /^[a-zA-Z0-9_]{2,20}$/, message: '2-20 位字母/数字/下划线', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请填写密码', trigger: 'blur' },
    { min: 5, max: 20, message: '5-20 位', trigger: 'blur' }
  ]
}

async function load() {
  loading.value = true
  try {
    list.value = (await listCustomers()) || []
  } catch (e) {
    ElMessage.error(e.message || '加载失败')
  } finally {
    loading.value = false
  }
}

function openCreate() {
  createForm.userName = ''
  createForm.nickName = ''
  createForm.password = '123456'
  createForm.ownerId = currentMember.value.id
  initialForm = JSON.stringify(createForm)
  createVisible.value = true
  formRef.value?.clearValidate()
}

function openTransfer(row) {
  transferRow.value = row
  transferOwnerId.value = row.ownerId
  transferVisible.value = true
}

async function submitTransfer() {
  if (!transferOwnerId.value) return
  saving.value = true
  try {
    await setCustomerOwner(transferRow.value.userId, transferOwnerId.value)
    ElMessage.success('已转交')
    transferVisible.value = false
    selectedCustomer.value = null
    load()
  } catch (e) {
    ElMessage.error(e.message || '转交失败')
  } finally {
    saving.value = false
  }
}

function submitCreate() {
  if (saving.value) return
  formRef.value.validate(async (ok) => {
    if (!ok || saving.value) return
    saving.value = true
    try {
      const info = { name: createForm.nickName.trim(), userName: createForm.userName.trim(), password: createForm.password }
      const account = await createCustomer({ ...createForm, autoUsername: !info.userName, ownerId: isBoss.value ? createForm.ownerId : undefined })
      createVisible.value = false
      load()
      // 建好就把「地址 + 账号 + 密码」整理成一段话，一键复制发给客户
      offerLoginInfo({ ...info, userName: account?.userName || info.userName, who: 'customer' })
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
    const { value } = await ElMessageBox.prompt(`为「${row.userName}」设置新密码（5-20 位）`, '重置密码', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      inputValue: suggestPassword(),
      inputPattern: /^.{5,20}$/,
      inputErrorMessage: '密码需为 5-20 位'
    })
    await resetCustomerPwd(row.userId, value)
    offerLoginInfo({ name: row.nickName, userName: row.userName, password: value, who: 'customer', reset: true })
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message || '操作失败')
  }
}

async function doDelete(row) {
  const warn =
    Number(row.unfinishedCount) > 0
      ? `该账号还有 ${row.unfinishedCount} 个未完成项目，删除后这些项目将解除绑定，客户将无法登录查看。确定删除？`
      : `确定删除账号「${row.userName}」？其名下项目将解除绑定。`
  try {
    await ElMessageBox.confirm(warn, '删除客户账号', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    })
    await deleteCustomer(row.userId)
    selectedCustomer.value=null
    ElMessage.success('已删除')
    load()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message || '删除失败')
  }
}

onMounted(load)
</script>

<style scoped>
.customers {
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
.account-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.account-actions .el-button { margin: 0; }
.field-hint {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.5;
  color: #909399;
}
.transfer-tip {
  margin: 0 0 10px;
  color: #606266;
}
</style>
