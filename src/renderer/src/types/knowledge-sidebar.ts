/**
 * 知识库全局侧栏导航的共享类型。
 *
 * 曾经在 KnowledgePageShell / KnowledgeSidebarMenu 里各自声明了一份同名
 * KnowledgeSidebarMenuKey，且 SidebarMenu 那份被裁剪成 4 项（导航实际渲染 6 项），
 * 两个组件间 props 传递产生 "unrelated types" 冲突。统一在此定义唯一来源。
 */
import type { RouteLocationRaw } from "vue-router"

export type KnowledgeSidebarMenuKey =
  "start" | "ai-writing" | "notes" | "home" | "boards" | "favorites" | "trash"

export interface KnowledgeSidebarNavItem {
  key: KnowledgeSidebarMenuKey
  label: string
  icon: string
  to: RouteLocationRaw
}
