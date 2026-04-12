// API Service Layer — centralized HTTP communication
class APIService {
  static async get(endpoint) {
    const res = await fetch(endpoint);
    if (!res.ok) {
      const err = await res.json();
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
      const err = await res.json();
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  }

  static async uploadFile(file) {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/upload', {
      method: 'POST',
      body: form,
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  }

  // Health check
  static health() {
    return this.get('/api/health');
  }

  // Fetch market stats and aggregates
  static stats() {
    return this.get('/api/stats');
  }

  // Fetch model info
  static model() {
    return this.get('/api/model');
  }

  // Predict price
  static predict(input) {
    return this.post('/api/predict', input);
  }

  // Rental yield & ROR
  static rentalPredict(input) {
    return this.post('/api/rental-predict', input);
  }

  // Download sample data
  static downloadData() {
    window.open('/api/download-data', '_blank');
  }
}
