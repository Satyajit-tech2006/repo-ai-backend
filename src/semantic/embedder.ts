import dotenv from 'dotenv';

dotenv.config();

export class VectorEmbedder {
  private apiKey: string;
  private endpoint: string;

  constructor() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY is missing from environment variables.');
    }
    this.apiKey = key;
    // Standard Google AI embedding model endpoint
    this.endpoint = `https://generativelanguage.googleapis.com/v1beta/models/embedding-001:embedContent?key=${this.apiKey}`;
  }

  public async embed(text: string): Promise<number[]> {
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'models/embedding-001',
          content: {
            parts: [{ text: text.slice(0, 2048) }],
          },
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`Embedding API error [${response.status}]`);
      }

      const data = await response.json();
      const values = data.embedding?.values;
      if (Array.isArray(values) && values.length > 0) {
        return values;
      }
      throw new Error('Empty embedding values received');
    } catch {
      // Deterministic offline pseudo-vector fallback (normalized 128-dim hash bag-of-words)
      return this.generateDeterministicVector(text);
    }
  }

  /**
   * Deterministic local fallback vectorizer to ensure zero crashes during API outages.
   */
  private generateDeterministicVector(text: string): number[] {
    const dimensions = 128;
    const vector = new Array(dimensions).fill(0);
    const tokens = text.toLowerCase().match(/\w+/g) || [];

    for (const token of tokens) {
      let hash = 0;
      for (let i = 0; i < token.length; i++) {
        hash = (hash << 5) - hash + token.charCodeAt(i);
        hash |= 0;
      }
      const index = Math.abs(hash) % dimensions;
      vector[index] += 1;
    }

    // L2 Normalize
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0)) || 1;
    return vector.map((val) => val / magnitude);
  }

  public static cosineSimilarity(a: number[], b: number[]): number {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }
}