<template>
  <!-- 整张卡片点开详情；底部一行放“下一步”按钮，不用点进详情也能接单 / 开工 / 交付 -->
  <div class="board-project-row" :class="{overdue}" role="button" tabindex="0" @click="emit('open')" @keydown.enter.self="emit('open')">
    <ProjectCover :order="order" :inert="selecting" compact/>
    <div class="board-project-copy"><h3><i v-if="unread" class="unread-dot"/>{{ order.title }}</h3><div class="board-project-meta"><strong v-if="!overdue && Number(order.amount)">¥{{ Number(order.amount).toLocaleString() }}</strong><span v-else-if="!overdue" class="board-project-unpriced">未报价</span><el-tag v-if="overdue" size="small" type="danger">逾期</el-tag><el-tag v-else size="small" :class="'project-status-'+order.status" :type="statusMap[order.status]?.type">{{ statusMap[order.status]?.label }}</el-tag><el-tag v-if="order.priority==='high'" size="small" type="danger">高</el-tag></div><small v-if="order.deadline || ownerName || stalled"><template v-if="order.deadline"><el-icon><Calendar/></el-icon>截止：{{ shortDeadline(order.deadline) }}</template><template v-if="ownerName">{{ order.deadline ? ' · ' : '' }}{{ ownerName }}</template><b v-if="stalled" class="board-project-stalled">{{ order.deadline || ownerName ? ' · ' : '' }}{{ stalled }} 天没动静</b></small>
      <ProjectUrgency :order="order" :selecting="selecting" />
      <p v-if="order.nextStep" class="board-project-next" :class="nextDueState(order)">下一步：{{ order.nextStep }}<em> · {{ nextWho }}{{ order.nextDue ? ' · ' + shortDue(order.nextDue) : '' }}</em></p>
      <div v-if="action || $slots.tools" class="board-project-quick" @click.stop>
        <slot name="tools"/>
        <el-button v-if="action" size="small" type="primary" :loading="busy" :aria-label="action.label+'：'+order.title" @click="emit('action')">{{ action.label }}</el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Calendar } from '@element-plus/icons-vue'
import ProjectUrgency from './ProjectUrgency.vue'
import ProjectCover from '@/components/ProjectCover.vue'
import { isBoss, currentMember, collab } from '@/mock/store'
import { nextDueState, shortDue, stalledDays } from '@/utils/workbench'
import { MEMBERS, statusMap, memberMap } from '@/constants/options'

// 这里只管显示：逾期 / 未读 / 下一步按钮，都由 order/index.vue 算好传进来，规则只有一份
const props = defineProps({
  order: { type: Object, required: true },
  selecting: Boolean,
  overdue: { type: Boolean, default: false },
  unread: { type: Boolean, default: false },
  // 下一步动作 { label }，没有就不显示按钮
  action: { type: Object, default: null },
  busy: { type: Boolean, default: false }
})
// open 打开详情；action 点了下一步按钮
const emit = defineEmits(['open', 'action'])
const shortDeadline = value => value ? value.slice(5).replace('-', '月') + '日' : '未设置'
// 老板看列表时顺带显示负责人，一眼知道单子在谁手上
const ownerName = computed(() => (isBoss.value && MEMBERS.length > 1 ? memberMap[props.order.ownerId]?.name || '' : ''))
const nextWho = computed(() => (props.order.nextOwnerId === currentMember.value.id ? '我' : props.order.nextOwnerName || memberMap[props.order.nextOwnerId]?.name || '负责人'))
const stalled = computed(() => stalledDays(props.order, collab.stallDays))
</script>

<style scoped>
.board-project-unpriced { color: #a8b3c4; font-size: 13px; }
.board-project-row:focus-visible { outline: 3px solid #83adff; outline-offset: 2px; }
.board-project-quick {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 10px;
  min-height: 28px;
}
.board-project-quick .el-button + .el-button { margin-left: 0; }
.board-project-stalled { color: #c27c0e; font-weight: 600; }
.board-project-next { margin: 8px 0 0 !important; padding: 4px 8px; border-radius: 6px; background: #f4f8ff; color: #2f4a7a !important; font-size: 12px !important; font-weight: 600; line-height: 1.5; }
.board-project-next em { font-style: normal; font-weight: 400; color: #7a8aa6; }
.board-project-next.today { background: #fff8eb; color: #9a6200 !important; }
.board-project-next.overdue { background: #fff1f0; color: #c0392b !important; }
</style>
