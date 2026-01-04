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

## Usage Patterns

### Creating a Resource with Chunks

```typescript
// 1. Create the resource
const resource = await prisma.resource.create({
  data: {
    title: "API Documentation",
    url: "https://example.com/docs",
    content: cleanedText,
    contentType: "web_page",
    userId: user.id,
    projectId: project.id,
  }
});

// 2. Chunk the content
const chunks = KnowledgeService.chunkText(cleanedText);

// 3. Generate embeddings and store
for (const [index, chunk] of chunks.entries()) {
  const embedding = await KnowledgeService.generateEmbedding(chunk.text);

  await prisma.$executeRaw`
    INSERT INTO "KnowledgeChunk" (id, content, embedding, "sourceType", "sourceId", "chunkIndex", "userId", "projectId", "createdAt")
    VALUES (${cuid()}, ${chunk.text}, ${embedding}::vector, 'resource', ${resource.id}, ${index}, ${user.id}, ${project.id}, NOW())
  `;
}
```

### Searching the Knowledge Base

```typescript
// Generate query embedding
const queryEmbedding = await KnowledgeService.generateEmbedding(query);

// Search
const results = await prisma.$queryRaw`
  SELECT
    kc.id,
    kc.content,
    kc."sourceType",
    kc."sourceId",
    kc."chunkIndex",
    1 - (kc.embedding <=> ${queryEmbedding}::vector) as similarity,
    CASE
      WHEN kc."sourceType" = 'transcription' THEN ts.title
      WHEN kc."sourceType" = 'resource' THEN r.title
    END as "sourceTitle"
  FROM "KnowledgeChunk" kc
  LEFT JOIN "TranscriptionSession" ts ON kc."sourceType" = 'transcription' AND kc."sourceId" = ts.id
  LEFT JOIN "Resource" r ON kc."sourceType" = 'resource' AND kc."sourceId" = r.id
  WHERE kc."userId" = ${userId}
    AND (kc."projectId" = ${projectId} OR kc."projectId" IS NULL)
  ORDER BY kc.embedding <=> ${queryEmbedding}::vector
  LIMIT 10
`;
```

## Related Files

- `prisma/schema.prisma` - Resource and KnowledgeChunk models
- `prisma/migrations/20260104202249_add_knowledge_base/` - Migration with pgvector
- `src/server/services/KnowledgeService.ts` - Chunking, embedding, search (Phase 2)
- `src/server/api/routers/mastra.ts` - `queryMeetingContext` endpoint

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
