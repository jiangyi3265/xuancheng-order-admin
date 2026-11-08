<template>
  <!-- 点一下就地修改：文字回车保存（多行 Ctrl+Enter），点别处也保存，Esc 放弃；日期 / 下拉选完立即保存 -->
  <span v-if="!editing" class="inline-edit" :class="{ 'ie-readonly': disabled, 'ie-empty': isEmpty }"
    :role="disabled ? undefined : 'button'" :tabindex="disabled ? undefined : 0" :title="disabled ? undefined : '点击修改'"
    @click="start" @keydown.enter.prevent="start">
    <template v-if="isEmpty">{{ disabled ? '-' : placeholder }}</template>
    <slot v-else>{{ modelValue }}</slot>
    <el-icon v-if="!disabled" class="ie-pen"><EditPen /></el-icon>
  </span>
  <span v-else class="inline-edit-form" @keydown.esc.stop.prevent="cancel">
    <el-date-picker v-if="type === 'date'" ref="inputRef" v-model="draft" type="date" value-format="YYYY-MM-DD" size="small"
      :placeholder="placeholder" :disabled="saving" @change="commit" @visible-change="closeLater" />
    <el-select v-else-if="type === 'select'" ref="inputRef" v-model="draft" size="small" automatic-dropdown :disabled="saving"
      @change="commit" @visible-change="closeLater">
      <el-option v-for="o in options" :key="o.value" :label="o.label" :value="o.value" />
    </el-select>
    <el-input-number v-else-if="type === 'number'" ref="inputRef" v-model="draft" size="small" :min="0" :controls="false" :disabled="saving"
      @keydown.enter.prevent="commit" @blur="commit" />
    <el-input v-else-if="type === 'textarea'" ref="inputRef" v-model="draft" type="textarea" :autosize="{ minRows: 2, maxRows: 8 }"
      :maxlength="maxlength" :disabled="saving" :placeholder="placeholder + '（Ctrl+Enter 保存）'"
      @keydown.enter.ctrl.prevent="commit" @keydown.enter.meta.prevent="commit" @blur="commit" />
    <el-input v-else ref="inputRef" v-model="draft" size="small" :maxlength="maxlength" :disabled="saving" :placeholder="placeholder"
      @keydown.enter.prevent="commit" @blur="commit" />
  </span>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { EditPen } from '@element-plus/icons-vue'

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  type: { type: String, default: 'text' }, // text | textarea | date | select | number
  options: { type: Array, default: () => [] },
  placeholder: { type: String, default: '点击填写' },
  maxlength: { type: Number, default: 200 },
  disabled: { type: Boolean, default: false },
  // 保存：async (value) => {}，抛错则留在编辑状态
  save: { type: Function, required: true }
})

const editing = ref(false)
const saving = ref(false)
const draft = ref('')
const inputRef = ref(null)
const isEmpty = computed(() => props.modelValue === null || props.modelValue === undefined || props.modelValue === '')

function start() {
  if (props.disabled || editing.value) return
  draft.value = props.modelValue ?? (props.type === 'number' ? 0 : '')
  editing.value = true
  nextTick(() => {
    const el = inputRef.value
    el?.focus?.()
    if (props.type === 'date') el?.handleOpen?.()
  })
}
function cancel() {
  if (!saving.value) editing.value = false
}
const same = () => String(draft.value ?? '').trim() === String(props.modelValue ?? '').trim()
function cancelIfSame() {
  if (editing.value && same()) editing.value = false
}
async function commit() {
  if (saving.value || !editing.value) return
  if (same()) return (editing.value = false)
  const value = typeof draft.value === 'string' ? draft.value.trim() : draft.value
  saving.value = true
  try {
    await props.save(value)
    editing.value = false
    ElMessage.success('已保存')
  } catch (e) {
    ElMessage.error(e?.message || '保存失败')
    nextTick(() => inputRef.value?.focus?.())
  } finally {
    saving.value = false
  }
}
// 下拉 / 日历收起但没选新值：退出编辑
function closeLater(open) {
  if (!open && !saving.value) window.setTimeout(cancelIfSame, 150)
}
</script>

<style scoped>
.inline-edit {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  border-radius: 4px;
  cursor: pointer;
  padding: 0 2px;
  margin: 0 -2px;
}
.inline-edit:hover,
.inline-edit:focus-visible {
  background: #eef4ff;
  outline: none;
}
.inline-edit.ie-empty {
  color: #a8b3c4;
}
.inline-edit.ie-readonly {
  cursor: default;
}
.inline-edit.ie-readonly:hover {
  background: none;
}
.ie-pen {
  flex: none;
  font-size: 12px;
  color: #9aa8bd;
  opacity: 0;
  transition: opacity 0.15s;
}
.inline-edit:hover .ie-pen,
.inline-edit:focus-visible .ie-pen {
  opacity: 1;
}
.inline-edit-form {
  display: inline-flex;
  width: 100%;
  max-width: 320px;
}
.inline-edit-form :deep(.el-textarea) {
  max-width: none;
}
.inline-edit-form:has(.el-textarea) {
  max-width: none;
}
</style>
