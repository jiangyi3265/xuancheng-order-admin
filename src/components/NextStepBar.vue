<template>
  <!-- 项目「下一步」：做什么 / 谁来做 / 哪天前。每个项目都有人推，就不会被忘在微信里 -->
  <section class="next-step" :class="[stateClass, { editing }]" aria-label="下一步">
    <span class="ns-label"><el-icon><Flag /></el-icon>下一步</span>

    <template v-if="!editing">
      <template v-if="order.nextStep">
        <span class="ns-content" :title="order.nextStep">{{ order.nextStep }}</span>
        <span class="ns-meta">
          <span class="ns-owner">{{ ownerLabel }}</span>
          <span v-if="order.nextDue" class="ns-due">{{ dueLabel }}</span>
        </span>
        <span class="ns-actions">
          <el-button size="small" type="success" :loading="busy" @click="complete">完成</el-button>
          <el-button size="small" link type="primary" @click="startEdit(false)">修改</el-button>
        </span>
      </template>
      <button v-else type="button" class="ns-add" @click="startEdit(false)">
        + 写下一步：接下来谁做什么、哪天前
      </button>
    </template>

    <div v-else class="ns-form" @keydown.esc.stop="cancel">
      <el-input
        ref="inputRef"
        v-model="form.content"
        maxlength="200"
        class="ns-input"
        :placeholder="justDone ? `已完成「${justDone}」。接下来做什么？（可以不填）` : '接下来做什么？比如：给客户看首页初稿'"
        @keydown.enter.prevent="save"
      />
      <el-select v-model="form.ownerId" class="ns-owner-select" aria-label="下一步交给谁">
        <el-option v-for="p in people" :key="p.id" :value="p.id" :label="p.label" />
      </el-select>
      <el-date-picker v-model="form.due" type="date" value-format="YYYY-MM-DD" placeholder="哪天前" class="ns-date" />
      <DeadlineChips v-model="form.due" class="ns-chips" />
      <span class="ns-form-actions">
        <el-button type="primary" :loading="busy" @click="save">保存</el-button>
        <el-button @click="cancel">{{ justDone ? '不用了' : '取消' }}</el-button>
      </span>
    </div>
  </section>
</template>

<script setup>
import { ref, reactive, computed, nextTick } from 'vue'
import { toast as ElMessage } from '@/utils/toast'
import { Flag } from '@element-plus/icons-vue'
import DeadlineChips from '@/components/DeadlineChips.vue'
import { finishNext } from '@/utils/orderUndo'
import { setNextStep, currentMember } from '@/mock/store'
import { MEMBERS, memberMap } from '@/constants/options'
import { nextDueState, shortDue } from '@/utils/workbench'

const props = defineProps({ order: { type: Object, required: true } })

const editing = ref(false)
const busy = ref(false)
const justDone = ref('')
const inputRef = ref(null)
const form = reactive({ content: '', ownerId: null, due: '' })

// 能接下一步的人：项目负责人 + 总管理员（详情里由后端给出；还没加载完时用本地成员表凑）
const people = computed(() => {
  const me = currentMember.value.id
  let list = props.order.collaborators
  if (!list?.length) {
    const ids = new Set([props.order.ownerId, ...MEMBERS.filter((m) => m.role === 'boss').map((m) => m.id)].filter(Boolean))
    list = [...ids].map((id) => ({ id, name: memberMap[id]?.name || '负责人', owner: id === props.order.ownerId }))
  }
  return list.map((p) => ({ id: p.id, label: p.id === me ? '我自己' : p.name + (p.owner ? '（负责人）' : '') }))
})
const ownerLabel = computed(() => {
  const id = props.order.nextOwnerId
  if (id === currentMember.value.id) return '我来做'
  return (props.order.nextOwnerName || memberMap[id]?.name || '负责人') + ' 来做'
})
const dueState = computed(() => nextDueState(props.order))
const dueLabel = computed(() => {
  const d = shortDue(props.order.nextDue)
  if (dueState.value === 'overdue') return '已过期 · ' + d
  return d + ' 前'
})
// 类名带 ns- 前缀：父页面也有 .empty 之类的样式，同名会串过来
const stateClass = computed(() => 'ns-' + (props.order.nextStep ? dueState.value || 'set' : 'empty'))

function startEdit(afterDone) {
  if (!afterDone) justDone.value = ''
  form.content = afterDone ? '' : props.order.nextStep || ''
  form.ownerId = (!afterDone && props.order.nextOwnerId) || props.order.ownerId || currentMember.value.id
  form.due = afterDone ? '' : props.order.nextDue || ''
  editing.value = true
  nextTick(() => inputRef.value?.focus())
}
function cancel() {
  editing.value = false
  justDone.value = ''
}
async function save() {
  if (busy.value) return
  const content = form.content.trim()
  // 刚完成一步、不想再安排：直接收起
  if (!content && justDone.value) return cancel()
  if (!content && !props.order.nextStep) return cancel()
  busy.value = true
  try {
    await setNextStep(props.order.id, { content, ownerId: form.ownerId, due: form.due || '' })
    ElMessage.success(content ? '下一步已安排' : '已清除下一步')
    cancel()
  } catch (e) {
    ElMessage.error(e.message || '保存失败')
  } finally {
    busy.value = false
  }
}
// 完成：一键完成，然后顺手问一句“接下来做什么”（可以不填）
async function complete() {
  if (busy.value) return
  busy.value = true
  const done = props.order.nextStep
  try {
    const offerUndo = await finishNext(props.order)
    offerUndo(() => { if (justDone.value && !form.content.trim()) cancel() })
    justDone.value = done
    startEdit(true)
  } catch (e) {
    ElMessage.error(e.message || '操作失败')
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.next-step {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 14px;
  margin: 0 0 14px;
  padding: 10px 14px;
  border-radius: 12px;
  background: #f4f8ff;
  border: 1px solid #dbe7ff;
  font-size: 14px;
}
.next-step.ns-empty { background: #fafbfd; border-style: dashed; border-color: #d9e1ec; }
.next-step.ns-today { background: #fff8eb; border-color: #f5d79b; }
.next-step.ns-overdue { background: #fff1f0; border-color: #f7b9b4; }
.ns-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 650;
  color: #165dff;
  flex: none;
}
.next-step.ns-today .ns-label { color: #c27c0e; }
.next-step.ns-overdue .ns-label { color: #d93026; }
.ns-content {
  flex: 1 1 200px;
  min-width: 0;
  font-weight: 600;
  color: #1b2943;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ns-meta { display: inline-flex; gap: 10px; color: #5b6b85; font-size: 13px; flex: none; }
.ns-due { font-weight: 600; }
.next-step.ns-today .ns-due { color: #c27c0e; }
.next-step.ns-overdue .ns-due { color: #d93026; }
.ns-actions { display: inline-flex; align-items: center; gap: 4px; flex: none; margin-left: auto; }
.ns-add {
  flex: 1;
  text-align: left;
  border: 0;
  background: none;
  color: #8592a6;
  font: inherit;
  cursor: pointer;
  padding: 2px 0;
}
.ns-add:hover { color: #165dff; }
.ns-form { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; flex: 1; min-width: 0; }
.ns-input { flex: 1 1 260px; min-width: 0; }
.ns-owner-select { width: 150px; }
/* 日期框的根节点拿不到本组件的作用域标记，要用 :deep 才管得到（以前这两条宽度都没生效，手机上日期框单独占了一行） */
.ns-form :deep(.ns-date) { width: 140px !important; }
.ns-form-actions { display: inline-flex; gap: 6px; margin-left: auto; }
.ns-form-actions .el-button + .el-button { margin-left: 0; }
@media (max-width: 768px) {
  .next-step { margin: 10px 16px; }
  .ns-content { flex-basis: 100%; white-space: normal; }
  .ns-actions { margin-left: auto; }
  .ns-owner-select, .ns-form :deep(.ns-date) { width: calc(50% - 5px) !important; }
  .ns-form-actions { width: 100%; justify-content: flex-end; }
  /* 手机上填写时表单单独占一整行（以前和「下一步」三个字挤在同一行，输入框只剩半截，提示语都显示不全） */
  .next-step.editing .ns-form { flex: 1 1 100%; }
  .ns-input { flex: 1 1 100%; }
}
</style>
