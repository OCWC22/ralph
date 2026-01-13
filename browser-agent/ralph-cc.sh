#!/bin/bash
# ralph-cc.sh - Ralph loop using Claude Code with COST TRACKING
#
# COST CONTROL:
# - MAX_COST: Stop if total cost exceeds this (default $1.00)
# - MAX_TIME_PER_ITER: Kill iteration if it takes too long (default 120s)
# - QUALITY_GATE: Require task completion or abort after N failures

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$SCRIPT_DIR/logs"
COST_LOG="$LOG_DIR/costs.jsonl"

# === CONFIGURATION ===
MAX_ITERATIONS=${1:-10}
MAX_COST=${MAX_COST:-1.00}           # Max total cost in dollars
MAX_TIME_PER_ITER=${MAX_TIME:-120}   # Max seconds per iteration
MAX_CONSECUTIVE_FAILURES=${MAX_FAIL:-2}  # Abort after N failures in a row
MODEL=${MODEL:-"sonnet"}             # sonnet, opus, or haiku

# Cost per 1M tokens (approximate)
declare -A INPUT_COST=( ["haiku"]=0.25 ["sonnet"]=3.00 ["opus"]=15.00 )
declare -A OUTPUT_COST=( ["haiku"]=1.25 ["sonnet"]=15.00 ["opus"]=75.00 )

mkdir -p "$LOG_DIR"

# === COST TRACKING FUNCTIONS ===
estimate_iteration_cost() {
    local input_tokens=$1
    local output_tokens=$2
    local in_cost=${INPUT_COST[$MODEL]}
    local out_cost=${OUTPUT_COST[$MODEL]}

    # Cost = (tokens / 1M) * cost_per_1M
    echo "scale=4; ($input_tokens * $in_cost / 1000000) + ($output_tokens * $out_cost / 1000000)" | bc
}

get_total_cost() {
    if [ ! -f "$COST_LOG" ]; then
        echo "0"
        return
    fi
    # Sum all costs from the log
    awk -F'"cost":' '{sum += $2} END {printf "%.4f", sum}' "$COST_LOG" 2>/dev/null || echo "0"
}

log_cost() {
    local iteration=$1
    local input_tokens=$2
    local output_tokens=$3
    local cost=$4
    local duration=$5
    local status=$6

    echo "{\"iteration\": $iteration, \"input_tokens\": $input_tokens, \"output_tokens\": $output_tokens, \"cost\": $cost, \"duration_s\": $duration, \"status\": \"$status\", \"model\": \"$MODEL\", \"timestamp\": \"$(date -Iseconds)\"}" >> "$COST_LOG"
}

# === QUALITY GATE: Check if iteration was productive ===
check_iteration_quality() {
    local log_file=$1
    local prev_prd_hash=$2

    # Check 1: Did prd.json change? (task was marked complete)
    local new_prd_hash=$(md5sum "$SCRIPT_DIR/prd.json" 2>/dev/null | cut -d' ' -f1)
    if [ "$prev_prd_hash" != "$new_prd_hash" ]; then
        echo "productive"  # prd.json changed = task completed
        return
    fi

    # Check 2: Was there an error signal?
    if grep -q "<promise>ERROR</promise>" "$log_file" 2>/dev/null; then
        echo "error"
        return
    fi

    # Check 3: Was there useful output? (more than 100 chars)
    local output_size=$(wc -c < "$log_file" 2>/dev/null || echo "0")
    if [ "$output_size" -lt 100 ]; then
        echo "empty"  # Basically no output = wasted iteration
        return
    fi

    echo "unclear"  # Ran but didn't complete a task
}

# === HEADER ===
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║          RALPH + CLAUDE CODE (COST-CONTROLLED)               ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Model: $MODEL"
echo "║  Max iterations: $MAX_ITERATIONS"
echo "║  Max cost: \$$MAX_COST"
echo "║  Max time/iter: ${MAX_TIME_PER_ITER}s"
echo "║  Max consecutive failures: $MAX_CONSECUTIVE_FAILURES"
echo "╚══════════════════════════════════════════════════════════════╝"

# Initialize progress file if doesn't exist
if [ ! -f "$SCRIPT_DIR/progress.txt" ]; then
    cat > "$SCRIPT_DIR/progress.txt" << 'EOF'
# Browser Agent Progress Log

## Codebase Patterns
- Use Stagehand act() for single actions
- Use Stagehand extract() for getting data from pages
- Always log actions to logs/ directory
- Check prd.json for next task
- ONE task per iteration, then stop

---

EOF
    echo "Created progress.txt"
fi

# === MAIN LOOP ===
CONSECUTIVE_FAILURES=0
TOTAL_COST=0

for i in $(seq 1 $MAX_ITERATIONS); do
    TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
    ITERATION_LOG="$LOG_DIR/iteration_${i}_${TIMESTAMP}.log"

    # Check cost budget BEFORE iteration
    TOTAL_COST=$(get_total_cost)
    if (( $(echo "$TOTAL_COST >= $MAX_COST" | bc -l) )); then
        echo ""
        echo "⛔ COST LIMIT REACHED: \$$TOTAL_COST >= \$$MAX_COST"
        echo "   Stopping to prevent overspend."
        exit 2
    fi

    REMAINING=$(echo "scale=2; $MAX_COST - $TOTAL_COST" | bc)

    echo ""
    echo "════════════════════════════════════════════════════════════════"
    echo "  ITERATION $i / $MAX_ITERATIONS"
    echo "  Cost so far: \$$TOTAL_COST | Remaining budget: \$$REMAINING"
    echo "  Time: $(date)"
    echo "════════════════════════════════════════════════════════════════"

    # Save prd.json hash to detect changes
    PRD_HASH=$(md5sum "$SCRIPT_DIR/prd.json" 2>/dev/null | cut -d' ' -f1)

    # Log iteration start
    echo "{\"iteration\": $i, \"timestamp\": \"$TIMESTAMP\", \"status\": \"started\", \"cost_so_far\": $TOTAL_COST}" >> "$LOG_DIR/iterations.jsonl"

    # Run with timeout
    START_TIME=$(date +%s)

    # THE MAGIC LINE with timeout
    timeout $MAX_TIME_PER_ITER claude --dangerously-skip-permissions -p "$(cat "$SCRIPT_DIR/prompt-cc.md")" 2>&1 | tee "$ITERATION_LOG" | tee /dev/stderr || true

    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))

    # Estimate tokens from log file size (rough: 1 token ≈ 4 chars)
    LOG_SIZE=$(wc -c < "$ITERATION_LOG" 2>/dev/null || echo "0")
    EST_OUTPUT_TOKENS=$((LOG_SIZE / 4))
    EST_INPUT_TOKENS=2000  # Prompt is roughly constant

    # Calculate cost for this iteration
    ITER_COST=$(estimate_iteration_cost $EST_INPUT_TOKENS $EST_OUTPUT_TOKENS)

    # Check quality
    QUALITY=$(check_iteration_quality "$ITERATION_LOG" "$PRD_HASH")

    # Log the cost
    log_cost $i $EST_INPUT_TOKENS $EST_OUTPUT_TOKENS $ITER_COST $DURATION $QUALITY

    echo ""
    echo "  ├─ Duration: ${DURATION}s"
    echo "  ├─ Est. cost: \$$ITER_COST"
    echo "  ├─ Quality: $QUALITY"

    # Check for completion
    if grep -q "<promise>COMPLETE</promise>" "$ITERATION_LOG" 2>/dev/null; then
        TOTAL_COST=$(get_total_cost)
        echo "  └─ Status: ✅ ALL TASKS COMPLETE"
        echo ""
        echo "╔══════════════════════════════════════════════════════════════╗"
        echo "║  SUCCESS! All tasks complete.                                ║"
        echo "║  Total iterations: $i                                        ║"
        echo "║  Total cost: \$$TOTAL_COST                                   ║"
        echo "╚══════════════════════════════════════════════════════════════╝"
        exit 0
    fi

    # Handle quality results
    case $QUALITY in
        "productive")
            echo "  └─ Status: ✅ Task completed"
            CONSECUTIVE_FAILURES=0
            ;;
        "error")
            echo "  └─ Status: ❌ Error detected"
            CONSECUTIVE_FAILURES=$((CONSECUTIVE_FAILURES + 1))
            ;;
        "empty"|"unclear")
            echo "  └─ Status: ⚠️  No task completed (wasted iteration)"
            CONSECUTIVE_FAILURES=$((CONSECUTIVE_FAILURES + 1))
            ;;
    esac

    # Check consecutive failures
    if [ $CONSECUTIVE_FAILURES -ge $MAX_CONSECUTIVE_FAILURES ]; then
        echo ""
        echo "⛔ TOO MANY CONSECUTIVE FAILURES: $CONSECUTIVE_FAILURES"
        echo "   Something is wrong. Stopping to prevent waste."
        echo "   Check the logs: $LOG_DIR/"
        exit 3
    fi

    echo ""
    echo "Sleeping 2s before next iteration..."
    sleep 2
done

TOTAL_COST=$(get_total_cost)
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  MAX ITERATIONS REACHED ($MAX_ITERATIONS)                    ║"
echo "║  Total cost: \$$TOTAL_COST                                   ║"
echo "║  Check prd.json for remaining tasks                          ║"
echo "╚══════════════════════════════════════════════════════════════╝"
exit 1
