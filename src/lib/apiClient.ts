import { AppError, classifyError, notifyAuthError } from './errorHandler'
import { dedupedRequest, generateRequestKey } from './requestDedup'
import { getXsrfToken } from './xsrf'

export type QueryValue = string | number | boolean | undefined | null

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  query?: Record<string, QueryValue>
  body?: unknown
  signal?: AbortSignal
  dedup?: boolean
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  if (!query) return path

  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    params.append(key, String(value))
  }

  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    const error = classifyError(response.status, data)
    notifyAuthError(error)
    throw error
  }

  return data as T
}

async function executeRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET'
  const url = buildUrl(path, options.query)
  const isWrite = method !== 'GET'
  const xsrfToken = isWrite ? getXsrfToken() : null

  const response = await fetch(url, {
    method,
    credentials: 'include',
    signal: options.signal,
    headers: {
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(xsrfToken ? { 'X-XSRF-TOKEN': xsrfToken } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })

  return parseResponse<T>(response)
}

// 前端唯一网络出口：自动携带 CSRF 头，GET 默认去重缓存
export function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET'
  const canDedup = (options.dedup ?? true) && method === 'GET' && !options.signal

  if (!canDedup) {
    return executeRequest<T>(path, options)
  }

  const key = generateRequestKey(method, buildUrl(path, options.query))
  return dedupedRequest(() => executeRequest<T>(path, options), key)
}

export function apiGet<T>(path: string, query?: Record<string, QueryValue>, signal?: AbortSignal) {
  return apiRequest<T>(path, { method: 'GET', query, signal, dedup: !signal })
}

export function apiPost<T>(path: string, body?: unknown) {
  return apiRequest<T>(path, { method: 'POST', body, dedup: false })
}

export function apiPatch<T>(path: string, body?: unknown) {
  return apiRequest<T>(path, { method: 'PATCH', body, dedup: false })
}

export function apiDelete<T>(path: string, body?: unknown) {
  return apiRequest<T>(path, { method: 'DELETE', body, dedup: false })
}

export type UploadOptions = {
  signal?: AbortSignal
  onProgress?: (percent: number) => void
}

// 上传走 XHR 以获取进度：图片较大，进度反馈必要
export function apiUpload<T>(path: string, formData: FormData, options: UploadOptions = {}) {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    if (options.onProgress) {
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          options.onProgress?.(Math.round((event.loaded / event.total) * 100))
        }
      })
    }

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as T)
        } catch {
          reject(new AppError('响应解析失败', xhr.status))
        }
        return
      }

      let payload: unknown = {}
      try {
        payload = JSON.parse(xhr.responseText)
      } catch {
        payload = {}
      }
      const error = classifyError(xhr.status, payload)
      notifyAuthError(error)
      reject(error)
    })

    xhr.addEventListener('error', () => {
      reject(new AppError('网络异常，上传失败', 0))
    })

    xhr.addEventListener('abort', () => {
      reject(new AppError('上传已取消', 0))
    })

    xhr.open('POST', path)
    xhr.withCredentials = true

    const xsrfToken = getXsrfToken()
    if (xsrfToken) {
      xhr.setRequestHeader('X-XSRF-TOKEN', xsrfToken)
    }

    if (options.signal) {
      options.signal.addEventListener('abort', () => xhr.abort())
    }

    xhr.send(formData)
  })
}
