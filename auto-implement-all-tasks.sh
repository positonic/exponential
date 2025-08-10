#!/bin/bash
# Auto-implement all Task Master tasks using Claude Code

echo "🤖 Starting Task Master Auto-Implementation Pipeline"
echo "=============================================="

# Configuration
MAX_TASKS=100
LOG_FILE=".taskmaster/logs/auto-complete-$(date +%Y%m%d_%H%M%S).log"

# Create log directory
mkdir -p .taskmaster/logs

# Function to run a task
run_single_task() {
    echo "Executing next task..."
    
    claude --no-interactive \
        --continue-on-error \
        --max-turns 50 \
        -p "
1. Use /project:tm/next to get the next pending task
2. If no pending tasks, exit with 'ALL_COMPLETE'
3. Plan the implementation (use the planning workflow)
4. Implement the task completely
5. Run npm run lint:fix
6. Run npm run typecheck  
7. Mark the task as done using /project:tm/set-status/to-done
8. Commit the changes with a descriptive message
9. Print 'TASK_COMPLETE' when done
" 2>&1 | tee -a "$LOG_FILE"
}

# Main execution loop
completed=0
blocked=0

echo "Starting automated task execution..." | tee -a "$LOG_FILE"

for i in $(seq 1 $MAX_TASKS); do
    echo "
========================================
Task Execution #$i
========================================" | tee -a "$LOG_FILE"
    
    output=$(run_single_task)
    
    if echo "$output" | grep -q "ALL_COMPLETE"; then
        echo "✅ All tasks completed!" | tee -a "$LOG_FILE"
        break
    elif echo "$output" | grep -q "TASK_COMPLETE"; then
        ((completed++))
        echo "✅ Task #$i completed successfully" | tee -a "$LOG_FILE"
    else
        ((blocked++))
        echo "❌ Task #$i blocked or failed" | tee -a "$LOG_FILE"
        
        # Optional: Stop if too many failures
        if [ $blocked -gt 5 ]; then
            echo "⚠️ Too many blocked tasks, stopping execution" | tee -a "$LOG_FILE"
            break
        fi
    fi
    
    # Brief pause between tasks
    sleep 2
done

# Summary
echo "
========================================
EXECUTION SUMMARY
========================================
✅ Completed: $completed tasks
❌ Blocked: $blocked tasks
📄 Log file: $LOG_FILE
========================================" | tee -a "$LOG_FILE"

# Generate summary report
claude --no-interactive \
    -p "Generate a summary report of the task execution. Check git log for recent commits and task-master list to see current state." \
    > .taskmaster/logs/summary-$(date +%Y%m%d_%H%M%S).md

echo "🎉 Auto-implementation pipeline finished!"