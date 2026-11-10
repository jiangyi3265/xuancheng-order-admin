<template>
  <!-- 常用语：点一句填进输入框（不直接发，方便改两个字再发）。老板可以在这里增删，全团队共用 -->
  <el-popover v-model:visible="open" placement="top-end" trigger="click" :width="320" @hide="editing = false">
    <template #reference>
      <button type="button" class="phrase-btn" title="常用的话点一下就填进输入框" :disabled="disabled">常用语</button>
    </template>
    <div class="phrase-box" @keydown.esc.stop="open = false">
      <template v-if="!editing">
        <button v-for="(p, i) in phrases.list" :key="i" type="button" class="phrase-item" @click="pick(p)">{{ p }}</button>
        <p v-if="!phrases.list.length" class="phrase-empty">还没有常用语{{ isBoss ? '，点「编辑常用语」加几句' : '' }}</p>
        <div class="phrase-foot">
          <span>点一句填进输入框，改好再发</span>
          <button v-if="isBoss" type="button" class="phrase-link" @click="startEdit">编辑常用语</button>
        </div>
      </template>
      <template v-else>
        <div v-for="(row, i) in draft" :key="i" class="phrase-edit-row">
          <!-- 多行输入框：长一点的话也能整句看到（单行时后半句被挡住） -->
          <el-input v-model="draft[i]" type="textarea" resize="none" :autosize="{ minRows: 1, maxRows: 4 }" :maxlength="PHRASE_LEN"
            :aria-label="'常用语 ' + (i + 1)" placeholder="写一句常用的话" @keydown.enter.prevent />
          <button type="button" class="phrase-del" :aria-label="'删除常用语 ' + (i + 1)" title="删除这一句" @click="draft.splice(i, 1)">×</button>
        </div>
        <button v-if="draft.length < PHRASE_MAX" type="button" class="phrase-link" @click="draft.push('')">+ 加一句</button>
        <div class="phrase-foot">
          <span>全团队共用这一份</span>
          <span class="phrase-foot-btns">
            <el-button size="small" :disabled="saving" @click="editing = false">取消</el-button>
            <el-button size="small" type="primary" :loading="saving" @click="save">保存</el-button>
          </span>
        </div>
      </template>
    </div>
  </el-popover>
</template>

<script setup>
import { ref } from 'vue'
import { toast as ElMessage } from '@/utils/toast'
import { isBoss } from '@/mock/store'
import { phrases, savePhrases, PHRASE_MAX, PHRASE_LEN } from '@/utils/phrases'

defineProps({ disabled: Boolean })
const emit = defineEmits(['pick'])
const open = ref(false)
const editing = ref(false)
const saving = ref(false)
const draft = ref([])

function pick(text) {
  open.value = false
  emit('pick', text)
}
function startEdit() {
  draft.value = phrases.list.length ? [...phrases.list] : ['']
  editing.value = true
}
async function save() {
  saving.value = true
  try {
    await savePhrases(draft.value)
    editing.value = false
    ElMessage.success('常用语已保存')
  } catch (e) {
    ElMessage.error(e.message || '保存失败')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.phrase-btn { flex: none; height: 34px; padding: 0 8px; border: 1px solid #d9e3f1; border-radius: 9px; background: #fff; color: #496485; font-size: 12px; white-space: nowrap; cursor: pointer; }
.phrase-btn:hover, .phrase-btn:focus-visible { border-color: #409eff; color: #409eff; }
.phrase-btn:disabled { opacity: .6; cursor: not-allowed; }
.phrase-box { display: grid; gap: 6px; max-height: 55vh; overflow: auto; }
.phrase-item { text-align: left; border: 0; border-radius: 8px; padding: 8px 10px; background: #f4f7fc; color: #26364d; font-size: 13px; line-height: 1.5; cursor: pointer; }
.phrase-item:hover, .phrase-item:focus-visible { background: #e3efff; }
.phrase-empty { margin: 4px 0; color: #909399; font-size: 13px; }
.phrase-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 4px; color: #909399; font-size: 12px; }
.phrase-foot-btns { display: flex; flex: none; }
.phrase-link { border: 0; background: none; padding: 2px 0; color: #409eff; font-size: 12px; text-align: left; cursor: pointer; }
.phrase-edit-row { display: flex; align-items: flex-start; gap: 6px; }
.phrase-edit-row :deep(.el-textarea__inner) { font-size: 13px; line-height: 1.5; }
.phrase-del { flex: none; width: 28px; height: 28px; border: 0; border-radius: 6px; background: #f4f4f5; color: #909399; font-size: 16px; line-height: 1; cursor: pointer; }
.phrase-del:hover, .phrase-del:focus-visible { background: #fde2e2; color: #f56c6c; }
</style>
