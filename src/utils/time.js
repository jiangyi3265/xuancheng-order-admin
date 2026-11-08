// 后端有的时间带「T」和秒（2026-11-07T23:50:14），界面上统一显示成 2026-11-07 23:50
export function fmtTime(t) {
  return t ? String(t).replace('T', ' ').slice(0, 16) : ''
}
