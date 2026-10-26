import { useState, useEffect, useRef, useCallback } from 'react';
import { Header } from './components/Header';
import { SessionDrawer } from './components/SessionDrawer';
import { ModelSelectorModal } from './components/ModelSelectorModal';
import { MessageCard } from './components/MessageCard';
import { ChatInput } from './components/ChatInput';
import { Session, Message, ModelsConfig, ModelItem } from './types';
import * as api from './api';
import { Camera, ArrowRight } from 'lucide-react';

export function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get('session') || localStorage.getItem('promptforge_active_session_id') || null;
    } catch {
      return null;
    }
  });
  const [messages, setMessages] = useState<Message[]>([]);
  const [modelsConfig, setModelsConfig] = useState<ModelsConfig | null>(null);
  const [activeModel, setActiveModel] = useState<string>(() => {
    try {
      return localStorage.getItem('promptforge_active_model') || 'z-ai/glm-5.3-flash';
    } catch {
      return 'z-ai/glm-5.3-flash';
    }
  });
  const [activeThinking, setActiveThinking] = useState<string>(() => {
    try {
      return localStorage.getItem('promptforge_active_thinking') || 'high';
    } catch {
      return 'high';
    }
  });

  // UI Drawer & Modal States
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isModelModalOpen, setIsModelModalOpen] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isCatchingUp, setIsCatchingUp] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [streamingError, setStreamingError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Synchronous status refs for event listeners and background callbacks
  const isStreamingRef = useRef(false);
  isStreamingRef.current = isStreaming;
  const isCatchingUpRef = useRef(false);
  isCatchingUpRef.current = isCatchingUp;
  const currentSessionIdRef = useRef(currentSessionId);
  currentSessionIdRef.current = currentSessionId;

  // Track pending generation to prevent stale assistant responses from falsely terminating catch-up
  const pendingGenerationRef = useRef<{
    sessionId: string;
    userMessageId: string;
    userMessageContent: string;
    startedAt: number;
  } | null>(null);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // Sync session ID to URL search params
  const updateUrlSession = (sessionId: string | null) => {
    const url = new URL(window.location.href);
    if (sessionId) {
      url.searchParams.set('session', sessionId);
    } else {
      url.searchParams.delete('session');
    }
    window.history.replaceState({}, '', url.toString());
  };

  // Scroll to bottom smoothly
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' });
  }, []);

  // Start catch-up polling when stream is interrupted, disconnected, or app rehydrated
  const startCatchUp = useCallback((sessionIdToCheck: string, expectedMinTime?: number) => {
    stopPolling();
    setIsCatchingUp(true);
    setIsStreaming(true);
    setStreamingError(null);

    // If last message in local state is user, append placeholder assistant message
    setMessages((prev) => {
      const last = prev.length > 0 ? prev[prev.length - 1] : null;
      if (last && last.role === 'user') {
        return [
          ...prev,
          {
            id: `catchup-${last.id}`,
            session_id: sessionIdToCheck,
            role: 'assistant',
            content: '',
            thinking: '',
            created_at: Date.now(),
          },
        ];
      }
      return prev;
    });

    let attempts = 0;
    const maxAttempts = 40; // 40 * 1.5s = 60s
    const pollInterval = 1500;

    const pollStep = async () => {
      // Abort catchup if user navigated away from this session
      if (currentSessionIdRef.current !== sessionIdToCheck) {
        stopPolling();
        return;
      }

      attempts++;
      try {
        const freshData = await api.fetchSession(sessionIdToCheck);
        if (currentSessionIdRef.current !== sessionIdToCheck) {
          stopPolling();
          return;
        }

        const freshMsgs = freshData.messages || [];
        const freshLast = freshMsgs.length > 0 ? freshMsgs[freshMsgs.length - 1] : null;

        // Condition for completion: assistant message is committed in SQLite AND
        // it is non-empty AND its timestamp is at or after expectedMinTime (with 5s clock tolerance)
        const isCompleted =
          freshLast &&
          freshLast.role === 'assistant' &&
          freshLast.content.trim().length > 0 &&
          (expectedMinTime ? freshLast.created_at >= (expectedMinTime - 5000) : true);

        if (isCompleted) {
          stopPolling();
          pendingGenerationRef.current = null;
          setMessages(freshMsgs);
          setIsStreaming(false);
          setIsCatchingUp(false);
          const updatedSessions = await api.fetchSessions();
          setSessions(updatedSessions);
          setTimeout(() => scrollToBottom('smooth'), 50);
          return;
        }

        if (attempts >= maxAttempts) {
          stopPolling();
          pendingGenerationRef.current = null;
          setIsStreaming(false);
          setIsCatchingUp(false);
          setStreamingError('Prompt generation timed out on server. Tap refresh to check again.');
        }
      } catch {
        if (attempts >= maxAttempts) {
          stopPolling();
          pendingGenerationRef.current = null;
          setIsStreaming(false);
          setIsCatchingUp(false);
        }
      }
    };

    // First check immediately, then poll every 1.5s
    pollStep();
    pollIntervalRef.current = setInterval(pollStep, pollInterval);
  }, [stopPolling, scrollToBottom]);

  // Check if server completed an assistant generation while client was dropped or disconnected
  const checkPendingGeneration = useCallback((sessionIdToCheck: string, initialMsgs: Message[]) => {
    const lastMsg = initialMsgs && initialMsgs.length > 0 ? initialMsgs[initialMsgs.length - 1] : null;
    // If last message is from user and was submitted recently (< 150 seconds ago), poll for completion
    if (lastMsg && lastMsg.role === 'user' && (Date.now() - lastMsg.created_at) < 150000) {
      pendingGenerationRef.current = {
        sessionId: sessionIdToCheck,
        userMessageId: lastMsg.id,
        userMessageContent: lastMsg.content,
        startedAt: lastMsg.created_at,
      };
      startCatchUp(sessionIdToCheck, lastMsg.created_at);
    } else {
      stopPolling();
      pendingGenerationRef.current = null;
      setIsStreaming(false);
      setIsCatchingUp(false);
    }
  }, [startCatchUp, stopPolling]);

  // Load a session by ID
  const loadSession = useCallback(async (id: string, configFallback?: ModelsConfig | null) => {
    stopPolling();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    pendingGenerationRef.current = null;
    setIsStreaming(false);
    setIsCatchingUp(false);
    setStreamingError(null);

    try {
      const data = await api.fetchSession(id);
      setCurrentSessionId(data.id);
      try {
        localStorage.setItem('promptforge_active_session_id', data.id);
      } catch {}
      if (data.model) {
        setActiveModel(data.model);
        try {
          localStorage.setItem('promptforge_active_model', data.model);
        } catch {}
      } else if (configFallback?.default_model) {
        setActiveModel(configFallback.default_model);
      }
      setMessages(data.messages || []);
      updateUrlSession(data.id);
      setTimeout(() => scrollToBottom('auto'), 50);
      checkPendingGeneration(data.id, data.messages || []);
    } catch (err: any) {
      if (err?.status === 404) {
        console.warn('Session not found on server, creating a new session:', err);
        await handleNewSession(configFallback);
      } else {
        console.error('Session load failed (network/temporary error):', err);
      }
    }
  }, [checkPendingGeneration, scrollToBottom, stopPolling]);

  // Create a brand new session
  const handleNewSession = async (cfgOverride?: ModelsConfig | null) => {
    stopPolling();
    try {
      const cfg = cfgOverride || modelsConfig;
      const modelToUse = activeModel || cfg?.default_model || 'z-ai/glm-5.3-flash';
      const created = await api.createSession({
        title: 'New Session',
        model: modelToUse,
      });
      setSessions((prev) => [created, ...prev]);
      setCurrentSessionId(created.id);
      try {
        localStorage.setItem('promptforge_active_session_id', created.id);
      } catch {}
      setMessages([]);
      updateUrlSession(created.id);
    } catch (err) {
      console.error('Failed to create new session:', err);
    }
  };

  // 1. Initial Load: Fetch models config & sessions list
  useEffect(() => {
    const initApp = async () => {
      try {
        const [config, sessList] = await Promise.all([
          api.fetchModels(),
          api.fetchSessions(),
        ]);
        setModelsConfig(config);
        setSessions(sessList);

        // Check URL for session param, then localStorage, then most recent session
        const urlParams = new URLSearchParams(window.location.search);
        const urlSessionId = urlParams.get('session');
        let savedSessionId: string | null = null;
        try {
          savedSessionId = localStorage.getItem('promptforge_active_session_id');
        } catch {}

        let targetSessionId = urlSessionId || savedSessionId;
        // Verify session exists in server list
        if (targetSessionId && !sessList.some((s) => s.id === targetSessionId)) {
          targetSessionId = null;
        }

        if (!targetSessionId && sessList.length > 0) {
          targetSessionId = sessList[0].id;
        }

        if (targetSessionId) {
          await loadSession(targetSessionId, config);
        } else {
          // Initialize fresh new session
          await handleNewSession(config);
        }
      } catch (err) {
        console.error('Initialization error:', err);
      }
    };

    initApp();
  }, [loadSession]);

  // Handle tab wake-up / iOS PWA resume rehydration
  useEffect(() => {
    const handleRehydrate = async () => {
      const sessId = currentSessionIdRef.current;
      if (document.visibilityState !== 'visible' || !sessId) {
        return;
      }

      const pending = pendingGenerationRef.current;
      const expectedMinTime = pending?.sessionId === sessId ? pending.startedAt : undefined;

      // If an active stream or catch-up was in flight when iOS backgrounded the app
      if (abortControllerRef.current || isStreamingRef.current || isCatchingUpRef.current || pending) {
        try {
          const freshData = await api.fetchSession(sessId);
          const freshMsgs = freshData.messages || [];
          const freshLast = freshMsgs.length > 0 ? freshMsgs[freshMsgs.length - 1] : null;

          const isCompleted =
            freshLast &&
            freshLast.role === 'assistant' &&
            freshLast.content.trim().length > 0 &&
            (expectedMinTime ? freshLast.created_at >= (expectedMinTime - 5000) : true);

          if (isCompleted) {
            // Already completed in SQLite while app was backgrounded!
            if (abortControllerRef.current) {
              abortControllerRef.current.abort();
              abortControllerRef.current = null;
            }
            stopPolling();
            pendingGenerationRef.current = null;
            setMessages(freshMsgs);
            setIsStreaming(false);
            setIsCatchingUp(false);
            setStreamingError(null);
            const updatedSessions = await api.fetchSessions();
            setSessions(updatedSessions);
            setTimeout(() => scrollToBottom('smooth'), 50);
            return;
          }
        } catch (e) {
          console.warn('Rehydration session fetch check failed:', e);
        }

        // Generation still underway in backend: abort broken stream socket and start catch-up polling
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }
        startCatchUp(sessId, expectedMinTime);
        return;
      }

      // If not streaming, regular rehydrate
      loadSession(sessId);
    };

    document.addEventListener('visibilitychange', handleRehydrate);
    window.addEventListener('pageshow', handleRehydrate);
    return () => {
      document.removeEventListener('visibilitychange', handleRehydrate);
      window.removeEventListener('pageshow', handleRehydrate);
      stopPolling();
    };
  }, [loadSession, startCatchUp, stopPolling, scrollToBottom]);

  // Switch model and sync with backend session
  const handleSelectModel = async (modelId: string) => {
    setActiveModel(modelId);
    try {
      localStorage.setItem('promptforge_active_model', modelId);
    } catch {}
    if (currentSessionId) {
      try {
        await api.updateSession(currentSessionId, { model: modelId });
        setSessions((prev) =>
          prev.map((s) => (s.id === currentSessionId ? { ...s, model: modelId } : s))
        );
      } catch (err) {
        console.error('Failed to sync model with session:', err);
      }
    }
  };

  // Change thinking level
  const handleSelectThinking = (thinking: string) => {
    setActiveThinking(thinking);
    try {
      localStorage.setItem('promptforge_active_thinking', thinking);
    } catch {}
  };

  // Add custom model
  const handleAddModel = async (model: ModelItem) => {
    const updated = await api.addModel(model);
    setModelsConfig(updated);
  };

  // Delete model
  const handleDeleteModel = async (modelId: string) => {
    const updated = await api.deleteModel(modelId);
    setModelsConfig(updated);
    if (activeModel === modelId) {
      setActiveModel(updated.default_model);
      try {
        localStorage.setItem('promptforge_active_model', updated.default_model);
      } catch {}
    }
  };

  // Set default model & thinking
  const handleSetDefault = async (modelId: string, thinking: string) => {
    const updated = await api.updateModelSettings({
      default_model: modelId,
      default_thinking: thinking,
    });
    setModelsConfig(updated);
    try {
      localStorage.setItem('promptforge_active_model', modelId);
      localStorage.setItem('promptforge_active_thinking', thinking);
    } catch {}
  };

  // Delete session
  const handleDeleteSession = async (id: string) => {
    try {
      await api.deleteSession(id);
      const remaining = sessions.filter((s) => s.id !== id);
      setSessions(remaining);
      if (currentSessionId === id) {
        stopPolling();
        setIsStreaming(false);
        setIsCatchingUp(false);
        if (remaining.length > 0) {
          await loadSession(remaining[0].id);
        } else {
          try {
            localStorage.removeItem('promptforge_active_session_id');
          } catch {}
          await handleNewSession();
        }
      }
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  };

  // Send message and stream AI response
  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isStreaming) return;
    setStreamingError(null);

    let sessionId = currentSessionId;
    if (!sessionId) {
      const newSess = await api.createSession({ model: activeModel });
      setSessions((prev) => [newSess, ...prev]);
      sessionId = newSess.id;
      setCurrentSessionId(sessionId);
      updateUrlSession(sessionId);
    }

    const now = Date.now();
    const userMessage: Message = {
      id: `user-${now}`,
      session_id: sessionId,
      role: 'user',
      content: text,
      created_at: now,
    };

    const pendingAssistantMessage: Message = {
      id: `asst-${now}`,
      session_id: sessionId,
      role: 'assistant',
      content: '',
      thinking: '',
      created_at: now + 1,
    };

    pendingGenerationRef.current = {
      sessionId,
      userMessageId: userMessage.id,
      userMessageContent: text,
      startedAt: now,
    };

    setMessages((prev) => [...prev, userMessage, pendingAssistantMessage]);
    setIsStreaming(true);
    setIsCatchingUp(false);
    setTimeout(() => scrollToBottom('smooth'), 50);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    let streamCompletedNormally = false;

    try {
      await api.streamChat(
        sessionId,
        {
          message: text,
          model: activeModel,
          thinking: activeThinking,
        },
        (chunk) => {
          if (chunk.type === 'error') {
            setStreamingError(chunk.error || 'Upstream error occurred');
            return;
          }

          if (chunk.type === 'thinking' && chunk.delta) {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.role === 'assistant') {
                return [
                  ...prev.slice(0, -1),
                  { ...last, thinking: (last.thinking || '') + chunk.delta },
                ];
              }
              return prev;
            });
          }

          if (chunk.type === 'content' && chunk.delta) {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.role === 'assistant') {
                return [
                  ...prev.slice(0, -1),
                  { ...last, content: (last.content || '') + chunk.delta },
                ];
              }
              return prev;
            });
            scrollToBottom('smooth');
          }

          if (chunk.type === 'done') {
            streamCompletedNormally = true;
            pendingGenerationRef.current = null;
            if (chunk.id && chunk.content !== undefined) {
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last && last.role === 'assistant') {
                  return [
                    ...prev.slice(0, -1),
                    {
                      ...last,
                      id: chunk.id!,
                      content: chunk.content!,
                      thinking: chunk.thinking !== undefined ? chunk.thinking : last.thinking,
                    },
                  ];
                }
                return prev;
              });
            }
          }
        },
        abortController.signal
      );

      if (!streamCompletedNormally) {
        // Stream completed without 'done' event (e.g. network disconnect or socket termination)
        console.warn('Stream closed without done event, transitioning to catch-up polling');
        startCatchUp(sessionId, now);
        return;
      }

      // Refresh sessions metadata (title preview and counts)
      const updatedList = await api.fetchSessions();
      setSessions(updatedList);
    } catch (err: any) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Explicitly aborted (user pressed stop or rehydrate took over)
        return;
      }
      if (err?.status && err.status >= 400 && err.status < 500) {
        // Client error (404, 400) - display fatal error rather than silent futile catch-up
        setStreamingError(err.message || 'Request failed');
        setIsStreaming(false);
        setIsCatchingUp(false);
        pendingGenerationRef.current = null;
        return;
      }
      // Stream interrupted, network dropped, or iOS WebKit "TypeError: Load failed"
      console.warn('Stream interrupted, initiating server catch-up polling:', err);
      // Suppress fatal error banner and immediately recover via server polling!
      startCatchUp(sessionId, now);
      return;
    } finally {
      abortControllerRef.current = null;
      if (streamCompletedNormally) {
        pendingGenerationRef.current = null;
        setIsStreaming(false);
      }
    }
  };

  const handleStopStreaming = () => {
    stopPolling();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    pendingGenerationRef.current = null;
    setIsStreaming(false);
    setIsCatchingUp(false);
  };

  // Manual backup refresh handler
  const handleRefresh = async () => {
    if (isRefreshing) return;
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate([15]);
      } catch {}
    }
    setIsRefreshing(true);
    setStreamingError(null);

    const startTime = Date.now();
    try {
      const sessList = await api.fetchSessions();
      setSessions(sessList);

      const sessId = currentSessionIdRef.current;
      if (sessId) {
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }
        const freshData = await api.fetchSession(sessId);
        if (currentSessionIdRef.current === sessId) {
          setMessages(freshData.messages || []);
          checkPendingGeneration(freshData.id, freshData.messages || []);
        }
      }
    } catch (err) {
      console.error('Refresh failed:', err);
    } finally {
      const elapsed = Date.now() - startTime;
      if (elapsed < 450) {
        setTimeout(() => setIsRefreshing(false), 450 - elapsed);
      } else {
        setIsRefreshing(false);
      }
    }
  };

  const currentSession = sessions.find((s) => s.id === currentSessionId) || null;

  const quickStarters = [
    'Cinematic 35mm film portrait of a woman in an oversized raw denim jacket leaning against a concrete wall in Tokyo rain',
    'Macro studio photography of an intricate mechanical obsidian wristwatch immersed in clear bubbling water',
    'Medium format portrait of a weathered artisan metalsmith in a dimly lit copper workshop with sparks flying',
    'Hyper-detailed architectural view of a minimalist brutalist villa built into a Norwegian coastal cliff at blue hour',
  ];

  return (
    <div className="h-[100dvh] w-full bg-black text-zinc-100 flex flex-col overflow-hidden select-none">
      {/* Top Navigation */}
      <Header
        onToggleDrawer={() => setIsDrawerOpen(true)}
        onOpenModelModal={() => setIsModelModalOpen(true)}
        onNewSession={() => handleNewSession()}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        currentSession={currentSession}
        modelsConfig={modelsConfig}
        activeModel={activeModel}
        activeThinking={activeThinking}
      />

      {/* Message Thread Scroll Container */}
      <main className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 message-scroll-thread max-w-4xl w-full mx-auto">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4 py-8 animate-in fade-in duration-300">
            <div className="w-12 h-12 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-center mb-4 text-zinc-300 shadow-xl">
              <Camera className="w-6 h-6 stroke-[1.5]" />
            </div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-zinc-100 mb-1">
              PromptForge Image Architect
            </h1>
            <p className="text-xs sm:text-sm text-zinc-500 max-w-md mb-6 leading-relaxed">
              Iterative, self-contained AI prompt generator for high-end vision models. Pure prompt outputs ready for immediate generation.
            </p>

            {/* Quick Starters */}
            <div className="w-full max-w-lg space-y-2 text-left">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-600 px-1">
                Suggested Visual Concepts
              </div>
              {quickStarters.map((starter, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSendMessage(starter)}
                  className="w-full flex items-center justify-between p-3 rounded-xl bg-zinc-950 hover:bg-zinc-900 border border-zinc-800/80 text-zinc-300 hover:text-zinc-100 text-xs text-left transition-all group"
                >
                  <span className="truncate pr-2">{starter}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-300 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            {messages.map((msg, index) => (
              <MessageCard
                key={msg.id || index}
                message={msg}
                isStreaming={isStreaming && index === messages.length - 1}
                isCatchingUp={isCatchingUp && index === messages.length - 1}
              />
            ))}

            {streamingError && (
              <div className="p-3 my-2 rounded-xl bg-red-950/40 border border-red-900/60 text-red-300 text-xs font-mono">
                {streamingError}
              </div>
            )}
            <div ref={messagesEndRef} className="h-4" />
          </div>
        )}
      </main>

      {/* Bottom Chat Input */}
      <ChatInput
        onSendMessage={handleSendMessage}
        onStopStreaming={handleStopStreaming}
        isStreaming={isStreaming}
        isCatchingUp={isCatchingUp}
        sessionId={currentSessionId}
      />

      {/* Session Drawer */}
      <SessionDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSelectSession={loadSession}
        onDeleteSession={handleDeleteSession}
        onNewSession={handleNewSession}
      />

      {/* Model & Thinking Switcher Modal */}
      <ModelSelectorModal
        isOpen={isModelModalOpen}
        onClose={() => setIsModelModalOpen(false)}
        modelsConfig={modelsConfig}
        activeModel={activeModel}
        activeThinking={activeThinking}
        onSelectModel={handleSelectModel}
        onSelectThinking={handleSelectThinking}
        onAddModel={handleAddModel}
        onDeleteModel={handleDeleteModel}
        onSetDefault={handleSetDefault}
      />
    </div>
  );
}
export default App;
