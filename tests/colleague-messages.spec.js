// M1–M6。此处全部接口均由 fixture 拦截，微信配置只在内存中模拟。
const { test, expect } = require('@playwright/test')
const { fixture, order } = require('./fixtures.cjs')
const ok = (route, data) => route.fulfill({ json: { code: 200, data } })
const people = [{ id: 1, name: '管理员' }, { id: 2, name: '小陈' }]
async function setup(page, role = 'boss', width = 1440) {
  await fixture(page, role)
  await page.setViewportSize({ width, height: 860 })
  await page.addInitScript(r => localStorage.setItem('token', 'fixture-' + r), role)
  await page.route('**/jiedan/approval/list', r => ok(r, []))
}
async function project(page, value) {
  await page.route('**/jiedan/order/list', r => ok(r, [value]))
  await page.route('**/jiedan/order/1', r => ok(r, value))
  await page.route('**/jiedan/order/1/version', r => ok(r, { version: value.version }))
}

for (const [label, cfg, hint] of [
  ['总开关关闭', { 'push.enabled': 'false', 'push.wecom.user.2': 'mock-id' }, '微信提醒没开，只能在系统里看到'],
  ['没有绑定', { 'push.enabled': 'true' }, '只能在系统里看到'],
  ['企业微信应用未配齐', { 'push.enabled': 'true', 'push.wecom.user.2': 'mock-id' }, '企业微信应用还没配好'],
  ['企业微信', { 'push.enabled': 'true', 'push.wecom.user.2': 'mock-id', 'push.wecom.corpId': 'mock', 'push.wecom.agentId': 'mock', 'push.wecom.secret': '********' }, '微信也会收到'],
  ['仅 SendKey', { 'push.enabled': 'true', 'push.sendkey.2': 'mock-key' }, '微信也会收到']
]) {
  test('M1/M6 默认收件人、取消一次、再次默认并提示渠道：' + label, async ({ page }) => {
    await setup(page)
    const row = { ...order, collaborators: people, unread: [] }
    await project(page, row)
    let configReads = 0
    await page.route('**/jiedan/push/config', r => { configReads++; return ok(r, cfg) })
    const payloads = []
    await page.route('**/jiedan/order/progress', r => {
      payloads.push(r.request().postDataJSON())
      return ok(r, row)
    })
    await page.goto('/#/order?id=1&tab=internal')
    const panel = page.locator('.record-panel')
    const input = panel.locator('textarea')
    const chip = panel.getByRole('button', { name: '@小陈' })
    await expect(chip).toHaveAttribute('aria-pressed', 'true')
    await expect(input).toHaveAttribute('placeholder', /写给 小陈/)
    await chip.click()
    await input.fill('只做内部备忘')
    await panel.getByRole('button', { name: '只记录' }).click()
    await expect(chip).toHaveAttribute('aria-pressed', 'true')
    expect(payloads[0].mentions).toBeUndefined()
    await input.fill('下班前改好')
    await panel.getByRole('button', { name: '发给 小陈' }).click()
    await expect(page.locator('.el-message').filter({ hasText: hint })).toBeVisible()
    expect(payloads[1].mentions).toEqual([2])
    expect(configReads).toBe(1)
  })
}

test('M6 成员名单只有两种微信接收方式都为空才显示提示，更新绑定后立即消失', async ({ page }) => {
  await setup(page)
  const cfg = { 'push.enabled': 'true', 'push.sendkey.1': 'mock-key', 'push.wecom.corpId': 'mock', 'push.wecom.agentId': 'mock', 'push.wecom.secret': '********' }
  const row = { ...order, collaborators: people, unread: [] }
  await project(page, row)
  await page.route('**/jiedan/order/progress', r => ok(r, row))
  async function sendWithHint(expected) {
    await page.goto('/#/order?id=1&tab=internal')
    await page.locator('.record-panel textarea').fill('请核对需求')
    await page.getByRole('button', { name: '发给 小陈', exact: true }).click()
    await expect(page.locator('.el-message').filter({ hasText: expected })).toBeVisible()
  }
  await page.route('**/jiedan/push/config', r => {
    if (r.request().method() === 'POST') Object.assign(cfg, r.request().postDataJSON())
    return ok(r, cfg)
  })
  await sendWithHint('只能在系统里看到')
  await page.goto('/#/staff')
  const missing = page.locator('.el-table__body tr').filter({ hasText: '小陈' })
  await expect(missing).toContainText('收不到微信提醒')
  await expect(page.locator('.el-table__body tr').filter({ hasText: '管理员' })).not.toContainText('收不到微信提醒')
  await missing.getByText('未填，点击填写').click()
  await missing.locator('input').fill('mock-id')
  await missing.locator('input').press('Enter')
  await expect(missing).not.toContainText('收不到微信提醒')
  await sendWithHint('微信也会收到')
})

test('M2/M4 附件留言、消息中心和催办卡片文案，对知道了连点只提交一次', async ({ page }) => {
  await setup(page, 'employee', 390)
  const row = { ...order, deadline: '', unread: [2], myMention: { from: '管理员', content: '（无文字）' } }
  await project(page, row)
  let reads = 0
  await page.route('**/jiedan/order/read', async r => {
    reads++
    await new Promise(done => setTimeout(done, 100))
    row.unread = []; row.myMention = null
    await ok(r, { version: ++row.version })
  })
  await page.goto('/#/messages')
  await expect(page.locator('.message-card')).toContainText('管理员 发来了图片 / 文件')
  await page.locator('.mobile-nav').getByLabel('工作台').click()
  let btn = page.getByRole('button', { name: '知道了', exact: true })
  await btn.evaluate(el => { el.click(); el.click() })
  await expect(btn).toHaveCount(0)
  expect(reads).toBe(1)
  row.unread = [2]; row.lastEvent = { type: 'note', user: '管理员', content: '管理员 催了一下：' + row.title }
  await page.reload()
  await expect(page.locator('.wb-todo')).toContainText('管理员 催你跟进这个项目')
  await expect(page.getByRole('button', { name: '写进展', exact: true })).toBeVisible()
  await btn.click()
  await expect(btn).toHaveCount(0)
  expect(reads).toBe(2)
})

for (const width of [390, 1440]) {
  test('M3 普通项目直达内部，聊天链接等待切页，保留新标记 ' + width, async ({ page }) => {
    await setup(page, 'employee', width)
    const entry = { id: 30, type: 'note', user: '管理员', content: '确认样式', mentions: [{ memberId: 2, read: false }] }
    const row = { ...order, unread: [2], myMention: { from: '管理员', content: '确认样式' }, timeline: [entry] }
    let reads = 0
    await project(page, row)
    await page.route('**/jiedan/order/read', r => { reads++; return ok(r, { version: 1 }) })
    await page.goto('/#/order?id=1&tab=chat')
    await expect(page.locator('.chat-panel')).toBeVisible()
    await expect(page.locator('.record-panel')).toBeHidden()
    expect(reads).toBe(0)
    const tabs = page.locator(width === 390 ? '.workspace-mobile-tabs' : '.workspace-tabs')
    await tabs.getByText('内部', { exact: true }).click()
    await expect.poll(() => reads).toBe(1)
    await expect(page.locator('.unread-note .new-note-label')).toBeInViewport()
    await page.goto('/#/order')
    await page.getByRole('button', { name: '关闭项目详情' }).first().waitFor({ state: 'hidden' })
    row.timeline = [{ ...entry, id: 31 }]
    row.version++
    await page.goto('/#/order?id=1')
    await expect(page.locator('.unread-note .new-note-label')).toBeInViewport()
    await expect.poll(() => reads).toBe(2)
    if (width === 390) await expect(page.locator('.record-panel textarea')).not.toBeFocused()
  })
}

test('M5 同一分钟同文两条留言分别提醒，轮询不重弹，点击最后一条直接定位', async ({ page }) => {
  await setup(page, 'employee')
  const row = { ...order, deadline: '', unread: [], timeline: [], lastEvent: null, myMention: null }
  await project(page, row)
  await page.route('**/jiedan/order/stamp', r => ok(r, { stamp: row.version }))
  await page.goto('/#/messages')
  await expect(page.getByText('暂无新消息，项目动态会出现在这里')).toBeVisible()
  await page.waitForLoadState('networkidle')
  const poll = () => page.evaluate(() => window.dispatchEvent(new Event('focus')))
  const notices = page.locator('.el-notification').filter({ hasText: '请看附件' })
  for (const id of [31, 32]) {
    row.unread = [2]
    row.version++
    const entry = { id, user: '管理员', content: '请看附件', time: '2026-11-10 10:01', type: 'note', mentions: [{ memberId: 2, read: false }] }
    row.lastEvent = entry
    row.myMention = { from: entry.user, content: entry.content, time: entry.time }
    row.timeline = [...row.timeline, entry]
    const loaded = page.waitForResponse(r => new URL(r.url()).pathname === '/jiedan/order/1')
    await poll()
    await loaded
    await expect(notices).toHaveCount(1)
    await expect(notices).toBeVisible()
  }
  await poll()
  await notices.click()
  await expect(page).toHaveURL(/tab=internal&entry=32/)
  await expect(page.locator('.notice-target')).toHaveAttribute('data-notice-id', '32')
})
