import { getApiBase } from '@/lib/runtime'

const IMAGE_PROXY_PATH = '/api/image-proxy'

export function normalizeEncounterImageUrl(rawUrl: string): string {
  const url = String(rawUrl ?? '').trim()
  if (!url) return ''
  if (
    url.startsWith('data:') ||
    url.startsWith('blob:') ||
    url.startsWith('file:') ||
    url.startsWith(IMAGE_PROXY_PATH)
  ) {
    return url
  }
  if (!/^https?:\/\//i.test(url)) return url
  const base = getApiBase()
  return `${base}${IMAGE_PROXY_PATH}?url=${encodeURIComponent(url)}`
}

