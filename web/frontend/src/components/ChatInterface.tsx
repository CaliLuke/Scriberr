import { useState, useEffect, useRef, useCallback, memo, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, Bot, User, MessageCircle, Copy, Check } from "lucide-react";
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import rehypeHighlight from 'rehype-highlight'
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useChatEvents } from "../contexts/ChatEventsContext";
import { useToast } from "./ui/toast";
import {
  ChatMessage,
  ChatSessionDetail,
  ChatSessionSummary,
  chatModelsQueryKey,
  chatSessionDetailQueryKey,
  chatSessionsQueryKey,
  fetchChatModels,
  fetchChatSessionDetail,
  fetchChatSessions,
} from "@/hooks/chatQueries";
import { ApiError } from "@/lib/api";

interface ChatInterfaceProps {
  transcriptionId: string;
  activeSessionId?: string;
  onSessionChange?: (sessionId: string | null) => void;
  onClose?: () => void;
  hideSidebar?: boolean;
}

export const ChatInterface = memo(function ChatInterface({ transcriptionId, activeSessionId, onSessionChange }: ChatInterfaceProps) {
  const queryClient = useQueryClient();
  const { emitSessionTitleUpdated, emitTitleGenerating } = useChatEvents();
  const { toast } = useToast();
  const [internalSessionId, setInternalSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useQuery({
    queryKey: chatModelsQueryKey,
    queryFn: fetchChatModels,
    onError: err => {
      const message = err instanceof ApiError ? err.message : "Failed to load models";
      setError(message);
    },
  });

  const { data: sessionsData } = useQuery({
    queryKey: chatSessionsQueryKey(transcriptionId),
    queryFn: () => fetchChatSessions(transcriptionId),
    enabled: !!transcriptionId,
    onError: err => {
      const message = err instanceof ApiError ? err.message : "Failed to load chat sessions";
      setError(message);
    },
  });

  const sessions = useMemo(() => sessionsData ?? [], [sessionsData]);

  useEffect(() => {
    if (activeSessionId) {
      setInternalSessionId(activeSessionId);
    }
  }, [activeSessionId]);

  useEffect(() => {
    if (!activeSessionId && sessions.length > 0 && !internalSessionId) {
      const firstId = sessions[0].id;
      setInternalSessionId(firstId);
      onSessionChange?.(firstId);
    }
  }, [sessions, activeSessionId, internalSessionId, onSessionChange]);

  const effectiveSessionId = useMemo(() => {
    if (activeSessionId) return activeSessionId;
    if (internalSessionId) return internalSessionId;
    return sessions[0]?.id ?? null;
  }, [activeSessionId, internalSessionId, sessions]);

  const activeSession = useMemo<ChatSessionSummary | null>(() => {
    if (!effectiveSessionId) return null;
    return sessions.find(s => s.id === effectiveSessionId) ?? null;
  }, [sessions, effectiveSessionId]);

  useEffect(() => {
    setMessages([]);
    setStreamingMessage("");
  }, [effectiveSessionId]);

  const { data: sessionDetail } = useQuery({
    queryKey: chatSessionDetailQueryKey(effectiveSessionId ?? 'inactive'),
    queryFn: () => fetchChatSessionDetail(effectiveSessionId as string),
    enabled: !!effectiveSessionId,
    onError: err => {
      const message = err instanceof ApiError ? err.message : "Failed to load chat session";
      setError(message);
      setMessages([]);
    },
  });

  useEffect(() => {
    if (sessionDetail) {
      setMessages(sessionDetail.messages ?? []);
      setError(null);
    }
  }, [sessionDetail]);

  const scrollToBottom = useCallback(() => {
    const el = messagesContainerRef.current
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, []);

  useEffect(() => {
    const el = messagesContainerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight)
    const nearBottom = distanceFromBottom < 120
    if (nearBottom) {
      scrollToBottom()
    }
  }, [messages, streamingMessage])

  const sendMessage = async () => {
    const sessionId = activeSession?.id ?? effectiveSessionId;
    if (!sessionId || !inputMessage.trim() || isLoading) return;

    const messageContent = inputMessage.trim();
    const previousMessages = messages;
    setInputMessage("");
    setIsLoading(true);
    setError(null);

    try {
      const userMessage: ChatMessage = {
        id: Date.now(),
        role: "user",
        content: messageContent,
        created_at: new Date().toISOString(),
      };
      setMessages(prev => [...prev, userMessage]);

      const response = await fetch(`/api/v1/chat/sessions/${sessionId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: `${messageContent}\n\nTypeset all your answers in markdown and provide the markdown formatted string. Write equations in latex. Your response should contain only the markdown formatted string - nothing else. DO NOT wrap your response in code blocks, backticks, or any other formatting - return the raw markdown content directly.`,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to send message");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      let assistantContent = "";
      setStreamingMessage("");

      const assistantMessage: ChatMessage = {
        id: Date.now() + 1,
        role: "assistant",
        content: "",
        created_at: new Date().toISOString(),
      };

      let assistantMessageIndex = -1;
      setMessages(prev => {
        assistantMessageIndex = prev.length;
        return [...prev, assistantMessage];
      });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = new TextDecoder().decode(value);
        assistantContent += chunk;

        setMessages(prev => {
          const updated = [...prev];
          if (assistantMessageIndex >= 0 && assistantMessageIndex < updated.length) {
            updated[assistantMessageIndex] = { ...updated[assistantMessageIndex], content: assistantContent };
          }
          return updated;
        });
      }

      const finalAssistantMessage: ChatMessage = { ...assistantMessage, content: assistantContent };
      const finalMessages = [...previousMessages, userMessage, finalAssistantMessage];

      const userMessageCount = finalMessages.filter(msg => msg.role === "user").length;
      const assistantMessageCount = finalMessages.filter(msg => msg.role === "assistant").length;

      if (userMessageCount === 2 && assistantMessageCount === 2) {
        setTimeout(async () => {
          emitTitleGenerating({ sessionId, isGenerating: true });
          try {
            const res = await fetch(`/api/v1/chat/sessions/${sessionId}/title/auto`, {
              method: 'POST',
            });
            if (res.ok) {
              const updated = (await res.json()) as ChatSessionSummary;
              queryClient.setQueryData(chatSessionsQueryKey(transcriptionId), (prev?: ChatSessionSummary[]) =>
                prev ? prev.map(s => (s.id === updated.id ? { ...s, title: updated.title } : s)) : prev,
              );
              queryClient.setQueryData(chatSessionDetailQueryKey(updated.id), (prev?: ChatSessionDetail) =>
                prev ? { ...prev, title: updated.title } : prev,
              );
              toast({
                title: '✨ Chat Renamed',
                description: `Renamed to "${updated.title}"`,
              });
              emitSessionTitleUpdated({ sessionId: updated.id, title: updated.title });
            }
          } catch (error) {
            console.error('Error generating title:', error);
            toast({
              title: 'Failed to generate title',
              description: 'Could not auto-generate chat title',
            });
          } finally {
            emitTitleGenerating({ sessionId, isGenerating: false });
          }
        }, 500);
      }

      queryClient.setQueryData(chatSessionsQueryKey(transcriptionId), (prev?: ChatSessionSummary[]) =>
        prev
          ? prev.map(s =>
              s.id === sessionId
                ? { ...s, message_count: finalMessages.length, updated_at: new Date().toISOString() }
                : s,
            )
          : prev,
      );
      queryClient.setQueryData(chatSessionDetailQueryKey(sessionId), (prev?: ChatSessionDetail) =>
        prev ? { ...prev, message_count: finalMessages.length } : prev,
      );
    } catch (err: any) {
      console.error("Error sending message:", err);
      setError(err.message);
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
      setStreamingMessage("");
      if (sessionId) {
        await queryClient.invalidateQueries({ queryKey: chatSessionDetailQueryKey(sessionId) });
        await queryClient.invalidateQueries({ queryKey: chatSessionsQueryKey(transcriptionId) });
      }
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Code block with copy button
  const PreBlock = (props: any) => {
    const preRef = useRef<HTMLPreElement>(null)
    const [copied, setCopied] = useState(false)
    const handleCopy = async () => {
      try {
        const text = preRef.current?.innerText || ''
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
      } catch {}
    }
    return (
      <div className="relative group">
        <button
          onClick={handleCopy}
          className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs bg-black/60 dark:bg-white/10 text-white dark:text-gray-200 hover:bg-black/70 dark:hover:bg-white/20 transition-opacity opacity-0 group-hover:opacity-100"
          aria-label="Copy code"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        <pre ref={preRef} className={props.className}>{props.children}</pre>
      </div>
    )
  }

  if (error && error.includes("OpenAI")) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6">
        <MessageCircle className="h-16 w-16 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2">OpenAI Configuration Required</h3>
        <p className="text-sm text-muted-foreground text-center mb-4">
          To use the chat feature, please configure your OpenAI API key in Settings.
        </p>
        <Button onClick={() => window.location.href = "/settings"}>
          Go to Settings
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      {activeSession || activeSessionId ? (
        <>
          {/* Messages Container */}
          <div 
            ref={messagesContainerRef} 
            className="flex-1 overflow-y-auto pb-2.5 flex flex-col justify-between w-full flex-auto max-w-full z-10"
            id="messages-container"
          >
            <div className="h-full w-full flex flex-col px-6 py-6 space-y-6">
              {(messages || []).map(message => (
                <div key={message.id} className="group w-full">
                  {message.role === "user" ? (
                    /* User Message */
                    <div className="flex justify-end">
                      <div className="flex w-full max-w-5xl px-6 mx-auto">
                        <div className="w-full flex justify-end">
                          <div className="flex space-x-3 max-w-3xl">
                            <div className="flex-1 overflow-hidden">
                              <div className="bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white rounded-2xl px-4 py-3 relative">
                                {/* Copy button */}
                                <button
                                  onClick={async () => { try { await navigator.clipboard.writeText(message.content || ''); } catch {} }}
                                  className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-600"
                                  title="Copy message"
                                >
                                  <Copy className="h-3 w-3" />
                                </button>
                                <div className="text-sm leading-relaxed pr-6">
                                  {message.content}
                                </div>
                              </div>
                            </div>
                            <div className="h-8 w-8 rounded-full bg-gray-300 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                              <User className="h-4 w-4 text-gray-700 dark:text-white" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Assistant Message */
                    <div className="flex justify-start">
                      <div className="flex w-full max-w-5xl px-6 mx-auto">
                        <div className="w-full flex justify-start">
                          <div className="flex space-x-3 max-w-5xl w-full">
                            <div className="h-8 w-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                              <Bot className="h-4 w-4 text-gray-700 dark:text-gray-200" />
                            </div>
                            <div className="flex-1 space-y-2 overflow-hidden">
                              <div className="flex items-center space-x-2">
                                <div className="font-medium text-gray-800 dark:text-gray-100 text-sm">Assistant</div>
                              </div>
                              <div className="prose prose-sm dark:prose-invert max-w-none text-gray-700 dark:text-gray-200 leading-relaxed">
                                {/* Copy button for assistant message */}
                                <button
                                  onClick={async () => { try { await navigator.clipboard.writeText(message.content || ''); } catch {} }}
                                  className="float-right opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 ml-2"
                                  title="Copy message"
                                >
                                  <Copy className="h-3 w-3" />
                                </button>
                                <ReactMarkdown
                                  remarkPlugins={[remarkMath]}
                                  rehypePlugins={[rehypeRaw as any, rehypeKatex as any, rehypeHighlight as any]}
                                  components={{ pre: PreBlock as any }}
                                >
                                  {message.content}
                                </ReactMarkdown>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              
              {/* Loading Indicator */}
              {isLoading && (
                <div className="group w-full">
                  <div className="flex justify-start">
                    <div className="flex w-full max-w-5xl px-6 mx-auto">
                      <div className="w-full flex justify-start">
                        <div className="flex space-x-3 max-w-5xl w-full">
                          <div className="h-8 w-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                            <Bot className="h-4 w-4 text-gray-700 dark:text-gray-200" />
                          </div>
                          <div className="flex-1 space-y-2 overflow-hidden">
                            <div className="flex items-center space-x-2">
                              <div className="font-medium text-gray-800 dark:text-gray-100 text-sm">Assistant</div>
                            </div>
                            <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400">
                              <div className="flex space-x-1">
                                <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                              </div>
                              <span className="text-sm">Generating response...</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input Area */}
          <div className="pb-2">
            <div className="flex w-full max-w-5xl px-6 mx-auto">
              <div className="w-full">
                <div className="flex items-end gap-3 bg-gray-50 dark:bg-gray-800 rounded-2xl p-3 mx-auto">
                  <Input
                    ref={inputRef}
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyDown={handleKeyPress}
                    placeholder="Send a message..."
                    disabled={isLoading}
                    className="flex-1 border-0 bg-transparent focus-visible:ring-0 focus:ring-0 outline-none resize-none text-sm placeholder:text-gray-500 dark:placeholder:text-gray-400"
                  />
                  <Button
                    onClick={sendMessage}
                    disabled={isLoading || !inputMessage.trim()}
                    size="sm"
                    className="h-8 w-8 p-0 rounded-full bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-gray-200 text-white dark:text-gray-900"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                {/* Bottom disclaimer */}
                <div className="text-xs text-gray-500 text-center mt-2 px-2">
                  AI can make mistakes. Verify important information.
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="flex items-center h-full">
          <div className="flex flex-col items-center justify-center w-full max-w-md mx-auto p-6 text-center">
            <div className="h-16 w-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
              <MessageCircle className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">How can I help you today?</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">
              Start a conversation about this transcript or ask any questions you have.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute bottom-4 right-4 bg-red-500 text-white p-3 rounded-lg shadow-lg max-w-sm">
          <p className="text-sm">{error}</p>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setError(null)}
            className="mt-2 text-white hover:bg-red-600"
          >
            Dismiss
          </Button>
        </div>
      )}
    </div>
  );
});
