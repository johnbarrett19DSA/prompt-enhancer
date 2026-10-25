import React, { useState } from 'react';
import { X, Check, Brain, Plus, Trash2, Cpu } from 'lucide-react';
import { ModelsConfig, ModelItem } from '../types';

interface ModelSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  modelsConfig: ModelsConfig | null;
  activeModel: string;
  activeThinking: string;
  onSelectModel: (modelId: string) => void;
  onSelectThinking: (thinking: string) => void;
  onAddModel: (model: ModelItem) => Promise<void>;
  onDeleteModel: (modelId: string) => Promise<void>;
  onSetDefault: (modelId: string, thinking: string) => Promise<void>;
}

export const ModelSelectorModal: React.FC<ModelSelectorModalProps> = ({
  isOpen,
  onClose,
  modelsConfig,
  activeModel,
  activeThinking,
  onSelectModel,
  onSelectThinking,
  onAddModel,
  onDeleteModel,
  onSetDefault,
}) => {
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customModelId, setCustomModelId] = useState('');
  const [customModelName, setCustomModelName] = useState('');
  const [customModelDesc, setCustomModelDesc] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const thinkingLevels = modelsConfig?.thinking_levels || ['none', 'low', 'medium', 'high', 'max'];
  const models = modelsConfig?.models || [];

  const handleAddCustomModel = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = customModelId.trim();
    if (!id) return;

    setIsSubmitting(true);
    try {
      const name = customModelName.trim() || id.split('/').pop() || id;
      await onAddModel({
        id,
        name,
        description: customModelDesc.trim() || 'Custom NanoGPT Model',
        supports_thinking: true,
        is_default: false,
      });
      onSelectModel(id);
      setCustomModelId('');
      setCustomModelName('');
      setCustomModelDesc('');
      setShowCustomInput(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 sm:p-4 pt-safe-modal-top pb-[max(calc(env(safe-area-inset-bottom,0px)+0.5rem),1rem)]">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/85 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col max-h-[calc(100dvh-max(calc(env(safe-area-inset-top,0px)+2.5rem),5rem))] overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-zinc-400 stroke-[1.75]" />
            <h2 className="text-sm font-semibold tracking-wide uppercase text-zinc-200">
              Model & Reasoning Configuration
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 transition-all"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6 overscroll-contain">
          {/* Section 1: Extended Thinking (Reasoning Effort) */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                <Brain className="w-4 h-4 text-zinc-400 stroke-[1.75]" />
                Extended Thinking Depth
              </label>
              <span className="text-[11px] font-mono text-zinc-500">
                Current: {activeThinking}
              </span>
            </div>
            <p className="text-xs text-zinc-500 mb-3">
              Directs model to conduct internal thought verification before crafting the final generation prompt. Default is High.
            </p>
            <div className="grid grid-cols-5 gap-1.5 bg-black p-1 rounded-xl border border-zinc-800">
              {thinkingLevels.map((level) => {
                const isSelected = activeThinking.toLowerCase() === level.toLowerCase();
                return (
                  <button
                    key={level}
                    type="button"
                    onClick={() => onSelectThinking(level)}
                    className={`py-2 text-xs font-medium uppercase tracking-wider rounded-lg transition-all ${
                      isSelected
                        ? 'bg-zinc-100 text-black font-bold shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
                    }`}
                  >
                    {level}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2: Active Vision Model Selector */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                NanoGPT Model Selection
              </label>
              <button
                type="button"
                onClick={() => setShowCustomInput(!showCustomInput)}
                className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 underline decoration-zinc-700 underline-offset-4"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Custom Model...</span>
              </button>
            </div>

            {/* Custom Model Form */}
            {showCustomInput && (
              <form onSubmit={handleAddCustomModel} className="mb-4 p-4 rounded-xl bg-black border border-zinc-800 space-y-3">
                <div className="text-xs font-medium text-zinc-300">
                  Register Any NanoGPT Model ID
                </div>
                <div>
                  <input
                    type="text"
                    required
                    value={customModelId}
                    onChange={(e) => setCustomModelId(e.target.value)}
                    placeholder="e.g. z-ai/glm-5.3-flash or custom model ID"
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-700 text-base"
                  />
                </div>
                <div>
                  <input
                    type="text"
                    value={customModelName}
                    onChange={(e) => setCustomModelName(e.target.value)}
                    placeholder="Display Name (optional)"
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-700 text-base"
                  />
                </div>
                <div>
                  <input
                    type="text"
                    value={customModelDesc}
                    onChange={(e) => setCustomModelDesc(e.target.value)}
                    placeholder="Short description (optional)"
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-700 text-base"
                  />
                </div>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowCustomInput(false)}
                    className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !customModelId.trim()}
                    className="px-4 py-1.5 text-xs font-semibold bg-zinc-100 hover:bg-white text-black rounded-lg disabled:opacity-50 transition-all"
                  >
                    {isSubmitting ? 'Saving...' : 'Add Model'}
                  </button>
                </div>
              </form>
            )}

            {/* Model Cards List */}
            <div className="space-y-2">
              {models.map((model) => {
                const isSelected = activeModel === model.id;
                const isDefault = modelsConfig?.default_model === model.id;

                return (
                  <div
                    key={model.id}
                    className={`flex items-start justify-between p-3.5 rounded-xl border transition-all ${
                      isSelected
                        ? 'bg-zinc-900 border-zinc-600 text-zinc-100 ring-1 ring-zinc-600'
                        : 'bg-black/80 border-zinc-800 text-zinc-400 hover:bg-zinc-900/50 hover:border-zinc-700'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectModel(model.id)}
                      className="flex-1 text-left min-w-0 pr-3"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-xs text-zinc-200 truncate">
                          {model.name}
                        </span>
                        {isDefault && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 font-mono">
                            DEFAULT
                          </span>
                        )}
                        {model.supports_thinking && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-950 border border-zinc-800 text-zinc-400 font-mono">
                            THINKING
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] font-mono text-zinc-500 truncate mb-1">
                        {model.id}
                      </div>
                      {model.description && (
                        <p className="text-xs text-zinc-500 leading-relaxed">
                          {model.description}
                        </p>
                      )}
                    </button>

                    <div className="shrink-0 flex items-center gap-1.5 pt-0.5">
                      {isSelected ? (
                        <div className="w-6 h-6 rounded-full bg-zinc-100 text-black flex items-center justify-center">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onSelectModel(model.id)}
                          className="px-2.5 py-1 text-xs rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 transition-all"
                        >
                          Select
                        </button>
                      )}

                      {/* Can delete custom models if more than 1 model */}
                      {models.length > 1 && !isDefault && (
                        <button
                          type="button"
                          onClick={() => onDeleteModel(model.id)}
                          className="p-1.5 text-zinc-600 hover:text-red-400 rounded-lg hover:bg-zinc-900 transition-colors"
                          aria-label={`Remove model ${model.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5 stroke-[1.5]" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-800 bg-zinc-950">
          <button
            type="button"
            onClick={() => onSetDefault(activeModel, activeThinking)}
            className="text-xs text-zinc-400 hover:text-zinc-200 underline decoration-zinc-700 underline-offset-4"
          >
            Set active as default for new sessions
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-zinc-100 hover:bg-white text-black font-semibold text-xs rounded-xl transition-all"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
