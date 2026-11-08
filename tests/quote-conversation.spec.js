const {test,expect}=require('@playwright/test')
const {fixture}=require('./fixtures.cjs')
test('已报价后双方可在同一单里追问、从微信链接回复并保留历史',async({page,browser,baseURL})=>{
 const other=await browser.newContext({baseURL,viewport:{width:390,height:844}})
 const staff=await other.newPage()
 const entries=[{id:1,authorId:2,authorName:'费鹏飞',kind:'price',content:'含设计和开发',amount:1800}]
 const read={1:0,2:0}
 const q={id:13,title:'商城报价',requirement:'开发商城',amount:1800,creatorId:1,creatorName:'尚琦凯',employeeId:2,employeeName:'费鹏飞',status:'quoted',noticeVersion:2,readVersion:2,version:3}
 const snapshot=id=>({...q,conversationVersion:entries.at(-1).id,replyVersion:entries.filter(m=>m.recipientId===id&&m.id>read[id]).at(-1)?.id||0})
 const errors=[]
 for(const [p,role,id] of [[page,'boss',1],[staff,'employee',2]]){
  errors.push(await fixture(p,role))
  await p.addInitScript(r=>localStorage.setItem('token','fixture-'+r),role)
  await p.route('**/jiedan/quote/**',async route=>{
   const req=route.request(),path=new URL(req.url()).pathname
   let result
   if(path.endsWith('/list'))result=[snapshot(id)]
   else if(path.endsWith('/read'))read[id]=Math.max(read[id],req.postDataJSON()[0].replyVersion||0)
   else if(path.endsWith('/conversation')&&req.method()==='POST'){
    const d=req.postDataJSON(); expect(d.clientKey.length).toBeGreaterThan(11);expect(d.employeeId).toBe(2)
    const m={id:entries.length+1,kind:'reply',authorId:id,authorName:id===1?'尚琦凯':'费鹏飞',recipientId:id===1?2:1,content:d.content,attachments:d.attachments}; entries.push(m);result={id:m.id}
   }else if(path.endsWith('/conversation'))result={items:entries,hasMore:false}
   else result=snapshot(id)
   await route.fulfill({json:{code:200,data:result}})
  })
 }
 try{
  await page.goto('/#/workbench')
  await page.locator('.workbench-quotes .quote-open').click()
  await page.getByRole('button',{name:'继续沟通'}).click()
  const log=p=>p.getByRole('log')
  await expect(log(page)).toContainText('1,800.00')
  await page.getByRole('textbox',{name:'回复内容'}).fill('包含部署吗？')
  await page.getByRole('button',{name:'发送回复'}).click()
  await expect(log(page)).toContainText('包含部署吗？')
  await staff.goto('/#/quotes?id=13&tab=chat')
  await expect(log(staff)).toContainText('包含部署吗？')
  await expect.poll(()=>read[2]).toBe(2)
  await staff.getByRole('textbox',{name:'回复内容'}).fill('包含部署，预计五天。')
  await staff.getByRole('button',{name:'发送回复'}).click()
  await expect(log(staff)).toContainText('包含部署，预计五天。')
  await page.goto('/#/quotes?id=13&tab=chat')
  await expect(log(page)).toContainText('包含部署，预计五天。')
  await expect.poll(()=>read[1]).toBe(3)
  await page.getByRole('textbox',{name:'回复内容'}).fill('好的，再确认下交付日。')
  await page.getByRole('button',{name:'发送回复'}).click()
  await expect(log(page).getByRole('article')).toHaveCount(4)
  await page.reload()
  await expect(log(page)).toContainText('好的，再确认下交付日。')
  await page.getByRole('button',{name:'报价信息',exact:true}).click()
  await expect(page.locator('.quote-result')).toContainText('1,800.00')
  expect(errors.flat()).toEqual([])
 }finally{await other.close()}
})
