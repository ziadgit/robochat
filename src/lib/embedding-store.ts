// Semantic RAG: pre-embeds the therapeutic KB with Mistral Embed at startup,
// then retrieves techniques by cosine similarity against the user's embedded
// message — so "I can't stop worrying about the deadline" pulls back
// decatastrophizing and deadline anxiety, not a hardcoded emotion-to-key map.
import { Mistral } from "@mistralai/mistralai";
import type { Technique } from "./empathy-knowledge";
import { getAllTechniques } from "./empathy-knowledge";

const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
const EMBED_MODEL = "mistral-embed";

interface StoredEntry {
  key: string;
  technique: Technique;
  vector: number[];
}

let store: StoredEntry[] = [];
let initialized = false;
let initPromise: Promise<void> | null = null;

function cosine(a: number[], b: number[]): number {
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

function techniqueToText(t: Technique): string {
  const items = t.steps ?? t.strategies ?? t.questions ?? [];
  return `${t.name}: ${t.summary} ${items.join(". ")}`;
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const res = await client.embeddings.create({
    model: EMBED_MODEL,
    inputs: texts,
  });
  return res.data.map((d) => d.embedding as number[]);
}

async function initStore(): Promise<void> {
  if (initialized) return;

  const all = getAllTechniques();
  const texts = all.map(([, t]) => techniqueToText(t));
  const vectors = await embedBatch(texts);

  store = all.map(([key, technique], i) => ({
    key,
    technique,
    vector: vectors[i],
  }));
  initialized = true;
}

export async function ensureInitialized(): Promise<void> {
  if (initialized) return;
  if (!initPromise) {
    initPromise = initStore().catch((err) => {
      console.error("Embedding store init failed:", err);
      initPromise = null;
    });
  }
  await initPromise;
}

export async function semanticRetrieve(
  query: string,
  topK = 3,
): Promise<Technique[]> {
  await ensureInitialized();

  if (store.length === 0) return [];

  const [queryVec] = await embedBatch([query]);
  const scored = store
    .map((entry) => ({ technique: entry.technique, score: cosine(queryVec, entry.vector) }))
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, topK).map((s) => s.technique);
}
