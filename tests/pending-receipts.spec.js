const { test, expect } = require('@playwright/test')
const { fixture, order } = require('./fixtures.cjs')

for (const width of [390, 1440]) {
  test('提醒回执随事项显示，刷新后可筛选并继续处理 ' + width, async ({ page }) => {
    await fixture(page, 'boss')
    await page.setViewportSize({ width, height: 844 })
    await page.addInitScript(() => localStorage.setItem('token', 'fixture-boss'))
    const row = { ...order, nextStep: '确认初稿', urgentUntil: '2028-03-01 14:00', handled: false,
      handledTime: null, actionBugCount: 0, version: 1,
      reminderReceipts: { next: { by: '费鹏飞', at: '2026-11-08 10:30:12' } } }
    await page.route('**/jiedan/order/list', r => r.fulfill({ json: { code: 200, data: [row] } }))
    await page.route('**/pending-reminder', r => {
      expect(r.request().postDataJSON().kind).toBe('urgent')
      row.reminderReceipts.urgent = { by: '尚琦凯', at: '2026-11-08 11:10:00' }
      row.version++
      return r.fulfill({ json: { code: 200 } })
    })
    await page.goto('/#/order')
    const area = page.getByRole('region', { name: /^待处理/ })
    const next = area.getByRole('listitem').filter({ hasText: '确认初稿' })
    const filter = area.getByRole('button', { name: /只看未提醒/ })
    await expect(next).toContainText('2026-11-08 10:30 · 费鹏飞 已提醒')
    await expect(next.getByRole('button')).toHaveText('再提醒')
    await filter.click()
    await expect(next).toHaveCount(0)
    await area.getByRole('listitem').getByRole('button').click()
    await expect(area).toContainText('当前待处理事项都已提醒')
    await expect(filter).toHaveAttribute('aria-pressed', 'true')
    await filter.click()
    await expect(area.getByRole('listitem')).toHaveCount(2)
    await page.reload()
    await expect(area.getByText('再提醒', { exact: true })).toHaveCount(2)
    await expect(area).toContainText('11:10 · 尚琦凯 已提醒')
    await expect(area.getByRole('link').first()).toHaveAttribute('href', /order\?id=1/)
  })
}
