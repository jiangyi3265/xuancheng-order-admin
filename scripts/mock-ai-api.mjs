import http from 'node:http'

const now = new Date().toISOString()
const projects = [
  { id: 1, name: '接单系统后台', repoUrl: 'https://github.com/example/order-backend.git', provider: 'codex', model: '', profileKey: 'default', maxParallel: 1, enabled: 1, version: 1 },
  { id: 2, name: '客户小程序', repoUrl: 'https://github.com/example/order-app.git', provider: 'claude', model: '', profileKey: 'claude', maxParallel: 1, enabled: 1, version: 1 }
]
const tasks = [
  { id: 108, projectId: 1, projectName: '接单系统后台', title: '修复订单状态并发覆盖问题', riskLevel: 'medium', status: 'awaiting_review', currentAttemptId: 801, workerId: 'mac-mini-01', prUrl: 'https://github.com/example/order-backend/pull/42', validationPassed: 1, updateTime: now },
  { id: 107, projectId: 2, projectName: '客户小程序', title: '优化上传失败后的重试提示', riskLevel: 'low', status: 'running', currentAttemptId: 800, workerId: 'mac-mini-01', validationPassed: null, updateTime: now },
  { id: 106, projectId: 1, projectName: '接单系统后台', title: '补充订单导出字段校验', riskLevel: 'low', status: 'queued', currentAttemptId: null, workerId: null, updateTime: now },
  { id: 105, projectId: 1, projectName: '接单系统后台', title: '修复历史数据空字段兼容', riskLevel: 'low', status: 'failed', currentAttemptId: 799, workerId: 'mac-mini-01', errorMessage: '确定性验证失败：mvn test', updateTime: now },
  { id: 104, projectId: 2, projectName: '客户小程序', title: '调整客户需求空状态文案', riskLevel: 'low', status: 'approved', currentAttemptId: 798, workerId: 'mac-mini-01', prUrl: 'https://github.com/example/order-app/pull/18', validationPassed: 1, updateTime: now }
]

function detail(id) {
  const task = tasks.find((item) => item.id === id) || tasks[0]
  const attempt = {
    id: task.currentAttemptId || 801,
    attemptNo: 1,
    status: task.status === 'awaiting_review' || task.status === 'approved' ? 'succeeded' : task.status === 'failed' ? 'failed' : 'running',
    workerId: task.workerId,
    branchName: `ai/task-${task.id}/attempt-1`,
    baseSha: '11aabbccddeeff00112233445566778899aabbcc',
    headSha: task.prUrl ? '22aabbccddeeff00112233445566778899aabbcc' : null,
    diffSha: task.prUrl ? '33aabbccddeeff00112233445566778899aabbccddeeff001122334455667788' : null,
    prUrl: task.prUrl,
    validationPassed: task.validationPassed,
    validationSummary: task.validationPassed ? 'PASS (18.2s): mvn test\nPASS (9.4s): mvn package -DskipTests' : null,
    errorMessage: task.errorMessage,
    createTime: now,
    startedAt: now
  }
  return {
    ...task,
    prompt: '并发更新订单状态时，旧请求不能覆盖新状态。请复用现有 version 字段完成乐观锁校验，并补充成功与冲突两组测试。',
    promptHash: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    createdBy: 'admin',
    createTime: now,
    attempts: [attempt],
    events: [
      { id: 3, eventType: attempt.status === 'succeeded' ? 'attempt.succeeded' : 'attempt.claimed', actorId: 'mac-mini-01', createTime: now },
      { id: 2, eventType: 'task.dispatched', actorId: 'admin', createTime: now },
      { id: 1, eventType: 'task.created', actorId: 'admin', createTime: now }
    ]
  }
}

function send(response, data) {
  response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify({ code: 200, data }))
}

http.createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1:8080')
  if (url.pathname === '/captchaImage') {
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    return response.end(JSON.stringify({ code: 200, captchaEnabled: false }))
  }
  if (url.pathname === '/login') {
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    return response.end(JSON.stringify({ code: 200, token: 'local-visual-test' }))
  }
  if (url.pathname === '/jiedan/order/list') return send(response, [])
  if (url.pathname === '/jiedan/ai/projects') return send(response, projects)
  if (url.pathname === '/jiedan/ai/tasks') return send(response, tasks)
  const taskMatch = url.pathname.match(/^\/jiedan\/ai\/tasks\/(\d+)$/)
  if (taskMatch) return send(response, detail(Number(taskMatch[1])))
  const logMatch = url.pathname.match(/^\/jiedan\/ai\/attempts\/(\d+)\/logs$/)
  if (logMatch) return send(response, [
    { seq: 1, level: 'info', message: '认领任务，准备隔离工作区', createTime: now },
    { seq: 2, level: 'info', message: '策略检查通过：4 个文件', createTime: now },
    { seq: 3, level: 'info', message: 'PASS: mvn test', createTime: now }
  ])
  response.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify({ code: 404, msg: 'mock route not found' }))
}).listen(8080, '127.0.0.1', () => {
  console.log('AI visual-test API: http://127.0.0.1:8080')
})
