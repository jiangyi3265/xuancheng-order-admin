// 客户提的问题、项目绑了客户账号：团队做完是「已处理」，交给客户确认，客户点「确认已解决」才算已解决。
// 后端在问题和「需处理」预览上给出 customerConfirm，这里只负责找到那一条。
export function needsCustomerConfirm(order, bugId) {
  if (!order || bugId == null) return false
  const same = (row) => String(row.id) === String(bugId)
  const bug = order.bugs?.find(same) || order.actionBugPreviews?.find(same)
  return !!bug?.customerConfirm
}

// 接口返回的项目里，这条问题已经变成「已处理，等客户确认」
export function sentToCustomer(order, bugId) {
  return order?.bugs?.find((row) => String(row.id) === String(bugId))?.status === 'confirm'
}
