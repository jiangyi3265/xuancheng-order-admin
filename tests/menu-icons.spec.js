const {test,expect} = require('@playwright/test')
const {login} = require('./fixtures.cjs')

for (const width of [375,1440]) test('各菜单页和工作台图标正常渲染 '+width, async ({page})=>{
  await page.setViewportSize({width,height:900})
  const missing=[]
  page.on('console',message=>{
    if (/Failed to resolve (component|directive)/.test(message.text())) missing.push(message.text())
  })
  await login(page,'boss')
  for (const path of ['workbench','order','messages','quotes','approvals','customers','staff','dashboard','trash','audit','settings','security','mine']) {
    await page.goto('/#/'+path)
    await page.waitForFunction(route=>document.querySelector('#app')?.__vue_app__?.config.globalProperties.$route?.path==='/'+route,path)
    await expect(page.locator('main')).toBeVisible()
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))
    await page.waitForFunction(()=>document.querySelectorAll('main .el-icon svg').length>0 || !document.querySelector('main .el-icon'))
    await expect(page.locator('i.el-icon:visible').filter({hasNot:page.locator('svg')})).toHaveCount(0)
  }
  expect(missing).toEqual([])
})
