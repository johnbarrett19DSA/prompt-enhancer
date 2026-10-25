import React, { useState } from 'react';
import { X, Trash2, MessageSquare, Plus, Search } from 'lucide-react';
import { Session } from '../types';

interface SessionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: Session[];
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onNewSession: () => void;
}

export const SessionDrawer: React.FC<SessionDrawerProps> = ({
  isOpen,
  onClose,
  sessions,
  currentSessionId,
  onSelectSession,
  onDeleteSession,
  onNewSession,
}) => {
  const [search, setSearch] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  if (!isOpen) return null;

  const filteredSessions = sessions.filter(
    (s) =>
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      (s.last_message && s.last_message.toLowerCase().includes(search.toLowerCase()))
  );

  const formatTimestamp = (ts: number) => {
    const date = new Date(ts);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Drawer Container */}
      <div className="relative w-5/6 max-w-sm h-full bg-zinc-950 border-r border-zinc-800 flex flex-col z-10 shadow-2xl pt-safe-top-blur pb-[max(calc(env(safe-area-inset-bottom,0px)+0.5rem),1rem)]">
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm tracking-wide uppercase text-zinc-300">
              Session History
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 font-mono">
              {sessions.length}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-all"
            aria-label="Close drawer"
          >
            <X className="w-5 h-5 stroke-[1.75]" />
          </button>
        </div>

        {/* New Session Action */}
        <div className="p-3 border-b border-zinc-900">
          <button
            onClick={() => {
              onNewSession();
              onClose();
            }}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800/80 border border-zinc-800 text-zinc-200 text-sm font-medium transition-all active:scale-98"
          >
            <Plus className="w-4 h-4 text-zinc-400" />
            <span>Create New Session</span>
          </button>
        </div>

        {/* Search Bar */}
        <div className="px-3 pt-2 pb-1">
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations..."
              className="w-full pl-9 pr-3 py-2 bg-black border border-zinc-800 rounded-lg text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-700 text-base"
            />
          </div>
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1 overscroll-contain">
          {filteredSessions.length === 0 ? (
            <div className="py-12 text-center text-zinc-600 text-xs">
              No sessions found
            </div>
          ) : (
            filteredSessions.map((session) => {
              const isActive = session.id === currentSessionId;
              const isConfirming = confirmDeleteId === session.id;

              return (
                <div
                  key={session.id}
                  className={`group relative flex items-center justify-between p-3 rounded-xl border transition-all ${
                    isActive
                      ? 'bg-zinc-900/90 border-zinc-700 text-zinc-100'
                      : 'bg-black/50 border-zinc-900/80 text-zinc-400 hover:bg-zinc-900/40 hover:border-zinc-800'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectSession(session.id);
                      onClose();
                    }}
                    className="flex-1 text-left min-w-0 pr-2"
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="font-medium text-xs text-zinc-200 truncate">
                        {session.title || 'Untitled Session'}
                      </span>
                    </div>

                    {session.last_message && (
                      <p className="text-[11px] text-zinc-500 truncate line-clamp-1 mb-1 font-mono">
                        {session.last_message}
                      </p>
                    )}

                    <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                      <span>{formatTimestamp(session.updated_at)}</span>
                      <span>·</span>
                      <span className="flex items-center gap-0.5">
                        <MessageSquare className="w-3 h-3 text-zinc-600" />
                        {session.message_count ?? 0}
                      </span>
                      <span>·</span>
                      <span className="truncate max-w-[90px]">{session.model.split('/').pop()}</span>
                    </div>
                  </button>

                  {/* Delete Trigger */}
                  <div className="shrink-0 flex items-center">
                    {isConfirming ? (
                      <div className="flex items-center gap-1 bg-red-950/80 border border-red-900 rounded-lg p-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteSession(session.id);
                            setConfirmDeleteId(null);
                          }}
                          className="px-2 py-0.5 text-[11px] font-bold text-red-300 hover:text-white"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteId(null);
                          }}
                          className="p-1 text-zinc-400 hover:text-zinc-200"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteId(session.id);
                        }}
                        className="p-2 text-zinc-600 hover:text-red-400 rounded-lg hover:bg-zinc-800/50 transition-colors"
                        aria-label="Delete session"
                      >
                        <Trash2 className="w-4 h-4 stroke-[1.5]" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
