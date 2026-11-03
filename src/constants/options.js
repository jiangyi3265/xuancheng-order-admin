import { reactive } from 'vue'

// 订单状态（编程/开发类流程）
export const STATUS = [
  { value: 'pending', label: '待确认', type: 'info', color: '#909399' },
  { value: 'doing', label: '进行中', type: 'primary', color: '#409eff' },
  { value: 'review', label: '待验收', type: 'warning', color: '#e6a23c' },
  { value: 'done', label: '已完成', type: 'success', color: '#67c23a' },
  { value: 'cancelled', label: '已取消', type: 'info', color: '#c0c4cc' }
]

// 看板上展示的状态列（取消的不进看板）
export const KANBAN_STATUS = ['pending', 'doing', 'review', 'done']

// 来源渠道
export const CHANNEL = [
  { value: 'wechat', label: '微信', color: '#07c160' },
  { value: 'taobao', label: '淘宝', color: '#ff6a00' },
  { value: 'douyin', label: '抖音', color: '#fe2c55' },
  { value: 'xianyu', label: '闲鱼', color: '#ffce3d' },
  { value: 'form', label: '客户提交', color: '#9254de' },
  { value: 'other', label: '其他', color: '#909399' }
]

// 优先级
export const PRIORITY = [
  { value: 'high', label: '高', color: '#f56c6c' },
  { value: 'medium', label: '中', color: '#e6a23c' },
  { value: 'low', label: '低', color: '#909399' }
]

// 操作日志的操作类型（与后端 JiedanAuditService 记录的 action 一一对应）
export const AUDIT_ACTIONS = [
  { value: 'order.create', label: '新建项目', type: 'success' },
  { value: 'order.update', label: '修改项目', type: 'primary' },
  { value: 'order.status', label: '改状态', type: 'primary' },
  { value: 'order.delete', label: '删除项目', type: 'danger' },
  { value: 'order.restore', label: '恢复项目', type: 'success' },
  { value: 'order.purge', label: '彻底删除', type: 'danger' },
  { value: 'order.export', label: '导出 Excel', type: 'warning' },
  { value: 'bug.delete', label: '删除 Bug', type: 'danger' },
  { value: 'staff.create', label: '新建成员', type: 'success' },
  { value: 'staff.reset', label: '重置成员密码', type: 'warning' },
  { value: 'staff.status', label: '停用/启用成员', type: 'warning' },
  { value: 'staff.delete', label: '删除成员', type: 'danger' },
  { value: 'customer.create', label: '新建客户账号', type: 'success' },
  { value: 'customer.reset', label: '重置客户密码', type: 'warning' },
  { value: 'customer.owner', label: '转交客户', type: 'primary' },
  { value: 'customer.delete', label: '删除客户账号', type: 'danger' },
  { value: 'account.password', label: '修改密码', type: 'info' }
]

export const AUDIT_ROLE_LABEL = {
  boss: '总管理员',
  employee: '下属管理员',
  customer: '客户',
  system: '系统',
  other: '其他'
}

// 后台成员（总管理员 + 下属管理员）。登录后由后端 /jiedan/staff/list 加载：
// 总管理员拿到全部成员，下属管理员只拿到自己。
// MEMBERS / memberMap 是响应式的，加载后用到它们的页面会自动刷新。
const MEMBER_COLORS = ['#67c23a', '#e6a23c', '#f56c6c', '#9254de', '#13c2c2', '#fa8c16']
export const MEMBERS = reactive([])
export const memberMap = reactive({})

export function setStaff(list) {
  const next = (list || []).map((s) => ({
    id: s.id,
    name: s.nickName || s.userName,
    userName: s.userName,
    role: s.role,
    roleLabel: s.roleLabel,
    status: s.status,
    orderCount: s.orderCount,
    unfinishedCount: s.unfinishedCount,
    createTime: s.createTime,
    color: s.role === 'boss' ? '#409eff' : MEMBER_COLORS[Number(s.id) % MEMBER_COLORS.length]
  }))
  MEMBERS.splice(0, MEMBERS.length, ...next)
  Object.keys(memberMap).forEach((k) => delete memberMap[k])
  next.forEach((m) => { memberMap[m.id] = m })
}

export const isBossId = (id) => memberMap[id]?.role === 'boss'

const toMap = (arr, key = 'value') =>
  Object.fromEntries(arr.map((item) => [item[key], item]))

export const statusMap = toMap(STATUS)
export const channelMap = toMap(CHANNEL)
export const priorityMap = toMap(PRIORITY)
export const auditActionMap = toMap(AUDIT_ACTIONS)
