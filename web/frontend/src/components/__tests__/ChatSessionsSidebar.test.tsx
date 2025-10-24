import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChatSessionsSidebar } from '../ChatSessionsSidebar'

const unsubscribe = vi.fn()

vi.mock('@/contexts/ChatEventsContext', () => ({
  useChatEvents: () => ({
    subscribeSessionTitleUpdated: (fn: (payload: { sessionId: string; title: string }) => void) => {
      // expose trigger helper for tests
      ;(globalThis as any).__chatTitleUpdate = fn
      return unsubscribe
    },
    subscribeTitleGenerating: (fn: (payload: { sessionId: string; isGenerating: boolean }) => void) => {
      ;(globalThis as any).__chatTitleGenerating = fn
      return unsubscribe
    },
  }),
}))

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('ChatSessionsSidebar', () => {
  const originalFetch = global.fetch
  const originalConfirm = window.confirm
  const onSessionChange = vi.fn()

  beforeEach(() => {
    onSessionChange.mockReset()
    unsubscribe.mockReset()
  })

  afterEach(() => {
    global.fetch = originalFetch
    window.confirm = originalConfirm
    vi.clearAllMocks()
  })

  it('renders sessions from API', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (typeof input === 'string' && input.endsWith('/api/v1/chat/models')) {
        return new Response(JSON.stringify({ models: ['gpt-4'] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (typeof input === 'string' && input.includes('/api/v1/chat/transcriptions/abc/sessions')) {
        return new Response(JSON.stringify([{ id: 'session-1', transcription_id: 'abc', model: 'gpt-4', title: 'Existing chat', message_count: 2 }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(null, { status: 404 })
    }) as typeof fetch

    global.fetch = fetchMock

    render(<ChatSessionsSidebar transcriptionId="abc" onSessionChange={onSessionChange} />, { wrapper: createWrapper() })

    expect(await screen.findByText(/Existing chat/i)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/chat/models', expect.any(Object))
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/chat/transcriptions/abc/sessions', expect.any(Object))
  })

  it('creates a session and switches focus', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (typeof input === 'string' && input.endsWith('/api/v1/chat/models')) {
        return new Response(JSON.stringify({ models: ['gpt-4'] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (typeof input === 'string' && input.includes('/api/v1/chat/transcriptions/abc/sessions') && (!init || !init.method || init.method === 'GET')) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (typeof input === 'string' && input.endsWith('/api/v1/chat/sessions') && init?.method === 'POST') {
        return new Response(JSON.stringify({ id: 'created-session', transcription_id: 'abc', title: 'New chat', model: 'gpt-4', message_count: 0 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(null, { status: 404 })
    }) as typeof fetch

    global.fetch = fetchMock

    render(<ChatSessionsSidebar transcriptionId="abc" onSessionChange={onSessionChange} />, { wrapper: createWrapper() })

    await userEvent.click(await screen.findByTitle(/new chat/i))
    await userEvent.type(screen.getByLabelText(/title/i), 'Brainstorm')
    await userEvent.click(screen.getByRole('button', { name: /create session/i }))

    await waitFor(() => expect(onSessionChange).toHaveBeenCalledWith('created-session'))
    expect(screen.getByText(/New chat/i)).toBeInTheDocument()
  })

  it('deletes a session after confirmation', async () => {
    window.confirm = vi.fn(() => true)

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (typeof input === 'string' && input.endsWith('/api/v1/chat/models')) {
        return new Response(JSON.stringify({ models: ['gpt-4'] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (typeof input === 'string' && input.includes('/api/v1/chat/transcriptions/abc/sessions') && (!init || !init.method || init.method === 'GET')) {
        return new Response(JSON.stringify([{ id: 'session-1', transcription_id: 'abc', model: 'gpt-4', title: 'Existing chat', message_count: 2 }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (typeof input === 'string' && input.endsWith('/api/v1/chat/sessions/session-1') && init?.method === 'DELETE') {
        return new Response(null, { status: 204 })
      }
      return new Response(null, { status: 404 })
    }) as typeof fetch

    global.fetch = fetchMock

    render(<ChatSessionsSidebar transcriptionId="abc" activeSessionId="session-1" onSessionChange={onSessionChange} />, { wrapper: createWrapper() })

    await screen.findByText(/Existing chat/i)
    await userEvent.hover(screen.getByText(/Existing chat/i))
    await userEvent.click(screen.getByTitle(/delete session/i))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/v1/chat/sessions/session-1', expect.objectContaining({ method: 'DELETE' })))
  })
})
