<template>
  <div class="customers">
    <div class="head">
      <div class="title">
        <h2>客户账号</h2>
        <span>为客户创建登录账号并绑定项目；项目完成后可删除账号（会自动解绑其项目）</span>
      </div>
      <el-button type="primary" :icon="Plus" @click="openCreate">新建客户账号</el-button>
    </div>

    <el-table :data="list" v-loading="loading" border stripe>
      <el-table-column label="账号" prop="userName" min-width="130" />
      <el-table-column label="昵称" prop="nickName" min-width="130" />
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
      <el-table-column label="创建时间" prop="createTime" min-width="160" />
      <el-table-column label="操作" width="200" align="center" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="doReset(row)">重置密码</el-button>
          <el-button link type="danger" @click="doDelete(row)">删除</el-button>
        </template>
      </el-table-column>
      <template #empty>
        <el-empty description="还没有客户账号" />
      </template>
    </el-table>

    <!-- 新建账号 -->
    <el-dialog v-model="createVisible" title="新建客户账号" width="440px">
      <el-form ref="formRef" :model="createForm" :rules="rules" label-width="72px">
        <el-form-item label="账号" prop="userName">
          <el-input v-model="createForm.userName" placeholder="客户登录用，字母/数字" />
        </el-form-item>
        <el-form-item label="昵称" prop="nickName">
          <el-input v-model="createForm.nickName" placeholder="选填，如公司/称呼" />
        </el-form-item>
        <el-form-item label="密码" prop="password">
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
import { listCustomers, createCustomer, resetCustomerPwd, deleteCustomer } from '@/mock/store'

const list = ref([])
const loading = ref(false)
const saving = ref(false)
const createVisible = ref(false)
const formRef = ref()
const createForm = reactive({ userName: '', nickName: '', password: '' })

const rules = {
  userName: [
    { required: true, message: '请填写账号', trigger: 'blur' },
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
  createForm.password = ''
  createVisible.value = true
  formRef.value?.clearValidate()
}

function submitCreate() {
  formRef.value.validate(async (ok) => {
    if (!ok) return
    saving.value = true
    try {
      await createCustomer({ ...createForm })
      ElMessage.success('客户账号创建成功')
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
    const { value } = await ElMessageBox.prompt(`为「${row.userName}」设置新密码（5-20 位）`, '重置密码', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      inputPattern: /^.{5,20}$/,
      inputErrorMessage: '密码需为 5-20 位'
    })
    await resetCustomerPwd(row.userId, value)
    ElMessage.success('密码已重置')
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
</style>
