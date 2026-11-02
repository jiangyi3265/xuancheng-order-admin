<template>
  <div class="staff">
    <div class="head">
      <div class="title">
        <h2>成员管理</h2>
        <span>下属管理员用自己的账号登录，只能看到负责人是自己的项目；你（总管理员）能看到全部项目，他们看不到你的项目</span>
      </div>
      <el-button type="primary" :icon="Plus" @click="openCreate">新建下属管理员</el-button>
    </div>

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
      <el-table-column label="角色" width="120" align="center">
        <template #default="{ row }">
          <el-tag :type="row.role === 'boss' ? 'primary' : 'info'" size="small">{{ row.roleLabel }}</el-tag>
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
      <el-table-column label="创建时间" prop="createTime" min-width="160" />
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
      停用或重置密码后，对方已登录的设备会立即下线。要换负责人：在「接单管理」里编辑项目，改“负责人”即可；
      要把客户转交给下属：在「客户账号」里点“转交”。名下还有项目或客户的成员不能删除，请先转派，或直接停用。
    </el-alert>

    <el-dialog v-model="createVisible" title="新建下属管理员" width="440px">
      <el-form ref="formRef" :model="createForm" :rules="rules" label-width="82px">
        <el-form-item label="登录账号" prop="userName">
          <el-input v-model="createForm.userName" placeholder="登录用，字母/数字/下划线" />
        </el-form-item>
        <el-form-item label="姓名" prop="nickName">
          <el-input v-model="createForm.nickName" placeholder="显示在项目负责人处，如 费鹏飞" />
        </el-form-item>
        <el-form-item label="初始密码" prop="password">
          <el-input v-model="createForm.password" placeholder="5-20 位" show-password />
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
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { MEMBERS } from '@/constants/options'
import { loadStaff, createStaff, resetStaffPwd, setStaffStatus, deleteStaff } from '@/mock/store'

const loading = ref(false)
const saving = ref(false)
const createVisible = ref(false)
const formRef = ref()
const createForm = reactive({ userName: '', nickName: '', password: '' })

const rules = {
  userName: [
    { required: true, message: '请填写登录账号', trigger: 'blur' },
    { pattern: /^[a-zA-Z0-9_]{2,20}$/, message: '2-20 位字母/数字/下划线', trigger: 'blur' }
  ],
  nickName: [{ required: true, message: '请填写姓名', trigger: 'blur' }],
  password: [
    { required: true, message: '请填写密码', trigger: 'blur' },
    { min: 5, max: 20, message: '5-20 位', trigger: 'blur' }
  ]
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
  createForm.password = ''
  createVisible.value = true
  formRef.value?.clearValidate()
}

function submitCreate() {
  formRef.value.validate(async (ok) => {
    if (!ok) return
    saving.value = true
    try {
      await createStaff({ ...createForm })
      ElMessage.success('下属管理员创建成功')
      createVisible.value = false
      load()
    } catch (e) {
      ElMessage.error(e.message || '创建失败')
    } finally {
      saving.value = false
    }
  })
}

async function doReset(row) {
  try {
    const { value } = await ElMessageBox.prompt(
      `为「${row.name}」设置新密码（5-20 位）。设置后对方已登录的设备会立即下线。`,
      '重置密码',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputPattern: /^.{5,20}$/,
        inputErrorMessage: '密码需为 5-20 位'
      }
    )
    await resetStaffPwd(row.id, value)
    ElMessage.success('密码已重置')
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
    ElMessage.success('已删除')
    load()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message || '删除失败')
  }
}

onMounted(load)
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
