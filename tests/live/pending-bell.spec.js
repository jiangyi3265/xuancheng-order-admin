const {test, expect} = require('@playwright/test')

for (const width of [1440, 390]) {
  test('铃铛显示本人项目待办，逐条完成直接同步 ' + width, async ({page}) => {
    await page.setViewportSize({width, height: 840})
    await page.addInitScript(() => {
      if (window.Notification) {
        Object.defineProperty(Notification,'permission',{get:()=> 'denied'})
        Notification.requestPermission = () => { throw Error('铃铛不得请求浏览器通知权限') }
      }
    })
    await page.goto('/#/login')
    await page.getByPlaceholder('请输入登录账号').fill('admin')
    await page.getByPlaceholder('请输入密码',{exact:true}).fill('admin123')
    await page.getByRole('button',{name:'登录',exact:true}).click()
    await expect(page).not.toHaveURL(/#\/login$/)
    const token = await page.evaluate(()=>localStorage.getItem('token'))
    const api = async (path, method='GET', data) => {
      const r = await page.request.fetch(path,{method,data,headers:{Authorization:'Bearer '+token}})
      const json = await r.json()
      expect(json.code,json.msg).toBe(200)
      return json.data
    }
    const title = '铃铛测试'+Date.now()
    const order = await api('/jiedan/order','POST',{title,status:'doing'})
    const path = '/jiedan/order/'+order.id
    try {
      await api(path+'/next','PUT',{content:'电话确认需求'})
      await api(path+'/urgency','PUT',{urgentUntil:'2028-09-09 11:00',previousUntil:null})
      const before = await api(path)
      await api(path+'/handling','PUT',{handled:false,version:before.version})
      const withBug = await api('/jiedan/order/bug','POST',{orderId:order.id,content:'修复测试问题'})
      await api('/jiedan/order/bug/'+withBug.bugs[0].id+'/status','PUT',{status:'action'})
      await page.goto('/#/order')
      if (width===390) { await page.evaluate(()=>localStorage.setItem('xc.orderView','kanban')); await page.reload() }
      const bell = page.getByRole('button',{name:/^待处理通知，/})
      await bell.click()
      const drawer = page.getByRole('dialog',{name:'待处理通知'})
      const rows = drawer.getByRole('listitem').filter({hasText:title})
      await expect(rows).toHaveCount(4)
      await expect(page.getByText('没有开启成功',{exact:false})).toHaveCount(0)
      await rows.filter({hasText:'修复测试问题'}).getByRole('link',{name:'看一下',exact:true}).click()
      await expect(page.locator('.bug-item.notice-target')).toContainText('修复测试问题')
      await page.goBack()
      await expect(page.locator('.workspace-head')).toBeHidden()
      await bell.click()
      for (const [i, text] of ['修复测试问题','电话确认需求','加急','手动标记'].entries()) {
        // 问题那一行直接把问题关掉，按钮叫「已解决」；其余事项仍是「完成」
        await rows.filter({hasText:text}).getByRole('button',{name:i === 0 ? '已解决' : '完成',exact:true}).click()
        await expect(rows).toHaveCount(3-i)
      }
      await page.reload()
      await bell.click()
      await expect(drawer.getByRole('heading',{name:'待处理通知'})).toBeVisible()
      await expect(rows).toHaveCount(0)
      const updated = await api(path)
      expect(updated.bugs[0].status).toBe('resolved')
      expect(updated.nextStep).toBeFalsy()
      expect(updated.urgentUntil).toBeFalsy()
      expect(updated.handled).toBe(true)
      expect(updated.status).toBe('doing')
    } finally { await api(path,'DELETE') }
  })
}

test('同一项目分给两人时，各自的铃铛只显示自己要处理的事项', async ({page, browser, baseURL}) => {
  async function login(tab, user, password) {
    await tab.goto('/#/login')
    await tab.getByPlaceholder('请输入登录账号').fill(user)
    await tab.getByPlaceholder('请输入密码', {exact:true}).fill(password)
    await tab.getByRole('button', {name:'登录', exact:true}).click()
    await expect(tab).not.toHaveURL(/#\/login$/)
  }
  async function api(tab, path, method='GET', data) {
    const token = await tab.evaluate(() => localStorage.getItem('token'))
    const res = await tab.request.fetch(path, {method, data, headers:{Authorization:'Bearer '+token}})
    const json = await res.json()
    expect(json.code, json.msg).toBe(200)
    return json.data
  }
  const title = '待办分工'+Date.now()
  async function checkBell(tab, expected) {
    const bell = tab.getByRole('button', {name:/^待处理通知，/})
    const loaded = tab.waitForResponse(r => new URL(r.url()).pathname === '/jiedan/order/list')
    await bell.click()
    await loaded
    const drawer = tab.getByRole('dialog', {name:'待处理通知'})
    const all = drawer.getByRole('listitem')
    const mine = all.filter({has:tab.locator('.handoff-card')}).filter({hasText:title})
    await expect(mine.locator('.handoff-card header span')).toHaveText(expected)
    const count = await all.count()
    await expect(bell).toHaveAttribute('aria-label','待处理通知，'+count+' 条')
    await expect(drawer.getByText('轮到我 '+count,{exact:true})).toBeVisible()
    await tab.keyboard.press('Escape')
    await expect(drawer).toBeHidden()
  }
  await page.setViewportSize({width:1440,height:900})
  await login(page, 'admin','admin123')
  const staffContext = await browser.newContext({baseURL, viewport:{width:390,height:844}})
  const colleague = await staffContext.newPage()
  const boss = await api(page, '/jiedan/staff/me')
  let path
  try {
    const user = 'bell'+Date.now().toString().slice(-9)
    await api(page, '/jiedan/staff','POST',{userName:user,nickName:'测试协作者',password:'BellTest123'})
    const member = (await api(page,'/jiedan/staff/list')).find(m => m.userName === user)
    await login(colleague,user,'BellTest123')
    const order = await api(page,'/jiedan/order','POST',{title,ownerId:member.id})
    path = '/jiedan/order/'+order.id
    await api(colleague,path+'/accept','POST')
    await api(page,path+'/urgency','PUT',{urgentUntil:'2028-09-09 11:00',previousUntil:null})
    const before = await api(page,path)
    await api(page,path+'/handling','PUT',{version:before.version,handled:false})
    const withBug = await api(page,'/jiedan/order/bug','POST',{orderId:order.id,content:'核对交付图'})
    await api(page,'/jiedan/order/bug/'+withBug.bugs[0].id+'/status','PUT',{status:'action'})
    await api(page,path+'/next','PUT',{content:'确认设计稿',ownerId:boss.id})
    await checkBell(page,['下一步'])
    await checkBell(colleague,['加急','问题','手动标记'])
    await api(page,path+'/next','PUT',{content:'确认设计稿',ownerId:member.id})
    await checkBell(page,[])
    await checkBell(colleague,['加急','问题','下一步','手动标记'])
  } finally {
    await staffContext.close()
    if (path) await api(page,path,'DELETE')
  }
})
