/** 封装知识库通知相关接口请求与数据结构。 */

import { requestKbDriveApi } from "./kb-drive-http"

/** 通知类型：评论 @提及 / 评论回复 / 知识库邀请。 */
export type AppNotificationType = "mention" | "comment_reply" | "invite"

/** 通知携带的上下文数据。 */
export interface AppNotificationData {
  documentId?: string
  documentTitle?: string
  mentionerName?: string
  replierName?: string
  /** invite 通知：被邀请加入的知识库上下文与邀请人 */
  kbId?: string
  kbName?: string
  inviterName?: string
}

/** 描述一条通知。 */
export interface AppNotification {
  id: string
  userId: string
  type: AppNotificationType
  title: string
  content: string
  link: string | null
  read: boolean
  data: AppNotificationData | null
  createdAt: string
}

/** 通知分页列表响应。 */
export interface AppNotificationPage {
  items: AppNotification[]
  total: number
  page: number
  pageSize: number
}

/** 获取当前用户的通知分页列表。 */
export async function getNotifications(params?: {
  unreadOnly?: boolean
  page?: number
  pageSize?: number
}): Promise<AppNotificationPage> {
  const query = new URLSearchParams()
  if (params?.unreadOnly) query.set("unreadOnly", "true")
  if (params?.page) query.set("page", String(params.page))
  if (params?.pageSize) query.set("pageSize", String(params.pageSize))

  const queryString = query.toString()
  const path = `/knowledge/notifications${queryString ? `?${queryString}` : ""}`

  return await requestKbDriveApi<AppNotificationPage>(path)
}

/** 获取当前用户的未读通知数量。 */
export async function getUnreadNotificationCount(): Promise<{ count: number }> {
  return await requestKbDriveApi<{ count: number }>("/knowledge/notifications/unread-count")
}

/** 将指定通知标记为已读。 */
export async function markNotificationsRead(notificationIds: string[]): Promise<void> {
  await requestKbDriveApi<void>("/knowledge/notifications/mark-read", {
    method: "POST",
    body: JSON.stringify({ notificationIds }),
  })
}

/** 将当前用户全部通知标记为已读。 */
export async function markAllNotificationsRead(): Promise<void> {
  await requestKbDriveApi<void>("/knowledge/notifications/mark-all-read", {
    method: "POST",
  })
}

/** 删除单条通知。 */
export async function deleteNotification(notificationId: string): Promise<void> {
  await requestKbDriveApi<void>(`/knowledge/notifications/${notificationId}`, {
    method: "DELETE",
  })
}

/** 批量删除通知。 */
export async function batchDeleteNotifications(notificationIds: string[]): Promise<void> {
  await requestKbDriveApi<void>("/knowledge/notifications/batch-delete", {
    method: "POST",
    body: JSON.stringify({ notificationIds }),
  })
}
