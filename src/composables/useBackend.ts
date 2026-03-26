import { ref } from 'vue'

const DEFAULT_BACKEND_URL = 'http://localhost:8000'

export function useBackend() {
  const baseUrl = (import.meta as any).env?.VITE_BACKEND_URL || DEFAULT_BACKEND_URL
  const lastError = ref<string | null>(null)

  async function get<T = any>(path: string): Promise<T> {
    lastError.value = null
    const url = baseUrl + path
    console.log('[backend:get]', url)
    const res = await fetch(url)
    if (!res.ok) {
      const text = await res.text()
      lastError.value = text || res.statusText
      throw new Error(lastError.value)
    }
    return (await res.json()) as T
  }

  async function postJson<T = any>(path: string, body: any): Promise<T> {
    lastError.value = null
    const url = baseUrl + path
    console.log('[backend:post]', url, body)
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text()
      lastError.value = text || res.statusText
      throw new Error(lastError.value)
    }
    return (await res.json()) as T
  }

  function buildUrl(path: string): string {
    return baseUrl + path
  }

  return {
    baseUrl,
    lastError,
    get,
    postJson,
    buildUrl,
  }
}
