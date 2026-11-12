// 简化这一轮：工作台「我手上的」+ 一键开始、待办上「完成这一步」、详情里点值就地修改、长列表收起、换页回到顶部
const { test, expect } = require('@playwright/test')
const tag = Date.now().toString().slice(-8), pw = 'Simple12345', staff = 'smpl' + tag, title = '简化验收-' + tag

async function api(page, path, method = 'GET', data) {
  const token = await page.evaluate(() => localStorage.getItem('token'))
  return (await page.request.fetch(path, { method, headers: { Authorization: 'Bearer ' + token }, data })).json()
}
async function login(page, user, password) {
  await page.goto('/#/login')
  await page.getByPlaceholder('请输入登录账号').fill(user)
  await page.getByPlaceholder('请输入密码', { exact: true }).fill(password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).not.toHaveURL(/#\/login$/)
}

test('real browser: fewer clicks on workbench and project detail', async ({ browser }) => {
  const opts = { viewport: { width: 1440, height: 900 }, baseURL: 'http://127.0.0.1:5194' }
  const bc = await browser.newContext(opts), ec = await browser.newContext(opts)
  const boss = await bc.newPage(), employee = await ec.newPage()
  let id, sid, bossId
  try {
    await test.step('prepare an employee with an accepted project', async () => {
      await login(boss, 'admin', 'admin123')
      expect((await api(boss, '/jiedan/staff', 'POST', { userName: staff, nickName: '简化员工' + tag, password: pw })).code).toBe(200)
      sid = (await api(boss, '/jiedan/staff/list')).data.find((m) => m.userName === staff).id
      bossId = (await api(boss, '/getInfo')).user.userId
      id = (await api(boss, '/jiedan/order', 'POST', { title, channel: 'wechat', ownerId: sid, customer: '简化客户' })).data.id
      await login(employee, staff, pw)
      expect((await api(employee, '/jiedan/order/' + id + '/accept', 'POST', {})).code).toBe(200)
    })

    await test.step('accepted project stays on the workbench under 我手上的 and starts in one click', async () => {
      // 上一步是直接调接口接收的，页面要重新加载才拿到新状态
      await employee.goto('/#/workbench')
      await employee.reload()
      const card = employee.locator('.row-card.hands').filter({ hasText: title })
      await expect(card).toContainText('还没开工')
      await card.getByRole('button', { name: '开始做', exact: true }).click()
      await expect.poll(async () => (await api(employee, '/jiedan/order/' + id)).data.status).toBe('doing')
      await expect(card.getByRole('button', { name: '提交验收', exact: true })).toBeVisible()
    })

    await test.step('写进展 opens the internal notes with the cursor in the box', async () => {
      await employee.locator('.row-card.hands').filter({ hasText: title }).getByRole('button', { name: '写进展', exact: true }).click()
      await expect(employee.locator('.workspace')).toBeVisible()
      await expect(employee.locator('.workspace-tabs button[aria-pressed="true"]')).toHaveText('内部')
      await expect.poll(() => employee.evaluate(() => document.activeElement?.placeholder || '')).toContain('写给 ')
    })

    await test.step('order info is edited in place without the edit dialog', async () => {
      await employee.locator('.workspace-tabs').getByRole('button', { name: '全部', exact: true }).click()
      // 订单信息里每格字号一致（负责人以前被下拉菜单撑成 14px）
      const sizes = await employee.locator('.desc td.el-descriptions__content > *').evaluateAll((els) => [...new Set(els.slice(0, 3).map((e) => getComputedStyle(e.querySelector('.inline-edit, .inline-assign') || e).fontSize))])
      expect(sizes.length).toBe(1)
      await employee.locator('.inline-edit').filter({ hasText: '微信 / 电话' }).click()
      await employee.locator('.inline-edit-form input').fill('wx_simple_' + tag)
      await employee.locator('.inline-edit-form input').press('Enter')
      await expect.poll(async () => (await api(employee, '/jiedan/order/' + id)).data.contact).toBe('wx_simple_' + tag)
      await employee.locator('.inline-edit').filter({ hasText: '点击填写需求' }).click()
      await employee.locator('.inline-edit-form textarea').fill('首页改版\n手机适配')
      await employee.locator('.inline-edit-form textarea').press('Control+Enter')
      await expect.poll(async () => (await api(employee, '/jiedan/order/' + id)).data.requirement).toBe('首页改版\n手机适配')
      // 员工不能直接改报价：报价是只读的，只能「申请改价」
      await expect(employee.locator('.inline-edit.ie-readonly').filter({ hasText: '¥0' })).toBeVisible()
      // 标题点一下改名；改稿次数旁边直接 +1
      await employee.locator('.title-line .inline-edit').click()
      await employee.locator('.title-line .inline-edit-form input').fill(title + '（二期）')
      await employee.locator('.title-line .inline-edit-form input').press('Enter')
      await expect.poll(async () => (await api(employee, '/jiedan/order/' + id)).data.title).toBe(title + '（二期）')
      await employee.locator('.revision-plus').click()
      await expect.poll(async () => (await api(employee, '/jiedan/order/' + id)).data.revisions).toBe(1)
      await api(employee, '/jiedan/order', 'PUT', { id, title })
    })

    await test.step('boss finishes his next step on the workbench and hands the next one to the owner', async () => {
      expect((await api(boss, '/jiedan/order/' + id + '/next', 'PUT', { content: '老板确认首页' + tag, ownerId: bossId, due: '' })).code).toBe(200)
      await boss.goto('/#/workbench')
      await boss.reload()
      // 「需要我处理」先放 8 条：测试库里老板的待办很多，没定日期的下一步排在后面，先展开
      await expect(boss.getByRole('region',{name:'轮到我',exact:true})).toBeVisible()
      const more = boss.getByRole('button', { name: /还有 \d+ 条，展开/ })
      if (await more.count()) await more.click()
      const card = boss.locator('.handoff-card[data-kind="next"]').filter({ hasText: title })
      await card.getByRole('button', { name: '完成', exact: true }).click()
      const box = boss.locator('.el-message-box')
      await expect(box).toContainText('老板确认首页' + tag)
      await box.locator('input').fill('按意见改第二版')
      await box.getByRole('button', { name: '安排', exact: true }).click()
      await expect.poll(async () => (await api(boss, '/jiedan/order/' + id)).data.nextStep).toBe('按意见改第二版')
      expect((await api(boss, '/jiedan/order/' + id)).data.nextOwnerId).toBe(sid)
    })

    await test.step('long lists are collapsed and switching pages starts at the top', async () => {
      expect(await boss.locator('.row-card.waiting').count()).toBeLessThanOrEqual(6)
      // 独立验收库数据较少，也应在可滚动的窗口里验证返回顶部。
      await boss.setViewportSize({width: 1440, height: 420})
      const main = boss.locator('.el-main.main')
      await expect.poll(() => main.evaluate(el=>el.scrollHeight-el.clientHeight)).toBeGreaterThan(0)
      await main.evaluate((el) => (el.scrollTop = 600))
      expect(await main.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
      await boss.locator('.el-menu-item').filter({ hasText: '项目管理' }).click()
      await expect(boss).toHaveURL(/#\/order/)
      await expect.poll(() => main.evaluate((el) => el.scrollTop)).toBe(0)
    })
  } finally {
    if (id) await api(boss, '/jiedan/order/' + id, 'DELETE').catch(() => {})
    await bc.close()
    await ec.close()
  }
})

// 第二轮：极速建单绑定客户账号、客户看进度、消息中心直接写出客户说了什么
test('real browser: quick create links the customer, who sees progress; inbox shows the message', async ({ browser }) => {
  const t2 = Date.now().toString().slice(-7), staff2 = 'smpb' + t2, cust = 'smpc' + t2, nick = '进度客户' + t2, title2 = '绑定验收-' + t2
  const bc = await browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL: 'http://127.0.0.1:5194' })
  const cc = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: 'http://127.0.0.1:5194' })
  const boss = await bc.newPage(), client = await cc.newPage()
  let id
  try {
    await test.step('prepare a customer account that belongs to an employee', async () => {
      await login(boss, 'admin', 'admin123')
      expect((await api(boss, '/jiedan/staff', 'POST', { userName: staff2, nickName: '归属员工' + t2, password: pw })).code).toBe(200)
      const sid2 = (await api(boss, '/jiedan/staff/list')).data.find((m) => m.userName === staff2).id
      expect((await api(boss, '/jiedan/customer', 'POST', { userName: cust, nickName: nick, password: pw, ownerId: sid2 })).code).toBe(200)
      await boss.reload()
      await test.step('quick create suggests the account, binds it and assigns to its employee', async () => {
        await boss.getByRole('button',{name:'极速建单',exact:true}).click()
        const d = boss.locator('.design-quick-dialog')
        await d.getByPlaceholder(/直接粘贴客户消息/).fill(title2 + '\n商城小程序二期')
        await d.getByPlaceholder('选填：客户名 / 旺旺号，可选以前的客户').fill(cust)
        await boss.locator('.el-autocomplete-suggestion li').filter({ hasText: cust }).first().click()
        await expect(d.locator('.qc-bound')).toContainText(cust)
        await expect(d.locator('.qc-bound')).toContainText('归属员工' + t2)
        await d.getByRole('button', { name: '建单并派单' }).click()
        await expect(d).toBeHidden()
        const o = (await api(boss, '/jiedan/order/list')).data.find((x) => x.title === title2)
        expect(o?.customerAccount).toBe(cust)
        expect(o?.ownerId).toBe(sid2)
        id = o.id
      })
    })

    await test.step('customer sees the project with progress and an unpriced label', async () => {
      await login(client, cust, pw)
      // 客户首页改版后进度条在项目详情里：从首页点「项目详情」进去看
      await client.getByRole('link', { name: '项目详情' }).click()
      await expect(client.locator('.topbar')).toContainText(title2)
      await expect(client.locator('.ps-step.current')).toContainText('确认需求')
      await expect(client.locator('.customer-project-summary')).toContainText('待报价')
      await expect(client.locator('.ps-hint')).toContainText('团队正在确认需求')
      await client.getByRole('button', { name: '沟通', exact: true }).click()
      await client.getByPlaceholder('输入消息，回车发送…').fill('能不能加一个会员积分')
      await client.getByRole('button', { name: '发送', exact: true }).click()
      await expect(client.getByText('能不能加一个会员积分', { exact: true })).toBeVisible()
    })

    await test.step('inbox shows what the customer said and opens the chat directly', async () => {
      await boss.goto('/#/messages')
      await boss.reload()
      const item = boss.locator('.message-card').filter({ hasText: title2 })
      await expect(item).toContainText('客户：能不能加一个会员积分')
      await item.click()
      await expect(boss).toHaveURL(new RegExp('order\\?id=' + id + '&tab=chat'))
      await expect(boss.locator('.workspace')).toContainText('能不能加一个会员积分')
    })
  } finally {
    if (id) await api(boss, '/jiedan/order/' + id, 'DELETE').catch(() => {})
    await bc.close()
    await cc.close()
  }
})
