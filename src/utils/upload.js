import { ref } from 'vue'

export const pendingUploadCount = ref(0)

export function hasPendingUploads() {
  return pendingUploadCount.value > 0
}

export async function uploadAttachment(file) {
  if (!file || !file.size) throw new Error('附件不能为空')
  if (file.size > 50 * 1024 * 1024) throw new Error(`「${file.name || '附件'}」不能超过 50MB`)

  const form = new FormData()
  form.append('file', file, file.name || 'attachment')
  const token = localStorage.getItem('token') || localStorage.getItem('customerToken') || ''
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60000)
  pendingUploadCount.value += 1
  try {
    const res = await fetch('/jiedan/media/upload', {
      method: 'POST',
      headers: token ? { Authorization: 'Bearer ' + token } : {},
      body: form,
      signal: controller.signal
    })
    const json = await res.json().catch(() => null)
    if (!json || json.code !== 200) throw new Error(json?.msg || '附件上传失败')
    return { ...json.data, name: file.name || json.data?.name || '附件', size: file.size }
  } catch (e) {
    if (e?.name === 'AbortError') throw new Error('附件上传超时，请检查网络后重试')
    throw e
  } finally {
    clearTimeout(timeout)
    pendingUploadCount.value = Math.max(0, pendingUploadCount.value - 1)
  }
}
