<script setup lang="ts">
/**
 * 账号设置页（/account 路由，侧栏账号卡「进入账号设置」的目标）。
 *
 * 基本资料编辑 + 密码修改 + 退出登录。资料读写走 services/user-profile
 * （token 传 null，由 auth-session 内部解析内存令牌并在 401 时单飞刷新重放）；
 * 页面先用 auth store 的本地档案即时回显，远端资料加载成功后合并回 store。
 */
import { computed, onMounted, reactive, ref } from "vue"
import { useRouter } from "vue-router"
import { useAuthStore } from "@/stores/auth"
import { changeMyPassword, fetchMyProfile, updateMyProfile } from "@/services/user-profile"
import { useTransientToast } from "@/composables/use-transient-toast"
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

const initials = computed(() => (profileForm.displayName || "用").trim().charAt(0).toUpperCase() || "用")

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
}

onMounted(() => {
  if (authStore.user) {
    applyProfile(authStore.user)
  }

  void fetchMyProfile()
    .then(profile => {
      applyProfile(profile)
      authStore.patchUser({
        displayName: profile.displayName,
        email: profile.email,
        phone: profile.phone,
        avatar: profile.avatar ?? null,
      })
    })
    .catch(() => {
      showToastMessage("读取账号资料失败，当前展示本地缓存信息。", "error")
    })
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

  profileSubmitting.value = true

  try {
    const updated = await updateMyProfile(null, {
      displayName,
      email: email || undefined,
      phone: phone || undefined,
    })

    applyProfile(updated)
    authStore.patchUser({
      displayName: updated.displayName,
      email: updated.email,
      phone: updated.phone,
      avatar: updated.avatar ?? null,
    })
    showToastMessage("账号资料已更新。", "success")
  } catch (error) {
    showToastMessage(error instanceof Error ? error.message : "更新账号资料失败。", "error")
  } finally {
    profileSubmitting.value = false
  }
}

const changePassword = async () => {
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
    showToastMessage("密码已更新。", "success")
  } catch (error) {
    showToastMessage(error instanceof Error ? error.message : "修改密码失败。", "error")
  } finally {
    passwordSubmitting.value = false
  }
}

const handleLogout = async () => {
  try {
    await authStore.logout()
  } finally {
    router.push({ name: "login" })
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
        <p class="mt-1 text-[12px] text-ink-tertiary">昵称会展示给协作成员，邮箱与手机号用于登录与通知。</p>

        <div class="mt-4 flex flex-col gap-4 sm:flex-row">
          <div class="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[12px] bg-brand-faint">
            <img v-if="avatarUrl" :src="avatarUrl" alt="头像" class="h-full w-full object-cover" />
            <span v-else class="flex h-full w-full items-center justify-center bg-brand text-lg font-semibold text-on-brand">
              {{ initials }}
            </span>
          </div>

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
          </div>
        </div>

        <div class="mt-4 flex justify-end">
          <el-button type="primary" :loading="profileSubmitting" @click="saveProfile">保存资料</el-button>
        </div>
      </section>

      <!-- 修改密码 -->
      <section class="mt-5 rounded-[12px] border border-line bg-surface p-5">
        <h2 class="text-[14px] font-semibold text-ink">修改密码</h2>
        <p class="mt-1 text-[12px] text-ink-tertiary">为保障账号安全，建议定期更换密码。</p>

        <div class="mt-4 grid gap-3 sm:grid-cols-3">
          <label class="block">
            <span class="mb-1.5 block text-[12px] text-ink-secondary">当前密码</span>
            <el-input v-model="passwordForm.current" type="password" show-password placeholder="当前密码" />
          </label>
          <label class="block">
            <span class="mb-1.5 block text-[12px] text-ink-secondary">新密码</span>
            <el-input v-model="passwordForm.next" type="password" show-password placeholder="至少 6 位" />
          </label>
          <label class="block">
            <span class="mb-1.5 block text-[12px] text-ink-secondary">确认新密码</span>
            <el-input v-model="passwordForm.confirm" type="password" show-password placeholder="再输入一次" />
          </label>
        </div>

        <div class="mt-4 flex justify-end">
          <el-button type="primary" :loading="passwordSubmitting" @click="changePassword">更新密码</el-button>
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
  </div>
</template>
