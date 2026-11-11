const { test, expect } = require('@playwright/test')
const http = require('node:http')

test('两人的加急催办、退回再提交，以及独立的问题和项目验收', async ({page, browser, baseURL}) => {
  const staffContext = await browser.newContext({baseURL, viewport:{width:390,height:844}})
  const staff = await staffContext.newPage()
  const calls = []
  const mockPort = Number(process.env.E2E_HANDOFF_WECOM_PORT || 0)
  let server, projectPath
  if (mockPort) {
    server = http.createServer((req, res) => {
      let raw = ''
      req.on('data', c => raw += c)
      req.on('end', () => {
        res.setHeader('Content-Type','application/json')
        if (req.url.startsWith('/cgi-bin/gettoken')) res.end(JSON.stringify({errcode:0,access_token:'local-test-token',expires_in:7200}))
        else {
          calls.push(JSON.parse(raw))
          res.end(JSON.stringify({errcode:0,errmsg:'ok'}))
        }
      })
    })
    await new Promise(resolve => server.listen(mockPort,'127.0.0.1',resolve))
  }
  async function login(p,user,password) {
    await p.goto('/#/login')
    await p.getByPlaceholder('请输入登录账号').fill(user)
    await p.getByPlaceholder('请输入密码',{exact:true}).fill(password)
    await p.getByRole('button',{name:'登录',exact:true}).click()
    await expect(p).not.toHaveURL(/#\/login$/)
  }
  async function api(p, path, method='GET', data, ok=true) {
    const token = await p.evaluate(() => localStorage.getItem('token'))
    const res = await p.request.fetch(path,{method,data,headers:{Authorization:'Bearer '+token}})
    const j = await res.json()
    if (ok) expect(j.code, j.msg).toBe(200)
    return ok ? j.data : j.code
  }
  async function workbench(p) {
    await p.goto('/#/workbench')
    await p.reload()
    await expect(p.getByRole('region',{name:'项目交接'})).toBeVisible()
    return p.getByRole('region',{name:'项目交接'})
  }
  try {
    await page.setViewportSize({width:1440,height:900})
    await login(page,'admin','admin123')
    const stamp = Date.now().toString().slice(-9)
    const title = '交接验证'+stamp, username = 'hx'+stamp, due = '2029-06-14 17:30'
    await api(page,'/jiedan/staff','POST',{userName:username,nickName:'交接同事',password:'DemoTest123'})
    const employee = (await api(page,'/jiedan/staff/list')).find(m=>m.userName===username)
    const me = await api(page,'/jiedan/staff/me')
    await login(staff,username,'DemoTest123')
    const order = await api(page,'/jiedan/order','POST',{title,ownerId:employee.id})
    projectPath = '/jiedan/order/'+order.id
    await api(staff,projectPath+'/accept','POST')
    await api(page,projectPath+'/urgency','PUT',{previousUntil:null,urgentUntil:due})
    let bossPanel = await workbench(page)
    await bossPanel.getByRole('button',{name:/等同事处理/}).click()
    const out = bossPanel.getByRole('listitem').filter({hasText:title})
    await expect(out).toContainText('现在由交接同事处理')
    await expect(out).toContainText('截止 '+due)
    if (mockPort) {
      await api(page,'/jiedan/push/config','POST',{
        'push.enabled':'true','push.siteUrl':'https://local-test.example','push.wecom.corpId':'wwtestcorp01',
        'push.wecom.agentId':'1000002','push.wecom.secret':'Test_000123',
        ['push.wecom.user.'+employee.id]:'LocalStaff',['push.wecom.user.'+me.id]:'LocalReviewer'
      })
      await out.getByRole('button',{name:'微信提醒'}).click()
      await expect(out).toContainText('上次提醒')
      expect(calls.some(c => c.touser==='LocalStaff' && c.news?.articles[0].url.endsWith('id='+order.id))).toBeTruthy()
    }
    const staffPanel = await workbench(staff)
    await staffPanel.getByRole('listitem').filter({hasText:title}).getByRole('button',{name:'提交验收'}).click()
    await staffPanel.getByRole('button',{name:/等同事验收/}).click()
    await expect(staffPanel.getByRole('listitem').filter({hasText:title})).toContainText('你已提交处理结果')
    bossPanel = await workbench(page)
    const reviewed = bossPanel.getByRole('listitem').filter({hasText:title})
    await expect(reviewed).toContainText('交接同事已提交处理结果')
    if (mockPort) await expect.poll(()=>calls.some(c=>c.touser==='LocalReviewer' && c.news?.articles[0].title.includes('等你确认'))).toBeTruthy()
    const current = await api(staff,projectPath)
    expect(await api(staff,projectPath+'/urgent-review','POST',{decision:'confirm',version:current.version},false)).toBe(403)
    expect(await api(page,projectPath+'/urgent-review','POST',{decision:'confirm',version:current.version-1},false)).toBe(409)
    await reviewed.getByRole('button',{name:'退回处理'}).click()
    await page.locator('.el-message-box textarea').fill('再核对下图')
    await page.locator('.el-message-box').getByRole('button',{name:'退回处理'}).click()
    const back = await workbench(staff)
    await expect(back.getByRole('listitem').filter({hasText:title})).toContainText(due)
    expect((await api(staff,projectPath)).timeline.some(t=>t.content.includes('再核对下图'))).toBeTruthy()
    // A whole-project mark on the executor side also hands its urgent result back.
    await api(staff,projectPath+'/handling','PUT',{handled:true,version:(await api(staff,projectPath)).version})
    bossPanel = await workbench(page)
    await bossPanel.getByRole('listitem').filter({hasText:title}).getByRole('button',{name:'确认加急完成'}).click()
    await expect(bossPanel.getByRole('listitem').filter({hasText:title})).toHaveCount(0)
    expect((await api(page,projectPath)).urgentHandoff).toBeFalsy()
    const withBug = await api(page,'/jiedan/order/bug','POST',{orderId:order.id,content:'检查标题换行'})
    const bug = withBug.bugs.find(b=>b.content==='检查标题换行')
    await staff.goto('/#/order?id='+order.id+'&tab=bugs&bug='+bug.id)
    await staff.getByRole('button',{name:'提交内部验收',exact:true}).click()
    await expect(staff.locator('.issue-awaiting').first()).toContainText('待内部验收')
    await api(page,projectPath+'/urgency','PUT',{previousUntil:null,urgentUntil:due,reopenVersion:(await api(page,projectPath)).version})
    await api(staff,'/jiedan/order/status','PUT',{id:order.id,status:'review'})
    bossPanel = await workbench(page)
    await expect(bossPanel.getByRole('listitem').filter({hasText:title})).toHaveCount(3)
    const bell = page.getByRole('button',{name:/^待处理通知，/})
    await bell.click()
    const drawer = page.getByRole('dialog',{name:'待处理通知'})
    await expect(drawer.getByRole('listitem').filter({hasText:title})).toHaveCount(3)
    await page.keyboard.press('Escape')
    await expect(drawer).toBeHidden()
    await bossPanel.getByRole('button',{name:'查看问题'}).click()
    await expect(page).toHaveURL(new RegExp('bug='+bug.id))
    await page.getByRole('button',{name:'验收通过 · 已解决'}).click()
    bossPanel = await workbench(page)
    await expect(bossPanel.getByRole('listitem').filter({hasText:title})).toHaveCount(2)
    await bossPanel.getByRole('button',{name:'验收项目'}).click()
    const dialog = page.locator('.el-dialog:visible').last()
    await dialog.getByRole('button',{name:'验收通过',exact:true}).click()
    // Accepting a whole project does not acknowledge an independently submitted urgent result.
    await expect(bossPanel.getByRole('listitem').filter({hasText:title})).toHaveCount(1)
    await bossPanel.getByRole('button',{name:'确认加急完成'}).click()
    await expect(bossPanel.getByRole('listitem').filter({hasText:title})).toHaveCount(0)
    expect((await api(page,projectPath)).status).toBe('done')
  } finally {
    if (server && projectPath) await api(page,'/jiedan/push/config','POST',{'push.enabled':'false'})
    if (projectPath) await api(page,projectPath,'DELETE')
    await staffContext.close()
    if (server) await new Promise(resolve => server.close(resolve))
  }
})
