const {test, expect} = require('@playwright/test')
const {randomUUID} = require('node:crypto')

test.beforeEach(()=>{
  if(new URL(process.env.E2E_BASE).hostname !== '127.0.0.1' || !/^xc_e2e_\d+$/.test(process.env.E2E_DB)) {
    throw Error('需要本地临时测试库')
  }
})

for (const [width, edit] of [[360,false],[1440,true]]) {
  test('漏填定位，回执丢失后刷新再提交 '+width,async({page,request})=>{
    await page.setViewportSize({width,height:800})
    await page.goto('/client/#/intake')
    await page.getByPlaceholder('请输入登录账号').fill('cust_a')
    await page.getByPlaceholder('请输入密码',{exact:true}).fill('customer123')
    await page.getByRole('button',{name:'登录',exact:true}).click()
    const submit=page.getByRole('button',{name:'提交需求',exact:true})
    const titleField=page.getByPlaceholder('留空时显示需求首行')
    const textField=page.getByLabel('要改什么？')
    await submit.click()
    await expect(textField).toBeFocused()
    await expect(page.locator('form [role=alert]')).toContainText('请写下需要修改的内容')
    const title='需求回执-'+randomUUID()
    await page.locator('.extras summary').click()
    await titleField.fill(title)
    await textField.fill('今天优先处理首页')
    const keys=[]
    let accepted
    await page.route('**/jiedan/order/intake', async r=>{
      keys.push(r.request().postDataJSON().submissionKey)
      if(accepted) return r.continue()
      const resp=await r.fetch()
      const result=await resp.json()
      expect(result.code,result.msg).toBe(200)
      accepted=result.data
      await r.abort('failed')
    })
    await submit.click()
    await expect(page.getByRole('alert').filter({hasText:'暂未收到提交回执'})).toBeVisible()
    await page.reload()
    await expect(titleField).toHaveValue(title)
    if(edit) await textField.fill('补充新的交付时间')
    await submit.click()
    expect(accepted.id).toBeTruthy()
    if(edit) {
      await expect(page.getByText(/上一次提交已收到，当前草稿已保留/)).toBeVisible()
      await expect(textField).toHaveValue('补充新的交付时间')
    } else {
      await expect(page.getByRole('heading',{name:'提交成功'})).toBeVisible()
      await expect(page.locator('.receipt')).toContainText('#'+accepted.bugId)
      await expect(page.locator('.receipt-meta')).toContainText('提交时间')
    }
    const token=await page.evaluate(()=>localStorage.getItem('customerToken'))
    async function matching() {
      const response=await request.get(process.env.E2E_BASE+'/jiedan/portal/orders',{headers:{Authorization:'Bearer '+token}})
      return (await response.json()).data.flatMap(x=>x.requirements).filter(x=>x.title===title)
    }
    expect(keys).toHaveLength(2)
    expect(keys[1]).toBe(keys[0])
    expect(await matching()).toHaveLength(1)
    if(edit) {
      await page.getByRole('button',{name:'作为新需求提交'}).click()
      await expect(page.getByRole('heading',{name:'提交成功'})).toBeVisible()
      expect(keys[2]).not.toBe(keys[0])
      expect(await matching()).toHaveLength(2)
    }
  })
}

test('并发重试只建一单，同一凭据按客户隔离，撤回后不会重建',async({request})=>{
  async function call(token,path,data,method='POST') {
    const r=await request.fetch(process.env.E2E_BASE+path,{method,data,headers:token?{Authorization:'Bearer '+token}:{}})
    const j=await r.json()
    expect(j.code,j.msg).toBe(200)
    return j
  }
  const a=(await call(null,'/login',{username:'cust_a',password:'customer123'})).token
  const b=(await call(null,'/login',{username:'cust_b',password:'customer123'})).token
  const payload={title:'重复提交-'+randomUUID(),requirement:'粘贴图片',contact:'联系测试',submissionKey:randomUUID()}
  const path='/jiedan/order/intake'
  const results=await Promise.all(Array.from({length:4},()=>call(a,path,payload)))
  const ids=results.map(r=>r.data.id)
  expect(ids[0]).toBeTruthy()
  expect(new Set(ids).size).toBe(1)
  expect(results.filter(r=>r.data.replayed)).toHaveLength(3)
  const other=(await call(b,path,payload)).data
  expect(other.id).not.toBe(ids[0])
  await call(a,'/jiedan/portal/bug/'+results[0].data.bugId,undefined,'DELETE')
  const replay=(await call(a,path,payload)).data
  expect(replay.replayed).toBe(true)
  expect(replay.id).toBeUndefined()
})
