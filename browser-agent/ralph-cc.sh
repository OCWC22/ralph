#!/bin/bash
# ralph-cc.sh - Ralph loop using Claude Code instead of Amp
# This is the magic: bash loop spawns FRESH Claude Code instances

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAX_ITERATIONS=${1:-10}
LOG_DIR="$SCRIPT_DIR/logs"

mkdir -p "$LOG_DIR"

echo "========================================"
echo "  RALPH + CLAUDE CODE BROWSER AGENT"
echo "  Max iterations: $MAX_ITERATIONS"
echo "========================================"

# Initialize progress file if doesn't exist
if [ ! -f "$SCRIPT_DIR/progress.txt" ]; then
    cat > "$SCRIPT_DIR/progress.txt" << 'EOF'
# Browser Agent Progress Log

## Codebase Patterns
- Use Stagehand act() for single actions
- Use Stagehand extract() for getting data from pages
- Use agent.execute() for multi-step tasks
- Always log actions to logs/ directory
- Check prd.json for next task

---

EOF
    echo "Created progress.txt"
fi

# The Loop - each iteration is a FRESH Claude Code instance
for i in $(seq 1 $MAX_ITERATIONS); do
    TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
    ITERATION_LOG="$LOG_DIR/iteration_${i}_${TIMESTAMP}.log"

    echo ""
    echo "========================================"
    echo "  ITERATION $i / $MAX_ITERATIONS"
    echo "  Time: $(date)"
    echo "  Log: $ITERATION_LOG"
    echo "========================================"

    # Log iteration start
    echo "{\"iteration\": $i, \"timestamp\": \"$TIMESTAMP\", \"status\": \"started\"}" >> "$LOG_DIR/iterations.jsonl"

    # THE MAGIC LINE: Spawn fresh Claude Code with the prompt
    # --dangerously-skip-permissions lets it run without confirmations
    # Each iteration = brand new context, zero memory of previous runs
    OUTPUT=$(claude --dangerously-skip-permissions -p "$(cat "$SCRIPT_DIR/prompt-cc.md")" 2>&1 | tee "$ITERATION_LOG" | tee /dev/stderr) || true

    # Log iteration result
    if echo "$OUTPUT" | grep -q "<promise>COMPLETE</promise>"; then
        echo "{\"iteration\": $i, \"timestamp\": \"$(date +%Y-%m-%d_%H-%M-%S)\", \"status\": \"complete\", \"signal\": \"COMPLETE\"}" >> "$LOG_DIR/iterations.jsonl"
        echo ""
        echo "========================================"
        echo "  ALL TASKS COMPLETE!"
        echo "  Total iterations: $i"
        echo "========================================"
        exit 0
    fi

    # Check for errors
    if echo "$OUTPUT" | grep -q "<promise>ERROR</promise>"; then
        echo "{\"iteration\": $i, \"timestamp\": \"$(date +%Y-%m-%d_%H-%M-%S)\", \"status\": \"error\"}" >> "$LOG_DIR/iterations.jsonl"
        echo "ERROR detected in iteration $i. Check $ITERATION_LOG"
    else
        echo "{\"iteration\": $i, \"timestamp\": \"$(date +%Y-%m-%d_%H-%M-%S)\", \"status\": \"completed_task\"}" >> "$LOG_DIR/iterations.jsonl"
    fi

    echo "Iteration $i complete. Sleeping 2s before next..."
    sleep 2
done

echo ""
echo "========================================"
echo "  MAX ITERATIONS REACHED ($MAX_ITERATIONS)"
echo "  Check prd.json for remaining tasks"
echo "========================================"
exit 1
