<template>
  <div class="workbench">
    <OrdersLoading v-if="!ordersReady" />
    <section v-else-if="isMobile" class="board-workbench" :class="isBoss?'boss-workbench':'employee-workbench'">
      <header class="wb-person wb-person-compact"><BoardAvatar :role="isBoss?'boss':'employee'" :size="40"/><div><h1>{{ currentMember.name }}，{{ greeting }}</h1></div><PendingBell /></header>
      <template v-if="isBoss">
        <section class="wb-stat-panel"><button v-for="(s,i) in overview" :key="s.label" :class="'tone-'+i" @click="router.push(s.path)"><span class="stat-symbol"><el-icon><component :is="s.icon"/></el-icon></span><div><small>{{ s.label }}</small><strong>{{ s.value }}</strong></div></button></section>
        <section class="wb-shortcuts wb-shortcuts-5"><button @click="openDialog()"><span><el-icon><Plus/></el-icon></span>新建项目</button><button @click="router.push('/quotes')"><span><el-icon><PriceTag/></el-icon><i v-if="unreadQuotes.length" class="shortcut-badge">{{ unreadQuotes.length }}</i></span>报价中心</button><button @click="router.push('/approvals')"><span><el-icon><Finished/></el-icon><i v-if="pendingApprovals.length" class="shortcut-badge">{{ pendingApprovals.length }}</i></span>审批中心</button><button @click="router.push('/customers')"><span><el-icon><User/></el-icon></span>客户账号</button><button @click="router.push('/dashboard')"><span><el-icon><DataLine/></el-icon></span>数据统计</button></section>
      </template>
      <!-- 需要我处理：老板和员工同一份清单（审批、拒单、客户消息、下一步、验收……），每条直接带处理按钮 -->
      <section class="wb-todos">
        <div class="board-section-title"><h2>需要我处理</h2><span class="section-actions"><button v-if="unreadCount" :disabled="marking" @click="readAll">全部已读</button><button v-if="todoItems.length > MOBILE_TODO_LIMIT" @click="todoExpanded=!todoExpanded">{{ todoExpanded ? '收起' : '全部 ' + todoItems.length + ' 条' }} <el-icon><component :is="todoExpanded ? 'ArrowUp' : 'ArrowDown'"/></el-icon></button><button v-else @click="router.push('/order')">查看项目 <el-icon><ArrowRight/></el-icon></button></span></div>
        <template v-for="t in mobileTodos" :key="t.key">
          <ApprovalItem v-if="t.kind === 'approval'" :a="t.approval"/>
          <div v-else class="wb-todo" role="button" tabindex="0" @click="openTodo(t)" @keydown.enter.self="openTodo(t)">
            <span class="todo-symbol"><el-icon><component :is="todoIcon(t)"/></el-icon></span>
            <div>
              <h3>{{ t.order.title }}</h3>
              <p>{{ t.text }}</p>
              <p v-if="todoDeadline(t)" class="todo-deadline"><el-icon><Calendar/></el-icon>截止：{{ todoDeadline(t) }}</p>
              <div class="wb-todo-actions" @click.stop>
                <template v-if="t.kind === 'newIssues'">
                  <el-button size="small" @click.stop="openTodo(t)">查看</el-button>
                  <el-button size="small" type="primary" :loading="finishing === t.key" @click.stop="takeIssues(t)">都加入处理</el-button>
                </template>
                <template v-else-if="t.kind === 'assign'">
                  <el-button size="small" type="primary" :loading="accepting === t.order.id" :aria-label="'接收：' + t.order.title" @click="doAccept(t.order)">接收</el-button>
                  <el-button size="small" @click="openReject(t.order)">拒绝…</el-button>
                </template>
                <template v-else-if="isBoss && (t.kind === 'returned' || t.kind === 'request')">
                  <AssignMenu :order="t.order"><el-button size="small" type="primary">{{ t.kind === 'returned' ? '改派给…' : '派给…' }}</el-button></AssignMenu>
                  <el-button size="small" :loading="acting === t.order.id" @click="doMyself(t.order)">我自己做</el-button>
                </template>
                <template v-else>
                  <el-button v-if="t.kind === 'urgent' || t.kind === 'manual'" size="small" type="primary" plain :loading="finishing === t.key" @click="finishPending(t)">标为已处理</el-button>
                  <el-button v-else-if="t.kind === 'reply'" size="small" type="primary" @click="openDetail(t.order, 'chat')">回复</el-button>
                  <template v-else-if="t.kind === 'mention' || t.kind === 'nudge'">
                    <el-button size="small" type="primary" plain @click.stop="openTodo(t)">{{ t.kind === 'mention' ? '查看' : '写进展' }}</el-button>
                    <el-button size="small" :disabled="acknowledging.has(t.order.id)" @click.stop="acknowledge(t.order)">知道了</el-button>
                  </template>
                  <el-button v-else-if="t.kind === 'next' && isMyNext(t.order)" size="small" type="success" :loading="completing === t.order.id" :aria-label="'完成这一步：' + t.order.title" @click="quickCompleteNext(t.order)">完成这一步</el-button>
                  <el-button v-else-if="naOf(t.order)" size="small" type="primary" :loading="acting === t.order.id" :aria-label="naOf(t.order).label + '：' + t.order.title" @click="mobileNext(t.order)">{{ naOf(t.order).label }}</el-button>
                  <!-- 交付了客户还没点验收：一键催 -->
                  <el-button v-if="t.kind === 'review' && awaitingCustomer(t.order)" size="small" plain :loading="nudgingAccept === t.order.id" @click="quickAcceptNudge(t.order)">{{ acceptNudged(t.order) ? '今天已催' : '催客户验收' }}</el-button>
                  <AssignMenu v-if="isBoss" :order="t.order"/>
                </template>
              </div>
            </div>
            <el-tag :type="statusMap[t.order.status]?.type" size="small">{{ statusMap[t.order.status]?.label }}</el-tag><el-icon><ArrowRight/></el-icon>
          </div>
        </template>
        <p v-if="!mobileTodos.length" class="todo-empty todo-empty-m">今日暂无待办</p>
      </section>
      <!-- 报价单放在待办下面（以前排在最上面）；没有报价单时只占一行 -->
      <QuotePanel embedded/>
      <template v-if="!isBoss">
        <!-- 待接收的项目已经在上面「需要我处理」里，这里不再重复列一遍 -->
        <nav class="board-tabs"><button v-for="t in employeeTabs" :key="t.key" :class="{active:employeeTab===t.key}" @click="employeeTab=t.key">{{ t.label }} <b>{{ t.count }}</b></button></nav>
        <div class="board-section-title"><h2>{{ employeeTabs.find(t=>t.key===employeeTab)?.label }}项目（{{ employeeOrders.length }}）</h2></div>
        <article v-for="o in employeeOrders" :key="o.id" class="employee-project"><ProjectCover :order="o" compact/><div class="employee-project-copy"><h3>{{ o.title }}</h3><!-- 截止日期直接写在卡片上（以前要点进详情才知道哪天交）；需求和项目名一样时不重复写 --><p>客户：{{ o.customer || '未填写' }}<template v-if="o.deadline"> · <span :class="{'due-late':isOverdue(o)}">{{ isOverdue(o) ? '已逾期（' + shortDue(o.deadline) + '）' : '截止 ' + shortDue(o.deadline) }}</span></template></p><p v-if="o.nextStep" class="two-lines">下一步<template v-if="memberMap[o.nextOwnerId] && o.nextOwnerId !== currentMember.id">（{{ memberMap[o.nextOwnerId].name }}）</template>：{{ o.nextStep }}<template v-if="o.nextDue"> · {{ shortDue(o.nextDue) }}前</template></p><p v-else-if="cardDesc(o)" class="two-lines">{{ cardDesc(o) }}</p><div class="employee-actions"><el-button @click="openDetail(o)">查看详情</el-button><el-button v-if="naOf(o)" type="primary" :loading="acting===o.id" :aria-label="naOf(o).label+'：'+o.title" @click="mobileNext(o)">{{ naOf(o).label }}</el-button></div></div></article>
        <el-empty v-if="!employeeOrders.length" :description="todoItems.length ? '没有别的项目了，要处理的都在上面' : '暂无项目'" :image-size="72"/>
        <section v-if="myRequests.length" class="employee-requests"><div class="board-section-title"><h2>我的申请</h2><button @click="router.push('/approvals')">查看全部 <el-icon><ArrowRight/></el-icon></button></div><ApprovalItem v-for="a in myRequests.slice(0,2)" :key="a.id" :a="a"/></section>
      </template>
      <!-- 快被忘了：待确认 / 进行中、超过 N 天没有任何动静的项目 -->
      <section v-if="stalledList.length" class="wb-todos wb-stalled"><div class="board-section-title"><h2>快被忘了</h2><span class="stalled-tip">超过 {{ collab.stallDays }} 天没动静</span></div><div v-for="s in stalledList.slice(0, stalledExpanded ? undefined : 4)" :key="'s'+s.o.id" class="wb-todo" role="button" tabindex="0" @click="openDetail(s.o)" @keydown.enter.self="openDetail(s.o)"><span class="todo-symbol stalled-symbol"><el-icon><Clock/></el-icon></span><div><h3>{{ s.o.title }}</h3><p>{{ s.days }} 天没有任何记录 · {{ s.o.ownerId === currentMember.id ? '我负责' : ownerName(s.o) }}</p><div class="wb-todo-actions" @click.stop><el-button v-if="s.o.ownerId !== currentMember.id" size="small" :icon="Bell" @click="quickNudge(s.o)">催一下</el-button><el-button v-else size="small" type="primary" plain @click="openDetail(s.o, 'internal')">写进展</el-button></div></div><el-tag type="warning" size="small">{{ statusMap[s.o.status]?.label }}</el-tag><el-icon><ArrowRight/></el-icon></div><button v-if="stalledList.length > 4" class="stalled-more" @click="stalledExpanded = !stalledExpanded">{{ stalledExpanded ? '收起' : '展开其余 ' + (stalledList.length - 4) + ' 个' }}</button></section>
    </section>
    <div v-else class="desktop-workbench">
    <!-- 数字卡一行；常用页面都在左侧菜单里，这里只留「新建项目」 -->
    <div class="overview-row">
      <div class="overview-stats">
        <button class="overview-stat" v-for="s in overview" :key="s.label" @click="router.push(s.path)"><el-icon><component :is="s.icon" /></el-icon><div><small>{{ s.label }}</small><strong>{{ s.value }}</strong></div></button>
      </div>
      <el-button type="primary" size="large" :icon="Plus" class="overview-create" @click="openDialog()">新建项目</el-button>
    </div>

    <!-- 员工：还在等老板批的申请（批完的结果会发消息，不在这里堆着） -->
    <template v-if="!isBoss && myRequests.length">
      <div class="section-title gray-bar">
        <span>我的申请</span>
        <span class="team-tip">审批通过后生效</span>
      </div>
      <div class="approval-list">
        <ApprovalItem v-for="a in myRequests" :key="a.id" :a="a" />
      </div>
    </template>

    <!-- 需要我处理：审批、员工拒单、客户新需求和消息、下一步、验收、逾期……都在这一处 -->
    <div class="section-title red-bar">
      <span>需要我处理</span>
      <span class="todo-head-right">
        <el-button v-if="unreadCount" link type="primary" :loading="marking" @click="readAll">新动态全部已读（{{ unreadCount }}）</el-button>
        <el-button :icon="Refresh" link :loading="refreshing" aria-label="刷新" title="刷新" @click="refreshAll" />
        <el-tag v-if="todoItems.length" type="danger" effect="dark" round size="small">{{ todoItems.length }}</el-tag>
      </span>
    </div>
    <div v-if="todoItems.length" class="cards">
      <template v-for="t in shownTodos" :key="t.key">
        <ApprovalItem v-if="t.kind === 'approval'" :a="t.approval" />
        <div v-else class="row-card todo" :class="'todo-' + t.kind" @click="openTodo(t)">
          <span v-if="isUnread(t.order)" class="new-badge">NEW</span>
          <div class="rc-main">
            <div class="rc-title">
              {{ t.order.title }}
              <el-icon v-if="t.order.attachmentCount || (t.order.attachments && t.order.attachments.length)" class="pic"><Paperclip /></el-icon>
            </div>
            <div class="rc-reason">{{ t.text }}</div>
          </div>
          <div class="rc-meta">
            <!-- 按钮一行、状态和期限一行（电脑上这两层不占位，和原来一样排成一行） -->
            <div class="rc-actions">
              <template v-if="t.kind === 'newIssues'">
                  <el-button size="small" @click.stop="openTodo(t)">查看</el-button>
                  <el-button size="small" type="primary" :loading="finishing === t.key" @click.stop="takeIssues(t)">都加入处理</el-button>
                </template>
                <template v-else-if="t.kind === 'assign'">
                <el-button size="small" type="primary" :loading="accepting === t.order.id" @click.stop="doAccept(t.order)">接收</el-button>
                <el-button size="small" @click.stop="openReject(t.order)">拒绝…</el-button>
              </template>
              <template v-else-if="isBoss && (t.kind === 'returned' || t.kind === 'request')">
                <AssignMenu :order="t.order"><el-button size="small" type="primary">{{ t.kind === 'returned' ? '改派给…' : '派给…' }}</el-button></AssignMenu>
                <el-button size="small" :loading="acting === t.order.id" @click.stop="doMyself(t.order)">我自己做</el-button>
              </template>
              <template v-else>
                <el-button v-if="t.kind === 'urgent' || t.kind === 'manual'" size="small" type="primary" plain :loading="finishing === t.key" @click.stop="finishPending(t)">标为已处理</el-button>
                <el-button v-else-if="t.kind === 'reply'" size="small" type="primary" :icon="ChatDotRound" @click.stop="openDetail(t.order, 'chat')">回复</el-button>
                <template v-else-if="t.kind === 'mention' || t.kind === 'nudge'">
                    <el-button size="small" type="primary" plain @click.stop="openTodo(t)">{{ t.kind === 'mention' ? '查看' : '写进展' }}</el-button>
                    <el-button size="small" :disabled="acknowledging.has(t.order.id)" @click.stop="acknowledge(t.order)">知道了</el-button>
                  </template>
                <el-button
                  v-else-if="t.kind === 'next' && isMyNext(t.order)"
                  size="small"
                  type="success"
                  :icon="Check"
                  :loading="completing === t.order.id"
                  @click.stop="quickCompleteNext(t.order)"
                >完成这一步</el-button>
                <el-button
                  v-else-if="naOf(t.order)"
                  size="small"
                  type="primary"
                  :icon="Promotion"
                  @click.stop="quickNext(t.order)"
                >{{ naOf(t.order).label }}</el-button>
                <!-- 交付了客户还没点验收：一键催（客户沟通里留一条，同样的话复制好可以粘到微信） -->
                <el-button
                  v-if="t.kind === 'review' && awaitingCustomer(t.order)"
                  size="small"
                  plain
                  :loading="nudgingAccept === t.order.id"
                  :title="acceptNudged(t.order) ? '今天已经催过了，点一下再复制一遍，粘到微信发' : '在客户沟通里提醒客户验收，并把同样的话复制好'"
                  @click.stop="quickAcceptNudge(t.order)"
                >{{ acceptNudged(t.order) ? '今天已催' : '催客户验收' }}</el-button>
                <AssignMenu v-if="isBoss" :order="t.order" />
              </template>
            </div>
            <div class="rc-info">
              <el-tag size="small" :type="statusMap[t.order.status]?.type" effect="light">{{ statusMap[t.order.status]?.label }}</el-tag>
              <el-tag v-if="dueTag(t.order)" :type="dueTag(t.order).type" size="small" effect="dark">{{ dueTag(t.order).text }}</el-tag>
              <span v-if="t.order.deadline" class="rc-deadline" :class="{ red: isOverdue(t.order) }">
                <el-icon><Clock /></el-icon>{{ t.order.deadline }}
              </span>
            </div>
          </div>
        </div>
      </template>
    </div>
    <!-- 没有待办时只占一行，不再放一大块空白插图 -->
    <p v-else class="todo-empty">待办都清空啦 🎉</p>
    <el-button v-if="todoItems.length > TODO_LIMIT" text type="primary" class="team-toggle" @click="todosExpanded = !todosExpanded">
      {{ todosExpanded ? '收起' : `还有 ${todoItems.length - TODO_LIMIT} 条，展开` }}
    </el-button>

    <!-- 报价单放在待办下面（以前排在最上面）；没有报价单时只占一行 -->
    <QuotePanel embedded class="wb-quote-panel"/>

    <!-- 快被忘了：待确认 / 进行中、超过 N 天没动静 -->
    <template v-if="stalledList.length">
      <div class="section-title amber-bar">
        <span>快被忘了 · 超过 {{ collab.stallDays }} 天没动静</span>
        <el-tag type="warning" effect="dark" round size="small">{{ stalledList.length }}</el-tag>
      </div>
      <div class="cards">
        <div v-for="s in shownStalled" :key="'s' + s.o.id" class="row-card stalled" @click="openDetail(s.o)">
          <div class="rc-main">
            <div class="rc-title">{{ s.o.title }}</div>
            <div class="rc-reason amber">{{ s.days }} 天没有任何记录或进展 · {{ s.o.ownerId === currentMember.id ? '我负责' : ownerName(s.o) }}</div>
          </div>
          <div class="rc-meta">
            <div class="rc-actions">
              <el-button v-if="s.o.ownerId !== currentMember.id" size="small" :icon="Bell" @click.stop="quickNudge(s.o)">催一下</el-button>
              <el-button v-else size="small" type="primary" plain @click.stop="openDetail(s.o, 'internal')">写进展</el-button>
            </div>
            <div class="rc-info">
              <el-tag size="small" :type="statusMap[s.o.status]?.type" effect="light">{{ statusMap[s.o.status]?.label }}</el-tag>
            </div>
          </div>
        </div>
      </div>
      <el-button v-if="stalledList.length > listLimit" text type="primary" class="team-toggle" @click="stalledExpanded = !stalledExpanded">
        {{ stalledExpanded ? '收起' : `还有 ${stalledList.length - listLimit} 个，展开` }}
      </el-button>
    </template>

    <!-- 员工：我手上的（我负责、已接收、待开工 / 进行中） -->
    <template v-if="!isBoss && myHands.length">
      <div class="section-title blue-bar">
        <span>我手上的</span>
        <el-tag type="primary" effect="plain" round size="small">{{ myHands.length }}</el-tag>
      </div>
      <div class="cards">
        <div v-for="o in shownHands" :key="'h' + o.id" class="row-card hands" @click="openDetail(o)">
          <span v-if="isUnread(o)" class="new-badge">NEW</span>
          <div class="rc-main">
            <div class="rc-title">{{ o.title }}</div>
            <div class="rc-reason blue">{{ handReason(o) }}</div>
          </div>
          <div class="rc-meta">
            <div class="rc-actions">
              <el-button v-if="naOf(o)" size="small" type="primary" :icon="Promotion" @click.stop="quickNext(o)">{{ naOf(o).label }}</el-button>
              <el-button size="small" @click.stop="openDetail(o, 'internal')">写进展</el-button>
            </div>
            <div class="rc-info">
              <el-tag v-if="dueTag(o)" :type="dueTag(o).type" size="small" effect="dark">{{ dueTag(o).text }}</el-tag>
              <span v-if="o.deadline" class="rc-deadline" :class="{ red: isOverdue(o) }">
                <el-icon><Clock /></el-icon>{{ o.deadline }}
              </span>
            </div>
          </div>
        </div>
      </div>
      <el-button v-if="myHands.length > listLimit" text type="primary" class="team-toggle" @click="handsExpanded = !handsExpanded">
        {{ handsExpanded ? '收起' : `还有 ${myHands.length - listLimit} 个，展开` }}
      </el-button>
    </template>

    <!-- 老板：每个人手上有多少单，点进去只看这个人的（没单子的人默认收起） -->
    <template v-if="isBoss && team.length > 1">
      <div class="section-title blue-bar">
        <span>我的团队</span>
        <span class="team-tip">点一个人，只看 TA 手上的单子</span>
      </div>
      <div class="team">
        <div
          v-for="t in shownTeam"
          :key="t.m.id"
          class="member-card"
          :class="{ off: t.m.status !== '0' }"
          @click="goMember(t.m)"
        >
          <el-avatar :size="40" :style="{ background: t.m.color }">{{ t.m.name.slice(-1) }}</el-avatar>
          <div class="mc-body">
            <div class="mc-name">
              {{ t.m.id === currentMember.id ? '我自己' : t.m.name }}
              <span v-if="t.m.status !== '0'" class="mc-role off-tag">已停用</span>
            </div>
            <div class="mc-line">{{ memberLine(t) }}</div>
          </div>
        </div>
      </div>
      <el-button v-if="idleCount" text type="primary" class="team-toggle" @click="showIdle = !showIdle">
        {{ showIdle ? '收起空闲成员' : `还有 ${idleCount} 人手上没有单子，展开` }}
      </el-button>
    </template>

    <!-- 员工：已提交、等老板验收的 -->
    <template v-if="!isBoss && waitingList.length">
      <div class="section-title gray-bar">
        <span>等对方处理</span>
        <el-tag type="info" effect="plain" round size="small">{{ waitingList.length }}</el-tag>
      </div>
      <div class="cards">
        <div v-for="o in shownWaiting" :key="o.id" class="row-card waiting" @click="openDetail(o)">
          <div class="rc-main">
            <div class="rc-title">{{ o.title }}</div>
            <div class="rc-reason gray">{{ waitReasonFor(o) }}</div>
          </div>
          <div class="rc-meta">
            <div class="rc-actions">
              <el-button size="small" :icon="Bell" @click.stop="quickNudge(o)">催一下</el-button>
            </div>
            <div class="rc-info">
              <el-tag v-if="dueTag(o)" :type="dueTag(o).type" size="small" effect="dark">{{ dueTag(o).text }}</el-tag>
              <span v-if="o.deadline" class="rc-deadline" :class="{ red: isOverdue(o) }">
                <el-icon><Clock /></el-icon>{{ o.deadline }}
              </span>
            </div>
          </div>
        </div>
      </div>
      <el-button v-if="waitingList.length > listLimit" text type="primary" class="team-toggle" @click="waitingExpanded = !waitingExpanded">
        {{ waitingExpanded ? '收起' : `还有 ${waitingList.length - listLimit} 个，展开` }}
      </el-button>
    </template>

    </div>
    <OrderDetail :key="active?.id"
      v-model:visible="detailVisible"
      :order="active"
      :loading="detailLoading" :has-previous="hasPrevious" :has-next="hasNext" @navigate="moveDetail"
      :notice-tab="detailTab"
      :notice-item="detailIssueId"
      @edit="openDialog"
      @delete="handleDelete"
      @notebook="openNotebook"
    />
    <NotebookDialog v-model:visible="notebookVisible" :order="notebookOrder" />
    <DeliveryDialog v-model:visible="deliveryVisible" :order="deliveryOrder" :target="deliveryTarget" />
    <OrderDialog v-model:visible="dialogVisible" :data="editing" :save="handleSave" />
    <ReasonDialog
      v-model:visible="rejectVisible"
      title="拒绝这个项目"
      :tip="rejecting ? `「${rejecting.title}」会交回重新安排，对方会看到你写的原因。` : ''"
      placeholder="写一下为什么不接，比如：这周排满了"
      confirm-text="拒绝"
      danger
      :submit="doReject"
    />
  </div>
</template>

<script setup>
import OrdersLoading from '@/components/OrdersLoading.vue'
import { ordersReady } from '@/mock/store'
import QuotePanel from '@/views/quotes/index.vue'
import {unreadQuotes, markInboxRead} from '@/stores/quotes'
import PendingBell from '@/components/PendingBell.vue'
import BoardAvatar from '@/components/board/BoardAvatar.vue'
import ProjectCover from '@/components/ProjectCover.vue'
import { isMobile } from '@/utils/useMobile'
import { ref, computed } from 'vue'
import { ElMessageBox } from 'element-plus'
import { toast as ElMessage } from '@/utils/toast'
import { Paperclip, Clock, Refresh, Promotion, Bell, Check, ChatDotRound, Plus } from '@element-plus/icons-vue'
import { useProjectDetail } from '@/utils/useProjectDetail'
import OrderDetail from '@/views/order/components/OrderDetail.vue'
import OrderDialog from '@/views/order/components/OrderDialog.vue'
import NotebookDialog from '@/components/NotebookDialog.vue'
import AssignMenu from '@/components/AssignMenu.vue'
import ApprovalItem from '@/components/ApprovalItem.vue'
import ReasonDialog from '@/components/ReasonDialog.vue'
import DeliveryDialog from '@/components/DeliveryDialog.vue'
import { syncQuotes } from '@/stores/quotes'
import { finishNext, finishPendingWithUndo, trashWithUndo } from '@/utils/orderUndo'
import { changeOrderStatus } from '@/utils/settle'
import { useRouter } from 'vue-router'
import {
  orders, approvals, pendingApprovals, getOrder, currentMember, isBoss, editOrder, createOrder, nudge,
  markRead, colleagueSentHint, acceptOrder, rejectOrder, syncOrders, loadApprovals, collab, setNextStep
} from '@/mock/store'
import { statusMap, MEMBERS, memberMap } from '@/constants/options'
import { isWaitingOther, nextAction, stalledDays, shortDue } from '@/utils/workbench'
import { undoToast } from '@/utils/undoToast'
import { updateBugStatus } from '@/mock/store'
import { todoItems, todoOrderIds, isMyNextStep } from '@/utils/todos'
import { owed, money } from '@/utils/payment'
import { awaitingCustomer, nudgedToday, nudgeCustomerAccept, copyAcceptNudge } from '@/utils/customerNudge'
import { todayStr as todayLocal } from '@/utils/date'

const router = useRouter()
const todayStr = todayLocal()
const isOverdue = (o) =>
  ['pending', 'doing', 'review'].includes(o.status) && o.deadline && o.deadline < todayStr
const isUnread = (o) => o.unread?.includes(currentMember.value.id)

// 下一步交给我的项目
const isMyNext = (o) => isMyNextStep(o, currentMember.value.id)
// 「需要我处理」清单在 utils/todos.js（侧栏红点用同一份）；电脑上先放 8 条，其余点「展开」
const TODO_LIMIT = 8
const todosExpanded = ref(false)
const shownTodos = computed(() => (todosExpanded.value ? todoItems.value : todoItems.value.slice(0, TODO_LIMIT)))
const TODO_ICONS = { returned: 'Back', urgent: 'AlarmClock', mention: 'ChatLineRound', reply: 'ChatDotRound', next: 'Promotion', assign: 'User', request: 'Tickets', bugs: 'Warning', manual: 'Flag', review: 'CircleCheck', overdue: 'Clock' }
// 加急 / 手动标记：和顶部铃铛里一样，处理完直接点「标为已处理」
const finishing = ref('')
async function finishPending(t) {
  if (finishing.value) return
  finishing.value = t.key
  try {
    await finishPendingWithUndo(t.order, t.kind, null, t.kind === 'urgent' ? '已结束本次加急' : '已标为已处理')
  } catch (e) {
    ElMessage.error(e.message || '标记失败，请重试')
  } finally {
    finishing.value = ''
  }
}
const todoIcon = (t) => TODO_ICONS[t.kind] || 'Document'
// 点卡片是普通打开项目；要直达「沟通」「内部」「问题」点卡片上的按钮（手机上打开时也会自动停在要处理的那一栏）
const todoDeadline = (t) => (t.kind === 'next' && t.order.nextDue) || t.order.deadline || ''
// 快被忘了：待确认 / 进行中、超过设置天数没有任何动静（老板看全部，员工看自己的）；已经在待办里的不重复列
const stalledList = computed(() =>
  orders
    .map((o) => ({ o, days: stalledDays(o, collab.stallDays) }))
    .filter((s) => s.days > 0 && !todoOrderIds.value.has(s.o.id))
    .sort((a, b) => b.days - a.days)
)
const stalledExpanded = ref(false)
const stalledIds = computed(() => new Set(stalledList.value.map((s) => s.o.id)))
// 已经出现在「快被忘了」里的就不在「等对方处理」里重复
const waitingList = computed(() =>
  orders.filter((o) => isWaitingOther(o, currentMember.value.id) && !stalledIds.value.has(o.id))
)
// 长列表默认只显示前几个，其余点「展开」
// 手机上卡片高，只先放 3 个
const listLimit = computed(() => (isMobile.value ? 3 : 6))
const waitingExpanded = ref(false)
const shownWaiting = computed(() => (waitingExpanded.value ? waitingList.value : waitingList.value.slice(0, listLimit.value)))
const shownStalled = computed(() => (stalledExpanded.value ? stalledList.value : stalledList.value.slice(0, listLimit.value)))

// 我手上的：我负责、已接收、待开工 / 进行中，且不在「需要我处理」「快被忘了」里；有截止日期的排前面
const myHands = computed(() =>
  orders
    .filter(
      (o) =>
        o.ownerId === currentMember.value.id &&
        ['pending', 'doing'].includes(o.status) &&
        o.assignState !== 'pending' &&
        !todoOrderIds.value.has(o.id) &&
        !stalledIds.value.has(o.id)
    )
    .sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999'))
)
const handsExpanded = ref(false)
const shownHands = computed(() => (handsExpanded.value ? myHands.value : myHands.value.slice(0, listLimit.value)))
function handReason(o) {
  const parts = [o.status === 'pending' ? '还没开工' : '进行中']
  if (o.customer) parts.push(o.customer)
  if (o.nextStep) {
    const who = o.nextOwnerId === currentMember.value.id ? '' : '（' + (o.nextOwnerName || memberMap[o.nextOwnerId]?.name || '对方') + '）'
    parts.push('下一步：' + o.nextStep + who)
  }
  return parts.join(' · ')
}

// 问候语跟着时间走（以前一直是「早上好」）
const greeting = (() => {
  const h = new Date().getHours()
  if (h < 5) return '夜深了'
  if (h < 11) return '早上好'
  if (h < 13) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
})()

// 待办上直接「完成这一步」，不用点进项目；完成后顺手问接下来做什么（默认交给项目负责人，可以不填）
const completing = ref(null)
async function quickCompleteNext(o) {
  if (completing.value) return
  completing.value = o.id
  const done = o.nextStep
  let offerUndo
  try {
    offerUndo = await finishNext(o)
  } catch (e) {
    ElMessage.error(e.message || '操作失败')
    return
  } finally {
    completing.value = null
  }
  const nextOwner = o.ownerId || currentMember.value.id
  const who = nextOwner === currentMember.value.id ? '我自己' : ownerName(o)
  let content = ''
  try {
    const { value } = await ElMessageBox.prompt(`接下来做什么？会交给 ${who}，不用就点「不用了」`, `已完成「${done}」`, {
      confirmButtonText: '安排',
      cancelButtonText: '不用了',
      inputPlaceholder: '比如：给客户看首页初稿',
      inputValidator: (v) => !v || v.trim().length <= 200 || '最多 200 字'
    })
    content = (value || '').trim()
  } catch {
    return offerUndo()
  }
  if (!content) return offerUndo()
  try {
    await setNextStep(o.id, { content, ownerId: nextOwner, due: '' })
    ElMessage.success('下一步已安排给 ' + who)
  } catch (e) {
    offerUndo()
    ElMessage.error(e.message || '保存失败')
  }
}

const overview = computed(() => [
 {label:isBoss.value?'待确认':'待接单',value:orders.filter(o=>isBoss.value?o.status==='pending':o.assignState==='pending').length,icon:'Document',path:'/order?status=pending'},
 {label:'进行中',value:orders.filter(o=>o.status==='doing').length,icon:'VideoPlay',path:'/order?status=doing'},
 {label:'待验收',value:orders.filter(o=>o.status==='review').length,icon:'CircleCheck',path:'/order?status=review'},
 {label:isBoss.value?'待收款':'我的申请',value:isBoss.value?money(orders.filter(o=>o.status!=='cancelled').reduce((n,o)=>n+owed(o),0)):approvals.length,icon:isBoss.value?'Wallet':'Finished',path:isBoss.value?'/order?status=owing':'/approvals'}
])
// 员工手机上的分栏：待接收的已经在「需要我处理」里，这里只分「手上的」（没开工 + 进行中）和「待验收」；
// 已经列在「需要我处理」里的项目不再在下面重复出现
const employeeTab=ref('doing')
const inHand=(o)=>['pending','doing'].includes(o.status)&&o.assignState!=='pending'
const notInTodo=(o)=>!todoOrderIds.value.has(o.id)
const employeeTabs=computed(()=>[
 {key:'doing',label:'手上的',count:orders.filter(o=>inHand(o)&&notInTodo(o)).length},
 {key:'review',label:'待验收',count:orders.filter(o=>o.status==='review'&&notInTodo(o)).length}
])
// 卡片上的需求摘要：和项目名一模一样就不重复写了
const cardDesc=(o)=>{const r=String(o.requirement||'').trim();return r?(r===String(o.title||'').trim()?'':r):'打开详情查看项目需求'}
const employeeOrders=computed(()=>orders.filter(o=>notInTodo(o)&&(employeeTab.value==='doing'?inHand(o):o.status==='review')))
// 手机待办默认显示 6 条，「全部 N 条」原地展开
const MOBILE_TODO_LIMIT=6
const todoExpanded=ref(false)
const mobileTodos=computed(()=>todoExpanded.value?todoItems.value:todoItems.value.slice(0,MOBILE_TODO_LIMIT))
const ownerName = (o) => memberMap[o.ownerId]?.name || '负责人'

// 员工拒单 / 客户新需求：老板决定自己做，直接开工（项目本来就在老板名下）
async function doMyself(o) {
  if (acting.value) return
  acting.value = o.id
  try {
    await changeOrderStatus(o, 'doing', `「${o.title}」已开工，在你手上了`)
  } catch (e) {
    ElMessage.error(e.message || '操作失败')
  } finally {
    acting.value = null
  }
}
function waitReasonFor(o) {
  if (isBoss.value && o.assignState === 'pending') return `${ownerName(o)} 还没接收，等 TA 回复`
  if (isBoss.value) return `${ownerName(o)} 正在做，等 TA 交付`
  return '已提交，等待验收'
}

// ---- 员工：接收 / 拒绝老板刚派来的项目 ----
const accepting = ref(null)
const rejectVisible = ref(false)
const rejecting = ref(null)
async function doAccept(o) {
  accepting.value = o.id
  try {
    await acceptOrder(o.id)
    ElMessage.success(`已接收「${o.title}」，可以开工了`)
  } catch (e) {
    ElMessage.error(e.message || '接收失败')
  } finally {
    accepting.value = null
  }
}
function openReject(o) {
  rejecting.value = o
  rejectVisible.value = true
}
async function doReject(reason) {
  await rejectOrder(rejecting.value.id, reason)
  ElMessage.success('已拒绝，项目已交回')
}

// 员工自己提交、还在等老板批的申请（批完的结果会发消息，不在工作台上堆着），最多显示 6 条
const myRequests = computed(() => approvals.filter((a) => a.status === 'pending').slice(0, 6))

// ---- 团队一览（老板）----
const liveOrders = computed(() => orders.filter((o) => ['doing', 'review'].includes(o.status)))

// 每个人手上的活（老板能看到全部，所以直接从订单里数）；「还没接收」以前在「等对方处理」里，现在直接写在人名下面
const team = computed(() =>
  MEMBERS.map((m) => {
    const mine = liveOrders.value.filter((o) => o.ownerId === m.id)
    return {
      m,
      active: mine.length,
      waiting: orders.filter((o) => o.ownerId === m.id && o.assignState === 'pending' && !['done', 'cancelled'].includes(o.status)).length,
      review: mine.filter((o) => o.status === 'review').length,
      overdue: mine.filter((o) => o.deadline && o.deadline < todayStr).length
    }
  })
)
// 有单子的人排前面；没单子的默认收起，人多时不再把待办挤到屏幕外
const showIdle = ref(false)
const busy = (t) => t.active + t.waiting
const sortedTeam = computed(() => [...team.value].sort((a, b) => (b.m.id === currentMember.value.id) - (a.m.id === currentMember.value.id) || busy(b) - busy(a)))
const idleCount = computed(() => team.value.filter((t) => !busy(t) && t.m.id !== currentMember.value.id).length)
const shownTeam = computed(() => (showIdle.value ? sortedTeam.value : sortedTeam.value.filter((t) => busy(t) || t.m.id === currentMember.value.id)))
function memberLine(t) {
  if (!busy(t)) return '手上没有单子'
  const parts = []
  if (t.active) parts.push(`手上 ${t.active} 单`)
  if (t.waiting) parts.push(`${t.waiting} 单还没接收`)
  if (t.review) parts.push(`${t.review} 单等你验收`)
  if (t.overdue) parts.push(`${t.overdue} 单已逾期`)
  return parts.join('，')
}
function goMember(m) {
  router.push({ path: '/order', query: { owner: String(m.id) } })
}

const hasAssignedIssues = (o) => o.ownerId === currentMember.value.id && Number(o.actionBugCount) > 0
const naOf = (o) => hasAssignedIssues(o) ? { to: 'bugs', label: '处理问题' } : nextAction(o, currentMember.value.id)
async function quickNext(o) {
  const na = naOf(o)
  if (!na) return
  if (na.to === 'bugs') return openDetail(o, 'bugs')
  if (['review','done'].includes(na.to) && (Number(o.openBugCount) || o.bugs?.some(bug => !['resolved','closed'].includes(bug.status)))) return mobileNext(o)
  try {
    await changeOrderStatus(o, na.to)
  } catch (e) {
    ElMessage.error(e.message || '修改状态失败')
  }
}
// 手机待办上的“下一步”：开始做 / 完成直接改；提交验收 / 验收通过先弹交付确认（和详情页一致）
const acting = ref(null)
const deliveryVisible = ref(false)
const deliveryOrder = ref(null)
const deliveryTarget = ref('')
async function mobileNext(o) {
  const na = naOf(o)
  if (!na || acting.value) return
  acting.value = o.id
  try {
    if (['review', 'done'].includes(na.to)) {
      deliveryOrder.value = await getOrder(o.id)
      deliveryTarget.value = na.to
      deliveryVisible.value = true
    } else {
      await quickNext(o)
    }
  } catch (e) {
    ElMessage.error(e.message || '操作失败')
  } finally {
    acting.value = null
  }
}
// 「对方有新动态」只是提醒看一眼，不用一个个点开：一键全部标为已读
const unreadCount = computed(() => orders.filter((o) => isUnread(o)).length + unreadQuotes.value.length)
const marking = ref(false)
async function readAll() {
  if (marking.value) return
  marking.value = true
  try {
    const r = await markInboxRead(currentMember.value.id)
    if (r.failed) ElMessage.warning(`已标记 ${r.total - r.failed} 条，${r.failed} 条失败，可以再点一次`)
    else ElMessage.success(`已全部标为已读（${r.total} 条）`)
  } catch (e) {
    ElMessage.error(e.message || '操作失败')
  } finally {
    marking.value = false
  }
}
// 右上角刷新：真的去服务器重新拉项目、审批和报价
const refreshing = ref(false)
async function refreshAll() {
  if (refreshing.value) return
  refreshing.value = true
  try {
    await Promise.all([syncOrders(true), loadApprovals(), syncQuotes()])
    ElMessage.success('已刷新')
  } catch (e) {
    ElMessage.error(e.message || '刷新失败')
  } finally {
    refreshing.value = false
  }
}
// 待验收的项目：客户还没点验收时一键催；今天催过了就只把话再复制一遍，不往客户沟通里发第二条
const nudgingAccept = ref(null)
const justNudged = ref({})
const acceptNudged = (o) => !!justNudged.value[o.id] || nudgedToday(o)
async function quickAcceptNudge(o) {
  if (acceptNudged(o)) return copyAcceptNudge(o)
  if (nudgingAccept.value) return
  nudgingAccept.value = o.id
  try {
    await nudgeCustomerAccept(o)
    justNudged.value = { ...justNudged.value, [o.id]: true }
  } catch (e) {
    ElMessage.error(e.message || '提醒失败')
  } finally {
    nudgingAccept.value = null
  }
}
async function quickNudge(o) {
  try {
    await nudge(o.id)
    ElMessage.success(isBoss.value && memberMap[o.ownerId] ? colleagueSentHint([memberMap[o.ownerId]]) : `已催办「${o.title}」`)
  } catch (e) {
    ElMessage.error(e.message || '催办失败')
  }
}

// 到期/逾期标签
function dueTag(o) {
  if (!o.deadline || ['done', 'cancelled'].includes(o.status)) return null
  if (o.deadline < todayStr) return { text: '已逾期', type: 'danger' }
  if (o.deadline === todayStr) return { text: '今天到期', type: 'warning' }
  return null
}

function workbenchSequence(id) {
  const groups = [todoItems.value.flatMap(item => item.order ? [item.order] : []),
    stalledList.value.map(item => item.o), isMobile.value ? employeeOrders.value : myHands.value, waitingList.value]
  return groups.find(rows => rows.some(row => row.id === id)) || orders
}
const { active, detailVisible, detailLoading, noticeTab: detailTab, noticeItem: detailIssueId,
  hasPrevious, hasNext, openDetail: routeToDetail, moveDetail } = useProjectDetail('/workbench', workbenchSequence)
const acknowledging = ref(new Set())
async function acknowledge(order) {
  if (acknowledging.value.has(order.id)) return
  acknowledging.value.add(order.id)
  try {
    await markRead(order.id, currentMember.value.id)
  } catch (error) {
    ElMessage.error(error.message || '标记失败，请重试')
  } finally {
    acknowledging.value.delete(order.id)
  }
}
async function takeIssues(t) {
  if (finishing.value) return
  finishing.value=t.key
  const changed=[]
  try {
    const detail=await getOrder(t.order.id)
    for (const issue of detail.bugs || []) {
      if (issue.senderKind !== 'customer' || issue.status !== 'open') continue
      await updateBugStatus(issue.id,'action')
      changed.push(issue.id)
    }
  } catch(e) { ElMessage.error(e.message) }
  finally {
    finishing.value=''
    if (changed.length) undoToast('take-issues:'+t.order.id,changed.length+' 条问题已加入处理',async()=>{
      for (const id of changed) {
        const latest=await getOrder(t.order.id)
        if (latest.bugs?.find(b=>b.id===id)?.status === 'action') await updateBugStatus(id,'open')
      }
    })
  }
}
function openTodo(t) {
  if (t.kind === 'newIssues') return routeToDetail(t.order,'bugs',{bug:String(t.order.newBugPreview.id)})

  const tabs = { mention: 'internal', nudge: 'internal' }
  openDetail(t.order, tabs[t.kind] || '')
}
function openDetail(order, tab = '') {
  routeToDetail(order, tab, tab === 'bugs' ? { todo: '1' } : {})
}
const dialogVisible = ref(false)
const editing = ref(null)
const notebookVisible = ref(false)
const notebookOrder = ref(null)

function openNotebook(row) {
  notebookOrder.value = row
  notebookVisible.value = true
}

async function openDialog(row) {
  try {
    editing.value = row?.id ? { ...(await getOrder(row.id)) } : null
    dialogVisible.value = true
  } catch (e) {
    ElMessage.error('加载项目失败：' + e.message)
  }
}
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
.hello {
  display: flex;
  align-items: center;
  gap: 14px;
  background: #fff;
  border-radius: 8px;
  padding: 16px 18px;
  margin-bottom: 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}
.hello .hi {
  font-size: 16px;
  font-weight: 600;
}
.hello .sub {
  font-size: 13px;
  color: #909399;
  margin-top: 2px;
}
.red {
  color: #f56c6c;
}
.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 15px;
  font-weight: 600;
  margin: 18px 0 12px;
  padding-left: 10px;
  border-left: 3px solid #dcdfe6;
}
.section-title .ico {
  margin-right: 4px;
}
.red-bar {
  border-left-color: #f56c6c;
}
.gray-bar {
  border-left-color: #c0c4cc;
}
.blue-bar {
  border-left-color: #409eff;
}
.amber-bar {
  border-left-color: #e6a23c;
}
.approval-list {
  display: grid;
  /* min(…, 100%)：窄屏上一列最多和容器一样宽，不会撑出屏幕；电脑上等于原来的 380px */
  grid-template-columns: repeat(auto-fill, minmax(min(380px, 100%), 1fr));
  gap: 12px;
}
.team-tip {
  font-size: 12px;
  font-weight: 400;
  color: #909399;
}
.team {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(230px, 100%), 1fr));
  gap: 12px;
}
.member-card {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #fff;
  border-radius: 8px;
  padding: 12px 14px;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  transition: box-shadow 0.15s, transform 0.15s;
}
.member-card:hover {
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.14);
  transform: translateY(-1px);
}
.member-card.off {
  opacity: 0.6;
}
.mc-body {
  min-width: 0;
}
.mc-name {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}
.mc-role {
  margin-left: 6px;
  font-size: 11px;
  font-weight: 400;
  color: #909399;
  background: #f4f4f5;
  border-radius: 4px;
  padding: 0 5px;
}
.mc-role.off-tag {
  color: #f56c6c;
  background: #fef0f0;
}
.mc-line {
  margin-top: 3px;
  font-size: 12px;
  color: #909399;
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(320px, 100%), 1fr));
  gap: 12px;
}
.row-card {
  position: relative;
  background: #fff;
  border-radius: 8px;
  padding: 14px 16px;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  transition: box-shadow 0.15s, transform 0.15s;
  border-left: 3px solid transparent;
}
.row-card:hover {
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.14);
  transform: translateY(-1px);
}
.row-card.todo {
  border-left-color: #f56c6c;
}
.row-card.waiting {
  border-left-color: #c0c4cc;
  opacity: 0.92;
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
}
.rc-title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  display: flex;
  align-items: center;
  gap: 4px;
}
.rc-title .pic {
  color: #409eff;
}
.rc-reason {
  font-size: 13px;
  color: #f56c6c;
  margin-top: 4px;
}
.rc-reason.gray {
  color: #909399;
}
.rc-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 10px;
  font-size: 12px;
  color: #909399;
}
.rc-deadline {
  display: flex;
  align-items: center;
  gap: 3px;
  margin-left: auto;
}
.rc-deadline.red {
  color: #f56c6c;
  font-weight: 600;
}
/* 电脑上这两层只是分组，不生成盒子，里面的东西仍直接排在 .rc-meta 这一行里 */
.rc-actions,
.rc-info {
  display: contents;
}

/* 手机：卡片单列，按钮一行、状态和期限一行，按钮加大好点 */
@media (max-width: 768px) {
  .hello {
    gap: 10px;
    padding: 12px;
    margin-bottom: 12px;
  }
  .hello-text {
    flex: 1;
    min-width: 0;
  }
  .hello .hi {
    font-size: 14px;
    line-height: 1.4;
  }
  .hello :deep(.el-button) {
    flex-shrink: 0;
    width: 40px;
    height: 40px;
    padding: 0;
  }
  .section-title {
    flex-wrap: wrap;
    gap: 4px 8px;
    margin: 14px 0 10px;
  }
  .team-tip {
    line-height: 1.4;
  }

  /* 团队：两人一排（一排放不下两个就一人一排） */
  .team {
    grid-template-columns: repeat(auto-fill, minmax(min(150px, 100%), 1fr));
    gap: 10px;
  }
  .member-card {
    min-width: 0;
    gap: 10px;
    padding: 10px;
  }
  .mc-body {
    flex: 1;
    overflow-wrap: anywhere;
  }
  .mc-line {
    line-height: 1.5;
  }

  .approval-list,
  .cards {
    gap: 10px;
  }
  .row-card {
    min-width: 0;
    padding: 12px;
  }
  .new-badge {
    right: -4px;
  }
  .rc-main {
    min-width: 0;
  }
  .rc-title,
  .rc-reason {
    overflow-wrap: anywhere;
  }
  .rc-title .pic {
    flex-shrink: 0;
  }
  .rc-meta {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    margin-top: 10px;
  }
  .rc-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .rc-actions:empty {
    display: none;
  }
  /* 按钮：至少 36px 高；直接放在这一行的按钮平分剩余宽度 */
  .rc-actions :deep(.el-button) {
    height: auto;
    min-height: 36px;
    padding: 8px 14px;
    font-size: 14px;
  }
  .rc-actions > :deep(.el-button) {
    flex: 1 1 0;
  }
  .rc-actions :deep(.el-button + .el-button) {
    margin-left: 0;
  }
  .rc-info {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 8px;
  }
  .rc-deadline {
    flex-shrink: 0;
    white-space: nowrap;
  }
}
/* 特别窄的手机：问候那句再小一点，尽量保持一行 */
@media (max-width: 340px) {
  .hello .hi {
    font-size: 13px;
  }
}

/* 报价 / 审批入口上的待处理数字 */
.entry-icon,
.wb-shortcuts button > span { position: relative; }
.shortcut-badge {
  position: absolute;
  top: -6px;
  right: -8px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: #f56c6c;
  color: #fff;
  font-size: 11px;
  font-style: normal;
  font-weight: 600;
  line-height: 18px;
  text-align: center;
  box-sizing: border-box;
}
.quick-entries-5 { grid-template-columns: repeat(5, minmax(0, 1fr)); }
.wb-shortcuts-5 { grid-template-columns: repeat(5, minmax(0, 1fr)); }
.wb-shortcuts-5 button { min-width: 0; white-space: nowrap; }
.wb-todo { cursor: pointer; position: relative; }
.employee-project .due-late { color: #e5484d; font-weight: 600; }
/* 手机待办卡片：状态标签挪到标题右边，「为什么要处理」那行占满整行（以前被标签挤成两行，一屏看不了几条） */
.wb-todo > .el-tag { position: absolute; top: 17px; right: 12px; }
.wb-todo h3 { padding-right: 60px; overflow-wrap: anywhere; }
.wb-todo-actions {
  display: flex;
  justify-content: flex-start;
  gap: 8px;
  margin-top: 10px;
}
.wb-todo-actions .el-button + .el-button { margin-left: 0; }
.team-toggle { margin: -4px 0 8px; }
.todo-head-right { display: inline-flex; align-items: center; gap: 12px; font-weight: 400; }
.section-actions { display: inline-flex; align-items: center; gap: 14px; }
@media (max-width: 360px) {
  .wb-shortcuts-5 button { font-size: 10px; }
}

/* 快捷入口：一行细条，不再占一大块 */
.slim-entries { padding: 8px 10px; gap: 6px; margin-bottom: 18px; }
.slim-entries button { flex-direction: row; justify-content: center; gap: 8px; padding: 6px 0; border-radius: 10px; font-size: 13px; }
.slim-entries button:hover { background: #f4f8ff; }
.slim-entries .el-icon { font-size: 16px !important; padding: 7px !important; border-radius: 9px !important; }
.slim-entries .shortcut-badge { top: -7px; right: -10px; }

/* 没有待办：一行字 */
.todo-empty-m { margin: 0; text-align: center; box-shadow: none; }
.todo-empty { margin: 0 0 4px; padding: 12px 16px; background: #fff; border-radius: 8px; color: #8592a6; font-size: 13px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05); }

/* 我手上的 */
.row-card.hands { border-left-color: #409eff; }
.rc-reason.blue { color: #4a6a9b; }
.hands-tip { color: #6b7d99 !important; }

/* 快被忘了 */
.row-card.stalled { border-left-color: #e6a23c; }
.rc-reason.amber { color: #c27c0e; }
.stalled-tip { font-size: 12px; color: #c27c0e; }
.stalled-symbol { color: #e6a23c !important; background: #fff6e6 !important; }
.stalled-more { display: block; width: 100%; border: 0; background: none; color: #3b6cff; font-size: 13px; padding: 6px 0 10px; cursor: pointer; text-align: center; }
/* 数字卡和「新建项目」放一行（以前下面还有一排和左侧菜单重复的快捷入口） */
.overview-row { display: flex; align-items: center; gap: 14px; margin-bottom: 20px; }
.overview-row .overview-stats { flex: 1; margin-bottom: 0; }
.overview-create { flex: none; }
.desktop-workbench .wb-quote-panel { margin-top: 20px; }
/* 手机顶部：头像和问候缩成一行，不再占小半屏 */
.wb-person.wb-person-compact { padding: 10px 0 14px; }
.wb-person.wb-person-compact h1 { font-size: 19px; margin: 0; }
.wb-person.wb-person-compact :deep(.board-avatar) { width: 40px !important; height: 40px !important; }
</style>
