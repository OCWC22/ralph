/**
 * LOCAL MODEL AGENT
 *
 * Use Stagehand with YOUR OWN local model via Ollama/vLLM
 *
 * Benefits:
 * - $0 cost (runs on your GPU)
 * - No rate limits
 * - No censorship
 * - No data sent to cloud
 * - Full privacy
 *
 * Requirements:
 * - Ollama running locally: ollama serve
 * - A model pulled: ollama pull mistral (or your fine-tuned model)
 */

import { Stagehand } from '@browserbasehq/stagehand';
import { z } from 'zod';
import TraceCollector from './trace-collector.js';

// === CONFIGURATION ===

interface LocalModelConfig {
  provider: 'ollama' | 'vllm' | 'llamacpp' | 'openai-compatible';
  baseURL: string;
  model: string;
  collectTraces?: boolean;  // Still collect traces for continued training
}

const OLLAMA_CONFIG: LocalModelConfig = {
  provider: 'ollama',
  baseURL: 'http://localhost:11434/v1',
  model: 'mistral',  // or your fine-tuned model
  collectTraces: true
};

const VLLM_CONFIG: LocalModelConfig = {
  provider: 'vllm',
  baseURL: 'http://localhost:8000/v1',
  model: 'mistralai/Mistral-7B-Instruct-v0.2',
  collectTraces: true
};

// === LOCAL MODEL AGENT ===

export class LocalModelAgent {
  private stagehand: Stagehand | null = null;
  private config: LocalModelConfig;
  private collector: TraceCollector | null = null;

  constructor(config: LocalModelConfig = OLLAMA_CONFIG) {
    this.config = config;
    if (config.collectTraces) {
      this.collector = new TraceCollector();
    }
  }

  async init(task?: string, startUrl?: string) {
    console.log(`\n[LOCAL] Connecting to ${this.config.provider} at ${this.config.baseURL}`);
    console.log(`[LOCAL] Using model: ${this.config.model}`);

    // Stagehand with local model
    this.stagehand = new Stagehand({
      env: 'LOCAL',
      // Use OpenAI-compatible endpoint (Ollama/vLLM expose this)
      modelName: 'gpt-4o' as any,  // Stagehand expects this, but we override the client
      modelClientOptions: {
        baseURL: this.config.baseURL,
        apiKey: 'not-needed-for-local',  // Ollama doesn't need API key
      },
      headless: false
    });

    await this.stagehand.init();

    // Start trace collection if enabled
    if (this.collector && task && startUrl) {
      this.collector.startSession(task, startUrl, `local:${this.config.model}`);
    }

    console.log('[LOCAL] Agent initialized');
  }

  get page() {
    if (!this.stagehand) throw new Error('Not initialized');
    return this.stagehand.page;
  }

  // === ACTIONS (with optional tracing) ===

  async navigate(url: string): Promise<void> {
    const page = this.page;

    if (this.collector) {
      await this.collector.recordAction(page, 'navigate', `Navigate to ${url}`, async () => {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
      });
    } else {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
    }
  }

  async act(instruction: string): Promise<void> {
    if (!this.stagehand) throw new Error('Not initialized');

    if (this.collector) {
      await this.collector.recordAction(this.page, 'click', instruction, async () => {
        await this.stagehand!.act(instruction);
      });
    } else {
      await this.stagehand.act(instruction);
    }
  }

  async extract<T>(instruction: string, schema: z.ZodType<T>): Promise<T> {
    if (!this.stagehand) throw new Error('Not initialized');

    if (this.collector) {
      const { result } = await this.collector.recordAction(this.page, 'extract', instruction, async () => {
        return await this.stagehand!.extract({ instruction, schema });
      });
      return result;
    } else {
      return await this.stagehand.extract({ instruction, schema });
    }
  }

  async observe(instruction: string) {
    if (!this.stagehand) throw new Error('Not initialized');

    if (this.collector) {
      const { result } = await this.collector.recordAction(this.page, 'observe', instruction, async () => {
        return await this.stagehand!.observe({ instruction });
      });
      return result;
    } else {
      return await this.stagehand.observe({ instruction });
    }
  }

  async endSession(success: boolean) {
    if (this.collector) {
      return await this.collector.endSession(this.page, success);
    }
  }

  async close() {
    if (this.stagehand) {
      await this.stagehand.close();
    }
  }
}

// === HYBRID AGENT: Claude for hard tasks, Local for easy ===

export class HybridAgent {
  private localAgent: LocalModelAgent;
  private claudeAgent: Stagehand | null = null;
  private useClaudeThreshold: number;

  constructor(config: LocalModelConfig, claudeThreshold = 0.7) {
    this.localAgent = new LocalModelAgent(config);
    this.useClaudeThreshold = claudeThreshold;
  }

  // Route to Claude for complex tasks, local for simple ones
  async act(instruction: string, complexity: 'simple' | 'complex' = 'simple') {
    if (complexity === 'complex') {
      console.log('[HYBRID] Routing to Claude (complex task)');
      // Use Claude for this one action, collect trace
      // Then continue with local model
    } else {
      console.log('[HYBRID] Using local model');
      await this.localAgent.act(instruction);
    }
  }
}

// === CLI: Test local model connection ===

async function testLocalModel() {
  console.log('\n========================================');
  console.log('  LOCAL MODEL TEST');
  console.log('========================================\n');

  // Check if Ollama is running
  try {
    const response = await fetch('http://localhost:11434/api/tags');
    const data = await response.json();
    console.log('Ollama models available:');
    data.models?.forEach((m: any) => console.log(`  - ${m.name}`));
  } catch (e) {
    console.log('Ollama not running. Start with: ollama serve');
    console.log('Then pull a model: ollama pull mistral');
    return;
  }

  // Test with Stagehand
  const agent = new LocalModelAgent({
    provider: 'ollama',
    baseURL: 'http://localhost:11434/v1',
    model: 'mistral',
    collectTraces: true
  });

  try {
    await agent.init('Test local model navigation', 'https://example.com');
    await agent.navigate('https://example.com');

    console.log('\n[TEST] Observing page...');
    const elements = await agent.observe('Find all links on the page');
    console.log('Found elements:', elements?.length || 0);

    await agent.endSession(true);
    console.log('\n[TEST] Success! Local model works with Stagehand.');

  } catch (error) {
    console.error('[TEST] Failed:', error);
  } finally {
    await agent.close();
  }
}

// Run test
if (process.argv[1].includes('local-model-agent')) {
  testLocalModel().catch(console.error);
}

export default LocalModelAgent;
