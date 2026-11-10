// 手机「沟通」页把屏幕留给对话；打开项目时对话停在最新一条
const { test, expect } = require('@playwright/test')
const { fixture, order } = require('./fixtures.cjs')
const ok = (route, data) => route.fulfill({ json: { code: 200, data } })

async function as(page, role, width = 1366, height = 900) {
  await fixture(page, role)
  await page.setViewportSize({ width, height })
  await page.addInitScript((r) => localStorage.setItem('token', 'fixture-' + r), role)
}
// 一段长对话：40 条，最后一条是客户说的
const talk = Array.from({ length: 40 }, (_, i) => ({
  id: 100 + i, type: i % 2 ? 'message' : 'reply', user: i % 2 ? '林女士' : '小陈',
  content: i === 39 ? '最后一条：周五能上线吗？' : '第 ' + (i + 1) + ' 条消息，说点项目上的事情', time: '2026-11-0' + (1 + (i % 9)) + ' 10:' + String(i).padStart(2, '0'), attachments: []
}))
const long = { ...order, timeline: talk, messageCount: 40, lastMessage: { type: 'message', user: '林女士', content: '最后一条：周五能上线吗？' } }
const atBottom = (page) => page.locator('.chat-list').evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight < 4)

test('电脑：打开对话很长的项目，直接停在最新一条', async ({ page }) => {
  await as(page, 'boss')
  await page.route('**/jiedan/order/1', (r) => ok(r, long))
  await page.goto('/#/order?id=1')
  await expect(page.locator('.chat-row')).toHaveCount(40)
  await expect.poll(() => atBottom(page)).toBeTruthy()
  await expect(page.locator('.chat-row').last()).toBeInViewport()
})

for (const height of [844, 640]) {
  test(`手机 ${height} 高：「沟通」页对话占大半屏，标题一行，下一步条和底栏收起；切回「需求」都回来`, async ({ page }) => {
    await as(page, 'boss', 390, height)
    const review = { ...long, status: 'review', nextStep: '给客户看首页', nextOwnerId: 2, nextDue: '2026-11-20' }
    await page.route('**/jiedan/order/1', (r) => ok(r, review))
    await page.route('**/jiedan/order/list', (r) => ok(r, [review]))
    await page.goto('/#/order?id=1&tab=chat')
    await expect(page.locator('.chat-row')).toHaveCount(40)
    const list = page.locator('.chat-list')
    // 对话区至少占屏幕高度的四成（以前 640 高的手机上只剩 0）
    expect((await list.boundingBox()).height).toBeGreaterThan(height * 0.4)
    await expect.poll(() => atBottom(page)).toBeTruthy()
    await expect(page.locator('.chat-row').last()).toBeInViewport()
    // 回复框和发送按钮都在屏幕里，没被挡住
    await expect(page.locator('.chat-panel').getByLabel('回复客户')).toBeInViewport()
    const send = page.getByRole('button', { name: '发送给客户' })
    await expect(send).toBeInViewport()
    expect((await send.boundingBox()).y + (await send.boundingBox()).height).toBeLessThanOrEqual(height)
    await expect(page.locator('.head-actions-m')).toBeHidden()
    await expect(page.locator('.workspace-next')).toBeHidden()
    expect((await page.locator('.workspace-head').boundingBox()).height).toBeLessThan(70)

    // 切到「需求」：操作栏和下一步都在
    await page.locator('.workspace-mobile-tabs').getByRole('button', { name: '需求' }).click()
    await expect(page.locator('.head-actions-m').getByRole('button', { name: '验收通过' })).toBeVisible()
    await expect(page.locator('.workspace-next')).toContainText('给客户看首页')
    // 再切回「沟通」：还是停在最新一条
    await page.locator('.workspace-mobile-tabs').getByRole('button', { name: '沟通' }).click()
    await expect.poll(() => atBottom(page)).toBeTruthy()
  })
}

test('手机：员工还没接收的项目，「沟通」页底栏的「接收 / 拒绝」照常在', async ({ page }) => {
  await as(page, 'employee', 390, 844)
  const assigned = { ...order, assignState: 'pending', status: 'pending' }
  await page.route('**/jiedan/order/1', (r) => ok(r, assigned))
  await page.route('**/jiedan/order/list', (r) => ok(r, [assigned]))
  await page.goto('/#/order?id=1&tab=chat')
  await expect(page.locator('.chat-panel')).toBeVisible()
  await expect(page.locator('.head-actions-m').getByRole('button', { name: '接收这个项目' })).toBeVisible()
})

test('手机：写「下一步」时负责人和日期并排一行', async ({ page }) => {
  await as(page, 'boss', 390, 844)
  await page.goto('/#/order?id=1')
  await page.locator('.workspace-next').getByRole('button', { name: /写下一步/ }).click()
  const who = await page.locator('.ns-owner-select').boundingBox()
  const date = await page.locator('.ns-date').boundingBox()
  expect(Math.abs(who.y - date.y)).toBeLessThan(6)
  expect(Math.abs(who.width - date.width)).toBeLessThan(6)
})

test('内部记录：最新的在最上面，刚写的一条紧跟在输入框下面', async ({ page }) => {
  await as(page, 'boss')
  const notes = Array.from({ length: 12 }, (_, i) => ({ id: 200 + i, type: 'note', user: '小陈', content: '第 ' + (i + 1) + ' 条进展', time: '2026-11-0' + (1 + (i % 9)) + ' 09:' + String(i).padStart(2, '0'), attachments: [] }))
  const busy = { ...order, timeline: [...order.timeline, ...notes] }
  await page.route('**/jiedan/order/1', (r) => ok(r, busy))
  await page.route('**/jiedan/order/progress', async (r) => {
    const b = r.request().postDataJSON()
    await ok(r, { ...busy, timeline: [...busy.timeline, { id: 300, type: b.type, user: '管理员', content: b.content, time: '2026-11-10 12:00', attachments: [] }] })
  })
  await page.goto('/#/order?id=1')
  const items = page.locator('.record-panel .el-timeline-item')
  await expect(items).toHaveCount(13)
  await expect(items.first()).toContainText('第 12 条进展')
  await expect(items.last()).toContainText('内部保密内容')
  const box = page.locator('.record-panel').getByPlaceholder(/记录内部进度/)
  await box.fill('刚写的：首页已改完')
  await page.locator('.record-panel').getByRole('button', { name: '记录', exact: true }).click()
  await expect(items).toHaveCount(14)
  await expect(items.first()).toContainText('刚写的：首页已改完')
  // 不用翻就看得到
  await expect(items.first()).toBeInViewport()
})
