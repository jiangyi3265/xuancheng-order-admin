import { ElMessageBox } from 'element-plus'

export async function askReturnNote(title, executor) {
  const answer = await ElMessageBox.prompt('写一句哪里要改，' + executor + '打开就能看到（选填）。', '退回「' + title + '」', {
    confirmButtonText:'退回', cancelButtonText:'取消', inputType:'textarea',
    inputValidator:value => (value || '').length <= 300 || '最多填写 300 个字'
  })
  return (answer.value || '').trim()
}
