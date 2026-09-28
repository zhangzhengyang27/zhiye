<script setup lang="ts">
/**
 * 偏好设置页（复刻语雀桌面端主窗口 `/setting` 路由）。
 *
 * 结构依据 `yuque-source/build/renderer/76858.js`（设置页组件本体）与
 * `build/renderer/app.js`（setting-module 骨架）：单列、整页滚动、**没有左侧导航**，
 * 只有 h1「偏好设置」+ 纵向堆叠的分组，顺序与语雀 render() 一致。
 * 度量全部落在本文件末尾的非 scoped 样式块（对齐语雀的 CSS module 写法）。
 *
 * 与语雀的既定偏差（2026-09-19 拍板）：
 * - 「语言和时间」「加入内测版体验计划」依赖本仓没有的能力（无 i18n、无更新通道），
 *   条目按原样呈现但禁用并标注；「桌面端锁定」#27 已实现（锁定窗 /lock + 密码快照）；
 * - 文案里的产品名由「语雀」换成「知识库」；
 * - Web 端（无 Electron 主进程）下开机自启、代理、状态栏图标、全局快捷键族与锁定不可用；
 * - 自有差异组「AI 模型」（2026-09-28 新增，置于内测版之后、关于之前）：语雀没有
 *   对应分组，承载画板 AI / 文档 AI / AI 写作共用的模型配置（原画板内弹层迁入）。
 */
import { computed, onMounted, ref } from "vue"
import { useRouter } from "vue-router"
import SettingsShortcutGroup from "@/components/settings/SettingsShortcutGroup.vue"
import SettingsProxyGroup from "@/components/settings/SettingsProxyGroup.vue"
import SettingsAboutGroup from "@/components/settings/SettingsAboutGroup.vue"
import SettingsAiModelGroup from "@/components/settings/SettingsAiModelGroup.vue"
import {
  BETA_HELP_URL,
  COLOR_THEME_OPTIONS,
  LOCK_PASSWORD_MAX_LENGTH,
  LOCK_PASSWORD_MIN_LENGTH,
  LOCALE_OPTIONS,
  PRODUCT_NAME,
  type ColorThemeOption,
} from "@/constants/desktop-settings"
import { useDesktopSettings } from "@/composables/useDesktopSettings"
import { useDesktopLock } from "@/composables/use-desktop-lock"
import { useThemeMode } from "@/composables/useThemeMode"

const { settings, desktopFeaturesUnavailable, setOpenAtLogin, setTrayVisible, openExternal } =
  useDesktopSettings()
const { colorTheme } = useThemeMode()

const router = useRouter()

/** 桌面端锁定（#27）：Web 端整组禁用；桌面端设/改/清密码 + 失焦自动锁定 */
const {
  desktopAvailable: lockAvailable,
  state: lockState,
  refresh: refreshLockState,
  setLockPassword,
  clearLockPassword,
  setAutoLock,
  lockNow,
} = useDesktopLock()

const lockPassword = ref("")
const lockPasswordConfirm = ref("")
const lockCurrentPassword = ref("")
const lockBusy = ref(false)
const lockErrorMessage = ref("")

/** 失焦自动锁定延迟档（与主进程 AUTO_LOCK_DELAY_MINUTES 同值）。 */
const AUTO_LOCK_DELAY_OPTIONS = [
  { label: "1 分钟", value: 1 },
  { label: "5 分钟", value: 5 },
  { label: "15 分钟", value: 15 },
]

const lockDescription =
  "启用后，当应用空闲时，会自动进入锁屏模式，保护隐私安全。你也可以通过菜单栏主动进入锁屏模式"

/** 「当前主题」el-select 变更：EP change 载荷是宽类型，收敛回三态值域。 */
const handleThemeChange = (value: string | number | boolean | string[] | undefined) => {
  const next = String(value) as ColorThemeOption
  if (next === "dark" || next === "light" || next === "system") {
    colorTheme.value = next
  }
}

const handleAutoLoginChange = (value: string | number | boolean) => {
  void setOpenAtLogin(value === true)
}

const handleTrayChange = (value: string | number | boolean) => {
  void setTrayVisible(value === true)
}

const lockFailureMessage = (reason?: string) => {
  if (reason === "unauthorized") {
    return "当前密码不正确。"
  }
  if (reason === "invalid-length") {
    return `锁定密码长度需在 ${LOCK_PASSWORD_MIN_LENGTH}-${LOCK_PASSWORD_MAX_LENGTH} 位之间。`
  }
  if (reason === "unavailable") {
    return "桌面端锁定不可用。"
  }
  return "操作失败，请稍后重试。"
}

/** 设置/修改锁定密码：已设密码时校验当前密码；两遍输入一致才提交 */
const handleSaveLockPassword = async () => {
  if (lockBusy.value) {
    return
  }

  const newPassword = lockPassword.value
  const currentPassword = lockCurrentPassword.value

  if (
    newPassword.length < LOCK_PASSWORD_MIN_LENGTH ||
    newPassword.length > LOCK_PASSWORD_MAX_LENGTH
  ) {
    lockErrorMessage.value = `锁定密码长度需在 ${LOCK_PASSWORD_MIN_LENGTH}-${LOCK_PASSWORD_MAX_LENGTH} 位之间。`
    return
  }
  if (newPassword !== lockPasswordConfirm.value) {
    lockErrorMessage.value = "两次输入的密码不一致。"
    return
  }
  if (lockState.hasPassword && !currentPassword) {
    lockErrorMessage.value = "请输入当前密码。"
    return
  }

  lockBusy.value = true
  lockErrorMessage.value = ""
  try {
    const result = await setLockPassword(
      newPassword,
      lockState.hasPassword ? currentPassword : undefined,
    )
    if (!result.ok) {
      lockErrorMessage.value = lockFailureMessage(result.reason)
      return
    }
    lockPassword.value = ""
    lockPasswordConfirm.value = ""
    lockCurrentPassword.value = ""
  } finally {
    lockBusy.value = false
  }
}

/** 清除锁定密码（需当前密码）；成功后同时关闭失焦自动锁定（主进程同口径） */
const handleClearLockPassword = async () => {
  if (lockBusy.value) {
    return
  }

  if (!lockCurrentPassword.value) {
    lockErrorMessage.value = "请输入当前密码。"
    return
  }

  lockBusy.value = true
  lockErrorMessage.value = ""
  try {
    const result = await clearLockPassword(lockCurrentPassword.value)
    if (!result.ok) {
      lockErrorMessage.value = lockFailureMessage(result.reason)
      return
    }
    lockCurrentPassword.value = ""
    lockPassword.value = ""
    lockPasswordConfirm.value = ""
  } finally {
    lockBusy.value = false
  }
}

const handleAutoLockChange = (value: string | number | boolean) => {
  void setAutoLock(value === true, lockState.autoLockDelayMinutes)
}

const handleAutoLockDelayChange = (value: string | number | boolean | string[] | undefined) => {
  const minutes = Number(value)
  if (AUTO_LOCK_DELAY_OPTIONS.some((option) => option.value === minutes)) {
    void setAutoLock(lockState.autoLockOnBlur, minutes)
  }
}

const handleLockNow = () => {
  void lockNow()
}

onMounted(() => {
  void refreshLockState()
})

/** 返回：对齐 account 页的返回语义（回知识库列表页），按钮形态也是 account 页的「＜」 */
/**
 * 「＜」返回语义按端分流（2026-09-28 二次调整：Web 端入口已改为主窗口路由打开，
 * 不再弹独立窗）：
 * - 桌面端独立设置窗：返回 = 关窗（window.close()），焦点回主窗口；
 * - Web 端：设置页就是主窗口里的普通路由页，返回 = 标准导航——应用内导航而来
 *   （vue-router 在 history.state.back 记了来源）则原路返回，新标签直输 URL 的
 *   兜底回知识库列表。不判断 history.length：新标签的 about:blank 初始项会让
 *   back() 退出应用。
 */
const isDesktopSettingsWindow = () => Boolean(window.xiaoyeDesktop)

const handleBack = () => {
  if (isDesktopSettingsWindow()) {
    window.close()
    return
  }
  const routerState = window.history.state as { back?: string } | null
  if (routerState?.back) {
    router.back()
    return
  }
  void router.push({ name: "knowledge" })
}

/** 「其他设置」分组在语雀是 `isWin ? null : ...`，只在 macOS 出现；Web 端同非 mac 不渲染。 */
const isMac = computed(() => window.xiaoyeDesktop?.platform === "darwin")

const autoLoginLabel = `电脑开机时，自动启动${PRODUCT_NAME}`
const trayLabel = `在状态栏中显示${PRODUCT_NAME}图标，快速新建小记`
const betaLabel = "开启后，可接受内测版更新推送，第一时间体验最新功能和问题修复"

/** 返回钮提示：桌面独立窗语义是关窗，Web 端就是标准的「返回」 */
const backTitle = computed(() => (isDesktopSettingsWindow() ? "关闭设置窗口" : "返回"))
</script>

<template>
  <div class="kb-settings-page" data-testid="setting">
    <div class="kb-settings-title">
      <!-- 返回钮（D1 巡检批补齐）：形态对齐 account 页页头的「＜」，定位见样式块；
           标题块是拖窗区，按钮在样式里显式 no-drag -->
      <button class="kb-settings-back" type="button" :title="backTitle" @click="handleBack">
        <Icon icon="ph:caret-left" :width="15" :height="15" />
      </button>
      <h1>偏好设置</h1>
    </div>

    <div class="kb-settings-inner">
      <!-- 1. 颜色主题 -->
      <div class="kb-settings-group">
        <h2>颜色主题</h2>
        <div class="kb-settings-item">
          <div class="kb-settings-row">
            <span>当前主题</span>
            <el-select
              class="kb-settings-select"
              data-testid="change-theme"
              :model-value="colorTheme"
              @update:model-value="handleThemeChange"
            >
              <el-option
                v-for="option in COLOR_THEME_OPTIONS"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </el-select>
          </div>
        </div>
      </div>

      <!-- 2. 语言和时间（语雀此组下只有语言一项，没有「时间」设置，不臆造） -->
      <div class="kb-settings-group">
        <h2>语言和时间</h2>
        <div class="kb-settings-item">
          <div class="kb-settings-row">
            <span>显示语言</span>
            <el-select
              class="kb-settings-select"
              data-testid="change-language"
              disabled
              :model-value="settings.locale"
            >
              <el-option
                v-for="option in LOCALE_OPTIONS"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </el-select>
          </div>
          <p class="kb-settings-unavailable text-ink-quaternary">
            界面文案尚未接入多语言，暂不可切换。
          </p>
        </div>
      </div>

      <!-- 3. 启动和登录 -->
      <!-- D1 巡检登记：实测暗色该组开关区有 #9a9a9a 相邻灰（约 x71% y49%，经元素探针
           确认是「开机自启」el-switch）——Web 端 desktopFeaturesUnavailable 时开关
           is-disabled + 页面级 opacity 0.55 叠加出该灰，属 EP disabled 口径，豁免不改。
           「加入内测版体验计划」的恒禁用开关同态。 -->
      <div class="kb-settings-group">
        <h2>启动和登录</h2>
        <div class="kb-settings-item">
          <div class="kb-settings-row-between">
            <span>{{ autoLoginLabel }}</span>
            <el-switch
              class="kb-settings-switch"
              data-testid="change-login"
              :model-value="settings.openAtLogin"
              :disabled="desktopFeaturesUnavailable"
              @update:model-value="handleAutoLoginChange"
            />
          </div>
          <p v-if="desktopFeaturesUnavailable" class="kb-settings-unavailable">仅桌面端可用。</p>
        </div>
      </div>

      <!-- 4. 全局快捷键 -->
      <SettingsShortcutGroup />

      <!-- 5. 桌面端锁定（#27 已实现：桌面端可设/改/清密码 + 失焦自动锁定；Web 端整组禁用） -->
      <div class="kb-settings-group">
        <h2>桌面端锁定</h2>
        <div class="kb-settings-item">
          <p class="kb-settings-lock-state">
            应用锁定模式：{{
              lockAvailable ? (lockState.hasPassword ? "已启用" : "未启用") : "未启用"
            }}
          </p>
          <p class="kb-settings-lock-desc text-ink-secondary">{{ lockDescription }}</p>

          <template v-if="lockAvailable">
            <!-- 未设密码：新密码两遍确认启用；已设密码：验当前密码后改/清 -->
            <div class="kb-settings-lock-form">
              <el-input
                v-if="lockState.hasPassword"
                v-model="lockCurrentPassword"
                type="password"
                :disabled="lockBusy"
                placeholder="当前密码"
                class="kb-settings-lock-input"
              />
              <el-input
                v-model="lockPassword"
                type="password"
                :disabled="lockBusy"
                :placeholder="lockState.hasPassword ? '新密码' : '设置锁定密码（4-32 位）'"
                class="kb-settings-lock-input"
              />
              <el-input
                v-model="lockPasswordConfirm"
                type="password"
                :disabled="lockBusy"
                placeholder="确认新密码"
                class="kb-settings-lock-input"
              />
              <p v-if="lockErrorMessage" class="kb-settings-lock-error">{{ lockErrorMessage }}</p>
            </div>

            <div class="kb-settings-lock-actions">
              <el-button
                v-if="lockState.hasPassword"
                text
                class="kb-settings-lock-clear"
                :disabled="lockBusy"
                @click="handleClearLockPassword"
                ><span class="truncate">清除密码</span>
              </el-button>
              <div class="kb-settings-lock-actions-right">
                <el-button
                  v-if="lockState.hasPassword"
                  plain
                  class="kb-settings-lock-plain"
                  :disabled="lockBusy"
                  @click="handleLockNow"
                  ><span class="truncate">立即锁定</span>
                </el-button>
                <el-button type="primary" :loading="lockBusy" @click="handleSaveLockPassword"
                  ><span class="truncate">{{
                    lockState.hasPassword ? "修改密码" : "启用锁定"
                  }}</span>
                </el-button>
              </div>
            </div>

            <!-- 失焦自动锁定：主窗口失去焦点且无任何应用窗口持焦后计时（档位 1/5/15 分钟） -->
            <div class="kb-settings-row-between kb-settings-lock-auto">
              <span>应用失焦后自动锁定</span>
              <el-switch
                class="kb-settings-switch"
                data-testid="change-auto-lock"
                :model-value="lockState.autoLockOnBlur"
                :disabled="lockBusy || !lockState.hasPassword"
                @update:model-value="handleAutoLockChange"
              />
            </div>
            <div
              v-if="lockState.autoLockOnBlur && lockState.hasPassword"
              class="kb-settings-row kb-settings-lock-auto"
            >
              <span>自动锁定延迟</span>
              <el-select
                class="kb-settings-select"
                :model-value="lockState.autoLockDelayMinutes"
                @update:model-value="handleAutoLockDelayChange"
              >
                <el-option
                  v-for="option in AUTO_LOCK_DELAY_OPTIONS"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                />
              </el-select>
            </div>
          </template>

          <p v-else class="kb-settings-unavailable text-ink-quaternary">仅桌面端可用。</p>
        </div>
      </div>

      <!-- 6. 代理设置 -->
      <SettingsProxyGroup />

      <!-- 7. 其他设置：语雀仅在 macOS 渲染该组 -->
      <div v-if="isMac" class="kb-settings-group kb-settings-group-multi-col">
        <h2>其他设置</h2>
        <div class="kb-settings-item">
          <div class="kb-settings-row-between">
            <span>{{ trayLabel }}</span>
            <el-switch
              class="kb-settings-switch"
              data-testid="change-mac-tray"
              :model-value="settings.trayVisible"
              :disabled="desktopFeaturesUnavailable"
              @update:model-value="handleTrayChange"
            />
          </div>
          <p v-if="desktopFeaturesUnavailable" class="kb-settings-unavailable">仅桌面端可用。</p>
        </div>
      </div>

      <!-- 8. 加入内测版体验计划 -->
      <div class="kb-settings-group">
        <h2>加入内测版体验计划</h2>
        <div class="kb-settings-item">
          <div class="kb-settings-row-between">
            <span>
              {{ betaLabel }}
              <a
                v-if="BETA_HELP_URL"
                class="kb-settings-help-inline"
                @click="openExternal(BETA_HELP_URL)"
              >
                了解更多
              </a>
            </span>
            <!-- 无更新通道：条目照语雀原样呈现，恒禁用 -->
            <el-switch
              class="kb-settings-switch"
              data-testid="change-beta"
              :model-value="settings.isBetaVersion"
              disabled
            />
          </div>
          <p class="kb-settings-unavailable text-ink-quaternary">尚未接入更新通道，暂不可加入。</p>
        </div>
      </div>

      <!-- 8.5 AI 模型（自有差异组，语雀无此分组）：原画板「模型配置」弹层迁入统一管理 -->
      <SettingsAiModelGroup />

      <!-- 9. 关于 -->
      <SettingsAboutGroup />
    </div>
  </div>
</template>

<style>
/**
 * 页面度量：逐条对齐 `build/renderer/app.theme.css` 的 setting-module 与
 * `76858.theme.css` 的 index-module / lock-module 段。色值一律取 --kb-* token
 * （明暗自动换档），不写死字面色。
 */
.kb-settings-page {
  background-color: var(--kb-surface-bg);
  color: var(--kb-text);
  font-size: 14px;
  height: 100%;
  overflow-y: auto;
}

/* 隐藏原生标题栏后，这条标题块（从窗口顶 0 起算）就是设置窗口的拖窗区：它随内容滚走，
   不用 fixed 覆盖层，避免滚下来后顶部吞掉表单控件的点击。band 为 0 时（带原生标题栏 /
   Web 端）padding 归零，h1 仍是原来那条 30px 上边距，视觉与断言都不变。 */
.kb-settings-title {
  padding-top: var(--kb-window-chrome-band);
  -webkit-app-region: drag;
}

/* 返回钮：形态对齐 account 页页头的「＜」（28px 方形 + caret-left + hover 浅底）。
   绝对定位在 h1 居中盒（726px）左缘外侧 40px，不挤动 h1 原有度量与居中；
   标题块是拖窗区，必须显式 no-drag 否则点不动。hover 底走 --kb-fill-muted
   （暗色为白叠加 8%）而不是 grey-200——本页底就是暗 surface，grey-200 会隐形 */
.kb-settings-back {
  -webkit-app-region: no-drag;
  align-items: center;
  background-color: transparent;
  border: none;
  border-radius: var(--kb-radius-md);
  color: var(--kb-text-tertiary);
  cursor: pointer;
  display: inline-flex;
  height: 28px;
  justify-content: center;
  left: max(16px, calc(50% - 403px));
  padding: 0;
  position: absolute;
  top: calc(var(--kb-window-chrome-band) + 32px);
  transition:
    background-color var(--kb-transition-base),
    color var(--kb-transition-base);
  width: 28px;
}

.kb-settings-back:hover {
  background-color: var(--kb-fill-muted);
  color: var(--kb-text);
}

/* 语雀未给此 h1 声明字号（走 UA 的 2em，body 14px 即 28px），这里按算得的值钉住 */
.kb-settings-title h1 {
  color: var(--kb-text);
  font-size: 28px;
  font-weight: 500;
  margin: 30px auto 0;
  width: 726px;
}

.kb-settings-inner {
  margin: 0 auto;
  padding: 0 32px;
  width: 780px;
}

.kb-settings-group {
  position: relative;
}

.kb-settings-group h2 {
  color: var(--kb-text);
  font-size: 16px;
  font-weight: 500;
  margin: 24px 0;
}

.kb-settings-group .kb-settings-item {
  border-bottom: 1px solid var(--kb-border);
  line-height: 32px;
  margin-top: 24px;
  padding-bottom: 32px;
}

.kb-settings-group .kb-settings-item:first-child {
  margin-top: 0;
}

.kb-settings-group:last-child .kb-settings-item {
  border-bottom: none;
}

/* antd Row + Col span 18/6 等价：标签列 75%、控件列 25% */
.kb-settings-row {
  align-items: center;
  display: grid;
  grid-template-columns: 75% 25%;
}

.kb-settings-row-between {
  align-items: center;
  display: flex;
  justify-content: space-between;
}

.kb-settings-group-multi-col .kb-settings-row {
  margin-top: 20px;
}

.kb-settings-select {
  width: 100%;
}

/* 轨道尺寸不传 EP 的 size prop：校准层 el-switch 段的记档写明 --large 尺寸族
   「当前调用面 0 处，暂不校准」，默认档 44×24 本就等于 antd large，传了反而掉进未校准分支 */
.kb-settings-switch {
  margin-right: 8px;
}

/* 校准层把 EP 的 .6 禁用透明度 revert 掉了（要求调用方自备），基线口径是 .55 */
.kb-settings-switch.is-disabled {
  opacity: 0.55;
}

/* 本仓能力缺失的说明行：语雀无此行，取其 caption 级灰字，不与正文抢层级。
   字色走 text-ink-quaternary 工具类——style.css 的 html.dark p/span{color:inherit}
   会压过此处裸写的 color，暗色下只有工具类那条 !important 链路生效 */
.kb-settings-unavailable {
  font-size: 12px;
  line-height: 18px;
  margin: 8px 0 0;
}

.kb-settings-help-inline {
  color: var(--kb-brand);
  cursor: pointer;
  margin-left: 6px;
}

/* ---- 桌面端锁定（lock-module_*） ---- */
.kb-settings-lock-state {
  font-weight: 500;
  margin: 0;
}

.kb-settings-lock-desc {
  line-height: 22px;
  margin: 8px 0 0;
}

.kb-settings-lock-actions {
  display: flex;
  justify-content: space-between;
  margin-top: 20px;
}

/* 锁定密码表单（#27 可用化）：窄输入列，与语雀 lock-module 的表单段同观感 */
.kb-settings-lock-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
  max-width: 320px;
}

.kb-settings-lock-error {
  color: var(--kb-error);
  font-size: 12px;
  line-height: 18px;
  margin: 0;
}

.kb-settings-lock-actions-right {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.kb-settings-lock-auto {
  margin-top: 20px;
}

/* 失焦自动锁定行有独立上边距，紧邻行不叠加（首个 .kb-settings-lock-auto 前是 actions） */
.kb-settings-lock-auto + .kb-settings-lock-auto {
  margin-top: 12px;
}

/* ---- AI 模型（自有差异组，SettingsAiModelGroup） ---- */
/* item 基类的 32px 行高会串进内嵌配置卡片（内部文字自带 12-14px 档），
   用更高特异度收敛回正常行距；卡片内间距由组件自身的 Tailwind 类负责 */
.kb-settings-group .kb-settings-item.kb-settings-ai-item {
  line-height: 1.6;
}

.kb-settings-ai-desc {
  font-size: 12px;
  line-height: 18px;
  margin: 0 0 16px;
}

.kb-settings-ai-error {
  margin-top: 12px;
}
</style>
