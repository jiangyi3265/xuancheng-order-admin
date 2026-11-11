const { test, expect } = require('@playwright/test')

test('两人从看板来回交接，问题、加急、下一步和手动标记各自等待发起人确认', async ({browser,request,baseURL}) => {
  const apiBase = process.env.E2E_BASE
  if (!apiBase || new URL(apiBase).hostname !== '127.0.0.1' || !/^xc_e2e_\d+$/.test(process.env.E2E_DB)) throw Error('需要隔离测试库')
  const api = async (token,path,method='GET',data) => (await request.fetch(apiBase+path,{
    method,data,headers:token ? {Authorization:'Bearer '+token}:{}
  })).json()
  async function ok(...args) {const res=await api(...args);expect(res.code,res.msg).toBe(200);return res.data}
  async function login(username,password) {
    const res=await api(null,'/login','POST',{username,password});expect(res.code,res.msg).toBe(200);return res.token
  }
  const boss=await login('admin','admin123')
  const username='turn'+Date.now().toString().slice(-8)
  await ok(boss,'/jiedan/staff','POST',{userName:username,nickName:'交接处理人',password:'TeamTurn123'})
  const staff=await login(username,'TeamTurn123')
  const member=await ok(staff,'/jiedan/staff/me')
  const sender=await ok(boss,'/jiedan/staff/me')
  const title='交接回合 '+username
  const order=await ok(boss,'/jiedan/order','POST',{title,ownerId:member.id})
  const path='/jiedan/order/'+order.id
  await ok(staff,path+'/accept','POST')
  await ok(boss,path+'/urgency','PUT',{previousUntil:null,urgentUntil:'2029-11-14 17:30'})
  const next=await ok(boss,path+'/next','PUT',{content:'核对报价单'})
  expect(next.nextOwnerId).toBe(member.id)
  await ok(boss,path+'/handling','PUT',{handled:false,version:next.version})
  const withBug=await ok(boss,'/jiedan/order/bug','POST',{orderId:order.id,content:'按钮换行',needsAction:true})
  const bug=withBug.bugs.find(b=>b.content==='按钮换行')
  const customer=await login('cust_a','customer123')
  expect((await api(customer,path+'/task-review','POST',{kind:'manual',decision:'confirm',version:withBug.version})).code).not.toBe(200)
  const contexts=[]
  async function board(token,width) {
    const ctx=await browser.newContext({baseURL,viewport:{width,height:900}})
    contexts.push(ctx)
    await ctx.addInitScript(t=>localStorage.setItem('token',t),token)
    const page=await ctx.newPage()
    await page.goto('/#/order')
    const area=page.locator('.pending-projects')
    if(width===390) await area.getByRole('button',{name:/^待处理/}).click()
    const toggle=area.getByRole('button',{name:/查看全部/})
    if(await toggle.isVisible()) await toggle.click()
    return {area,page}
  }
  try {
    const owner=await board(staff,390)
    const reviewer=await board(boss,1440)
    const active=owner.area.getByRole('listitem').filter({hasText:title})
    const inbox=reviewer.area.getByRole('listitem').filter({hasText:title})
    await reviewer.area.getByRole('button',{name:/等同事处理/}).click()
    const expand = reviewer.area.getByRole('button',{name:/查看全部/})
    if(await expand.isVisible()) await expand.click()
    await expect(inbox).toHaveCount(4)
    await expect(inbox.first()).toContainText('现在由交接处理人处理')
    await expect(inbox.first()).toContainText('完成后交给你验收')
    // An outgoing issue, next step and manual mark must also remain visible from the workbench.
    const bench = await reviewer.page.context().newPage()
    await bench.goto('/#/workbench')
    const panel = bench.getByRole('region', {name:'项目交接'})
    await panel.getByRole('button',{name:/等同事处理/}).click()
    const more = panel.getByRole('button', {name:/查看全部/})
    if(await more.isVisible()) await more.click()
    const outgoing = panel.getByRole('listitem').filter({hasText:title})
    await expect(outgoing).toHaveCount(4)
    for(const kind of ['加急','下一步','问题','手动标记']) {
      await expect(outgoing.filter({has:bench.locator('.kind',{hasText:kind})})).toContainText('完成后交给你验收')
    }
    await bench.close()
    await reviewer.area.getByRole('button',{name:/待我验收/}).click()
    await expect(inbox).toHaveCount(0)
    await owner.area.getByRole('button',{name:/待我处理/}).click()
    const all=owner.area.getByRole('button',{name:/查看全部/})
    if(await all.isVisible()) await all.click()
    for(const kind of ['问题','下一步','手动标记']) {
      const row=active.filter({has:owner.page.locator('.pending-kind',{hasText:kind})})
      await expect(row).toContainText('完成后交给')
      await row.getByRole('button',{name:'提交验收'}).click()
      await expect(row).toHaveCount(0)
    }
    // The reviewer's open tab picks up the transfer without a reload.
    await expect(inbox).toHaveCount(3,{timeout:25000})
    await expect(inbox.first()).toContainText('现在由你验收')
    await expect(inbox.first()).toContainText('交接处理人已提交处理结果')
    await owner.area.getByRole('button',{name:/等同事验收/}).click()
    const sent = owner.area.getByRole('button',{name:/查看全部/})
    if(await sent.isVisible()) await sent.click()
    await expect(active).toHaveCount(3)
    await expect(active.first()).toContainText('你已提交处理结果')
    await expect(active.getByRole('button')).toHaveCount(0)
    await owner.area.getByRole('button',{name:/待我处理/}).click()
    await reviewer.page.getByRole('button',{name:/^待处理通知，/}).click()
    const bell = reviewer.page.getByRole('dialog',{name:'待处理通知'})
    await expect(bell.getByRole('region',{name:'待我验收'}).getByRole('listitem').filter({hasText:title})).toHaveCount(3)
    await expect(bell.getByRole('region',{name:'待我处理'}).getByRole('listitem').filter({hasText:title})).toHaveCount(0)
    await reviewer.page.keyboard.press('Escape')
    await expect(bell).toBeHidden()
    const reviewRow=kind=>inbox.filter({has:reviewer.page.locator('.pending-kind',{hasText:kind})})
    const current=await ok(boss,path)
    expect(current.taskTurns.next.requesterId).toBe(sender.id)
    expect((await api(staff,path+'/task-review','POST',{kind:'next',decision:'confirm',version:current.version})).code).toBe(403)
    await reviewRow('处理结果确认').getByRole('button',{name:'确认完成'}).click()
    expect((await ok(boss,path)).urgentUntil).toBeTruthy()
    await reviewRow('下一步确认').getByRole('button',{name:'退回处理'}).click()
    await reviewRow('问题验收').getByRole('button',{name:'退回处理'}).click()
    await expect(active).toHaveCount(2, {timeout:25000}) // mobile shows two cards until expanded
    const returned = owner.area.getByRole('button',{name:/查看全部/})
    if(await returned.isVisible()) await returned.click()
    for(const kind of ['问题','下一步','加急']) {
      const row=active.filter({has:owner.page.locator('.pending-kind',{hasText:kind})})
      await expect(row).toHaveCount(1,{timeout:25000})
      await row.getByRole('button',{name:'提交验收'}).click()
      await expect(row).toHaveCount(0)
    }
    await expect(inbox).toHaveCount(3,{timeout:25000})
    await reviewRow('问题验收').getByRole('button',{name:'确认完成'}).click()
    await reviewRow('下一步确认').getByRole('button',{name:'确认完成'}).click()
    await reviewRow('加急确认').getByRole('button',{name:'确认加急完成'}).click()
    await expect.poll(async()=>{const o=await ok(boss,path);return [o.urgentHandoff?.submittedAt, o.nextStep, o.internalReviewIssues.length].filter(Boolean)}).toEqual([])
    await expect(inbox).toHaveCount(0)
    const final=await ok(staff,path)
    expect(final.bugs.find(b=>b.id===bug.id).status).toBe('resolved')
    expect(final.nextStep).toBeFalsy()
    expect(final.urgentHandoff).toBeFalsy()
    expect(final.handled).toBe(true)
    // When the sender is the project owner and gives the next step to their colleague,
    // that colleague submits to the owner, irrespective of role.
    const reverse=await ok(staff,path+'/next','PUT',{content:'反向确认',ownerId:sender.id})
    const back=await ok(boss,path+'/pending-completion','POST',{kind:'next',version:reverse.version})
    expect(back.taskTurns.next.requesterId).toBe(member.id)
    expect((await api(boss,path+'/task-review','POST',{kind:'next',decision:'confirm',version:back.version})).code).toBe(403)
    await ok(staff,path+'/task-review','POST',{kind:'next',decision:'confirm',version:back.version})
  } finally {for(const ctx of contexts) await ctx.close()}
})
