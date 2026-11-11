const { test, expect } = require('@playwright/test')
const { randomUUID } = require('node:crypto')

test('批量创建短账号、复制登录资料、绑定项目和请求重试', async ({request, browser, baseURL}) => {
  const apiBase = process.env.E2E_BASE
  if (!apiBase || new URL(apiBase).hostname !== '127.0.0.1' || !/^xc_e2e_\d+$/.test(process.env.E2E_DB)) throw Error('需要本地隔离测试库')
  async function api(path, token, method='GET', data) {
    return (await request.fetch(apiBase + path, { method, data, headers: token ? { Authorization: 'Bearer '+token } : {} })).json()
  }
  async function ok(...args) {
    const result = await api(...args)
    expect(result.code,result.msg).toBe(200)
    return result.data
  }
  async function login(username,password) {
    const response = await api('/login', null, 'POST', {username,password})
    expect(response.code, response.msg).toBe(200)
    return response.token
  }
  const admin = await login('admin','admin123')
  const batchPath = '/jiedan/customer/batch'
  const payload = { count: 3, names: [], requestKey: randomUUID() }
  const [a,b] = await Promise.all([1,2].map(() => ok(batchPath,admin,'POST',payload)))
  expect(a).toEqual(b)
  expect(new Set(a.map(x=>x.userName)).size).toBe(3)
  for(const user of a) {
    expect(user.userName).toMatch(/^[a-z2-9]{8}$/)
    expect(user.nickName).toBe(user.userName)
    expect(user.password).toBeUndefined()
  }
  expect((await api(batchPath,admin,'POST',{...payload,count:2})).code).not.toBe(200)
  expect((await api(batchPath,admin,'POST',{...payload,requestKey:randomUUID(),names:['只填一人']})).code).not.toBe(200)
  const initialTester=await login(a[0].userName,'123456')
  expect((await api(batchPath,initialTester,'POST',{...payload,requestKey:randomUUID()})).code).not.toBe(200)
  const project = await ok('/jiedan/order',admin,'POST',{title:'批量客户测试',customerAccount:a[0].userName,status:'doing'})
  const staffContext = await browser.newContext({baseURL,permissions:['clipboard-read','clipboard-write'],viewport:{width:1440,height:900}})
  try {
    await staffContext.addInitScript(t=>localStorage.setItem('token',t),admin)
    const page=await staffContext.newPage()
    await page.goto('/#/order?id='+project.id)
    const drawer = page.locator('.order-workspace-overlay').last()
    await drawer.getByRole('button',{name:'编辑',exact:true}).click()
    const form=page.getByRole('dialog',{name:'编辑项目'})
    await form.getByRole('button',{name:'批量创建',exact:true}).click()
    const dialog=page.getByRole('dialog',{name:'批量创建客户账号'})
    await dialog.getByPlaceholder('每行一个姓名，人数会自动计算').fill('手机测试\n电脑测试')
    await expect(dialog.getByRole('spinbutton')).toHaveValue('2')
    await dialog.getByRole('button',{name:'创建账号'}).click()
    await expect(dialog.getByRole('status')).toContainText('已创建 2 个账号')
    const codes=await dialog.locator('code').allTextContents()
    expect(new Set(codes).size).toBe(2)
    const ownCandidates = await ok('/jiedan/customer/list?picker=true&projectId='+project.id,admin)
    const newProjectCandidates = await ok('/jiedan/customer/list?picker=true',admin)
    for(const code of codes) {
      expect(ownCandidates.map(c=>c.userName)).toContain(code)
      expect(newProjectCandidates.map(c=>c.userName)).not.toContain(code)
    }
    await dialog.getByRole('button',{name:'复制全部'}).click()
    const clipboard=await page.evaluate(()=>navigator.clipboard.readText())
    for(const code of codes) expect(clipboard).toContain(code)
    expect(clipboard).toContain('/client/')
    expect(clipboard).toContain('123456')
    await dialog.getByRole('button',{name:'完成',exact:true}).click()
    await form.getByRole('button',{name:'保存',exact:true}).click()
    await expect(form).toBeHidden()
    for(const code of codes) {
      const token=await login(code,'123456')
      expect((await ok('/jiedan/portal/orders',token)).map(p=>p.id)).toEqual([project.id])
    }
    await page.setViewportSize({width:390,height:844})
    await page.goto('/#/customers')
    await page.getByRole('button',{name:'批量创建',exact:true}).click()
    await dialog.getByRole('spinbutton').fill('2')
    await dialog.getByRole('button',{name:'创建账号'}).click()
    await expect(dialog.getByRole('status')).toContainText('已创建 2 个账号')
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)
    const first=await dialog.locator('code').first().innerText()
    await dialog.getByRole('button',{name:'完成',exact:true}).click()
    await page.getByPlaceholder('搜索客户名称或登录账号').fill(first)
    await expect(page.locator('.entity-card').first()).toContainText(first)
  } finally {
    await staffContext.close()
  }
  const single = await ok('/jiedan/customer',admin,'POST',{autoUsername:true,password:'123456',nickName:'单个测试'})
  expect(single.userName).toMatch(/^[a-z2-9]{8}$/)
  await login(single.userName,'123456')
})
