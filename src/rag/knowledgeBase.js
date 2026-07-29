import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { HuggingFaceTransformersEmbeddings } from '@langchain/community/embeddings/hf_transformers';
import { Document } from '@langchain/core/documents';

/**
 * knowledgeBase.js
 *
 * Loads the compliance/regulatory documents from data/compliance-docs/,
 * splits them into chunks, embeds them, and serves similarity search over
 * an in-memory vector store.
 *
 * Deliberate design choice: MemoryVectorStore + a locally-run embedding
 * model (@xenova/transformers, no API key, no external server), rather
 * than a hosted vector DB like Chroma/Pinecone. At this corpus size (a
 * handful of short documents) that keeps the whole system dependency-free
 * and runnable offline. If the document corpus grows large enough that
 * rebuilding the in-memory index on every process start becomes slow, swap
 * this module's internals for a persistent store (e.g. pgvector, Chroma) —
 * the public retrieveComplianceContext() function below is the seam; no
 * caller code needs to change.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.join(__dirname, '..', '..', 'data', 'compliance-docs');

let cachedStore = null;
let buildPromise = null;

async function loadDocuments() {
  let filenames;
  try {
    filenames = await readdir(DOCS_DIR);
  } catch (err) {
    throw new Error(
      `Could not read compliance docs directory at ${DOCS_DIR}: ${err.message}. ` +
        'Make sure data/compliance-docs/ exists and contains at least one .md file.'
    );
  }

  const mdFiles = filenames.filter((name) => name.endsWith('.md'));
  if (mdFiles.length === 0) {
    throw new Error(`No .md files found in ${DOCS_DIR} — nothing to index.`);
  }

  const documents = [];
  for (const filename of mdFiles) {
    const fullPath = path.join(DOCS_DIR, filename);
    const content = await readFile(fullPath, 'utf8');
    documents.push(new Document({ pageContent: content, metadata: { source: filename } }));
  }
  return documents;
}

async function buildStore() {
  const rawDocuments = await loadDocuments();

  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 500, chunkOverlap: 75 });
  const chunks = await splitter.splitDocuments(rawDocuments);

  // Runs fully locally via WASM on first call — downloads the small
  // (~25MB) MiniLM model weights once and caches them, no API key needed.
  const embeddings = new HuggingFaceTransformersEmbeddings({
    model: 'Xenova/all-MiniLM-L6-v2',
  });

  return MemoryVectorStore.fromDocuments(chunks, embeddings);
}

/**
 * Lazily builds and caches the vector store on first use, and de-duplicates
 * concurrent build attempts (e.g. if two requests hit the tool before the
 * first build finishes) so the corpus is only embedded once per process.
 */
async function getStore() {
  if (cachedStore) return cachedStore;

  if (!buildPromise) {
    buildPromise = buildStore().catch((err) => {
      buildPromise = null; // allow a retry on the next call instead of caching a permanent failure
      throw err;
    });
  }

  cachedStore = await buildPromise;
  return cachedStore;
}

/**
 * @param {string} query
 * @param {number} [k=3]
 * @returns {Promise<Array<{content: string, source: string}>>}
 */
export async function retrieveComplianceContext(query, k = 3) {
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    throw new Error('retrieveComplianceContext requires a non-empty query string');
  }

  const store = await getStore();
  const results = await store.similaritySearch(query, k);

  return results.map((doc) => ({
    content: doc.pageContent,
    source: doc.metadata?.source ?? 'unknown',
  }));
}
