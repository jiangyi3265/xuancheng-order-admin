const {test, expect} = require('@playwright/test')
const {fixture, order} = require('./fixtures.cjs')

const rows = Array.from({length:48}, (_, i) => ({
  ...order, id:i+1, title:'验收方案 '+(i+1), actionBugCount:0, unread:[],
  deadline:i===0?'':i===1?'2026-04-02':'2026-05-03', receivedAmount:100,
  amount:1000+i*100, nextStep:i===0?'核对日期':'', version:1
}))
async function visit(page, {mobile=false, mode='list', role='boss', path='/#/order', list} = {}) {
  await fixture(page, role)
  await page.setViewportSize({width:mobile?390:1440,height:mobile?844:800})
  await page.addInitScript(([role,mode]) => {
    localStorage.setItem('token','fixture-'+role)
    localStorage.setItem('xc.orderView',mode)
  },[role,mode])
  await page.route('**/jiedan/order/list', list || (r=>r.fulfill({json:{code:200, data:rows}})))
  await page.goto(path)
}

test('项目首次加载占位，失败可重试，空筛选可清除', async ({page}) => {
  let release, fail=true
  const gate=new Promise(resolve=>release=resolve)
  await visit(page,{list:async r=>{
    await gate
    await r.fulfill({json:fail ? {code:500,msg:'网络中断'} : {code:200,data:rows}})
  }})
  await expect(page.getByRole('status', {name:'项目加载中'})).toBeVisible()
  await expect(page.locator('.qchip.on b')).toHaveText('–')
  await expect(page.getByText('还没有项目',{exact:true})).toHaveCount(0)
  release()
  await expect(page.locator('.order-load-state [role=alert]')).toContainText('网络中断')
  fail=false
  await page.getByRole('button',{name:'重试',exact:true}).click()
  await expect(page.locator('.qchip.on b')).toHaveText('48')
  await page.getByPlaceholder('搜项目名 / 客户 / 联系方式 / 需求').fill('无匹配')
  await page.locator('.list-card').getByRole('button',{name:'清空筛选'}).click()
  await expect(page.locator('.el-table__body tbody tr').first()).toContainText('验收方案')
})

test('欠款、搜索、页码与排序切菜单恢复；工作台链接覆盖旧搜索', async ({page}) => {
  await visit(page)
  await page.locator('.qchip').filter({hasText:'还欠款'}).click()
  const field=page.getByPlaceholder('搜项目名 / 客户 / 联系方式 / 需求')
  await field.fill('验收')
  const first=page.locator('.el-table__body tbody tr').first()
  await expect(first).toContainText('验收方案 48')
  await page.locator('.el-pagination .btn-next').click()
  await expect(first).toContainText('验收方案 28')
  const main=page.locator('main.main')
  await main.evaluate(el=>{el.scrollTop=240})
  const y=await main.evaluate(el=>el.scrollTop)
  await page.locator('.el-menu-item').filter({hasText:'客户账号'}).click()
  await page.locator('.el-menu-item').filter({hasText:'项目管理'}).click()
  await expect(field).toHaveValue('验收')
  await expect(page).toHaveURL(/status=owing/)
  await expect(first).toContainText('验收方案 28')
  await expect.poll(()=>main.evaluate(el=>el.scrollTop)).toBe(y)
  await page.reload()
  await expect(first).toContainText('验收方案 28')
  await page.getByRole('columnheader', {name:'截止'}).click()
  await expect(first).toContainText('验收方案 2')
  await page.getByRole('columnheader', {name:'截止'}).click()
  await expect(first).toContainText('验收方案 3')
  await page.reload()
  await expect(first).toContainText('验收方案 3')
  await page.locator('.el-pagination .btn-next').click()
  await page.locator('.el-pagination .btn-next').click()
  await expect(page.locator('.el-table__body tbody tr').last()).toContainText('验收方案 1')
  await page.goto('/#/order?status=review')
  await expect(field).toHaveValue('')
  await expect(page.locator('.chip-row').first().locator('.qchip.on')).toContainText('待验收')
})

test('手机顶部待处理可展开，项目列表滚动接着显示',async ({page})=>{
  await visit(page,{mobile:true})
  const toggle=page.locator('.pending-toggle')
  await expect(toggle).toHaveAttribute('aria-expanded','false')
  await expect(page.locator('.pending-link')).not.toBeVisible()
  await toggle.click()
  await expect(page.locator('.pending-link')).toBeVisible()
  await toggle.click()
  await expect(page.locator('.mobile-project-entry').nth(1)).toBeInViewport({ratio:1})
  await expect(page.locator('.mobile-project-entry')).toHaveCount(20)
  await page.locator('.m-total').scrollIntoViewIfNeeded()
  await expect(page.locator('.mobile-project-entry')).toHaveCount(40)
  await expect(page.locator('.m-total')).toHaveText('已显示 40 / 共 48 单')
  await expect(page.locator('.list-pager .el-pagination')).toHaveCount(0)
})

test('成员拖向已完成时可见原因，卡片不移动也不发改状态请求',async ({page})=>{
  await visit(page,{mode:'kanban',role:'employee',list:r=>r.fulfill({json:{code:200,data:[rows[0]]}})})
  let requests=0
  page.on('request',r=>{ if (r.url().endsWith('/status')) requests++ })
  const source=page.locator('[data-status=doing] .card')
  await source.scrollIntoViewIfNeeded()
  const from=await source.boundingBox()
  const to=await page.locator('[data-status=done]').boundingBox()
  await page.mouse.move(from.x+45,from.y+50)
  await page.mouse.down()
  await page.mouse.move(from.x+75,from.y+60,{steps:5})
  await page.mouse.move(to.x+30,to.y+30,{steps:12})
  await expect(page.locator('.drop-blocked .drop-reason')).toHaveText('请先提交验收')
  await page.mouse.up()
  await expect(source).toHaveCount(1)
  await expect(page.locator('[data-status=done] .card')).toHaveCount(0)
  expect(requests).toBe(0)
})

for (const role of ['boss','employee']) {
  test('看板直达渠道、成员和取消分组显示实际项目 · '+role,async ({page})=>{
    const data=[
      {...order,id:21,title:'要确认',status:'pending'},
      {...order,id:22,title:'已取消网站',status:'cancelled'},
      {...order,id:23,title:'另一渠道',status:'doing',channel:'taobao'},
      ...(role==='boss' ? [{...order,id:24,title:'另一负责人',status:'done',ownerId:1}] : [])
    ]
    await visit(page,{mode:'kanban',role,path:'/#/order?channel=wechat',list:r=>r.fulfill({json:{code:200,data}})})
    const board=page.locator('.kanban')
    await expect(board.getByText('已取消网站',{exact:true})).toBeVisible()
    await expect(board).not.toContainText('要确认')
    await expect(board).not.toContainText('另一渠道')
    await page.goto('/#/order?owner=2')
    await expect(board).toContainText('另一渠道')
    await expect(board).not.toContainText('另一负责人')
    await expect(board).not.toContainText('要确认')
    await page.goto('/#/order?status=cancelled')
    await expect(board.locator('.kanban-col')).toHaveCount(1)
    await expect(board.locator('.card')).toHaveCount(1)
    await expect(board.getByRole('button',{name:'展开已取消'})).toBeVisible()
    await expect(page.locator('.chip-row').first().locator('.qchip.on')).toContainText('已取消')
  })
}
