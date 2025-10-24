export class ApiError<T = unknown> extends Error {
  status: number
  data: T | null

  constructor(status: number, message: string, data: T | null = null) {
    super(message || `Request failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

export type ApiRequestInit = RequestInit & {
  json?: unknown
}

const hasJsonContent = (response: Response) => {
  const contentType = response.headers.get('content-type')
  return contentType ? contentType.includes('application/json') : false
}

export async function request<T = unknown>(input: RequestInfo | URL, init?: ApiRequestInit): Promise<T> {
  const { json, headers, ...rest } = init ?? {}

  const mergedHeaders = new Headers(headers as HeadersInit | undefined)
  let body: BodyInit | undefined = rest.body as BodyInit | undefined

  if (json !== undefined) {
    if (!mergedHeaders.has('Content-Type')) {
      mergedHeaders.set('Content-Type', 'application/json')
    }
    body = JSON.stringify(json)
  }

  const response = await fetch(input, {
    ...rest,
    headers: mergedHeaders,
    body,
  })

  if (response.status === 204) {
    return undefined as T
  }

  let payload: any = null
  if (hasJsonContent(response)) {
    try {
      payload = await response.json()
    } catch {
      payload = null
    }
  } else {
    payload = await response.text()
  }

  if (!response.ok) {
    const errorMessage =
      typeof payload === 'object' && payload !== null && 'error' in payload
        ? String(payload.error)
        : response.statusText
    throw new ApiError(response.status, errorMessage, payload)
  }

  return payload as T
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}
