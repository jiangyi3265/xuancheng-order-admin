import { friendlyTime } from '@/utils/time'

export function issueRoute(project, requirement, updateId) {
  const query = {tab:'bugs', issue:requirement.id}
  if (updateId) query.update = updateId
  return {path:'/projects/'+project.id, query}
}

export function replyText(reply) {
  return reply.content?.trim() || (reply.hasAttachments ? '图片或文件' : '已回复')
}

export function reviewRoute(project, requirement) {
  const route = issueRoute(project, requirement)
  route.query.review = requirement.reviewId
  return route
}

export const replyTime = friendlyTime
