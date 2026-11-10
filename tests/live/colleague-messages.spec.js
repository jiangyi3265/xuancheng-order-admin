// 第 1 节验收。两个独立登录会话通过真实界面留言；收件页只等正常轮询。
const { test, expect } = require('@playwright/test')
const baseURL = 'http://127.0.0.1:5194'
const windowMs = 13000

async function login(page, user, password) {
  await page.goto('/#/login')
  await page.getByPlaceholder('请输入登录账号').fill(user)
  await page.getByPlaceholder('请输入密码', { exact: true }).fill(password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).toHaveURL(/workbench/)
}
async function api(page, path, method = 'GET', data) {
  const token = await page.evaluate(() => localStorage.getItem('token'))
  const r = await page.request.fetch(path, { method, data, headers: { Authorization: 'Bearer ' + token } })
  const body = await r.json()
  expect(body.code, path).toBe(200)
  return body.data
}
const panel = p => p.locator('.record-panel')
async function send(p, text, button) {
  await panel(p).locator('textarea').fill(text)
  await panel(p).getByRole('button', { name: button, exact: true }).click()
  await expect(panel(p).locator('.timeline').getByText(text, { exact: true })).toBeVisible()
}

test('M1–M5 双账号工作台互发、连发、逐项回执、手机标题直达和催办', async ({ browser }) => {
  const bossContext = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } })
  const staffContext = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } })
  const boss = await bossContext.newPage(), staff = await staffContext.newPage()
  const stamp = Date.now().toString().slice(-8), user = 'col' + stamp, name = '留言同事' + stamp
  const pw = 'LocalNote123', title = '同事留言验收' + stamp
  const staffTodo = staff.locator('.wb-todo').filter({ hasText: title })
  const bossTodo = boss.locator('.row-card.todo').filter({ hasText: title })
  let id, sid
  try {
    await login(boss, 'admin', 'admin123')
    expect(String((await api(boss, '/jiedan/push/config'))['push.enabled'])).toBe('false')
    const me = await api(boss, '/jiedan/staff/me')
    const bossName = me.nickName || me.userName
    await api(boss, '/jiedan/staff', 'POST', { userName: user, nickName: name, password: pw })
    sid = (await api(boss, '/jiedan/staff/list')).find(m => m.userName === user).id
    id = (await api(boss, '/jiedan/order', 'POST', { title, channel: 'wechat', ownerId: sid })).id
    await login(staff, user, pw)
    await api(staff, '/jiedan/order/' + id + '/accept', 'POST', {})
    await api(staff, '/jiedan/order/status', 'PUT', { id, status: 'doing' })
    for (const p of [boss, staff]) {
      await api(p, '/jiedan/order/read', 'PUT', { id })
      await p.reload()
    }
    await expect(staffTodo).toHaveCount(0)
    const read = async (text) => {
      const d = await api(boss, '/jiedan/order/' + id)
      return d.timeline.find(t => t.content === text)?.mentions?.[0]?.read
    }
    const open = (p,tab) => p.goto('/#/workbench?id=' + id + '&tab=' + tab)
    const close = p => p.locator('.workspace').getByRole('button', { name: '关闭项目详情' }).click()
    const notification = (p, text) => p.locator('.el-notification').filter({ hasText: text })
    await test.step('不手点 @，员工在工作台收到第一条；保持未读，同项目第二条也弹并直达', async () => {
      await open(boss, 'internal')
      await send(boss, '第一条请核对首页', '发给 ' + name)
      await expect(notification(staff, '第一条请核对首页')).toBeVisible({ timeout: windowMs })
      await expect(staffTodo).toContainText(bossName + '：第一条请核对首页')
      await expect(staff).toHaveTitle(/^\(1\)/)
      await expect(staff.locator('.mobile-nav a[href*="messages"] .is-dot')).toBeVisible()
      expect(await read('第一条请核对首页')).toBe(false)
      await send(boss, '第二条请看箭头', '发给 ' + name)
      await notification(staff, '第二条请看箭头').click({ timeout: windowMs })
      await expect(staff).toHaveURL(/tab=internal.*entry=\d+/)
      await expect(panel(staff).locator('.notice-target')).toContainText('第二条请看箭头')
      await expect(panel(staff).locator('.notice-target .new-note-label')).toBeInViewport()
      await expect.poll(() => read('第二条请看箭头')).toBe(true)
      await expect(panel(boss).locator('.el-timeline-item').filter({hasText:'第一条请核对首页'})).toContainText('已读', { timeout: windowMs })
      await close(staff)
      await staff.goto('/#/workbench')
    })
    await test.step('只记录不进对方待办；显式 @ 仍可用，点手机待办标题到留言', async () => {
      const chip = panel(boss).getByRole('button', { name: '@' + name, exact: true })
      await chip.click()
      await send(boss, '仅自己备忘', '只记录')
      await staff.waitForTimeout(windowMs)
      await expect(staffTodo).toHaveCount(0)
      await chip.click()
      await chip.click()
      await send(boss, '显式提醒复核', '发给 ' + name)
      await staffTodo.getByRole('heading', { name: title }).click({ timeout: windowMs })
      await expect(staff.locator('.workspace-mobile-tabs .active')).toHaveText('内部')
      await expect(panel(staff).locator('.unread-note').filter({ hasText: '显式提醒复核' })).toBeInViewport()
      await expect.poll(() => read('显式提醒复核')).toBe(true)
      await close(boss)
    })
    await test.step('员工默认回给老板，老板不用打开即可知道了', async () => {
      await send(staff, '预计下午完成', '发给 ' + bossName)
      await expect(notification(boss, '预计下午完成')).toBeVisible({ timeout: windowMs })
      const expand = boss.getByRole('button', { name: /还有 \d+ 条，展开/ })
      if (!(await bossTodo.count()) && await expand.count()) await expand.click()
      await expect(bossTodo).toContainText(name + '：预计下午完成')
      await bossTodo.getByRole('button', { name: '知道了' }).click()
      await expect(bossTodo).toHaveCount(0)
      await expect(boss).toHaveURL(/#\/workbench$/)
      await expect(panel(staff).locator('.el-timeline-item').filter({hasText:'预计下午完成'})).toContainText('已读', { timeout: windowMs })
      await close(staff)
    })
    await test.step('从沟通进入时保持未读，内部页签出现后才回执', async () => {
      await open(boss, 'internal')
      await send(boss, '等看到这条再回执', '发给 ' + name)
      await expect(staffTodo).toContainText('等看到这条再回执', { timeout: windowMs })
      await open(staff, 'chat')
      await expect(staff.locator('.chat-panel')).toBeVisible()
      await staff.waitForTimeout(2300)
      expect(await read('等看到这条再回执')).toBe(false)
      await staff.locator('.workspace-mobile-tabs').getByText('内部').click()
      await expect.poll(() => read('等看到这条再回执')).toBe(true)
      await close(staff)
    })
    await test.step('项目催一下送达，点写进展并发送，催办消失', async () => {
      await boss.getByRole('button', { name: '更多', exact: true }).click()
      await boss.getByRole('menuitem', { name: '催一下', exact: true }).click()
      await expect(notification(staff, '催你跟进这个项目')).toBeVisible({ timeout: windowMs })
      await expect(staffTodo).toContainText(bossName + ' 催你跟进这个项目')
      await staffTodo.getByRole('button', { name: '写进展' }).click()
      await send(staff, '已跟进，准备交付', '发给 ' + bossName)
      await close(staff)
      await expect(staffTodo).toHaveCount(0)
    })
  } finally {
    try {
      if (id) {
        await api(boss, '/jiedan/order/' + id, 'DELETE')
        await api(boss, '/jiedan/order/' + id + '/purge', 'DELETE')
      }
      if (sid) await api(boss, '/jiedan/staff/' + sid, 'DELETE')
    } finally { await Promise.all([bossContext.close(), staffContext.close()]) }
  }
})
