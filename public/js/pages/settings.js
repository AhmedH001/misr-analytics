// ─── AppSettings ─── Global settings store (localStorage-backed)
class AppSettings {
  static KEY = 'dart_ai_settings';

  static defaults() {
    return {
      modelMode: 'rf',                          // 'rf' | 'llm'
      groqApiKey: '',
      groqModel: 'llama-3.3-70b-versatile',
    };
  }

  static get() {
    try {
      const saved = localStorage.getItem(this.KEY);
      return saved ? { ...this.defaults(), ...JSON.parse(saved) } : this.defaults();
    } catch {
      return this.defaults();
    }
  }

  static save(settings) {
    localStorage.setItem(this.KEY, JSON.stringify(settings));
  }

  static isLLMReady() {
    const s = this.get();
    return s.modelMode === 'llm' && !!s.groqApiKey;
  }
}


// ─── PageSettings ─── Settings page controller
class PageSettings {
  static init() {
    this.setupEvents();
    this.loadSettings();
  }

  static loadSettings() {
    const s = AppSettings.get();

    const rfRadio  = document.getElementById('mode_rf');
    const llmRadio = document.getElementById('mode_llm');
    if (rfRadio)  rfRadio.checked  = s.modelMode !== 'llm';
    if (llmRadio) llmRadio.checked = s.modelMode === 'llm';

    const keyInput = document.getElementById('settings_groq_key');
    if (keyInput) keyInput.value = s.groqApiKey || '';

    const modelSelect = document.getElementById('settings_groq_model');
    if (modelSelect) modelSelect.value = s.groqModel || 'llama-3.3-70b-versatile';

    this.updateLLMVisibility(s.modelMode === 'llm');
    this.updateStatusBadge(s);
    this.highlightActiveCard(s.modelMode);
  }

  static setupEvents() {
    ['mode_rf', 'mode_llm'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', () => {
        const isLLM = document.getElementById('mode_llm')?.checked;
        this.updateLLMVisibility(isLLM);
        this.highlightActiveCard(isLLM ? 'llm' : 'rf');
      });
    });

    document.getElementById('settingsSaveBtn')
      ?.addEventListener('click', () => this.saveSettings());

    document.getElementById('settingsTestBtn')
      ?.addEventListener('click', () => this.testConnection());

    document.getElementById('toggleKeyVisibility')
      ?.addEventListener('click', () => {
        const input = document.getElementById('settings_groq_key');
        if (!input) return;
        input.type = input.type === 'password' ? 'text' : 'password';
        document.getElementById('toggleKeyVisibility').textContent =
          input.type === 'password' ? '👁' : '🙈';
      });
  }

  static updateLLMVisibility(show) {
    const sec = document.getElementById('llmConfigSection');
    if (sec) sec.style.display = show ? 'block' : 'none';
  }

  static highlightActiveCard(mode) {
    const rfCard  = document.getElementById('rfModeCard');
    const llmCard = document.getElementById('llmModeCard');
    const active  = 'border-color:var(--blue);background:rgba(38,80,250,.05)';
    const inactive = '';
    if (rfCard)  rfCard.style.cssText  = mode === 'rf'  ? active : inactive;
    if (llmCard) llmCard.style.cssText = mode === 'llm' ? active : inactive;
  }

  static saveSettings() {
    const modelMode  = document.getElementById('mode_llm')?.checked ? 'llm' : 'rf';
    const groqApiKey = document.getElementById('settings_groq_key')?.value?.trim() || '';
    const groqModel  = document.getElementById('settings_groq_model')?.value || 'llama-3.3-70b-versatile';

    const settings = { modelMode, groqApiKey, groqModel };
    AppSettings.save(settings);
    this.updateStatusBadge(settings);

    const btn = document.getElementById('settingsSaveBtn');
    if (btn) {
      const orig = btn.innerHTML;
      btn.innerHTML = '✓ &nbsp;Saved!';
      btn.style.background = 'linear-gradient(135deg,var(--grn),#18a854)';
      setTimeout(() => { btn.innerHTML = orig; btn.style.background = ''; }, 2200);
    }
  }

  static async testConnection() {
    const btn    = document.getElementById('settingsTestBtn');
    const key    = document.getElementById('settings_groq_key')?.value?.trim();
    const model  = document.getElementById('settings_groq_model')?.value;
    const status = document.getElementById('groqTestStatus');

    if (!key) {
      if (status) { status.textContent = '✕ Enter your API key first'; status.style.color = 'var(--red)'; }
      return;
    }

    btn.disabled = true;
    btn.textContent = '… Testing';
    if (status) { status.textContent = ''; }

    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: model || 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: 'Reply with "OK" only.' }],
          max_tokens: 5,
        }),
      });

      if (res.ok) {
        if (status) { status.textContent = '✓ Connected — API key is valid'; status.style.color = 'var(--grn)'; }
      } else {
        const err = await res.json().catch(() => ({}));
        const msg = err?.error?.message || `HTTP ${res.status}`;
        if (status) { status.textContent = '✕ ' + msg; status.style.color = 'var(--red)'; }
      }
    } catch (e) {
      if (status) { status.textContent = '✕ Network error: ' + e.message; status.style.color = 'var(--red)'; }
    } finally {
      btn.disabled = false;
      btn.textContent = 'Test Connection';
    }
  }

  static updateStatusBadge(s) {
    const badge = document.getElementById('settingsStatusBadge');
    if (!badge) return;
    if (s.modelMode === 'llm' && s.groqApiKey) {
      badge.innerHTML = `<span class="pill" style="background:rgba(38,80,250,.12);border-color:rgba(38,80,250,.3);color:var(--blue)">⚡ Groq AI Active</span>`;
    } else if (s.modelMode === 'llm') {
      badge.innerHTML = `<span class="pill" style="background:rgba(245,166,35,.08);border-color:rgba(245,166,35,.35);color:var(--amb)">⚠ API Key Required</span>`;
    } else {
      badge.innerHTML = `<span class="pill">🌲 Random Forest Active</span>`;
    }
  }

  static onActive() {
    this.loadSettings();
  }
}
