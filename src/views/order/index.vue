<template>
  <div ref="pageEl" class="order-page" :class="{'is-kanban':viewMode==='kanban'}">
    <BoardHeader v-if="isMobile" :brand="viewMode==='list'" :title="viewMode==='list'?'玄成接单':'项目看板'"><PendingBell /></BoardHeader>
    <!-- 工具栏（电脑） -->
    <div v-if="!isMobile" class="toolbar">
      <div class="left">
        <el-button type="primary" :icon="Plus" @click="openDialog()">新建项目</el-button>
        <el-radio-group v-model="viewMode" style="margin-left: 12px">
          <el-radio-button value="kanban">
            <el-icon><Grid /></el-icon> 看板
          </el-radio-button>
          <el-radio-button value="list">
            <el-icon><List /></el-icon> 列表
          </el-radio-button>
        </el-radio-group>
      </div>
      <div class="right">
        <el-input
          v-model="filter.keyword"
          placeholder="搜项目名 / 客户 / 联系方式 / 需求"
          :prefix-icon="Search"
          clearable
          style="width: 250px"
        />
        <!-- 渠道、创建日期不常用：收进「筛选」，点开才多出一行（以前和搜索框挤在一排） -->
        <el-button :type="moreFilterCount ? 'primary' : ''" :plain="!!moreFilterCount" @click="filterOpen = !filterOpen">
          筛选{{ moreFilterCount ? '（' + moreFilterCount + '）' : '' }}
          <el-icon class="el-icon--right"><component :is="filterOpen ? 'ArrowUp' : 'ArrowDown'" /></el-icon>
        </el-button>
        <el-button v-if="hasFilter && (!ordersReady || (viewMode === 'kanban' ? boardRows.length : pagedOrders.length))" link type="primary" @click="resetFilter">清空筛选</el-button>
        <el-button :icon="Download" :title="exportTitle" :disabled="quick === 'waiting'" :loading="exporting" @click="doExport">{{ quick === 'waiting' ? '此分组暂不支持导出' : '导出 Excel' }}</el-button>
      </div>
      <div v-if="filterOpen" class="toolbar-extra">
        <span class="extra-label">渠道</span>
        <el-select v-model="filter.channel" placeholder="全部渠道" clearable style="width: 130px">
          <el-option v-for="c in CHANNEL" :key="c.value" :label="c.label" :value="c.value" />
        </el-select>
        <span class="extra-label">创建日期</span>
        <el-date-picker
          v-model="createRange"
          type="daterange"
          value-format="YYYY-MM-DD"
          range-separator="至"
          start-placeholder="创建开始"
          end-placeholder="创建结束"
          style="width: 240px"
        />
      </div>
    </div>

    <div v-else class="board-project-tools">
      <div v-if="viewMode==='kanban'" class="board-kanban-counts"><button type="button" @click="chooseGroup('all')"><b>{{ ordersReady ? quickCounts.all : '–' }}</b><span>全部项目</span></button><button v-for="st in ['pending','doing','review']" :key="st" type="button" @click="chooseGroup(st,true)"><b>{{ ordersReady ? quickCounts[st] : '–' }}</b><span>{{ statusMap[st].label }}</span></button></div>
      <div class="compact-search"><el-input v-model="filter.keyword" placeholder="项目/客户/联系方式" :prefix-icon="Search" clearable/>
      <div class="board-filter-row"><el-button @click="filterOpen=!filterOpen">筛选{{ moreFilterCount ? '（' + moreFilterCount + '）' : '' }} <el-icon><component :is="filterOpen ? 'ArrowUp' : 'ArrowDown'"/></el-icon></el-button><el-button v-if="!selectionMode" :disabled="batchBusy" @click="toggleSelection">多选</el-button></div></div>
      <div v-if="filterOpen" class="m-filters"><el-select v-if="viewMode === 'list'" v-model="sortKey" aria-label="项目排序"><el-option v-for="choice in sortChoices" :key="choice.value" :label="choice.label" :value="choice.value"/></el-select><el-select v-model="filter.channel" placeholder="全部渠道" clearable><el-option v-for="c in CHANNEL" :key="c.value" :label="c.label" :value="c.value"/></el-select><div class="m-dates"><el-date-picker v-model="rangeStart" type="date" value-format="YYYY-MM-DD" placeholder="开始日期" style="width:48%"/><el-date-picker v-model="rangeEnd" type="date" value-format="YYYY-MM-DD" placeholder="结束日期" style="width:48%"/></div></div>
      <div class="board-view-row"><el-radio-group v-model="viewMode"><el-radio-button value="list"><el-icon><List/></el-icon> 列表</el-radio-button><el-radio-button value="kanban"><el-icon><Grid/></el-icon> 看板</el-radio-button></el-radio-group><el-button text @click="router.push({ path: route.path, query: { ...route.query, open: 'quick' } })">极速建单</el-button><el-button text :icon="Download" :title="exportTitle" :disabled="quick === 'waiting'" :loading="exporting" @click="doExport">{{ quick === 'waiting' ? '此分组暂不支持导出' : '导出' }}</el-button></div>
      <el-button v-if="hasFilter && (!ordersReady || (viewMode === 'kanban' ? boardRows.length : pagedOrders.length))" link @click="resetFilter">清空筛选</el-button>
    </div>
    <button v-if="isMobile" class="board-create-fab" aria-label="新建项目" @click="openDialog()"><el-icon><Plus/></el-icon></button>

    <!-- 一键筛选：点一下就切，数字是现在有几单 -->
    <div class="quick-bar">
      <div class="chip-row">
        <span v-if="!isMobile" class="chip-label">看什么</span>
        <button
          type="button"
          v-for="q in QUICK"
          :key="q.key"
          class="qchip"
          :class="{ on: quick === q.key, warn: q.warn && quickCounts[q.key] > 0 }"
          @click="chooseGroup(q.key)"
        >{{ q.label }}<b>{{ ordersReady ? quickCounts[q.key] : '–' }}</b></button>
        <el-button v-if="!isMobile && !selectionMode" class="chip-row-end" size="small" :disabled="batchBusy" @click="toggleSelection">多选项目</el-button>
      </div>
      <div v-if="showPeople && !isMobile" class="chip-row">
        <span class="chip-label">看谁的</span>
        <button type="button" class="qchip" :class="{ on: !filter.ownerId }" @click="chooseOwner('')">所有人</button>
        <button
          type="button"
          v-for="p in visiblePeople"
          :key="p.m.id"
          class="qchip"
          :class="{ on: filter.ownerId === p.m.id }"
          @click="chooseOwner(p.m.id)"
        >
          <el-avatar :size="18" :style="{ background: p.m.color, fontSize: '10px' }">{{ p.m.name.slice(-1) }}</el-avatar>
          {{ p.m.id === currentMember.id ? '我自己' : p.m.name }}<b>{{ ordersReady ? p.count : '–' }}</b>
        </button>
        <!-- 人多时只摆手上单子最多的几位，其余收进可搜索的下拉，不再铺满半屏 -->
        <el-select
          v-if="hiddenPeople.length"
          :model-value="null"
          filterable
          size="small"
          class="people-more"
          :placeholder="'其他 ' + hiddenPeople.length + ' 人'"
          @update:model-value="chooseOwner"
        >
          <el-option v-for="p in hiddenPeople" :key="p.m.id" :value="p.m.id" :label="p.m.name + '（' + p.count + '）'" />
        </el-select>
      </div>
    </div>

    <PendingProjects v-if="ordersReady && !selectionMode" :orders="boardRows" />

    <div v-if="selectionMode || batchErrors.length" class="project-batch-bar">
      <el-button v-if="selectionMode" :disabled="batchBusy" @click="toggleSelection">退出多选</el-button>
      <template v-if="selectionMode">
        <el-checkbox :model-value="allVisibleSelected" :indeterminate="selectedIds.length > 0 && !allVisibleSelected" :disabled="batchBusy || !visibleSelectionOrders.length" @change="selectVisible">全选当前展示</el-checkbox>
        <span role="status">已选 {{ selectedIds.length }} 项</span>
        <el-select v-model="batchStatus" placeholder="选择目标状态" :disabled="batchBusy" aria-label="批量目标状态" style="width:140px"><el-option v-for="st in batchStatuses" :key="st.value" :value="st.value" :label="st.label"/></el-select>
        <el-button type="primary" :disabled="!selectedIds.length || !batchStatus" :loading="batchBusy" @click="applyBatchStatus">批量修改状态</el-button>
        <!-- 批量改派：有人忙不过来 / 要停用账号时，把选中的单子一次转给另一个人（以前只能一单一单点） -->
        <el-dropdown v-if="isBoss && MEMBERS.length > 1" trigger="click" max-height="320" :disabled="!selectedIds.length || batchBusy" @command="applyBatchAssign">
          <el-button :disabled="!selectedIds.length || batchBusy" :loading="batchBusy && batchAssigning">批量派给…</el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-for="m in assignTargets" :key="m.id" :command="m.id">{{ m.id === currentMember.id ? '我自己' : m.name }}</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button v-if="isBoss" type="danger" plain :disabled="!selectedIds.length || batchBusy" @click="applyBatchDelete">批量删除</el-button>
      </template>
      <p v-if="batchErrors.length" class="batch-errors" role="alert">{{ batchErrors.join('；') }}</p>
    </div>

    <!-- 看板视图 -->
    <!-- 看板只在看板模式下渲染：以前用 v-show，列表模式下也把一两百张卡片（每张带改派菜单）全画一遍，打开项目管理要卡好几秒 -->
    <div v-if="!ordersReady" class="order-load-state" :aria-busy="!ordersError">
      <div v-if="ordersError" role="alert">项目没加载出来：{{ ordersError }} <el-button size="small" @click="loadOrders().catch(() => {})">重试</el-button></div>
      <div v-else role="status" aria-label="项目加载中"><el-skeleton animated :rows="4" /></div>
    </div>
    <div v-else-if="viewMode === 'kanban' && hasFilter && !boardRows.length" class="order-load-state">
      <el-empty description="没有符合筛选条件的项目"><el-button @click="resetFilter">清空筛选</el-button></el-empty>
    </div>
    <div v-else-if="viewMode === 'kanban'" class="kanban thin-scroll">
      <div class="kanban-col" v-for="st in visibleColumns" :key="st" :data-column-status="st" :class="{
        'drop-allowed': draggingOrder && draggingOrder.status !== st && !dropBlocked(draggingOrder, st),
        'drop-blocked': draggingOrder && !!dropBlocked(draggingOrder, st)
      }">
        <button type="button" class="col-header" :aria-label="'展开'+statusMap[st].label" :style="{ borderTopColor: statusMap[st].color }" @click="chooseGroup(st, true)">
          <span class="col-title">
            <span class="dot" :style="{ background: statusMap[st].color }"></span>
            {{ statusMap[st].label }}
          </span>
          <span v-if="draggingOrder && dropBlocked(draggingOrder, st)" class="drop-reason">{{ dropBlocked(draggingOrder, st) }}</span><span class="col-count">{{ columnTotals[st] }}</span>
        </button>
        <div v-if="columnTotals[st] > columns[st].length" class="col-more">
          展开此列可查看全部 {{ columnTotals[st] }} 个项目
        </div>
        <draggable
          v-model="columns[st]"
          :data-status="st"
          :move="canDrop"
          @start="e => beginDrag(columns[st][e.oldDraggableIndex ?? e.oldIndex])"
          @end="draggingOrder = null"
          group="orders"
          item-key="id"
          class="col-body thin-scroll"
          :animation="180"
          ghost-class="ghost"
          v-bind="dragOpts"
          :disabled="selectionMode || batchBusy"
          filter=".card-controls, .issue-shortcut, .urgency-actions"
          :prevent-on-filter="false"
          @change="(e) => onDragChange(e, st)"
        >
          <template #item="{ element }">
            <div class="card" :class="{ overdue: isOverdue(element), unread: isUnread(element), selecting: selectionMode, 'batch-selected': selectionMode && selectedIds.includes(element.id) }" @click="selectionMode ? toggleSelected(element.id) : openDetail(element)">
              <span v-if="hasReminder(element)" class="new-badge">新提醒</span>
              <span v-else-if="actionLabel(element) && !hasActionBugs(element)" class="new-badge action-badge">{{ actionLabel(element) }}</span>
              <div class="card-controls" @click.stop>
                <el-checkbox v-if="selectionMode" :model-value="selectedIds.includes(element.id)" :disabled="batchBusy" :aria-label="'选择项目 '+element.title" @change="toggleSelected(element.id)"/>
                <el-button v-else link type="primary" @click="openDialog(element)">编辑</el-button>
              </div>
              <div v-if="isMobile" class="board-kanban-project"><div class="board-kanban-main"><ProjectCover :order="element" :inert="selectionMode" compact/><div><h3><button v-if="!selectionMode" type="button" class="project-title-button" :aria-label="'打开项目：' + element.title" @click.stop="openDetail(element)">{{ element.title }}</button><template v-else>{{ element.title }}</template></h3><p v-if="Number(element.amount)">报价：<b>{{ money(element.amount) }}</b></p><p v-else class="unpriced">未报价</p><p v-if="element.deadline" :class="{ 'red-text': isOverdue(element) }">截止：{{ shortDate(element.deadline) }}</p></div></div><CustomerWaitBadges :order="element" /><div class="board-kanban-owner"><el-avatar :size="22" :style="{background:memberMap[element.ownerId]?.color}">{{ memberMap[element.ownerId]?.name?.slice(-1) }}</el-avatar><span>{{ memberMap[element.ownerId]?.name }}</span></div></div>
              <template v-else>
              <div class="card-top">
                <el-tag size="small" :style="channelStyle(element.channel)" effect="plain">
                  {{ channelMap[element.channel]?.label }}
                </el-tag>
                <span class="order-no">{{ element.orderNo }}</span>
                <span v-if="element.priority && element.priority !== 'medium'" class="prio" :style="{ background: priorityMap[element.priority]?.color }">
                  {{ priorityMap[element.priority]?.label }}
                </span>
              </div>
              <div class="card-title">
                <button v-if="!selectionMode" type="button" class="project-title-button" :aria-label="'打开项目：' + element.title" @click.stop="openDetail(element)">{{ element.title }}</button>
                <template v-else>{{ element.title }}</template>
              </div>
              <CustomerWaitBadges :order="element" />
              <div v-if="element.assignState === 'pending' || Number(element.pendingApprovals) > 0 || stalledOf(element)" class="card-flags">
                <span v-if="element.assignState === 'pending'" class="flag amber">{{ isBoss ? '等 ' + (memberMap[element.ownerId]?.name || '负责人') + ' 接收' : '待接收' }}</span>
                <span v-if="Number(element.pendingApprovals) > 0" class="flag red">{{ element.pendingApprovals }} 条申请待批</span>
                <span v-if="stalledOf(element)" class="flag amber">{{ stalledOf(element) }} 天没动静</span>
              </div>
              <!-- 下一步：谁做什么、哪天前 -->
              <div v-if="element.nextStep" class="card-next" :class="nextDueState(element)" :title="element.nextStep">
                <el-icon><Flag /></el-icon><span>{{ element.nextStep }}</span><em>{{ nextWho(element) }}{{ element.nextDue ? ' · ' + shortDue(element.nextDue) : '' }}</em>
              </div>
              <div class="card-customer">
                <el-icon><User /></el-icon> {{ element.customer || '未填客户' }}
                <span v-if="element.attachmentCount || (element.attachments && element.attachments.length)" class="img-flag">
                  <el-icon><Paperclip /></el-icon>{{ element.attachmentCount || element.attachments.length }}
                </span>
                <span v-if="element.revisions > 0" class="rev-flag">改{{ element.revisions }}</span>
              </div>
              <div class="card-foot" :inert="selectionMode">
                <AssignMenu :order="element" plain>
                  <span class="who" title="点一下改派给别人">
                    <el-avatar :size="22" :style="{ background: memberMap[element.ownerId]?.color, fontSize: '12px' }">
                      {{ memberMap[element.ownerId]?.name?.slice(-1) }}
                    </el-avatar>
                    <span v-if="MEMBERS.length > 1" class="owner-name">{{ memberMap[element.ownerId]?.name }}</span>
                  </span>
                </AssignMenu>
                <span v-if="element.deadline" class="deadline" :class="{ red: isOverdue(element) }">
                  <el-icon><Clock /></el-icon> <span :title="element.deadline || ''">{{ shortDate(element.deadline) }}</span>
                </span>
                <span class="amount" title="点击记收款" @click.stop="openPay(element)">
                  <template v-if="Number(element.amount)">{{ money(element.amount) }}</template><em v-else class="unpriced">未报价</em>
                  <i v-if="payText(element)" class="pay-flag" :class="payState(element)">{{ payText(element) }}</i>
                </span>
              </div>
              </template>
              <ProjectUrgency :order="element" :selecting="selectionMode" compact />
              <button v-if="!selectionMode && hasActionBugs(element)" type="button" class="issue-shortcut"
                @click.stop="openActionBugs(element)">处理问题（{{ element.actionBugCount }}）</button>
            </div>
          </template>
        </draggable>
      </div>
    </div>

    <!-- 列表视图 -->
    <el-card v-if="ordersReady && viewMode === 'list'" shadow="never" class="list-card">
      <el-table ref="listTable" v-if="!isMobile" :data="pagedOrders" :default-sort="tableSort" @sort-change="setTableSort" stripe @row-click="row => selectionMode ? toggleSelected(row.id) : openDetail(row)" style="cursor: pointer">
        <el-table-column v-if="selectionMode" label="选择" width="65"><template #default="{ row }"><span @click.stop><el-checkbox :model-value="selectedIds.includes(row.id)" :disabled="batchBusy" :aria-label="'选择项目 '+row.title" @change="toggleSelected(row.id)"/></span></template></el-table-column>
        <el-table-column prop="orderNo" label="编号" width="134" class-name="nowrap-col" />
        <el-table-column label="项目名" min-width="240" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="isUnread(row)" class="dot-unread"></span>
            {{ row.title }}
            <CustomerWaitBadges :order="row" />
            <ProjectUrgency :order="row" :selecting="selectionMode" />
            <el-icon v-if="row.attachmentCount || (row.attachments && row.attachments.length)" class="inline-pic"><Paperclip /></el-icon>
          </template>
        </el-table-column>
        <!-- 渠道列去掉了：列表放不下时会把「截止」挤到看不见；渠道在看板和详情里都有，也能用上面的渠道筛选 -->
        <el-table-column prop="customer" label="客户" width="110" show-overflow-tooltip />
        <el-table-column label="负责人" width="100" class-name="owner-col">
          <template #default="{ row }">
            <span v-if="selectionMode">{{ memberMap[row.ownerId]?.name }}</span>
            <AssignMenu v-else :order="row" plain>
              <span class="who" title="点一下改派给别人">{{ memberMap[row.ownerId]?.name }}</span>
            </AssignMenu>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag size="small" :type="statusMap[row.status]?.type" effect="light">
              {{ statusMap[row.status]?.label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="amount" sortable="custom" label="报价" width="86">
          <template #default="{ row }"><span v-if="Number(row.amount)">{{ money(row.amount) }}</span><span v-else class="unpriced">未报价</span></template>
        </el-table-column>
        <el-table-column prop="owed" sortable="custom" label="收款" width="96">
          <template #default="{ row }">
            <el-tag
              size="small"
              :type="PAY_STATE[payState(row)].type"
              effect="light"
              :class="{'pay-tag': !selectionMode}"
              :title="selectionMode ? undefined : '点击记收款'"
              @click.stop="selectionMode ? toggleSelected(row.id) : openPay(row)"
            >{{ payText(row) || PAY_STATE[payState(row)].label }}</el-tag>
          </template>
        </el-table-column>
        <!-- 「逾期 · 11-10」以前在 96px 里放不下，日期被拆成两行；加宽一点并且不换行 -->
        <el-table-column prop="deadline" sortable="custom" label="截止" width="112">
          <template #default="{ row }">
            <span v-if="row.deadline" :class="{ 'red-text': isOverdue(row) }" style="white-space:nowrap" :title="row.deadline">{{ isOverdue(row) ? '逾期 · ' : '' }}{{ shortDate(row.deadline) }}</span>
            <span v-else class="unpriced">-</span>
          </template>
        </el-table-column>
        <el-table-column v-if="!selectionMode" label="操作" :width="showDun ? 204 : 160" fixed="right">
          <template #default="{ row }">
            <el-button link type="success" @click.stop="openPay(row)">收款</el-button>
            <!-- 看「还欠款」时每行直接催：点一下就把「总价、已收、还差多少」复制好，粘到微信发（以前要点进项目才有） -->
            <el-button v-if="showDun" link type="warning" title="生成一段催款的话并复制，粘到微信发给客户" @click.stop="copyDunning(row)">催款</el-button>
            <el-button
              v-if="canFinish(row)"
              link
              type="primary"
              @click.stop="finishFromList(row)"
            >{{ isBoss ? '完成' : '提交验收' }}</el-button>
            <el-button
              v-if="!isBoss && row.assignState === 'pending'"
              link
              type="warning"
              @click.stop="openDetail(row)"
            >去接收</el-button>
            <el-dropdown trigger="click" @command="(c) => onMore(c, row)">
              <el-button link type="primary" @click.stop>更多<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="notebook">记事本</el-dropdown-item>
                  <el-dropdown-item command="edit">编辑</el-dropdown-item>
                  <el-dropdown-item
                    v-for="(s, i) in moreStatuses(row)"
                    :key="s.value"
                    :command="'status:' + s.value"
                    :divided="i === 0"
                  >设为「{{ s.label }}」</el-dropdown-item>
                  <template v-if="isBoss">
                    <el-dropdown-item command="delete" divided>删除</el-dropdown-item>
                  </template>
                  <template v-else>
                    <el-dropdown-item command="request:amount" divided>申请改报价</el-dropdown-item>
                    <el-dropdown-item v-if="!['done', 'cancelled'].includes(row.status)" command="request:cancel">申请取消</el-dropdown-item>
                    <el-dropdown-item command="request:delete">申请删除</el-dropdown-item>
                  </template>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty :description="hasFilter ? '没有符合筛选条件的项目' : '还没有项目'"><el-button v-if="hasFilter" @click="resetFilter">清空筛选</el-button></el-empty>
        </template>
      </el-table>
      <!-- 手机：一单一张卡片，不用表格 -->
      <div v-else class="m-list">
        <div v-for="row in pagedOrders" :key="row.id" class="mobile-project-entry" :class="{ 'batch-selected': selectionMode && selectedIds.includes(row.id) }">
        <OrderMobileCard
          :selecting="selectionMode"
          :order="row"
          :overdue="!!isOverdue(row)"
          :unread="!!isUnread(row)"
          :action="selectionMode ? null : cardAction(row)"
          :busy="actingId === row.id"
          @open="selectionMode ? toggleSelected(row.id) : openDetail(row)"
          @action="runCardAction(row)"
        >
          <template #tools>
            <el-checkbox v-if="selectionMode" :model-value="selectedIds.includes(row.id)" :disabled="batchBusy" :aria-label="'选择项目 '+row.title" @change="toggleSelected(row.id)"/>
            <el-button v-else link type="primary" @click="openDialog(row)">编辑</el-button>
          </template>
        </OrderMobileCard>
        </div>
        <el-empty v-if="!pagedOrders.length" :description="hasFilter ? '没有符合筛选条件的项目' : '还没有项目'"><el-button v-if="hasFilter" @click="resetFilter">清空筛选</el-button></el-empty>
      </div>
      <div class="list-pager">
        <el-pagination
          v-if="!isMobile"
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :page-sizes="[20, 50, 100]"
          :total="filteredOrders.length"
          layout="total, sizes, prev, pager, next"
          background
        />
        <div v-else-if="filteredOrders.length" ref="listEnd" class="m-total">
          已显示 {{ pagedOrders.length }} / 共 {{ filteredOrders.length }} 单
        </div>
      </div>
    </el-card>

    <el-dialog :model-value="!!focusScope" fullscreen class="board-focus-dialog" title="全屏看板"
      :show-close="false" @update:model-value="v => { if (!v) focusScope = null }">
      <template #header>
        <div class="focus-header"><el-button @click="focusScope=null">返回看板</el-button>
          <h2>{{ focusScope?.title }}</h2><span role="status">{{ focusedRows.length }} 个项目</span></div>
        <div v-if="focusScope" class="focus-tools">
          <el-input v-model="focusScope.keyword" clearable :prefix-icon="Search" aria-label="搜索本组项目" placeholder="搜本组项目、编号、客户"/>
          <button type="button" class="attention-filter" :aria-pressed="focusScope.onlyAttention" title="只看有新提醒或待处理事项的项目"
            @click="focusScope.onlyAttention = !focusScope.onlyAttention">待跟进 {{ focusAttentionCount }}</button>
        </div>
      </template>
      <div v-if="focusScope" ref="focusResults" class="focus-results">
        <div v-if="focusedRows.length" class="focus-grid">
          <article v-for="row in focusedRows" :key="row.id" class="focus-card">
            <button class="focus-open" type="button" @click="openDetail(row)">
              <strong>{{ row.title }}</strong>
              <CustomerWaitBadges :order="row" />
              <span>{{ row.orderNo }} · {{ statusMap[row.status]?.label }} · {{ memberMap[row.ownerId]?.name || '未指派' }}</span>
              <span v-if="hasReminder(row) || (!hasActionBugs(row) && actionLabel(row))" class="priority-label">{{ [hasReminder(row) && '新提醒',!hasActionBugs(row) && actionLabel(row)].filter(Boolean).join(' · ') }}</span>
            </button>
            <ProjectUrgency :order="row" />
            <ProjectHandling :order="row" />
            <div class="focus-actions"><span>{{ money(row.amount) }}</span>
              <button v-if="hasActionBugs(row)" type="button" class="issue-shortcut"
                @click="openActionBugs(row)">处理问题（{{ row.actionBugCount }}）</button>
              <el-button link type="primary" @click="openDialog(row)">编辑</el-button>
            </div>
          </article>
        </div>
        <el-empty v-else :description="focusScope.onlyAttention ? '当前没有需要跟进的项目' : '当前没有符合条件的项目'">
          <el-button v-if="focusScope.keyword || focusScope.onlyAttention" @click="clearFocusFilters">清除本组筛选</el-button>
        </el-empty>
      </div>
    </el-dialog>

    <!-- 新增/编辑弹窗 -->
    <OrderDialog v-model:visible="dialogVisible" :data="editing" :save="handleSave" />

    <!-- 详情抽屉 -->
    <OrderDetail :key="active?.id" v-model:visible="detailVisible" :order="active" :loading="detailLoading" :has-previous="hasPrevious" :has-next="hasNext" @navigate="moveDetail" :notice-tab="noticeTab" :notice-item="noticeItem" :show-handling="route.query.followup === 'manual'" @edit="openDialog" @delete="handleDelete" @notebook="openNotebook" />

    <!-- 项目记事本 -->
    <NotebookDialog v-model:visible="notebookVisible" :order="notebookOrder" />

    <!-- 记收款 -->
    <PaymentDialog v-model:visible="payVisible" :order="payOrder" />

    <!-- 手机列表上点「提交验收 / 验收通过」：走和详情里一样的交付确认 -->
    <DeliveryDialog v-model:visible="deliveryVisible" :order="deliveryOrder" :target="deliveryTarget" />

    <!-- 员工申请改报价 / 取消 / 删除 -->
    <ApprovalRequestDialog v-model:visible="reqVisible" :order="reqOrder" :type="reqType" />
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import draggable from 'vuedraggable'
import { ElMessageBox } from 'element-plus'
import { toast as ElMessage } from '@/utils/toast'
import { Plus, Search, Grid, List, Download, ArrowDown } from '@element-plus/icons-vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import ProjectCover from '@/components/ProjectCover.vue'
import PendingBell from '@/components/PendingBell.vue'
import BoardHeader from '@/components/board/BoardHeader.vue'
import OrderDialog from './components/OrderDialog.vue'
import { useProjectDetail } from '@/utils/useProjectDetail'
import OrderDetail from './components/OrderDetail.vue'
import {waitingReply} from '@/utils/todos'
import CustomerWaitBadges from './components/CustomerWaitBadges.vue'
import OrderMobileCard from './components/OrderMobileCard.vue'
import DeliveryDialog from '@/components/DeliveryDialog.vue'
import { isMyTodo, nextAction, nextDueState, shortDue, stalledDays, reviewIdleDays } from '@/utils/workbench'
import NotebookDialog from '@/components/NotebookDialog.vue'
import PaymentDialog from '@/components/PaymentDialog.vue'
import ApprovalRequestDialog from '@/components/ApprovalRequestDialog.vue'
import AssignMenu from '@/components/AssignMenu.vue'
import { trashWithUndo } from '@/utils/orderUndo'
import { changeOrderStatus } from '@/utils/settle'
import { copyDunning } from '@/utils/customerNudge'
import {
  orders, ordersReady, ordersError, loadOrders, getOrder, createOrder, editOrder, removeOrder, currentMember, isBoss, exportOrders, setStatus, acceptOrder, collab
} from '@/mock/store'
import PendingProjects from './components/PendingProjects.vue'
import ProjectHandling from './components/ProjectHandling.vue'
import ProjectUrgency from './components/ProjectUrgency.vue'
import { readProjectList, saveProjectList } from '@/utils/projectListState'
import { isMobile } from '@/utils/useMobile'
import { todayStr as todayLocal } from '@/utils/date'
import { PAY_STATE, payState, payFilterOk, owed, money } from '@/utils/payment'
import {
  STATUS, CHANNEL, MEMBERS, KANBAN_STATUS,
  statusMap, channelMap, priorityMap, memberMap
} from '@/constants/options'

defineOptions({
  beforeRouteEnter(to, from) {
    // A chart or workbench shortcut starts a fresh result set, even if its filter
    // happens to equal the one previously used with a date range or later page.
    to.meta.orderDrilldown = from.name === 'Dashboard' || from.name === 'Workbench'
  }
})

// 记住上次用的是看板还是列表
const VIEW_KEY = 'xc.orderView'
const readView = () => {
  try {
    return localStorage.getItem(VIEW_KEY) || (window.innerWidth <= 768 ? 'list' : 'kanban')
  } catch (e) {
    return 'kanban'
  }
}
const viewMode = ref(readView())
watch(viewMode, (v) => {
  try {
    localStorage.setItem(VIEW_KEY, v)
  } catch (e) {
    // 存不了就算了，只是下次不记得
  }
})
const route = useRoute()
const router = useRouter()
const memberId = currentMember.value.id
const savedList = readProjectList(memberId)
const queryKeys = ['status', 'owner', 'q', 'channel']
const queryText = value => typeof value === 'string' ? value : ''
function readQuery(query) {
  return {
    status: queryText(query.status) || 'all', owner: Number(queryText(query.owner)) || '',
    q: queryText(query.q), channel: queryText(query.channel)
  }
}
const hasUrlFilters = queryKeys.some(key => route.query[key] !== undefined)
const initial = hasUrlFilters ? readQuery(route.query) : {status:'all', owner:'', q:'', channel:'', ...savedList.filters}
const sameFilters = !hasUrlFilters || (!route.meta.orderDrilldown && queryKeys.every(key => initial[key] === savedList.filters?.[key]))
const filter = reactive({ keyword: initial.q, channel: initial.channel, ownerId: initial.owner, status:'', paid:'', overdueOnly:false })
const createRange = ref(sameFilters ? savedList.createRange || null : null)
setQuick(initial.status)
// ---- 一键筛选条 ----
// 「看什么」互斥：全部 / 各状态 / 已逾期 / 还欠款；「看谁的」是另一个维度，可以叠加
const quick = computed(() => (filter.overdueOnly ? 'overdue' : filter.paid === '0' ? 'owing' : filter.status || 'all'))
function setQuick(key) {
  filter.status = ''
  filter.overdueOnly = false
  filter.paid = ''
  if (key === 'overdue') filter.overdueOnly = true
  else if (key === 'owing') filter.paid = '0'
  else if (key !== 'all') filter.status = key
}
const scopedOrders = computed(() => matchingOrders.value.filter((o) => !filter.ownerId || o.ownerId === filter.ownerId))
const quickCounts = computed(() => {
  const c = { all: 0, waiting: 0, urgent: 0, overdue: 0, owing: 0, pending: 0, doing: 0, review: 0, done: 0, cancelled: 0 }
  for (const o of scopedOrders.value) {
    if (matchesGroup(o, 'all')) c.all++
    if (matchesGroup(o, 'waiting')) c.waiting++
    if (c[o.status] !== undefined) c[o.status]++
    if (o.urgentUntil) c.urgent++
    if (isOverdue(o)) c.overdue++
    if (payFilterOk(o, '0')) c.owing++
  }
  return c
})
const QUICK = computed(() => {
  const list = [
    { key: 'all', label: '全部' },
    { key: 'waiting', label: '客户在等' },
    { key: 'urgent', label: '加急', warn: true },
    { key: 'pending', label: '待确认' },
    { key: 'doing', label: '进行中' }
  ]
  // 一个人用时没有“验收”这一步；有员工、或确实有待验收的单子时才显示
  if (MEMBERS.length > 1 || quickCounts.value.review > 0) list.push({ key: 'review', label: '待验收' })
  list.push(
    { key: 'overdue', label: '已逾期', warn: true },
    { key: 'owing', label: '还欠款', warn: true },
    { key: 'done', label: '已完成' }
  )
  if (quickCounts.value.cancelled || quick.value === 'cancelled') list.push({key:'cancelled', label:statusMap.cancelled.label})
  return list
})
const showPeople = computed(() => isBoss.value && MEMBERS.length > 1)
const people = computed(() => {
  const counts = new Map()
  for (const row of matchingOrders.value) {
    if (matchesGroup(row, quick.value)) counts.set(row.ownerId, (counts.get(row.ownerId) || 0) + 1)
  }
  return MEMBERS.map(m => ({m, count: counts.get(m.id) || 0}))
})
// 「看谁的」最多直接摆 8 个：自己、正在看的那位、手上单子最多的人优先；其余放进下拉
const PEOPLE_CHIPS = 8
const visiblePeople = computed(() => {
  if (people.value.length <= PEOPLE_CHIPS) return people.value
  const rank = (p) => (p.m.id === filter.ownerId ? 2e6 : 0) + (p.m.id === currentMember.value.id ? 1e6 : 0) + p.count
  const keep = new Set([...people.value].sort((a, b) => rank(b) - rank(a)).slice(0, PEOPLE_CHIPS).map((p) => p.m.id))
  return people.value.filter((p) => keep.has(p.m.id))
})
const hiddenPeople = computed(() => people.value.filter((p) => !visiblePeople.value.includes(p)))

const todayStr = todayLocal()
const isOverdue = (o) =>
  ['pending', 'doing', 'review'].includes(o.status) && o.deadline && o.deadline < todayStr

// 卡片上日期只留 月-日（今年的），省地方；鼠标放上去能看完整日期
const shortDate = (d) => (!d ? '无' : d.startsWith(String(new Date().getFullYear())) ? d.slice(5) : d)

const channelStyle = (val) => {
  const c = channelMap[val]
  return c ? { color: c.color, borderColor: c.color } : {}
}

// 当前角色是否对该单有未读新动态
const isUnread = (o) => o.unread?.includes(currentMember.value.id)

function hasActionBugs(row) {
  return !['done','cancelled'].includes(row.status) && Number(row.actionBugCount) > 0
}
function openActionBugs(row) {
  openDetail(row, 'bugs', { todo: '1' })
}
function actionLabel(order) {
  if (['done','cancelled'].includes(order.status)) return ''
  if (Number(order.actionBugCount) > 0) return order.actionBugCount + ' 条需处理'
  if (isBoss.value && Number(order.pendingApprovals) > 0) return '待审批'
  if (!isMyTodo(order,currentMember.value.id)) return ''
  if (order.nextStep && order.nextOwnerId === currentMember.value.id) return '待办下一步'
  return order.assignState === 'pending' ? '待接收' : '待验收'
}
const hasReminder = row => !!(isUnread(row) || row.myMention)
function prioritizeRows(rows) {
  const attention = [], remaining = []
  for (const row of rows) {
    if (hasReminder(row) || actionLabel(row)) attention.push(row)
    else remaining.push(row)
  }
  const activity = row => String(row.updateTime || row.createTime || '')
  attention.sort((a,b) => activity(b).localeCompare(activity(a)))
  // Reserve the second slot for the other kind when both kinds are waiting.
  if (attention.length > 2) {
    const [first] = attention
    const otherKind = hasReminder(first) ? actionLabel : hasReminder
    if (!otherKind(first)) {
      const index = attention.findIndex(otherKind)
      if (index > 1) attention.splice(1,0,attention.splice(index,1)[0])
    }
  }
  return attention.concat(remaining)
}
const matchingOrders = computed(() =>
  orders.filter((o) => {
    if (filter.channel && o.channel !== filter.channel) return false
    if (createRange.value) {
      const day = String(o.createTime || '').slice(0, 10)
      if (day < createRange.value[0] || day > createRange.value[1]) return false
    }
    return matchesKeyword(o, filter.keyword.trim().toLowerCase())
  })
)

function matchesKeyword(order, term) {
  if (!term) return true
  return [order.title, order.customer, order.orderNo, order.contact, order.requirement]
    .join(' ').toLowerCase().includes(term)
}

// 「全部」平时不含待确认（那一堆是还没接的单）；但在搜索时不分状态都算进来：
// 以前在列表里搜一个待确认的项目，会显示「没有符合筛选条件的项目」，要自己去点「待确认」才找得到
const searching = computed(() => !!filter.keyword.trim())
function matchesGroup(order, key, anyStatus = searching.value) {
  if (key === 'all') return anyStatus || order.status !== 'pending'
  if (key === 'waiting') return waitingReply(order) || Number(order.newBugCount) > 0
  if (key === 'overdue') return isOverdue(order)
  if (key === 'urgent') return !!order.urgentUntil
  if (key === 'owing') return payFilterOk(order, '0')
  return order.status === key
}
function groupRows(key, ownerId, anyStatus = searching.value) {
  return matchingOrders.value.filter(row => (!ownerId || row.ownerId === ownerId) && matchesGroup(row,key,anyStatus))
}
const sortChoices = [
  {value:'',label:'默认排序'}, {value:'deadline:ascending',label:'截止最早优先'}, {value:'deadline:descending',label:'截止最晚优先'},
  {value:'amount:descending',label:'报价从高到低'}, {value:'amount:ascending',label:'报价从低到高'},
  {value:'owed:descending',label:'欠款从多到少'}, {value:'owed:ascending',label:'欠款从少到多'}
]
const sortKey = ref(sameFilters && sortChoices.some(s => s.value === savedList.sortKey) ? savedList.sortKey : '')
const groupSort = {owing:'owed:descending', overdue:'deadline:ascending'}
const effectiveSort = computed(() => sortKey.value || groupSort[quick.value] || '')
const tableSort = computed(() => {
  const [prop, order] = effectiveSort.value.split(':')
  return {prop, order}
})
const listTable = ref(null)
function setTableSort({prop, order}) {
  const key = order ? prop + ':' + order : ''
  if (key !== effectiveSort.value) sortKey.value = key
  if (!key && groupSort[quick.value]) nextTick(() => {
    const {prop, order} = tableSort.value
    listTable.value?.sort(prop, order)
  })
}
watch(tableSort, ({prop, order}) => {
  if (prop) listTable.value?.sort(prop, order)
  else listTable.value?.clearSort()
}, {flush:'post'})
function sortRows(input, sorting) {
  const rows = prioritizeRows(input)
  if (!sorting) return rows
  const [prop, order] = sorting.split(':')
  const dir = order === 'ascending' ? 1 : -1
  const value = prop === 'owed' ? owed : row => Number(row.amount) || 0
  return rows.sort((a,b) => {
    if (prop === 'deadline') {
      if (!a.deadline || !b.deadline) return Number(!a.deadline) - Number(!b.deadline)
      return dir * a.deadline.localeCompare(b.deadline)
    }
    return dir * (value(a) - value(b))
  })
}
const filteredOrders = computed(() => sortRows(groupRows(quick.value, filter.ownerId), effectiveSort.value))
const focusScope = ref(null)
const focusResults = ref(null)
const focusMatches = computed(() => {
  const scope = focusScope.value
  if (!scope) return []
  const term = scope.keyword.trim().toLowerCase()
  // 分组页自己的搜索框里有字时也一样：「全部」里能搜到待确认的项目
  return groupRows(scope.key, scope.ownerId, searching.value || !!term)
    .filter(row => (!scope.extra || matchesGroup(row, scope.extra)) && matchesKeyword(row, term))
})
const needsAttention = row => hasReminder(row) || !!actionLabel(row)
const focusAttentionCount = computed(() => focusMatches.value.filter(needsAttention).length)
const focusedRows = computed(() => sortRows(
  focusScope.value?.onlyAttention ? focusMatches.value.filter(needsAttention) : focusMatches.value,
  groupSort[focusScope.value?.key] || groupSort[focusScope.value?.extra]
))
function clearFocusFilters() {
  focusScope.value.keyword = ''
  focusScope.value.onlyAttention = false
}
watch([() => focusScope.value?.keyword, () => focusScope.value?.onlyAttention], () => {
  if (focusResults.value) focusResults.value.scrollTop = 0
}, { flush:'post' })
function chooseGroup(key, fromColumn=false) {
  if (key === 'waiting' || (quick.value === 'waiting' && !fromColumn) || viewMode.value !== 'kanban' || selectionMode.value) { setQuick(key); return }
  if (!ordersReady.value) return
  focusScope.value = { key, keyword:'', onlyAttention:false, ownerId:filter.ownerId, extra:fromColumn && quick.value !== 'all' ? quick.value : null,
    title:QUICK.value.find(group=>group.key===key)?.label || statusMap[key]?.label }
}
function chooseOwner(id) {
  if (quick.value === 'waiting' || viewMode.value !== 'kanban' || selectionMode.value) { filter.ownerId=id; return }
  if (!ordersReady.value) return
  focusScope.value = { key:quick.value, keyword:'', onlyAttention:false, ownerId:id, title:id ? memberMap[id]?.name : '所有人' }
}

const hasFilter = computed(
  () =>
    !!(filter.keyword || filter.channel || filter.ownerId || filter.status || filter.paid ||
       filter.overdueOnly || createRange.value)
)
function resetFilter() {
  Object.assign(filter, { keyword: '', channel: '', ownerId: '', status: '', paid: '', overdueOnly: false })
  createRange.value = null
  sortKey.value = ''
}

// ---- 手机端工具栏 ----
// 渠道 / 创建日期 / 导出 收在「筛选」里，默认收起；渠道或日期有设置时，「筛选」按钮上亮一个小红点
const filterOpen = ref(false)
const moreFilterCount = computed(() => (filter.channel ? 1 : 0) + (createRange.value ? 1 : 0))
// 日期范围选择器的弹层有 646px 宽，手机上放不下：手机上改用“开始 / 结束”两个单日选择器，
// 结果仍然写进同一个 createRange。只选一个就当“只看那一天”；选反了自动对齐；清掉任何一个就整段清空
function setRangeEdge(edge, v) {
  if (!v) {
    createRange.value = null
    return
  }
  const cur = createRange.value || [v, v]
  let s = edge === 0 ? v : cur[0]
  let e = edge === 1 ? v : cur[1]
  if (s > e) {
    if (edge === 0) e = s
    else s = e
  }
  createRange.value = [s, e]
}
const rangeStart = computed({
  get: () => createRange.value?.[0] || null,
  set: (v) => setRangeEdge(0, v)
})
const rangeEnd = computed({
  get: () => createRange.value?.[1] || null,
  set: (v) => setRangeEdge(1, v)
})
// 手机上看板：按住卡片一会儿才开始拖，手指一划就是左右翻列 / 上下滚动，不会误拖（电脑不受影响）
const dragOpts = computed(() => (isMobile.value ? { delay: 220, delayOnTouchOnly: true, touchStartThreshold: 12 } : {}))

// 列表视图分页：项目多了也只渲染当前页
const page = ref(sameFilters ? Math.max(1, Number(savedList.page) || 1) : 1)
const pageSize = ref([20, 50, 100].includes(savedList.pageSize) ? savedList.pageSize : 20)
const mobileLimit = ref(sameFilters ? Math.max(20, Number(savedList.mobileLimit) || 20) : 20)
const pagedOrders = computed(() => {
  if (isMobile.value) return filteredOrders.value.slice(0, mobileLimit.value)
  const start = (page.value - 1) * pageSize.value
  return filteredOrders.value.slice(start, start + pageSize.value)
})
watch([filter, createRange, pageSize, sortKey], () => { page.value = 1; mobileLimit.value = 20 }, {deep:true})
const pageEl = ref(null)
const listEnd = ref(null)
watch(listEnd, (el, old, cleanup) => {
  if (!el) return
  const observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && mobileLimit.value < filteredOrders.value.length) mobileLimit.value += 20
  }, {root: pageEl.value?.closest('.main'), rootMargin:'0px 0px 200px'})
  observer.observe(el)
  cleanup(() => observer.disconnect())
}, {flush:'post'})

const urlFilters = computed(() => ({status:quick.value, owner:filter.ownerId, q:filter.keyword, channel:filter.channel || ''}))
function syncQuery() {
  if (route.path !== '/order') return
  const query = { ...route.query }
  for (const [key, value] of Object.entries(urlFilters.value)) {
    if (!value || (key === 'status' && value === 'all')) delete query[key]
    else query[key] = String(value)
  }
  if (queryKeys.some(key => query[key] !== route.query[key])) router.replace({query})
}
watch(urlFilters, syncQuery)
watch(() => queryKeys.map(key => route.query[key]), (value, prior) => {
  if (route.path !== '/order' || value.every((v,i) => v === prior[i])) return
  const fields = readQuery(route.query)
  if (queryKeys.every(key => fields[key] === urlFilters.value[key])) return
  setQuick(fields.status)
  createRange.value = null
  sortKey.value = ''
  Object.assign(filter, {ownerId:fields.owner, keyword:fields.q, channel:fields.channel})
})
const mainScroll = () => pageEl.value?.closest('.main')
let savedScroll = sameFilters ? savedList.scroll : null
function saveList() {
  if (!memberId || currentMember.value.id !== memberId) return
  const board = pageEl.value?.querySelector('.kanban')
  const scroll = {
    top: mainScroll()?.scrollTop || 0, left:board?.scrollLeft || 0,
    columns:Array.from(board?.querySelectorAll('.col-body') || [], el => el.scrollTop)
  }
  saveProjectList(memberId, {filters:urlFilters.value, createRange:createRange.value, page:page.value,
    pageSize:pageSize.value, mobileLimit:mobileLimit.value, sortKey:sortKey.value, scroll:savedScroll || scroll})
}
async function restoreListPosition() {
  if (!savedScroll || !ordersReady.value || !pageEl.value) return
  await nextTick()
  // Element Table measures columns before its rows contribute to the scroll height.
  await new Promise(requestAnimationFrame)
  await new Promise(requestAnimationFrame)
  if (!savedScroll || !pageEl.value) return
  const main = mainScroll()
  if (main) main.scrollTop = savedScroll.top
  const board = pageEl.value.querySelector('.kanban')
  if (board) {
    board.scrollLeft = savedScroll.left
    board.querySelectorAll('.col-body').forEach((el, i) => { el.scrollTop = savedScroll.columns?.[i] || 0 })
  }
  savedScroll = null
}
onBeforeRouteLeave(saveList)
onMounted(() => {
  if (!hasUrlFilters && !route.query.id) syncQuery()
  restoreListPosition()
  window.addEventListener('pagehide',saveList)
})
onBeforeUnmount(() => window.removeEventListener('pagehide',saveList))
watch(ordersReady, restoreListPosition, {flush:'post'})
watch([urlFilters,createRange,pageSize,page,mobileLimit,sortKey], saveList, {deep:true})
// 删除/恢复后总数变少，页码不能停在已经没有数据的位置
watch(
  () => filteredOrders.value.length,
  (n) => {
    if (!ordersReady.value) return
    const maxPage = Math.max(1, Math.ceil(n / pageSize.value))
    if (page.value > maxPage) page.value = maxPage
  }
)

// 看板分列：已完成越积越多，只显示最近的一部分，完整的在列表里看
// 每列最多先画 50 张（已完成 30 张），再多点列头看全部：单子多了打开看板也不卡
const boardStatuses = [...KANBAN_STATUS, 'cancelled']
const KANBAN_LIMIT = { pending: 50, doing: 50, review: 50, done: 30, cancelled: 30 }
const columns = reactive(Object.fromEntries(boardStatuses.map(s => [s, []])))
const columnTotals = reactive(Object.fromEntries(boardStatuses.map(s => [s, 0])))
const draggingOrder = ref(null)
const visibleColumns = computed(() => {
  const overview = boardStatuses.filter(s => s !== 'cancelled' || columnTotals[s] > 0)
  if (!hasFilter.value) return overview
  const matching = overview.filter(s => columnTotals[s] > 0)
  return draggingOrder.value ? [...matching, ...overview.filter(s => !matching.includes(s))] : matching
})
const selectionMode = ref(false)
// 总览的待确认列也支持多选；项目总数和「全部」明细由 matchesGroup 单独计算。
const boardRows = computed(() => !hasFilter.value
  ? scopedOrders.value
  : groupRows(quick.value, filter.ownerId))
function rebuild() {
  boardStatuses.forEach((s) => {
    const all = prioritizeRows(boardRows.value.filter(o => o.status === s))
    columnTotals[s] = all.length
    columns[s] = KANBAN_LIMIT[s] ? all.slice(0, KANBAN_LIMIT[s]) : all
  })
}
// 只在“哪些单、在哪一列、什么顺序”变了时才重新分列。
// 以前是 deep watch：打开详情 / 后台同步把时间线、Bug 合并进项目，也会把整个看板重画一遍，点开详情明显发卡。
// 卡片上的金额、标题等字段本身是响应式的，不需要重新分列也会更新。
const columnKey = computed(() => boardRows.value
  .map(o => [o.id,o.status,hasReminder(o),actionLabel(o),(hasReminder(o) || actionLabel(o)) && o.updateTime].join(':')).join(','))
watch(columnKey, rebuild, { immediate: true })

// Selection is scoped to displayed cards/page; filters never leave hidden selections.
const selectedIds = ref([])
const batchStatus = ref('')
const batchBusy = ref(false)
const batchErrors = ref([])
const batchStatuses = computed(() => STATUS.filter(s => isBoss.value || ['pending','doing','review'].includes(s.value)))
const visibleSelectionOrders = computed(() => viewMode.value === 'kanban' ? visibleColumns.value.flatMap(st => columns[st]) : pagedOrders.value)
const allVisibleSelected = computed(() => visibleSelectionOrders.value.length > 0 && visibleSelectionOrders.value.every(o => selectedIds.value.includes(o.id)))
function toggleSelection() {
  if (batchBusy.value) return
  selectionMode.value = !selectionMode.value
  batchStatus.value = ''
  selectedIds.value = []
  batchErrors.value = []
}
function toggleSelected(id) {
  if (batchBusy.value) return
  selectedIds.value = selectedIds.value.includes(id) ? selectedIds.value.filter(x => x !== id) : [...selectedIds.value,id]
}
function selectVisible(checked) { if (!batchBusy.value) selectedIds.value = checked ? visibleSelectionOrders.value.map(o => o.id) : [] }
watch([filter,createRange,page,pageSize,viewMode], () => { selectedIds.value = [] }, {deep:true})
// Membership can also change on a background refresh while selecting.
watch([visibleSelectionOrders, batchBusy], ([visible, busy]) => {
  if (busy || !selectedIds.value.length) return
  const ids = new Set(visible.map(row => row.id))
  selectedIds.value = selectedIds.value.filter(id => ids.has(id))
})
watch(() => currentMember.value.id, () => { selectedIds.value = []; selectionMode.value = false })
async function applyBatchStatus() {
  if (batchBusy.value || !selectedIds.value.length || !batchStatus.value) return
  const target = batchStatus.value
  const rows = visibleSelectionOrders.value.filter(o => selectedIds.value.includes(o.id)).map(o => ({...o}))
  if (!rows.length) return
  batchBusy.value = true
  try {
    await ElMessageBox.confirm(`将选中的 ${rows.length} 个项目设为「${statusMap[target].label}」。${target === 'done' ? '收款记录不会自动变动，未收款请另行登记。' : ''}`, '批量修改状态', {confirmButtonText:'确认修改',cancelButtonText:'取消',type:'warning'})
    let success = 0
    const failures = []
    batchErrors.value = []
    for (const row of rows) {
      try { if (row.status !== target) await setStatus(row.id,target); success++ }
      catch(e) { failures.push(row.id); batchErrors.value.push(`${row.title}：${e.message || '修改失败'}`) }
    }
    selectedIds.value = failures
    if (failures.length) ElMessage.warning(`已处理 ${success} 项，${failures.length} 项未成功，请查看原因`)
    else ElMessage.success(`已将 ${success} 个项目设为「${statusMap[target].label}」`)
  } catch(e) { if (e !== 'cancel' && e !== 'close') ElMessage.error(e.message || '操作失败') }
  finally { batchBusy.value = false }
}

// 批量改派：和单个改派走同一个接口，对方照样要接收；已完成 / 已取消、本来就在 TA 名下的不动
const assignTargets = computed(() => MEMBERS.filter((m) => m.status === '0'))
const batchAssigning = ref(false)
async function applyBatchAssign(ownerId) {
  if (!isBoss.value || batchBusy.value || !selectedIds.value.length) return
  const rows = visibleSelectionOrders.value.filter(o => selectedIds.value.includes(o.id)).map(o => ({...o}))
  if (!rows.length) return
  const name = ownerId === currentMember.value.id ? '我自己' : memberMap[ownerId]?.name || '对方'
  const movable = rows.filter(row => !['done','cancelled'].includes(row.status) && row.ownerId !== ownerId)
  if (!movable.length) { ElMessage.info(`选中的项目已经在「${name}」名下，或者已经结束，不用改派`); return }
  const skipped = rows.length - movable.length
  batchBusy.value = true
  try {
    await ElMessageBox.confirm(`把选中的 ${movable.length} 个项目派给「${name}」${ownerId === currentMember.value.id ? '。' : '，TA 接收后开工。'}${skipped ? `另外 ${skipped} 个已经结束或本来就在 TA 名下，不动。` : ''}`, '批量改派', {confirmButtonText:'确认改派',cancelButtonText:'取消',type:'warning'})
    batchAssigning.value = true
    let success = 0
    const failures = []
    batchErrors.value = []
    for (const row of movable) {
      try { await editOrder({ id: row.id, ownerId }); success++ }
      catch(e) { failures.push(row.id); batchErrors.value.push(`${row.title}：${e.message || '改派失败'}`) }
    }
    selectedIds.value = failures
    if (failures.length) ElMessage.warning(`已改派 ${success} 项，${failures.length} 项未成功，请查看原因`)
    else ElMessage.success(`已把 ${success} 个项目派给「${name}」`)
  } catch(e) { if (e !== 'cancel' && e !== 'close') ElMessage.error(e.message || '改派失败') }
  finally { batchBusy.value = false; batchAssigning.value = false }
}

async function applyBatchDelete() {
  if (!isBoss.value || batchBusy.value || !selectedIds.value.length) return
  const rows = visibleSelectionOrders.value.filter(o => selectedIds.value.includes(o.id)).map(o => ({...o}))
  if (!rows.length) return
  batchBusy.value = true
  try {
    await ElMessageBox.confirm(`确定删除选中的 ${rows.length} 个项目吗？删除后将移入回收站，可以恢复。`, '批量删除项目', {confirmButtonText:'确认删除',cancelButtonText:'取消',type:'warning'})
    let success = 0
    const failures = []
    batchErrors.value = []
    for (const row of rows) {
      try { await removeOrder(row.id); success++ }
      catch(e) { failures.push(row.id); batchErrors.value.push(`${row.title}：${e.message || '删除失败'}`) }
    }
    selectedIds.value = failures
    if (failures.length) ElMessage.warning(`已删除 ${success} 项，${failures.length} 项未成功，请查看原因`)
    else ElMessage.success(`已将 ${success} 个项目移入回收站`)
  } catch(e) { if (e !== 'cancel' && e !== 'close') ElMessage.error(e.message || '删除失败') }
  finally { batchBusy.value = false }
}

// 导出 Excel：把当前的筛选条件交给服务端，导出结果和屏幕上看到的一致（服务端只会导出你有权看的项目）
const exporting = ref(false)
function exportParams() {
  return {
    keyword: filter.keyword.trim(),
    channel: filter.channel,
    ownerId: filter.ownerId,
    status: quick.value === 'urgent' ? '' : filter.status,
    urgentOnly: quick.value === 'urgent' ? '1' : '',
    // 搜索时「全部」里也有待确认的项目（见 searching），导出要和屏幕上一致
    confirmedOnly: quick.value === 'all' && !searching.value ? '1' : '',
    paid: filter.paid,
    overdue: filter.overdueOnly ? '1' : '',
    createFrom: createRange.value?.[0] || '',
    createTo: createRange.value?.[1] || ''
  }
}
const exportTitle = computed(() => quick.value === 'waiting' ? '客户在等分组暂不支持导出' : '按筛选条件导出，不含列表排序')
async function doExport() {
  if (quick.value === 'waiting') return
  exporting.value = true
  try {
    const name = await exportOrders(exportParams())
    ElMessage.success(`已导出：${name}`)
  } catch (e) {
    ElMessage.error(e.message || '导出失败')
  } finally {
    exporting.value = false
  }
}

let blockedRelease = false
function beginDrag(order) {
  draggingOrder.value = order
  blockedRelease = false
}
function trackDropLocation(event) {
  if (!draggingOrder.value) return
  const point = event.changedTouches?.[0] || event
  const column = document.elementFromPoint(point.clientX, point.clientY)?.closest('[data-column-status]')
  // Sortable keeps the last allowed column when the pointer crosses a forbidden one.
  // Validate the actual release location before persisting its optimistic move.
  blockedRelease = !column || !!dropBlocked(draggingOrder.value, column.dataset.columnStatus)
}
const dropEvents = ['dragover','drop','pointerup','touchend']
onMounted(() => dropEvents.forEach(type => document.addEventListener(type, trackDropLocation, true)))
onBeforeUnmount(() => dropEvents.forEach(type => document.removeEventListener(type, trackDropLocation, true)))
function dropBlocked(row, target) {
  if (!row || row.status === target || isBoss.value) return ''
  if (row.assignState === 'pending') return '请先接收项目'
  if (target === 'done') return '请先提交验收'
  if (target === 'cancelled') return '请先申请取消项目'
  return ''
}
function canDrop(event) {
  const target = event.to?.dataset.status
  return !!target && !dropBlocked(event.draggedContext?.element, target)
}
async function onDragChange(evt, targetStatus) {
  if (!evt.added) return
  const moved = evt.added.element
  if (!moved || moved.status === targetStatus) return
  if (blockedRelease || dropBlocked(moved, targetStatus)) { rebuild(); return }
  try {
    await changeOrderStatus(moved, targetStatus, `「${moved.title}」已移到 ${statusMap[targetStatus].label}`)
  } catch (e) {
    // 服务器没改成功：把卡片放回原来的列，并说清楚
    ElMessage.error((e.message || '修改状态失败') + '，已放回原位')
    rebuild()
  }
}

// 列表里一键改状态（完成 / 更多里的设为…）
async function changeStatus(row, status) {
  try {
    await changeOrderStatus(row, status)
  } catch (e) {
    ElMessage.error(e.message || '修改状态失败')
  }
}

// 卡片上的协作信息：下一步交给谁、停滞了几天
const nextWho = (o) => (o.nextOwnerId === currentMember.value.id ? '我' : o.nextOwnerName || memberMap[o.nextOwnerId]?.name || '负责人')
// 卡片上的「N 天没动静」：待确认 / 进行中，加上交付后一直没人验收的待验收项目
const stalledOf = (o) => stalledDays(o, collab.stallDays) || reviewIdleDays(o, collab.stallDays)

// ---- 手机卡片上的“下一步”按钮：接收 / 开始做 / 完成 / 提交验收 / 验收通过 ----
const actingId = ref(null)
const deliveryVisible = ref(false)
const deliveryOrder = ref(null)
const deliveryTarget = ref('')
function cardAction(row) {
  if (!isBoss.value && row.assignState === 'pending' && row.ownerId === currentMember.value.id) return { kind: 'accept', label: '接收' }
  const na = nextAction(row, currentMember.value.id)
  return na ? { kind: 'status', to: na.to, label: na.label } : null
}
async function finishFromList(row) {
  const target = isBoss.value ? 'done' : 'review'
  if (!Number(row.openBugCount) && !row.bugs?.some(bug => !['resolved','closed'].includes(bug.status))) return changeStatus(row,target)
  if (actingId.value) return
  actingId.value = row.id
  try {
    deliveryOrder.value = await getOrder(row.id)
    deliveryTarget.value = target
    deliveryVisible.value = true
  } catch (e) {
    ElMessage.error(e.message || '加载项目失败')
  } finally { actingId.value = null }
}
async function runCardAction(row) {
  const act = cardAction(row)
  if (!act || actingId.value) return
  actingId.value = row.id
  try {
    if (act.kind === 'accept') {
      await acceptOrder(row.id)
      ElMessage.success(`已接收「${row.title}」，可以开工了`)
    } else if (['review', 'done'].includes(act.to)) {
      // 交付 / 验收要看一眼问题数、可附交付说明：拉完整详情后弹出和详情页同一个确认框
      deliveryOrder.value = await getOrder(row.id)
      deliveryTarget.value = act.to
      deliveryVisible.value = true
    } else {
      await changeStatus(row, act.to)
    }
  } catch (e) {
    ElMessage.error(e.message || '操作失败')
  } finally {
    actingId.value = null
  }
}

function onMore(command, row) {
  if (command === 'notebook') openNotebook(row)
  else if (command === 'edit') openDialog(row)
  else if (command === 'delete') handleDelete(row)
  else if (command.startsWith('status:')) changeStatus(row, command.slice(7))
  else if (command.startsWith('request:')) {
    reqOrder.value = row
    reqType.value = command.slice(8)
    reqVisible.value = true
  }
}

// 员工不能自己把项目标成“已完成 / 已取消”（走提交验收 / 申请），所以“设为…”里不给这两项
const moreStatuses = (row) =>
  STATUS.filter((x) => x.value !== row.status && (isBoss.value || ['pending', 'doing', 'review'].includes(x.value)))
// 老板：没完成的都能一键完成；员工：进行中的能一键提交验收（刚派来还没接收的先去接收）
const canFinish = (row) => {
  if (['done', 'cancelled'].includes(row.status)) return false
  if (isBoss.value) return true
  return row.status === 'doing' && row.assignState !== 'pending'
}
const reqVisible = ref(false)
const reqOrder = ref(null)
const reqType = ref('amount')

// 「还欠款」列表里，老板每行多一个「催款」
const showDun = computed(() => isBoss.value && quick.value === 'owing')

// 收款
const payVisible = ref(false)
const payOrder = ref(null)
function openPay(row) {
  payOrder.value = row
  payVisible.value = true
}
// 看板/列表上的收款小标签：没收 → 未收；收了一部分 → 欠多少；收清 → 已收清；没报价 → 不显示
function payText(o) {
  const st = payState(o)
  if (st === 'none') return '未收'
  if (st === 'part') return '欠' + money(owed(o))
  if (st === 'full') return '已收清'
  return ''
}
// 手机卡片上的收款标签：文字和颜色与桌面列表的「收款」列一致
const payTagOf = (o) => ({
  label: payText(o) || PAY_STATE[payState(o)].label,
  type: PAY_STATE[payState(o)].type
})

// 弹窗 / 抽屉状态
const dialogVisible = ref(false)
const editing = ref(null)
const { active, detailVisible, detailLoading, noticeTab, noticeItem, hasPrevious, hasNext, openDetail, moveDetail } =
  useProjectDetail('/order', () => focusScope.value ? focusedRows.value :
    viewMode.value === 'kanban' ? visibleColumns.value.flatMap(st => columns[st]) : filteredOrders.value)
const notebookVisible = ref(false)
const notebookOrder = ref(null)

function openNotebook(row) {
  notebookOrder.value = row
  notebookVisible.value = true
}

async function openDialog(row) {
  if (!row?.id) {
    editing.value = null
    dialogVisible.value = true
    return
  }
  try {
    editing.value = { ...(await getOrder(row.id)) }
    dialogVisible.value = true
  } catch (e) {
    ElMessage.error('加载项目失败：' + e.message)
  }
}
watch(() => route.query.create, create => {
  if (route.path === '/order' && create === '1') openDialog()
}, { immediate: true })
watch(dialogVisible, shown => {
  if (!shown && route.query.create === '1') {
    const { create, ...query } = route.query
    router.replace({ query })
  }
})

async function handleSave(data) {
  try {
    if (data.id) {
      await editOrder(data)
      ElMessage.success('已更新')
    } else {
      await createOrder(data)
      ElMessage.success('已建单')
    }
    return true
  } catch (e) {
    ElMessage.error(e.message || '保存失败')
    return false
  }
}
async function handleDelete(row) {
  try {
    await trashWithUndo(row)
    detailVisible.value = false
  } catch (e) {
    ElMessage.error(e.message || '删除失败')
  }
}
</script>

<style scoped>
.order-load-state { padding: 24px; background: white; border-radius: 14px; }
.order-load-state [role="alert"] { display:flex; align-items:center; gap:12px; }
.kanban .drop-allowed { outline:2px solid #80aaff; outline-offset:-2px; background:#edf4ff; }
.kanban .drop-blocked { opacity:.56; }
.drop-reason { margin-left:auto; padding:0 4px; color:#78400a; font-size:12px; }
@media (max-width: 768px) {
  .order-page .board-header { min-height:54px; padding:10px 6px; }
  .order-page .board-project-tools { gap:7px; margin-bottom:10px; }
  .compact-search { display:flex; gap:6px; align-items:center; }
  .compact-search > .el-input { flex:1; min-width:0; }
  .compact-search .board-filter-row { width:auto; flex:none; gap:4px; }
  .compact-search .board-filter-row .el-button { flex:none; padding:0 8px; }
  .order-page .quick-bar { padding:8px; }
  .list-pager .m-total { text-align:center; width:100%; }
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 14px;
}
.toolbar .right {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
/* 「筛选」点开后多出的一行：渠道 + 创建日期 */
.toolbar-extra {
  flex-basis: 100%;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}
.extra-label { font-size: 13px; color: #606266; }
.m-filters { display: grid; gap: 8px; }
.m-filters > .el-select { width: 100%; }

/* 看板 */
.kanban {
  display: flex;
  gap: 14px;
  overflow-x: auto;
  padding-bottom: 8px;
  align-items: flex-start;
}
.kanban-col {
  flex: 1;
  min-width: 250px;
  background: #f4f5f7;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 170px);
}
.col-header {
  border:0;width:100%;cursor:pointer;color:inherit;font:inherit;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-top: 3px solid #ccc;
  border-radius: 8px 8px 0 0;
  background: #fff;
}
.col-title {
  font-weight: 600;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}
.col-count {
  background: #e4e7ed;
  color: #606266;
  border-radius: 10px;
  font-size: 12px;
  padding: 1px 9px;
}
.col-more {
  padding: 6px 12px;
  font-size: 12px;
  color: #909399;
  background: #fafafa;
  border-bottom: 1px solid #ebeef5;
}
.list-pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}
.col-body {
  padding: 10px;
  overflow-y: auto;
  flex: 1;
  min-height: 80px;
}
.card {
  position: relative;
  background: #fff;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 10px;
  cursor: pointer;
  border-left: 3px solid transparent;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  transition: box-shadow 0.15s, transform 0.15s;
}
@media (min-width: 769px) {
  .kanban .card {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-content: start;
    row-gap: 6px;
    padding: 12px 14px;
  }
  .kanban .card > :is(.card-top, .card-title, .card-flags, .card-next, .card-customer, .issue-shortcut) {
    margin-block: 0;
  }
  .kanban .card > .issue-shortcut {
    justify-self: start;
  }
  .kanban .card-foot {
    margin-top: 2px;
    flex-wrap: wrap;
    row-gap: 4px;
  }
}
.card.unread {
  border-left-color: #f56c6c;
  box-shadow: 0 0 0 1px #fde2e2, 0 1px 3px rgba(0, 0, 0, 0.08);
}
.new-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  background: #f56c6c;
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 8px;
  z-index: 2;
}
.img-flag {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-left: 6px;
  color: #409eff;
}
.rev-flag {
  margin-left: 6px;
  background: #fef0f0;
  color: #f56c6c;
  font-size: 11px;
  border-radius: 4px;
  padding: 0 5px;
}
.dot-unread {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #f56c6c;
  margin-right: 5px;
  vertical-align: middle;
}
.inline-pic {
  color: #409eff;
  vertical-align: -2px;
  margin-left: 4px;
}
.card:hover {
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.14);
  transform: translateY(-1px);
}
.card.overdue {
  border-left-color: #f56c6c;
}
.card-top {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}
.order-no {
  font-size: 12px;
  color: #c0c4cc;
}
.prio {
  margin-left: auto;
  color: #fff;
  font-size: 11px;
  border-radius: 4px;
  padding: 1px 6px;
}
.card-title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
  margin-bottom: 6px;
  color: #303133;
}
.card-customer {
  font-size: 12px;
  color: #909399;
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 10px;
}
.card-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #909399;
}
.card-foot .deadline {
  display: flex;
  align-items: center;
  gap: 3px;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.card-foot .deadline.red {
  color: #f56c6c;
  font-weight: 600;
}
.card-foot .amount {
  margin-left: auto;
  color: #e6a23c;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}
.pay-flag {
  font-style: normal;
  font-size: 11px;
  font-weight: 500;
  border-radius: 4px;
  padding: 0 5px;
  margin-left: 4px;
}
.pay-flag.none {
  color: #f56c6c;
  background: #fef0f0;
}
.pay-flag.part {
  color: #e6a23c;
  background: #fdf6ec;
}
.pay-flag.full {
  color: #67c23a;
  background: #f0f9eb;
}
.pay-tag {
  cursor: pointer;
}
.quick-bar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}
.chip-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.chip-label {
  width: 48px;
  font-size: 12px;
  color: #909399;
}
.qchip {
  font: inherit;
  line-height: 1.5;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border: 1px solid #dcdfe6;
  border-radius: 16px;
  background: #fff;
  font-size: 13px;
  color: #606266;
  cursor: pointer;
  user-select: none;
  transition: all 0.15s;
}
.qchip b {
  font-size: 12px;
  font-weight: 600;
  color: #909399;
}
.qchip:hover {
  border-color: #409eff;
}
.qchip.on {
  background: #ecf5ff;
  border-color: #409eff;
  color: #409eff;
}
.qchip.on b {
  color: #409eff;
}
.qchip.warn b {
  color: #f56c6c;
}
.card-flags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin: -2px 0 8px;
}
.flag {
  font-size: 11px;
  border-radius: 4px;
  padding: 0 6px;
  line-height: 18px;
}
.flag.amber {
  color: #e6a23c;
  background: #fdf6ec;
}
.flag.red {
  color: #f56c6c;
  background: #fef0f0;
}
.who {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* 负责人一行放下，名字长就省略，不再把行撑成两行 */
:deep(.nowrap-col .cell) { white-space: nowrap; }
:deep(.owner-col .el-dropdown),
:deep(.owner-col .assign-trigger) { font-size: inherit; line-height: inherit; vertical-align: middle; max-width: 100%; }
:deep(.owner-col .cell) { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.unpriced { color: #a8b3c4; font-style: normal; font-weight: 400; }
.who:hover {
  color: #409eff;
}
.scope-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: -4px 0 12px;
  font-size: 13px;
  color: #909399;
}
.owner-name {
  color: #606266;
  max-width: 64px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 0;
}
.ghost {
  opacity: 0.4;
  background: #ecf5ff;
}
.red-text {
  color: #f56c6c;
  font-weight: 600;
}
.list-card {
  border-radius: 8px;
}

/* ---- 手机端（<= 768px，和 layout / useMobile 的断点一致）---- */
/* 工具栏：只在手机上渲染 */
.m-toolbar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 10px;
}
.m-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.m-new {
  flex: 1;
  min-width: 0;
  padding-left: 12px;
  padding-right: 12px;
}
.m-view {
  flex: none;
}
.m-view :deep(.el-radio-button__inner) {
  padding-left: 14px;
  padding-right: 14px;
}
.m-filter-btn {
  position: relative;
  flex: none;
  padding-left: 14px;
  padding-right: 14px;
}
/* 筛选里有设置时的小红点 */
.m-dot {
  position: absolute;
  top: 5px;
  right: 5px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #f56c6c;
  box-shadow: 0 0 0 2px #fff;
}
.m-filters {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  background: #fff;
}
.m-f-label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  color: #909399;
}
.m-dates {
  display: flex;
  align-items: center;
  gap: 6px;
}
.m-sep {
  flex: none;
  font-size: 13px;
  color: #909399;
}
.m-f-btns {
  display: flex;
  align-items: center;
  gap: 12px;
}
.m-f-btns :deep(.el-button + .el-button) {
  margin-left: 0;
}
/* 列表：一单一张卡片 */
.m-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.m-total {
  font-size: 13px;
  color: #909399;
}

@media (max-width: 768px) {
  /* 一键筛选：每一行只占一行，左右滑动；左边的小标题固定不动 */
  .chip-row {
    flex-wrap: nowrap;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  .chip-row::-webkit-scrollbar {
    display: none;
  }
  .chip-label {
    flex: none;
    position: sticky;
    left: 0;
    z-index: 1;
    background: #f0f2f5;
  }
  .qchip {
    flex: none;
    white-space: nowrap;
    padding: 6px 12px;
  }
  .scope-hint {
    font-size: 12px;
    margin-bottom: 10px;
  }

  /* 看板：每列约 85% 屏宽，一列一列吸附着滑；列自己在屏幕高度内上下滚 */
  .kanban {
    gap: 10px;
    scroll-snap-type: x mandatory;
    -webkit-overflow-scrolling: touch;
  }
  .kanban-col {
    flex: 0 0 auto;
    min-width: 0;
    width: 85vw;
    width: min(85vw, 320px);
    scroll-snap-align: start;
    max-height: calc(100vh - 260px);
    max-height: max(280px, calc(100dvh - 260px));
  }

  /* 列表：去掉外面的白框，卡片直接铺开 */
  .list-card {
    border: 0;
    background: transparent;
  }
  .list-card :deep(.el-card__body) {
    padding: 0;
  }
  .list-pager {
    flex-direction: column;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
  }
}
.issue-shortcut{display:inline-flex;align-items:center;min-height:30px;padding:3px 10px;border:1px solid #f1cfab;border-radius:8px;background:#fff8ee;color:#904308;cursor:pointer;font:inherit;font-size:13px;font-weight:600}
.focus-tools {display:flex;align-items:center;gap:8px;margin-top:10px}
.focus-tools .el-input {max-width:420px;min-width:0}
.attention-filter {flex:none;min-height:34px;padding:0 12px;border:1px solid #d8e2ee;border-radius:8px;background:white;color:#445773;font:inherit;font-size:13px;cursor:pointer}
.attention-filter[aria-pressed="true"] {border-color:#165dff;background:#eaf1ff;color:#164ec2}
.focus-results {min-height:0;overflow:auto;overscroll-behavior:contain;flex:1;padding:2px}
.project-title-button {border:0;background:none;padding:0;text-align:inherit;font:inherit;color:inherit;cursor:pointer;overflow-wrap:anywhere}
.project-title-button:focus-visible, .attention-filter:focus-visible {outline:2px solid #165dff;outline-offset:2px}
.card.batch-selected,.mobile-project-entry.batch-selected :deep(.board-project-row) {box-shadow:inset 0 0 0 2px #477dff;background:#f3f7ff}
.issue-shortcut:hover,.issue-shortcut:focus-visible{background:#ffecd6}
.card>.issue-shortcut{margin-top:7px}
.focus-actions:has(.issue-shortcut){flex-wrap:wrap;gap:6px}
.action-badge{background:#b55410}.focus-header,.focus-actions{display:flex;align-items:center;gap:12px}.focus-header h2{margin:0;font-size:21px}.focus-header>span,.focus-open>span{font-size:13px;color:#64758a}.focus-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,235px),1fr));gap:12px;align-content:start}.focus-card{display:grid;align-content:space-between;background:white;border:1px solid #dfe7f3;border-radius:12px;min-width:0;padding:12px 14px}.focus-open{border:0;background:none;text-align:left;cursor:pointer;color:inherit;padding:0;display:grid;gap:7px;width:100%;overflow-wrap:anywhere}.focus-open strong{font-size:16px}.focus-open .priority-label{color:#b34c0d}.focus-actions{justify-content:space-between;margin-top:8px;color:#385477}.order-page .board-kanban-counts>button{border:0;cursor:pointer;font:inherit}

</style>
<style>
.el-dialog.board-focus-dialog.is-fullscreen{width:100%!important;max-width:none!important;height:100vh;height:100dvh;min-height:0;margin:0!important;padding:clamp(10px,2vw,24px);display:flex;flex-direction:column;border-radius:0;background:#f4f7fc;overflow:hidden}
.el-dialog.board-focus-dialog>.el-dialog__header{padding:0 0 12px;background:transparent;flex:none}
.el-dialog.board-focus-dialog>.el-dialog__body{display:flex;flex-direction:column;min-height:0;overflow:hidden;flex:1}
</style>

<style scoped>
.project-batch-bar {display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 16px;background:#fff;border:1px solid #e5edff;border-radius:12px;margin:12px 0;flex-shrink:0;}
.batch-errors {flex-basis:100%;color:#c0392b;margin:0;font-size:13px;overflow-wrap:anywhere;}
.card-controls {display:flex;justify-content:flex-end;min-height:26px;margin-bottom:6px;}
/* 电脑看板：「编辑」不再单独占一行，鼠标移到卡片上才浮出来；多选时勾选框一直显示 */
@media (min-width:769px){
  .card-controls {position:absolute;top:6px;right:8px;z-index:2;min-height:0;margin:0;padding:0 6px;background:#fff;border-radius:6px;box-shadow:0 0 0 4px #fff;opacity:0;transition:opacity .15s;}
  .card:hover .card-controls,.card:focus-within .card-controls,.card.selecting .card-controls {opacity:1;}
}
.mobile-project-entry {position:relative;}
.chip-row-end {margin-left:auto;}
.card-next {display:flex;align-items:center;gap:4px;margin:0 0 8px;padding:4px 8px;border-radius:6px;background:#f4f8ff;color:#2f4a7a;font-size:12px;min-width:0;}
.card-next span {flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;}
.card-next em {flex:none;font-style:normal;color:#7a8aa6;}
.card-next.today {background:#fff8eb;color:#9a6200;}
.card-next.overdue {background:#fff1f0;color:#c0392b;}
.card-next.today em,.card-next.overdue em {color:inherit;}
.people-more {width:130px;}
.quick-bar .chip-row:first-child {align-items:center;}
.mobile-project-entry .board-project-row {width:100%;}
@media(max-width:768px){.project-batch-bar{gap:8px;padding:10px;font-size:12px;}.quick-bar{margin:10px 0 4px;}.quick-bar .qchip{background:#fff;border-color:#e3eaf5;}.quick-bar .qchip.on{background:#165dff;border-color:#165dff;color:#fff;}.quick-bar .qchip.on b{color:#fff;}}
</style>
