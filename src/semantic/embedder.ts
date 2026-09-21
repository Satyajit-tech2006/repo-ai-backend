import dotenv from 'dotenv';

dotenv.config();

export class VectorEmbedder {
  private apiKey: string;
  private endpoint: string;
  private timeoutMs: number;

  constructor(timeoutMs: number = 15000) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY is missing from .env');
    }
    this.apiKey = key;
    this.timeoutMs = timeoutMs;
    // Direct Gemini embedding endpoint
    this.endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${this.apiKey}`;
  }

  public async embed(text: string, retries: number = 2): Promise<number[]> {
    let lastError: any = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch(this.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: {
              parts: [{ text }],
            },
          }),
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (!response.ok) {
          const err = await response.text();
          throw new Error(`Embedding API error [${response.status}]: ${err}`);
        }

        const data = await response.json();
        return data.embedding.values;
      } catch (err: any) {
        lastError = err;
        if (attempt < retries) {
          // Wait 1 second before retrying
          await new Promise((res) => setTimeout(res, 1000));
        }
      }
    }

    throw lastError;
  }

  public static cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}