const {test, expect} = require('@playwright/test')
const {randomUUID} = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

test('客户对照图片、退回调整，再连续确认同项目两条修改', async ({request,browser,baseURL}) => {
  const apiBase = process.env.E2E_BASE
  if (!apiBase || new URL(apiBase).hostname !== '127.0.0.1' || !/^xc_e2e_\d+$/.test(process.env.E2E_DB)) {
    throw new Error('此流程仅用于本地隔离测试库')
  }
  async function api(path, token, data) {
    const response = await request.fetch(apiBase+path, {
      method:data ? 'POST' : 'GET',data,headers:token ? {Authorization:'Bearer '+token} : {}
    })
    const result = await response.json()
    expect(result.code, result.msg).toBe(200)
    return result
  }
  const suffix = randomUUID().slice(0,8)
  const staff = 'rvst'+suffix, client = 'rvcu'+suffix, password = 'ReviewTest123'
  const adminToken = (await api('/login',null,{username:'admin',password:'admin123'})).token
  await api('/jiedan/staff',adminToken,{userName:staff,nickName:'测试负责人',password})
  const team = (await api('/jiedan/staff/list',adminToken)).data
  const ownerId = team.find(member=>member.userName===staff).id
  await api('/jiedan/customer',adminToken,{userName:client,nickName:'测试客户',password,ownerId})
  const project = (await api('/jiedan/order',adminToken,{title:'确认流程'+suffix,customerAccount:client,ownerId,status:'doing'})).data
  const clientToken = (await api('/login',null,{username:client,password})).token
  const staffToken = (await api('/login',null,{username:staff,password})).token
  await api('/jiedan/order/'+project.id+'/accept',staffToken,{})
  const picture = name=>({name,mimeType:'image/png',buffer:fs.readFileSync(path.join(__dirname,'../../public/app-icon-192.png'))})
  const original = await request.post(apiBase+'/jiedan/media/upload',{
    headers:{Authorization:'Bearer '+clientToken},multipart:{file:picture('改前截图.png')}
  })
  const before=(await original.json()).data
  const subject='把预订按钮改为到店确认'
  const receipt=(await api('/jiedan/order/intake',clientToken,{
    orderId:project.id,requirement:subject,attachments:[{...before,type:'image',name:'改前截图.png'}],submissionKey:randomUUID()
  })).data
  const issue=receipt.bugId
  const getBug=async()=> (await api('/jiedan/order/'+project.id,staffToken)).data.bugs.find(b=>b.id===issue)
  const contexts=[]
  async function open(user, initialPath, width) {
    const context=await browser.newContext({baseURL,viewport:{width,height:820},hasTouch:width<600})
    contexts.push(context)
    const page=await context.newPage()
    await page.goto(initialPath)
    await page.getByPlaceholder('请输入登录账号').fill(user)
    await page.getByPlaceholder('请输入密码',{exact:true}).fill(password)
    await page.getByRole('button',{name:'登录',exact:true}).click()
    return page
  }
  try {
    await api('/jiedan/order/bug/'+issue+'/update',staffToken,{content:'已收到，我先看一下'})
    const customer=await open(client,'/client/#/projects',390)
    await expect(customer.getByRole('heading',{name:'我的需求',exact:true})).toBeVisible()
    await expect(customer.getByRole('navigation').getByRole('link',{name:'我的需求',exact:true})).toBeVisible()
    await expect(customer.locator('.request-row').filter({hasText:subject})).toContainText('等团队处理')
    await expect(customer.locator('.review-inbox')).toHaveCount(0)
    const worker=await open(staff,'/#/order?id='+project.id+'&tab=bugs&bug='+issue,1440)
    const card=worker.locator('.bug-item[data-notice-id="'+issue+'"]')
    await expect(card.locator('.bug-disclosure')).toHaveAttribute('aria-expanded','true')
    async function requestReview(text) {
      await card.getByRole('button',{name:'请客户确认',exact:true}).click()
      const dialog=worker.getByRole('dialog',{name:'请客户确认'})
      await dialog.getByRole('textbox',{name:'修改说明'}).fill(text)
      await dialog.locator('input[type=file]').first().setInputFiles(picture('改后截图.png'))
      const response=worker.waitForResponse(r=>r.url().endsWith('/bug/'+issue+'/review') && r.request().method()==='POST')
      await dialog.getByRole('button',{name:'发送确认请求'}).click()
      const result=await (await response).json()
      expect(result.code,result.msg).toBe(200)
      await expect(dialog).toBeHidden()
      return (await getBug()).review
    }
    const first=await requestReview('按钮文案已更新')
    expect(first.beforeImage.url).toBe(before.url)
    expect(first.afterImage.url).toBeTruthy()
    await customer.goto('/#/customer/messages')
    const invitation=customer.locator('.message-card').filter({hasText:'等你确认'})
    await expect(invitation).toHaveCount(1)
    await expect(customer.locator('.message-card').filter({hasText:'按钮文案已更新'})).toHaveCount(1)
    await invitation.click()
    await expect(customer).toHaveURL(new RegExp('review='+first.id+'(?:&|$)'))
    const panel=customer.getByRole('region',{name:'本次修改'})
    await expect(panel).toBeVisible()
    const imageSwitch=panel.getByRole('group',{name:'切换对照图'})
    await expect(imageSwitch.getByRole('button',{name:'改后'})).toHaveAttribute('aria-pressed','true')
    await imageSwitch.getByRole('button',{name:'改前'}).click()
    await expect(panel.getByRole('button',{name:'放大改前截图'})).toBeVisible()
    await expect(panel.getByRole('button',{name:'放大改后截图'})).toBeHidden()
    await imageSwitch.getByRole('button',{name:'改后'}).click()
    await expect(panel.getByRole('button',{name:'放大改后截图'})).toBeVisible()
    await panel.getByRole('button',{name:'还要调整',exact:true}).click()
    const field=customer.getByRole('textbox',{name:'调整说明'})
    await field.fill('字可以再大一点')
    await customer.getByRole('button',{name:'提交调整',exact:true}).click()
    await expect.poll(async()=>(await getBug()).status).toBe('action')
    const adjustment=await getBug()
    expect(adjustment.updates.filter(u=>u.senderKind==='customer' && u.content.includes('字可以再大一点'))).toHaveLength(1)
    await customer.goto('/#/projects')
    await expect(customer.locator('.request-row').filter({hasText:subject})).toContainText('等团队处理')
    await expect(customer.locator('.review-inbox')).toHaveCount(0)
    await worker.reload()
    await expect(card.locator('.bug-disclosure')).toHaveAttribute('aria-expanded','true')
    const second=await requestReview('字号已调大')
    expect(second.id).not.toBe(first.id)
    const otherSubject='更新联系页电话'
    const otherIssue=(await api('/jiedan/order/intake',clientToken,{
      orderId:project.id,requirement:otherSubject,attachments:[],submissionKey:randomUUID()
    })).data.bugId
    const otherNote='联系页电话号码已更正'
    const requested=(await api('/jiedan/order/bug/'+otherIssue+'/review',staffToken,{
      content:otherNote,requestKey:randomUUID()
    })).data
    const otherReviewId=requested.bugs.find(b=>b.id===otherIssue).review.id
    async function customerIssues() {
      return (await api('/jiedan/portal/orders/'+project.id,clientToken)).data.bugs
    }
    const pending=await customerIssues()
    for (const [id, reviewId] of [[issue,second.id],[otherIssue,otherReviewId]]) {
      expect(pending.find(b=>b.id===id)).toMatchObject({progressStatus:'confirm',review:{id:reviewId,state:'pending'}})
    }
    await customer.setViewportSize({width:1440,height:850})
    await customer.reload()
    const inbox=customer.locator('.review-inbox')
    await inbox.locator('summary').filter({hasText:'等我确认（2）'}).click()
    await inbox.getByRole('link').filter({hasText:subject}).click()
    await expect(customer).toHaveURL(new RegExp('review='+second.id+'(?:&|$)'))
    await expect(panel).toBeVisible()
    for (const label of ['改前','改后']) {
      await expect(panel.getByRole('button',{name:'放大'+label+'截图'})).toBeVisible()
    }
    await panel.getByRole('button',{name:'确认好了',exact:true}).click()
    await expect.poll(async()=>(await getBug()).status).toBe('resolved')
    await panel.getByRole('button',{name:'查看下一条待确认（剩 1 条）'}).click()
    await expect(customer).toHaveURL(new RegExp('issue='+otherIssue+'&review='+otherReviewId+'$'))
    await expect(panel).toContainText(otherNote)
    expect((await customerIssues()).find(b=>b.id===otherIssue)).toMatchObject({progressStatus:'confirm',review:{state:'pending'}})
    await panel.getByRole('button',{name:'确认好了',exact:true}).click()
    await expect(panel.getByRole('button',{name:/查看下一条/})).toHaveCount(0)
    await panel.getByRole('button',{name:'返回列表',exact:true}).click()
    await expect(customer).toHaveURL(/#\/projects$/)
    await expect(customer.locator('.request-row').filter({hasText:subject})).toContainText('已解决')
    await expect(customer.locator('.request-row').filter({hasText:otherSubject})).toContainText('已解决')
    await expect(inbox).toHaveCount(0)
    const resolved=await customerIssues()
    for (const id of [issue,otherIssue]) {
      expect(resolved.find(b=>b.id===id)).toMatchObject({progressStatus:'resolved',review:{state:'accepted'}})
    }
  } finally { await Promise.all(contexts.map(context=>context.close())) }
})
