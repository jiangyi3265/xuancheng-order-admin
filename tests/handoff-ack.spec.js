// 老板点「通过」后，提交的人在页面上收到一条提示（不进待办）；点一下直达那个项目
const { test, expect } = require('@playwright/test')
const { fixture, order } = require('./fixtures.cjs')
const ok = (route, data) => route.fulfill({ json: { code: 200, data } })

async function asEmployee(page) {
  await fixture(page, 'employee')
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.addInitScript(() => localStorage.setItem('token', 'fixture-employee'))
}

test('对方通过后，提交人看到一条提示，点了直达项目；别人的、已经看过的不弹', async ({ page }) => {
  await asEmployee(page)
  // 员工（id 2）名下的项目，手上没有待办
  const mine = { ...order, unread: [], nextStep: '', lastMessage: undefined, bugs: [], actionBugCount: 0, recentApprovalEvents: [] }
  const old = { id: 800, orderId: 1, submitterId: 2, kind: 'manual', text: '管理员 通过了你提交的项目处理结果 · 品牌官网设计' }
  let events = [old], stamp = 1
  await page.route('**/jiedan/order/stamp', (r) => ok(r, { stamp: String(stamp) }))
  await page.route('**/jiedan/order/list', (r) => ok(r, [{ ...mine, recentApprovalEvents: events }]))
  await page.route('**/jiedan/order/1', (r) => ok(r, { ...mine, recentApprovalEvents: events }))
  await page.route('**/jiedan/approval/list', (r) => ok(r, []))
  await page.goto('/#/workbench')
  await expect(page.getByRole('heading', { name: /轮到我/ })).toBeVisible()
  // 打开页面之前就有的通过记录：不弹
  await page.waitForTimeout(600)
  await expect(page.locator('.el-notification')).toHaveCount(0)

  // 老板刚通过了一条下一步，同时有一条是别人提交的
  events = [
    { id: 902, orderId: 1, submitterId: 1, kind: 'next', text: '管理员 通过了别人提交的事 · 品牌官网设计' },
    { id: 901, orderId: 1, submitterId: 2, kind: 'next', text: '管理员 通过了你提交的下一步「把首页初稿发给客户」 · 品牌官网设计' },
    old
  ]
  stamp = 2
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  const notice = page.locator('.el-notification')
  await expect(notice).toHaveCount(1)
  await expect(notice).toContainText('通过了你提交的下一步「把首页初稿发给客户」')
  await expect(notice).not.toContainText('别人提交的事')
  // 不进待办：标签页数字、「轮到我」都不变
  await expect(page).toHaveTitle('玄成科技 · 接单系统')
  await expect(page.locator('section[aria-label="轮到我"] .handoff-card')).toHaveCount(0)

  // 再刷新一次：同一条不重复弹
  stamp = 3
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await page.waitForTimeout(800)
  await expect(notice).toHaveCount(1)

  await notice.click()
  await expect(page).toHaveURL(/#\/order\?.*id=1/)
})
