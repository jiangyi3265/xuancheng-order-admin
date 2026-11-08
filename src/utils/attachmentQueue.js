import { computed, reactive } from 'vue'
import { uploadAttachment as uploadStaff } from '@/utils/upload'
import { uploadAttachment as uploadCustomer } from '@/customer/utils/upload'
import { attType as staffType, extOf } from '@/utils/file'
import { attType as customerType } from '@/customer/utils/file'

const conversationQueues = new WeakMap()

// Background transfers belong to the draft, independently of any mounted component.
export function chatAttachmentQueue(draft, customer = false) {
  if (conversationQueues.has(draft)) return conversationQueues.get(draft)
  const uploadFile = customer ? uploadCustomer : uploadStaff
  const typeOf = customer ? customerType : staffType
  const queue = attachmentQueue({
    draft,
    session: () => localStorage.getItem(customer ? 'customerToken' : 'token'),
    upload: async (file, metadata) => {
      const item = await uploadFile(file, {blockOtherForms: false})
      return {...item, type: typeOf(file.type, file.name), ext: extOf(file.name) || item.ext, ...metadata}
    }
  })
  conversationQueues.set(draft, queue)
  return queue
}

export function attachmentQueue({ draft, upload, getFiles, setFiles, session, keepFailures = true, reportError }) {
  const owner = session()
  let disposed = false
  let running = false
  let nextId = 0
  const tasks = reactive((draft?.attachmentWaitList || []).map(({name, size}) => ({
    id: ++nextId, name, size, status: 'reselect', error: '刷新后需重新选择文件'
  })))
  const pending = task => task.status === 'queued' || task.status === 'uploading'
  const uploadingCount = computed(() => tasks.filter(pending).length)
  const failedCount = computed(() => tasks.length - uploadingCount.value)

  function updateDraft() {
    if (!draft) return
    draft.uploading = uploadingCount.value
    draft.attachmentWaitList = tasks.map(({name, size}) => ({name, size}))
  }
  function discard(task) {
    const i = tasks.indexOf(task)
    if (i >= 0) tasks.splice(i, 1)
    updateDraft()
  }
  function dispose() {
    disposed = true
    tasks.splice(0)
    updateDraft()
  }

  function commit(attachment, before) {
    const items = [...(draft ? draft.files : getFiles())]
    const position = before ? items.findIndex(item => item.url === before.url && item.name === before.name) : -1
    items.splice(position < 0 ? items.length : position, 0, attachment)
    if (draft) draft.files = items
    else setFiles(items)
  }

  async function run() {
    if (running || disposed) return
    running = true
    try {
      while (tasks.some(task => task.status === 'queued')) {
        if (owner !== session()) { dispose(); return }
        const batch = tasks.filter(task => task.status === 'queued').slice(0, 3)
        const completed = []
        await Promise.all(batch.map(async (task, index) => {
          task.status = 'uploading'
          try {
            const item = await upload(task.file, task.metadata)
            if (disposed || owner !== session()) return
            // Save immediately on success, in selection order even for slower earlier files.
            commit(item, completed.slice(index + 1).find(Boolean))
            completed[index] = item
            discard(task)
          } catch (error) {
            if (disposed || owner !== session()) return
            task.error = error?.message || '上传失败'
            if (keepFailures) task.status = 'failed'
            else { reportError(task.error); discard(task) }
            updateDraft()
          }
        }))
        if (owner !== session()) { dispose(); return }
      }
    } finally {
      running = false
    }
  }
  function add(files, metadata) {
    if (disposed || draft?.sending) return
    for (const file of files) {
      const task = {id: ++nextId, name: file.name, size: file.size, status: 'queued', file, metadata}
      if (!file.size || file.size > 50 * 1024 * 1024) {
        task.error = file.size ? '文件超过 50MB，请重新选择' : '空文件，请重新选择'
        if (!keepFailures) { reportError(task.error); continue }
        task.status = 'reselect'
        task.file = null
      }
      tasks.push(task)
    }
    updateDraft()
    return run()
  }
  function retry(task) {
    if (task.status !== 'failed') return
    task.status = 'queued'
    task.error = ''
    updateDraft()
    return run()
  }
  function replace(task, file) {
    if (task.status !== 'reselect' || !file) return
    discard(task)
    return add([file])
  }
  const queue = reactive({tasks, uploadingCount, failedCount, add, retry, replace, discard, dispose})
  return queue
}
