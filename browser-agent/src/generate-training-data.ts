/**
 * TRAINING DATA GENERATOR
 *
 * This is the ONLY script that uses Claude (expensive).
 * Purpose: Generate high-quality traces to train your own model.
 *
 * Workflow:
 * 1. Define tasks you want your model to learn
 * 2. Run this with Claude to generate gold traces
 * 3. Export to training format
 * 4. Fine-tune your local model
 * 5. Never pay for Claude again (for these tasks)
 */

import TracedAgent from './traced-agent.js';
import TraceCollector from './trace-collector.js';
import { z } from 'zod';

// === TASK DEFINITIONS ===
// Define what you want your model to learn

interface Task {
  id: string;
  description: string;
  startUrl: string;
  steps: string[];  // High-level steps (AI will figure out details)
  extractSchema?: z.ZodType<any>;  // What to extract at the end
}

const TRAINING_TASKS: Task[] = [
  {
    id: 'pricing-extraction',
    description: 'Navigate to pricing page and extract all plan details',
    startUrl: 'https://higgsfield.ai',
    steps: [
      'Find and click the Pricing link',
      'Wait for pricing page to load',
      'Extract all pricing plans with names, prices, and features'
    ],
    extractSchema: z.object({
      plans: z.array(z.object({
        name: z.string(),
        price: z.string(),
        features: z.array(z.string())
      }))
    })
  },
  {
    id: 'signup-flow',
    description: 'Navigate through signup flow without submitting',
    startUrl: 'https://higgsfield.ai',
    steps: [
      'Find and click Sign Up or Get Started button',
      'Observe the signup form fields',
      'Identify required fields and validation'
    ]
  },
  {
    id: 'feature-exploration',
    description: 'Explore product features and capabilities',
    startUrl: 'https://higgsfield.ai',
    steps: [
      'Find the main product/features section',
      'List all major features',
      'Click on each feature to get details'
    ]
  },
  {
    id: 'video-generation-ui',
    description: 'Navigate to video generation interface',
    startUrl: 'https://higgsfield.ai',
    steps: [
      'Find the video generation or create section',
      'Identify all input fields and options',
      'Observe available presets and settings'
    ]
  }
];

// === DATA GENERATOR ===

async function generateTrainingData(tasks: Task[], runsPerTask: number = 3) {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║         TRAINING DATA GENERATOR                              ║');
  console.log('║                                                               ║');
  console.log('║  Using Claude to generate high-quality traces.               ║');
  console.log('║  These traces will train YOUR model.                         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const startStats = TraceCollector.getStats();
  console.log(`Starting with: ${startStats.sftExamples} SFT examples\n`);

  let successCount = 0;
  let failCount = 0;

  for (const task of tasks) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`TASK: ${task.id}`);
    console.log(`${task.description}`);
    console.log(`${'═'.repeat(60)}`);

    for (let run = 1; run <= runsPerTask; run++) {
      console.log(`\n--- Run ${run}/${runsPerTask} ---`);

      const agent = new TracedAgent();

      try {
        await agent.init(task.description, task.startUrl);

        // Execute each step
        for (const step of task.steps) {
          console.log(`\n> ${step}`);

          if (step.toLowerCase().includes('extract') && task.extractSchema) {
            const result = await agent.extract(step, task.extractSchema);
            console.log('Extracted:', JSON.stringify(result, null, 2));
          } else if (step.toLowerCase().includes('observe') || step.toLowerCase().includes('identify') || step.toLowerCase().includes('list')) {
            const result = await agent.observe(step);
            console.log(`Observed ${result?.length || 0} elements`);
          } else {
            await agent.act(step);
          }

          // Small delay between steps
          await new Promise(r => setTimeout(r, 1000));
        }

        // Rate this run (auto-rate based on completion)
        await agent.endSession(true, 5, 'Completed all steps successfully');
        successCount++;
        console.log('✅ Run completed successfully');

      } catch (error) {
        console.error('❌ Run failed:', (error as Error).message);
        await agent.endSession(false, 1, `Failed: ${(error as Error).message}`);
        failCount++;
      } finally {
        await agent.close();
      }

      // Delay between runs to avoid rate limits
      if (run < runsPerTask) {
        console.log('Waiting 5s before next run...');
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  }

  // Final stats
  const endStats = TraceCollector.getStats();
  const newExamples = endStats.sftExamples - startStats.sftExamples;

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                     GENERATION COMPLETE                      ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Tasks run: ${tasks.length * runsPerTask}`);
  console.log(`║  Successful: ${successCount}`);
  console.log(`║  Failed: ${failCount}`);
  console.log(`║  New SFT examples: ${newExamples}`);
  console.log(`║  Total SFT examples: ${endStats.sftExamples}`);
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log('║  Next steps:                                                 ║');
  console.log('║  1. npx tsx src/trace-collector.ts export ./dataset          ║');
  console.log('║  2. Fine-tune your model on ./dataset/train.json             ║');
  console.log('║  3. Use local-model-agent.ts with your model                 ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
}

// === INCREMENTAL TRAINING ===
// Continue collecting data as your model runs

async function collectFromLocalModel(
  localModelEndpoint: string,
  task: Task
) {
  // Run task with local model
  // If it fails, run with Claude and add to training data
  // This creates a self-improving loop
}

// === CLI ===

async function main() {
  const command = process.argv[2];

  switch (command) {
    case 'generate':
      const runs = parseInt(process.argv[3]) || 1;
      await generateTrainingData(TRAINING_TASKS, runs);
      break;

    case 'single':
      const taskId = process.argv[3];
      const task = TRAINING_TASKS.find(t => t.id === taskId);
      if (task) {
        await generateTrainingData([task], 1);
      } else {
        console.log('Available tasks:', TRAINING_TASKS.map(t => t.id).join(', '));
      }
      break;

    case 'list':
      console.log('\nAvailable training tasks:');
      TRAINING_TASKS.forEach(t => {
        console.log(`\n  ${t.id}:`);
        console.log(`    ${t.description}`);
        console.log(`    Steps: ${t.steps.length}`);
      });
      break;

    default:
      console.log('Usage:');
      console.log('  npx tsx src/generate-training-data.ts list              - List available tasks');
      console.log('  npx tsx src/generate-training-data.ts single <task-id>  - Run one task');
      console.log('  npx tsx src/generate-training-data.ts generate [runs]   - Generate data (default 1 run per task)');
  }
}

main().catch(console.error);

export { TRAINING_TASKS, generateTrainingData };
