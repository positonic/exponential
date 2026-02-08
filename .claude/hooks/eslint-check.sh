#!/bin/bash
# PostToolUse hook: Run ESLint on the specific edited file
# Exit code 2 = blocking error (stderr fed back to Claude)
# Exit code 0 = success

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Skip if no file path
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Skip non-JS/TS files
if [[ ! "$FILE_PATH" =~ \.(tsx?|jsx?)$ ]]; then
  exit 0
fi

# Skip node_modules and generated files
if [[ "$FILE_PATH" =~ (node_modules|\.next|dist-electron) ]]; then
  exit 0
fi

# Run ESLint on just this file (fast: ~1-2 seconds)
OUTPUT=$(npx eslint "$FILE_PATH" 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
  echo "ESLint errors in $FILE_PATH:" >&2
  echo "$OUTPUT" >&2
  exit 2
fi

exit 0
