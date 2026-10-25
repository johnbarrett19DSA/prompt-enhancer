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
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [modelsConfig, setModelsConfig] = useState<ModelsConfig | null>(null);
  const [activeModel, setActiveModel] = useState<string>('z-ai/glm-5.3-flash');
  const [activeThinking, setActiveThinking] = useState<string>('high');

  // UI Drawer & Modal States
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isModelModalOpen, setIsModelModalOpen] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingError, setStreamingError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

        // Check URL for session param or pick most recent
        const urlParams = new URLSearchParams(window.location.search);
        const urlSessionId = urlParams.get('session');

        let targetSessionId = urlSessionId;
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
  }, []);

  // Handle re-focus / tab wake-up rehydration (especially for iOS PWA)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && currentSessionId) {
        loadSession(currentSessionId);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [currentSessionId]);

  // Load a session by ID
  const loadSession = async (id: string, configFallback?: ModelsConfig | null) => {
    try {
      const data = await api.fetchSession(id);
      setCurrentSessionId(data.id);
      setActiveModel(data.model || configFallback?.default_model || 'z-ai/glm-5.3-flash');
      setMessages(data.messages || []);
      updateUrlSession(data.id);
      setTimeout(() => scrollToBottom('auto'), 50);
    } catch (err) {
      console.warn('Session load failed, creating a new session:', err);
      await handleNewSession(configFallback);
    }
  };

  // Create a brand new session
  const handleNewSession = async (cfgOverride?: ModelsConfig | null) => {
    try {
      const cfg = cfgOverride || modelsConfig;
      const modelToUse = activeModel || cfg?.default_model || 'z-ai/glm-5.3-flash';
      const created = await api.createSession({
        title: 'New Session',
        model: modelToUse,
      });
      setSessions((prev) => [created, ...prev]);
      setCurrentSessionId(created.id);
      setMessages([]);
      updateUrlSession(created.id);
    } catch (err) {
      console.error('Failed to create new session:', err);
    }
  };

  // Switch model and sync with backend session
  const handleSelectModel = async (modelId: string) => {
    setActiveModel(modelId);
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
    }
  };

  // Set default model & thinking
  const handleSetDefault = async (modelId: string, thinking: string) => {
    const updated = await api.updateModelSettings({
      default_model: modelId,
      default_thinking: thinking,
    });
    setModelsConfig(updated);
  };

  // Delete session
  const handleDeleteSession = async (id: string) => {
    try {
      await api.deleteSession(id);
      const remaining = sessions.filter((s) => s.id !== id);
      setSessions(remaining);
      if (currentSessionId === id) {
        if (remaining.length > 0) {
          await loadSession(remaining[0].id);
        } else {
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

    setMessages((prev) => [...prev, userMessage, pendingAssistantMessage]);
    setIsStreaming(true);
    setTimeout(() => scrollToBottom('smooth'), 50);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

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
            if (chunk.id && chunk.content) {
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last && last.role === 'assistant') {
                  return [
                    ...prev.slice(0, -1),
                    { ...last, id: chunk.id!, content: chunk.content! },
                  ];
                }
                return prev;
              });
            }
          }
        },
        abortController.signal
      );

      // Refresh sessions metadata (title preview and counts)
      const updatedList = await api.fetchSessions();
      setSessions(updatedList);
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('Chat streaming failed:', err);
        setStreamingError(err.message || 'Stream connection interrupted');
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
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
