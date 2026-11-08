const {test,expect}=require('@playwright/test')
const {fixture}=require('./fixtures.cjs')
for(const [role,id] of [['boss',1],['employee',2]]) {
 test(role+' 浏览器打开时收到新报价邀请与往来提醒', async({page})=>{
  await fixture(page,role)
  let rows=[]
  await page.addInitScript(role=>{localStorage.setItem('token','fixture-'+role);localStorage.setItem('xc.notify.binding','bound')},role)
  await page.route('**/jiedan/quote/**',async r=>{
   const path=new URL(r.request().url()).pathname
   const data=path.endsWith('/list')?rows:path.endsWith('/conversation')?{items:[],hasMore:false}:rows[0]
   await r.fulfill({json:{code:200,data}})
  })
  await page.goto('/#/workbench')
  await expect(page.locator('.workbench-quotes .el-empty')).toBeVisible()
  const refresh=async()=>{
   const loaded=page.waitForResponse(r=>new URL(r.url()).pathname==='/jiedan/quote/list')
   await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
   await loaded
  }
  await refresh()
  rows=[{id:47,title:'网页测试',quoteNo:'小慧9',employeeId:2,creatorId:1,noticeVersion:1,readVersion:0,status:'pending',version:1}]
  await refresh()
  await expect(page.locator('.el-notification').filter({hasText:role==='boss'?'报价邀请已发出':'新需求待报价'})).toContainText('小慧9')
  rows[0]={...rows[0],readVersion:1,replyVersion:3}
  await refresh()
  const reply=page.locator('.el-notification').filter({hasText:'报价有新回复'})
  await expect(reply).toBeVisible()
  await reply.click()
  await expect(page).toHaveURL(/quotes\?id=47&tab=chat/)
 })
}
