<template>
  <section class="issue-review" aria-label="本次修改">
    <header :id="'issue-reply-'+review.id" :data-team-reply="review.id" tabindex="-1">
      <h3>本次修改</h3><time v-if="review.time">{{ review.time }}</time>
    </header>
    <p v-if="review.content" class="review-note">{{ review.content }}</p>
    <div v-if="pictures.length === 2" class="review-switch" role="group" aria-label="切换对照图">
      <button v-for="picture in pictures" :key="picture.side" type="button"
        :aria-pressed="selected === picture.side" @click="selected=picture.side">{{ picture.label }}</button>
    </div>
    <div v-if="pictures.length" class="review-pictures" :class="{paired:pictures.length===2}">
      <figure v-for="picture in pictures" :key="picture.side" :class="{'mobile-hidden':pictures.length===2 && selected!==picture.side}">
        <figcaption>{{ picture.label }}</figcaption>
        <button type="button" :aria-label="'放大'+picture.label+'截图'" @click="preview(picture)">
          <img v-if="!failed[picture.side]" :src="picture.file.url" :alt="picture.file.name || picture.label+'截图'"
            @error="failed[picture.side]=true" />
          <span v-else class="image-error">图片加载失败，点开重试</span>
        </button>
      </figure>
    </div>
    <div v-if="pending && !adjusting" class="review-choices">
      <button type="button" class="accept" :disabled="busy" @click="$emit('accept')">确认好了</button>
      <button type="button" :disabled="busy" @click="$emit('adjust')">还要调整</button>
    </div>
    <div v-else-if="remainingCount != null" class="review-choices">
      <button v-if="remainingCount" type="button" @click="$emit('next')">查看下一条待确认（剩 {{ remainingCount }} 条）</button>
      <button v-else type="button" @click="$emit('back')">{{ backLabel }}</button>
    </div>
  </section>
</template>

<script setup>
import {computed, reactive, ref} from 'vue'
import {openImage} from '@/utils/imagePreview'
const props = defineProps({review:{type:Object,required:true}, pending:Boolean, adjusting:Boolean, busy:Boolean, remainingCount:Number, backLabel:String})
defineEmits(['accept','adjust','next','back'])
const selected = ref('after')
const failed = reactive({})
const pictures = computed(() => [
  {side:'before',label:'改前',file:props.review.beforeImage},
  {side:'after',label:'改后',file:props.review.afterImage}
].filter(item=>item.file?.url))
function preview(picture) {
  const gallery = pictures.value.map(({file,label})=>({file,url:file.url,name:file.name || label+'截图',context:label}))
  openImage(picture.file.url, picture.file.name, picture.file, gallery)
}
</script>

<style scoped>
.issue-review {background:#f7faff;border-bottom:1px solid #dae6f6;padding:clamp(14px,2.2vw,24px);color:#233d60}
.issue-review header,.review-choices,.review-switch {display:flex;align-items:center;gap:8px}
.issue-review header {justify-content:space-between;gap:12px}
h3,p,figure {margin:0}h3 {font-size:16px}.issue-review time {color:#617187;font-size:12px}
.review-note {margin-top:6px;color:#344860;font-size:14px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}
.review-pictures {display:grid;margin-top:10px;gap:10px}.review-pictures.paired {grid-template-columns:repeat(2,minmax(0,1fr))}
figcaption {font-size:12px;color:#52667e;margin:0 0 4px}figure {min-width:0}
figure button {display:grid;place-items:center;background:#edf2f8;border:1px solid #d2dfee;padding:4px;width:100%;height:clamp(124px,23vh,215px);border-radius:8px;cursor:zoom-in}
figure img {display:block;width:100%;height:100%;max-height:100%;min-height:0;object-fit:contain}
.image-error {font-size:12px;color:#6a5360}
.review-choices {margin-top:14px;flex-wrap:wrap}
.review-choices button,.review-switch button {font:inherit;cursor:pointer;border:1px solid #c5d6ec;color:#315377;border-radius:8px;padding:8px 15px;background:white;font-size:14px;min-height:38px}
.review-choices button.accept {color:#fff;border-color:#225fda;background:#225fda;font-weight:600}
.review-choices button:disabled {opacity:.6;cursor:wait}.review-switch {display:none}
@media (max-width:700px) {
  .review-switch {display:inline-flex;background:#e8eff8;border-radius:8px;gap:2px;padding:2px;margin-top:10px}
  .review-switch button {border:0;padding:4px 16px;background:transparent;min-height:30px;font-size:13px}
  .review-switch button[aria-pressed=true] {background:white;color:#1c55ad;box-shadow:0 1px 4px #405b7d24}
  .review-pictures.paired {grid-template-columns:minmax(0,1fr);margin-top:5px}
  .paired figcaption,.mobile-hidden {display:none}
  .review-choices button {flex:1;min-height:40px}
}
</style>
