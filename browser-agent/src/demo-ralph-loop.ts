/**
 * DEMO: Ralph Loop Pattern
 *
 * This demonstrates exactly how Ralph works WITHOUT needing network/browser.
 * Run this to see the loop in action.
 *
 * The pattern is the same whether you use:
 * - Claude Code (this demo)
 * - Amp
 * - Any other AI CLI
 */

import * as fs from 'fs';
import * as path from 'path';

const DEMO_DIR = path.join(process.cwd(), 'demo-run');
const LOG_DIR = path.join(DEMO_DIR, 'logs');

// Setup
function setup() {
  if (fs.existsSync(DEMO_DIR)) {
    fs.rmSync(DEMO_DIR, { recursive: true });
  }
  fs.mkdirSync(LOG_DIR, { recursive: true });

  // Create initial prd.json with 3 tasks
  const prd = {
    project: "Demo",
    branchName: "demo/ralph-test",
    description: "Demo of Ralph loop pattern",
    userStories: [
      {
        id: "US-001",
        title: "Navigate to Higgsfield home page",
        passes: false,
        priority: 1
      },
      {
        id: "US-002",
        title: "Extract pricing information",
        passes: false,
        priority: 2
      },
      {
        id: "US-003",
        title: "Log video generation features",
        passes: false,
        priority: 3
      }
    ]
  };
  fs.writeFileSync(path.join(DEMO_DIR, 'prd.json'), JSON.stringify(prd, null, 2));

  // Create initial progress.txt
  const progress = `# Demo Progress Log

## Patterns
- Check prd.json for next task
- Mark passes: true when done
- Append learnings here

---
`;
  fs.writeFileSync(path.join(DEMO_DIR, 'progress.txt'), progress);

  console.log('Setup complete. Files created in demo-run/');
}

// Simulate one iteration (what Claude Code would do)
function simulateIteration(iterationNum: number): { complete: boolean; taskDone?: string } {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`  ITERATION ${iterationNum} - Fresh AI Instance`);
  console.log(`${'='.repeat(50)}`);
  console.log('(AI has ZERO memory of previous iterations)\n');

  // Step 1: Read prd.json
  console.log('Step 1: Reading prd.json...');
  const prdPath = path.join(DEMO_DIR, 'prd.json');
  const prd = JSON.parse(fs.readFileSync(prdPath, 'utf-8'));

  // Find next incomplete task
  const nextTask = prd.userStories.find((s: { passes: boolean }) => !s.passes);

  if (!nextTask) {
    console.log('All tasks complete!');
    console.log('\nOutputting: <promise>COMPLETE</promise>');
    return { complete: true };
  }

  console.log(`Found incomplete task: ${nextTask.id} - ${nextTask.title}`);

  // Step 2: Read progress.txt for learnings
  console.log('\nStep 2: Reading progress.txt for patterns...');
  const progressPath = path.join(DEMO_DIR, 'progress.txt');
  const progress = fs.readFileSync(progressPath, 'utf-8');
  const patternSection = progress.split('## Patterns')[1]?.split('---')[0] || '';
  console.log(`Learned patterns: ${patternSection.trim().split('\n').length} lines`);

  // Step 3: Execute task (simulated)
  console.log(`\nStep 3: Executing task ${nextTask.id}...`);
  console.log(`  [Simulating: ${nextTask.title}]`);

  // Simulate some work
  const mockResults: Record<string, object> = {
    'US-001': {
      url: 'https://higgsfield.ai',
      title: 'Higgsfield AI - Video Generator',
      features: ['Cinema Studio', 'Face Swap', '4K Seedream']
    },
    'US-002': {
      plans: [
        { name: 'Free', price: '$0', credits: '100/month' },
        { name: 'Pro', price: '$29/month', credits: '1000/month' },
        { name: 'Business', price: '$99/month', credits: '5000/month' }
      ]
    },
    'US-003': {
      features: [
        'Text to Video',
        'Image to Video',
        'Camera Control',
        '50+ Cinematic Presets',
        'Draw to Video'
      ]
    }
  };

  const result = mockResults[nextTask.id] || { status: 'done' };
  console.log(`  Result: ${JSON.stringify(result, null, 2)}`);

  // Log to actions.jsonl
  const actionLog = {
    timestamp: new Date().toISOString(),
    iteration: iterationNum,
    task_id: nextTask.id,
    action: nextTask.title,
    result,
    success: true
  };
  fs.appendFileSync(
    path.join(LOG_DIR, 'actions.jsonl'),
    JSON.stringify(actionLog) + '\n'
  );

  // Step 4: Update prd.json
  console.log('\nStep 4: Updating prd.json...');
  nextTask.passes = true;
  fs.writeFileSync(prdPath, JSON.stringify(prd, null, 2));
  console.log(`  Set ${nextTask.id}.passes = true`);

  // Step 5: Append to progress.txt
  console.log('\nStep 5: Appending learnings to progress.txt...');
  const learning = `
## [${new Date().toISOString()}] - ${nextTask.id}
- Completed: ${nextTask.title}
- **Learnings:**
  - Task executed successfully
  - Result logged to actions.jsonl
---
`;
  fs.appendFileSync(progressPath, learning);
  console.log('  Learnings appended');

  // Log iteration to iterations.jsonl
  const iterLog = {
    timestamp: new Date().toISOString(),
    iteration: iterationNum,
    task_completed: nextTask.id,
    status: 'completed_task'
  };
  fs.appendFileSync(
    path.join(LOG_DIR, 'iterations.jsonl'),
    JSON.stringify(iterLog) + '\n'
  );

  console.log(`\n*** ITERATION ${iterationNum} COMPLETE ***`);
  console.log('*** AI CONTEXT DIES HERE ***');
  console.log('*** Next iteration starts fresh ***');

  return { complete: false, taskDone: nextTask.id };
}

// The Ralph Loop (what ralph-cc.sh does)
function ralphLoop(maxIterations: number = 10) {
  console.log('\n' + '='.repeat(60));
  console.log('  RALPH LOOP DEMO');
  console.log('  Simulating ralph-cc.sh behavior');
  console.log('='.repeat(60));

  setup();

  for (let i = 1; i <= maxIterations; i++) {
    // Sleep between iterations (simulated)
    if (i > 1) {
      console.log('\n[ralph-cc.sh] Sleeping 2 seconds...\n');
    }

    // Spawn fresh AI instance (simulated)
    const result = simulateIteration(i);

    // Check for completion signal
    if (result.complete) {
      console.log('\n' + '='.repeat(60));
      console.log('  RALPH LOOP COMPLETE!');
      console.log(`  Total iterations: ${i}`);
      console.log('='.repeat(60));

      // Show final state
      console.log('\n--- Final prd.json ---');
      const finalPrd = JSON.parse(fs.readFileSync(path.join(DEMO_DIR, 'prd.json'), 'utf-8'));
      for (const story of finalPrd.userStories) {
        console.log(`  ${story.id}: passes=${story.passes} - ${story.title}`);
      }

      console.log('\n--- Logs created ---');
      console.log(`  ${LOG_DIR}/actions.jsonl`);
      console.log(`  ${LOG_DIR}/iterations.jsonl`);

      return;
    }
  }

  console.log(`\nMax iterations (${maxIterations}) reached!`);
}

// Run the demo
console.log(`
╔══════════════════════════════════════════════════════════════╗
║                   RALPH LOOP DEMO                            ║
║                                                              ║
║  This shows exactly how Ralph works:                         ║
║  1. Bash script loops                                        ║
║  2. Each iteration = fresh AI with NO memory                 ║
║  3. AI reads prd.json to find next task                      ║
║  4. AI does ONE task                                         ║
║  5. AI updates prd.json (passes: true)                       ║
║  6. AI appends learnings to progress.txt                     ║
║  7. Context dies, loop continues                             ║
║  8. When all done, AI outputs <promise>COMPLETE</promise>    ║
╚══════════════════════════════════════════════════════════════╝
`);

ralphLoop(10);
