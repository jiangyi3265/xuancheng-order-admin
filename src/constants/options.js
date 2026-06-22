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

// 团队成员（你们俩，名字随便改）
export const MEMBERS = [
  { id: 1, name: '阿成', role: 'boss', roleLabel: '老板', color: '#409eff' },
  { id: 2, name: '阿伟', role: 'employee', roleLabel: '员工', color: '#67c23a' }
]
export const BOSS_ID = 1
export const EMP_ID = 2

const toMap = (arr, key = 'value') =>
  Object.fromEntries(arr.map((item) => [item[key], item]))

export const statusMap = toMap(STATUS)
export const channelMap = toMap(CHANNEL)
export const priorityMap = toMap(PRIORITY)
export const memberMap = toMap(MEMBERS, 'id')
