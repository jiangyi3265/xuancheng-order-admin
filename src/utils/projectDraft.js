// Drafts stay in this tab. Memory also keeps the form usable when sessionStorage is unavailable.
const prefix = 'xc.project-draft.'
const memory = new Map()

export function projectDraft(kind, memberId) {
  const key = prefix + memberId + '.' + kind
  return {
    read() {
      if (!memberId) return null
      let json = memory.get(key)
      if (!json) {
        try { json = sessionStorage.getItem(key) } catch {}
      }
      try { return JSON.parse(json || 'null') } catch { return null }
    },
    write(value) {
      if (!memberId) return
      if (value == null) {
        memory.delete(key)
        try { sessionStorage.removeItem(key) } catch {}
        return
      }
      const json = JSON.stringify(value)
      memory.set(key, json)
      try { sessionStorage.setItem(key, json) } catch {}
    }
  }
}

export function clearProjectDrafts() {
  memory.clear()
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith(prefix)) sessionStorage.removeItem(key)
    }
  } catch {}
}
