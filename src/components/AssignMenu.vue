<template>
  <el-dropdown v-if="enabled" trigger="click" max-height="320" @command="assign">
    <span class="assign-trigger" @click.stop>
      <slot><el-button size="small" :icon="User">派给</el-button></slot>
    </span>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item v-for="p in people" :key="p.m.id" :command="p.m.id">
          <el-avatar :size="20" :style="{ background: p.m.color, fontSize: '11px', marginRight: '8px' }">
            {{ p.m.name.slice(-1) }}
          </el-avatar>
          <span class="n">{{ p.m.id === me.id ? '我自己' : p.m.name }}</span>
          <span class="c">手上 {{ p.active }} 单</span>
        </el-dropdown-item>
        <el-dropdown-item v-if="!people.length" disabled>没有可以派的人</el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
  <!-- 不能派的时候（员工 / 已完成 / 只有一个人）：plain 表示原样显示里面的内容，不带菜单 -->
  <template v-else-if="plain"><slot /></template>
</template>

<script setup>
// 一步派单：老板在卡片 / 列表上直接点人，立刻转给 TA，对方马上收到通知。员工不能转派，所以不显示。
import { computed } from 'vue'
import { ElMessage } from 'element-plus'
import { User } from '@element-plus/icons-vue'
import { orders, editOrder, isBoss, currentMember as me } from '@/mock/store'
import { MEMBERS, memberMap } from '@/constants/options'

const props = defineProps({
  order: { type: Object, required: true },
  plain: { type: Boolean, default: false }
})

const enabled = computed(() => isBoss.value && MEMBERS.length > 1 && !['done', 'cancelled'].includes(props.order.status))

// 手上有几单（没做完的），派之前一眼看出谁忙谁闲
const people = computed(() =>
  MEMBERS.filter((m) => m.status === '0' && m.id !== props.order.ownerId).map((m) => ({
    m,
    active: orders.filter((o) => o.ownerId === m.id && !['done', 'cancelled'].includes(o.status)).length
  }))
)

async function assign(id) {
  try {
    await editOrder({ id: props.order.id, ownerId: id })
    const name = memberMap[id]?.name || ''
    ElMessage.success(id === me.value.id ? '已转到你自己名下' : `已派给 ${name}，TA 会收到通知`)
  } catch (e) {
    ElMessage.error(e.message || '派单失败')
  }
}
</script>

<style scoped>
.assign-trigger {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
}
.n {
  min-width: 56px;
}
.c {
  margin-left: 10px;
  font-size: 12px;
  color: #909399;
}
</style>
