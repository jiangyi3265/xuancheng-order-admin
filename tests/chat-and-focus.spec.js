const {test, expect} = require('@playwright/test')
const {fixture, order} = require('./fixtures.cjs')

async function signIn(page, role='boss') {
  await fixture(page, role)
  await page.addInitScript(r => localStorage.setItem(r==='customer'?'customerToken':'token','fixture-'+r), role)
}
const ok = (route,data) => route.fulfill({json:{code:200,data}})
async function insideScreen(locator) {
  await expect.poll(() => locator.evaluate(el => {
    const r = el.getBoundingClientRect()
    return r.top >= -1 && r.bottom <= innerHeight+1 && r.left >= -1 && r.right <= innerWidth+1
  })).toBe(true)
}

for (const [width,height] of [[1366,660],[375,620]]) {
  test('看板展开、待处理优先、返回原视图 '+width,async({page})=>{
    await page.setViewportSize({width,height})
    await signIn(page)
    await page.addInitScript(()=>localStorage.setItem('xc.orderView','kanban'))
    const rows=['普通项目','未读二','需处理','最新提醒'].map((title,i)=>({
      ...order,id:4-i,title,unread:i%2?[1]:[],actionBugCount:i===2?1:0,
      updateTime:'2026-11-07 10:0'+i+':00'
    }))
    await page.route('**/jiedan/order/list',r=>ok(r,rows))
    await page.route('**/jiedan/order/1',r=>ok(r,rows[3]))
    await page.route('**/jiedan/order/read',r=>{
      rows[3].unread=[]
      return ok(r,{id:1,version:1})
    })
    await page.goto('/#/order')
    const col=page.locator('.kanban-col').filter({has:page.getByRole('button',{name:'展开进行中',exact:true})})
    await expect(col.locator('.card').first()).toContainText('最新提醒')
    await expect(col.locator('.card').nth(1)).toContainText('需处理')
    await col.getByRole('button',{name:'展开进行中'}).click()
    const focus=page.getByRole('dialog',{name:'全屏看板'})
    await expect(focus.locator('.focus-open').first()).toContainText('最新提醒')
    await expect(focus.locator('.focus-open').nth(1)).toContainText('需处理')
    const rect=await focus.locator('.el-dialog').boundingBox()
    expect(rect.width).toBeCloseTo(width,0)
    expect(rect.height).toBeCloseTo(height,0)
    await focus.locator('.focus-open').first().click()
    await expect(page.locator('.workspace-head h2')).toHaveText('最新提醒')
    if(width>768) {
      await page.locator('.workspace-tabs').getByRole('button',{name:'沟通'}).click()
      await insideScreen(page.getByRole('button',{name:'发送给客户'}))
      await page.locator('.close-btn').click()
    } else await page.getByRole('button',{name:'关闭项目详情'}).click()
    await expect(focus.locator('.focus-open').first()).toContainText('需处理')
    await focus.getByRole('button',{name:'返回看板'}).click()
    await expect(page.locator('.kanban-col:visible')).toHaveCount(4)
    rows[2].actionBugCount=0
    await page.reload()
    await expect(col.locator('.card').first()).toContainText('未读二')
    await expect(col.locator('.card').nth(1)).toContainText('普通项目')
    await page.locator('.qchip').filter({hasText:'待确认'}).first().click()
    await expect(focus.getByText('当前没有符合条件的项目')).toBeVisible()
  })

  test('短屏报价弹窗可直接回车、选词、换行和发送贴图 '+width,async({page})=>{
    await page.setViewportSize({width,height})
    await signIn(page)
    const q={id:13,title:'报价测试',requirement:'需求说明。'.repeat(600),attachments:[],status:'quoted',
      creatorId:1,employeeId:2,employeeName:'费鹏飞',amount:1800,version:1,quoteNo:'谢谢1'}
    const items=Array.from({length:30},(_,i)=>({id:i+1,authorId:2,authorName:'同事',content:'沟通记录 '+i}))
    const sent=[]
    await page.route('**/jiedan/quote/**',async r=>{
      const path=new URL(r.request().url()).pathname
      if(path.endsWith('/conversation') && r.request().method()==='POST') {
        const payload=r.request().postDataJSON()
        sent.push(payload)
        items.push({...payload,id:items.length+1,authorId:1})
      }
      return ok(r,path.endsWith('/list')?[q]:path.endsWith('/conversation')?{items}:q)
    })
    await page.route('**/jiedan/media/upload',r=>ok(r,{type:'image',name:'收到.png',url:'/app-icon-192.png',size:1200}))
    await page.goto('/#/quotes?id=13')
    const dialog=page.getByRole('dialog',{name:'报价详情'})
    await insideScreen(dialog.getByRole('button',{name:'编辑报价单'}))
    await insideScreen(dialog.getByRole('button',{name:'转为正式项目'}))
    await dialog.getByRole('button',{name:'报价沟通'}).click()
    const field=dialog.getByRole('textbox',{name:'回复内容'})
    await insideScreen(field)
    await insideScreen(dialog.getByRole('button',{name:'发送回复'}))
    await field.fill('需求确认')
    await field.dispatchEvent('compositionstart')
    await field.dispatchEvent('keydown',{key:'Enter',isComposing:true,keyCode:229})
    await field.dispatchEvent('compositionend')
    expect(sent).toHaveLength(0)
    await field.press('Shift+Enter')
    await field.press('End')
    await field.press('A')
    await expect(field).toHaveValue('需求确认\nA')
    await field.evaluate(el=>el.setSelectionRange(2,2))
    await dialog.getByRole('button',{name:'选择表情或表情包'}).click()
    await page.getByRole('button',{name:'插入👍'}).click()
    await expect(field).toHaveValue('需求👍确认\nA')
    await field.press('Enter')
    await expect(field).toHaveValue('')
    expect(sent.map(m=>m.content)).toEqual(['需求👍确认\nA'])
    await dialog.getByRole('button',{name:'选择表情或表情包'}).click()
    await page.getByRole('button',{name:'添加表情包收到'}).click()
    await expect(dialog.locator('.composer .media-thumb')).toHaveCount(1)
    await field.press('Enter')
    await expect(dialog.locator('.composer .media-thumb')).toHaveCount(0)
    expect(sent[1].attachments[0]).toMatchObject({name:'收到.png',type:'image'})
    await field.press('Enter')
    expect(sent).toHaveLength(2)
  })
}

for (const role of ['customer','employee']) {
  test(role+' 项目沟通回车与表情走原发送接口',async({page})=>{
    await signIn(page,role)
    const messages=[]
    const path=role==='customer'?'/jiedan/portal/message':'/jiedan/order/progress'
    await page.route('**'+path,r=>{
      messages.push(r.request().postDataJSON())
      return ok(r,order)
    })
    await page.goto(role==='customer'?'/#/projects/1':'/#/order?id=1&tab=chat')
    if(role==='customer')await page.getByRole('button',{name:'沟通',exact:true}).click()
    const field=page.getByRole('textbox',{name:role==='customer'?'项目沟通消息':'回复客户'})
    await field.fill('确认')
    await page.getByRole('button',{name:'选择表情或表情包'}).click()
    await page.getByRole('button',{name:'插入😊'}).click()
    await field.press('Enter')
    await expect(field).toHaveValue('')
    expect(messages.map(m=>m.content)).toEqual(['确认😊'])
  })
}
