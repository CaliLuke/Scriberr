import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github-dark-dimmed.css'
import './App.css'
import App from './App.tsx'
import { ThemeProvider } from './contexts/ThemeContext'
import { RouterProvider } from './contexts/RouterContext'
import { AuthProvider } from './contexts/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ToastProvider } from '@/components/ui/toast'
import { ChatEventsProvider } from './contexts/ChatEventsContext'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30, // 30s stale window for frequently polled resources
      refetchOnWindowFocus: false,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <RouterProvider>
            <TooltipProvider>
              <ToastProvider>
                <ChatEventsProvider>
                  <ProtectedRoute>
                    <App />
                  </ProtectedRoute>
                </ChatEventsProvider>
              </ToastProvider>
            </TooltipProvider>
          </RouterProvider>
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
)
