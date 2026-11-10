// 建账号 / 重置密码时先给一个随机密码，不用自己想；想换随时改。
// 4 个字母 + 4 个数字，去掉容易看错的 0 o 1 l i，念给对方或手打都不容易错。
const LETTERS = 'abcdefghjkmnpqrstuvwxyz'
const DIGITS = '23456789'

export function suggestPassword() {
  const rand = new Uint32Array(8)
  crypto.getRandomValues(rand)
  let out = ''
  for (let i = 0; i < 8; i++) {
    const set = i < 4 ? LETTERS : DIGITS
    out += set[rand[i] % set.length]
  }
  return out
}
