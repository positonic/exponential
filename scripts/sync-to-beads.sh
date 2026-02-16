#!/bin/bash
# Sync Exponential MVP Development tasks to Beads
# Run from exponential project root

set -e

PROJECT_ID="cmlf3zmw40005l804w0eg28p4"
EXPONENTIAL_CLI="/Users/james/code/exponential-cli/bin/exponential.js"
LOG_FILE="/Users/james/code/exponential/.beads/sync.log"

cd /Users/james/code/exponential

echo "[$(date)] Starting sync..." >> "$LOG_FILE"

# Get existing beads titles and external refs
existing_refs=$(bd list --json 2>/dev/null | jq -r '.[].external_ref // empty' 2>/dev/null || echo "")

# Fetch tasks from Exponential
tasks=$(node "$EXPONENTIAL_CLI" actions list --project "$PROJECT_ID" --json 2>/dev/null)

if [ -z "$tasks" ]; then
    echo "[$(date)] Failed to fetch tasks from Exponential" >> "$LOG_FILE"
    exit 1
fi

# Process each task
echo "$tasks" | jq -c '.actions[]' | while read -r task; do
    name=$(echo "$task" | jq -r '.name')
    description=$(echo "$task" | jq -r '.description // empty')
    priority=$(echo "$task" | jq -r '.priority // "Quick"')
    exp_id=$(echo "$task" | jq -r '.id')
    
    # Skip if already exists (check by external ref)
    if echo "$existing_refs" | grep -qF "exp:$exp_id"; then
        continue
    fi
    
    # Map priority to beads priority (0-4)
    case "$priority" in
        "Big Rock"|"1st Priority") bd_priority=1 ;;
        "Focus"|"2nd Priority") bd_priority=2 ;;
        "3rd Priority"|"4th Priority") bd_priority=3 ;;
        *) bd_priority=3 ;;
    esac
    
    # Determine issue type
    if echo "$name" | grep -qiE "bug|fix|issue|broken|doesn't|don't"; then
        issue_type="bug"
    else
        issue_type="task"
    fi
    
    # Create the bead
    echo "[$(date)] Creating bead: $name" >> "$LOG_FILE"
    
    if [ -n "$description" ] && [ "$description" != "null" ]; then
        bd create "$name" -p "$bd_priority" -t "$issue_type" -d "$description" --external-ref "exp:$exp_id" 2>> "$LOG_FILE" || true
    else
        bd create "$name" -p "$bd_priority" -t "$issue_type" --external-ref "exp:$exp_id" 2>> "$LOG_FILE" || true
    fi
done

echo "[$(date)] Sync complete" >> "$LOG_FILE"
