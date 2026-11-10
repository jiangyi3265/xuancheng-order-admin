<template>
  <div class="trash">
    <div class="head"><button class="mobile-only icon-button entity-back" aria-label="返回我的" @click="$router.push('/mine')"><el-icon><ArrowLeft/></el-icon></button>
      <div class="title">
        <h2>回收站</h2>
        <span>
          删除的项目会先放在这里，聊天记录、问题、记事本都还在，可以随时恢复。
          {{ isBoss ? '你可以恢复，也可以彻底删除（彻底删除后无法找回）。' : '只显示负责人是你的项目。' }}
        </span>
      </div>
      <el-button :icon="Refresh" :loading="loading" @click="load">刷新</el-button>
    </div>

    <div class="entity-cards" v-loading="loading"><article v-for="row in rows" :key="row.id" class="entity-card"><div class="entity-card-head"><ProjectCover :order="row" compact/><div><h3>{{ row.title }}</h3><p>删除时间：{{ fmtTime(row.deleteTime) }}</p><p>负责人：{{ memberMap[row.ownerId]?.name || '账号已删除' }}</p></div><el-tag :type="statusMap[row.status]?.type">{{ statusMap[row.status]?.label }}</el-tag></div><div class="entity-actions"><el-button type="primary" plain @click="doRestore(row)">恢复</el-button><el-button v-if="isBoss" type="danger" plain @click="doPurge(row)">彻底删除</el-button></div></article><el-empty v-if="!rows.length&&!loading" description="回收站是空的"/></div>
    <el-table :data="rows" v-loading="loading" border stripe>
      <el-table-column prop="orderNo" label="编号" width="130" />
      <el-table-column label="项目名" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">{{ row.title }}</template>
      </el-table-column>
      <el-table-column label="客户" min-width="110" show-overflow-tooltip>
        <template #default="{ row }">{{ row.customer || '—' }}</template>
      </el-table-column>
      <el-table-column label="负责人" width="100">
        <template #default="{ row }">{{ memberMap[row.ownerId]?.name || '（账号已删除）' }}</template>
      </el-table-column>
      <el-table-column label="删除前状态" width="100">
        <template #default="{ row }">
          <el-tag size="small" :type="statusMap[row.status]?.type" effect="light">
            {{ statusMap[row.status]?.label || row.status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="金额" width="100">
        <template #default="{ row }">{{ money(row.amount) }}</template>
      </el-table-column>
      <el-table-column label="删除人" width="130" show-overflow-tooltip>
        <template #default="{ row }">
          <el-tag v-if="isByCustomer(row)" size="small" type="warning" effect="plain">客户撤回</el-tag>
          <span v-else>{{ row.deleteBy || '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="删除时间" width="150"><template #default="{ row }">{{ fmtTime(row.deleteTime) }}</template></el-table-column>
      <el-table-column label="操作" width="170" align="center" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="doRestore(row)">恢复</el-button>
          <el-button v-if="isBoss" link type="danger" @click="doPurge(row)">彻底删除</el-button>
        </template>
      </el-table-column>
      <template #empty>
        <el-empty description="回收站是空的" />
      </template>
    </el-table>
  </div>
</template>

<script setup>
import { money } from '@/utils/payment'
import ProjectCover from '@/components/ProjectCover.vue'
import { ref, onMounted } from 'vue'
import { ElMessageBox } from 'element-plus'
import { toast as ElMessage } from '@/utils/toast'
import { Refresh } from '@element-plus/icons-vue'
import { isBoss, listTrash, restoreOrder, purgeOrder } from '@/mock/store'
import { fmtTime } from '@/utils/time'
import { memberMap, statusMap } from '@/constants/options'

const rows = ref([])
const loading = ref(false)

// 客户自己撤回的，删除人字段是“客户：xxx”
const isByCustomer = (row) => String(row.deleteBy || '').startsWith('客户')

async function load() {
  loading.value = true
  try {
    rows.value = (await listTrash()) || []
  } catch (e) {
    ElMessage.error(e.message || '加载失败')
  } finally {
    loading.value = false
  }
}

async function doRestore(row) {
  try {
    await ElMessageBox.confirm(`恢复「${row.title}」？恢复后它会回到「项目管理」里。`, '恢复项目', {
      confirmButtonText: '恢复',
      cancelButtonText: '取消'
    })
    await restoreOrder(row.id)
    ElMessage.success('已恢复')
    load()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message || '恢复失败')
  }
}

async function doPurge(row) {
  try {
    await ElMessageBox.confirm(
      `彻底删除「${row.title}」？它的聊天记录、问题、记事本会一起永久删除，无法恢复。`,
      '彻底删除',
      { type: 'warning', confirmButtonText: '彻底删除', cancelButtonText: '取消', confirmButtonClass: 'el-button--danger' }
    )
    await purgeOrder(row.id)
    ElMessage.success('已彻底删除')
    load()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message || '删除失败')
  }
}

onMounted(load)
</script>

<style scoped>
.trash {
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
  line-height: 1.6;
}
</style>
