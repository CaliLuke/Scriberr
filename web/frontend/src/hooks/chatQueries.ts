import { request } from '@/lib/api'

export interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export interface ChatSessionSummary {
  id: string
  transcription_id: string
  title: string
  model: string
  message_count: number
  created_at?: string
  updated_at?: string
}

export interface ChatSessionDetail extends ChatSessionSummary {
  is_active?: boolean
  messages: ChatMessage[]
}

export const chatModelsQueryKey = ['chat', 'models'] as const

export const chatSessionsQueryKey = (transcriptionId: string) => ['chat', transcriptionId, 'sessions'] as const

export const chatSessionDetailQueryKey = (sessionId: string) => ['chat', 'session', sessionId] as const

export const fetchChatModels = async () => {
  const data = await request<{ models?: string[] }>('/api/v1/chat/models')
  return data.models ?? []
}

export const fetchChatSessions = async (transcriptionId: string) => {
  return await request<ChatSessionSummary[]>(`/api/v1/chat/transcriptions/${transcriptionId}/sessions`)
}

export const fetchChatSessionDetail = async (sessionId: string) => {
  return await request<ChatSessionDetail>(`/api/v1/chat/sessions/${sessionId}`)
}
