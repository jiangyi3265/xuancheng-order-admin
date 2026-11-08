const { test, expect } = require('@playwright/test')
const { fixture } = require('./fixtures.cjs')

const ok = (route, data) => route.fulfill({ json: { code: 200, data } })
function quote(id, title, fields = {}) {
  return {
    id, title, creatorId: 1, employeeId: 2, status: 'pending', version: 2,
    noticeVersion: 2, readVersion: 2, attachments: [], ...fields
  }
}

async function setup(page, role, rows) {
  await fixture(page, role)
  await page.addInitScript(role => localStorage.setItem('token', 'fixture-' + role), role)
  const writes = []
  await page.route('**/jiedan/quote/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/list')) return ok(route, rows)
    if (path.endsWith('/read')) {
      for (const entry of route.request().postDataJSON()) {
        const current = rows.find(row => row.id === entry.id)
        current.readVersion = entry.noticeVersion
        if (entry.replyVersion) current.replyVersion = 0
      }
      return ok(route, {})
    }
    if (path.endsWith('/conversation')) return ok(route, { items: [], hasMore: false })
    const match = path.match(/\/(\d+)(?:\/price)?$/)
    const row = rows.find(item => item.id === Number(match[1]))
    if (route.request().method() !== 'GET') {
      writes.push(route.request().postDataJSON())
      Object.assign(row, writes.at(-1), { status: 'quoted', version: row.version + 1 })
    }
    return ok(route, row)
  })
  return writes
}

test('报价中心按当前筛选逐张处理，金额和沟通草稿留在原单，旧价格需核对新需求', async ({ page }) => {
  const rows = [
    quote(1, '同组甲'), quote(2, '同组乙', { readVersion: 0 }), quote(3, '同组丙'),
    quote(4, '另一组未读', { readVersion: 0 }),
    quote(5, '同组其他人的邀请', { employeeId: 3, readVersion: 0 }),
    quote(6, '同组已报价', { status: 'quoted', replyVersion: 8 })
  ]
  const writes = await setup(page, 'employee', rows)
  await page.setViewportSize({ width: 320, height: 600 })
  await page.goto('/#/quotes')
  const search = page.getByPlaceholder('搜索单号、项目名称或姓名')
  await search.fill('同组')
  await page.locator('.quote-tabs button').filter({ hasText: '待报价' }).click()
  const firstCard = page.locator('.quote-open').filter({ hasText: '同组甲' })
  await firstCard.click()
  const dialog = page.getByRole('dialog', { name: '报价详情' })
  const heading = name => dialog.getByRole('heading', { name, exact: true })
  const next = dialog.getByRole('button', { name: /下一条待处理/ })
  const amount = dialog.getByRole('spinbutton')
  const note = dialog.getByPlaceholder('例如：包含哪些内容、预计工期、报价有效期')
  await expect(next).toHaveText('下一条待处理（2）')
  await amount.fill('2300')
  await note.fill('含上门安装')
  await dialog.getByRole('button', { name: '报价沟通' }).click()
  const reply = dialog.getByRole('textbox', { name: '回复内容' })
  await reply.fill('请确认上门地址')
  await next.click()
  await expect(heading('同组乙')).toBeVisible()
  await expect(page).toHaveURL(/#\/quotes\?id=2$/)
  await expect(page.getByText(/未提交的金额和说明已保留/)).toBeVisible()
  await expect(note).toHaveValue('')
  await expect(next).toHaveText('下一条待处理（1）')
  await next.click()
  await expect(heading('同组丙')).toBeVisible()
  await expect(next).toHaveCount(0)
  await expect(dialog.getByRole('status')).toHaveText('已到本轮最后一张')
  expect(writes).toHaveLength(0)
  rows[0].requirement = '追加施工范围'
  rows[0].version++
  await dialog.getByRole('button', { name: '关闭', exact: true }).last().click()
  await expect(dialog).toBeHidden()
  await expect(search).toHaveValue('同组')
  await firstCard.click()
  await expect(amount).toHaveValue('2300.00')
  await expect(note).toHaveValue('含上门安装')
  const submit = dialog.getByRole('button', { name: '提交报价' })
  await expect(submit).toBeDisabled()
  await dialog.getByRole('button', { name: '报价沟通' }).click()
  await expect(reply).toHaveValue('请确认上门地址')
  await dialog.getByRole('button', { name: '报价信息' }).click()
  await dialog.getByRole('button', { name: '已核对新需求' }).click()
  await submit.click()
  await expect(dialog.locator('.quote-result')).toContainText('2,300.00')
  expect(writes).toEqual([{ amount: 2300, quoteNote: '含上门安装', version: 3 }])
})

test('工作台从前三张连续打开其余未读，自动排除已经看过及其他人的报价', async ({ page }) => {
  const rows = [1, 2, 3, 4].map(id => quote(id, '方案' + id, { status: 'quoted', readVersion: 0 }))
  rows.push(quote(5, '其他人的回复', { creatorId: 7, replyVersion: 9 }), quote(6, '等待同事填写'))
  const writes = await setup(page, 'boss', rows)
  await page.goto('/#/workbench')
  const panel = page.locator('.workbench-quotes')
  await panel.getByRole('button', { name: '只看未读' }).click()
  await expect(panel.locator('.quote-card')).toHaveCount(3)
  await panel.locator('.quote-open').first().click()
  const dialog = page.getByRole('dialog', { name: '报价详情' })
  const next = dialog.getByRole('button', { name: /下一条待处理/ })
  for (const id of [2, 3, 4]) {
    await expect(next).toHaveText('下一条待处理（' + (5 - id) + '）')
    await next.click()
    await expect(dialog.getByRole('heading', { name: '方案' + id, exact: true })).toBeVisible()
  }
  await expect(next).toHaveCount(0)
  await expect(page).toHaveURL(/#\/workbench$/)
  await expect(dialog.getByRole('status')).toHaveText('已到本轮最后一张')
  await dialog.getByRole('button', { name: '关闭', exact: true }).last().click()
  await expect(dialog).toBeHidden()
  expect(writes).toEqual([])
})

test('提交中锁定本次报价，遇到版本冲突后原地核对新需求并重试', async ({ page }) => {
  const row = quote(21, '设备安装', { requirement: '安装一台设备' })
  const writes = await setup(page, 'employee', [row])
  let firstRequest
  await page.route('**/jiedan/quote/21/price', route => { firstRequest = route }, { times: 1 })
  await page.goto('/#/quotes?id=21')
  const dialog = page.getByRole('dialog', { name: '报价详情' })
  const amount = dialog.getByRole('spinbutton')
  const note = dialog.getByPlaceholder('例如：包含哪些内容、预计工期、报价有效期')
  const submit = dialog.getByRole('button', { name: '提交报价' })
  await amount.fill('2400')
  await note.fill('含上门安装')
  await submit.click()
  await expect.poll(() => Boolean(firstRequest)).toBe(true)
  await expect(amount).toBeDisabled()
  await expect(note).toBeDisabled()
  Object.assign(row, { version: 3, requirement: '增加一台设备' })
  await firstRequest.fulfill({ json: { code: 500, msg: '报价单已更新，请刷新后重试' } })
  await expect(dialog.locator('.quote-requirement')).toHaveText('增加一台设备')
  await expect(submit).toBeDisabled()
  await expect(amount).toHaveValue('2400.00')
  await expect(note).toHaveValue('含上门安装')
  await dialog.getByRole('button', { name: '已核对新需求' }).click()
  await amount.fill('3600')
  await submit.click()
  await expect(dialog.locator('.quote-result')).toContainText('3,600.00')
  expect(writes).toEqual([{ amount: 3600, quoteNote: '含上门安装', version: 3 }])
})

test('另一端重新指派后详情移除原报价人的金额和说明', async ({ page }) => {
  const row = quote(26, '重新询价', { status: 'quoted', employeeName: '原报价人', amount: 1600, quoteNote: '含施工' })
  await setup(page, 'boss', [row])
  await page.goto('/#/quotes?id=26')
  const dialog = page.getByRole('dialog', { name: '报价详情' })
  await expect(dialog.locator('.quote-result')).toContainText('1,600.00')
  Object.assign(row, { version: 3, status: 'pending', employeeId: 3, employeeName: '新报价人' })
  delete row.amount
  delete row.quoteNote
  await page.evaluate(() => dispatchEvent(new Event('focus')))
  await expect(dialog.locator('.quote-info')).toContainText('新报价人')
  await expect(dialog.locator('.quote-result')).toHaveCount(0)
})
