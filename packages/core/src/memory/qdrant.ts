import { QdrantClient } from '@qdrant/js-client-rest';
import type { TaskDomain, MemoryChunk } from '../../types';

const VECTOR_SIZE = 768; // E.g., nomic-embed-text or gemini embedding
let client: QdrantClient;

export function initQdrant(url = 'http://127.0.0.1:6333'): QdrantClient {
  if (client) return client;
  client = new QdrantClient({ url });
  return client;
}

export async function ensureCollection(domain: TaskDomain): Promise<void> {
  const c = initQdrant();
  const collections = await c.getCollections();
  const exists = collections.collections.some(col => col.name === domain);
  
  if (!exists) {
    await c.createCollection(domain, {
      vectors: {
        size: VECTOR_SIZE,
        distance: 'Cosine'
      }
    });
  }
}

// Use Gemini API for embeddings
async function getEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.ANTIGRAVITY_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing API key for embeddings');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'models/text-embedding-004',
      content: { parts: [{ text }] }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get embedding: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  if (!data.embedding?.values) {
    throw new Error('Invalid embedding response from Gemini');
  }

  return data.embedding.values;
}

export async function storeMemory(
  domain: TaskDomain,
  text: string,
  tags: string[] = []
): Promise<string> {
  const c = initQdrant();
  await ensureCollection(domain);

  const id = crypto.randomUUID();
  const vector = await getEmbedding(text);
  const createdAt = Date.now();

  await c.upsert(domain, {
    wait: true,
    points: [
      {
        id,
        vector,
        payload: {
          content: text,
          domain,
          tags,
          createdAt
        }
      }
    ]
  });

  return id;
}

export async function queryMemory(
  domain: TaskDomain,
  query: string,
  limit: number = 5
): Promise<MemoryChunk[]> {
  const c = initQdrant();
  await ensureCollection(domain);

  const vector = await getEmbedding(query);

  const results = await c.search(domain, {
    vector,
    limit,
    with_payload: true,
    score_threshold: 0.5
  });

  return results.map(r => ({
    id: String(r.id),
    content: r.payload!.content as string,
    score: r.score,
    domain: r.payload!.domain as TaskDomain,
    tags: r.payload!.tags as string[],
    createdAt: r.payload!.createdAt as number
  }));
}
