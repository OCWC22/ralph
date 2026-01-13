/**
 * Core Browser Agent using Stagehand
 * Provides browser automation with AI-powered navigation
 */

import { Stagehand } from '@browserbasehq/stagehand';
import { z } from 'zod';
import { logAction, logInfo, logError, createTimer } from './logger.js';

export interface AgentConfig {
  headless?: boolean;
  modelName?: string;
  apiKey?: string;
}

export class BrowserAgent {
  private stagehand: Stagehand | null = null;
  private config: AgentConfig;

  constructor(config: AgentConfig = {}) {
    this.config = {
      headless: config.headless ?? false, // Show browser by default for debugging
      modelName: config.modelName ?? 'claude-sonnet-4-20250514',
      apiKey: config.apiKey ?? process.env.ANTHROPIC_API_KEY
    };
  }

  async init(): Promise<void> {
    logInfo('Initializing Stagehand browser agent');
    const timer = createTimer();

    try {
      this.stagehand = new Stagehand({
        env: 'LOCAL', // Use local browser, not cloud
        modelName: this.config.modelName as "claude-sonnet-4-20250514",
        modelClientOptions: {
          apiKey: this.config.apiKey
        },
        headless: this.config.headless
      });

      await this.stagehand.init();

      logAction({
        timestamp: new Date().toISOString(),
        action_type: 'custom',
        target: 'stagehand_init',
        duration_ms: timer.elapsed(),
        success: true
      });

      logInfo('Stagehand initialized successfully', { duration_ms: timer.elapsed() });
    } catch (error) {
      logError('Failed to initialize Stagehand', error as Error);
      throw error;
    }
  }

  async navigate(url: string): Promise<void> {
    if (!this.stagehand) throw new Error('Agent not initialized');

    const timer = createTimer();
    logInfo(`Navigating to ${url}`);

    try {
      const page = this.stagehand.page;
      await page.goto(url, { waitUntil: 'domcontentloaded' });

      logAction({
        timestamp: new Date().toISOString(),
        action_type: 'navigate',
        target: url,
        url,
        duration_ms: timer.elapsed(),
        success: true
      });
    } catch (error) {
      logAction({
        timestamp: new Date().toISOString(),
        action_type: 'navigate',
        target: url,
        url,
        duration_ms: timer.elapsed(),
        success: false,
        error: (error as Error).message
      });
      throw error;
    }
  }

  async act(instruction: string): Promise<void> {
    if (!this.stagehand) throw new Error('Agent not initialized');

    const timer = createTimer();
    logInfo(`Acting: ${instruction}`);

    try {
      await this.stagehand.act(instruction);

      logAction({
        timestamp: new Date().toISOString(),
        action_type: 'click',
        target: instruction,
        duration_ms: timer.elapsed(),
        success: true
      });
    } catch (error) {
      logAction({
        timestamp: new Date().toISOString(),
        action_type: 'click',
        target: instruction,
        duration_ms: timer.elapsed(),
        success: false,
        error: (error as Error).message
      });
      throw error;
    }
  }

  async extract<T>(instruction: string, schema: z.ZodType<T>): Promise<T> {
    if (!this.stagehand) throw new Error('Agent not initialized');

    const timer = createTimer();
    logInfo(`Extracting: ${instruction}`);

    try {
      const result = await this.stagehand.extract({
        instruction,
        schema
      });

      logAction({
        timestamp: new Date().toISOString(),
        action_type: 'extract',
        target: instruction,
        value: JSON.stringify(result),
        duration_ms: timer.elapsed(),
        success: true
      });

      return result;
    } catch (error) {
      logAction({
        timestamp: new Date().toISOString(),
        action_type: 'extract',
        target: instruction,
        duration_ms: timer.elapsed(),
        success: false,
        error: (error as Error).message
      });
      throw error;
    }
  }

  async observe(instruction: string): Promise<{ selector: string; description: string }[]> {
    if (!this.stagehand) throw new Error('Agent not initialized');

    const timer = createTimer();
    logInfo(`Observing: ${instruction}`);

    try {
      const result = await this.stagehand.observe({ instruction });

      logAction({
        timestamp: new Date().toISOString(),
        action_type: 'custom',
        target: `observe: ${instruction}`,
        value: JSON.stringify(result),
        duration_ms: timer.elapsed(),
        success: true
      });

      return result;
    } catch (error) {
      logAction({
        timestamp: new Date().toISOString(),
        action_type: 'custom',
        target: `observe: ${instruction}`,
        duration_ms: timer.elapsed(),
        success: false,
        error: (error as Error).message
      });
      throw error;
    }
  }

  async screenshot(name?: string): Promise<string> {
    if (!this.stagehand) throw new Error('Agent not initialized');

    const timer = createTimer();
    const filename = `screenshot_${name || Date.now()}.png`;
    const filepath = `logs/${filename}`;

    try {
      const page = this.stagehand.page;
      await page.screenshot({ path: filepath, fullPage: true });

      logAction({
        timestamp: new Date().toISOString(),
        action_type: 'screenshot',
        target: filepath,
        duration_ms: timer.elapsed(),
        success: true
      });

      return filepath;
    } catch (error) {
      logError('Screenshot failed', error as Error);
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.stagehand) {
      await this.stagehand.close();
      logInfo('Browser agent closed');
    }
  }

  // Get raw page for advanced operations
  get page() {
    if (!this.stagehand) throw new Error('Agent not initialized');
    return this.stagehand.page;
  }
}

// CLI interface for running agent commands
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log('Usage: npx tsx src/agent.ts <command>');
    console.log('Commands:');
    console.log('  navigate <url>     - Navigate to a URL');
    console.log('  act "<instruction>" - Perform an action');
    console.log('  screenshot         - Take a screenshot');
    process.exit(1);
  }

  const agent = new BrowserAgent({ headless: false });

  try {
    await agent.init();

    switch (command) {
      case 'navigate':
        await agent.navigate(args[1] || 'https://klingai.com');
        await agent.screenshot('after_navigate');
        break;

      case 'act':
        await agent.navigate(args[2] || 'https://klingai.com');
        await agent.act(args[1]);
        await agent.screenshot('after_act');
        break;

      case 'screenshot':
        await agent.navigate(args[1] || 'https://klingai.com');
        await agent.screenshot('manual');
        break;

      default:
        console.log(`Unknown command: ${command}`);
    }

    // Keep browser open for inspection
    console.log('Press Ctrl+C to close...');
    await new Promise(() => {}); // Keep alive
  } catch (error) {
    logError('Agent command failed', error as Error);
    process.exit(1);
  }
}

// Run if executed directly
main().catch(console.error);

export default BrowserAgent;
