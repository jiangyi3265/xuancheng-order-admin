const { test, expect } = require('@playwright/test')
const { randomUUID } = require('node:crypto')

test('同项目多人独立登录、提交、验收和解除绑定', async ({ request, browser, baseURL }) => {
  const apiBase = process.env.E2E_BASE
  if (!apiBase || new URL(apiBase).hostname !== '127.0.0.1' || !/^xc_e2e_\d+$/.test(process.env.E2E_DB)) {
    throw new Error('需要本地隔离测试库')
  }
  async function call(path, token, method = 'GET', data) {
    return (await request.fetch(apiBase + path, {
      method, data, headers: token ? { Authorization: 'Bearer ' + token } : {}
    })).json()
  }
  async function ok(...args) {
    const result = await call(...args)
    expect(result.code, result.msg).toBe(200)
    return result.data
  }
  async function login(username, password) {
    const result = await call('/login', null, 'POST', { username, password })
    expect(result.code, result.msg).toBe(200)
    return result.token
  }
  const admin = await login('admin', 'admin123')
  const suffix = randomUUID().slice(0, 8)
  const password = 'TestProject123'
  async function customer(prefix, nickName) {
    const userName = prefix + suffix
    const { userId } = await ok('/jiedan/customer', admin, 'POST', { userName, nickName, password })
    return { userId, userName, token: await login(userName, password) }
  }
  const main = await customer('main', '项目联系人')
  const tester = await customer('test', '测试同学')
  const outside = await login('cust_a', 'customer123')
  const title = '多人测试 ' + suffix
  const project = await ok('/jiedan/order', admin, 'POST', { title, customerAccount: main.userName, status: 'review' })
  const path = '/jiedan/portal/orders/' + project.id
  const orderPath = '/jiedan/order/' + project.id
  const ctx = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } })
  try {
    await ctx.addInitScript(token => localStorage.setItem('token', token), admin)
    const page = await ctx.newPage()
    await page.goto('/#/order?id=' + project.id)
    await page.getByRole('button', { name: '编辑', exact: true }).first().click()
    const dialog = page.getByRole('dialog', { name: '编辑项目' })
    await dialog.getByText('选择一起测试的客户账号（可多选）', { exact: true }).click()
    await page.getByRole('option', { name: new RegExp(tester.userName) }).click()
    await page.keyboard.press('Escape')
    await dialog.getByRole('button', { name: '保存', exact: true }).click()
    await expect(dialog).toBeHidden()
  } finally {
    await ctx.close()
  }
  expect((await ok(orderPath, admin)).testerIds).toEqual([tester.userId])
  expect((await ok('/jiedan/order/list', admin)).find(p => p.id === project.id).testerIds).toEqual([tester.userId])
  expect((await ok('/jiedan/portal/orders', tester.token)).map(p => p.id)).toEqual([project.id])
  expect((await call(path, outside)).code).toBe(403)
  expect((await call(path + '/accept', outside, 'PUT')).code).not.toBe(200)
  const intake = { orderId: project.id, title: '测试人反馈', submissionKey: randomUUID() }
  const receipt = await ok('/jiedan/order/intake', tester.token, 'POST', intake)
  expect((await ok('/jiedan/order/intake', tester.token, 'POST', intake)).bugId).toBe(receipt.bugId)
  const first = await ok('/jiedan/portal/bug', main.token, 'POST', { orderId: project.id, content: '主账号反馈' })
  const mainIssue = first.bugs.find(b => b.content === '主账号反馈')
  expect(first.bugs.find(b => b.id === receipt.bugId).createdBy).toBe('测试同学')
  const testerDetail = await ok(path, tester.token)
  expect(testerDetail.bugs.find(b => b.id === receipt.bugId).canManageIssue).toBe(true)
  expect(testerDetail.bugs.find(b => b.id === mainIssue.id).canManageIssue).toBe(false)
  const bugPath = '/jiedan/portal/bug/' + mainIssue.id
  expect((await call(bugPath, tester.token, 'DELETE')).code).not.toBe(200)
  expect((await call(bugPath + '/status', tester.token, 'PUT', { status: 'resolved' })).code).not.toBe(200)
  await ok(bugPath + '/update', tester.token, 'POST', { content: '手机也复现了' })
  await ok('/jiedan/portal/message', tester.token, 'POST', { orderId: project.id, content: '测试留言' })
  expect((await ok(path, main.token)).timeline.at(-1).mine).toBe(false)
  expect((await ok(path, tester.token)).timeline.at(-1).mine).toBe(true)
  const mobile = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } })
  try {
    const page = await mobile.newPage()
    await page.goto('/#/projects/' + project.id)
    await page.getByPlaceholder('请输入登录账号').fill(tester.userName)
    await page.getByPlaceholder('请输入密码', { exact: true }).fill(password)
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await expect(page.getByRole('button', { name: '确认验收', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '确认验收', exact: true }).click()
    await page.getByRole('button', { name: '确认验收', exact: true }).last().click()
    await expect.poll(async () => (await ok(path, main.token)).status).toBe('done')
  } finally {
    await mobile.close()
  }
  await ok('/jiedan/order', admin, 'PUT', { id: project.id, status: 'review' })
  const results = await Promise.all([main, tester].map(user => ok(path + '/accept', user.token, 'PUT')))
  expect(results.map(p => p.status)).toEqual(['done', 'done'])
  const history = (await ok(orderPath, admin)).timeline.filter(t => t.content === '确认验收，项目已完成')
  expect(history).toHaveLength(2) // 两轮验收各留一条
  await ok('/jiedan/order', admin, 'PUT', { id: project.id, testerIds: [], previousTesterIds: [tester.userId] })
  expect((await call(path + '/version', tester.token)).code).toBe(403)
  expect((await call(path, tester.token)).code).toBe(403)
  expect((await ok('/jiedan/portal/orders', tester.token))).toHaveLength(0)
  expect((await call('/jiedan/order', admin, 'PUT', { id: project.id, testerIds: [tester.userId], previousTesterIds: [tester.userId] })).code).not.toBe(200)
  const second = await ok('/jiedan/order', admin, 'POST', { title: '其他项目', customerAccount: main.userName, testerIds: [tester.userId] })
  expect((await ok('/jiedan/portal/orders', tester.token)).map(p => p.id)).toEqual([second.id])
  await ok('/jiedan/order', admin, 'PUT', { id: second.id, customerAccount: 'cust_b' })
  expect(await ok('/jiedan/portal/orders', tester.token)).toHaveLength(0)
})
