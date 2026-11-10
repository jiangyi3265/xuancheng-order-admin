// 客户沟通「常用语」：全团队共用一份，老板维护。
// 存在通知设置那张 key-value 表里（push.phrase.1 … 12，每条一格），后端和数据库都不用动；
// 员工读得到、改不了（后端只允许老板改公共设置）。
import { reactive } from 'vue'
import { savePushConfig } from '@/mock/store'

export const PHRASE_MAX = 12
export const PHRASE_LEN = 200
const KEY = 'push.phrase.'
// 还没自己设过时先给这几句
export const DEFAULT_PHRASES = [
  '需求收到了，我先看一下，今天给你回复。',
  '初稿做好了，发你看一下，有要改的直接说。',
  '已经按你的意见改好了，麻烦再看一下。',
  '项目做完交付了，麻烦抽空验收，没问题点「确认验收」就行。',
  '尾款方便的时候安排一下，谢谢。'
]
export const phrases = reactive({ list: [...DEFAULT_PHRASES] })

// cfg 是 /jiedan/push/config 返回的那份设置（布局加载时顺手传进来，不另外请求一次）
export function applyPhraseConfig(cfg) {
  // 存过（哪怕全删光了）就按存的来；一次没存过才用默认的
  if (!cfg || !Object.keys(cfg).some((k) => k.startsWith(KEY))) return
  const list = []
  for (let i = 1; i <= PHRASE_MAX; i++) {
    const v = String(cfg[KEY + i] || '').trim()
    if (v) list.push(v)
  }
  phrases.list = list
}

export async function savePhrases(list) {
  const clean = list.map((s) => String(s || '').trim().slice(0, PHRASE_LEN)).filter(Boolean).slice(0, PHRASE_MAX)
  const cfg = {}
  for (let i = 1; i <= PHRASE_MAX; i++) cfg[KEY + i] = clean[i - 1] || ''
  await savePushConfig(cfg)
  phrases.list = clean
}
