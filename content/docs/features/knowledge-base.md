---
title: Knowledge Base
description: Store and search documents, web pages, and meeting transcriptions with AI-powered semantic search.
icon: IconDatabase
order: 3
---

# Knowledge Base

The Knowledge Base lets you save documents, web pages, and notes alongside your meeting transcriptions. All content is indexed for AI-powered semantic search, so your AI assistant can find relevant information across everything you've saved.

## What You Can Store

- **Web Pages** - Save articles, documentation, or any web content
- **Documents** - Store text documents and notes
- **Meeting Transcriptions** - Automatically indexed from your meetings
- **Bookmarks** - Quick references to important URLs
- **Notes** - Quick thoughts and reminders

## How It Works

When you save content to the Knowledge Base:

1. **Content is cleaned** - HTML is stripped, text is extracted
2. **Text is chunked** - Content is split into ~500 token segments with smart sentence boundaries
3. **AI embeddings are generated** - Each chunk gets a semantic fingerprint using OpenAI
4. **Stored for search** - Content becomes searchable by meaning, not just keywords

## AI-Powered Search

Unlike traditional keyword search, the Knowledge Base uses **semantic search**. This means:

- Search by meaning, not exact words
- Find related content even with different terminology
- Get relevant results ranked by similarity
- Search across all your content with a single query

### Example

If you saved an article about "machine learning optimization" and search for "how to improve AI model performance", the system understands these are related and returns the article.

## Project Context

Content can be associated with specific projects. When chatting with your AI assistant about a project, it automatically has access to:

- Meeting transcriptions for that project
- Documents and resources you've saved to that project
- Web pages you've bookmarked for reference

This gives your AI assistant the context it needs to provide relevant, informed responses.

## Content Types

| Type | Description | Best For |
|------|-------------|----------|
| Web Page | Saved web content with URL | Articles, documentation, references |
| Document | Text content without a URL | Notes, drafts, internal docs |
| PDF | Uploaded PDF documents | Reports, papers, presentations |
| Bookmark | URL reference with minimal content | Quick links, read-later items |
| Note | Short text snippets | Quick thoughts, reminders |

## Managing Your Knowledge Base

### Adding Content

Content can be added through:
- Saving web pages directly
- Uploading documents
- Automatic indexing of meeting transcriptions
- Creating notes and bookmarks

### Organizing Content

- **Tags** - Add tags to organize and filter content
- **Projects** - Associate content with specific projects
- **Workspaces** - Keep work and personal content separate

### Archiving

Content you no longer need can be archived:
- Archived content is hidden from normal searches
- Can be restored at any time
- Permanently delete when you're sure

## Privacy

Your Knowledge Base content is:

- Private to your account
- Only searchable by you and your AI assistant
- Never shared with other users
- Scoped to your projects and workspaces
- Stored securely with encryption at rest

## Getting Started

### Step 1: Access the Knowledge Base

1. Open the sidebar menu
2. Expand the **Tools** section
3. Click **Knowledge Base**

Or navigate directly to: `/w/{your-workspace}/knowledge-base`

### Step 2: Index Your Meeting Transcriptions

If you have existing meeting transcriptions:

1. Look for the yellow alert: "Transcriptions need indexing"
2. Click **Index Now** to process them
3. Wait for completion (processes 20 at a time)
4. Repeat if more remain pending

### Step 3: Add Your First Resource

1. Click **Add Resource** (top right)
2. Choose a type:
   - **Web Page** - Articles, documentation with URLs
   - **Document** - Text documents without URLs
   - **Note** - Quick thoughts and reminders
   - **Bookmark** - URL references for later
3. Fill in the title and content
4. Click **Add Resource**

Your content is automatically processed and indexed for search.

### Step 4: Test Semantic Search

1. Click the **Search** tab
2. Type a query (at least 3 characters)
3. View results ranked by relevance

**Try these searches:**
- Topics from your recent meetings
- Concepts rather than exact words
- Questions like "how to deploy" or "what's the budget"

## Tips for Best Results

- **Be specific**: "Q4 marketing budget" works better than just "budget"
- **Use natural language**: Search like you'd ask a question
- **Add context**: More words help find better matches
- **Check similarity**: Higher percentages mean closer matches

## Technical Details

For developers and power users:

- **Embedding Model**: OpenAI text-embedding-3-small (1536 dimensions)
- **Vector Database**: pgvector on PostgreSQL
- **Chunking**: ~500 tokens with sentence boundary awareness and overlap
- **Search**: Cosine similarity ranking
