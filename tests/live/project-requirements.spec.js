const {test, expect} = require('@playwright/test')
const {randomUUID} = require('node:crypto')

const base = process.env.E2E_BASE
test.beforeEach(() => {
  if (new URL(base).hostname !== '127.0.0.1' || !/^xc_e2e_\d+$/.test(process.env.E2E_DB)) throw Error('需要临时测试库')
})
async function api(request, token, path, method='GET', data) {
  const response=await request.fetch(base+path,{method,data,headers:token ? {Authorization:'Bearer '+token} : {}})
  return response.json()
}
async function login(request, username, password) {
  const result=await api(request,null,'/login','POST',{username,password})
  expect(result.code,result.msg).toBe(200)
  return result.token
}
async function customerPage(page, username='cust_a', projectTitle='甲客户的需求') {
  await page.goto('/client/#/intake')
  await page.getByPlaceholder('请输入登录账号').fill(username)
  await page.getByPlaceholder('请输入密码',{exact:true}).fill('customer123')
  await page.getByRole('button',{name:'登录',exact:true}).click()
  await expect(page.locator('.project-context')).toContainText(projectTitle)
}
for (const width of [390,1440]) {
  test('一条需求归入绑定项目，免填电话，管理端处理、客户端查看 '+width,async({page,request})=>{
    await page.setViewportSize({width,height:860})
    // The admin handles their own customer's project in this scenario.
    // The other seed customer is bound to an unmigrated legacy owner with no login.
    await customerPage(page, 'cust_b', '乙客户的需求')
    const text='首页按钮改为确认到店 '+randomUUID().slice(0,8)
    await page.getByLabel('要改什么？').fill(text)
    await page.locator('input[type=file]').setInputFiles({name:'修改参考.txt',mimeType:'text/plain',buffer:Buffer.from('确认到店')})
    await expect(page.locator('.file-row')).toContainText('修改参考')
    await page.reload()
    await expect(page.getByLabel('要改什么？')).toHaveValue(text)
    const response=page.waitForResponse(r=>r.url().endsWith('/jiedan/order/intake')&&r.request().method()==='POST')
    await page.getByRole('button',{name:'提交需求',exact:true}).click()
    const received=await (await response).json()
    expect(received.code,received.msg).toBe(200)
    const {id,bugId}=received.data
    expect(id).toBe(4);expect(bugId).toBeGreaterThan(0)
    await page.getByRole('button',{name:'查看处理进度'}).click()
    const target=page.locator('#requirement-'+bugId)
    await expect(target).toContainText(text)
    await expect(target).toContainText('等团队处理')
    const admin=await login(request,'admin','admin123')
    const path='/jiedan/order/bug/'+bugId+'/status'
    const change=async status=>{
      const result=await api(request,admin,path,'PUT',{status})
      expect(result.code,result.msg).toBe(200)
    }
    await change('action')
    await page.getByRole('button',{name:'返回列表'}).click()
    const row=page.getByRole('link').filter({hasText:text})
    await expect(row).toContainText('等团队处理')
    const search = page.getByRole('searchbox',{name:'搜索需求名称或编号'})
    await search.fill('需求 #' + bugId)
    await expect(page.locator('.request-row .request-main .issue-number')).toHaveText('#' + bugId)
    await search.fill('')
    await expect(page.locator('.project')).toHaveCount(1)
    const showFilters=async()=>{
      const toggle=page.getByRole('button',{name:'筛选',exact:true})
      if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click()
    }
    await showFilters()
    const recentDay = page.getByRole('button',{name:'近 1 天',exact:true})
    await recentDay.click()
    await page.getByRole('button',{name:/^未解决/}).click()
    await expect(row).toContainText('等团队处理')
    await page.getByRole('button',{name:/^已解决/}).click()
    await expect(row).toHaveCount(0)
    await page.getByRole('button',{name:/^未解决/}).click()
    await row.click()
    await expect(target).toContainText('等团队处理')
    const employeeView=await api(request,admin,'/jiedan/order/'+id)
    expect(employeeView.data.bugs.find(b=>b.id===bugId).attachments).toHaveLength(1)
    await change('resolved')
    await page.reload()
    await expect(target).toContainText('已解决')
    await page.getByRole('button',{name:'返回列表'}).click()
    await showFilters()
    await expect(recentDay).toHaveAttribute('aria-pressed','true')
    await expect(page.getByRole('button',{name:/^未解决/})).toHaveAttribute('aria-pressed','true')
    await expect(row).toHaveCount(0)
    await page.getByRole('button',{name:/^已解决/}).click()
    await expect(row).toContainText('已解决')
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)
    if(process.env.POLISH_WORK) await page.screenshot({path:process.env.POLISH_WORK+'/requirements-'+width+'.png'})
  })
}
test('回执重试、附件单独提交、跨账号隔离、选项目',async({page,request})=>{
  const customer=await login(request,'cust_a','customer123')
  const other=await login(request,'cust_b','customer123')
  const owner=await login(request,'admin','admin123')
  const path='/jiedan/order/intake'
  const data={orderId:3,title:'更新文字',requirement:'确认到店',contact:'测试微信',submissionKey:randomUUID()}
  const responses=await Promise.all(Array.from({length:4},()=>api(request,customer,path,'POST',data)))
  for(const r of responses) expect(r.code,r.msg).toBe(200)
  const bugId=responses[0].data.bugId
  expect(new Set(responses.map(r=>r.data.bugId)).size).toBe(1)
  expect(responses.filter(r=>r.data.replayed)).toHaveLength(3)
  expect((await api(request,customer,path,'POST',{...data,title:'新文字'})).data.changed).toBe(true)
  expect((await api(request,other,path,'POST',data)).code).not.toBe(200)
  expect((await api(request,other,'/jiedan/portal/orders/3')).code).not.toBe(200)
  const sameKeyOther=await api(request,other,path,'POST',{...data,orderId:4})
  expect(sameKeyOther.data.bugId).not.toBe(bugId)
  const stored=(await api(request,owner,'/jiedan/order/3')).data.bugs.find(b=>b.id===bugId)
  expect(stored.content).toContain('联系方式：测试微信')
  expect((await api(request,customer,'/jiedan/portal/orders/3','DELETE')).code).not.toBe(200)
  await api(request,customer,'/jiedan/portal/bug/'+bugId,'DELETE')
  const deleted=(await api(request,customer,path,'POST',data)).data
  expect(deleted.replayed).toBe(true);expect(deleted.id).toBeFalsy()
  const project=(await api(request,owner,'/jiedan/order','POST',{title:'第二个项目',customerAccount:'cust_a'})).data
  expect(project.id).toBeTruthy()
  expect((await api(request,customer,path,'POST',{requirement:'未选所属项目'})).code).not.toBe(200)
  await customerPage(page)
  await page.getByRole('combobox',{name:'所属项目'}).selectOption(String(project.id))
  await page.locator('input[type=file]').setInputFiles({name:'需求说明.txt',mimeType:'text/plain',buffer:Buffer.from('文件需求')})
  await expect(page.locator('.file-row')).toContainText('需求说明')
  await page.getByRole('combobox',{name:'所属项目'}).selectOption('3')
  await expect(page.locator('.file-row')).toHaveCount(0)
  await page.getByRole('combobox',{name:'所属项目'}).selectOption(String(project.id))
  await expect(page.locator('.file-row')).toHaveCount(1)
  await page.reload()
  let accepted
  await page.route('**/jiedan/order/intake',async r=>{
    if(accepted) return r.continue()
    accepted=(await (await r.fetch()).json()).data
    await r.abort('failed')
  })
  await page.getByRole('button',{name:'提交需求',exact:true}).click()
  await expect(page.getByRole('alert')).toContainText('草稿已保留')
  await page.reload()
  await page.getByRole('button',{name:'提交需求',exact:true}).click()
  await expect(page.getByRole('heading',{name:'提交成功'})).toBeVisible()
  await page.getByRole('button',{name:'查看处理进度'}).click()
  await expect(page.locator('#requirement-'+accepted.bugId)).toContainText('附件需求')
  expect(accepted.id).toBe(project.id)
  expect((await api(request,owner,'/jiedan/order/'+project.id)).data.bugs).toHaveLength(1)
})
