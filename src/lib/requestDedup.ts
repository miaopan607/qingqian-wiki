type CacheEntry = {
  promise: Promise<unknown>
  expiresAt: number
}

const DEFAULT_STALE_TIME_MS = 30 * 1000

const cache = new Map<string, CacheEntry>()

export function generateRequestKey(method: string, url: string): string {
  return `${method.toUpperCase()} ${url}`
}

// 同一 GET 在缓存有效期内复用同一 Promise，避免重复请求
export function dedupedRequest<T>(
  request: () => Promise<T>,
  key: string,
  staleTimeMs = DEFAULT_STALE_TIME_MS
): Promise<T> {
  const cached = cache.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.promise as Promise<T>
  }

  const promise = request().catch((error) => {
    cache.delete(key)
    throw error
  })

  cache.set(key, { promise, expiresAt: Date.now() + staleTimeMs })
  return promise
}

export function invalidateCacheByPrefix(prefix: string): void {
  for (const key of Array.from(cache.keys())) {
    if (key.includes(prefix)) cache.delete(key)
  }
}

export function clearRequestCache(): void {
  cache.clear()
}
