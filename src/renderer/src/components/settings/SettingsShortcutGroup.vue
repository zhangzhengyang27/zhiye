<script setup lang="ts">
/**
 * 「全局快捷键」分组（语雀的 `H` 组件）。
 *
 * 与语雀一致的分工：globalShortcut 族由主进程注册（冲突即被系统拒绝，回退原值并提示
 * 「该快捷键已被占用，请重新设置」），mousetrap 族只落 localStorage、由渲染层的按键
 * 监听消费。「锁定桌面端 / 打开AI独立框」两条本仓无对应能力，按原样呈现但只读置灰。
 */
import SettingsShortcutInput from "@/components/settings/SettingsShortcutInput.vue"
import { SHORTCUT_HELP_URL, SHORTCUT_ROWS } from "@/constants/desktop-settings"
import { useDesktopSettings } from "@/composables/useDesktopSettings"
import { useTransientToast } from "@/composables/use-transient-toast"

const { settings, desktopFeaturesUnavailable, setShortcut, openExternal } = useDesktopSettings()
const { showToastMessage } = useTransientToast()

/** 主窗口级快捷键（小记页跳转等）由 App.vue 消费，这里只负责编辑与注册。 */
const rows = SHORTCUT_ROWS

/** 该条是否可编辑：本仓无能力、或 Web 端下的全局族。 */
const isRowDisabled = (row: (typeof SHORTCUT_ROWS)[number]) =>
  Boolean(row.unavailable) || (row.type === "globalShortcut" && desktopFeaturesUnavailable)

const handleCommit = async (key: string, value: string) => {
  const ok = await setShortcut(key, value)
  if (!ok) {
    showToastMessage("该快捷键已被占用，请重新设置", "error")
  }
}
</script>

<template>
  <div class="kb-settings-group kb-shortcut-group">
    <h2>全局快捷键</h2>
    <a v-if="SHORTCUT_HELP_URL" class="kb-shortcut-help" @click="openExternal(SHORTCUT_HELP_URL)"
      >更多快捷键</a
    >
    <div class="kb-shortcut-item">
      <div v-for="row in rows" :key="row.key" class="kb-settings-row">
        <span>{{ row.label }}</span>
        <SettingsShortcutInput
          :shortcut-key="row.key"
          :value="settings.shortcuts[row.key] ?? ''"
          :default-shortcut="row.defaultShortcut"
          :disabled="isRowDisabled(row)"
          @commit="(value) => void handleCommit(row.key, value)"
        />
      </div>
    </div>
  </div>
</template>

<style>
/* shortcut-module_item / helpLink 段：整组一条分隔线，行间距 20px */
.kb-shortcut-item {
  border-bottom: 1px solid var(--kb-border);
  line-height: 32px;
  padding-bottom: 32px;
}

.kb-shortcut-item .kb-settings-row {
  margin-bottom: 20px;
}

.kb-shortcut-help {
  color: var(--kb-brand);
  cursor: pointer;
  padding-top: 2px;
  position: absolute;
  right: 0;
  top: 0;
}
</style>
