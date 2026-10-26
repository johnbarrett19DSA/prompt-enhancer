import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, Square } from 'lucide-react';

const DRAFT_PREFIX = 'promptforge_draft';
const getDraftKey = (sessId?: string | null) => `${DRAFT_PREFIX}_${sessId || 'global'}`;

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  onStopStreaming: () => void;
  isStreaming: boolean;
  isCatchingUp?: boolean;
  disabled?: boolean;
  sessionId?: string | null;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  onStopStreaming,
  isStreaming,
  isCatchingUp = false,
  disabled = false,
  sessionId = null,
}) => {
  const [text, setText] = useState(() => {
    try {
      const specific = localStorage.getItem(getDraftKey(sessionId));
      if (specific !== null) return specific;
      return localStorage.getItem(`${DRAFT_PREFIX}_global`) || localStorage.getItem('promptforge_draft_input') || '';
    } catch {
      return '';
    }
  });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevSessionIdRef = useRef(sessionId);
  const textRef = useRef(text);
  textRef.current = text;

  // Sync draft when switching sessions
  useEffect(() => {
    if (prevSessionIdRef.current !== sessionId) {
      const currentText = textRef.current;
      // Commit draft for previous session before switching
      if (prevSessionIdRef.current && currentText) {
        try {
          localStorage.setItem(getDraftKey(prevSessionIdRef.current), currentText);
        } catch {}
      }
      try {
        const draft = localStorage.getItem(getDraftKey(sessionId));
        if (draft !== null) {
          setText(draft);
        } else if (!prevSessionIdRef.current && currentText) {
          // Preserve typed draft into newly initialized session
          localStorage.setItem(getDraftKey(sessionId), currentText);
        } else {
          setText('');
        }
      } catch {
        setText('');
      }
      prevSessionIdRef.current = sessionId;
    }
  }, [sessionId]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      const nextHeight = Math.min(scrollHeight, 140);
      textareaRef.current.style.height = `${nextHeight}px`;
    }
  }, [text]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);
    try {
      const key = getDraftKey(sessionId);
      if (val) {
        localStorage.setItem(key, val);
        localStorage.setItem('promptforge_draft_input', val);
      } else {
        localStorage.removeItem(key);
        localStorage.removeItem('promptforge_draft_input');
      }
    } catch {
      // Ignore localStorage errors (e.g. private mode quota)
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isStreaming || isCatchingUp) {
      onStopStreaming();
      return;
    }
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSendMessage(trimmed);
    setText('');
    try {
      localStorage.removeItem(getDraftKey(sessionId));
      localStorage.removeItem('promptforge_draft_input');
    } catch {
      // Ignore
    }
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex-none bg-black/95 backdrop-blur-md border-t border-zinc-800/80 px-3 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] z-20">
      <div className="max-w-4xl mx-auto">
        <form onSubmit={handleSubmit} className="relative flex items-end gap-2 bg-zinc-950 border border-zinc-800 rounded-2xl p-2 shadow-2xl focus-within:border-zinc-700 transition-colors">
          <textarea
            ref={textareaRef}
            rows={1}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={
              isCatchingUp
                ? "Completing generation on server..."
                : isStreaming
                ? "Streaming response..."
                : "Instruct prompt architect or refine iteration..."
            }
            disabled={disabled}
            className="flex-1 bg-transparent px-3 py-1.5 text-zinc-100 placeholder-zinc-500 text-base resize-none focus:outline-none max-h-36 leading-normal select-text"
          />

          {isStreaming || isCatchingUp ? (
            <button
              type="button"
              onClick={onStopStreaming}
              className="flex items-center justify-center w-9 h-9 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-all shrink-0 active:scale-95"
              aria-label="Stop generation"
            >
              <Square className="w-4 h-4 fill-current stroke-none" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!text.trim() || disabled}
              className="flex items-center justify-center w-9 h-9 rounded-xl bg-zinc-100 text-black hover:bg-white disabled:opacity-30 disabled:hover:bg-zinc-100 transition-all shrink-0 active:scale-95"
              aria-label="Send prompt refinement"
            >
              <ArrowUp className="w-4 h-4 stroke-[2.5]" />
            </button>
          )}
        </form>
      </div>
    </div>
  );
};
