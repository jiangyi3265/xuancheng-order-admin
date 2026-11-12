const {test,expect}=require('@playwright/test')
const {fixture,login}=require('./fixtures.cjs')

for (const [width,height] of [[360,600],[375,640],[390,844],[1440,900]]) {
  test('登录第一屏 '+width+'×'+height,async({page})=>{
    await page.setViewportSize({width,height})
    await fixture(page)
    await page.goto('/#/login')
    for (const control of [page.getByPlaceholder('请输入登录账号'),page.getByPlaceholder('请输入密码',{exact:true}),page.getByRole('button',{name:'登录',exact:true})]) {
      await expect(control).toBeInViewport({ratio:1})
    }
  })
}

test('登录错误区分业务、服务器和断网',async({page})=>{
  await fixture(page)
  await page.goto('/#/login')
  await page.getByPlaceholder('请输入登录账号').fill('staff')
  await page.getByPlaceholder('请输入密码',{exact:true}).fill('password')
  const button=page.getByRole('button',{name:'登录',exact:true})
  for (const [status,msg,expected] of [[200,'请先接收项目','请先接收项目'],[200,'Handler dispatch failed; nested exception is java.lang.NoClassDefFoundError','系统出了点问题，请稍后再试'],[503,'Bad Gateway','系统出了点问题，请稍后再试'],[0,'','网络连不上，请检查网络后重试']]) {
    await page.route('**/login',r=>status?r.fulfill({status,json:{code:500,msg}}):r.abort('internetdisconnected'))
    await button.click()
    await expect(page.locator('.el-message').filter({hasText:expected}).first()).toBeVisible()
    await page.unroute('**/login')
  }
})

test('桌面建单按钮与头像保持间距，窄屏保留图标',async({page})=>{
  await page.setViewportSize({width:1440,height:900})
  await login(page,'boss')
  const button=page.locator('.header-quick')
  const avatar=page.locator('.header .user .el-avatar')
  const rect=await button.boundingBox()
  expect((await avatar.boundingBox()).x-rect.x-rect.width).toBeGreaterThanOrEqual(8)
  await page.setViewportSize({width:1000,height:760})
  await expect(button).toBeVisible()
  await expect(button.locator('.quick-caption')).toBeHidden()
})

test('手机问题清单和待收款入口',async({page})=>{
  await page.setViewportSize({width:375,height:640})
  await login(page,'boss')
  await page.goto('/#/order?id=1&tab=bugs')
  const header=page.locator('.bug-panel .section-head')
  await expect(header.locator('.head-note')).toBeVisible()
  const tools=header.locator('.issue-tools')
  // 「复制给 AI」要等详情抽屉展开完才渲染出来，先等它出现再量位置
  await expect(tools.locator('button')).not.toHaveCount(1)
  const boxes=await tools.locator('button').evaluateAll(nodes=>nodes.filter(n=>n.offsetWidth).map(n=>n.getBoundingClientRect().top))
  expect(boxes.length).toBeGreaterThan(1)
  expect(Math.max(...boxes)-Math.min(...boxes)).toBeLessThan(8)
  await page.goto('/#/dashboard')
  await expect(page.locator('.board-stats')).toContainText('待验收')
  await page.getByRole('button',{name:/待收款/}).click()
  await expect(page).toHaveURL(/status=owing/)
})
