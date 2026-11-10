const key = 'xc.projects.list.v1'

export function readProjectList(memberId) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(key))
    return memberId && saved?.memberId === memberId ? saved : {}
  } catch { return {} }
}

export function saveProjectList(memberId, values) {
  if (!memberId) return
  try { sessionStorage.setItem(key, JSON.stringify({ ...values, memberId })) } catch { /* Storage is optional. */ }
}

export function clearProjectList() {
  try { sessionStorage.removeItem(key) } catch { /* Storage is optional. */ }
}
