<script setup lang="ts">
/**
 * 「关于」分组（语雀设置页的最后一个 group，`__("关于#space") + productName`）。
 *
 * 语雀此处另有「新版本可用」徽标与「安装并重启」按钮、以及 releaseNotes 更新日志列表，
 * 全部由升级器（updator）驱动。私测期实现为显式「检查更新」按钮：拉 GitHub Releases
 * 最新版比对（主进程 update-check），发现新版引导前往 Releases 页下载——macOS 静默
 * 自动更新要等 Developer ID 签名（docs/发布链路-2026-09-28.md 未完成事项）。非升级态的
 * 版本行 + 四条链接与语雀呈现一致；链接取址在 constants 里留空——不拿语雀地址凑数。
 */
import { ref } from "vue"
import logoUrl from "@/assets/zhiye-logo.png"
import { ABOUT_LINKS, PRODUCT_NAME } from "@/constants/desktop-settings"
import { useDesktopSettings } from "@/composables/useDesktopSettings"
import { isDesktopApp } from "@/services/desktop-bridge"
import type { DesktopUpdateCheckResult } from "@/types/desktop-bridge"

const { openExternal } = useDesktopSettings()

/** 语雀显示为 `version(projectVersion)`，本仓无 projectVersion（构建号）概念。 */
const version = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : ""

const checking = ref(false)
const checkResult = ref<DesktopUpdateCheckResult | null>(null)

const handleCheckUpdates = async () => {
  if (checking.value) return
  checking.value = true
  checkResult.value = null
  try {
    checkResult.value = (await window.xiaoyeDesktop?.checkForUpdates()) ?? null
  } finally {
    checking.value = false
  }
}
</script>

<template>
  <div class="kb-settings-group">
    <h2>关于{{ PRODUCT_NAME }}</h2>
    <div class="kb-settings-item kb-settings-item-about">
      <div class="kb-about-version-row">
        <img class="kb-about-logo" :src="logoUrl" :alt="PRODUCT_NAME" />
        <div class="kb-about-version-wrapper">
          <p class="kb-about-version-title">当前版本</p>
          <p class="kb-about-version">{{ version }}</p>
        </div>
        <!-- 检查更新（仅桌面端）：语雀非升级态此处无按钮，私测期提供显式入口 -->
        <el-button
          v-if="isDesktopApp()"
          class="kb-about-check-btn"
          text
          size="small"
          :loading="checking"
          @click="handleCheckUpdates"
          >检查更新</el-button
        >
      </div>

      <!-- 检查结果行：最新 / 新版本（徽标对齐语雀升级态）/ 失败原因 -->
      <p v-if="checkResult?.status === 'up-to-date'" class="kb-about-update-line">已是最新版本</p>
      <div v-else-if="checkResult?.status === 'available'" class="kb-about-update-line">
        <span class="kb-about-update-badge">新版本 v{{ checkResult.latestVersion }} 可用</span>
        <button
          type="button"
          class="kb-about-update-download"
          @click="checkResult.releaseUrl && openExternal(checkResult.releaseUrl)"
        >
          前往下载
        </button>
      </div>
      <p v-else-if="checkResult?.status === 'error'" class="kb-about-update-line is-error">
        {{ checkResult.message }}
      </p>

      <div v-for="link in ABOUT_LINKS" :key="link.key" class="kb-about-term">
        <h2
          class="text-ink"
          :class="{ 'is-disabled': !link.url }"
          :data-testid="`kb-${link.key}`"
          @click="link.url && openExternal(link.url)"
        >
          {{ link.label }}
        </h2>
        <span v-if="link.tip" class="text-ink-quaternary">{{ link.tip }}</span>
      </div>
    </div>
  </div>
</template>

<style>
/* index-module_versionRow / logo / currentVersion* / terms 段 */
.kb-settings-item-about {
  position: relative;
}

.kb-about-version-row {
  align-items: flex-start;
  display: flex;
  flex-direction: row;
}

.kb-about-logo {
  margin-right: 8px;
  width: 60px;
}

.kb-about-version-wrapper {
  margin-right: 8px;
}

.kb-about-check-btn {
  margin-top: 10px;
}

.kb-about-update-line {
  color: var(--kb-text-secondary);
  font-size: 12px;
  line-height: 1.6;
  margin: 4px 0 0;
  padding-left: 4px;
}

.kb-about-update-line.is-error {
  color: var(--el-color-danger);
}

.kb-about-update-badge {
  background: var(--kb-brand-light);
  border-radius: 999px;
  color: var(--kb-brand);
  display: inline-block;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  margin-right: 8px;
  padding: 4px 10px;
}

.kb-about-update-download {
  background: none;
  border: none;
  color: var(--kb-brand);
  cursor: pointer;
  font-size: 12px;
  padding: 0;
}

.kb-about-version-title {
  font-weight: 600;
  line-height: 1.5;
  margin: 6px 0 0;
  padding-left: 4px;
}

.kb-about-version {
  line-height: 1.5;
  margin: 6px 0 0;
  padding-left: 4px;
  position: relative;
}

.kb-about-term {
  border-bottom: 1px solid var(--kb-border);
  position: relative;
}

.kb-about-term h2 {
  cursor: pointer;
  font-size: 16px;
  font-weight: 500;
  margin: 12px 0;
}

.kb-about-term h2.is-disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.kb-about-term span {
  font-size: 12px;
  left: 80px;
  /* 提示行是纯展示，压在链接 h2 上方：不放行指针会截胡链接点击 */
  pointer-events: none;
  position: absolute;
  top: 2px;
}
</style>
