<template><div class="inbox-page"><div class="page-heading"><div><h1>{{ isBoss ? '审批中心' : '我的申请' }}</h1><p>每一次变更，都清晰可追溯</p></div><el-tag>{{ pendingApprovals.length }} 待审批</el-tag></div>
<el-tabs v-model="status"><el-tab-pane v-for="s in statuses" :key="s.value" :label="s.label" :name="s.value"/></el-tabs>
<div class="filter-pills"><button v-for="t in types" :key="t.value" :class="{active:type===t.value}" @click="type=t.value">{{ t.label }}</button></div>
<div class="approval-list"><ApprovalItem v-for="a in filtered" :key="a.id" :a="a" :open-detail="String(a.id) === route.query.id" @dismiss-target="clearTarget" /></div><el-empty v-if="!filtered.length" description="暂无符合条件的申请" /></div></template>
<script setup>
import {ref,computed,watch} from 'vue'
import {useRoute,useRouter} from 'vue-router'
import {approvals,pendingApprovals,isBoss} from '@/mock/store'
import ApprovalItem from '@/components/ApprovalItem.vue'
const status=ref('pending'),type=ref('')
const route=useRoute(), router=useRouter()
const target=computed(()=>approvals.find(a=>String(a.id)===route.query.id))
watch(()=>[route.query.id,target.value?.id],()=>{if(target.value){status.value=target.value.status;type.value=''}},{immediate:true})
function clearTarget(){if(route.path==='/approvals' && route.query.id)router.replace({path:'/approvals'})}
const statuses=[{value:'pending',label:'待审批'},{value:'approved',label:'已通过'},{value:'rejected',label:'已驳回'},{value:'withdrawn',label:'已撤回'}]
const types=[{value:'',label:'全部'},{value:'amount',label:'报价'},{value:'cancel',label:'取消'},{value:'delete',label:'删除'},{value:'payment',label:'收款'}]
const filtered=computed(()=>approvals.filter(a=>a.status===status.value&&(!type.value||a.type===type.value)))
</script>
