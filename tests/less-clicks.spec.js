// 少点几下：打开就能打字、回车就提交；多选批量改派；「还欠款」里每行直接催款；导出和搜索结果一致
const { test, expect } = require('@playwright/test')
const { fixture, order } = require('./fixtures.cjs')
const ok = (route, data) => route.fulfill({ json: { code: 200, data } })
const pad = (n) => String(n).padStart(2, '0')
const now = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}` }

async function as(page, role, width = 1366) {
  await fixture(page, role)
  await page.setViewportSize({ width, height: 900 })
  await page.addInitScript((r) => localStorage.setItem('token', 'fixture-' + r), role)
  await page.addInitScript(() => {
    window.__copied = []
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => { window.__copied.push(t) } } })
  })
}
const listView = (page) => page.addInitScript(() => localStorage.setItem('xc.orderView', 'list'))

test('工作台点「回复」：打开后光标就在回复框里；普通打开项目不抢光标', async ({ page }) => {
  await as(page, 'boss')
  const asked = { ...order, ownerId: 1, unread: [], lastMessage: { type: 'message', user: '林女士', content: '首页什么时候能看？', time: now() } }
  await page.route('**/jiedan/order/list', (r) => ok(r, [asked]))
  await page.route('**/jiedan/order/1', (r) => ok(r, asked))
  await page.route('**/jiedan/approval/list', (r) => ok(r, []))
  await page.goto('/#/workbench')
  const card = page.locator('.row-card.todo').filter({ hasText: '品牌官网设计' })
  await expect(card).toContainText('客户：首页什么时候能看？')
  await card.getByRole('button', { name: '回复' }).click()
  const input = page.locator('.chat-panel').getByLabel('回复客户')
  await expect(input).toBeFocused()
  // 直接打字、回车就发出去了
  let sent = null
  await page.route('**/jiedan/order/progress', async (r) => { sent = r.request().postDataJSON(); await ok(r, asked) })
  await page.keyboard.type('明天上午发您')
  await page.keyboard.press('Enter')
  await expect.poll(() => sent).toEqual(expect.objectContaining({ orderId: 1, type: 'reply', content: '明天上午发您' }))

  // 点卡片本身（不是「回复」）：只是打开项目，光标不进回复框
  await page.locator('.close-btn').click()
  await card.locator('.rc-title').click()
  await expect(page.locator('.chat-panel')).toBeVisible()
  await page.waitForTimeout(600)
  await expect(input).not.toBeFocused()
})

test('手机上点「回复」不自动弹键盘', async ({ page }) => {
  await as(page, 'boss', 390)
  const asked = { ...order, ownerId: 1, unread: [], lastMessage: { type: 'message', user: '林女士', content: '首页什么时候能看？', time: now() } }
  await page.route('**/jiedan/order/list', (r) => ok(r, [asked]))
  await page.route('**/jiedan/order/1', (r) => ok(r, asked))
  await page.route('**/jiedan/approval/list', (r) => ok(r, []))
  await page.goto('/#/workbench')
  await page.locator('.wb-todo').filter({ hasText: '品牌官网设计' }).getByRole('button', { name: '回复' }).click()
  const input = page.locator('.chat-panel').getByLabel('回复客户')
  await expect(input).toBeVisible()
  await page.waitForTimeout(600)
  await expect(input).not.toBeFocused()
})

test('记收款：光标在金额上并且全选，打个数字按回车就记完', async ({ page }) => {
  await as(page, 'boss')
  let body = null
  await page.route('**/jiedan/order/1/payment', async (r) => {
    body = r.request().postDataJSON()
    await ok(r, { ...order, receivedAmount: 5000 })
  })
  await page.goto('/#/order?id=1')
  await page.locator('.desc').getByRole('button', { name: '记收款' }).click()
  const dialog = page.getByRole('dialog', { name: '登记收款' })
  const amount = dialog.locator('.el-input-number input')
  await expect(amount).toHaveValue('5800.00')
  await expect(amount).toBeFocused()
  // 全选着：直接打数字就把原来的换掉了
  await page.keyboard.type('2000')
  await page.keyboard.press('Enter')
  await expect.poll(() => body).toEqual(expect.objectContaining({ amount: 2000 }))
  await expect(page.getByText('已记收款 ¥2,000')).toBeVisible()
  await expect(dialog).toBeHidden()
})

test('记收款：金额不用改时，点开直接按回车就是收清', async ({ page }) => {
  await as(page, 'boss')
  let body = null
  await page.route('**/jiedan/order/1/payment', async (r) => {
    body = r.request().postDataJSON()
    await ok(r, { ...order, receivedAmount: 8800 })
  })
  await page.goto('/#/order?id=1')
  await page.locator('.desc').getByRole('button', { name: '记收款' }).click()
  const amount = page.getByRole('dialog', { name: '登记收款' }).locator('.el-input-number input')
  await expect(amount).toBeFocused()
  await page.keyboard.press('Enter')
  await expect.poll(() => body).toEqual(expect.objectContaining({ amount: 5800 }))
})

test('记一条问题：点开光标就在输入框里', async ({ page }) => {
  await as(page, 'boss')
  await page.goto('/#/order?id=1')
  await page.locator('.bug-panel').getByRole('button', { name: '记一条问题' }).click()
  await expect(page.getByPlaceholder('写清楚是什么问题，可以直接粘贴截图')).toBeFocused()
})

test('新建客户账号：打开光标在「账号」里，填完按回车就创建', async ({ page }) => {
  await as(page, 'boss')
  const posts = []
  await page.route('**/jiedan/customer', async (r) => {
    if (r.request().method() !== 'POST') return r.fallback()
    posts.push(r.request().postDataJSON())
    await ok(r, null)
  })
  await page.goto('/#/customers')
  await page.getByRole('button', { name: '新建客户账号' }).click()
  const d = page.getByRole('dialog', { name: '新建客户账号' })
  const account = d.getByPlaceholder('客户登录用，字母/数字')
  await expect(account).toBeFocused()
  await page.keyboard.type('kh90003')
  await page.keyboard.press('Enter')
  await expect.poll(() => posts.length).toBe(1)
  expect(posts[0]).toEqual(expect.objectContaining({ userName: 'kh90003' }))
  await expect(page.locator('.login-info-notice')).toContainText('账号：kh90003')
})

test('新增成员：打开光标在「登录账号」里，没填全时回车只提示不提交，填全了回车创建', async ({ page }) => {
  await as(page, 'boss')
  const posts = []
  await page.route('**/jiedan/staff', async (r) => {
    if (r.request().method() !== 'POST') return r.fallback()
    posts.push(r.request().postDataJSON())
    await ok(r, null)
  })
  await page.goto('/#/staff')
  await page.getByRole('button', { name: '新增成员' }).click()
  const d = page.getByRole('dialog', { name: '新增成员' })
  await expect(d.getByPlaceholder('登录用，字母/数字/下划线')).toBeFocused()
  await page.keyboard.type('xiaoli')
  await page.keyboard.press('Enter')
  // 姓名必填：这时不会提交
  await expect(d.getByText('请填写姓名')).toBeVisible()
  expect(posts.length).toBe(0)
  await d.getByPlaceholder('显示在项目负责人处，如 费鹏飞').fill('小李')
  await page.keyboard.press('Enter')
  await expect.poll(() => posts.length).toBe(1)
  expect(posts[0]).toEqual(expect.objectContaining({ userName: 'xiaoli', nickName: '小李' }))
})

test('编辑项目里新建客户账号：昵称按客户称呼带过来、密码自动给，只填账号回车就建好并绑定', async ({ page }) => {
  await as(page, 'boss')
  let body = null
  await page.route('**/jiedan/customer', async (r) => {
    if (r.request().method() !== 'POST') return r.fallback()
    body = r.request().postDataJSON()
    await ok(r, null)
  })
  await page.goto('/#/order?id=1')
  await page.locator('.head-actions').getByRole('button', { name: '编辑' }).click()
  const edit = page.getByRole('dialog', { name: '编辑项目' })
  await expect(edit).toBeVisible()
  // 编辑时不抢光标到项目名
  await page.waitForTimeout(500)
  await expect(edit.getByPlaceholder('一句话写清做什么，比如：餐饮点餐小程序')).not.toBeFocused()
  await edit.getByRole('button', { name: '新建账号' }).click()
  const d = page.getByRole('dialog', { name: '新建客户账号' })
  await expect(d.getByPlaceholder('选填，如公司/称呼')).toHaveValue('林女士')
  const pwd = await d.getByPlaceholder('5-20 位').inputValue()
  expect(pwd).toMatch(/^[a-hj-km-np-z]{4}[2-9]{4}$/)
  await expect(d.getByPlaceholder('5-20 位')).toHaveAttribute('type', 'text')
  await expect(d.getByPlaceholder('客户登录用，字母/数字')).toBeFocused()
  await page.keyboard.type('kh90004')
  await page.keyboard.press('Enter')
  await expect.poll(() => body).toEqual(expect.objectContaining({ userName: 'kh90004', nickName: '林女士', password: pwd }))
  await expect(page.getByText('账号已创建并绑定到本项目')).toBeVisible()
  await expect(page.locator('.login-info-notice')).toContainText('密码：' + pwd)
})

test('完整建单：打开光标在「项目名」里', async ({ page }) => {
  await as(page, 'boss')
  await listView(page)
  await page.goto('/#/order')
  await page.locator('.toolbar').getByRole('button', { name: '新建项目' }).click()
  await expect(page.getByRole('dialog', { name: '新建项目' }).getByPlaceholder('一句话写清做什么，比如：餐饮点餐小程序')).toBeFocused()
})

const A = { ...order, id: 11, title: '甲单', ownerId: 1, status: 'doing', unread: [] }
const B = { ...order, id: 12, title: '乙单', ownerId: 1, status: 'review', unread: [] }
const C = { ...order, id: 13, title: '丙单', ownerId: 2, status: 'doing', unread: [] }
const D = { ...order, id: 14, title: '丁单', ownerId: 1, status: 'done', unread: [] }

test('多选后「批量派给…」：一次把选中的单子转给一个人，已结束的和本来就是 TA 的不动', async ({ page }) => {
  await as(page, 'boss')
  await listView(page)
  await page.route('**/jiedan/order/list', (r) => ok(r, [A, B, C, D]))
  const puts = []
  await page.route('**/jiedan/order', async (r) => {
    if (r.request().method() !== 'PUT') return r.fallback()
    const b = r.request().postDataJSON()
    puts.push(b)
    await ok(r, { ...[A, B, C, D].find((o) => o.id === b.id), ownerId: b.ownerId, assignState: 'pending' })
  })
  await page.goto('/#/order')
  await page.getByRole('button', { name: '多选项目' }).click()
  const bar = page.locator('.project-batch-bar')
  // 没选项目时点不了
  await expect(bar.getByRole('button', { name: '批量派给…' })).toBeDisabled()
  await bar.getByText('全选当前展示').click()
  await expect(bar.getByRole('status')).toHaveText('已选 4 项')
  await bar.getByRole('button', { name: '批量派给…' }).click()
  await page.getByRole('menuitem', { name: '小陈' }).click()
  const box = page.locator('.el-message-box')
  await expect(box).toContainText('把选中的 2 个项目派给「小陈」')
  await expect(box).toContainText('另外 2 个已经结束或本来就在 TA 名下，不动')
  await box.getByRole('button', { name: '确认改派' }).click()
  await expect(page.getByText('已把 2 个项目派给「小陈」')).toBeVisible()
  expect(puts.sort((a, b) => a.id - b.id)).toEqual([{ id: 11, ownerId: 2 }, { id: 12, ownerId: 2 }])
  // 列表里负责人跟着变了
  await expect(page.locator('.el-table__body tr').filter({ hasText: '甲单' })).toContainText('小陈')
})

test('批量派给：选中的都不用动时只提示，不发请求；员工没有这个按钮', async ({ page }) => {
  await as(page, 'boss')
  await listView(page)
  await page.route('**/jiedan/order/list', (r) => ok(r, [C, D]))
  let puts = 0
  await page.route('**/jiedan/order', async (r) => {
    if (r.request().method() !== 'PUT') return r.fallback()
    puts++
    await ok(r, C)
  })
  await page.goto('/#/order')
  await page.getByRole('button', { name: '多选项目' }).click()
  const bar = page.locator('.project-batch-bar')
  await bar.getByText('全选当前展示').click()
  await bar.getByRole('button', { name: '批量派给…' }).click()
  await page.getByRole('menuitem', { name: '小陈' }).click()
  await expect(page.getByText('不用改派')).toBeVisible()
  await expect(page.locator('.el-message-box')).toHaveCount(0)
  expect(puts).toBe(0)

  const staff = await page.context().newPage()
  await as(staff, 'employee')
  await listView(staff)
  await staff.goto('/#/order')
  await staff.getByRole('button', { name: '多选项目' }).click()
  await expect(staff.locator('.project-batch-bar').getByRole('button', { name: '批量修改状态' })).toBeVisible()
  await expect(staff.locator('.project-batch-bar').getByRole('button', { name: '批量派给…' })).toHaveCount(0)
})

test('看「还欠款」时每行直接「催款」；别的分组里不多这个按钮', async ({ page }) => {
  await as(page, 'boss')
  await listView(page)
  await page.goto('/#/order')
  const row = page.locator('.el-table__body tr').filter({ hasText: '品牌官网设计' })
  await expect(row).toHaveCount(1)
  await expect(page.getByRole('button', { name: '催款', exact: true })).toHaveCount(0)
  await page.locator('.qchip').filter({ hasText: '还欠款' }).click()
  await row.getByRole('button', { name: '催款', exact: true }).click()
  const text = (await page.evaluate(() => window.__copied))[0]
  expect(text).toContain('林女士，您好！「品牌官网设计」的款项跟您对一下')
  expect(text).toContain('总价 ¥8,800，已收 ¥3,000，还差 ¥5,800。')
  await expect(page.getByText('催款的话已复制')).toBeVisible()
  // 没把详情点开
  await expect(page.locator('.workspace')).toHaveCount(0)
  // 四个按钮排在一行里，没有被挤换行
  const cell = row.locator('td').last()
  expect((await cell.boundingBox()).height).toBeLessThan(70)
})

test('员工看「还欠款」没有「催款」', async ({ page }) => {
  await as(page, 'employee')
  await listView(page)
  await page.goto('/#/order')
  await page.locator('.qchip').filter({ hasText: '还欠款' }).click()
  await expect(page.locator('.el-table__body tr').filter({ hasText: '品牌官网设计' })).toHaveCount(1)
  await expect(page.getByRole('button', { name: '催款', exact: true })).toHaveCount(0)
})

test('导出和屏幕一致：搜索时「全部」里含待确认，导出也不再把待确认去掉', async ({ page }) => {
  await as(page, 'boss')
  await listView(page)
  const urls = []
  await page.route('**/jiedan/order/export**', async (r) => {
    urls.push(new URL(r.request().url()).searchParams)
    await r.fulfill({ status: 200, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', body: 'x' })
  })
  await page.goto('/#/order')
  await expect(page.locator('.el-table__body tr').filter({ hasText: '品牌官网设计' })).toHaveCount(1)
  await page.getByRole('button', { name: '导出 Excel' }).click()
  await expect.poll(() => urls.length).toBe(1)
  expect(urls[0].get('confirmedOnly')).toBe('1')

  await page.getByPlaceholder('搜项目名 / 客户 / 联系方式 / 需求').fill('商城会员')
  await expect(page.locator('.el-table__body tr').filter({ hasText: '商城会员系统' })).toHaveCount(1)
  await page.getByRole('button', { name: '导出 Excel' }).click()
  await expect.poll(() => urls.length).toBe(2)
  expect(urls[1].get('keyword')).toBe('商城会员')
  expect(urls[1].get('confirmedOnly')).toBeNull()
})

test('数据统计：欠款名单的字够深，看得清', async ({ page }) => {
  await as(page, 'boss')
  const done = { ...order, id: 21, title: '做完没收齐的单', status: 'done', unread: [] }
  await page.route('**/jiedan/order/list', (r) => ok(r, [done]))
  await page.goto('/#/dashboard')
  const tag = page.locator('.overdue-alert .alert-tag').first()
  await expect(tag).toContainText('做完没收齐的单')
  // 深棕色字（以前是浅橙色，在浅底上几乎看不见）
  await expect(tag).toHaveCSS('color', 'rgb(138, 82, 0)')
  await expect(page.locator('.overdue-alert .el-alert__title').first()).toHaveCSS('color', 'rgb(138, 82, 0)')
})
