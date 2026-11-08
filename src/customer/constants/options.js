// 客户端展示用的状态 / 优先级映射

export const statusMap = {
  pending: { label: '待确认', type: 'warning' },
  doing: { label: '进行中', type: 'primary' },
  review: { label: '待验收', type: 'warning' },
  done: { label: '已完成', type: 'success' },
  cancelled: { label: '已取消', type: 'info' }
}

export const priorityMap = {
  high: { label: '高', color: '#f56c6c' },
  medium: { label: '中', color: '#e6a23c' },
  low: { label: '低', color: '#909399' }
}

// 客户视角把内部成员统一显示为团队名
export const TEAM_NAME = '玄成团队'

// 时间线类型：哪些算“系统提示”（居中灰字），其余作为聊天气泡
export const SYSTEM_TYPES = ['create', 'status']
