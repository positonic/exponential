# Knowledge Base & RAG System

## Overview

The knowledge base provides unified semantic search across all content sources (meeting transcriptions, documents, web pages) using pgvector for vector embeddings.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  SOURCE MODELS (metadata, no embeddings)                    │
├──────────────────────────┬──────────────────────────────────┤
│  TranscriptionSession    │  Resource                        │
│  - Meeting metadata      │  - Document metadata             │
│  - Full transcription    │  - URL, raw content              │
│  - Existing model        │  - Author, tags, etc.            │
└──────────────────────────┴──────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  KnowledgeChunk - Unified embeddings                        │
│  - content (text chunk ~500 tokens)                         │
│  - embedding vector(1536)                                   │
│  - sourceType ("transcription" | "resource")                │
│  - sourceId (links to source)                               │
│  - projectId, userId (for filtering)                        │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Unified Search                                             │
│  - Single query searches all knowledge types                │
│  - Returns meetings + docs + web pages                      │
│  - Filters by project/workspace                             │
└─────────────────────────────────────────────────────────────┘
```

## Database Models

### Resource

Stores external documents, web pages, bookmarks, and notes.

```prisma
model Resource {
  id          String    @id @default(cuid())
  title       String
  description String?
  url         String?                          // Source URL
  rawContent  String?                          // Original HTML/content
  content     String?                          // Cleaned text
  contentType String    @default("web_page")   // web_page | document | pdf | bookmark | note
  mimeType    String?
  author      String?
  publishedAt DateTime?
  fetchedAt   DateTime?
  wordCount   Int?
  summary     String?                          // AI-generated
  tags        String[]
  userId      String
  projectId   String?
  workspaceId String?
  // ... timestamps and relations
}
```

### KnowledgeChunk

Unified table for all embeddings. Uses polymorphic `sourceType` + `sourceId` pattern.

```prisma
model KnowledgeChunk {
  id         String   @id @default(cuid())
  content    String                           // Text chunk (~500 tokens)
  embedding  Unsupported("vector(1536)")?     // pgvector
  sourceType String                           // "transcription" | "resource"
  sourceId   String                           // ID of source record
  chunkIndex Int                              // Order within source
  tokenCount Int?
  startPos   Int?
  endPos     Int?
  userId     String
  projectId  String?
  createdAt  DateTime @default(now())
}
```

## pgvector Setup

The migration enables pgvector automatically:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

For Railway/Supabase/Neon, pgvector is pre-installed. Just run the migration.

## API Endpoints

### Resource CRUD (`api.resource.*`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `resource.create` | mutation | Create a new resource with optional auto-embedding |
| `resource.get` | query | Get a single resource by ID |
| `resource.list` | query | List resources with filters (project, workspace, tags, search) |
| `resource.update` | mutation | Update a resource |
| `resource.archive` | mutation | Soft delete a resource |
| `resource.unarchive` | mutation | Restore an archived resource |
| `resource.delete` | mutation | Permanently delete a resource and its embeddings |
| `resource.regenerateEmbeddings` | mutation | Regenerate embeddings for a resource |
| `resource.search` | query | Semantic search across resources |

### Mastra Endpoints (`api.mastra.*`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `mastra.queryMeetingContext` | mutation | Semantic search across all knowledge (transcriptions + resources) |
| `mastra.backfillTranscriptionEmbeddings` | mutation | Generate embeddings for existing transcriptions |
| `mastra.getEmbeddingStats` | query | Get statistics on embedding coverage |

## KnowledgeService

The `KnowledgeService` (`src/server/services/KnowledgeService.ts`) provides core functionality:

### Methods

```typescript
// Get singleton instance
const knowledgeService = getKnowledgeService(db);

// Generate embedding for text
await knowledgeService.generateEmbedding(text);

// Chunk text into ~500 token segments
const chunks = knowledgeService.chunkText(text);

// Embed a resource (chunks + stores embeddings)
await knowledgeService.embedResource(resourceId);

// Embed a transcription
await knowledgeService.embedTranscription(transcriptionId);

// Semantic search
const results = await knowledgeService.search(query, {
  userId: string,
  projectId?: string,
  sourceTypes?: ('transcription' | 'resource')[],
  limit?: number,
});

// Delete chunks for a source
await knowledgeService.deleteChunks(sourceType, sourceId);

// Get chunk count for a source
await knowledgeService.getChunkCount(sourceType, sourceId);
```

## Vector Search

Since Prisma doesn't support pgvector operations natively, use raw SQL:

```typescript
// Search for similar chunks
const results = await prisma.$queryRaw`
  SELECT
    id,
    content,
    "sourceType",
    "sourceId",
    1 - (embedding <=> ${queryEmbedding}::vector) as similarity
  FROM "KnowledgeChunk"
  WHERE "userId" = ${userId}
    AND "projectId" = ${projectId}
  ORDER BY embedding <=> ${queryEmbedding}::vector
  LIMIT 5
`;
```

Operators:
- `<=>` - Cosine distance (most common for text)
- `<->` - L2/Euclidean distance
- `<#>` - Inner product

## Embedding Model

Using OpenAI `text-embedding-3-small`:
- 1536 dimensions
- Good price/performance ratio
- ~$0.02 per 1M tokens

## Chunking Strategy

Target: ~500 tokens per chunk with sentence boundary splitting.

1. Split on paragraph/section boundaries
2. If chunk > 500 tokens, split on sentence boundaries
3. Include 1-2 sentence overlap for context
4. Preserve speaker labels in transcriptions

## Usage Examples

### Creating a Resource via API

```typescript
// Create resource with auto-embedding
const { resource } = await api.resource.create.mutate({
  title: "API Documentation",
  url: "https://example.com/docs",
  content: cleanedText,
  contentType: "web_page",
  projectId: project.id,
  generateEmbeddings: true, // auto-embed
});
```

### Semantic Search

```typescript
// Search across all knowledge
const { results } = await api.mastra.queryMeetingContext.mutate({
  query: "how to deploy the application",
  projectId: project.id,
  topK: 10,
  sourceTypes: ['transcription', 'resource'], // optional filter
});

// Search only resources
const { results } = await api.resource.search.query({
  query: "authentication setup",
  projectId: project.id,
  limit: 5,
});
```

### Backfill Existing Transcriptions

```typescript
// Backfill embeddings for transcriptions that don't have them
const { processed, successful, failed, results } =
  await api.mastra.backfillTranscriptionEmbeddings.mutate({
    projectId: project.id,
    limit: 10,
    skipExisting: true,
  });

// Check embedding coverage
const stats = await api.mastra.getEmbeddingStats.query({
  projectId: project.id,
});
// Returns: { transcriptions: { total, withEmbeddings, pendingEmbeddings }, ... }
```

## Related Files

| File | Description |
|------|-------------|
| `prisma/schema.prisma` | Resource and KnowledgeChunk models |
| `prisma/migrations/20260104202249_add_knowledge_base/` | Migration with pgvector |
| `src/server/services/KnowledgeService.ts` | Chunking, embedding, search service |
| `src/server/api/routers/resource.ts` | Resource CRUD endpoints |
| `src/server/api/routers/mastra.ts` | `queryMeetingContext`, backfill, stats endpoints |

## Migration Notes

### Enabling pgvector

The migration includes `CREATE EXTENSION IF NOT EXISTS vector;`. If using `prisma migrate dev`, you may hit shadow database issues. Use `prisma migrate deploy` instead:

```bash
npx prisma migrate deploy
npx prisma generate
```

### Shadow Database Issue

Prisma's shadow database doesn't have pgvector. Solutions:
1. Use `prisma migrate deploy` (recommended)
2. Configure `shadowDatabaseUrl` with pgvector-enabled DB
3. Use `prisma db push` for dev (loses migration history)

## Fallback Behavior

The `queryMeetingContext` endpoint has graceful fallback:
1. Attempts vector search using KnowledgeService
2. If vector search fails (e.g., no embeddings), falls back to keyword search
3. Returns results in consistent format either way

This ensures the system works before embeddings are generated while providing better results once they're available.
