<script setup lang="ts">
/**
 * 「关于」分组（语雀设置页的最后一个 group，`__("关于#space") + productName`）。
 *
 * 语雀此处另有「新版本可用」徽标与「安装并重启」按钮、以及 releaseNotes 更新日志列表，
 * 全部由升级器（updator）驱动；本仓无更新通道，故只保留版本行与四条链接（与语雀非
 * 升级态下的呈现一致）。四条链接的取址在 constants 里留空——不拿语雀地址凑数，空即置灰。
 */
import logoUrl from "@/assets/yuque-logo.png"
import { ABOUT_LINKS, PRODUCT_NAME } from "@/constants/desktop-settings"
import { useDesktopSettings } from "@/composables/useDesktopSettings"

const { openExternal } = useDesktopSettings()

/** 语雀显示为 `version(projectVersion)`，本仓无 projectVersion（构建号）概念。 */
const version = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : ""
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
      </div>

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
