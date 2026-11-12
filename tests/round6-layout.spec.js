// 第六轮：几处显示问题——逾期卡片要看得到金额和状态、极速建单标签不竖排、登记收款标签靠左、电脑列表的逾期日期不拆行、消息中心说法和工作台一致
const { test, expect } = require('@playwright/test')
const { fixture, order } = require('./fixtures.cjs')
const ok = (route, data) => route.fulfill({ json: { code: 200, data } })

async function asBoss(page, width, view) {
  await fixture(page, 'boss')
  await page.setViewportSize({ width, height: width < 768 ? 844 : 900 })
  await page.addInitScript((v) => { localStorage.setItem('token', 'fixture-boss'); if (v) localStorage.setItem('xc.orderView', v) }, view)
}
const late = { ...order, id: 41, title: '已经逾期的项目', deadline: '2026-01-05', status: 'doing', amount: 8000, unread: [] }

test('手机项目列表：逾期的项目照样显示金额和状态，另加「逾期」', async ({ page }) => {
  await asBoss(page, 390, 'list')
  await page.route('**/jiedan/order/list', (r) => ok(r, [late]))
  await page.goto('/#/order')
  const meta = page.locator('.board-project-meta').filter({ has: page.getByText('逾期', { exact: true }) })
  await expect(meta).toContainText('¥8,000')
  await expect(meta).toContainText('进行中')
})

test('电脑项目列表：「逾期 · 日期」在一行里，不被拆开', async ({ page }) => {
  await asBoss(page, 1366, 'list')
  await page.route('**/jiedan/order/list', (r) => ok(r, [late]))
  await page.goto('/#/order')
  const cell = page.locator('.el-table__row').filter({ hasText: '已经逾期的项目' }).locator('span.red-text').filter({ hasText: '逾期' })
  await expect(cell).toHaveText('逾期 · 01-05')
  const lines = await cell.evaluate((el) => el.getClientRects().length)
  expect(lines).toBe(1)
})

for (const width of [390, 1366]) {
  test('极速建单：「客户 / 渠道 / 派给」标签各占一行，不被挤成竖排 · ' + width, async ({ page }) => {
    await asBoss(page, width)
    await page.goto('/#/order')
    await page.getByRole('button', { name: /极速建单/ }).first().click()
    const labels = page.locator('.qc-label')
    await expect(labels.first()).toBeVisible()
    // 数文字占了几行：两个字分在两行就是被挤成竖排了
    const rows = await labels.evaluateAll((els) => els.map((el) => {
      const text = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim())
      const range = document.createRange(); range.selectNodeContents(text)
      return { text: el.innerText.trim(), lines: new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size }
    }))
    expect(rows.map((r) => r.text)).toEqual(expect.arrayContaining(['客户', '渠道']))
    for (const r of rows) expect(r.lines, r.text).toBe(1)
  })
}

test('手机登记收款：「收到 / 日期 / 备注」靠左放在输入框上面', async ({ page }) => {
  await asBoss(page, 390, 'list')
  await page.goto('/#/order')
  await page.locator('.board-project-row').first().click()
  await page.getByRole('button', { name: /更多操作/ }).click()
  await page.getByRole('menuitem', { name: '记收款', exact: true }).click()
  const form = page.getByRole('dialog', { name: '登记收款' }).locator('.pay-form')
  await expect(form).toBeVisible()
  const rows = await form.locator('.el-form-item').evaluateAll((items) => items.map((item) => {
    const label = item.querySelector('.el-form-item__label')
    const field = item.querySelector('.el-form-item__content')
    const range = document.createRange(); range.selectNodeContents(label)
    return { text: label.innerText, textLeft: range.getBoundingClientRect().left, fieldLeft: field.getBoundingClientRect().left }
  }))
  expect(rows.map((r) => r.text)).toEqual(['收到', '日期', '备注'])
  for (const r of rows) expect(Math.abs(r.textLeft - r.fieldLeft), r.text).toBeLessThan(20)
})

test('消息中心顶部的说明指向工作台的「轮到我」', async ({ page }) => {
  await asBoss(page, 1366)
  await page.goto('/#/messages')
  await expect(page.locator('.page-heading')).toContainText('工作台「轮到我」')
  await expect(page.locator('.page-heading')).not.toContainText('需要我处理')
})
