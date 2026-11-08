// 「需要我处理」汇总、员工手机工作台去重、客户确认验收、建成员时填企业微信
const { test, expect } = require('@playwright/test')
const { fixture, order, members } = require('./fixtures.cjs')
const ok = (route, data) => route.fulfill({ json: { code: 200, data } })
const pad = (n) => String(n).padStart(2, '0')
const today = (() => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` })()

async function as(page, role, width = 1366) {
  await fixture(page, role)
  await page.setViewportSize({ width, height: 900 })
  await page.addInitScript((r) => localStorage.setItem(r === 'customer' ? 'customerToken' : 'token', 'fixture-' + r), role)
}

test('老板：员工拒单排在最前，可以直接改派或自己做；客户等回复的消息带「回复」', async ({ page }) => {
  await as(page, 'boss')
  const rows = [
    { ...order, id: 12, title: '客户在等回复', ownerId: 1, status: 'doing', unread: [], deadline: '',
      lastMessage: { type: 'message', user: '林女士', content: '首页能改成蓝色吗', time: today + ' 09:30' } },
    { ...order, id: 11, title: '被拒的官网', ownerId: 1, status: 'pending', assignState: '', unread: [1], deadline: '',
      lastMessage: undefined, lastEvent: { type: 'note', user: '小陈', content: '小陈 拒绝了项目：这周排满了', time: today + ' 09:00' } },
    { ...order, id: 13, title: '普通进行中', ownerId: 2, status: 'doing', unread: [], lastMessage: undefined }
  ]
  await page.route('**/jiedan/order/list', (r) => ok(r, rows))
  await page.route('**/jiedan/approval/list', (r) => ok(r, []))
  let statusBody = null
  await page.route('**/jiedan/order/status', async (r) => {
    statusBody = r.request().postDataJSON()
    await ok(r, { ...rows[1], status: 'doing', lastEvent: { type: 'status', user: '管理员', content: '状态更新为「进行中」' } })
  })
  await page.goto('/#/workbench')
  const cards = page.locator('.row-card.todo')
  await expect(cards.first()).toContainText('被拒的官网')
  const returned = cards.filter({ hasText: '被拒的官网' })
  await expect(returned).toContainText('小陈 拒了这单：这周排满了')
  // 「改派给…」是下拉菜单的触发按钮（外面包着下拉菜单自己的触发区，所以按样式类找按钮本身）
  await expect(returned.locator('.el-button').filter({ hasText: '改派给…' })).toBeVisible()
  const reply = cards.filter({ hasText: '客户在等回复' })
  await expect(reply).toContainText('客户：首页能改成蓝色吗')
  await expect(reply.getByRole('button', { name: '回复', exact: true })).toBeVisible()
  // 别人手上、没什么要我做的项目不进待办
  await expect(cards.filter({ hasText: '普通进行中' })).toHaveCount(0)
  // 侧栏红点和清单条数一致
  await expect(page.locator('.el-menu-item').filter({ hasText: '工作台' }).locator('.el-badge__content')).toHaveText('2')
  await returned.getByRole('button', { name: '我自己做' }).click()
  await expect.poll(() => statusBody).toEqual(expect.objectContaining({ id: 11, status: 'doing' }))
  await expect(cards.filter({ hasText: '被拒的官网' })).toHaveCount(0)
})

test('员工手机工作台：待接收的单子只出现一次，按钮叫「接收」，分栏是「手上的 / 待验收」', async ({ page }) => {
  await as(page, 'employee', 390)
  const rows = [
    { ...order, id: 21, title: '刚派来的单', ownerId: 2, status: 'pending', assignState: 'pending', unread: [2], lastMessage: undefined },
    { ...order, id: 22, title: '正在做的单', ownerId: 2, status: 'doing', assignState: '', unread: [], lastMessage: undefined }
  ]
  await page.route('**/jiedan/order/list', (r) => ok(r, rows))
  await page.route('**/jiedan/approval/list', (r) => ok(r, []))
  await page.goto('/#/workbench')
  await expect(page.getByText('刚派来的单', { exact: true })).toHaveCount(1)
  await expect(page.locator('.wb-todo').filter({ hasText: '刚派来的单' }).getByRole('button', { name: '接收：刚派来的单' })).toBeVisible()
  await expect(page.getByRole('button', { name: '接单', exact: true })).toHaveCount(0)
  await expect(page.locator('.board-tabs')).toContainText('手上的')
  await expect(page.locator('.board-tabs')).not.toContainText('待接单')
  await expect(page.locator('.employee-project').filter({ hasText: '正在做的单' })).toBeVisible()
  // 顶部只剩一行名字和问候，没有大段标语
  await expect(page.locator('.wb-person')).not.toContainText('专注项目执行')
})

test('客户在验收阶段点「确认验收」，项目直接变成已完成', async ({ page }) => {
  await as(page, 'customer', 390)
  const project = { ...order, status: 'review', receivedAmount: undefined, payments: undefined, timeline: order.timeline.filter((t) => t.type === 'reply') }
  let accepted = false
  await page.route('**/jiedan/portal/orders/1', (r) => ok(r, accepted ? { ...project, status: 'done' } : project))
  await page.route('**/jiedan/portal/orders/1/accept', async (r) => {
    accepted = r.request().method() === 'PUT'
    await ok(r, { ...project, status: 'done' })
  })
  await page.goto('/#/projects/1')
  await expect(page.locator('.accept-hint')).toBeVisible()
  await expect(page.getByRole('button', { name: '还有问题' })).toBeVisible()
  await page.locator('.detail-footer').getByRole('button', { name: '确认验收' }).click()
  await page.locator('.el-message-box').getByRole('button', { name: '确认验收' }).click()
  await expect.poll(() => accepted).toBe(true)
  await expect(page.locator('.topbar .el-tag')).toContainText('已完成')
  await expect(page.locator('.accept-hint')).toHaveCount(0)
  await expect(page.locator('.detail-footer')).toContainText('联系负责人')
})

test('建成员时顺手填企业微信，成员列表里直接显示', async ({ page }) => {
  await as(page, 'boss')
  let staffList = [...members]
  const saved = []
  await page.route('**/jiedan/staff/list', (r) => ok(r, staffList))
  await page.route('**/jiedan/staff', async (r) => {
    if (r.request().method() !== 'POST') return r.fallback()
    staffList = [...staffList, { id: 9, userName: 'newbie', nickName: '新同事', role: 'employee', status: '0', orderCount: 0 }]
    await ok(r, null)
  })
  await page.route('**/jiedan/push/config', async (r) => {
    if (r.request().method() === 'POST') {
      saved.push(r.request().postDataJSON())
      return ok(r, null)
    }
    return ok(r, { 'push.wecom.user.2': 'xiaochen' })
  })
  await page.goto('/#/staff')
  await expect(page.locator('.el-table').getByText('xiaochen', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '新增成员' }).click()
  const d = page.getByRole('dialog', { name: '新增成员' })
  await d.getByPlaceholder('登录用，字母/数字/下划线').fill('newbie')
  await d.getByPlaceholder('显示在项目负责人处，如 费鹏飞').fill('新同事')
  await d.getByPlaceholder('5-20 位').fill('Newbie123')
  await d.getByPlaceholder(/通讯录里的「账号」/).fill('xin.tongshi')
  await d.getByRole('button', { name: '创建' }).click()
  await expect.poll(() => saved).toContainEqual({ 'push.wecom.user.9': 'xin.tongshi' })
  const notice = page.locator('.login-info-notice')
  await expect(notice).toBeVisible()
  await expect(notice).not.toContainText('还没填')
  await expect(page.locator('.el-table').getByText('xin.tongshi', { exact: true })).toBeVisible()
})
