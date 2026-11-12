// 员工「手上的项目」列出自己全部的项目（有事的标「轮到我」）；问题按钮名字和结果对得上：直接关掉的叫「已解决」，交上去的叫「做完了」并写明交给谁
const { test, expect } = require('@playwright/test')
const { fixture, order } = require('./fixtures.cjs')
const ok = (route, data) => route.fulfill({ json: { code: 200, data } })

async function asEmployee(page, width) {
  await fixture(page, 'employee')
  await page.setViewportSize({ width, height: 900 })
  await page.addInitScript(() => localStorage.setItem('token', 'fixture-employee'))
}
// 员工（小陈，id 2）手上两个进行中的项目，其中一个有客户问题等他处理
const quiet = { ...order, unread: [], lastMessage: undefined, nextStep: '', bugs: [], actionBugCount: 0, actionBugPreviews: [] }
const busy = { ...quiet, id: 31, title: '有问题要处理的项目', ownerId: 2, status: 'doing', assignState: '',
  actionBugCount: 1, actionBugPreviews: [{ id: 71, content: '按钮颜色不对' }], bugs: [{ id: 71, content: '按钮颜色不对', status: 'action' }] }
const calm = { ...quiet, id: 32, title: '没什么事的项目', ownerId: 2, status: 'doing', assignState: '' }

for (const width of [390, 1366]) {
  test('手上的项目把自己的都列出来，有事的标「轮到我」，数字和实际一致 · ' + width, async ({ page }) => {
    await asEmployee(page, width)
    await page.route('**/jiedan/order/list', (r) => ok(r, [busy, calm]))
    await page.route('**/jiedan/approval/list', (r) => ok(r, []))
    await page.goto('/#/workbench')
    await expect(page.locator('.handoff-card').filter({ hasText: '按钮颜色不对' })).toHaveCount(1)
    const cards = width < 768 ? page.locator('.employee-project') : page.locator('.row-card.hands')
    await expect(cards).toHaveCount(2)
    if (width < 768) await expect(page.locator('.board-tabs')).toContainText('手上的 2')
    else await expect(page.locator('.section-title').filter({ hasText: '我手上的' })).toContainText('2')
    await expect(cards.filter({ hasText: '有问题要处理的项目' }).locator('.turn-chip')).toHaveText('轮到我')
    await expect(cards.filter({ hasText: '没什么事的项目' }).locator('.turn-chip')).toHaveCount(0)
  })
}

test('自己标了需处理的问题：卡片上的按钮叫「已解决」，点了就是已解决；详情里的「做完了」写明交给管理员确认', async ({ page }) => {
  await asEmployee(page, 1366)
  const sent = []
  await page.route('**/jiedan/order/list', (r) => ok(r, [busy]))
  await page.route('**/jiedan/order/31', (r) => ok(r, busy))
  await page.route('**/jiedan/order/read', (r) => ok(r, { id: 31, version: busy.version }))
  await page.route('**/jiedan/approval/list', (r) => ok(r, []))
  await page.route('**/jiedan/order/31/pending-completion', async (r) => {
    sent.push(r.request().postDataJSON())
    await ok(r, { ...busy, version: 2, actionBugCount: 0, actionBugPreviews: [], bugs: [{ id: 71, content: '按钮颜色不对', status: 'resolved' }] })
  })
  await page.goto('/#/workbench')
  const card = page.locator('.handoff-card').filter({ hasText: '按钮颜色不对' })
  await expect(card.getByRole('button', { name: '完成', exact: true })).toHaveCount(0)

  // 详情里：员工的「做完了」是交给管理员确认，旁边写明
  await card.getByRole('link', { name: '看一下', exact: true }).click()
  const issue = page.locator('.bug-item').filter({ hasText: '按钮颜色不对' })
  await expect(issue.locator('.handoff-complete')).toContainText('做完了')
  await expect(issue.locator('.handoff-complete')).toContainText('交给管理员确认')
  await expect(issue.getByRole('button', { name: '加入处理', exact: true })).toHaveCount(0)
  await page.goBack()

  await card.getByRole('button', { name: '已解决', exact: true }).click()
  await expect.poll(() => sent).toEqual([expect.objectContaining({ kind: 'bug', bugId: 71 })])
  await expect(page.getByText(/问题 #71 已解决/)).toBeVisible()
})

test('客户提的问题还没人管：清单里的按钮叫「加入处理」，和工作台同一个说法', async ({ page }) => {
  await asEmployee(page, 1366)
  const fresh = { ...quiet, id: 33, title: '客户刚提了问题', ownerId: 2, status: 'doing', assignState: '',
    bugs: [{ id: 72, content: '首页图片太大', status: 'open', senderKind: 'customer' }] }
  const writes = []
  await page.route('**/jiedan/order/list', (r) => ok(r, [fresh]))
  await page.route('**/jiedan/order/33', (r) => ok(r, fresh))
  await page.route('**/jiedan/order/read', (r) => ok(r, { id: 33, version: fresh.version }))
  await page.route('**/jiedan/order/bug/72/status', (r) => {
    writes.push(r.request().postDataJSON().status)
    fresh.bugs = [{ ...fresh.bugs[0], status: 'action' }]
    return ok(r, fresh)
  })
  await page.goto('/#/order?id=33&tab=bugs')
  const issue = page.locator('.bug-item').filter({ hasText: '首页图片太大' })
  await expect(issue.getByRole('button', { name: '加入逐条处理' })).toHaveCount(0)
  await issue.getByRole('button', { name: '加入处理', exact: true }).click()
  await expect(page.getByText('已加入处理', { exact: true })).toBeVisible()
  expect(writes).toEqual(['action'])
})
