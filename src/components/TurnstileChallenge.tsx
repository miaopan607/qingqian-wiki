/// <reference lib="es2024.promise" />

import { useEffect, useRef, useState } from 'react'

const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
const TURNSTILE_LOAD_TIMEOUT_MS = 10000

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string
      action: 'check-in'
      theme: 'auto'
      size: 'flexible'
      callback: (token: string) => void
      'expired-callback': () => void
      'error-callback': () => void
      'timeout-callback': () => void
    }
  ) => string
  reset: (widgetId: string) => void
  remove: (widgetId: string) => void
}

type ScriptLoad = {
  promise: Promise<TurnstileApi>
  users: number
  cancel: () => void
}

type TurnstileChallengeProps = {
  siteKey: string
  resetKey: number
  onTokenChange: (token: string | null) => void
  onError: (message: string) => void
  className?: string
}

let pendingScriptLoad: ScriptLoad | null = null

function getTurnstileApi(): TurnstileApi | null {
  const api = (window as Window & { turnstile?: TurnstileApi }).turnstile
  return api &&
    typeof api.render === 'function' &&
    typeof api.reset === 'function' &&
    typeof api.remove === 'function'
    ? api
    : null
}

function createScriptLoad(): ScriptLoad {
  const { promise, resolve, reject } = Promise.withResolvers<TurnstileApi>()
  const script = document.createElement('script')
  script.src = TURNSTILE_SCRIPT_URL
  script.async = true

  let settled = false
  let timer: number | undefined
  const cleanup = () => {
    window.clearTimeout(timer)
    script.onload = null
    script.onerror = null
    if (pendingScriptLoad === load) pendingScriptLoad = null
  }
  const fail = (message: string) => {
    if (settled) return
    settled = true
    cleanup()
    script.remove()
    reject(new Error(message))
  }
  const load: ScriptLoad = {
    promise,
    users: 0,
    cancel: () => fail('人机验证加载已取消'),
  }
  pendingScriptLoad = load
  script.onload = () => {
    if (settled) return
    const api = getTurnstileApi()
    if (!api) {
      fail('人机验证加载失败，请重试')
      return
    }
    settled = true
    cleanup()
    resolve(api)
  }
  script.onerror = () => fail('人机验证加载失败，请重试')
  timer = window.setTimeout(() => fail('人机验证加载超时，请重试'), TURNSTILE_LOAD_TIMEOUT_MS)
  try {
    document.head.appendChild(script)
  } catch {
    fail('人机验证加载失败，请重试')
  }
  return load
}

// 多个挑战共用加载 Promise，最后一个使用者卸载时取消未完成的加载。
function acquireTurnstile(): { promise: Promise<TurnstileApi>; release: () => void } {
  const api = getTurnstileApi()
  if (api) return { promise: Promise.resolve(api), release: () => {} }

  const load = pendingScriptLoad ?? createScriptLoad()
  load.users += 1
  let released = false
  return {
    promise: load.promise,
    release: () => {
      if (released) return
      released = true
      load.users -= 1
      if (load.users === 0 && pendingScriptLoad === load) load.cancel()
    },
  }
}

export function TurnstileChallenge({
  siteKey,
  resetKey,
  onTokenChange,
  onError,
  className,
}: TurnstileChallengeProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetRef = useRef<{ api: TurnstileApi; id: string } | null>(null)
  const callbacksRef = useRef({ onTokenChange, onError })
  const previousResetKey = useRef(resetKey)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    callbacksRef.current = { onTokenChange, onError }
  }, [onTokenChange, onError])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let disposed = false
    const loading = acquireTurnstile()
    callbacksRef.current.onTokenChange(null)

    const invalidateToken = (message: string) => {
      if (disposed) return
      callbacksRef.current.onTokenChange(null)
      callbacksRef.current.onError(message)
    }
    void loading.promise
      .then((api) => {
        if (disposed) return
        try {
          const id = api.render(container, {
            sitekey: siteKey,
            action: 'check-in',
            theme: 'auto',
            size: 'flexible',
            callback: (token) => {
              if (!disposed) callbacksRef.current.onTokenChange(token)
            },
            'expired-callback': () => invalidateToken('人机验证已过期，请重新验证'),
            'error-callback': () => invalidateToken('人机验证失败，请重新验证'),
            'timeout-callback': () => invalidateToken('人机验证超时，请重新验证'),
          })
          widgetRef.current = { api, id }
        } catch {
          invalidateToken('人机验证加载失败，请重试')
        }
      })
      .catch((error: unknown) => {
        invalidateToken(error instanceof Error ? error.message : '人机验证加载失败，请重试')
      })

    return () => {
      disposed = true
      loading.release()
      const widget = widgetRef.current
      widgetRef.current = null
      if (widget) {
        try {
          widget.api.remove(widget.id)
        } catch {
          // 卸载时不再更新错误状态，仍清除本组件持有的挑战节点。
        }
      }
      container.replaceChildren()
      callbacksRef.current.onTokenChange(null)
    }
  }, [siteKey, retryKey])

  useEffect(() => {
    if (previousResetKey.current === resetKey) return
    previousResetKey.current = resetKey
    callbacksRef.current.onTokenChange(null)
    const widget = widgetRef.current
    if (!widget) {
      // 脚本失败后也能通过 resetKey 重新加载，不复用失败的 Promise。
      setRetryKey((key) => key + 1)
      return
    }
    try {
      widget.api.reset(widget.id)
    } catch {
      callbacksRef.current.onError('人机验证重置失败，请重新验证')
      setRetryKey((key) => key + 1)
    }
  }, [resetKey])

  return <div ref={containerRef} className={className} />
}
