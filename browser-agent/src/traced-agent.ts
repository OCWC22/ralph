/**
 * TRACED AGENT - Browser agent with automatic data collection
 *
 * Wraps Stagehand to capture every action for training data.
 * Use this instead of agent.ts when you want to collect traces.
 */

import { Stagehand } from '@browserbasehq/stagehand';
import { z } from 'zod';
import TraceCollector from './trace-collector.js';

export class TracedAgent {
  private stagehand: Stagehand | null = null;
  private collector: TraceCollector;
  private sessionId: string | null = null;

  constructor() {
    this.collector = new TraceCollector();
  }

  async init(task: string, startUrl: string) {
    // Initialize Stagehand
    this.stagehand = new Stagehand({
      env: 'LOCAL',
      modelName: 'claude-sonnet-4-20250514',
      modelClientOptions: {
        apiKey: process.env.ANTHROPIC_API_KEY
      },
      headless: false
    });

    await this.stagehand.init();

    // Start trace session
    this.sessionId = this.collector.startSession(task, startUrl);

    // Navigate to start URL (first traced action)
    await this.navigate(startUrl);

    return this.sessionId;
  }

  get page() {
    if (!this.stagehand) throw new Error('Not initialized');
    return this.stagehand.page;
  }

  // === TRACED ACTIONS ===

  async navigate(url: string): Promise<void> {
    const page = this.page;

    await this.collector.recordAction(
      page,
      'navigate',
      `Navigate to ${url}`,
      async () => {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
      }
    );
  }

  async act(instruction: string): Promise<void> {
    if (!this.stagehand) throw new Error('Not initialized');
    const page = this.page;

    await this.collector.recordAction(
      page,
      'click',
      instruction,
      async () => {
        await this.stagehand!.act(instruction);
      }
    );
  }

  async extract<T>(instruction: string, schema: z.ZodType<T>): Promise<T> {
    if (!this.stagehand) throw new Error('Not initialized');
    const page = this.page;

    const { result } = await this.collector.recordAction(
      page,
      'extract',
      instruction,
      async () => {
        return await this.stagehand!.extract({ instruction, schema });
      }
    );

    return result;
  }

  async observe(instruction: string): Promise<{ selector: string; description: string }[]> {
    if (!this.stagehand) throw new Error('Not initialized');
    const page = this.page;

    const { result } = await this.collector.recordAction(
      page,
      'observe',
      instruction,
      async () => {
        return await this.stagehand!.observe({ instruction });
      }
    );

    return result;
  }

  async type(instruction: string, text: string): Promise<void> {
    if (!this.stagehand) throw new Error('Not initialized');
    const page = this.page;

    await this.collector.recordAction(
      page,
      'type',
      `${instruction}: "${text}"`,
      async () => {
        await this.stagehand!.act(`Type "${text}" ${instruction}`);
      }
    );
  }

  async scroll(direction: 'up' | 'down'): Promise<void> {
    const page = this.page;

    await this.collector.recordAction(
      page,
      'scroll',
      `Scroll ${direction}`,
      async () => {
        await page.evaluate((dir: string) => {
          window.scrollBy(0, dir === 'down' ? 500 : -500);
        }, direction);
      }
    );
  }

  // === SESSION MANAGEMENT ===

  async endSession(
    success: boolean,
    humanRating?: number,
    humanFeedback?: string
  ) {
    if (!this.stagehand) throw new Error('Not initialized');

    const session = await this.collector.endSession(
      this.page,
      success,
      humanRating,
      humanFeedback
    );

    return session;
  }

  async close() {
    if (this.stagehand) {
      await this.stagehand.close();
    }
  }

  // Get current stats
  static getStats() {
    return TraceCollector.getStats();
  }
}

// === DEMO: Collect traces from Higgsfield ===

async function demo() {
  console.log('\n========================================');
  console.log('  TRACED AGENT DEMO');
  console.log('  Collecting training data from Higgsfield');
  console.log('========================================\n');

  const agent = new TracedAgent();

  try {
    // Start session
    await agent.init(
      'Extract pricing information from Higgsfield AI',
      'https://higgsfield.ai'
    );

    // Perform actions (each is traced)
    console.log('\n--- Navigating to pricing ---');
    await agent.act('Click on Pricing link in the navigation');

    console.log('\n--- Extracting pricing data ---');
    const pricing = await agent.extract(
      'Extract all pricing plans with name, price, and features',
      z.object({
        plans: z.array(z.object({
          name: z.string(),
          price: z.string(),
          features: z.array(z.string())
        }))
      })
    );

    console.log('\nExtracted pricing:', JSON.stringify(pricing, null, 2));

    // End session with success
    const session = await agent.endSession(
      true,        // success
      5,           // human rating (1-5)
      'Successfully extracted pricing data'  // feedback
    );

    console.log(`\nSession ${session.id} complete!`);
    console.log(`Actions recorded: ${session.actions.length}`);

  } catch (error) {
    console.error('Demo failed:', error);

    // End session with failure
    await agent.endSession(false, 1, `Failed: ${(error as Error).message}`);

  } finally {
    await agent.close();
  }

  // Show stats
  const stats = TracedAgent.getStats();
  console.log('\n=== Training Data Stats ===');
  console.log(`Session traces: ${stats.traces}`);
  console.log(`SFT examples: ${stats.sftExamples}`);
  console.log(`Preference pairs: ${stats.preferencePairs}`);
}

// Run demo if called directly
if (process.argv[1].includes('traced-agent')) {
  demo().catch(console.error);
}

export default TracedAgent;
