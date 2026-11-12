// 老板省事的几处：列表搜索不分状态、客户沟通「常用语」、催客户验收、复制催款话术
const { test, expect } = require('@playwright/test')
const { fixture, order } = require('./fixtures.cjs')
const ok = (route, data) => route.fulfill({ json: { code: 200, data } })
const pad = (n) => String(n).padStart(2, '0')
const stamp = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
const daysAgo = (n) => stamp(new Date(Date.now() - n * 86400000 - 3600000))
const now = () => stamp(new Date())

async function as(page, role, width = 1366) {
  await fixture(page, role)
  await page.setViewportSize({ width, height: 900 })
  await page.addInitScript((r) => localStorage.setItem('token', 'fixture-' + r), role)
  // 把复制出去的内容记下来，方便核对
  await page.addInitScript(() => {
    window.__copied = []
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => { window.__copied.push(t) } } })
  })
}
const copied = (page) => page.evaluate(() => window.__copied)

test('列表里「全部」平时不含待确认，但搜索时待确认的项目也搜得到', async ({ page }) => {
  await as(page, 'boss')
  await page.addInitScript(() => localStorage.setItem('xc.orderView', 'list'))
  await page.goto('/#/order')
  const rows = page.locator('.el-table__body tr')
  await expect(rows.filter({ hasText: '品牌官网设计' })).toHaveCount(1)
  // 平时：待确认的不在「全部」里
  await expect(rows.filter({ hasText: '商城会员系统' })).toHaveCount(0)
  await page.getByPlaceholder('搜项目名 / 客户 / 联系方式 / 需求').fill('商城会员')
  await expect(rows.filter({ hasText: '商城会员系统' })).toHaveCount(1)
  await expect(page.locator('.qchip').filter({ hasText: '全部' }).locator('b')).toHaveText('1')
  await expect(page.getByText('没有符合筛选条件的项目')).toHaveCount(0)
})

test('常用语：点一句填进回复框；老板能增删并保存，员工只能用', async ({ page }) => {
  await as(page, 'boss')
  // 老板以前存过两句
  await page.route('**/jiedan/push/config', async (r) => {
    if (r.request().method() === 'POST') return ok(r, null)
    await ok(r, { 'push.enabled': 'false', 'push.phrase.1': '稿子发你了，请查看', 'push.phrase.2': '收到，马上处理' })
  })
  await page.goto('/#/order?id=1&tab=chat')
  const panel = page.locator('.chat-panel')
  await panel.getByRole('button', { name: '常用语' }).click()
  const box = page.locator('.phrase-box')
  await expect(box.locator('.phrase-item')).toHaveText(['稿子发你了，请查看', '收到，马上处理'])
  await box.locator('.phrase-item').first().click()
  const input = panel.getByLabel('回复客户')
  await expect(input).toHaveValue('稿子发你了，请查看')
  await expect(input).toBeFocused()
  // 已经有字时接在后面
  await input.fill('王总')
  await panel.getByRole('button', { name: '常用语' }).click()
  await box.locator('.phrase-item').nth(1).click()
  await expect(input).toHaveValue('王总，收到，马上处理')

  // 老板编辑：删掉第一句，加一句，保存
  await panel.getByRole('button', { name: '常用语' }).click()
  await box.getByRole('button', { name: '编辑常用语' }).click()
  await box.getByRole('button', { name: '删除常用语 1' }).click()
  await box.getByRole('button', { name: '+ 加一句' }).click()
  await box.getByRole('textbox', { name: '常用语 2' }).fill('尾款麻烦安排一下')
  const saved = page.waitForRequest((q) => q.url().includes('/jiedan/push/config') && q.method() === 'POST')
  await box.getByRole('button', { name: '保存' }).click()
  const body = (await saved).postDataJSON()
  expect(body['push.phrase.1']).toBe('收到，马上处理')
  expect(body['push.phrase.2']).toBe('尾款麻烦安排一下')
  expect(body['push.phrase.3']).toBe('')
  await expect(box.locator('.phrase-item')).toHaveText(['收到，马上处理', '尾款麻烦安排一下'])
})

test('常用语：没存过时有默认的几句；员工看不到「编辑常用语」', async ({ page }) => {
  await as(page, 'employee')
  await page.goto('/#/order?id=1&tab=chat')
  await page.locator('.chat-panel').getByRole('button', { name: '常用语' }).click()
  const box = page.locator('.phrase-box')
  await expect(box.locator('.phrase-item').first()).toContainText('需求收到了')
  await expect(box.getByRole('button', { name: '编辑常用语' })).toHaveCount(0)
})

test('待验收：写出交付几天了，一键催客户验收；今天催过就只复制不重发', async ({ page }) => {
  await as(page, 'boss')
  const review = { ...order, status: 'review', timeline: [
    ...order.timeline,
    { id: 3, type: 'status', user: '小陈', content: '状态更新为「待验收」', time: daysAgo(2), attachments: [] }
  ] }
  await page.route('**/jiedan/order/list', (r) => ok(r, [review]))
  await page.route('**/jiedan/order/1', (r) => ok(r, review))
  const sent = []
  await page.route('**/jiedan/order/progress', async (r) => {
    const b = r.request().postDataJSON()
    sent.push(b)
    await ok(r, { ...review, timeline: [...review.timeline, { id: 4, type: 'reply', user: '管理员', content: b.content, time: now(), attachments: [] }] })
  })
  await page.goto('/#/order?id=1&tab=chat')
  const bar = page.locator('.chat-await')
  await expect(bar).toContainText('交付 2 天了，客户还没验收')
  await bar.getByRole('button', { name: '催客户验收' }).click()
  await expect.poll(() => sent.length).toBe(1)
  expect(sent[0]).toEqual(expect.objectContaining({ orderId: 1, type: 'reply' }))
  expect(sent[0].content).toContain('「品牌官网设计」已经做完交付了，麻烦抽空验收一下')
  // 同样的话带着登录地址复制好了
  expect((await copied(page))[0]).toContain('查看地址：')
  // 今天催过：按钮变成只复制
  await expect(bar.getByRole('button', { name: '今天已催' })).toBeVisible()
  await bar.getByRole('button', { name: '今天已催' }).click()
  await expect.poll(async () => (await copied(page)).length).toBe(2)
  expect(sent.length).toBe(1)
})

test('没绑客户账号、或不在待验收的项目，不出现催客户验收', async ({ page }) => {
  await as(page, 'boss')
  await page.route('**/jiedan/order/1', (r) => ok(r, { ...order, status: 'review', customerAccount: '' }))
  await page.goto('/#/order?id=1&tab=chat')
  await expect(page.locator('.chat-panel')).toBeVisible()
  await expect(page.locator('.chat-await')).toHaveCount(0)
})

test('工作台和看板：等客户验收的项目能直接催，卡片上写出几天没动静', async ({ page }) => {
  await as(page, 'boss')
  const review = { ...order, id: 5, title: '等客户验收的单', status: 'review', unread: [], deadline: '', updateTime: daysAgo(5) + ':00', lastMessage: undefined }
  const noCustomer = { ...order, id: 6, title: '没绑客户的单', status: 'review', unread: [], deadline: '', customerAccount: '', updateTime: daysAgo(5) + ':00', lastMessage: undefined }
  await page.route('**/jiedan/order/list', (r) => ok(r, [review, noCustomer]))
  await page.route('**/jiedan/approval/list', (r) => ok(r, []))
  const sent = []
  await page.route('**/jiedan/order/progress', async (r) => { sent.push(r.request().postDataJSON()); await ok(r, review) })
  await page.goto('/#/workbench')
  const cards = page.locator('.handoff-card[data-kind="deliveryReview"]')
  const card = cards.filter({ hasText: '等客户验收的单' })
  await expect(card.getByRole('button', { name: '验收通过' })).toBeVisible()
  await expect(cards.filter({ hasText: '没绑客户的单' }).getByRole('button', { name: '催客户验收' })).toHaveCount(0)
  await card.getByRole('button', { name: '催客户验收' }).click()
  await expect.poll(() => sent.length).toBe(1)
  expect(sent[0]).toEqual(expect.objectContaining({ orderId: 5, type: 'reply' }))
  await expect(card.getByRole('button', { name: '今天已催' })).toBeVisible()
  // 再点只复制，不发第二条
  await card.getByRole('button', { name: '今天已催' }).click()
  await expect.poll(async () => (await copied(page)).length).toBe(2)
  expect(sent.length).toBe(1)

  await page.addInitScript(() => localStorage.setItem('xc.orderView', 'kanban'))
  await page.goto('/#/order')
  // 待验收的项目一直没人验收：卡片上和别的列一样写「N 天没动静」（两张都有）
  await expect(page.locator('.kanban').getByText('5 天没动静')).toHaveCount(2)
})

test('还欠款的项目：一键复制催款话术（总价、已收、还差）；收清了就没有这个按钮', async ({ page }) => {
  await as(page, 'boss')
  await page.goto('/#/order?id=1')
  await page.getByRole('button', { name: '复制催款话术' }).click()
  const text = (await copied(page))[0]
  expect(text).toContain('林女士，您好！「品牌官网设计」的款项跟您对一下')
  expect(text).toContain('总价 ¥8,800，已收 ¥3,000，还差 ¥5,800。')
  await expect(page.getByText('催款的话已复制')).toBeVisible()

  await page.route('**/jiedan/order/1', (r) => ok(r, { ...order, receivedAmount: 8800 }))
  await page.route('**/jiedan/order/list', (r) => ok(r, [{ ...order, receivedAmount: 8800 }]))
  await page.reload()
  await expect(page.locator('.desc').getByText('已收清')).toBeVisible()
  await expect(page.getByRole('button', { name: '复制催款话术' })).toHaveCount(0)
})

test('员工看不到催款话术', async ({ page }) => {
  await as(page, 'employee')
  await page.goto('/#/order?id=1')
  await expect(page.getByText('项目信息')).toBeVisible()
  await expect(page.getByRole('button', { name: '复制催款话术' })).toHaveCount(0)
})

test('建客户账号：密码已填好，只填账号就能建；建好后的那段话里带着这个密码', async ({ page }) => {
  await as(page, 'boss')
  let body = null
  await page.route('**/jiedan/customer', async (r) => {
    if (r.request().method() !== 'POST') return r.fallback()
    body = r.request().postDataJSON()
    await ok(r, null)
  })
  await page.goto('/#/customers')
  await page.getByRole('button', { name: '新建客户账号' }).click()
  const d = page.getByRole('dialog', { name: '新建客户账号' })
  const pwd = await d.getByPlaceholder('5-20 位').inputValue()
  expect(pwd).toBe('123456')
  await d.getByPlaceholder('客户登录用，字母/数字').fill('kh90001')
  await d.getByRole('button', { name: '创建' }).click()
  await expect.poll(() => body).toEqual(expect.objectContaining({ userName: 'kh90001', password: pwd }))
  await expect(page.locator('.login-info-notice')).toContainText('密码：' + pwd)
})

test('记收款：点一下直接到登记页，金额按还欠的填好；已收清的项目先看流水', async ({ page }) => {
  await as(page, 'boss')
  await page.goto('/#/order?id=1')
  await page.locator('.desc').getByRole('button', { name: '记收款' }).click()
  const entry = page.getByRole('dialog', { name: '登记收款' })
  await expect(entry.locator('.pay-form')).toBeVisible()
  await expect(entry.locator('.el-input-number input')).toHaveValue('5800.00')
  await entry.locator('.el-dialog__footer').getByRole('button', { name: '关闭' }).click()

  await page.route('**/jiedan/order/1', (r) => ok(r, { ...order, receivedAmount: 8800 }))
  await page.route('**/jiedan/order/list', (r) => ok(r, [{ ...order, receivedAmount: 8800 }]))
  await page.reload()
  await page.locator('.desc').getByRole('button', { name: '记收款' }).click()
  await expect(page.getByRole('dialog', { name: '收款流水' })).toContainText('项目定金')
})
