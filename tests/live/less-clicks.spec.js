// 真实后端：回复框自动聚焦、记收款回车、建客户账号回车、批量改派、还欠款里催款、搜索时导出
const { test, expect } = require('@playwright/test')
const tag = Date.now().toString().slice(-8), pw = 'Less12345'
const staff = 'lcst' + tag, cust = 'lccu' + tag
const t1 = '少点甲-' + tag, t2 = '少点乙-' + tag, t3 = '少点待确认-' + tag

async function api(page, path, method = 'GET', data) {
  const token = await page.evaluate(() => localStorage.getItem('token') || localStorage.getItem('customerToken'))
  return (await page.request.fetch(path, { method, headers: { Authorization: 'Bearer ' + token }, data })).json()
}
async function login(page, user, password) {
  await page.goto('/#/login')
  await page.getByPlaceholder('请输入登录账号').fill(user)
  await page.getByPlaceholder('请输入密码', { exact: true }).fill(password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).not.toHaveURL(/#\/login$/)
}

test('real browser: reply focus, payment by Enter, account by Enter, batch assign, dunning in the owing list, export while searching', async ({ browser }) => {
  const opts = { viewport: { width: 1440, height: 900 }, baseURL: 'http://127.0.0.1:5194' }
  const bc = await browser.newContext(opts), cc = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: 'http://127.0.0.1:5194' })
  await bc.addInitScript(() => {
    window.__copied = []
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => { window.__copied.push(t) } } })
  })
  const boss = await bc.newPage(), client = await cc.newPage()
  const ids = []
  let sid, me, custId, madeCustId
  try {
    await test.step('prepare: employee, customer, two projects of the boss (one with a customer message) and a pending one', async () => {
      await login(boss, 'admin', 'admin123')
      me = (await api(boss, '/jiedan/staff/me')).data.id
      expect((await api(boss, '/jiedan/staff', 'POST', { userName: staff, nickName: '少点员工' + tag, password: pw })).code).toBe(200)
      sid = (await api(boss, '/jiedan/staff/list')).data.find((m) => m.userName === staff).id
      expect((await api(boss, '/jiedan/customer', 'POST', { userName: cust, nickName: '少点客户' + tag, password: pw, ownerId: me })).code).toBe(200)
      custId = (await api(boss, '/jiedan/customer/list')).data.find((c) => c.userName === cust).userId
      const a = (await api(boss, '/jiedan/order', 'POST', { title: t1, channel: 'wechat', ownerId: me, customer: '吴总', customerAccount: cust, amount: 5000 })).data
      const b = (await api(boss, '/jiedan/order', 'POST', { title: t2, channel: 'wechat', ownerId: me, customer: '吴总', amount: 3000 })).data
      const c = (await api(boss, '/jiedan/order', 'POST', { title: t3, channel: 'wechat', ownerId: me, customer: '吴总' })).data
      ids.push(a.id, b.id, c.id)
      for (const id of [a.id, b.id]) expect((await api(boss, '/jiedan/order/status', 'PUT', { id, status: 'doing' })).code).toBe(200)
      // 客户发来一句话：工作台出现「回复」
      await login(client, cust, pw)
      await client.goto('/#/projects/' + a.id)
      await client.getByRole('navigation', { name: '项目详情分区' }).getByRole('button', { name: '沟通' }).click()
      const box = client.getByPlaceholder('输入消息，回车发送…')
      await box.fill('少点-客户问进度')
      await box.press('Enter')
      await expect.poll(async () => (await api(boss, '/jiedan/order/' + a.id)).data.timeline.some((t) => t.type === 'message' && t.content === '少点-客户问进度'), { timeout: 15000 }).toBeTruthy()
    })

    await test.step('workbench 回复: the reply box is focused, typing + Enter sends', async () => {
      await boss.goto('/#/workbench')
      await boss.reload()
      const card = boss.locator('.row-card.todo').filter({ hasText: t1 })
      // 待办多时这条可能收在「展开」里
      await expect(boss.locator('.row-card.todo').first()).toBeVisible()
      const more = boss.getByRole('button', { name: /还有 \d+ 条，展开/ })
      if (!(await card.count()) && await more.count()) await more.click()
      await card.getByRole('button', { name: '回复' }).click()
      const input = boss.locator('.chat-panel').getByLabel('回复客户')
      await expect(input).toBeFocused()
      await boss.keyboard.type('少点-明天给您看')
      await boss.keyboard.press('Enter')
      await expect.poll(async () => (await api(boss, '/jiedan/order/' + ids[0])).data.timeline.some((t) => t.type === 'reply' && t.content === '少点-明天给您看')).toBeTruthy()
    })

    await test.step('记收款: amount focused and selected, type + Enter records the payment', async () => {
      await boss.locator('.workspace-tabs').getByRole('button', { name: '全部', exact: true }).click()
      await boss.locator('.desc').getByRole('button', { name: '记收款' }).click()
      const amount = boss.getByRole('dialog', { name: '登记收款' }).locator('.el-input-number input')
      await expect(amount).toHaveValue('5000.00')
      await expect(amount).toBeFocused()
      await boss.keyboard.type('1200')
      await boss.keyboard.press('Enter')
      await expect(boss.getByText('已记收款 ¥1,200')).toBeVisible()
      const d = (await api(boss, '/jiedan/order/' + ids[0])).data
      expect(Number(d.receivedAmount)).toBe(1200)
      expect(d.payments.length).toBe(1)
      await boss.locator('.close-btn').click()
    })

    await test.step('还欠款 list: 催款 in the row copies total, received and remainder', async () => {
      await boss.evaluate(() => localStorage.setItem('xc.orderView', 'list'))
      await boss.goto('/#/order')
      await boss.reload()
      await boss.getByPlaceholder('搜项目名 / 客户 / 联系方式 / 需求').fill(tag)
      await boss.locator('.qchip').filter({ hasText: '还欠款' }).click()
      const row = boss.locator('.el-table__body tr').filter({ hasText: t1 })
      await row.getByRole('button', { name: '催款', exact: true }).click()
      const text = (await boss.evaluate(() => window.__copied)).pop()
      expect(text).toContain('吴总，您好！「' + t1 + '」的款项跟您对一下')
      expect(text).toContain('总价 ¥5,000，已收 ¥1,200，还差 ¥3,800。')
    })

    await test.step('export while searching under 全部 no longer drops pending projects', async () => {
      await boss.locator('.qchip').filter({ hasText: '全部' }).click()
      await expect(boss.locator('.el-table__body tr').filter({ hasText: t3 })).toHaveCount(1)
      const [req] = await Promise.all([
        boss.waitForRequest((r) => r.url().includes('/jiedan/order/export')),
        boss.getByRole('button', { name: '导出 Excel' }).click()
      ])
      const q = new URL(req.url()).searchParams
      expect(q.get('keyword')).toBe(tag)
      expect(q.get('confirmedOnly')).toBeNull()
      expect((await req.response()).status()).toBe(200)
      await expect(boss.getByText(/已导出/)).toBeVisible()
    })

    await test.step('multi-select → 批量派给…: both running projects move to the employee and wait for acceptance', async () => {
      await boss.getByRole('button', { name: '多选项目' }).click()
      const bar = boss.locator('.project-batch-bar')
      await bar.getByText('全选当前展示').click()
      await expect(bar.getByRole('status')).toHaveText('已选 3 项')
      await bar.getByRole('button', { name: '批量派给…' }).click()
      await boss.getByRole('menuitem', { name: '少点员工' + tag }).click()
      const box = boss.locator('.el-message-box')
      await expect(box).toContainText('把选中的 3 个项目派给「少点员工' + tag + '」')
      await box.getByRole('button', { name: '确认改派' }).click()
      await expect(boss.getByText('已把 3 个项目派给')).toBeVisible()
      for (const id of ids) {
        const d = (await api(boss, '/jiedan/order/' + id)).data
        expect(d.ownerId).toBe(sid)
        expect(d.assignState).toBe('pending')
      }
      await bar.getByRole('button', { name: '退出多选' }).click()
    })

    await test.step('new customer account: focus on 账号, Enter creates it with the suggested password', async () => {
      await boss.goto('/#/customers')
      await boss.getByRole('button', { name: '新建客户账号' }).click()
      const d = boss.getByRole('dialog', { name: '新建客户账号' })
      await expect(d.getByPlaceholder('客户登录用，字母/数字')).toBeFocused()
      const pwd = await d.getByPlaceholder('5-20 位').inputValue()
      await boss.keyboard.type('lcn' + tag)
      await boss.keyboard.press('Enter')
      await expect(boss.locator('.login-info-notice')).toContainText('账号：lcn' + tag)
      await expect(boss.locator('.login-info-notice')).toContainText('密码：' + pwd)
      madeCustId = (await api(boss, '/jiedan/customer/list')).data.find((c) => c.userName === 'lcn' + tag)?.userId
      expect(madeCustId).toBeTruthy()
    })
  } finally {
    for (const id of ids) await api(boss, '/jiedan/order/' + id, 'DELETE').catch(() => {})
    for (const id of [custId, madeCustId]) if (id) await api(boss, '/jiedan/customer/' + id, 'DELETE').catch(() => {})
    await bc.close()
    await cc.close()
  }
})
