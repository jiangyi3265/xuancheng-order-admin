import { ElMessageBox } from 'element-plus'

export async function askReturnNote(title, executor) {
  const answer = await ElMessageBox.prompt('还要改哪里？可填写说明，' + executor + '会在待办中看到。', '退回「' + title + '」', {
    confirmButtonText:'退回给' + executor, cancelButtonText:'取消', inputType:'textarea',
    inputValidator:value => (value || '').length <= 300 || '最多填写 300 个字'
  })
  return (answer.value || '').trim()
}
