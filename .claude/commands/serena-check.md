Check Serena MCP index status and automatically re-index if needed.

Steps:
1. Check if `.serena/cache/` directory exists
   - If not, run indexing immediately
2. Check age of cache files:
   - Look for `.serena/cache/typescript/document_symbols_cache_*.pkl`
   - If older than 7 days, suggest re-indexing
3. Check recent git activity:
   - Run `git log --oneline -1 --pretty=format:"%ar"`
   - If recent pull/merge, check changed files count
   - If >10 files changed, suggest re-indexing
4. Provide status summary:
   - Cache age
   - Last git activity
   - Recommendation (index, re-index, or cache is fresh)
5. If re-indexing is needed, run it automatically after confirmation

This helps maintain optimal Serena performance for code intelligence.