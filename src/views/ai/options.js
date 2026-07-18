export const TASK_STATUS = {
  draft: { label: '草稿', type: 'info' },
  queued: { label: '排队中', type: 'info' },
  claimed: { label: '已认领', type: 'warning' },
  running: { label: '执行中', type: 'warning' },
  deploying: { label: '部署中', type: 'warning' },
  awaiting_review: { label: '待审核', type: 'primary' },
  approved: { label: '已批准', type: 'success' },
  rejected: { label: '已驳回', type: 'danger' },
  failed: { label: '执行失败', type: 'danger' },
  delivery_failed: { label: '交付异常', type: 'danger' },
  delivered: { label: '已交付客户', type: 'success' },
  cancelled: { label: '已取消', type: 'info' }
}

export const AUTOMATION_MODE = {
  manual: { label: '人工', type: 'info' },
  auto_pr: { label: '自动产出 PR', type: 'primary' },
  auto_deploy: { label: '全自动交付', type: 'success' }
}

export const ATTEMPT_STATUS = {
  claimed: { label: '已认领', type: 'warning' },
  running: { label: '执行中', type: 'warning' },
  succeeded: { label: '已产出 PR', type: 'success' },
  failed: { label: '失败', type: 'danger' },
  expired: { label: '租约过期', type: 'info' }
}

export const RISK = {
  low: { label: '低', type: 'success' },
  medium: { label: '中', type: 'warning' },
  high: { label: '高', type: 'danger' }
}

export function formatTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('zh-CN', { hour12: false })
}

export function shortSha(value) {
  return value ? String(value).slice(0, 12) : '-'
}
