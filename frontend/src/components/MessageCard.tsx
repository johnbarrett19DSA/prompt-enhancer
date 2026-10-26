import React, { useState } from 'react';
import { Copy, Check, ChevronDown, ChevronUp, Brain, Sparkles, User } from 'lucide-react';
import { Message } from '../types';

interface MessageCardProps {
  message: Message;
  isStreaming?: boolean;
  isCatchingUp?: boolean;
}

export function cleanPromptText(raw: string): string {
  if (!raw) return '';
  let text = raw.trim();
  // Closed think/thought/thinking tags
  text = text.replace(/<\s*(?:think|thought|thinking)(?:\s+[^>]*)?>[\s\S]*?<\s*\/\s*(?:think|thought|thinking)\s*>/gi, '').trim();
  // Orphaned closing tag at start
  text = text.replace(/^[\s\S]*?<\s*\/\s*(?:think|thought|thinking)\s*>/i, '').trim();
  // Orphaned opening tag at end
  text = text.replace(/<\s*(?:think|thought|thinking)(?:\s+[^>]*)?>[\s\S]*$/i, '').trim();
  // Details tag
  text = text.replace(/<\s*details(?:\s+[^>]*)?>[\s\S]*?<\s*\/\s*details\s*>/gi, '').trim();
  // Markdown code block full match
  const codeblockMatch = text.match(/^```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)\n```$/);
  if (codeblockMatch) {
    text = codeblockMatch[1].trim();
  } else if (text.startsWith('```') && text.endsWith('```')) {
    const lines = text.split('\n');
    if (lines.length >= 2) {
      text = lines.slice(1, -1).join('\n').trim();
    }
  } else {
    const embeddedMatch = text.match(/```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)\n```/);
    if (embeddedMatch && (text.toLowerCase().startsWith('here is') || text.toLowerCase().startsWith('prompt:'))) {
      text = embeddedMatch[1].trim();
    }
  }
  // Re-run closed tags in case inside code fence
  text = text.replace(/<\s*(?:think|thought|thinking)(?:\s+[^>]*)?>[\s\S]*?<\s*\/\s*(?:think|thought|thinking)\s*>/gi, '').trim();
  return text;
}

export function extractInlineThinking(raw: string): string {
  if (!raw) return '';
  const thoughts: string[] = [];
  const tagRegex = /<\s*(?:think|thought|thinking)(?:\s+[^>]*)?>([\s\S]*?)<\s*\/\s*(?:think|thought|thinking)\s*>/gi;
  let remaining = raw.replace(tagRegex, (_match, th) => {
    if (th && th.trim()) thoughts.push(th.trim());
    return '';
  });

  const orphanedClose = remaining.match(/^([\s\S]*?)<\s*\/\s*(?:think|thought|thinking)\s*>/i);
  if (orphanedClose && orphanedClose[1].trim()) {
    thoughts.push(orphanedClose[1].trim());
    remaining = remaining.slice(orphanedClose[0].length);
  }

  const orphanedOpen = remaining.match(/<\s*(?:think|thought|thinking)(?:\s+[^>]*)?>([\s\S]*)$/i);
  if (orphanedOpen && orphanedOpen[1].trim()) {
    thoughts.push(orphanedOpen[1].trim());
  }

  return thoughts.join('\n\n');
}

export const MessageCard: React.FC<MessageCardProps> = ({
  message,
  isStreaming = false,
  isCatchingUp = false,
}) => {
  const [copied, setCopied] = useState(false);
  const [userCopied, setUserCopied] = useState(false);
  const [showThinking, setShowThinking] = useState(false);

  const isAssistant = message.role === 'assistant';
  const displayContent = isAssistant ? cleanPromptText(message.content || '') : (message.content || '');
  const thinkingContent = (message.thinking && message.thinking.trim()) || (isAssistant ? extractInlineThinking(message.content || '') : '');

  const handleCopy = async () => {
    const textToCopy = isAssistant ? cleanPromptText(message.content || '') : (message.content || '');
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      // Trigger short haptic feedback on iOS/Android if supported
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([20]);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Clipboard copy failed:', err);
    }
  };

  const handleCopyUser = async () => {
    if (!message.content) return;
    try {
      await navigator.clipboard.writeText(message.content);
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([15]);
      }
      setUserCopied(true);
      setTimeout(() => setUserCopied(false), 2000);
    } catch (err) {
      console.error('User input copy failed:', err);
    }
  };

  const wordCount = displayContent ? displayContent.trim().split(/\s+/).length : 0;
  const charCount = displayContent ? displayContent.length : 0;

  if (!isAssistant) {
    // User message card with 1-tap copy button
    return (
      <div className="flex justify-end mb-4 animate-in fade-in duration-150">
        <div className="max-w-[88%] sm:max-w-[80%] rounded-2xl bg-zinc-900 border border-zinc-800/80 px-4 py-3 text-zinc-100 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-1.5 text-[10px] uppercase font-semibold tracking-wider text-zinc-500">
            <div className="flex items-center gap-1.5">
              <User className="w-3 h-3 text-zinc-500" />
              <span>Iteration Request</span>
            </div>
            <button
              type="button"
              onClick={handleCopyUser}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium tracking-normal transition-all active:scale-95 ${
                userCopied
                  ? 'bg-zinc-800 text-zinc-200'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60'
              }`}
              aria-label="Copy input to clipboard"
            >
              {userCopied ? (
                <>
                  <Check className="w-3 h-3 stroke-[2.5] text-zinc-300" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3 stroke-[1.75]" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
          <div className="text-sm leading-relaxed whitespace-pre-wrap select-text text-zinc-200">
            {message.content}
          </div>
        </div>
      </div>
    );
  }

  // Assistant prompt architect card
  return (
    <div className="mb-5 animate-in fade-in slide-in-from-bottom-1 duration-200">
      <div className="rounded-2xl bg-zinc-950 border border-zinc-800 overflow-hidden shadow-xl transition-all">
        {/* Dedicated Top Action Bar */}
        <div className="flex items-center justify-between px-3.5 py-2.5 bg-black/60 border-b border-zinc-800/80">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-300">
              <Sparkles className="w-3 h-3 text-zinc-400 stroke-[2]" />
              <span className="text-[10px] font-semibold tracking-wider uppercase">
                Generated Prompt
              </span>
            </div>
            {charCount > 0 && (
              <span className="text-[10px] font-mono text-zinc-500">
                {wordCount} words · {charCount} chars
              </span>
            )}
          </div>

          {/* 1-Tap Prompt Copy Button */}
          <button
            type="button"
            onClick={handleCopy}
            disabled={!displayContent}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold tracking-tight transition-all active:scale-95 ${
              copied
                ? 'bg-zinc-100 text-black border border-white'
                : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700/80'
            }`}
            aria-label="Copy prompt to clipboard"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 stroke-[1.75]" />
                <span>Copy Prompt</span>
              </>
            )}
          </button>
        </div>

        {/* Optional Collapsible Reasoning Drawer */}
        {thinkingContent ? (
          <div className="border-b border-zinc-900 bg-black/40">
            <button
              type="button"
              onClick={() => setShowThinking(!showThinking)}
              className="w-full flex items-center justify-between px-3.5 py-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <Brain className="w-3 h-3 text-zinc-500" />
                <span className="font-mono">Extended Thought Trace</span>
              </div>
              {showThinking ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
            {showThinking && (
              <div className="px-4 py-2.5 text-xs text-zinc-400 font-mono leading-relaxed bg-black/70 border-t border-zinc-900 whitespace-pre-wrap max-h-48 overflow-y-auto select-text">
                {thinkingContent}
              </div>
            )}
          </div>
        ) : null}

        {/* Pure Prompt Content Display */}
        <div className="p-4 sm:p-5 select-text">
          {displayContent ? (
            <>
              <p className="text-sm sm:text-base leading-relaxed text-zinc-100 whitespace-pre-wrap font-normal selection:bg-zinc-800 selection:text-white">
                {displayContent}
              </p>
              {isCatchingUp && (
                <div className="mt-3 pt-2.5 border-t border-zinc-900/80 flex items-center gap-2 text-zinc-400 text-xs font-mono">
                  <span className="w-2 h-2 rounded-full bg-zinc-400 animate-ping" />
                  <span>Completing generation on server...</span>
                </div>
              )}
            </>
          ) : isCatchingUp ? (
            <div className="flex items-center gap-2 py-2 text-zinc-400 text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-zinc-400 animate-ping" />
              <span>Completing generation on server...</span>
            </div>
          ) : isStreaming ? (
            <div className="flex items-center gap-2 py-2 text-zinc-500 text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-zinc-400 animate-ping" />
              <span>Synthesizing optimal image prompt...</span>
            </div>
          ) : (
            <div className="text-zinc-600 text-xs italic">Empty prompt</div>
          )}
        </div>

        {/* Dedicated Bottom Copy Action for long prompts */}
        {charCount > 300 && (
          <div className="flex items-center justify-between px-3.5 py-2 bg-black/40 border-t border-zinc-900">
            <span className="text-[10px] text-zinc-600 font-mono">Ready for Image Generator</span>
            <button
              type="button"
              onClick={handleCopy}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all active:scale-95 ${
                copied
                  ? 'bg-zinc-100 text-black'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 stroke-[2.5]" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3 stroke-[1.75]" />
                  <span>Copy Prompt</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
