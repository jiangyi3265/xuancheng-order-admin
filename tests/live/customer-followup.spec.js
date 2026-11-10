const {test, expect} = require('@playwright/test')

test('重新加急可交还待办，接单后可处理，过期事项先出现', async ({page, request}) => {
  const base=process.env.E2E_BASE
  if(new URL(base).hostname!=='127.0.0.1'||!/^xc_e2e_\d+$/.test(process.env.E2E_DB)) throw Error('需要本地测试库')
  async function call(token, path, method='GET', data) {
    return (await request.fetch(base+path,{method,data,headers:token ? {Authorization:'Bearer '+token} : {}})).json()
  }
  async function api(...args) {
    const result=await call(...args)
    expect(result.code,result.msg).toBe(200)
    return result.data
  }
  const owner=(await call(null,'/login','POST',{username:'admin',password:'admin123'})).token
  const username='urgent'+Date.now()
  await api(owner,'/jiedan/staff','POST',{userName:username,nickName:'加急测试伙伴',password:'Test123456'})
  const member=(await api(owner,'/jiedan/staff/list')).find(x=>x.userName===username)
  const create=title=>api(owner,'/jiedan/order','POST',{title,ownerId:member.id,status:'doing'})
  const project=await create('需要重新加急')
  const path='/jiedan/order/'+project.id, before='2030-12-10 23:59', after='2030-12-12 10:30'
  await api(owner,path+'/urgency','PUT',{urgentUntil:before,previousUntil:null})
  await page.goto('/#/login')
  await page.getByPlaceholder('请输入登录账号').fill(username)
  await page.getByPlaceholder('请输入密码',{exact:true}).fill('Test123456')
  await page.getByRole('button',{name:'登录',exact:true}).click()
  const bell=page.getByRole('button',{name:/^待处理通知，/})
  const panel=page.getByRole('dialog',{name:'待处理通知'})
  await bell.click()
  await panel.getByRole('button',{name:'去接单'}).click()
  await expect(page.locator('.workspace-head')).toContainText(project.title)
  await page.getByRole('button',{name:'接收这个项目',exact:true}).filter({visible:true}).click()
  await expect.poll(async()=>(await api(owner,path)).assignState).not.toBe('pending')
  const current=await api(owner,path)
  const handled=await api(owner,path+'/handling','PUT',{version:current.version,handled:true})
  const conflict=await call(owner,path+'/urgency','PUT',{urgentUntil:after,previousUntil:before,reopenVersion:current.version})
  expect(conflict.code).toBe(409)
  expect((await api(owner,path)).urgentUntil).toBe(before)
  const reopened=await api(owner,path+'/urgency','PUT',{urgentUntil:after,previousUntil:before,reopenVersion:handled.version})
  expect(reopened.handled).toBe(false)
  expect(reopened.timeline.some(x=>x.content.includes('上次标为已处理'))).toBe(true)
  const overdue=await create('到期的下一步')
  await api(owner,'/jiedan/order/'+overdue.id+'/next','PUT',{content:'请先确认资料',ownerId:member.id,due:'2020-01-01'})
  await page.goto('/#/workbench')
  await bell.click()
  const rows=panel.getByRole('listitem')
  await expect(rows.first()).toContainText('请先确认资料')
  const urgent=rows.filter({hasText:after})
  await expect(urgent).toContainText('需要重新加急')
  await urgent.getByRole('button',{name:/标为已处理/}).click()
  await expect(urgent).toHaveCount(0)
  expect((await api(owner,path)).urgentUntil).toBeFalsy()
})
