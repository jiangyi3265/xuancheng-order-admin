<template>
  <!-- 手机上「列表」模式的一张订单卡：只负责显示和发事件，状态怎么改、弹窗怎么开都在 order/index.vue 里 -->
  <div class="m-card" :class="{ overdue }" @click="emit('open')">
    <!-- 第一行：编号 + 状态 + 收款 -->
    <div class="m-top">
      <span class="m-no">{{ order.orderNo }}</span>
      <span class="m-tags">
        <el-tag size="small" :type="statusMap[order.status]?.type" effect="light">
          {{ statusMap[order.status]?.label }}
        </el-tag>
        <el-tag size="small" :type="pay.type" effect="light" class="m-pay" @click.stop="emit('pay')">{{ pay.label }}</el-tag>
      </span>
    </div>

    <!-- 第二行：项目名，最多两行 -->
    <div class="m-title-row">
      <span v-if="unread" class="dot-unread"></span>
      <span class="m-title">{{ order.title }}</span>
      <el-icon v-if="order.attachmentCount || (order.attachments && order.attachments.length)" class="inline-pic"><Paperclip /></el-icon>
    </div>

    <!-- 第三行：客户 / 负责人 / 截止 / 报价 -->
    <div class="m-meta">
      <span class="m-customer">{{ order.customer || '未填客户' }}</span>
      <AssignMenu v-if="MEMBERS.length > 1" :order="order" plain>
        <span class="who" title="点一下改派给别人">
          <el-avatar :size="20" :style="{ background: memberMap[order.ownerId]?.color, fontSize: '11px' }">
            {{ memberMap[order.ownerId]?.name?.slice(-1) }}
          </el-avatar>
          <span class="owner-name">{{ memberMap[order.ownerId]?.name }}</span>
        </span>
      </AssignMenu>
      <span class="m-deadline" :class="{ red: overdue }" :title="order.deadline || ''">
        {{ order.deadline ? '截止 ' + deadlineText : '未定截止' }}
      </span>
      <span class="m-amount">¥{{ order.amount || 0 }}</span>
    </div>

    <!-- 第四行：操作按钮（每个都至少 40px 高，点按钮不会同时打开详情） -->
    <div class="m-actions" @click.stop>
      <button type="button" class="m-act" @click.stop="emit('open')">详情</button>
      <button type="button" class="m-act green" @click.stop="emit('pay')">收款</button>
      <button v-if="canFinish" type="button" class="m-act" @click.stop="emit('finish')">{{ isBoss ? '完成' : '提交验收' }}</button>
      <button v-if="!isBoss && order.assignState === 'pending'" type="button" class="m-act warn" @click.stop="emit('open')">去接收</button>
      <el-dropdown trigger="click" max-height="300" class="m-more" @command="(c) => emit('more', c)">
        <button type="button" class="m-act gray" @click.stop>更多<el-icon class="el-icon--right"><ArrowDown /></el-icon></button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="notebook">记事本</el-dropdown-item>
            <el-dropdown-item command="edit">编辑</el-dropdown-item>
            <el-dropdown-item
              v-for="(s, i) in moreStatuses"
              :key="s.value"
              :command="'status:' + s.value"
              :divided="i === 0"
            >设为「{{ s.label }}」</el-dropdown-item>
            <template v-if="isBoss">
              <el-dropdown-item command="delete" divided>删除</el-dropdown-item>
            </template>
            <template v-else>
              <el-dropdown-item command="request:amount" divided>申请改报价</el-dropdown-item>
              <el-dropdown-item v-if="!['done', 'cancelled'].includes(order.status)" command="request:cancel">申请取消</el-dropdown-item>
              <el-dropdown-item command="request:delete">申请删除</el-dropdown-item>
            </template>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<script setup>
import { Paperclip, ArrowDown } from '@element-plus/icons-vue'
import AssignMenu from '@/components/AssignMenu.vue'
import { isBoss } from '@/mock/store'
import { MEMBERS, statusMap, memberMap } from '@/constants/options'

// 这里只管显示：逾期 / 未读 / 收款标签 / 能不能完成 / “设为…”有哪几项，都由 order/index.vue 算好传进来，
// 规则只有一份（和桌面列表用的是同一批函数）
defineProps({
  order: { type: Object, required: true },
  overdue: { type: Boolean, default: false },
  unread: { type: Boolean, default: false },
  pay: { type: Object, default: () => ({ label: '', type: 'info' }) },
  deadlineText: { type: String, default: '' },
  canFinish: { type: Boolean, default: false },
  moreStatuses: { type: Array, default: () => [] }
})
// open 打开详情；pay 记收款；finish 完成 / 提交验收；more 更多菜单里选了某项（带命令名）
const emit = defineEmits(['open', 'pay', 'finish', 'more'])
</script>

<style scoped>
.m-card {
  background: #fff;
  border-radius: 8px;
  border-left: 3px solid transparent;
  padding: 12px 12px 0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  overflow: hidden;
  min-width: 0;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.m-card.overdue {
  border-left-color: #f56c6c;
}

/* 第一行 */
.m-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.m-no {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: #909399;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.m-tags {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
}
/* 收款标签可点：点击范围比看到的大一圈，手指好按 */
.m-pay {
  position: relative;
  cursor: pointer;
}
.m-pay::after {
  content: '';
  position: absolute;
  top: -8px;
  bottom: -8px;
  left: -4px;
  right: -4px;
}

/* 第二行 */
.m-title-row {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  margin-bottom: 8px;
}
.m-title {
  flex: 0 1 auto;
  min-width: 0;
  font-size: 15px;
  font-weight: 600;
  line-height: 21px;
  color: #303133;
  overflow: hidden;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}
.dot-unread {
  flex: none;
  width: 8px;
  height: 8px;
  margin-top: 7px;
  border-radius: 50%;
  background: #f56c6c;
}
.inline-pic {
  flex: none;
  margin-top: 3px;
  font-size: 14px;
  color: #409eff;
}

/* 第三行：放不下时自动换到第二行，不会撑出屏幕 */
.m-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 12px;
  font-size: 13px;
  color: #909399;
}
.m-customer {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.who {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 120px;
  color: #606266;
  cursor: pointer;
}
/* 点负责人可以改派：点击范围上下各放大 8px，凑够 36px */
.who::after {
  content: '';
  position: absolute;
  top: -8px;
  bottom: -8px;
  left: -4px;
  right: -4px;
}
.owner-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.m-deadline {
  white-space: nowrap;
}
.m-deadline.red {
  color: #f56c6c;
  font-weight: 600;
}
.m-amount {
  margin-left: auto;
  color: #e6a23c;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
}

/* 第四行：整行按钮，贴着卡片底边，用细线隔开 */
.m-actions {
  display: flex;
  align-items: stretch;
  margin: 10px -12px 0;
  border-top: 1px solid #f0f2f5;
}
.m-actions > * + * {
  border-left: 1px solid #f0f2f5;
}
.m-act {
  flex: 1;
  min-width: 0;
  width: 100%;
  height: 40px;
  padding: 0 2px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  font-family: inherit;
  font-size: 14px;
  color: #409eff;
  white-space: nowrap;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.m-act:active {
  background: #f5f7fa;
}
.m-act.green {
  color: #67c23a;
}
.m-act.warn {
  color: #e6a23c;
}
.m-act.gray {
  color: #606266;
}
.m-more {
  flex: 1;
  min-width: 0;
  display: flex;
}
</style>
