import { ref, watch } from "vue"

const isBrowser = typeof window !== "undefined" && typeof window.localStorage !== "undefined"

function readStorage<T>(key: string): T | null {
  if (!isBrowser) {
    return null
  }

  try {
    const raw = localStorage.getItem(key)

    if (raw === null) {
      return null
    }

    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function writeStorage<T>(key: string, value: T | null): void {
  if (!isBrowser) {
    return
  }

  try {
    if (value === null || value === undefined) {
      localStorage.removeItem(key)
      return
    }

    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 写入失败（如隐私模式/容量不足）时静默忽略
  }
}

export interface UseLocalStorageOptions<T> {
  defaultValue: T
  serializer?: {
    read: (raw: string) => T
    write: (value: T) => string
  }
}

export function useLocalStorage<T>(key: string, options: UseLocalStorageOptions<T>) {
  const { defaultValue } = options

  const stored = readStorage<T>(key)
  const data = ref<T>(stored ?? defaultValue)

  watch(
    data,
    (nextValue) => {
      writeStorage(key, nextValue)
    },
    { deep: true },
  )

  const remove = () => {
    data.value = defaultValue
    writeStorage(key, null)
  }

  return {
    data,
    remove,
  }
}
