# Browser Agent with Ralph Loop + Claude Code

Browser automation agent that navigates Kling AI to generate videos, tracks prices, with full observability dashboard. Uses the **Ralph pattern** with **Claude Code** instead of Amp.

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                    ralph-cc.sh (BASH)                       │
│                                                             │
│   for i in 1..10:                                           │
│       spawn fresh_claude_code_instance(prompt-cc.md) ←──┐   │
│       if output contains "COMPLETE":                    │   │
│           exit                                          │   │
│       sleep 2                                           │   │
│                      │                                  │   │
│                      └──────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**Each iteration = brand new Claude Code with ZERO memory of previous iterations.**

Memory is stored in files:
- `prd.json` - Task queue (find next `passes: false` task)
- `progress.txt` - Learnings from previous iterations
- `logs/` - Full observability

## Quick Start

```bash
# 1. Install dependencies
cd browser-agent
npm install

# 2. Set up Anthropic API key (for Stagehand)
export ANTHROPIC_API_KEY=your_key_here

# 3. Run a single browser test
npx tsx src/agent.ts navigate https://klingai.com

# 4. Track Kling AI prices
npx tsx src/kling-navigator.ts pricing

# 5. Start the dashboard
npm run dashboard
# Open http://localhost:3000

# 6. Run the full Ralph loop (with Claude Code)
./ralph-cc.sh 5  # 5 iterations max
```

## Architecture

```
browser-agent/
├── src/
│   ├── agent.ts          # Core Stagehand browser agent
│   ├── logger.ts         # Observability logging (JSON Lines)
│   ├── kling-navigator.ts # Kling AI specific navigation
│   ├── price-tracker.ts  # Price extraction and history
│   └── video-generator.ts # Video generation workflow
├── logs/
│   ├── iterations.jsonl  # Ralph iteration logs
│   ├── actions.jsonl     # Browser action logs
│   └── prices.jsonl      # Price tracking data
├── dashboard/
│   └── index.html        # Live observability dashboard
├── ralph-cc.sh           # Ralph loop using Claude Code
├── prompt-cc.md          # Prompt for each iteration
├── prd.json              # Task queue (edit this!)
└── progress.txt          # Learnings across iterations
```

## The Ralph Pattern with Claude Code

The key difference from original Ralph:

| Original Ralph | This Version |
|----------------|--------------|
| Uses Amp CLI | Uses Claude Code CLI |
| `amp --dangerously-allow-all` | `claude --dangerously-skip-permissions` |

The pattern is the same:
1. Bash loop spawns fresh AI instance
2. AI reads `prd.json` to find next task
3. AI completes ONE task
4. AI marks task as `passes: true`
5. AI appends learnings to `progress.txt`
6. AI outputs `<promise>COMPLETE</promise>` when all done
7. Context dies, loop continues

## Commands

```bash
# Browser Agent
npx tsx src/agent.ts navigate <url>      # Navigate to URL
npx tsx src/agent.ts act "<instruction>" # Perform action
npx tsx src/agent.ts screenshot          # Take screenshot

# Kling Navigator
npx tsx src/kling-navigator.ts home      # Go to Kling home
npx tsx src/kling-navigator.ts pricing   # Extract prices
npx tsx src/kling-navigator.ts video     # Explore video gen

# Price Tracker
npx tsx src/price-tracker.ts track       # Track current prices
npx tsx src/price-tracker.ts history     # Show price history
npx tsx src/price-tracker.ts export      # Export for dashboard

# Video Generator
npx tsx src/video-generator.ts "your prompt here"

# Dashboard
npm run dashboard                         # Start at localhost:3000

# Ralph Loop
./ralph-cc.sh                            # Run with 10 iterations
./ralph-cc.sh 5                          # Run with 5 iterations
```

## Observability

All actions are logged to `logs/` in JSON Lines format:

- `iterations.jsonl` - Ralph loop iterations
- `actions.jsonl` - Every browser action with timing
- `prices.jsonl` - Price tracking history
- `agent.jsonl` - General agent logs

Dashboard at `dashboard/index.html` auto-refreshes every 5 seconds.

## Free Stack

Everything is free except:
- **Claude Code subscription** - You already paid for this
- **Stagehand** - Free, uses your Anthropic API key
- **Browser** - Local Playwright, free
- **Dashboard** - Static HTML, free
- **Kling AI** - Free tier: 66 credits/day

No cloud browser services needed. Runs entirely locally.
