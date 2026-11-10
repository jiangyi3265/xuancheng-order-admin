<template>
  <el-drawer
    :model-value="visible"
    size="100%"
    direction="rtl"
    :with-header="false"
    class="order-workspace-drawer"
    modal-class="order-workspace-overlay"
    @update:model-value="(v) => emit('update:visible', v)"
    @opened="drawerReady = true"
    @close="drawerReady = false"
  >
    <div v-if="order" v-loading="loading" class="workspace" :class="{'chat-workspace': isMobile && mobileTab==='chat'}">
      <header class="workspace-head">
        <button v-if="isMobile" class="board-detail-close icon-button" aria-label="关闭项目详情" @click="emit('update:visible',false)"><el-icon><ArrowLeft/></el-icon></button>
        <div class="title-block">
          <div class="title-line">
            <h2 v-if="isMobile">{{ order.title }}</h2>
            <h2 v-else><InlineEdit :model-value="order.title" :disabled="!canInlineEdit" placeholder="项目名" :save="(v) => saveField('title', v)" /></h2>
            <span class="order-no">{{ order.orderNo }}</span>
            <el-tag v-if="isMobile" class="detail-title-status" :class="'project-status-'+order.status" :type="statusMap[order.status]?.type">{{ statusMap[order.status]?.label }}</el-tag>
          </div>
          <p v-if="isMobile" class="detail-subtitle">{{ mobileSubtitle }}</p>
          <ProjectUrgency v-if="isMobile && visible" :key="order.id" :order="order" />
          <div v-if="!isMobile" class="head-tags">
            <el-tag size="small" :type="statusMap[order.status]?.type">{{ statusMap[order.status]?.label }}</el-tag>
            <el-tag size="small" effect="plain" :style="{ color: channelMap[order.channel]?.color, borderColor: channelMap[order.channel]?.color }">
              {{ channelMap[order.channel]?.label }}
            </el-tag>
            <el-tag v-if="order.customerAccount" size="small" type="success" effect="plain">{{ order.customerAccount }}</el-tag>
            <el-tag v-if="isOverdue" size="small" type="danger">已逾期</el-tag>
          </div>
        </div>

        <div v-if="!isMobile" class="head-actions">
          <ProjectUrgency v-if="visible" :key="order.id" :order="order" />
          <!-- 员工：老板刚派来的项目，先接收或拒绝 -->
          <template v-if="pendingAccept">
            <el-button type="primary" :loading="accepting" @click="doAccept">接收这个项目</el-button>
            <el-button @click="rejectVisible = true">拒绝…</el-button>
          </template>
          <el-button v-if="na" type="primary" :icon="Promotion" @click="doNext">{{ na.label }}</el-button>
          <el-button
            v-if="isBoss && ['review', 'done'].includes(order.status)"
            type="warning"
            plain
            :icon="RefreshLeft"
            @click="returnVisible = true"
          >退回返工…</el-button>
          <template v-if="!pendingAccept">
            <span class="inline-label">手动设为</span>
            <el-select v-model="statusModel" size="small" class="status-select" @change="onStatus">
              <el-option v-for="s in statusOptions" :key="s.value" :label="s.label" :value="s.value" />
            </el-select>
            <el-button size="small" type="success" plain :icon="Coin" @click="payVisible = true">{{ isBoss ? '记收款' : '申请收款' }}</el-button>
            <el-button size="small" type="warning" plain :icon="Notebook" @click="emit('notebook', order)">项目记事本</el-button>
            <el-button size="small" plain :icon="Edit" @click="emit('edit', order)">编辑</el-button>
            <!-- 不常用的收进「更多」，标题栏只留每天要点的几个 -->
            <el-dropdown trigger="click" max-height="60vh" @command="onMore">
              <el-button size="small" plain>更多 <el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="revision" :icon="EditPen">改稿 +1</el-dropdown-item>
                  <el-dropdown-item v-if="nudgeLabel" command="nudge" :icon="Bell">{{ nudgeLabel }}</el-dropdown-item>
                  <el-dropdown-item v-if="isBoss" command="delete" :icon="Delete" divided style="color: var(--el-color-danger)">删除</el-dropdown-item>
                  <template v-else>
                    <el-dropdown-item v-if="!['done', 'cancelled'].includes(order.status)" command="handback" :icon="Back" divided>交回项目…</el-dropdown-item>
                    <el-dropdown-item command="request:amount" :divided="['done', 'cancelled'].includes(order.status)">申请改报价</el-dropdown-item>
                    <el-dropdown-item v-if="!['done', 'cancelled'].includes(order.status)" command="request:cancel">申请取消项目</el-dropdown-item>
                    <el-dropdown-item command="request:delete">申请删除项目</el-dropdown-item>
                  </template>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
          <el-button circle class="close-btn" :icon="Close" @click="emit('update:visible', false)" />
        </div>

        <!-- 手机端：只留主要操作，其余都收进“更多操作”（每项和电脑端同名按钮做的事一样） -->
        <div v-else class="head-actions head-actions-m">
          <template v-if="pendingAccept">
            <el-button type="primary" :loading="accepting" @click="doAccept">接收这个项目</el-button>
            <el-button @click="rejectVisible = true">拒绝…</el-button>
          </template>
          <el-button v-if="na" type="primary" @click="doNext">{{ na.label }}</el-button>
          <el-button v-if="isBoss && ['review', 'done'].includes(order.status)" type="warning" plain @click="returnVisible = true">退回返工…</el-button>
          <el-dropdown v-if="!pendingAccept" trigger="click" max-height="60vh" @command="onMore">
            <el-button>更多操作 <el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item v-for="s in moreStatusOptions" :key="s.value" :command="'status:' + s.value">
                  设为「{{ s.label }}」
                </el-dropdown-item>
                <el-dropdown-item command="pay" :icon="Coin" :divided="moreStatusOptions.length > 0">{{ isBoss ? '记收款' : '申请收款' }}</el-dropdown-item>
                <el-dropdown-item v-if="canDun" command="dun" :icon="CopyDocument">复制催款话术</el-dropdown-item>
                <el-dropdown-item command="notebook" :icon="Notebook">项目记事本</el-dropdown-item>
                <el-dropdown-item command="revision" :icon="EditPen">改稿 +1</el-dropdown-item>
                <el-dropdown-item v-if="nudgeLabel" command="nudge" :icon="Bell">{{ nudgeLabel }}</el-dropdown-item>
                <el-dropdown-item command="edit" :icon="Edit">编辑</el-dropdown-item>
                <el-dropdown-item v-if="isBoss" command="delete" :icon="Delete" divided style="color: var(--el-color-danger)">删除</el-dropdown-item>
                <template v-else>
                  <el-dropdown-item v-if="!['done', 'cancelled'].includes(order.status)" command="handback" :icon="Back" divided>交回项目…</el-dropdown-item>
                  <el-dropdown-item command="request:amount" :divided="['done', 'cancelled'].includes(order.status)">申请改报价</el-dropdown-item>
                  <el-dropdown-item v-if="!['done', 'cancelled'].includes(order.status)" command="request:cancel">申请取消项目</el-dropdown-item>
                  <el-dropdown-item command="request:delete">申请删除项目</el-dropdown-item>
                </template>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <!-- 以前这里还有一个「项目操作」菜单，内容和「更多操作」重复，去掉了 -->
          <el-button v-if="!pendingAccept" @click="emit('edit',order)">编辑</el-button>
        </div>
      </header>
      <ProjectHandling v-if="showHandling && !loading" :order="order" class="detail-handling" />
      <NextStepBar v-if="!pendingAccept" :order="order" class="workspace-next" />

      <section v-if="isMobile && mobileTab==='overview'" class="board-detail-summary">              <ProjectCover :order="order" />
              <div class="project-facts"><p><el-icon><User /></el-icon><span>客户</span><b>{{ order.customer || '未填写' }}</b><b class="contact-inline">{{ order.contact }}</b></p><p><el-icon><Phone /></el-icon><span>联系方式</span><b>{{ order.contact || '未填写' }}</b></p><p><el-icon><UserFilled /></el-icon><span>负责人</span><b>{{ memberMap[order.ownerId]?.name }}</b></p><p><el-icon><Calendar /></el-icon><span>截止日期</span><b>{{ order.deadline || '未设置' }}</b></p></div>
              <div class="project-finance"><div><small>报价</small><strong>{{ money(order.amount) }}</strong></div><div><small>已收</small><strong>{{ money(order.receivedAmount) }}</strong></div><div><small>待收</small><strong>{{ money(owed(order)) }}</strong></div></div>
              <p class="muted">优先级：{{ priorityMap[order.priority]?.label }} · 修改 {{ order.revisions || 0 }} 次</p>
</section>
      <nav v-if="isMobile" class="workspace-mobile-tabs"><button v-for="t in mobileTabs" :key="t.key" :class="{active:mobileTab===t.key}" @click="mobileTab=t.key">{{ t.label }}</button></nav>
      <nav v-else class="workspace-tabs" aria-label="项目详情视图"><button v-for="tab in desktopTabs" :key="tab.key"
        :aria-pressed="desktopTab===tab.key" @click="desktopTab=tab.key">{{ tab.label }}</button></nav>
      <div ref="workspaceBody" class="workspace-body" :data-tab="mobileTab" :data-desktop-tab="desktopTab">
        <main class="left-pane">
          <section class="panel overview-panel">
            <div class="section-head compact">
              <div>
                <h3>项目信息</h3>
              </div>
            </div>

            <div v-if="pendingHere.length && !isMobile" class="approval-banner">
              <div class="ab-title">{{ isBoss ? '这个项目有待你批准的申请' : '这个项目有待审批的申请' }}（{{ pendingHere.length }}）</div>
              <ApprovalItem v-for="a in pendingHere" :key="a.id" :a="a" :show-order="false" />
            </div>

            <el-descriptions v-if="!isMobile" :column="isMobile ? 1 : 3" border size="small" class="desc">
              <!-- 点值就地修改，不用再开「编辑」窗口 -->
              <el-descriptions-item label="客户"><InlineEdit :model-value="order.customer" :disabled="!canInlineEdit" placeholder="点击填写客户" :save="(v) => saveField('customer', v)" /></el-descriptions-item>
              <el-descriptions-item label="联系方式"><InlineEdit :model-value="order.contact" :disabled="!canInlineEdit" placeholder="微信 / 电话" :save="(v) => saveField('contact', v)" /></el-descriptions-item>
              <el-descriptions-item label="负责人">
                <AssignMenu :order="order" plain>
                  <span class="inline-assign" :class="{ clickable: isBoss && !['done', 'cancelled'].includes(order.status) }" title="点击改派">{{ memberMap[order.ownerId]?.name }}</span>
                </AssignMenu>
              </el-descriptions-item>
              <el-descriptions-item label="报价">
                <InlineEdit type="number" :model-value="Number(order.amount || 0)" :disabled="!isBoss || pendingAccept" :save="(v) => saveField('amount', v ?? 0)">¥{{ order.amount || 0 }}</InlineEdit>
                <el-button v-if="!isBoss && !pendingAccept" link type="primary" size="small" @click="openRequest('amount')">申请改价</el-button>
              </el-descriptions-item>
              <el-descriptions-item label="收款" :span="isMobile ? 1 : 2">
                <el-tag size="small" :type="PAY_STATE[payState(order)].type" effect="light">{{ PAY_STATE[payState(order)].label }}</el-tag>
                <span class="pay-text">
                  已收 {{ money(order.receivedAmount) }}
                  <template v-if="owed(order) > 0"> · 还欠 <b class="red">{{ money(owed(order)) }}</b></template>
                </span>
                <el-button link type="primary" size="small" @click="payVisible = true">{{ isBoss ? '记收款' : '申请收款' }}</el-button>
                <!-- 还欠款：一键生成「总价、已收、还差多少」，粘到微信就能催 -->
                <el-button v-if="canDun" link type="primary" size="small" title="生成一段催款的话并复制，粘到微信发给客户" @click="copyDunning(order)">复制催款话术</el-button>
              </el-descriptions-item>
              <el-descriptions-item label="优先级"><InlineEdit type="select" :options="PRIORITY" :model-value="order.priority" :disabled="!canInlineEdit" :save="(v) => saveField('priority', v)">{{ priorityMap[order.priority]?.label || '-' }}</InlineEdit></el-descriptions-item>
              <el-descriptions-item label="改稿次数">
                {{ order.revisions || 0 }} 次
                <el-button v-if="canInlineEdit" link type="primary" size="small" class="revision-plus" title="客户又要改一次：改稿次数 +1" @click="doRevision">+1</el-button>
                <el-tag v-if="(order.revisions || 0) >= 3" type="danger" size="small" effect="plain" class="inline-tag">改稿较多</el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="截止日期">
                <InlineEdit type="date" :model-value="order.deadline" :disabled="!canInlineEdit" placeholder="点击设置" :save="(v) => saveField('deadline', v || '')"><span :class="{ red: isOverdue }">{{ order.deadline }}</span></InlineEdit>
              </el-descriptions-item>
              <el-descriptions-item label="需求" :span="isMobile ? 1 : 3">
                <InlineEdit type="textarea" class="requirement-edit" :model-value="order.requirement" :maxlength="10000" :disabled="!canInlineEdit" placeholder="点击填写需求" :save="(v) => saveField('requirement', v)"><span class="requirement">{{ order.requirement }}</span></InlineEdit>
              </el-descriptions-item>
            </el-descriptions>

            <div v-if="isMobile" class="project-overview-mobile">
              <h3>需求说明</h3><p class="requirement">{{ order.requirement || '暂无需求说明' }}</p>
            </div>
            <div v-if="order.attachments && order.attachments.length" class="gallery">
              <div class="gallery-label"><el-icon><Paperclip /></el-icon> 需求材料（{{ order.attachments.length }}）</div>
              <AttachmentView :items="order.attachments" :size="76" />
            </div>
          </section>

          <div class="left-grid">
            <section class="panel bug-panel" data-paste-zone="问题清单" data-paste-open @paste-open="bugOpen = true">
              <div class="section-head">
                <div>
                  <!-- 这张清单客户在自己的页面也看得到，提醒一句，免得把只给自己人看的话记到这里 -->
                  <h3 :title="order.customerAccount ? '客户在自己的页面也能看到这里的问题；只给自己人看的，请写到「内部记录」' : undefined">问题清单 <small v-if="order.customerAccount" class="head-note">客户也能看到</small></h3>
                  <button v-if="!processingBugs && filteredBugs.length > 1" type="button" class="bug-fold-all"
                    @click="setAllIssuesExpanded(!anyIssueExpanded)">{{ anyIssueExpanded ? '全部收起' : '全部展开' }}</button>
                </div>
                <el-button size="small" type="primary" plain :icon="CirclePlus" @click="bugOpen = !bugOpen">
                  {{ bugOpen ? '收起' : '记一条问题' }}
                </el-button>
              </div>

              <div v-if="bugItems.length && !processingBugs" class="issue-filters">
                <div role="group" aria-label="按提交时间筛选" class="issue-filter-row">
                  <span>提交时间</span>
                  <button v-for="option in issueTimeOptions" :key="option.days" type="button"
                    :aria-pressed="issueDays === option.days" @click="issueDays = option.days">{{ option.label }}</button>
                </div>
                <div role="group" aria-label="按解决状态筛选" class="issue-filter-row">
                  <span>问题状态</span>
                  <button v-for="option in issueStateOptions" :key="option.value" type="button"
                    :aria-pressed="issueState === option.value" @click="issueState = option.value">{{ option.label }}</button>
                </div>
              </div>

              <div v-if="processingBugs || actionableBugs.length" ref="bugNavigator" class="bug-navigator" tabindex="-1" aria-label="逐条处理问题">
                <template v-if="processingBugs">
                  <strong role="status">{{ actionableBugs.length ? '剩余 ' + actionableBugs.length + ' 条需处理' : (hasIssueFilters ? '当前筛选没有需处理的问题' : '本项目当前没有需处理的问题') }}</strong>
                  <template v-if="actionableBugs.length > 1">
                    <button type="button" :disabled="processingIndex === 0 || issueNavigationLocked" @click="moveIssue(-1)">上一条</button>
                    <button type="button" :disabled="processingIndex >= actionableBugs.length - 1 || issueNavigationLocked" @click="moveIssue(1)">下一条</button>
                  </template>
                  <button type="button" @click="processingBugs = false">返回全部问题</button>
                </template>
                <button v-else type="button" class="begin-processing" :disabled="!!activeUpdateBugId || !!statusUpdatingBugId" @click="beginProcessingBugs">
                  逐条处理（{{ actionableBugs.length }}）
                </button>
              </div>

              <div v-if="bugOpen" class="bug-form">
                <el-input
                  v-model="bugText"
                  type="textarea"
                  :rows="2"
                  resize="none"
                  placeholder="写清楚是什么问题，可以直接粘贴截图"
                  @keydown.enter.ctrl.prevent="submitBug"
                  @keydown.enter.meta.prevent="submitBug"
                />
                <AttachmentUploader v-model="bugFiles" compact class="note-upload" />
                <el-button type="primary" plain :icon="Promotion" :loading="bugSubmitting" @click="submitBug">记下问题</el-button>
              </div>

              <p v-if="missingNoticeItem && noticeTab === 'bugs'" class="muted" role="status">这条通知对应的问题已删除。</p>
              <div class="bug-list">
                <div v-for="bug in visibleBugs" :key="bug.id" class="bug-item" :data-notice-id="bug.id" :class="{ 'is-resolved': isBugResolved(bug), 'notice-target': isNoticeItem('bugs', bug.id) }">
                  <button type="button" class="bug-disclosure"
                    :aria-expanded="isBugExpanded(bug)" :aria-controls="isBugExpanded(bug) ? bugDetailsId(bug) : undefined"
                    @click="toggleBugExpanded(bug)">
                    <span class="bug-summary-title">{{ bug.content || '只有附件' }}</span>
                    <span v-if="!isBugExpanded(bug)" class="bug-summary-status" :class="'status-' + bugStatus(bug)">{{ bugStatusLabels[bugStatus(bug)] }}</span>
                    <span class="bug-disclosure-label">{{ isBugExpanded(bug) ? '收起' : '展开' }}<el-icon aria-hidden="true"><ArrowDown /></el-icon></span>
                  </button>
                  <button v-if="!['done','cancelled'].includes(order.status) &&
                    (isBugResolved(bug) || (!isBugExpanded(bug) && bugStatus(bug) === 'open'))"
                    type="button" class="bug-reactivate" :disabled="!!statusUpdatingBugId"
                    @click="changeBugStatus(bug, 'action')">{{ isBugResolved(bug) ? '重新激活' : '加入逐条处理' }}</button>
                  <div v-if="!isBugExpanded(bug) && (bug.time || bug.attachments?.length || bug.updates?.length)" class="bug-summary-counts">
                    <!-- 收起时也写上是谁提的（以前只有时间，分不清是客户提的还是自己人记的，得一条条点开） -->
                    <span class="bug-summary-who">{{ bug.createdBy || '客户' }}</span>
                    <time v-if="bug.time" :datetime="bug.time.replace(' ', 'T')">{{ bug.time }} 提交</time>
                    <span v-if="bug.attachments?.length">{{ bug.attachments.length }} 个附件</span>
                    <span v-if="bug.updates?.length">{{ bug.updates.length }} 条补充</span>
                  </div>
                  <div v-if="!isBugExpanded(bug) && issueImages.get(bug.id).length" class="bug-summary-previews">
                    <MediaThumb v-for="(image, i) in issueImages.get(bug.id).slice(0, previewLimit)"
                      :key="i" :item="image" :size="56" :gallery="problemImages" />
                    <button v-if="issueImages.get(bug.id).length > previewLimit" type="button"
                      :aria-label="'展开查看其余 ' + (issueImages.get(bug.id).length - previewLimit) + ' 张图片'"
                      @click="toggleBugExpanded(bug)">+{{ issueImages.get(bug.id).length - previewLimit }} 张</button>
                  </div>
                  <div v-if="isBugExpanded(bug)" :id="bugDetailsId(bug)" class="bug-details">
                    <div class="bug-body">
                      <AttachmentView v-if="bug.attachments && bug.attachments.length" :items="bug.attachments" :gallery="problemImages" :size="64" />
                      <div class="bug-meta">{{ bug.createdBy || '客户' }} · {{ bug.time }}</div>

                      <div v-if="bug.updates && bug.updates.length" class="bug-updates">
                        <div v-for="u in bug.updates" :key="u.id" class="bug-update">
                          <div class="update-meta">补充说明 · {{ u.createdBy || '客户' }} · {{ u.time }}</div>
                          <p>{{ u.content || '只有附件' }}</p>
                          <AttachmentView v-if="u.attachments && u.attachments.length" :items="u.attachments" :gallery="problemImages" :size="64" />
                        </div>
                      </div>

                      <div v-if="activeUpdateBugId === bug.id" class="bug-update-form" data-paste-zone="追加说明">
                        <el-input
                          v-model="updateDraft.text"
                          type="textarea"
                          :rows="2"
                          resize="none"
                          placeholder="补充新的说明或变更，可以粘贴截图"
                          @keydown.enter.ctrl.prevent="submitBugUpdate(bug)"
                          @keydown.enter.meta.prevent="submitBugUpdate(bug)"
                        />
                        <AttachmentUploader v-model="updateDraft.files" :draft="updateDraft" compact class="note-upload" />
                        <el-button type="primary" plain :loading="updateDraft.sending" :disabled="!updateReady" @click="submitBugUpdate(bug)">
                          提交补充
                        </el-button>
                      </div>
                    </div>
                    <div class="bug-actions">
                      <el-button v-if="processingBugs" type="primary" size="small"
                        :loading="statusUpdatingBugId === bug.id" :disabled="issueNavigationLocked"
                        @click="resolveCurrentIssue(bug, $event)">
                        {{ actionableBugs.length > 1 ? '解决并继续' : '解决最后一条' }}
                      </el-button>
                      <span v-else-if="bug.status==='confirm'" class="issue-awaiting">等客户确认</span>
                      <el-radio-group v-else
                        :key="statusUpdatingBugId === bug.id"
                        :model-value="bugStatus(bug)"
                        size="small"
                        class="bug-status"
                        :disabled="!!statusUpdatingBugId"
                        @change="(val) => changeBugStatus(bug, val)"
                      >
                        <el-radio-button value="open">未标记</el-radio-button>
                        <el-radio-button v-if="!isBugResolved(bug)" value="action" :disabled="['done','cancelled'].includes(order.status)">需处理</el-radio-button>
                        <el-radio-button value="resolved">已解决</el-radio-button>
                      </el-radio-group>
                      <el-button v-if="order.customerAccount && !pendingAccept && !['done','cancelled'].includes(order.status) && bug.status!=='confirm'"
                        type="primary" plain size="small" :disabled="!!statusUpdatingBugId || !!deletingBugId" @click="reviewBugId=bug.id">请客户确认</el-button>
                      <el-button text type="primary" :icon="CirclePlus" @click="toggleBugUpdate(bug)">
                        {{ activeUpdateBugId === bug.id ? '收起' : '补充说明' }}
                      </el-button>
                      <el-button
                        text
                        type="danger"
                        :icon="Delete"
                        :loading="deletingBugId === bug.id"
                        @click="removeBug(bug)"
                      >
                        删除
                      </el-button>
                    </div>
                  </div>
                </div>
                <div v-if="!processingBugs && !filteredBugs.length" class="empty" role="status">
                  {{ bugItems.length ? '没有符合筛选条件的问题' : '暂无问题' }}
                  <button v-if="bugItems.length" type="button" class="clear-issue-filters" @click="resetIssueFilters">清除筛选</button>
                </div>
              </div>
            </section>

            <section class="panel record-panel" data-paste-zone="内部记录">
              <div class="section-head">
                <div>
                  <h3 title="仅项目协作成员可见，不同步给客户">内部记录 <small class="head-note">仅内部可见</small></h3>
                  <el-button link type="primary" @click="emit('notebook', order)">打开项目记事本</el-button>
                </div>
                <el-tag size="small" type="info" effect="plain">{{ recordItems.length }} 条</el-tag>
              </div>

              <div class="add-progress">
                <el-input
                  ref="noteInput"
                  v-model="note"
                  size="small"
                  type="textarea"
                  :rows="2"
                  resize="none"
                  :placeholder="isMobile ? '记录内部进度、改稿点、注意事项...' : '记录内部进度、改稿点、注意事项...  Ctrl+Enter 记录'"
                  @keydown.enter.ctrl.prevent="addNote"
                  @keydown.enter.meta.prevent="addNote"
                />
                <!-- @ 同事：点一下就选上，对方会收到提醒，看过后这里显示“已读” -->
                <div v-if="mentionPeople.length" class="mention-row">
                  <span class="mention-label">提醒谁看：</span>
                  <button
                    v-for="p in mentionPeople"
                    :key="p.id"
                    type="button"
                    class="mention-chip"
                    :class="{ on: noteMentions.includes(p.id) }"
                    :aria-pressed="noteMentions.includes(p.id)"
                    @click="toggleMention(p.id)"
                  >@{{ p.name }}</button>
                </div>
                <AttachmentUploader v-model="noteFiles" compact class="note-upload" />
                <el-button type="primary" plain size="small" :icon="Promotion" @click="addNote">{{ noteMentions.length ? '记录并提醒' : '记录' }}</el-button>
              </div>

              <el-timeline class="timeline">
                <el-timeline-item
                  v-for="(t, i) in recordItems"
                  :key="t.id || i"
                  :data-notice-id="t.id"
                  :class="{ 'notice-target': isNoticeItem('internal', t.id) }"
                  :timestamp="t.time"
                  :color="dotColor(t.type)"
                  placement="top"
                >
                  <div>
                    <span class="t-user">{{ t.user }}</span> {{ recordText(t) }}
                  </div>
                  <div v-if="t.mentions && t.mentions.length" class="t-mentions">
                    <span v-for="m in t.mentions" :key="m.memberId" :class="{ read: m.read }">@{{ m.name }} · {{ m.read ? '已读' : '未读' }}</span>
                  </div>
                  <div v-if="t.attachments && t.attachments.length" class="t-imgs">
                    <AttachmentView :items="t.attachments" :size="64" />
                  </div>
                </el-timeline-item>
              </el-timeline>
            </section>
          </div>
        </main>

        <aside class="right-pane">
          <section class="panel chat-panel" data-paste-zone="客户沟通" data-paste-open @paste-open="replyUploadOpen = true">
            <div class="section-head">
              <div>
                <h3 title="这里发送的消息客户和项目协作成员都能看到">客户沟通</h3>
              </div>
              <div class="sync-meta">
                <span class="sync-state" :class="{ reconnecting: syncState === 'reconnecting' }">
                  <i></i>{{ syncState === 'reconnecting' ? '重连中' : '实时' }}
                </span>
                <el-tag size="small" effect="plain">{{ chatItems.length }} 条</el-tag>
              </div>
            </div>

            <div v-if="!order.customerAccount" class="chat-unbound" role="note">
              这个项目还没绑定客户账号，客户登录后看不到这里的消息。
              <el-button link type="primary" size="small" @click="emit('edit', order)">去绑定</el-button>
            </div>
            <!-- 交付了、客户还没点验收：写出等了几天，一键催（系统里留一条，同样的话复制好可以粘到微信） -->
            <div v-if="awaitsCustomer" class="chat-await" role="note">
              <span>{{ reviewDays > 0 ? '交付 ' + reviewDays + ' 天了，客户还没验收' : '已交付，等客户验收' }}</span>
              <el-button v-if="!acceptNudged" size="small" type="primary" plain :loading="nudgingAccept" @click="doAcceptNudge">催客户验收</el-button>
              <el-button v-else size="small" plain title="今天已经催过了；点一下把这句话再复制一遍，可以粘到微信发" @click="copyAcceptNudge(order)">今天已催</el-button>
            </div>
            <div ref="chatList" class="chat-list">
              <div v-for="(t, i) in chatItems" :key="t.id || i" class="chat-row" :data-notice-id="t.id" :class="{ team: t.type === 'reply', 'notice-target': isNoticeItem('chat', t.id) }">
                <div class="avatar">{{ avatarOf(t) }}</div>
                <div class="bubble-wrap">
                  <div class="meta">
                    <span>{{ t.type === 'reply' ? t.user : '客户 · ' + t.user }}</span>
                    <em>{{ t.time }}</em>
                  </div>
                  <div class="bubble">
                    <p v-if="t.content">{{ t.content }}</p>
                    <AttachmentView v-if="t.attachments && t.attachments.length" :items="t.attachments" :size="64" />
                  </div>
                </div>
              </div>
              <div v-if="!chatItems.length" class="empty">还没有客户沟通消息</div>
            </div>

            <div class="composer" :class="{'board-composer':isMobile}">
              <ChatInput ref="replyInput" v-model="replyText" class="reply-input" label="回复客户" :rows="1" :busy="replying"
                placeholder="回复客户，回车发送" @send="sendReply" @files="addReplyFiles">
                <template #extra><QuickPhrases :disabled="replying" @pick="(t) => replyInput?.fill(t)" /></template>
              </ChatInput>
              <button v-if="isMobile" class="icon-button" aria-label="添加附件" @click="replyUploadOpen=!replyUploadOpen"><el-icon><CirclePlus/></el-icon></button>
              <AttachmentUploader v-show="!isMobile || replyUploadOpen || replyFiles.length > 0 || draft.attachmentWaitList?.length" ref="replyUploader" :draft="draft" v-model="replyFiles" compact class="note-upload" />
              <el-button type="primary" :icon="Promotion" :loading="replying" :disabled="!replyReady" @click="sendReply">发送给客户</el-button>
            </div>
          </section>
        </aside>
      </div>
    </div>
    <DeliveryDialog v-model:visible="deliveryVisible" :order="order" :target="na?.to"/>
    <IssueReviewRequest v-if="visible && reviewTarget" :key="reviewTarget.id" :order="order" :bug="reviewTarget" @close="reviewBugId=null" />
    <PaymentDialog v-model:visible="payVisible" :order="order" />
    <ReasonDialog :order="order"
      v-model:visible="returnVisible"
      title="退回返工"
      tip="项目会回到“进行中”，改稿次数 +1，负责人会看到你写的原因。"
      placeholder="写一下哪里要改，比如：首页配色不对"
      confirm-text="退回返工"
      :submit="doReturn"
    />
    <ReasonDialog :order="order"
      v-model:visible="handbackVisible"
      title="交回项目"
      tip="项目将交回重新安排，状态变为“待确认”，交回后你将无法查看。对方会看到你填写的原因。"
      placeholder="写一下为什么要交回，比如：这个我不会做"
      confirm-text="交回"
      danger
      :submit="doHandback"
    />
    <ReasonDialog :order="order"
      v-model:visible="rejectVisible"
      title="拒绝这个项目"
      tip="项目会交回重新安排，对方会看到你写的原因。"
      placeholder="写一下为什么不接，比如：这周排满了"
      confirm-text="拒绝"
      danger
      :submit="doReject"
    />
    <ApprovalRequestDialog v-model:visible="requestVisible" :order="order" :type="requestType" />
  </el-drawer>
</template>

<script setup>
const replyUploadOpen = ref(false)

import DeliveryDialog from '@/components/DeliveryDialog.vue'
const deliveryVisible=ref(false)
import ProjectCover from '@/components/ProjectCover.vue'
import ProjectHandling from './ProjectHandling.vue'
import ProjectUrgency from './ProjectUrgency.vue'
import { ref, computed, watch, nextTick, onBeforeUnmount, toRefs } from 'vue'
import { Edit, Delete, Paperclip, Promotion, EditPen, Bell, Notebook, CirclePlus, Close, Coin, RefreshLeft, Back, ArrowDown, CopyDocument } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { chatDraft, sendDraft } from '@/utils/chatDraft'
import ChatInput from '@/components/ChatInput.vue'
import QuickPhrases from '@/components/QuickPhrases.vue'
import { awaitingCustomer, nudgedToday, nudgeCustomerAccept, copyAcceptNudge, copyDunning } from '@/utils/customerNudge'
import AttachmentUploader from '@/components/AttachmentUploader.vue'
import NextStepBar from '@/components/NextStepBar.vue'
import InlineEdit from '@/components/InlineEdit.vue'
import AssignMenu from '@/components/AssignMenu.vue'
import AttachmentView from '@/components/AttachmentView.vue'
import { issueGallery } from '@/utils/imagePreview'
import { issueStateOptions, issueTimeOptions, matchesIssueFilters, newestIssueFirst } from '@/utils/issueFilters'
import MediaThumb from '@/components/MediaThumb.vue'
import PaymentDialog from '@/components/PaymentDialog.vue'
import IssueReviewRequest from './IssueReviewRequest.vue'
import ReasonDialog from '@/components/ReasonDialog.vue'
import ApprovalItem from '@/components/ApprovalItem.vue'
import ApprovalRequestDialog from '@/components/ApprovalRequestDialog.vue'
import {
  getOrder, getOrderVersion, addProgress, markRead, addRevision, nudge, createBug, deleteBug, appendBugUpdate,
  updateBugStatus, currentMember, isBoss, approvals, acceptOrder, rejectOrder, handbackOrder, returnOrder, editOrder
} from '@/mock/store'
import { STATUS, PRIORITY, statusMap, channelMap, priorityMap, memberMap } from '@/constants/options'
import { nextAction } from '@/utils/workbench'
import { todayStr as todayLocal } from '@/utils/date'
import { changeOrderStatus } from '@/utils/settle'
import { PAY_STATE, payState, owed, money } from '@/utils/payment'
import { isMobile } from '@/utils/useMobile'

const mobileTab=ref('overview')
const mobileTabs=[{key:'overview',label:'需求'},{key:'chat',label:'沟通'},{key:'bugs',label:'问题'},{key:'internal',label:'内部'}]
const desktopTab = ref('all')
const desktopTabs = [{key:'all',label:'全部'}, ...mobileTabs]
const props = defineProps({
  visible: { type: Boolean, default: false },
  order: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  noticeTab: { type: String, default: '' },
  showHandling: Boolean,
  noticeItem: { type: String, default: '' }
})
const emit = defineEmits(['update:visible', 'edit', 'delete', 'notebook'])

const note = ref('')
const noteFiles = ref([])
// 内部记录 @ 谁：只能是这个项目的负责人 / 总管理员（后端给的 collaborators），不含自己
const noteMentions = ref([])
const mentionPeople = computed(() => (props.order?.collaborators || []).filter((p) => p.id !== currentMember.value.id))
function toggleMention(id) {
  noteMentions.value = noteMentions.value.includes(id) ? noteMentions.value.filter((x) => x !== id) : [...noteMentions.value, id]
}
const draft = chatDraft('project', props.order?.id)
const { text: replyText, files: replyFiles, sending: replying } = toRefs(draft)
const bugOpen = ref(false)
const bugText = ref('')
const bugFiles = ref([])
const bugSubmitting = ref(false)
const deletingBugId = ref(null)
const statusUpdatingBugId = ref(null)
const activeUpdateBugId = ref(null)
const updateSubmittingId = ref(null)
const updateDraft = computed(() => activeUpdateBugId.value && chatDraft('bug-update', props.order?.id, activeUpdateBugId.value))
const updateReady = computed(() => {
  const draft = updateDraft.value
  return draft && !updateSubmittingId.value && !draft.sending && !draft.attachmentWaitList.length && (draft.text.trim() || draft.files.length)
})
const reviewBugId = ref(null)
const reviewTarget = computed(() => props.order?.bugs?.find(bug => bug.id === reviewBugId.value))
watch([() => props.order?.id, () => props.visible], () => { reviewBugId.value = null })
const statusModel = ref('')
const payVisible = ref(false)

// 手机标题下面那行小字：需求的第一行；和项目名一样就改显示单号，不把同一句话写两遍
const mobileSubtitle = computed(() => {
  const first = String(props.order?.requirement || '').split('\n')[0].trim()
  return first && first !== String(props.order?.title || '').trim() ? first : props.order?.orderNo
})

// ---- 流转：接收 / 拒绝 / 交回 / 退回返工 / 申请 ----
const accepting = ref(false)
const rejectVisible = ref(false)
const handbackVisible = ref(false)
const returnVisible = ref(false)
const requestVisible = ref(false)
const requestType = ref('amount')
const pendingAccept = computed(() => !isBoss.value && props.order?.assignState === 'pending')
// 订单信息就地修改：只把改的那一项发给后端（和「编辑」窗口走同一个接口、同样的权限）
const canInlineEdit = computed(() => !pendingAccept.value)
async function saveField(field, value) {
  if (field === 'title' && !String(value || '').trim()) throw new Error('项目名不能为空')
  await editOrder({ id: props.order.id, [field]: value })
}
const pendingHere = computed(() => approvals.filter((a) => a.orderId === props.order?.id && a.status === 'pending'))
// 员工不能自己把项目标成“已完成 / 已取消”（要走提交验收 / 申请），所以下拉里不给这两项
const statusOptions = computed(() =>
  STATUS.filter((s) => isBoss.value || ['pending', 'doing', 'review'].includes(s.value) || s.value === props.order?.status)
)

async function doAccept() {
  accepting.value = true
  try {
    await acceptOrder(props.order.id)
    ElMessage.success('已接收，可以开工了')
  } catch (e) {
    ElMessage.error(e.message || '接收失败')
  } finally {
    accepting.value = false
  }
}
async function doReject(reason) {
  await rejectOrder(props.order.id, reason)
  ElMessage.success('已拒绝，项目已交回')
  emit('update:visible', false)
}
async function doHandback(reason) {
  await handbackOrder(props.order.id, reason)
  ElMessage.success('已交回项目')
  emit('update:visible', false)
}
async function doReturn(reason) {
  await returnOrder(props.order.id, reason)
  ElMessage.success('已退回返工，负责人会收到通知')
}
function openRequest(type) {
  requestType.value = type
  requestVisible.value = true
}
const chatList = ref(null)
const syncState = ref('online')
const syncing = ref(false)
let poller = null

const chatTypes = ['message', 'reply']
const chatItems = computed(() => (props.order?.timeline || []).filter((t) => chatTypes.includes(t.type)))
const recordItems = computed(() => (props.order?.timeline || []).filter((t) => !chatTypes.includes(t.type)))
const issueDays = ref(0)
const issueState = ref('all')
const currentMinute = ref(Math.floor(Date.now() / 60000))
const hasIssueFilters = computed(() => issueDays.value !== 0 || issueState.value !== 'all')

const bugItems = computed(() => [...(props.order?.bugs || [])].sort(newestIssueFirst))
const filteredBugs = computed(() => hasIssueFilters.value
  ? bugItems.value.filter(bug => matchesIssueFilters(bug, issueDays.value, issueState.value, currentMinute.value))
  : bugItems.value)
function resetIssueFilters() {
  issueDays.value = 0
  issueState.value = 'all'
}
const previewLimit = 3
const issueImages = computed(() => new Map(bugItems.value.map(bug => {
  const attachments = [...(bug.attachments || []), ...(bug.updates || []).flatMap(update => update.attachments || [])]
  return [bug.id, attachments.filter(file => file?.type === 'image' && file.url)]
})))
watch(filteredBugs, items => {
  if (activeUpdateBugId.value && !items.some(bug => bug.id === activeUpdateBugId.value)) activeUpdateBugId.value = null
})

const processingBugs = ref(false)
const processingBugId = ref(null)
const bugNavigator = ref(null)
const bugExpansion = ref(new Map())
const bugStatusLabels = { open: '未标记', action: '需处理', confirm:'等客户确认', resolved: '已解决' }
const bugDetailsId = bug => `issue-details-${props.order.id}-${bug.id}`
function isBugExpanded(bug) {
  return bugExpansion.value.get(String(bug.id)) ?? (bugStatus(bug) === 'action')
}
function toggleBugExpanded(bug) {
  const expanded = !isBugExpanded(bug)
  bugExpansion.value.set(String(bug.id), expanded)
  if (!expanded && activeUpdateBugId.value === bug.id) activeUpdateBugId.value = null
}

const anyIssueExpanded = computed(() => filteredBugs.value.some(isBugExpanded))
function setAllIssuesExpanded(expanded) {
  for (const bug of filteredBugs.value) bugExpansion.value.set(String(bug.id), expanded)
  if (!expanded) activeUpdateBugId.value = null
}

const actionableBugs = computed(() => filteredBugs.value.filter(bug => bug.status === 'action'))
const processingIndex = computed(() => Math.max(0, actionableBugs.value.findIndex(bug => bug.id === processingBugId.value)))
const processingBug = computed(() => actionableBugs.value[processingIndex.value])
const visibleBugs = computed(() => {
  if (!processingBugs.value) return filteredBugs.value
  return processingBug.value ? [processingBug.value] : []
})
const problemImages = computed(() => issueGallery(visibleBugs.value))
const issueNavigationLocked = computed(() =>
  !!statusUpdatingBugId.value || !!deletingBugId.value || (!!activeUpdateBugId.value && activeUpdateBugId.value === processingBug.value?.id)
)

function beginProcessingBugs() {
  const notified = actionableBugs.value.find(bug => isNoticeItem('bugs', bug.id))
  processingBugId.value = (notified || actionableBugs.value[0])?.id
  processingBugs.value = true
}

function moveIssue(offset) {
  if (issueNavigationLocked.value) return
  const next = actionableBugs.value[processingIndex.value + offset]
  if (next) processingBugId.value = next.id
}

// A successful status change removes that issue from the queue. A slow or failed
// save must leave the same issue available, and a double-click must not resolve its successor.
async function resolveCurrentIssue(bug, event) {
  if (event.detail > 1 || issueNavigationLocked.value || processingBug.value?.id !== bug.id) return
  const next = actionableBugs.value[processingIndex.value + 1]
  processingBugId.value = bug.id
  const finished = await changeBugStatus(bug, 'resolved')
  if (finished && processingBugs.value && processingBugId.value === bug.id && next && actionableBugs.value.some(item => item.id === next.id)) {
    processingBugId.value = next.id
  }
}

watch(() => processingBugs.value ? processingBug.value?.id ?? 'finished' : null, async (id, _, onCleanup) => {
  if (id === null) return
  if (processingBug.value) bugExpansion.value.set(String(processingBug.value.id), true)
  let cancelled = false
  onCleanup(() => { cancelled = true })
  await nextTick()
  const nav = bugNavigator.value
  if (!cancelled && nav?.getClientRects().length) {
    nav.focus({preventScroll:true})
    nav.scrollIntoView({block:'nearest'})
  }
}, {flush:'post'})

const drawerReady = ref(false)
const workspaceBody = ref(null)
const missingNoticeItem = computed(() => props.visible && !props.loading && props.noticeTab === 'bugs' &&
  !!props.noticeItem && !bugItems.value.some(b => String(b.id) === props.noticeItem))
function isNoticeItem(tab, id) {
  return props.noticeTab === tab && String(id) === props.noticeItem
}

watch([drawerReady, () => props.visible, () => props.loading, () => props.order?.id,
  () => props.noticeTab, () => props.noticeItem], async (_, __, onCleanup) => {
  if (!drawerReady.value || !props.visible || props.loading || !props.noticeTab) return
  let cancelled = false
  onCleanup(() => { cancelled = true })
  // An explicit notification still opens its exact item, including historical issues.
  if (props.noticeTab === 'bugs' && props.noticeItem) {
    if (!filteredBugs.value.some(bug => String(bug.id) === props.noticeItem)) resetIssueFilters()
    bugExpansion.value.set(props.noticeItem, true)
  }
  if (processingBugs.value && props.noticeTab === 'bugs' && props.noticeItem) {
    const target = actionableBugs.value.find(bug => String(bug.id) === props.noticeItem)
    if (target) processingBugId.value = target.id
    else processingBugs.value = false
  }
  mobileTab.value = desktopTab.value = props.noticeTab
  await nextTick()
  if (cancelled) return
  const panelClass = { bugs: '.bug-panel', chat: '.chat-panel', internal: '.record-panel' }[props.noticeTab]
  const panel = workspaceBody.value?.querySelector(panelClass)
  const target = panel?.querySelector('.notice-target') || panel
  target?.scrollIntoView({ block: 'nearest' })
}, { flush: 'post' })

function bugStatus(bug) {
  return ['resolved', 'action', 'confirm'].includes(bug?.status) ? bug.status : 'open'
}

function isBugResolved(bug) {
  return bugStatus(bug) === 'resolved'
}

watch(
  () => props.order,
  (o) => {
    statusModel.value = o?.status || ''
  },
  { immediate: true }
)

function scrollChatBottom(smooth = false) {
  nextTick(() => {
    const el = chatList.value
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  })
}

async function syncNow(force = false) {
  currentMinute.value = Math.floor(Date.now() / 60000)
  if (!props.visible || !props.order || props.loading || syncing.value || document.visibilityState !== 'visible') return
  if (replying.value || bugSubmitting.value || deletingBugId.value || statusUpdatingBugId.value || updateSubmittingId.value) return
  syncing.value = true
  try {
    const version = await getOrderVersion(props.order.id)
    if (force || Number(version?.version || 0) !== Number(props.order.version || 0)) {
      const before = chatItems.value.length
      await getOrder(props.order.id)
      if (chatItems.value.length > before) scrollChatBottom(true)
    }
    syncState.value = 'online'
  } catch (e) {
    syncState.value = 'reconnecting'
  } finally {
    syncing.value = false
  }
}

function startSync() {
  if (poller) clearInterval(poller)
  poller = setInterval(syncNow, 2000)
}

// 手机上默认打开最需要处理的那一栏（电脑上「全部」一屏都能看到，不用换）：
// 客户的消息还没人回 → 沟通；有要我处理的问题 → 问题；其他 → 需求
function defaultMobileTab() {
  if (props.order?.ownerId !== currentMember.value.id) return 'overview'
  const lastChat = chatItems.value[chatItems.value.length - 1]
  const waiting = lastChat ? lastChat.type === 'message' : props.order?.lastMessage?.type === 'message'
  if (waiting && props.order?.status !== 'cancelled') return 'chat'
  if (Number(props.order?.actionBugCount) > 0) return 'bugs'
  return 'overview'
}

function onOpen() {
  resetIssueFilters()
  desktopTab.value = props.noticeTab || 'all'
  mobileTab.value = props.noticeTab || defaultMobileTab()
  syncNow(false)
  scrollChatBottom()
  startSync()
  window.addEventListener('focus', syncNow)
  document.addEventListener('visibilitychange', syncNow)
}

function onClosed() {
  processingBugs.value = false
  if (poller) {
    clearInterval(poller)
    poller = null
  }
  window.removeEventListener('focus', syncNow)
  document.removeEventListener('visibilitychange', syncNow)
}

watch(() => props.visible, visible => {
  if (visible) onOpen()
  else onClosed()
}, { immediate: true })

watch(() => props.visible && !props.loading && props.order?.id, id => {
  if (id) markRead(id, currentMember.value.id).catch(() => {})
}, { immediate: true })
// 从工作台点「写进展」：打开「内部」，光标直接放进记录框
const noteInput = ref(null)
watch(() => props.visible && !props.loading && props.noticeTab === 'internal' && !props.noticeItem && props.order?.id, id => {
  if (id) setTimeout(() => noteInput.value?.focus?.(), 350)
})
onBeforeUnmount(onClosed)

const todayStr = todayLocal()
const isOverdue = computed(
  () =>
    props.order &&
    ['pending', 'doing', 'review'].includes(props.order.status) &&
    props.order.deadline &&
    props.order.deadline < todayStr
)

const na = computed(() => nextAction(props.order, currentMember.value.id))
async function doNext() {
  if (!na.value) return
  if (isMobile.value && ['review','done'].includes(na.value.to)) { deliveryVisible.value=true; return }
  try {
    await changeOrderStatus(props.order, na.value.to)
  } catch (e) {
    ElMessage.error(e.message || '修改状态失败')
  }
}

async function onStatus(val) {
  try {
    await changeOrderStatus(props.order, val)
  } catch (e) {
    statusModel.value = props.order?.status || ''
    ElMessage.error(e.message || '修改状态失败')
  }
}
async function doRevision() {
  try {
    await addRevision(props.order.id)
    ElMessage.success('已记录改稿 +1')
  } catch (e) {
    ElMessage.error(e.message || '记录失败')
  }
}
// 催谁：别人负责的催负责人；自己负责的提醒老板（老板自己的项目没人可催，菜单里不显示）
const nudgeLabel = computed(() => {
  if (props.order?.ownerId !== currentMember.value.id) return '催一下'
  return isBoss.value ? '' : '提醒老板看一下'
})
async function doNudge() {
  try {
    await nudge(props.order.id)
    ElMessage.success(props.order?.ownerId === currentMember.value.id ? '已提醒老板' : '已催办，对方会收到提醒')
  } catch (e) {
    ElMessage.error(e.message || '催办失败')
  }
}

// ---- 手机端“更多操作”菜单：每一项都走和电脑端同名按钮一样的处理 ----
// 状态项跳过当前状态（电脑端的“手动设为”下拉里选不选中当前值没意义）
const moreStatusOptions = computed(() => statusOptions.value.filter((s) => s.value !== props.order?.status))
const moreActions = {
  pay: () => { payVisible.value = true },
  dun: () => copyDunning(props.order),
  notebook: () => emit('notebook', props.order),
  revision: doRevision,
  nudge: doNudge,
  edit: () => emit('edit', props.order),
  delete: () => emit('delete', props.order),
  handback: () => { handbackVisible.value = true }
}
function onMore(cmd) {
  if (typeof cmd !== 'string') return
  if (cmd.startsWith('status:')) {
    // 和电脑端下拉一样：先记下选中的值，失败时 onStatus 会把它还原
    const val = cmd.slice('status:'.length)
    statusModel.value = val
    onStatus(val)
  } else if (cmd.startsWith('request:')) {
    openRequest(cmd.slice('request:'.length))
  } else {
    moreActions[cmd]?.()
  }
}
async function addNote() {
  if (!note.value.trim() && !noteFiles.value.length) return
  // 手打的「@名字」也算
  const typed = mentionPeople.value.filter((p) => note.value.includes('@' + p.name)).map((p) => p.id)
  const mentions = [...new Set([...noteMentions.value, ...typed])]
  try {
    await addProgress(props.order.id, note.value.trim(), 'note', [...noteFiles.value], mentions)
    note.value = ''
    noteFiles.value = []
    noteMentions.value = []
    if (mentions.length) ElMessage.success('已记录，并提醒了 ' + mentionPeople.value.filter((p) => mentions.includes(p.id)).map((p) => p.name).join('、'))
  } catch (e) {
    ElMessage.error(e.message || '记录失败，内容已保留')
  }
}
async function submitBug() {
  if (bugSubmitting.value || (!bugText.value.trim() && !bugFiles.value.length)) return
  bugSubmitting.value = true
  try {
    await createBug(props.order.id, bugText.value.trim(), [...bugFiles.value])
    bugText.value = ''
    bugFiles.value = []
    bugOpen.value = false
    if (issueState.value === 'resolved') issueState.value = 'all'
    processingBugs.value = false
    currentMinute.value = Math.floor(Date.now() / 60000)
    ElMessage.success('问题已记下')
  } catch (e) {
    ElMessage.error(e.message || '创建失败')
  } finally {
    bugSubmitting.value = false
  }
}
function toggleBugUpdate(bug) {
  activeUpdateBugId.value = activeUpdateBugId.value === bug.id ? null : bug.id
}
async function submitBugUpdate(bug) {
  if (!updateReady.value || activeUpdateBugId.value !== bug.id) return
  const draft = updateDraft.value
  updateSubmittingId.value = bug.id
  try {
    await sendDraft(draft, ({content, attachments}) => appendBugUpdate(bug.id, content, attachments))
    if (activeUpdateBugId.value === bug.id && !draft.text && !draft.files.length && !draft.attachmentWaitList.length) {
      activeUpdateBugId.value = null
    }
    ElMessage.success('已补充说明')
  } catch (e) {
    ElMessage.error(e.message || '补充失败')
  } finally {
    updateSubmittingId.value = null
  }
}
async function removeBug(bug) {
  try {
    await ElMessageBox.confirm('删除后客户和后台都看不到这条问题，确定删除吗？', '删除问题', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    })
    deletingBugId.value = bug.id
    await deleteBug(bug.id)
    ElMessage.success('问题已删除')
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message || '删除失败')
  } finally {
    deletingBugId.value = null
  }
}
async function changeBugStatus(bug, status) {
  if (!bug || statusUpdatingBugId.value || bugStatus(bug) === status) return false
  const reactivating = isBugResolved(bug) && status === 'action'
  statusUpdatingBugId.value = bug.id
  try {
    await updateBugStatus(bug.id, status)
    if (reactivating) bugExpansion.value.set(String(bug.id), true)
    ElMessage.success(reactivating ? '已重新激活，加入逐条处理' : { resolved: '已解决', action: '已标记需处理', open: '已取消处理标记' }[status])
    return true
  } catch (e) {
    ElMessage.error(e.message || '状态更新失败')
    return false
  } finally {
    statusUpdatingBugId.value = null
  }
}
const replyUploader = ref(null)
const replyInput = ref(null)
// ---- 等客户验收 ----
const awaitsCustomer = computed(() => awaitingCustomer(props.order))
// 从记录里找最近一次改成「待验收」的时间，算交付几天了
const reviewDays = computed(() => {
  if (!awaitsCustomer.value) return 0
  const last = [...recordItems.value].reverse().find((t) => t.type === 'status' && String(t.content || '').includes('待验收'))
  const t = last && new Date(String(last.time || '').replace(' ', 'T'))
  if (!t || Number.isNaN(t.getTime())) return 0
  return Math.max(0, Math.floor((Date.now() - t.getTime()) / 86400000))
})
const acceptNudged = computed(() => awaitsCustomer.value && nudgedToday(props.order, chatItems.value))
const nudgingAccept = ref(false)
async function doAcceptNudge() {
  if (nudgingAccept.value) return
  nudgingAccept.value = true
  try {
    await nudgeCustomerAccept(props.order)
    scrollChatBottom(true)
  } catch (e) {
    ElMessage.error(e.message || '提醒失败')
  } finally {
    nudgingAccept.value = false
  }
}
// 催款话术：老板、还欠款、没取消的项目才有
const canDun = computed(() => isBoss.value && props.order?.status !== 'cancelled' && owed(props.order) > 0)
const replyReady = computed(() => !replying.value && !draft.attachmentWaitList?.length && (replyText.value.trim() || replyFiles.value.length))
function addReplyFiles(files) {
  replyUploadOpen.value = true
  replyUploader.value?.addFiles(files)
}
async function sendReply() {
  if (!replyReady.value) return
  try {
    await sendDraft(draft, ({content, attachments}) => addProgress(props.order.id, content, 'reply', attachments))
    ElMessage.success('已发送给客户')
    scrollChatBottom(true)
  } catch (e) {
    ElMessage.error(e.message || '发送失败')
  }
}
function avatarOf(t) {
  return (t.user || (t.type === 'reply' ? currentMember.value.name : '客')).slice(0, 1)
}
function recordText(t) {
  let c = String(t.content || '')
  const user = String(t.user || '')
  if (user && c.startsWith(user + ' ')) c = c.slice(user.length + 1)
  if (t.type === 'create' && c === '创建订单') return '新建了这个项目'
  if (t.type === 'status') return c.replace(/^状态更新为/, '把状态改成')
  return c
}
function dotColor(type) {
  return { create: '#909399', status: '#409eff', note: '#67c23a', message: '#e6a23c', reply: '#409eff' }[type] || '#909399'
}
</script>

<style scoped>
.issue-awaiting,.bug-summary-status.status-confirm {color:#865500;background:#fff1d8;border-radius:6px;padding:3px 7px;font-size:12px}
.detail-handling { flex:none; padding:6px 16px; background:#f7f9fd; }
.workspace-next { flex: 0 0 auto; margin: 12px 16px 0; }
.chat-unbound { margin: 0 0 8px; padding: 8px 10px; border-radius: 8px; background: #fff7e8; color: #9a6a1c; font-size: 12px; line-height: 1.6; }
/* 等客户验收的提示条：一句话 + 一个按钮 */
.chat-await { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; margin: 0 0 8px; padding: 6px 10px; border-radius: 8px; background: #eef5ff; color: #33507a; font-size: 12px; line-height: 1.6; }
.chat-await .el-button { flex: none; margin: 0; }
.mention-row { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; font-size: 12px; color: #8591a4; }
.mention-chip { font: inherit; font-size: 12px; padding: 2px 10px; border-radius: 12px; border: 1px solid #d9e1ec; background: #fff; color: #4a5a75; cursor: pointer; }
.mention-chip:hover { border-color: #165dff; color: #165dff; }
.mention-chip.on { background: #165dff; border-color: #165dff; color: #fff; }
.t-mentions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
.t-mentions span { font-size: 12px; padding: 0 8px; border-radius: 10px; background: #f2f3f5; color: #8a94a6; }
.t-mentions span.read { background: #edf9f0; color: #3a9b5c; }

.head-note { font-size: 12px; font-weight: 400; color: #909399; margin-left: 6px; }

:deep(.el-drawer__body) {
  height: 100%;
  padding: 0;
  overflow: hidden;
  background: #f5f7fb;
}
:deep(.order-workspace-drawer) {
  background: #f5f7fb;
}
.workspace {
  display: flex;
  flex-direction: column;
  height: 100vh;
  min-width: 0;
  color: #303133;
}
.workspace-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 16px 24px;
  background: #fdfefe;
  border-bottom: 1px solid #e4e7ed;
  box-shadow: 0 1px 8px rgba(31, 45, 61, 0.05);
  flex: 0 0 auto;
}
.title-block {
  min-width: 260px;
}
.title-line {
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
}
.title-line h2 {
  margin: 0;
  color: #1f2d3d;
  font-size: 22px;
  font-weight: 700;
  line-height: 1.25;
}
.order-no {
  color: #a8abb2;
  font-size: 13px;
}
.head-tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 8px;
}
.head-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}
.inline-label {
  color: #909399;
  font-size: 13px;
}
.status-select {
  width: 124px;
}
.close-btn {
  margin-left: 4px;
}
.workspace-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(360px, 420px);
  gap: 16px;
  min-height: 0;
  padding: 16px;
  flex: 1;
}
.left-pane,
.right-pane {
  min-width: 0;
  min-height: 0;
}
.left-pane {
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: auto;
  padding-right: 2px;
}
.right-pane {
  display: flex;
}
.panel {
  background: #fdfefe;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(31, 45, 61, 0.05);
}
.overview-panel {
  padding: 14px;
}
.left-grid {
  display: grid;
  grid-template-columns: minmax(360px, 1fr) minmax(360px, 1fr);
  gap: 16px;
  align-items: start;
}
.bug-panel,
.record-panel {
  padding: 14px;
}
.chat-panel {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  padding: 14px;
}
.section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.section-head.compact {
  margin-bottom: 10px;
}
.section-head h3 {
  margin: 0;
  font-size: 16px;
  color: #303133;
}
.section-head p {
  margin: 4px 0 0;
  color: #909399;
  font-size: 12px;
}
.sync-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sync-state {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #67c23a;
  font-size: 12px;
}
.sync-state i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}
.sync-state.reconnecting {
  color: #e6a23c;
}
.desc {
  margin-bottom: 12px;
}
:deep(.desc .el-descriptions__label) {
  width: 96px;
  color: #606266;
  font-weight: 600;
}
:deep(.desc .el-descriptions__content) {
  color: #303133;
}
/* 负责人：下拉菜单自带 14px 字号和顶对齐，在表格里要跟其他格子一样大、一样居中 */
.desc :deep(.el-dropdown),
.desc :deep(.assign-trigger) { font-size: inherit; line-height: inherit; vertical-align: baseline; color: inherit; }
.inline-assign { font-size: inherit; line-height: inherit; }
.inline-assign.clickable { cursor: pointer; border-radius: 4px; padding: 0 2px; margin: 0 -2px; }
.inline-assign.clickable:hover { background: #eef4ff; }
.requirement-edit { width: 100%; }
.revision-plus { margin-left: 6px; padding: 0 4px; }
.title-line h2 :deep(.inline-edit-form) { max-width: 420px; }
.title-line h2 :deep(.inline-edit) { white-space: nowrap; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
.requirement {
  white-space: pre-wrap;
  word-break: break-word;
}
.inline-tag {
  margin-left: 6px;
}
.pay-text {
  margin: 0 8px;
}
.approval-banner {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}
.ab-title {
  font-size: 13px;
  font-weight: 600;
  color: #e6a23c;
}
.red {
  color: #f56c6c;
  font-weight: 600;
}
.gallery {
  margin-top: 10px;
}
.gallery-label {
  font-size: 13px;
  color: #606266;
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 8px;
}
.chat-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  background: #f5f7fa;
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 12px;
}
.chat-row {
  display: flex;
  gap: 8px;
  margin: 10px 0;
}
.chat-row.team {
  flex-direction: row-reverse;
}
.avatar {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  color: #fdfefe;
  background: #909399;
  font-weight: 600;
  flex: 0 0 auto;
}
.chat-row.team .avatar {
  background: #409eff;
}
.bubble-wrap {
  max-width: 78%;
}
.meta {
  display: flex;
  gap: 8px;
  color: #909399;
  font-size: 12px;
  margin-bottom: 4px;
}
.chat-row.team .meta {
  justify-content: flex-end;
}
.meta em {
  font-style: normal;
  color: #c0c4cc;
}
.bubble {
  background: #fdfefe;
  border-radius: 8px;
  padding: 9px 11px;
  color: #303133;
}
/* 自己人发的消息：蓝底白字（以前这里是浅蓝底，和全局样式的白字叠在一起，自己发的话几乎看不见） */
.chat-row.team .bubble {
  background: #165dff;
  color: #fff;
}
.bubble p {
  margin: 0 0 6px;
  white-space: pre-wrap;
}
.empty {
  text-align: center;
  color: #a8abb2;
  font-size: 13px;
  padding: 18px 0;
}
.composer,
.bug-form,
.add-progress {
  margin-bottom: 12px;
}
.composer {
  flex: 0 0 auto;
  border-top: 1px solid #ebeef5;
  padding-top: 12px;
}
.bug-navigator {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0 0 10px;
  scroll-margin-block: 12px;
  font-size: 13px;
}
.bug-navigator strong { margin-right: auto; color: #334962; }
.bug-navigator button {
  min-height: 32px;
  padding: 3px 9px;
  border: 1px solid #d7e2f0;
  border-radius: 7px;
  color: #34557d;
  background: white;
  font: inherit;
  cursor: pointer;
}
.bug-navigator .begin-processing { color: #1454bb; background: #eef5ff; border-color: #c6dafa; }
.bug-navigator button:disabled { color: #8491a0; cursor: default; opacity: .65; }
.bug-panel .section-head > div:first-child { display: flex; align-items: center; gap: 8px; flex-wrap: wrap }
.issue-filters {
  display: grid;
  gap: 5px;
  margin: 0 0 12px;
}
.issue-filter-row { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; }
.issue-filter-row > span { margin-right: 3px; color: #606e82; font-size: 12px; }
.issue-filter-row button, .clear-issue-filters {
  border: 0; border-radius: 7px; background: transparent; color: #465872;
  min-height: 30px; padding: 4px 9px; font: inherit; font-size: 13px; cursor: pointer;
}
.issue-filter-row button:hover, .clear-issue-filters { background: #f0f5ff; color: #2158b1; }
.issue-filter-row button[aria-pressed=true] { background: #e5eeff; color: #164db1; font-weight: 650; }
.issue-filter-row button:focus-visible, .clear-issue-filters:focus-visible { outline: 2px solid #3976dc; outline-offset: 1px; }
.bug-summary-counts time { font-variant-numeric: tabular-nums; }
.bug-fold-all { border: 0; background: none; padding: 4px; color: var(--el-color-primary); font: inherit; font-size: 13px; cursor: pointer }
.bug-reactivate { padding: 3px 8px; margin-block: 2px 4px; border-radius: 6px; border: 1px solid #b8cbea; background: white; color: #235ca6; font: inherit; font-size: 13px; cursor: pointer }
.bug-reactivate:disabled { opacity: .6; cursor: default }
.bug-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}
.bug-item {
  min-width: 0;
  padding: 10px;
  background: #f7f9fc;
  border: 1px solid #ebeef5;
  border-radius: 8px;
}
.bug-disclosure {
  display: flex;
  align-items: baseline;
  gap: 8px;
  width: 100%;
  min-height: 32px;
  padding: 4px 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #303133;
  text-align: start;
  font: inherit;
  cursor: pointer;
}
.bug-disclosure:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }
.bug-summary-title { flex: 1; min-width: 0; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; }
.bug-disclosure[aria-expanded="false"] .bug-summary-title { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.bug-summary-status, .bug-disclosure-label { flex: none; font-size: 12px; }
.bug-summary-status { color: #626a77; }
.bug-summary-status.status-action { color: #ab5817; }
.bug-summary-status.status-resolved { color: #337448; }
.bug-disclosure-label { display: inline-flex; align-items: center; gap: 3px; color: #315b9a; }
.bug-disclosure[aria-expanded="true"] .el-icon { transform: rotate(180deg); }
.bug-summary-counts { display: flex; flex-wrap: wrap; gap: 10px; color: #626a77; font-size: 12px; }
.bug-summary-previews { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-top: 6px; }
.bug-summary-previews button { border: 0; padding: 6px; background: none; color: var(--el-color-primary); font: inherit; font-size: 13px; cursor: pointer; }
.bug-details { display: flex; align-items: flex-start; gap: 10px; padding-top: 4px; }
.workspace-body .notice-target {
  outline: 2px solid var(--el-color-primary);
  outline-offset: -2px;
  border-radius: 8px;
  background-color: var(--el-color-primary-light-9);
  scroll-margin-block: 16px;
}
.bug-item.is-resolved {
  background: #f6fbf7;
  border-color: #c8e6c9;
}
.bug-item.is-resolved .bug-body p {
  color: #606266;
}
.bug-body {
  flex: 1;
  min-width: 0;
}
.bug-body p {
  margin: 0 0 8px;
  color: #303133;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
.bug-meta {
  margin-top: 8px;
  color: #a8abb2;
  font-size: 12px;
}
.bug-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex: 0 0 auto;
}
.bug-status {
  margin-bottom: 2px;
}
.bug-status :deep(.el-radio-button__inner) {
  padding: 5px 9px;
  font-size: 12px;
}
.bug-updates {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed #dcdfe6;
}
.bug-update {
  padding: 9px 10px;
  background: #fdfefe;
  border: 1px solid #ebeef5;
  border-radius: 8px;
}
.bug-update p {
  margin: 4px 0 8px;
  color: #303133;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
.update-meta {
  color: #909399;
  font-size: 12px;
}
.bug-update-form {
  margin-top: 10px;
  padding: 10px;
  background: #fdfefe;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
}
.bug-update-form .el-button {
  width: 100%;
}
.note-upload {
  margin: 8px 0;
}
.composer .el-button,
.bug-form .el-button,
.add-progress .el-button {
  width: 100%;
}
.timeline {
  padding-left: 2px;
}
.t-user {
  font-weight: 600;
  color: #409eff;
  margin-right: 4px;
}
.t-imgs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}
.muted {
  color: #c0c4cc;
}

@media (max-width: 1180px) {
  .workspace-head {
    align-items: flex-start;
    flex-direction: column;
  }
  .head-actions {
    justify-content: flex-start;
  }
  .workspace-body {
    grid-template-columns: 1fr;
    overflow: auto;
  }
  .left-pane {
    overflow: visible;
  }
  .right-pane {
    min-height: 520px;
  }
}

@media (max-width: 860px) {
  .workspace-body {
    padding: 10px;
  }
  .left-grid {
    grid-template-columns: 1fr;
  }
  :deep(.desc .el-descriptions__body) {
    overflow-x: auto;
  }
}

/* 手机端（<= 768px）：头部压缩、所有区块单列、不出现横向滚动；电脑端不受影响 */
@media (max-width: 768px) {
  .workspace {
    height: 100vh; /* 旧浏览器兜底 */
    height: 100dvh; /* 手机地址栏收放时，底部输入框不被挡住 */
  }
  .workspace-head {
    position: relative;
    align-items: stretch;
    gap: 8px;
    padding: 12px 14px;
  }
  .title-block {
    min-width: 0;
    padding-right: 44px; /* 给右上角的关闭按钮留位置 */
  }
  .title-line {
    gap: 2px 8px;
  }
  .title-line h2 {
    min-width: 0;
    font-size: 18px;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  .order-no {
    font-size: 12px;
  }
  .head-tags {
    gap: 6px;
    margin-top: 6px;
  }
  .head-tags .el-tag {
    max-width: 100%;
  }
  .head-tags :deep(.el-tag__content) {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .head-actions-m {
    gap: 8px;
  }
  .head-actions-m .el-button {
    margin-left: 0;
  }
  .head-actions-m .el-button:not(.is-circle) {
    padding: 8px 12px;
  }
  .head-actions-m .close-btn {
    position: absolute;
    top: 8px;
    right: 10px;
    width: 36px;
    height: 36px;
    margin: 0;
  }

  .workspace-body {
    grid-template-columns: minmax(0, 1fr);
    /* 两块上下排：行高跟着内容走，整个区域自己滚动。
       否则两行会被压成容器的一半高，聊天区盖住订单信息 */
    grid-auto-rows: max-content;
    align-content: start;
    gap: 10px;
    padding: 10px 10px calc(10px + env(safe-area-inset-bottom));
    overflow-x: hidden;
    overscroll-behavior: contain;
  }
  .left-pane {
    gap: 10px;
  }
  .bug-panel,
  .record-panel {
    min-width: 0;
  }
  .left-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
  }
  .right-pane {
    min-height: 0;
  }
  .overview-panel,
  .bug-panel,
  .record-panel,
  .chat-panel {
    padding: 12px;
  }
  .section-head {
    gap: 8px;
    margin-bottom: 10px;
  }
  .section-head h3 {
    font-size: 15px;
  }

  /* 订单信息：一列，标签窄一点 */
  :deep(.desc .el-descriptions__label) {
    width: 72px;
  }
  :deep(.desc .el-descriptions__content) {
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  /* 问题清单：操作按钮挪到内容下面一排，别把正文挤窄 */
  .bug-details {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  .bug-actions {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-start;
    gap: 4px 8px;
    padding-top: 8px;
    border-top: 1px dashed #dcdfe6;
  }
  .bug-status {
    margin-bottom: 0;
  }
  .bug-actions .el-button {
    margin-left: 0;
    padding: 6px 8px;
  }
  .bug-meta {
    overflow-wrap: anywhere;
  }
  .update-meta {
    overflow-wrap: anywhere;
  }

  /* 内部记录时间线：长文字、长网址要能换行 */
  .timeline :deep(.el-timeline-item__content) {
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  /* 客户沟通：气泡不撑出屏幕；列表限高后在里面滚动，新消息自动滚到底 */
  .chat-panel {
    min-width: 0; /* 附件文件名很长时，别把整块撑得比屏幕宽 */
  }
  .chat-list {
    min-height: 160px;
    max-height: 60vh;
    max-height: 60dvh;
  }
  .bubble-wrap {
    min-width: 0;
    max-width: 84%;
  }
  .meta {
    flex-wrap: wrap;
    gap: 0 8px;
  }
  .bubble p {
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  /* 语音附件播放条默认 300px 宽，手机上最多占满所在行 */
  .workspace :deep(audio) {
    max-width: 100%;
  }
  /* 输入框字号 16px，避免 iPhone 点进去时整页被放大 */
  .workspace :deep(.el-textarea__inner) {
    font-size: 16px;
  }
}
.workspace .composer .note-upload{max-height:min(16vh,105px);overflow:auto}
@media(max-width:768px){
  .workspace.chat-workspace{overflow:hidden}
  .workspace.chat-workspace .workspace-body{display:flex;flex:1!important;min-height:0;overflow:hidden!important}
  .workspace.chat-workspace .chat-list{min-height:0;max-height:none}
}
.board-composer .reply-input {flex:1;min-width:0}
.workspace-tabs{display:flex;gap:6px;padding:5px 16px;background:white;border-bottom:1px solid #e4ebf5}.workspace-tabs button{border:0;border-radius:8px;background:transparent;padding:5px 14px;color:#526783;cursor:pointer}.workspace-tabs [aria-pressed=true]{color:#165dff;background:#edf3ff;font-weight:650}
@media(min-width:769px){
  .workspace-body:not([data-desktop-tab="all"]){display:flex;overflow:hidden}
  .workspace-body:not([data-desktop-tab="all"])>.left-pane,.workspace-body:not([data-desktop-tab="all"])>.right-pane{flex:1}
  .workspace-body[data-desktop-tab="chat"]>.left-pane,.workspace-body:not([data-desktop-tab="all"]):not([data-desktop-tab="chat"])>.right-pane,
  .workspace-body[data-desktop-tab="overview"] .left-grid,.workspace-body[data-desktop-tab="internal"] .overview-panel,.workspace-body[data-desktop-tab="internal"] .bug-panel,
  .workspace-body[data-desktop-tab="bugs"] .overview-panel,.workspace-body[data-desktop-tab="bugs"] .record-panel{display:none}
  .workspace-body:not([data-desktop-tab="all"]):not([data-desktop-tab="overview"]) .left-grid{display:block}
}
</style>
<style>.el-drawer.order-workspace-drawer>.el-drawer__body{padding:0;overflow:hidden}</style>
