<template><span class="board-artwork" :style="style" role="img" :aria-label="label" /></template>
<script setup>
import { computed } from 'vue'
// Non-destructive crops of the approved artwork. No UI text is rasterized.
const props=defineProps({kind:{type:String,default:'laptop'},label:{type:String,default:'项目示意封面'}})
const regions={
 ribbon:{file:'board-01',size:[1752,897],rect:[18,274,269,116]},
 building:{file:'board-01',size:[1752,897],rect:[1048,219,105,79]},
 laptop:{file:'board-02',size:[1752,897],rect:[1190,290,240,114]},
 laptopThumb:{file:'board-02',size:[1752,897],rect:[35,430,70,70]},
 food:{file:'board-02',size:[1752,897],rect:[37,536,68,67]},
 shop:{file:'board-02',size:[1752,897],rect:[35,648,72,67]},
 website:{file:'board-03',size:[1754,897],rect:[900,291,258,174]},
 boss:{file:'board-01',size:[1752,897],rect:[321,218,41,45]},
 employee:{file:'board-01',size:[1752,897],rect:[619,220,38,43]},
 customer:{file:'board-01',size:[1752,897],rect:[910,222,39,45]},
 success:{file:'board-03',size:[1754,897],rect:[347,217,186,128]}
}
const style=computed(()=>{const {file,size:[iw,ih],rect:[x,y,w,h]}=regions[props.kind]||regions.laptop;return {backgroundImage:`url(/design/${file}.png)`,backgroundSize:`${iw/w*100}% ${ih/h*100}%`,backgroundPosition:`${x/(iw-w)*100}% ${y/(ih-h)*100}%`,aspectRatio:`${w}/${h}`}})
</script>
<style scoped>.board-artwork{display:block;background-repeat:no-repeat;overflow:hidden;width:100%;flex:none}</style>
