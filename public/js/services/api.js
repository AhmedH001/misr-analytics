// ─── API Service Layer — centralized HTTP communication ──────────────────────
class APIService {

  static async get(endpoint) {
    const res = await fetch(endpoint);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  }

  static async post(endpoint, body) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  }

  static async uploadFile(file) {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: form });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  }

  // ── Backend endpoints ─────────────────────────────────────────────────────

  static health() { return this.get('/api/health'); }
  static stats() { return this.get('/api/stats'); }
  static model() { return this.get('/api/model'); }
  static predict(input) { return this.post('/api/predict', input); }
  static rentalPredict(i) { return this.post('/api/rental-predict', i); }
  static downloadData() { window.open('/api/download-data', '_blank'); }

  // ── Groq LLM — called directly from browser ───────────────────────────────
  /**
   * Send a prompt to the Groq chat-completions endpoint.
   * @param {string[]} messages  - Array of {role, content} objects
   * @param {string}   apiKey   - Groq API key (from AppSettings)
   * @param {string}   model    - Groq model ID
   * @returns {Promise<string>} - Full text of the first assistant message
   */
  static async groqChat(messages, apiKey, model = 'llama-3.3-70b-versatile') {
    if (!apiKey) throw new Error('Groq API key is not set. Configure it in Settings.');

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 1600,
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Groq API error ${res.status}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  // ── Convenience: fetch available Groq models ─────────────────────────────
  static async groqModels(apiKey) {
    if (!apiKey) throw new Error('API key required');
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`Groq models fetch failed: ${res.status}`);
    const data = await res.json();
    return (data.data || []).map(m => m.id).filter(id =>
      // Filter to chat-capable models only
      !id.includes('whisper') && !id.includes('tts')
    );
  }
}