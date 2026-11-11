const { test, expect } = require('@playwright/test')

test('分配反馈后负责人看到内容、直达具体问题、一键处理，普通记录保留未标记', async ({browser,baseURL})=>{
  const apiBase=process.env.E2E_BASE
  test.skip(!apiBase || new URL(apiBase).hostname!=='127.0.0.1' || !/^xc_e2e_\d+$/.test(process.env.E2E_DB||''),'使用本地独立验收库')
  const contexts=await Promise.all([1440,390].map(width=>browser.newContext({baseURL,viewport:{width,height:900}})))
  const [boss,staff]=await Promise.all(contexts.map(ctx=>ctx.newPage()))
  async function login(page,user,pw) {
    await page.goto('/#/login')
    await page.getByPlaceholder('请输入登录账号').fill(user)
    await page.getByPlaceholder('请输入密码',{exact:true}).fill(pw)
    await page.getByRole('button',{name:'登录',exact:true}).click()
    await expect(page).toHaveURL(/workbench/)
  }
  async function api(page,path,method='GET',data) {
    const token=await page.evaluate(()=>localStorage.getItem('token'))
    const res=await page.request.fetch(path,{method,data,headers:{Authorization:'Bearer '+token}})
    const body=await res.json(); expect(body.code,path).toBe(200);return body.data
  }
  const stamp=Date.now().toString().slice(-8), name='问题负责人'+stamp, username='task'+stamp,title='验收问题'+stamp
  const notice=staff.getByRole('region',{name:'需要我处理的问题'}), panel=boss.locator('.bug-panel')
  let uid,id
  try {
    await login(boss,'admin','admin123')
    expect(String((await api(boss,'/jiedan/push/config'))['push.enabled'])).toBe('false')
    await api(boss,'/jiedan/staff','POST',{userName:username,nickName:name,password:'IssueLocal123'})
    uid=(await api(boss,'/jiedan/staff/list')).find(row=>row.userName===username).id
    id=(await api(boss,'/jiedan/order','POST',{title,channel:'wechat',ownerId:uid})).id
    await login(staff,username,'IssueLocal123')
    await api(staff,'/jiedan/order/'+id+'/accept','POST',{})
    await api(staff,'/jiedan/order/status','PUT',{id,status:'doing'})
    await boss.goto('/#/order?id='+id+'&tab=bugs')
    async function send(text, assign, reopen = false) {
      await panel.getByRole('button',{name:'记一条问题',exact:true}).click()
      const field = panel.getByPlaceholder('写清楚是什么问题，可以直接粘贴截图')
      await field.fill(text)
      if (reopen) {
        await boss.goto('/#/workbench')
        await boss.goto('/#/order?id='+id+'&tab=bugs')
        await boss.reload()
        await expect(field).toHaveValue(text)
        expect((await api(boss,'/jiedan/order/'+id)).bugs.some(row=>row.content===text)).toBe(false)
      }
      await panel.getByRole('button',{name:assign?'发给'+name+'处理':'记下问题',exact:true}).click()
      await expect(panel.locator('.bug-list')).toContainText(text)
    }
    await send('普通草稿',false)
    await send('请处理：首页颜色',true,true)
    await expect(notice).toContainText('请处理：首页颜色',{timeout:15000})
    await expect(boss.getByRole('region',{name:'需要我处理的问题'}).filter({hasText:title})).toHaveCount(0)
    await notice.getByRole('button',{name:'查看问题'}).click()
    await expect(staff.locator('.bug-item.notice-target')).toContainText('请处理：首页颜色')
    await send('请处理：反馈截图',true)
    await expect(notice).toContainText('请处理：反馈截图',{timeout:15000})
    await staff.clock.install()
    await notice.getByRole('button',{name:/稍后处理.*30 分钟/}).click()
    await expect(notice).toHaveCount(0)
    await staff.clock.fastForward(20 * 60 * 1000)
    await staff.reload()
    await expect(staff.locator('.bug-item.notice-target')).toContainText('请处理：首页颜色')
    await expect(notice).toHaveCount(0)
    await staff.clock.fastForward(10 * 60 * 1000)
    await expect(notice).toContainText('请处理：反馈截图')
    await notice.getByRole('button',{name:'提交确认'}).click()
    const read=()=>api(boss,'/jiedan/order/'+id)
    await expect.poll(async()=>(await read()).bugs.find(row=>row.content==='请处理：反馈截图').status).toBe('ai_review')
    const bugs=(await read()).bugs
    expect(bugs.find(row=>row.content==='普通草稿').status).toBe('open')
    expect(bugs.find(row=>row.content==='请处理：首页颜色').status).toBe('action')
  } finally {
    try {
      if(id){await api(boss,'/jiedan/order/'+id,'DELETE');await api(boss,'/jiedan/order/'+id+'/purge','DELETE')}
      if(uid) await api(boss,'/jiedan/staff/'+uid,'DELETE')
    } finally { await Promise.all(contexts.map(ctx=>ctx.close())) }
  }
})
