const {test, expect} = require('@playwright/test')
const {fixture, order} = require('./fixtures.cjs')

const project = {...order, title:'橙子改版', unread:[]}
const quote = {
  id:project.id, title:project.title, quoteNo:'谢谢3', sourceName:'谢谢',
  creatorId:1, creatorName:'尚琦凯', employeeId:2, employeeName:'小陈',
  status:'quoted', version:1, noticeVersion:1, readVersion:1
}
const ok = (route, data) => route.fulfill({json:{code:200,data}})

async function setup(page, {width=1366, role='boss', projects=[project], listQuotes}={}) {
  await fixture(page,role)
  await page.setViewportSize({width,height:760})
  await page.addInitScript(r=>localStorage.setItem('token','fixture-'+r),role)
  await page.route('**/jiedan/order/list', r=>ok(r,projects))
  await page.route('**/jiedan/order/1', r=>ok(r,project))
  await page.route('**/jiedan/quote/list', listQuotes || (r=>ok(r,[quote])))
  await page.route('**/jiedan/quote/1', r=>ok(r,quote))
  await page.goto('/#/workbench')
  await expect(page.locator('.workbench-quotes')).toBeVisible()
}

const query = page => page.locator('input[aria-label="搜索项目和报价"]:visible')
const options = page => page.getByRole('option')
const quoteDialog = page => page.getByRole('dialog',{name:'报价详情'})
const searchName = '搜索项目和报价'

test('跨类型同名同 ID 的项目和报价能分别打开', async({page})=>{
  await setup(page)
  const input = query(page)
  await page.keyboard.press('Control+k')
  await expect(input).toBeFocused()
  await input.fill(project.title)
  const rows = options(page)
  await expect(rows).toHaveCount(2)
  const orderRow = rows.filter({hasText:project.orderNo})
  await expect(orderRow).toContainText('项目')
  await orderRow.click()
  await expect(page).toHaveURL(/#\/order\?[^#]*\bid=1\b/)
  await expect(page.locator('.workspace-head h2')).toHaveText(project.title)
  await page.goBack()
  await expect(page).toHaveURL(/#\/workbench$/)
  await input.fill(quote.title)
  const quoteRow = rows.filter({hasText:quote.quoteNo})
  await expect(quoteRow).toContainText('报价')
  await quoteRow.click()
  await expect(page).toHaveURL(/#\/quotes\?[^#]*\bid=1\b/)
  await expect(quoteDialog(page).locator('.quote-detail-title h2')).toHaveText(quote.title)
})

test('手机工作台直接搜报价，精确单号优先于其他项目的部分匹配', async({page})=>{
  const projects = Array.from({length:15},(_,i)=>({
    ...project,id:i+2,title:'谢谢3相关项目 '+(i+1),orderNo:'XC-'+(i+2)
  }))
  await setup(page,{width:375,role:'employee',projects})
  const input = query(page)
  if (!(await input.count())) await page.getByRole('button',{name:searchName,exact:true}).click()
  await input.fill('谢谢 3')
  const first = options(page).first()
  await expect(first).toContainText(quote.title)
  await expect(first).toContainText('报价')
  const bounds = await first.boundingBox()
  expect(bounds.x).toBeGreaterThanOrEqual(-1)
  expect(bounds.x+bounds.width).toBeLessThanOrEqual(376)
  await first.click()
  await expect(quoteDialog(page)).toContainText(quote.quoteNo)
})

test('已输入的搜索会随慢到的报价列表更新，可直接回车打开新排第一的精确结果',async({page})=>{
  let release
  const delayed = new Promise(resolve=>{release=resolve})
  await setup(page,{
    projects:[{...project,title:'谢谢3项目复盘'}],
    listQuotes:async r=>{await delayed;await ok(r,[quote])}
  })
  const input = query(page)
  try {
    await input.fill('谢谢3')
    await expect(options(page).first()).toContainText('谢谢3项目复盘')
  } finally {release()}
  await expect(options(page).first()).toContainText(quote.title)
  await input.press('Enter')
  await expect(quoteDialog(page)).toContainText(quote.quoteNo)
  await expect(page).toHaveURL(/#\/quotes\?[^#]*\bid=1\b/)
})

test('键盘选中同名报价后，列表刷新不会让回车误开项目',async({page})=>{
  let updated = false
  await setup(page,{listQuotes:r=>ok(r,[updated ? {...quote,sourceName:'最新来源'} : quote])})
  const input = query(page)
  await input.fill(quote.title)
  const selected = options(page).filter({hasText:quote.quoteNo})
  await expect(selected).toBeVisible()
  await input.press('ArrowDown')
  await expect(selected).toHaveAttribute('aria-selected','true')
  updated = true
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
  await expect(selected).toContainText('最新来源')
  await input.press('Enter')
  await expect(page).toHaveURL(/#\/quotes\?[^#]*\bid=1\b/, {timeout:3000})
})

test('输入法确认候选词时，回车留给输入法，下一次普通回车才打开结果',async({page})=>{
  await setup(page)
  const input = query(page)
  await input.fill(quote.quoteNo)
  await expect(options(page).first()).toContainText(quote.title)
  for (const flags of [{isComposing:true,keyCode:13},{isComposing:false,keyCode:229}]) {
    const allowedDefault = await input.evaluate((el,flags)=>el.dispatchEvent(new KeyboardEvent('keydown',{
      key:'Enter',code:'Enter',...flags,bubbles:true,cancelable:true
    })),flags)
    expect(allowedDefault).toBe(true)
  }
  await expect(page).toHaveURL(/#\/workbench$/)
  await input.press('Enter')
  await expect(quoteDialog(page)).toContainText(quote.quoteNo)
})

test('选中的报价从搜索列表消失时，回车不会误打开剩下的项目',async({page})=>{
  let removed = false
  await setup(page,{listQuotes:r=>ok(r,removed ? [] : [quote])})
  const input = query(page)
  await input.fill(quote.title)
  await expect(options(page)).toHaveCount(2)
  await input.press('ArrowDown')
  await expect(options(page).last()).toHaveAttribute('aria-selected','true')
  removed = true
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
  await expect(options(page)).toHaveCount(1)
  await input.press('Enter')
  await expect(input).toBeFocused()
  await expect(options(page).first()).toHaveAttribute('aria-selected','false')
  await input.press('ArrowDown')
  await input.press('Enter')
  await expect(page.locator('.workspace-head h2')).toHaveText(project.title)
})
