import React from 'react';
import { SlidersHorizontal, ChevronDown, Plus, RotateCw } from 'lucide-react';
import { Session, ModelsConfig } from '../types';

interface HeaderProps {
  onToggleDrawer: () => void;
  onOpenModelModal: () => void;
  onNewSession: () => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
  currentSession: Session | null;
  modelsConfig: ModelsConfig | null;
  activeModel: string;
  activeThinking: string;
}

export const Header: React.FC<HeaderProps> = ({
  onToggleDrawer,
  onOpenModelModal,
  onNewSession,
  onRefresh,
  isRefreshing = false,
  modelsConfig,
  activeModel,
  activeThinking,
}) => {
  const modelInfo = modelsConfig?.models.find((m) => m.id === activeModel);
  const displayName = modelInfo ? modelInfo.name.split(' (')[0] : activeModel.split('/').pop() || activeModel;

  return (
    <header className="flex-none bg-black/95 backdrop-blur-md border-b border-zinc-800/80 px-3 pt-safe-top-blur pb-2.5 z-30">
      <div className="flex items-center justify-between h-11 max-w-4xl mx-auto">
        {/* Left: Session Drawer Toggle */}
        <button
          type="button"
          onClick={onToggleDrawer}
          className="flex items-center justify-center w-10 h-10 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 active:scale-95 transition-all"
          aria-label="Open sessions history"
        >
          <SlidersHorizontal className="w-5 h-5 stroke-[1.75]" />
        </button>

        {/* Center: Model & Thinking Switcher */}
        <button
          type="button"
          onClick={onOpenModelModal}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-950 border border-zinc-800 text-zinc-200 hover:border-zinc-700 active:scale-98 transition-all max-w-[52%] sm:max-w-[65%]"
          aria-label="Select AI model and thinking depth"
        >
          <span className="truncate text-xs font-medium tracking-tight">
            {displayName}
          </span>
          <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 shrink-0">
            {activeThinking}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
        </button>

        {/* Right: Actions */}
        <div className="flex items-center gap-0.5 sm:gap-1">
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center justify-center w-10 h-10 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 active:scale-95 transition-all disabled:opacity-60 touch-manipulation"
            aria-label="Refresh session"
            title="Refresh session and sync"
          >
            <RotateCw className={`w-4 h-4 stroke-[1.75] transition-transform duration-300 ${isRefreshing ? 'animate-spin text-zinc-200' : ''}`} />
          </button>
          <button
            type="button"
            onClick={onNewSession}
            className="flex items-center justify-center w-10 h-10 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 active:scale-95 transition-all touch-manipulation"
            aria-label="Start new session"
            title="New session"
          >
            <Plus className="w-5 h-5 stroke-[1.75]" />
          </button>
        </div>
      </div>
    </header>
  );
};
