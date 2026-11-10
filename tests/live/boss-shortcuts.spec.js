// 真实后端：列表搜索不分状态、常用语（老板存、员工用）、催客户验收（客户那边看得到）、催款话术
const { test, expect } = require('@playwright/test')
const tag = Date.now().toString().slice(-8), pw = 'Short12345'
const staff = 'bsst' + tag, cust = 'bscu' + tag, title = '省事验收-' + tag, pendingTitle = '省事待确认-' + tag
const PHRASE_KEYS = Array.from({ length: 12 }, (_, i) => 'push.phrase.' + (i + 1))

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
// 把复制出去的内容记下来核对（无头浏览器里不给真剪贴板权限）
const spyClipboard = (ctx) => ctx.addInitScript(() => {
  window.__copied = []
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => { window.__copied.push(t) } } })
})

test('real browser: search finds pending projects, shared phrases, customer accept reminder, dunning text', async ({ browser }) => {
  const opts = { viewport: { width: 1440, height: 900 }, baseURL: 'http://127.0.0.1:5194' }
  const bc = await browser.newContext(opts), ec = await browser.newContext(opts)
  const cc = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: 'http://127.0.0.1:5194' })
  await spyClipboard(bc)
  const boss = await bc.newPage(), employee = await ec.newPage(), client = await cc.newPage()
  let id, pendingId, oldPhrases
  try {
    await test.step('prepare: employee, customer, one delivered project and one pending project', async () => {
      await login(boss, 'admin', 'admin123')
      const cfg = (await api(boss, '/jiedan/push/config')).data
      oldPhrases = Object.fromEntries(PHRASE_KEYS.filter((k) => k in cfg).map((k) => [k, cfg[k]]))
      expect((await api(boss, '/jiedan/staff', 'POST', { userName: staff, nickName: '省事员工' + tag, password: pw })).code).toBe(200)
      const sid = (await api(boss, '/jiedan/staff/list')).data.find((m) => m.userName === staff).id
      expect((await api(boss, '/jiedan/customer', 'POST', { userName: cust, nickName: '省事客户' + tag, password: pw, ownerId: sid })).code).toBe(200)
      id = (await api(boss, '/jiedan/order', 'POST', { title, channel: 'wechat', ownerId: sid, customer: '周总', customerAccount: cust, amount: 6000 })).data.id
      pendingId = (await api(boss, '/jiedan/order', 'POST', { title: pendingTitle, channel: 'wechat', customer: '待确认客户' })).data.id
      await login(employee, staff, pw)
      expect((await api(employee, '/jiedan/order/' + id + '/accept', 'POST', {})).code).toBe(200)
      expect((await api(employee, '/jiedan/order/status', 'PUT', { id, status: 'doing' })).code).toBe(200)
      expect((await api(employee, '/jiedan/order/status', 'PUT', { id, status: 'review' })).code).toBe(200)
      expect((await api(boss, '/jiedan/order/' + id + '/payment', 'POST', { amount: 2000, payDate: new Date().toISOString().slice(0, 10), note: '定金' })).code).toBe(200)
    })

    await test.step('list view: a pending project is found by search even under 全部', async () => {
      await boss.evaluate(() => localStorage.setItem('xc.orderView', 'list'))
      await boss.goto('/#/order')
      await boss.reload()
      await boss.getByPlaceholder('搜项目名 / 客户 / 联系方式 / 需求').fill(pendingTitle)
      await expect(boss.locator('.el-table__body tr').filter({ hasText: pendingTitle })).toHaveCount(1)
      await expect(boss.getByText('没有符合筛选条件的项目')).toHaveCount(0)
      await boss.getByPlaceholder('搜项目名 / 客户 / 联系方式 / 需求').fill('')
    })

    await test.step('boss saves shared phrases; the employee can use them but not edit', async () => {
      await boss.goto('/#/order?id=' + id + '&tab=chat')
      const panel = boss.locator('.chat-panel')
      await panel.getByRole('button', { name: '常用语' }).click()
      const box = boss.locator('.phrase-box')
      await box.getByRole('button', { name: '编辑常用语' }).click()
      const first = box.getByRole('textbox', { name: '常用语 1' })
      await first.fill('实测常用语-' + tag)
      await box.getByRole('button', { name: '保存' }).click()
      await expect(boss.getByText('常用语已保存')).toBeVisible()
      await expect.poll(async () => (await api(boss, '/jiedan/push/config')).data['push.phrase.1']).toBe('实测常用语-' + tag)

      await employee.goto('/#/order?id=' + id + '&tab=chat')
      await employee.reload()
      await employee.locator('.chat-panel').getByRole('button', { name: '常用语' }).click()
      const ebox = employee.locator('.phrase-box')
      await expect(ebox.locator('.phrase-item').first()).toHaveText('实测常用语-' + tag)
      await expect(ebox.getByRole('button', { name: '编辑常用语' })).toHaveCount(0)
      await ebox.locator('.phrase-item').first().click()
      await expect(employee.locator('.chat-panel').getByLabel('回复客户')).toHaveValue('实测常用语-' + tag)
      // 员工直接调接口也改不了公共的常用语
      expect((await api(employee, '/jiedan/push/config', 'POST', { 'push.phrase.1': '员工乱改' })).code).not.toBe(200)
    })

    await test.step('boss reminds the customer to accept: message lands in the customer portal, second click only copies', async () => {
      await boss.reload()
      const bar = boss.locator('.chat-await')
      await expect(bar).toContainText('等客户验收')
      await bar.getByRole('button', { name: '催客户验收' }).click()
      await expect(boss.locator('.chat-row').last()).toContainText('已经做完交付了，麻烦抽空验收一下')
      expect((await boss.evaluate(() => window.__copied)).some((t) => t.includes('查看地址：'))).toBeTruthy()
      const replies = async () => (await api(boss, '/jiedan/order/' + id)).data.timeline.filter((t) => t.type === 'reply' && t.content.includes('麻烦抽空验收一下')).length
      expect(await replies()).toBe(1)

      await login(client, cust, pw)
      await client.goto('/#/projects/' + id)
      await client.getByRole('navigation', { name: '项目详情分区' }).getByRole('button', { name: '沟通' }).click()
      await expect(client.getByText('已经做完交付了，麻烦抽空验收一下').first()).toBeVisible()
    })

    await test.step('dunning text carries total, received and the remainder', async () => {
      await boss.locator('.workspace-tabs').getByRole('button', { name: '全部', exact: true }).click()
      await boss.getByRole('button', { name: '复制催款话术' }).click()
      const text = (await boss.evaluate(() => window.__copied)).pop()
      expect(text).toContain('周总，您好！「' + title + '」的款项跟您对一下')
      expect(text).toContain('总价 ¥6,000，已收 ¥2,000，还差 ¥4,000。')
    })

    await test.step('customer accepts; the reminder bar and dunning stay consistent', async () => {
      await client.getByRole('navigation', { name: '项目详情分区' }).getByRole('button', { name: '项目概况' }).click()
      await client.locator('.detail-footer').getByRole('button', { name: '确认验收' }).click()
      await client.locator('.el-message-box').getByRole('button', { name: '确认验收' }).click()
      await expect.poll(async () => (await api(boss, '/jiedan/order/' + id)).data.status, { timeout: 15000 }).toBe('done')
      await boss.reload()
      await expect(boss.locator('.chat-panel')).toBeVisible()
      await expect(boss.locator('.chat-await')).toHaveCount(0)
    })
  } finally {
    // 常用语是全团队共用的设置：恢复成测试前的样子
    if (oldPhrases) {
      const restore = Object.fromEntries(PHRASE_KEYS.map((k) => [k, oldPhrases[k] || '']))
      await api(boss, '/jiedan/push/config', 'POST', restore).catch(() => {})
    }
    if (id) await api(boss, '/jiedan/order/' + id, 'DELETE').catch(() => {})
    if (pendingId) await api(boss, '/jiedan/order/' + pendingId, 'DELETE').catch(() => {})
    await bc.close()
    await ec.close()
    await cc.close()
  }
})
