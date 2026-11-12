const {test,expect}=require('@playwright/test')
const {login,order}=require('./fixtures.cjs')

async function openDelivery(page) {
  await login(page,'employee')
  await page.goto('/#/order?id=1')
  await page.getByRole('button',{name:'提交验收',exact:true}).click()
  return page.getByRole('dialog',{name:'提交验收'})
}

test('提交验收在同一次请求保存交付说明和状态',async({page})=>{
  const dialog=await openDelivery(page)
  await dialog.getByPlaceholder('填写本次交付内容、需要注意的事项').fill('完成首页和移动端适配')
  const calls=[]
  await page.route('**/jiedan/order/progress',async r=>{
    calls.push(['note',r.request().postDataJSON()])
    await r.fulfill({json:{code:200,data:order}})
  })
  await page.route('**/jiedan/order/status',async r=>{
    calls.push(['status',r.request().postDataJSON()])
    await r.fulfill({json:{code:200,data:{...order,status:'review'}}})
  })
  await dialog.getByRole('button',{name:'仍然提交验收',exact:true}).click()
  await expect(dialog).toBeHidden()
  expect(calls).toEqual([['status',{id:1,status:'review',version:1,note:'完成首页和移动端适配',attachments:[]}]])
})

test('验收提交失败保留说明，允许原地重试',async({page})=>{
  const dialog=await openDelivery(page)
  const field=dialog.getByPlaceholder('填写本次交付内容、需要注意的事项')
  await field.fill('保留这段交付说明')
  const requests=[]
  await page.route('**/jiedan/order/status',r=>{
    requests.push(r.request().postDataJSON())
    const response=requests.length===1 ? {code:500,msg:'保存失败，请重试'} : {code:200,data:{...order,status:'review'}}
    return r.fulfill({json:response})
  })
  const submit=dialog.getByRole('button',{name:'仍然提交验收',exact:true})
  await submit.click()
  await expect(page.getByText('保存失败，请重试',{exact:true})).toBeVisible()
  await expect(field).toHaveValue('保留这段交付说明')
  await submit.click()
  await expect(dialog).toBeHidden()
  expect(requests).toHaveLength(2)
  expect(requests[0]).toEqual(requests[1])
})
