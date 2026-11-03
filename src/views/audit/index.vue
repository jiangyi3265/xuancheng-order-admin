<template>
  <div class="audit">
    <div class="head">
      <div class="title">
        <h2>操作日志</h2>
        <span>谁在什么时候做了什么：删除、改金额、转派、账号管理、导出等重要操作都会留痕，仅总管理员可见，记录不可修改。</span>
      </div>
      <el-button :icon="Refresh" :loading="loading" @click="load">刷新</el-button>
    </div>

    <div class="filters">
      <el-select v-model="filter.action" placeholder="操作类型" clearable style="width: 150px" @change="search">
        <el-option v-for="a in AUDIT_ACTIONS" :key="a.value" :label="a.label" :value="a.value" />
      </el-select>
      <el-select v-model="filter.actorId" placeholder="操作人" clearable style="width: 130px" @change="search">
        <el-option v-for="m in MEMBERS" :key="m.id" :label="m.name" :value="m.id" />
      </el-select>
      <el-date-picker
        v-model="range"
        type="daterange"
        value-format="YYYY-MM-DD"
        range-separator="至"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        style="width: 250px"
        @change="search"
      />
      <el-input
        v-model="filter.keyword"
        placeholder="项目名 / 账号 / 操作人 / 内容"
        :prefix-icon="Search"
        clearable
        style="width: 240px"
        @keyup.enter="search"
        @clear="search"
      />
      <el-button type="primary" @click="search">查询</el-button>
    </div>

    <el-table :data="rows" v-loading="loading" border stripe>
      <el-table-column prop="createTime" label="时间" width="165" />
      <el-table-column label="操作人" width="150">
        <template #default="{ row }">
          <span class="who">{{ row.actorName || '—' }}</span>
          <el-tag size="small" effect="plain" :type="row.actorRole === 'customer' ? 'warning' : 'info'" class="role">
            {{ AUDIT_ROLE_LABEL[row.actorRole] || row.actorRole }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="130">
        <template #default="{ row }">
          <el-tag size="small" :type="auditActionMap[row.action]?.type || 'info'" effect="light">
            {{ auditActionMap[row.action]?.label || row.action }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="对象" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">{{ row.targetName || '—' }}</template>
      </el-table-column>
      <el-table-column label="详情" min-width="320">
        <template #default="{ row }">{{ row.detail }}</template>
      </el-table-column>
      <el-table-column prop="ip" label="IP" width="130" />
      <template #empty>
        <el-empty description="没有符合条件的记录" />
      </template>
    </el-table>

    <div class="pager">
      <el-pagination
        v-model:current-page="pageNum"
        v-model:page-size="pageSize"
        :page-sizes="[20, 50, 100]"
        :total="total"
        layout="total, sizes, prev, pager, next"
        background
        @current-change="load"
        @size-change="search"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh, Search } from '@element-plus/icons-vue'
import { listAudit } from '@/mock/store'
import { MEMBERS, AUDIT_ACTIONS, AUDIT_ROLE_LABEL, auditActionMap } from '@/constants/options'

const rows = ref([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(20)
const loading = ref(false)
const range = ref(null)
const filter = reactive({ action: '', actorId: '', keyword: '' })

async function load() {
  loading.value = true
  try {
    const data = await listAudit({
      pageNum: pageNum.value,
      pageSize: pageSize.value,
      action: filter.action,
      actorId: filter.actorId,
      keyword: filter.keyword.trim(),
      beginTime: range.value?.[0] || '',
      endTime: range.value?.[1] || ''
    })
    rows.value = data?.rows || []
    total.value = Number(data?.total || 0)
  } catch (e) {
    ElMessage.error(e.message || '加载失败')
  } finally {
    loading.value = false
  }
}

function search() {
  pageNum.value = 1
  load()
}

onMounted(load)
</script>

<style scoped>
.audit {
  padding: 16px;
}
.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 14px;
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
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}
.who {
  margin-right: 6px;
}
.role {
  vertical-align: 1px;
}
.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}
</style>
