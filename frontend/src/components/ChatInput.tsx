import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, Square } from 'lucide-react';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  onStopStreaming: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  onStopStreaming,
  isStreaming,
  disabled = false,
}) => {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      const nextHeight = Math.min(scrollHeight, 140);
      textareaRef.current.style.height = `${nextHeight}px`;
    }
  }, [text]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isStreaming) {
      onStopStreaming();
      return;
    }
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSendMessage(trimmed);
    setText('');
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
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isStreaming
                ? "Streaming response..."
                : "Instruct prompt architect or refine iteration..."
            }
            disabled={disabled}
            className="flex-1 bg-transparent px-3 py-1.5 text-zinc-100 placeholder-zinc-500 text-base resize-none focus:outline-none max-h-36 leading-normal select-text"
          />

          {isStreaming ? (
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
