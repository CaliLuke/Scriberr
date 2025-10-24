import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChatInterface } from '../ChatInterface'

vi.mock('@/contexts/ChatEventsContext', () => ({
  useChatEvents: () => ({
    emitSessionTitleUpdated: vi.fn(),
    emitTitleGenerating: vi.fn(),
    subscribeSessionTitleUpdated: () => () => {},
    subscribeTitleGenerating: () => () => {},
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
    },
  })

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('ChatInterface', () => {
  const originalFetch = global.fetch

  beforeAll(() => {
    Object.defineProperty(window.HTMLElement.prototype, 'scrollTo', {
      value: vi.fn(),
      configurable: true,
    })
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.clearAllMocks()
  })

  it('renders messages from the active chat session', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()

      if (url.endsWith('/api/v1/chat/models')) {
        return new Response(JSON.stringify({ models: ['gpt-4'] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      if (url.endsWith('/api/v1/chat/transcriptions/abc/sessions') && (!init || !init.method || init.method === 'GET')) {
        return new Response(JSON.stringify([
          { id: 'session-1', transcription_id: 'abc', title: 'Existing chat', model: 'gpt-4', message_count: 1 },
        ]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      if (url.endsWith('/api/v1/chat/sessions/session-1') && (!init || !init.method || init.method === 'GET')) {
        return new Response(JSON.stringify({
          id: 'session-1',
          transcription_id: 'abc',
          title: 'Existing chat',
          model: 'gpt-4',
          message_count: 1,
          messages: [
            { id: 1, role: 'assistant', content: 'Hello from assistant', created_at: new Date().toISOString() },
            { id: 2, role: 'user', content: 'Hi there', created_at: new Date().toISOString() },
          ],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      return new Response(null, { status: 404 })
    }) as typeof fetch

    global.fetch = fetchMock

    render(
      <ChatInterface transcriptionId="abc" />,
      { wrapper: createWrapper() },
    )

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/v1/chat/sessions/session-1', expect.anything()),
    )

    expect(await screen.findByText(/Hello from assistant/i)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/chat/models', expect.anything())
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/chat/transcriptions/abc/sessions', expect.anything())
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/chat/sessions/session-1', expect.anything())
  })
})
