import { Session, Message, ModelsConfig, ModelItem } from './types';

const getApiBase = () => {
  if (typeof window !== 'undefined') {
    const path = window.location.pathname;
    if (path.startsWith('/promptforge')) {
      return '/promptforge/api';
    }
  }
  return '/api';
};

const API_BASE = getApiBase();

export async function fetchSessions(): Promise<Session[]> {
  const res = await fetch(`${API_BASE}/sessions`);
  if (!res.ok) throw new Error('Failed to fetch sessions');
  return res.json();
}

export async function fetchSession(id: string): Promise<{ id: string; title: string; model: string; created_at: number; updated_at: number; messages: Message[] }> {
  const res = await fetch(`${API_BASE}/sessions/${id}`);
  if (!res.ok) {
    const error: any = new Error(`Failed to fetch session (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return res.json();
}

export async function createSession(payload?: { id?: string; title?: string; model?: string }): Promise<Session> {
  const res = await fetch(`${API_BASE}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  if (!res.ok) throw new Error('Failed to create session');
  return res.json();
}

export async function deleteSession(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/sessions/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete session');
}

export async function updateSession(id: string, payload: { title?: string; model?: string }): Promise<Session> {
  const res = await fetch(`${API_BASE}/sessions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to update session');
  return res.json();
}

export async function fetchModels(): Promise<ModelsConfig> {
  const res = await fetch(`${API_BASE}/models`);
  if (!res.ok) throw new Error('Failed to fetch models');
  return res.json();
}

export async function addModel(model: ModelItem): Promise<ModelsConfig> {
  const res = await fetch(`${API_BASE}/models`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(model),
  });
  if (!res.ok) throw new Error('Failed to add model');
  return res.json();
}

export async function deleteModel(modelId: string): Promise<ModelsConfig> {
  const res = await fetch(`${API_BASE}/models/${encodeURIComponent(modelId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete model');
  return res.json();
}

export async function updateModelSettings(settings: { default_model?: string; default_thinking?: string }): Promise<ModelsConfig> {
  const res = await fetch(`${API_BASE}/models/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error('Failed to update settings');
  return res.json();
}

export async function streamChat(
  sessionId: string,
  payload: { message: string; model?: string; thinking?: string },
  onChunk: (event: { type: string; delta?: string; id?: string; content?: string; error?: string }) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Chat error (${res.status}): ${errorText}`);
  }

  if (!res.body) {
    throw new Error('No readable stream available in response');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      let currentEvent = 'message';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) {
          continue; // keepalive comment
        }
        if (trimmed.startsWith('event: ')) {
          currentEvent = trimmed.slice(7).trim();
          continue;
        }
        if (trimmed.startsWith('data: ')) {
          const rawData = trimmed.slice(6).trim();
          try {
            const parsed = JSON.parse(rawData);
            onChunk(parsed);
          } catch {
            // Non-JSON SSE data
            onChunk({ type: currentEvent, delta: rawData });
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
