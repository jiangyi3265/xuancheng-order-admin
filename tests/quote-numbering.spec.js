const {test,expect}=require('@playwright/test')
const {fixture}=require('./fixtures.cjs')
test('工作台可点选来源自动编号，默认发送给费鹏飞，按单号能找回',async({page})=>{
 await fixture(page)
 await page.addInitScript(()=>localStorage.setItem('token','fixture-boss'))
 const sources=['小慧','谢谢','硕硕','杨','小松','圈圈'].map(name=>({name,next:name==='谢谢'?3:1}))
 let saved,payload
 await page.route('**/jiedan/staff/list',r=>r.fulfill({json:{code:200,data:[{id:106,nickName:'费鹏飞',role:'employee',status:'0',defaultQuoteEmployee:true}]}}))
 await page.route(/\/jiedan\/quote(?:\/[^?]+)?$/,async r=>{
   const path=new URL(r.request().url()).pathname
   let data
   if(path.endsWith('/numbering'))data=sources
   else if(path.endsWith('/list'))data=saved?[saved]:[]
   else if(r.request().method()==='POST'){
    payload=r.request().postDataJSON()
    data=saved={...payload,id:7,creatorId:1,quoteNo:'谢谢3',title:'谢谢3',status:'pending',version:1,noticeVersion:1,createTime:'2026-11-07 09:31:10',sentTime:'2026-11-07 09:31:10'}
   }else data=saved
   await r.fulfill({json:{code:200,data}})
 })
 await page.goto('/#/workbench')
 await page.locator('.workbench-quotes').getByRole('button',{name:'发起报价'}).click()
 const d=page.getByRole('dialog',{name:'发起报价'})
 await expect(d.locator('.el-select')).toContainText('费鹏飞')
 await d.getByRole('button',{name:'小松',exact:true}).click()
 await expect(d.locator('.number-preview')).toContainText('小松1')
 await d.getByRole('button',{name:'谢谢',exact:true}).click()
 await expect(d.locator('.number-preview')).toContainText('谢谢3')
 await d.locator('textarea').fill('核对需求')
 await d.getByRole('button',{name:'发送报价邀请'}).click()
 await expect(page.getByRole('dialog',{name:'报价详情'})).toContainText('谢谢3')
 expect(payload).toMatchObject({sourceName:'谢谢',employeeId:106,title:''})
 await page.goto('/#/quotes')
 await page.getByPlaceholder('搜索单号、项目名称或姓名').fill('谢谢 3')
 await expect(page.locator('.quote-card')).toHaveCount(1)
 await expect(page.locator('.quote-card time')).toHaveText('2026-11-07 09:31')
})
