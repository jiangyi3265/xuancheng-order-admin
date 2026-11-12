// 打开项目会标为已读、服务端版本号 +1：紧接着提交验收不能被当成「项目已变化」拒绝；真的被拒时，手机上要看得到原因
const { test, expect } = require('@playwright/test')
const { fixture, order } = require('./fixtures.cjs')
const ok = (route, data) => route.fulfill({ json: { code: 200, data } })

// 员工（小陈，id 2）负责、进行中的项目；打开时服务端把版本从 1 改成 2（标已读）
async function prepare(page, width, readDelay = 0) {
  await fixture(page, 'employee')
  await page.setViewportSize({ width, height: width < 768 ? 844 : 900 })
  await page.addInitScript(() => localStorage.setItem('token', 'fixture-employee'))
  const project = { ...order, unread: [2], bugs: [], actionBugCount: 0, version: 1 }
  await page.route('**/jiedan/order/list', (r) => ok(r, [project]))
  await page.route('**/jiedan/order/1', (r) => ok(r, project))
  await page.route('**/jiedan/order/read', async (r) => {
    if (readDelay) await new Promise((done) => setTimeout(done, readDelay))
    await ok(r, { id: 1, version: 2 })
  })
  const sent = []
  await page.route('**/jiedan/order/status', async (r) => {
    const body = r.request().postDataJSON()
    sent.push(body)
    if (body.version !== 2) return r.fulfill({ json: { code: 409, msg: '项目已变化，请刷新后再操作' } })
    await ok(r, { ...project, status: 'review', version: 3 })
  })
  return sent
}

for (const width of [390, 1366]) {
  test('打开项目后马上提交验收，带的是标已读之后的版本 · ' + width, async ({ page }) => {
    const sent = await prepare(page, width)
    const read = page.waitForResponse('**/jiedan/order/read')
    await page.goto('/#/order?id=1')
    await read
    await page.locator(width < 768 ? '.head-actions-m' : '.head-actions').getByRole('button', { name: '提交验收', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '提交验收', exact: true })
    await dialog.getByRole('textbox').first().fill('首版交付')
    await dialog.getByRole('button', { name: /提交验收$/ }).click()
    await expect(dialog).toBeHidden()
    expect(sent).toEqual([expect.objectContaining({ id: 1, status: 'review', version: 2, note: '首版交付' })])
  })
}

test('验收窗口比「标已读」先打开，提交时也用新版本', async ({ page }) => {
  const sent = await prepare(page, 1366, 1500)
  await page.goto('/#/order?id=1')
  await page.locator('.head-actions').getByRole('button', { name: '提交验收', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '提交验收', exact: true })
  await dialog.getByRole('textbox').first().fill('首版交付')
  await page.waitForResponse('**/jiedan/order/read')
  await dialog.getByRole('button', { name: /提交验收$/ }).click()
  await expect(dialog).toBeHidden()
  expect(sent.map((b) => b.version)).toEqual([2])
})

test('别人真的改过项目时仍然拦下；手机上的错误提示在全屏窗口上面，看得到', async ({ page }) => {
  await fixture(page, 'employee')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => localStorage.setItem('token', 'fixture-employee'))
  const project = { ...order, unread: [], bugs: [], actionBugCount: 0, version: 1 }
  await page.route('**/jiedan/order/list', (r) => ok(r, [project]))
  await page.route('**/jiedan/order/1', (r) => ok(r, project))
  await page.route('**/jiedan/order/read', (r) => ok(r, { id: 1, version: 1 }))
  await page.route('**/jiedan/order/status', (r) => r.fulfill({ json: { code: 409, msg: '项目已变化，请刷新后再操作' } }))
  await page.goto('/#/order?id=1')
  await page.locator('.head-actions-m').getByRole('button', { name: '提交验收', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '提交验收', exact: true })
  await dialog.getByRole('button', { name: /提交验收$/ }).click()
  const message = page.locator('.el-message').filter({ hasText: '项目已变化，请刷新后再操作' })
  await expect(message).toBeVisible()
  await expect(dialog).toBeVisible()
  // 提示条正中间那一点，最上面一层就是提示条本身（没被全屏窗口盖住）
  const onTop = await message.evaluate((el) => {
    const r = el.getBoundingClientRect()
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return !!top && el.contains(top)
  })
  expect(onTop).toBe(true)
})
