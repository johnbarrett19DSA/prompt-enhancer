export interface Session {
  id: string;
  title: string;
  model: string;
  created_at: number;
  updated_at: number;
  message_count?: number;
  last_message?: string;
}

export interface Message {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: number;
  thinking?: string;
}

export interface ModelItem {
  id: string;
  name: string;
  description?: string;
  supports_thinking: boolean;
  is_default: boolean;
}

export interface ModelsConfig {
  default_model: string;
  default_thinking: string;
  thinking_levels: string[];
  models: ModelItem[];
}
