<script setup lang="ts">
/**
 * 账号设置页（/account 路由，侧栏账号卡「进入账号设置」的目标）。
 *
 * 基本资料编辑 + 密码修改 + 退出登录。资料读写走 services/user-profile
 * （token 传 null，由 auth-session 内部解析内存令牌并在 401 时单飞刷新重放）；
 * 页面先用 auth store 的本地档案即时回显，远端资料加载成功后合并回 store。
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue"
import { useRouter } from "vue-router"
import { useAuthStore } from "@/stores/auth"
import { changeMyPassword, fetchMyProfile, updateMyProfile } from "@/services/user-profile"
import { uploadKnowledgeAsset } from "@/services/knowledge-oss"
import { useTransientToast } from "@/composables/use-transient-toast"
import { getApiErrorMessage } from "@/services/http-client"
import EmailCodeField from "@/components/auth/EmailCodeField.vue"
import UiIcon from "@/components/common/UiIcon.vue"

const router = useRouter()
const authStore = useAuthStore()
const { showToastMessage } = useTransientToast()

const profileForm = reactive({
  displayName: "",
  email: "",
  phone: "",
})
const passwordForm = reactive({
  current: "",
  next: "",
  confirm: "",
})
const avatarUrl = ref<string | null>(null)
const profileSubmitting = ref(false)
const passwordSubmitting = ref(false)

// 改绑邮箱（2026-09-23）：邮箱是找回密码的凭证通道，后端要求验证码证明新邮箱
// 所有权——仅在邮箱相对服务端档案发生变化时要求（日常改昵称/头像不受影响）
const currentEmail = ref("")
const emailChangeCode = ref("")
const emailChanged = computed(() => {
  const next = profileForm.email.trim().toLowerCase()
  return Boolean(next) && next !== currentEmail.value.toLowerCase()
})

// 头像上传链路：头像块点击 → 隐藏 file input → AvatarCropDialog 裁剪 →
// 上传对象存储拿公开 URL（本地即时生效）→ 随「保存资料」PATCH 持久化
const avatarFileInput = ref<HTMLInputElement | null>(null)
const cropDialogOpen = ref(false)
const cropSourceUrl = ref("")
const cropFilename = ref("")
const avatarUploading = ref(false)
let cropObjectUrl = ""

const initials = computed(
  () => (profileForm.displayName || "用").trim().charAt(0).toUpperCase() || "用",
)

const applyProfile = (profile: {
  displayName: string
  email: string | null
  phone: string | null
  avatar?: string | null
}) => {
  profileForm.displayName = profile.displayName || ""
  profileForm.email = profile.email || ""
  profileForm.phone = profile.phone || ""
  avatarUrl.value = profile.avatar || null
  currentEmail.value = profile.email || ""
}

// 档案请求守卫：挂载期 fetchMyProfile 的响应可能晚于「改名保存」甚至晚于
// 卸载（改密后自动登出），无守卫的 patchUser 会用旧档案覆盖 store 里的新值
let profileFetchDisposed = false
let profileEditSeq = 0

onMounted(() => {
  if (authStore.user) {
    applyProfile(authStore.user)
  }

  const fetchSeq = profileEditSeq
  void fetchMyProfile()
    .then((profile) => {
      if (profileFetchDisposed || fetchSeq !== profileEditSeq) {
        return
      }
      applyProfile(profile)
      authStore.patchUser({
        displayName: profile.displayName,
        email: profile.email,
        phone: profile.phone,
        avatar: profile.avatar ?? null,
      })
    })
    .catch(() => {
      if (!profileFetchDisposed) {
        showToastMessage("读取账号资料失败，当前展示本地缓存信息。", "error")
      }
    })
})

onBeforeUnmount(() => {
  profileFetchDisposed = true
  revokeCropObjectUrl()
})

const goBack = () => {
  if (window.history.length > 1) {
    router.back()
    return
  }

  router.push({ name: "knowledge" })
}

const saveProfile = async () => {
  const displayName = profileForm.displayName.trim()

  if (!displayName) {
    showToastMessage("昵称不能为空。", "error")
    return
  }

  const email = profileForm.email.trim()

  if (email && !email.includes("@")) {
    showToastMessage("邮箱格式不正确。", "error")
    return
  }

  const phone = profileForm.phone.trim()

  if (phone && !/^\d{6,20}$/.test(phone)) {
    showToastMessage("手机号格式不正确。", "error")
    return
  }

  if (emailChanged.value && !emailChangeCode.value.trim()) {
    showToastMessage("更换绑定邮箱需要先获取并输入邮箱验证码。", "error")
    return
  }

  profileSubmitting.value = true

  try {
    const updated = await updateMyProfile(null, {
      displayName,
      email: email || undefined,
      phone: phone || undefined,
      // 头像随资料一并持久化：刚上传过则是新 URL，否则回传当前值（幂等）
      avatar: avatarUrl.value || undefined,
      // 改绑邮箱时后端要求验证码（change_email purpose，一次性消费）
      emailCode: emailChanged.value ? emailChangeCode.value.trim() : undefined,
    })

    // 本地已落新档案：使挂载期还在途的旧档案请求失效（fetchSeq 守卫）
    profileEditSeq += 1
    applyProfile(updated)
    emailChangeCode.value = ""
    authStore.patchUser({
      displayName: updated.displayName,
      email: updated.email,
      phone: updated.phone,
      avatar: updated.avatar ?? null,
    })
    showToastMessage("账号资料已更新。", "success")
  } catch (error) {
    showToastMessage(getApiErrorMessage(error, "更新账号资料失败。"), "error")
  } finally {
    profileSubmitting.value = false
  }
}

/** 释放上一张待裁剪图的 objectURL（换图与卸载两个时机都覆盖）。 */
const revokeCropObjectUrl = () => {
  if (cropObjectUrl) {
    URL.revokeObjectURL(cropObjectUrl)
    cropObjectUrl = ""
  }
}

const triggerAvatarPicker = () => {
  if (avatarUploading.value) {
    return
  }
  avatarFileInput.value?.click()
}

const handleAvatarFileChange = (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  // 选完即清空 value：同一张图可重复选择（input 的 change 不因同文件二次触发）
  input.value = ""

  if (!file) {
    return
  }
  if (!file.type.startsWith("image/")) {
    showToastMessage("请选择图片文件。", "error")
    return
  }

  revokeCropObjectUrl()
  cropObjectUrl = URL.createObjectURL(file)
  cropSourceUrl.value = cropObjectUrl
  cropFilename.value = file.name
  cropDialogOpen.value = true
}

const handleAvatarCropConfirm = async (file: File) => {
  if (avatarUploading.value) {
    return
  }

  avatarUploading.value = true
  try {
    const url = await uploadKnowledgeAsset(file)
    // 上传成功仅本地生效，持久化随「保存资料」一并提交（对齐 toast 文案语义）
    avatarUrl.value = url
    showToastMessage("头像上传成功，保存后生效。", "success")
  } catch (error) {
    showToastMessage(getApiErrorMessage(error, "头像上传失败，请稍后重试。"), "error")
  } finally {
    avatarUploading.value = false
  }
}

const changePassword = async () => {
  // 资料保存进行中禁止改密：两个写操作并发时，改密 bump tokenVersion 会让
  // 在途的资料 PATCH 吃 401 被静默丢弃（改名丢失、重登后显示旧昵称）
  if (profileSubmitting.value) {
    showToastMessage("资料保存中，请稍后再修改密码。", "info")
    return
  }

  if (!passwordForm.current) {
    showToastMessage("请输入当前密码。", "error")
    return
  }

  if (passwordForm.next.length < 6) {
    showToastMessage("新密码至少需要 6 位。", "error")
    return
  }

  if (passwordForm.next !== passwordForm.confirm) {
    showToastMessage("两次输入的新密码不一致。", "error")
    return
  }

  passwordSubmitting.value = true

  try {
    await changeMyPassword(null, {
      currentPassword: passwordForm.current,
      newPassword: passwordForm.next,
    })

    passwordForm.current = ""
    passwordForm.next = ""
    passwordForm.confirm = ""
    // 后端改密即吊销全部会话（tokenVersion bump），主动走登出去向回登录入口，
    // 避免下一次请求 401 时被动作废当前窗口
    showToastMessage("密码已更新，请重新登录。", "success")
    void handleLogout()
  } catch (error) {
    showToastMessage(getApiErrorMessage(error, "修改密码失败。"), "error")
  } finally {
    passwordSubmitting.value = false
  }
}

/** 登出后的去向：桌面端销毁内容窗回到独立登录窗，Web 端整页跳登录页。 */
const goLogoutRoute = () => {
  const desktop = window.xiaoyeDesktop
  if (desktop?.logoutDesktop) {
    void desktop.logoutDesktop()
    return
  }
  router.push({ name: "login" })
}

const handleLogout = async () => {
  try {
    await authStore.logout()
  } finally {
    goLogoutRoute()
  }
}
</script>

<template>
  <div class="flex min-h-screen flex-col bg-surface-soft">
    <header class="border-b border-line bg-surface">
      <div class="mx-auto flex h-13 w-full max-w-[720px] items-center gap-2 px-6">
        <button
          type="button"
          aria-label="返回"
          class="flex h-8 w-8 items-center justify-center rounded-full text-ink-tertiary transition hover:bg-grey-200 hover:text-ink"
          @click="goBack"
        >
          <UiIcon icon="ph:caret-left" :width="16" :height="16" />
        </button>
        <h1 class="text-[15px] font-semibold text-ink">账号设置</h1>
      </div>
    </header>

    <main class="mx-auto w-full max-w-[720px] flex-1 px-6 pb-10 pt-6">
      <!-- 基本资料 -->
      <section class="rounded-[12px] border border-line bg-surface p-5">
        <h2 class="text-[14px] font-semibold text-ink">基本资料</h2>
        <p class="mt-1 text-[12px] text-ink-tertiary">
          昵称会展示给协作成员，邮箱与手机号用于登录与通知。
        </p>

        <div class="mt-4 flex flex-col gap-4 sm:flex-row">
          <div class="flex flex-col items-center gap-1.5">
            <button
              type="button"
              class="group relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[12px] bg-brand-faint transition hover:ring-2 hover:ring-brand-lighter"
              :disabled="avatarUploading"
              :title="avatarUploading ? '头像上传中…' : '点击更换头像'"
              aria-label="更换头像"
              @click="triggerAvatarPicker"
            >
              <img
                v-if="avatarUrl"
                :src="avatarUrl"
                alt="头像"
                class="h-full w-full object-cover"
              />
              <span
                v-else
                class="flex h-full w-full items-center justify-center bg-brand text-lg font-semibold text-on-brand"
              >
                {{ initials }}
              </span>
            </button>
            <span class="text-[11px] text-ink-quaternary">点击更换</span>
          </div>

          <!-- 隐藏文件入口：头像块点击触发；自动化冒烟经 input 直接 setInputFiles -->
          <input
            ref="avatarFileInput"
            type="file"
            accept="image/*"
            class="hidden"
            aria-hidden="true"
            tabindex="-1"
            @change="handleAvatarFileChange"
          />

          <div class="grid flex-1 gap-3 sm:grid-cols-2">
            <label class="block">
              <span class="mb-1.5 block text-[12px] text-ink-secondary">昵称</span>
              <el-input v-model="profileForm.displayName" maxlength="32" placeholder="展示名称" />
            </label>
            <label class="block">
              <span class="mb-1.5 block text-[12px] text-ink-secondary">手机号</span>
              <el-input v-model="profileForm.phone" maxlength="20" placeholder="选填" />
            </label>
            <label class="block sm:col-span-2">
              <span class="mb-1.5 block text-[12px] text-ink-secondary">邮箱</span>
              <el-input v-model="profileForm.email" maxlength="64" placeholder="用于登录与通知" />
            </label>
            <div v-if="emailChanged" class="sm:col-span-2">
              <EmailCodeField
                v-model:code="emailChangeCode"
                :email="profileForm.email"
                purpose="change_email"
                name="change-email-code"
              />
            </div>
          </div>
        </div>

        <div class="mt-4 flex justify-end">
          <el-button type="primary" :loading="profileSubmitting" @click="saveProfile"
            >保存资料</el-button
          >
        </div>
      </section>

      <!-- 修改密码 -->
      <section class="mt-5 rounded-[12px] border border-line bg-surface p-5">
        <h2 class="text-[14px] font-semibold text-ink">修改密码</h2>
        <p class="mt-1 text-[12px] text-ink-tertiary">为保障账号安全，建议定期更换密码。</p>

        <div class="mt-4 grid gap-3 sm:grid-cols-3">
          <label class="block">
            <span class="mb-1.5 block text-[12px] text-ink-secondary">当前密码</span>
            <el-input
              v-model="passwordForm.current"
              type="password"
              show-password
              placeholder="当前密码"
            />
          </label>
          <label class="block">
            <span class="mb-1.5 block text-[12px] text-ink-secondary">新密码</span>
            <el-input
              v-model="passwordForm.next"
              type="password"
              show-password
              placeholder="至少 6 位"
            />
          </label>
          <label class="block">
            <span class="mb-1.5 block text-[12px] text-ink-secondary">确认新密码</span>
            <el-input
              v-model="passwordForm.confirm"
              type="password"
              show-password
              placeholder="再输入一次"
            />
          </label>
        </div>

        <div class="mt-4 flex justify-end">
          <el-button
            type="primary"
            :loading="passwordSubmitting"
            :disabled="profileSubmitting"
            @click="changePassword"
            >更新密码</el-button
          >
        </div>
      </section>

      <!-- 退出登录 -->
      <section class="mt-5 rounded-[12px] border border-line bg-surface p-5">
        <h2 class="text-[14px] font-semibold text-ink">退出登录</h2>
        <p class="mt-1 text-[12px] text-ink-tertiary">退出后需要重新输入账号密码才能继续使用。</p>
        <div class="mt-3">
          <el-button type="danger" plain @click="handleLogout">退出登录</el-button>
        </div>
      </section>
    </main>

    <AvatarCropDialog
      v-model:open="cropDialogOpen"
      :source-url="cropSourceUrl"
      :filename="cropFilename"
      @confirm="handleAvatarCropConfirm"
    />
  </div>
</template>
