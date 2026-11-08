import { effectScope, reactive, watch } from 'vue'
import { token, customerToken } from '@/mock/store'

const expiredDrafts = new WeakSet()

function emptyDraft() {
  return { text: '', files: [], attachmentWaitList: [], sending: false, uploading: 0, retry: null }
}

function snapshot(draft) {
  const files = Array.isArray(draft.files) ? draft.files.filter(item =>
    typeof item?.url === 'string' && item.url.startsWith('/') && !item.url.startsWith('//')) : []
  const waiting = Array.isArray(draft.attachmentWaitList) ? draft.attachmentWaitList.filter(item =>
    typeof item?.name === 'string').map(({name, size}) => ({name, size})) : []
  return {
    text: typeof draft.text === 'string' ? draft.text : '',
    files,
    attachmentWaitList: waiting,
    retry: typeof draft.retry?.key === 'string' && typeof draft.retry?.fingerprint === 'string' ? draft.retry : null
  }
}

function draftStore(session, tokenKey) {
  const prefix = 'xc.chatDraft.v1.' + tokenKey + '.'
  const ownerKey = prefix + 'owner'
  const rooms = new Map()
  let effects = effectScope(true)
  let persisted = false
  let ready
  let generation = 0

  function eraseStored() {
    const storage = window.sessionStorage
    for (const key of Object.keys(storage)) {
      if (key.startsWith(prefix)) storage.removeItem(key)
    }
  }

  function forget() {
    generation++
    effects.stop()
    effects = effectScope(true)
    for (const draft of rooms.values()) {
      expiredDrafts.add(draft)
      Object.assign(draft, emptyDraft())
    }
    rooms.clear()
    ready = null
    persisted = false
    try { eraseStored() } catch { /* Browser storage may be disabled. */ }
  }
  watch(session, forget, {flush: 'sync'})
  window.addEventListener('storage', event => {
    if (event.storageArea !== localStorage || (event.key !== tokenKey && event.key !== null)) return
    if ((event.newValue || '') !== session.value) forget()
  })

  async function bindStorage() {
    const value = session.value
    if (!value || value !== localStorage.getItem(tokenKey)) {
      eraseStored()
      return
    }
    const turn = generation
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
    if (turn !== generation || value !== localStorage.getItem(tokenKey)) return
    const owner = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2,'0')).join('')
    if (sessionStorage.getItem(ownerKey) !== owner) {
      eraseStored()
      sessionStorage.setItem(ownerKey, owner)
    }
    persisted = true
  }

  function prepare() {
    if (!ready) ready = bindStorage().catch(() => {
      // Without a reliable session match, use only memory for this login.
      try { eraseStored() } catch { /* Browser storage is unavailable. */ }
    })
    return ready
  }

  function get(kind, id, participant) {
    const key = prefix + JSON.stringify([kind, String(id), String(participant)])
    if (rooms.has(key)) return rooms.get(key)
    const draft = reactive(emptyDraft())
    if (!id) return draft
    if (!session.value || localStorage.getItem(tokenKey) !== session.value) {
      expiredDrafts.add(draft)
      return draft
    }
    rooms.set(key, draft)
    if (!persisted) return draft
    try {
      const saved = JSON.parse(sessionStorage.getItem(key))
      if (saved && typeof saved === 'object') Object.assign(draft, snapshot(saved))
    } catch { /* Ignore an invalid or unreadable draft. */ }
    // The watcher also survives the originating panel closing during delivery.
    effects.run(() => watch(() => snapshot(draft), saved => {
      try {
        if (saved.text || saved.files.length || saved.attachmentWaitList.length) {
          sessionStorage.setItem(key, JSON.stringify(saved))
        } else {
          sessionStorage.removeItem(key)
        }
      } catch {
        // A full store must not resurrect an older draft on refresh.
        try { sessionStorage.removeItem(key) } catch { /* Memory remains available. */ }
      }
    }, { deep: true, flush: 'sync' }))
    return draft
  }

  return { prepare, get }
}

const staff = draftStore(token, 'token')
const customers = draftStore(customerToken, 'customerToken')
export function prepareChatDraftSession() {
  return Promise.all([staff.prepare(), customers.prepare()])
}
export function chatDraft(kind, id, participant = '') {
  return (kind === 'customer' ? customers : staff).get(kind, id, participant)
}

export async function sendDraft(draft, submit) {
  if (expiredDrafts.has(draft)) throw new Error('登录账号已变更，请刷新页面后再发送')
  if (draft.sending || draft.uploading || draft.attachmentWaitList.length || !(draft.text.trim() || draft.files.length)) return
  const text = draft.text
  const files = [...draft.files]
  draft.sending = true
  try {
    const result = await submit({content: text.trim(), attachments: files})
    if (draft.text === text) draft.text = ''
    // Upload controls may clone file objects; keep any files added during delivery.
    const sent = files.map(file => file.url)
    draft.files = draft.files.filter(file => {
      const i = sent.indexOf(file.url)
      if (i < 0) return true
      sent.splice(i, 1)
      return false
    })
    draft.retry = null
    return result
  } finally {
    draft.sending = false
  }
}
