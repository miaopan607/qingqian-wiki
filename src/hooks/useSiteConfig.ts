import { useEffect, useState } from 'react'
import { apiGet } from '../lib/apiClient'
import type { PublicConfigResponse } from '../types/api'

const FALLBACK_CONFIG: PublicConfigResponse = {
  name: '清浅 Wiki',
  description: '清浅 · 美图与键帽档案',
  registrationOpen: true,
}

let cached: Promise<PublicConfigResponse> | null = null

function loadSiteConfig(): Promise<PublicConfigResponse> {
  if (!cached) {
    cached = apiGet<PublicConfigResponse>('/api/config/public').catch(() => FALLBACK_CONFIG)
  }
  return cached
}

// 站点名称/简介/注册开关：进程内只请求一次；后台改设置后调用 invalidate 重新拉取
export function invalidateSiteConfig(): void {
  cached = null
}

export function useSiteConfig(): { config: PublicConfigResponse; loading: boolean } {
  const [config, setConfig] = useState<PublicConfigResponse>(FALLBACK_CONFIG)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    loadSiteConfig()
      .then((next) => {
        if (!active) return
        setConfig(next)
        document.title = `${next.name}`
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  return { config, loading }
}
