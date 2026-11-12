const {test, expect} = require('@playwright/test')
const {randomUUID} = require('node:crypto')
const path = require('node:path')
const fs = require('node:fs')

test('客户收到两条需求回复：从消息直达、独立已读、原需求带图重开和重复提交', async ({page, request}) => {
  const base = process.env.E2E_BASE
  if (new URL(base).hostname !== '127.0.0.1' || !/^xc_e2e_\d+$/.test(process.env.E2E_DB)) {
    throw Error('此检查只能使用本地测试数据库')
  }
  async function fetchApi(token, url, method='GET', data) {
    const response = await request.fetch(base+url, {method,data,headers:token ? {Authorization:'Bearer '+token} : {}})
    return response.json()
  }
  async function api(token,url,method,data) {
    const body = await fetchApi(token,url,method,data)
    expect(body.code,body.msg).toBe(200)
    return body.data
  }
  async function login(username,password) {
    const body=await fetchApi(null,'/login','POST',{username,password})
    expect(body.code,body.msg).toBe(200)
    return body.token
  }
  const boss = await login('admin','admin123')
  const account = 'client'+Date.now()
  const password = 'TestClient123'
  await api(boss,'/jiedan/customer','POST',{userName:account,nickName:'需求回归',password})
  const created = await api(boss,'/jiedan/order','POST',{title:'单项目客户',customerAccount:account,status:'doing',ownerId:1})
  const projectId=created.id
  const customer = await login(account,password)

  async function upload(name) {
    const response=await request.post(base+'/jiedan/media/upload',{
      headers:{Authorization:'Bearer '+customer},multipart:{
        file:{name,mimeType:'image/png',buffer:fs.readFileSync(path.join(__dirname,'../../public/app-icon-192.png'))}
      }
    })
    const data=await response.json()
    expect(data.code,data.msg).toBe(200)
    return {...data.data,name,type:'image'}
  }
  const images=await Promise.all(['页面一.png','页面二.png'].map(upload))
  const first=await api(customer,'/jiedan/order/intake','POST',{orderId:projectId,requirement:'',attachments:images,submissionKey:randomUUID()})
  const second=await api(customer,'/jiedan/order/intake','POST',{orderId:projectId,requirement:'修改第二处',attachments:[],submissionKey:randomUUID()})
  const firstId=first.bugId, secondId=second.bugId
  const summary = async () => (await api(customer,'/jiedan/portal/orders')).find(p=>p.id===projectId).requirements
  async function teamReply(id,content) {
    const result=await api(boss,'/jiedan/order/bug/'+id+'/update','POST',{content,attachments:[]})
    return result.bugs.find(b=>b.id===id).updates.find(u=>u.content===content).id
  }
  const earlier=await teamReply(firstId,'已记录第一处')
  const latest=await teamReply(firstId,'第一处已换图，请查收')
  const independent=await teamReply(secondId,'第二处的字号已调整')
  let rows=await summary()
  let firstSummary=rows.find(r=>r.id===firstId)
  expect(firstSummary.imageCount).toBe(2)
  expect(firstSummary.firstImage.url).toBe(images[0].url)
  expect(firstSummary.latestTeamReply).toMatchObject({id:latest,unread:true})
  expect(rows.find(r=>r.id===secondId).latestTeamReply).toMatchObject({id:independent,unread:true})

  await page.setViewportSize({width:390,height:844})
  await page.goto('/client/#/customer/messages')
  await page.getByPlaceholder('请输入登录账号').fill(account)
  await page.getByPlaceholder('请输入密码',{exact:true}).fill(password)
  await page.getByRole('button',{name:'登录',exact:true}).click()
  const message=page.locator('.message-card').filter({hasText:'第一处已换图，请查收'})
  await expect(message).toBeVisible()
  expect((await summary()).find(r=>r.id===firstId).latestTeamReply.unread).toBe(true)
  await message.click()
  await expect.poll(()=>new URLSearchParams(page.url().split('?').at(-1)).get('update')).toBe(String(latest))
  await expect(page.locator('#requirement-'+firstId)).toContainText('第一处已换图，请查收')
  await expect.poll(async()=>(await summary()).find(r=>r.id===firstId).latestTeamReply.unread).toBe(false)
  expect((await summary()).find(r=>r.id===secondId).latestTeamReply.unread).toBe(true)
  await api(customer,'/jiedan/portal/orders/'+projectId+'/issues/'+firstId+'/replies/'+earlier+'/read','POST')
  expect((await summary()).find(r=>r.id===firstId).latestTeamReply.unread).toBe(false)

  const url='/jiedan/portal/bug/'+firstId+'/update'
  await api(boss,'/jiedan/order/bug/'+firstId+'/status','PUT',{status:'resolved'})
  // 客户提的问题：团队做完是「已处理」，等客户确认；客户确认后才是已解决，之后才能带图重开
  const pending=(await api(customer,'/jiedan/portal/orders/'+projectId)).bugs.find(b=>b.id===firstId)
  expect(pending.progressStatus).toBe('confirm')
  await api(customer,'/jiedan/portal/bug/'+firstId+'/review/'+pending.review.id,'POST',{decision:'accept'})
  const body={content:'边距还要调整',attachments:[images[0]],reopen:true,requestKey:randomUUID()}
  await Promise.all([api(customer,url,'POST',body),api(customer,url,'POST',body)])
  const detail=await api(customer,'/jiedan/portal/orders/'+projectId)
  const issue=detail.bugs.find(b=>b.id===firstId)
  expect(issue.progressStatus).toBe('action')
  const replies=issue.updates.filter(u=>u.content===body.content)
  expect(replies).toHaveLength(1)
  expect(replies[0].senderKind).toBe('customer')
  expect(replies[0].attachments).toHaveLength(1)
  // 最新一条团队回复是「请确认这次修改」，客户确认时已经看过
  const verified=(await summary()).find(r=>r.id===firstId).latestTeamReply
  expect(verified.id).toBe(pending.review.id)
  expect(verified.unread).toBe(false)
})
