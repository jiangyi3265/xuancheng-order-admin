const { test, expect } = require('@playwright/test')
const { fixture, order } = require('./fixtures.cjs')

async function prepare(page, actor, previews) {
  await fixture(page, actor)
  await page.addInitScript(role => localStorage.setItem('token','fixture-' + role), actor)
  const project = {...order, actionBugCount:previews.length, actionBugPreviews:previews,
    bugs:previews.map(item=>({...item, status:'action'}))}
  const wrong = {...project, id:8, ownerId:1, title:'其他负责人的项目', actionBugPreviews:[{id:94,content:'别人的问题'}]}
  for (const [key, data] of [['list',[project,wrong]],['1',project],['1/version',{version:1}],['read',project]])
    await page.route('**/jiedan/order/' + key, r => r.fulfill({json:{code:200,data}}))
  return project
}

test('负责人弹窗逐条定位，稍后处理保留在铃铛且刷新不重复打扰', async ({page})=>{
  await prepare(page, 'employee', [{id:91, content:'修改首页按钮'}, {id:92,content:'核对新需求'}])
  await page.goto('/#/workbench')
  const notice=page.getByRole('region',{name:'需要我处理的问题'})
  await expect(notice).toContainText('核对新需求')
  await expect(notice).not.toContainText('别人的问题')
  await notice.getByRole('button',{name:'稍后处理'}).click()
  await expect(notice).toContainText('修改首页按钮')
  await notice.getByRole('button',{name:'查看问题'}).click()
  await expect(page).toHaveURL(/id=1.*tab=bugs.*bug=91/)
  await expect(page.locator('.bug-item.notice-target')).toContainText('修改首页按钮')
  await page.goto('/#/workbench'); await page.reload()
  await expect(page.locator('.pending-bell')).toBeVisible()
  await expect(notice).toHaveCount(0)
  await page.locator('.pending-bell').click()
  await expect(page.locator('.bell-panel')).toContainText('核对新需求')
})

test('一键处理传入当前问题和项目版本，重复点击只提交一次',async({page})=>{
  const project=await prepare(page,'employee',[{id:91,content:'请调整颜色'}])
  const submitted=[]
  await page.route('**/jiedan/order/1/pending-completion',async r=>{
    submitted.push(r.request().postDataJSON())
    await new Promise(resolve=>setTimeout(resolve,120))
    await r.fulfill({json:{code:200,data:{...project,version:2,actionBugCount:0,actionBugPreviews:[],bugs:[{id:91,status:'resolved'}]}}})
  })
  await page.goto('/#/workbench')
  const notice=page.getByRole('region',{name:'需要我处理的问题'})
  const button=notice.getByRole('button',{name:'标为已处理'})
  await button.click()
  await expect(notice).toHaveCount(0)
  expect(submitted).toEqual([{kind:'bug',bugId:91,version:1}])
})
