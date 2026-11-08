const {test,expect}=require('@playwright/test')
const {fixture,order}=require('./fixtures.cjs')
const ok=(r,data)=>r.fulfill({json:{code:200,data}})
const file=name=>({name,mimeType:'image/png',buffer:Buffer.from('attachment')})
const nav=(page,path)=>page.evaluate(hash=>{location.hash=hash},path)
async function setup(page,role) {
  await fixture(page,role)
  await page.addInitScript(role=>localStorage.setItem(role==='customer'?'customerToken':'token','fixture-'+role),role)
}
test('慢传切换报价后附件仍归原报价，重试成功才可发送',async({page})=>{
  await setup(page,'boss')
  const quote=id=>({id,title:'报价'+id,status:'pending',creatorId:1,employeeId:2,version:1})
  const sent=[]
  let held
  let flaky=0
  await page.route('**/jiedan/quote/**',r=>{
    const path=new URL(r.request().url()).pathname
    const chat=path.match(/(\d+)\/conversation$/)
    if(chat && r.request().method()==='POST') {
      sent.push({quote:chat[1],...r.request().postDataJSON()})
      return ok(r,{id:sent.length})
    }
    return ok(r,chat?{items:[],hasMore:false}:path.endsWith('/list')?[quote(1),quote(2)]:quote(Number(path.split('/').pop())))
  })
  await page.route('**/jiedan/media/upload',r=>{
    const name=r.request().postDataBuffer().toString().includes('plan.png')?'plan.png':'logo.png'
    if(name==='plan.png'&&++flaky===1){held=r;return}
    return ok(r,{url:'/uploads/'+name})
  })
  const field=page.getByRole('textbox',{name:'回复内容'})
  await page.goto('/#/quotes?id=1&tab=chat')
  await field.fill('两份材料一起看')
  await page.locator('.conversation .chat-input input[type=file]').setInputFiles([file('logo.png'),file('plan.png')])
  await expect.poll(()=>!!held).toBe(true)
  await expect(page.locator('.conversation .composer .media-thumb')).toHaveCount(1)
  await nav(page,'/quotes?id=2&tab=chat')
  await expect(field).toHaveValue('')
  await field.fill('这一单可以继续沟通')
  await field.press('Enter')
  await expect(field).toHaveValue('')
  expect(sent.map(m=>m.quote)).toEqual(['2'])
  await nav(page,'/quotes?id=1&tab=chat')
  await expect(field).toHaveValue('两份材料一起看')
  await expect(page.locator('.conversation .upload-feedback')).toContainText('正在上传')
  const send=page.getByRole('button',{name:'发送回复'})
  await expect(send).toBeDisabled()
  await held.fulfill({json:{code:500,msg:'网络暂不可用'}})
  const feedback=page.locator('.conversation .upload-feedback')
  await expect(feedback).toContainText('plan.png')
  await field.press('Enter')
  expect(sent.length).toBe(1)
  await feedback.getByRole('button',{name:'重试'}).click()
  await expect(send).toBeEnabled()
  await send.click()
  await expect(field).toHaveValue('')
  expect(sent[1].quote).toBe('1')
  expect(sent[1].attachments.map(a=>a.name)).toEqual(['logo.png','plan.png'])
})
for(const role of ['boss','customer']) test('单个附件失败可移除，发送时保留文字和成功的文件 · '+role,async({page})=>{
  await setup(page,role)
  const sent=[]
  await page.route('**/jiedan/media/upload',r=>{
    if(r.request().postDataBuffer().toString().includes('missing.png')) return r.fulfill({json:{code:500,msg:'网络暂不可用'}})
    return ok(r,{url:'/uploads/ready.png'})
  })
  await page.route('**/jiedan/'+(role==='boss'?'order/progress':'portal/message'),r=>{sent.push(r.request().postDataJSON());return ok(r,order)})
  await page.goto(role==='boss'?'/#/order?id=1&tab=chat':'/#/projects/1?tab=chat')
  const composer=page.locator(role==='boss'?'.chat-panel .composer':'.composer[data-paste-zone="沟通"]')
  const field=composer.getByRole('textbox')
  await field.fill('这份可以先看')
  await composer.locator('.chat-input input[type=file]').setInputFiles([file('ready.png'),file('missing.png')])
  const failed=composer.locator('.upload-feedback')
  await expect(failed).toContainText('missing.png')
  await field.press('Enter')
  const send=composer.getByRole('button',{name:role==='boss'?'发送给客户':'发送',exact:true})
  await expect(send).toBeDisabled()
  expect(sent).toEqual([])
  await failed.getByRole('button',{name:'移除 missing.png'}).click()
  await expect(send).toBeEnabled()
  await send.click()
  await expect(field).toHaveValue('')
  expect(sent.map(m=>m.attachments.map(a=>a.name))).toEqual([['ready.png']])
})

test('刷新后保留已完成的附件，并能重新选择未传成功的文件',async({page})=>{
  await setup(page,'customer')
  const sent=[]
  let first=true
  await page.route('**/jiedan/media/upload',r=>{
    const name=r.request().postDataBuffer().toString().includes('missing.png')?'missing.png':'ready.png'
    if(name==='missing.png'&&first){first=false;return r.fulfill({json:{code:500,msg:'上传失败'}})}
    return ok(r,{url:'/uploads/'+name})
  })
  await page.route('**/jiedan/portal/message',r=>{sent.push(r.request().postDataJSON());return ok(r,order)})
  await page.goto('/#/projects/1?tab=chat')
  const composer=page.locator('.composer[data-paste-zone="沟通"]')
  await composer.getByRole('textbox').fill('核对两张图')
  await composer.locator('.chat-input input[type=file]').setInputFiles([file('missing.png'),file('ready.png')])
  await expect(composer.getByRole('button',{name:'重试'})).toBeVisible()
  await page.reload()
  await expect(composer.getByRole('textbox')).toHaveValue('核对两张图')
  await expect(composer.locator('.media-thumb')).toHaveCount(1)
  const send=composer.getByRole('button',{name:'发送',exact:true})
  await expect(send).toBeDisabled()
  await composer.getByLabel('重新选择 missing.png',{exact:true}).setInputFiles(file('missing.png'))
  await expect(send).toBeEnabled()
  await send.click()
  await expect(composer.getByRole('textbox')).toHaveValue('')
  expect(sent[0].attachments.map(a=>a.name)).toEqual(['ready.png','missing.png'])
})
