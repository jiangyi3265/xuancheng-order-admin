// 客户提的问题：团队做完叫「已处理」，发给客户确认，客户确认后才是「已解决」；团队自己记的问题照旧「已解决」
const { test, expect } = require('@playwright/test')
const { fixture, order } = require('./fixtures.cjs')
const ok = (route, data) => route.fulfill({ json: { code: 200, data } })

async function asEmployee(page, width = 1366) {
  await fixture(page, 'employee')
  await page.setViewportSize({ width, height: 900 })
  await page.addInitScript(() => localStorage.setItem('token', 'fixture-employee'))
}
const base = { ...order, unread: [], lastMessage: undefined, nextStep: '', taskTurns: {}, customerAccount: 'client' }

test('详情：客户提的问题没有「已解决」，按钮叫「已处理」，说明和截图可以不填；团队记的问题照旧', async ({ page }) => {
  await asEmployee(page)
  const fromCustomer = { id: 81, status: 'action', content: '按钮颜色不对', senderKind: 'customer', customerConfirm: true, attachments: [], updates: [], time: '2026-11-12 10:00' }
  const ours = { id: 82, status: 'action', content: '页脚错位', senderKind: 'team', customerConfirm: false, attachments: [], updates: [], time: '2026-11-12 10:05' }
  const project = { ...base, bugs: [fromCustomer, ours], actionBugCount: 2 }
  const sent = []
  await page.route('**/jiedan/order/list', (r) => ok(r, [project]))
  await page.route('**/jiedan/order/1', (r) => ok(r, project))
  await page.route('**/jiedan/order/read', (r) => ok(r, { id: 1, version: project.version }))
  await page.route('**/jiedan/order/bug/81/review', async (r) => {
    sent.push(r.request().postDataJSON())
    fromCustomer.status = 'confirm'; fromCustomer.review = { id: 91, state: 'pending' }
    await ok(r, project)
  })
  await page.goto('/#/order?id=1&tab=bugs&bug=81')
  const mine = page.locator('.bug-item[data-notice-id="81"]')
  await expect(mine.getByRole('radio', { name: '已解决' })).toHaveCount(0)
  await mine.getByRole('button', { name: '已处理', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '已处理，请客户确认' })
  const send = dialog.getByRole('button', { name: '发给客户确认' })
  await expect(send).toBeEnabled()
  await send.click()
  await expect(dialog).toBeHidden()
  expect(sent).toHaveLength(1)
  expect(sent[0].content).toBe('')
  await expect(mine.locator('.issue-awaiting')).toHaveText('已处理，等客户确认')

  // 团队自己记的问题：还能直接「已解决」，另有「请客户确认」
  await page.goto('/#/order?id=1&tab=bugs&bug=82')
  const own = page.locator('.bug-item[data-notice-id="82"]')
  await expect(own.locator('.bug-disclosure')).toHaveAttribute('aria-expanded', 'true')
  await expect(own.locator('.el-radio-button').filter({ hasText: '已解决' })).toHaveCount(1)
  await expect(own.getByRole('button', { name: '请客户确认', exact: true })).toBeVisible()
})

test('工作台卡片：客户提的问题按钮叫「已处理」，点了提示已发给客户确认，不给撤销', async ({ page }) => {
  await asEmployee(page)
  const bugs = [{ id: 83, status: 'action', content: '图片加载很慢', senderKind: 'customer', customerConfirm: true }]
  const project = { ...base, id: 1, ownerId: 2, status: 'doing', assignState: '', bugs, actionBugCount: 1, actionBugPreviews: [{ id: 83, content: '图片加载很慢', customerConfirm: 1 }] }
  const sent = []
  await page.route('**/jiedan/order/list', (r) => ok(r, [project]))
  await page.route('**/jiedan/approval/list', (r) => ok(r, []))
  await page.route('**/jiedan/order/1/pending-completion', async (r) => {
    sent.push(r.request().postDataJSON())
    await ok(r, { ...project, version: 2, actionBugCount: 0, actionBugPreviews: [], bugs: [{ ...bugs[0], status: 'confirm', review: { id: 92, state: 'pending' } }] })
  })
  await page.goto('/#/workbench')
  const card = page.locator('.handoff-card').filter({ hasText: '图片加载很慢' })
  await expect(card.getByRole('button', { name: '已解决', exact: true })).toHaveCount(0)
  await card.getByRole('button', { name: '已处理', exact: true }).click()
  await expect(page.getByText(/问题 #83 已处理，等客户确认/)).toBeVisible()
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toHaveCount(0)
  expect(sent).toEqual([expect.objectContaining({ kind: 'bug', bugId: 83 })])
})

test('老板通过同事交上来的客户问题：提示已发给客户确认', async ({ page }) => {
  await fixture(page, 'boss')
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.addInitScript(() => localStorage.setItem('token', 'fixture-boss'))
  const turn = { requesterId: 1, requesterName: '管理员', submittedAt: '2026-11-12 11:00:00', submittedBy: 2, submittedName: '小陈', submitNote: '已压缩图片' }
  const bug = { id: 84, status: 'ai_review', content: '详情页图片太慢', senderKind: 'customer', customerConfirm: true }
  const project = { ...base, ownerId: 2, bugs: [bug], internalReviewIssues: [{ id: 84, content: '详情页图片太慢' }], taskTurns: { 'bug-84': turn } }
  await page.route('**/jiedan/order/list', (r) => ok(r, [project]))
  await page.route('**/jiedan/approval/list', (r) => ok(r, []))
  await page.route('**/jiedan/order/bug/84/status', (r) => ok(r, { ...project, version: 2, internalReviewIssues: [], taskTurns: {}, bugs: [{ ...bug, status: 'confirm', review: { id: 93, state: 'pending' } }] }))
  await page.goto('/#/workbench')
  await page.locator('.handoff-card').filter({ hasText: '详情页图片太慢' }).getByRole('button', { name: '通过', exact: true }).click()
  await expect(page.getByText('已通过，已发给客户确认', { exact: true })).toBeVisible()
})

test('客户那边：已处理的问题写「已处理，等你确认」', async ({ page }) => {
  await fixture(page, 'customer')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => localStorage.setItem('customerToken', 'fixture-customer'))
  const bug = { ...order.bugs[0], id: 85, status: 'confirm', progressStatus: 'confirm', content: '按钮颜色不对', review: { id: 94, state: 'pending' }, updates: [] }
  await page.route('**/jiedan/portal/orders/1', (r) => ok(r, { ...order, bugs: [bug] }))
  await page.route('**/jiedan/portal/orders/1/version', (r) => ok(r, { version: 1 }))
  await page.goto('/#/projects/1')
  await page.getByRole('button', { name: '修改需求', exact: true }).click()
  await expect(page.locator('.requirement-status').filter({ hasText: '已处理，等你确认' }).first()).toBeVisible()
})

test('消息中心：AI 改完的回复叫「AI 回复」，已处理的写明等客户确认', async ({ page }) => {
  await fixture(page, 'boss')
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.addInitScript(() => localStorage.setItem('token', 'fixture-boss'))
  await page.route('**/jiedan/agent/reports', (r) => ok(r, [{ id: 1, orderId: 1, ownerId: 2, title: '品牌官网设计', bugId: 86, issue: '登录按钮被挡住', status: 'confirm', report: '修改内容：按钮上移', time: '2026-11-12 12:00' }]))
  await page.goto('/#/messages')
  await expect(page.getByRole('tab', { name: 'Codex 回复' })).toHaveCount(0)
  await page.getByRole('tab', { name: 'AI 回复' }).click()
  await expect(page.locator('.report-list')).toContainText('已处理，等客户确认')
})

test('提交验收：「已处理，等客户确认」的问题不算没处理，单独列一行', async ({ page }) => {
  await asEmployee(page)
  const project = { ...base, status: 'doing', assignState: '', bugs: [
    { id: 87, status: 'confirm', content: '按钮颜色不对', senderKind: 'customer', customerConfirm: true, review: { id: 95, state: 'pending' } },
    { id: 88, status: 'resolved', content: '页脚错位' }] }
  await page.route('**/jiedan/order/list', (r) => ok(r, [project]))
  await page.route('**/jiedan/order/1', (r) => ok(r, project))
  await page.route('**/jiedan/order/read', (r) => ok(r, { id: 1, version: project.version }))
  await page.goto('/#/order?id=1')
  await page.locator('.head-actions').getByRole('button', { name: '提交验收', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '提交验收', exact: true })
  await expect(dialog).toContainText('0 个待处理')
  await expect(dialog).toContainText('已处理，等客户确认')
  await expect(dialog.getByRole('button', { name: '提交验收', exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: '仍然提交验收' })).toHaveCount(0)
})
