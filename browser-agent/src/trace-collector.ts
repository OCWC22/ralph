/**
 * TRACE COLLECTOR - Generate SFT/RLHF Training Data
 *
 * Captures EVERYTHING for training your own models:
 * - Full prompts and responses
 * - DOM snapshots before/after actions
 * - Screenshots at each step
 * - Action sequences with timing
 * - Success/failure labels for reward modeling
 *
 * Output formats:
 * - traces.jsonl: Raw traces for analysis
 * - sft_data.jsonl: Input/output pairs for supervised fine-tuning
 * - preference_pairs.jsonl: Good/bad pairs for RLHF/DPO
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const DATA_DIR = path.join(process.cwd(), 'training-data');
const TRACES_FILE = path.join(DATA_DIR, 'traces.jsonl');
const SFT_FILE = path.join(DATA_DIR, 'sft_data.jsonl');
const PREFERENCE_FILE = path.join(DATA_DIR, 'preference_pairs.jsonl');
const SCREENSHOTS_DIR = path.join(DATA_DIR, 'screenshots');

// Ensure directories exist
[DATA_DIR, SCREENSHOTS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// === TYPES ===

export interface DOMSnapshot {
  url: string;
  title: string;
  html: string;  // Cleaned/truncated HTML
  text: string;  // Visible text content
  interactiveElements: InteractiveElement[];
  timestamp: string;
}

export interface InteractiveElement {
  selector: string;
  tag: string;
  text: string;
  attributes: Record<string, string>;
  boundingBox?: { x: number; y: number; width: number; height: number };
}

export interface ActionTrace {
  id: string;
  type: 'navigate' | 'click' | 'type' | 'extract' | 'observe' | 'screenshot' | 'scroll';
  instruction: string;  // Natural language instruction given to AI
  selector?: string;    // CSS selector used
  value?: string;       // Value typed or extracted

  // State before action
  beforeDOM: DOMSnapshot;
  beforeScreenshot: string;  // Path to screenshot

  // State after action
  afterDOM: DOMSnapshot;
  afterScreenshot: string;

  // Metadata
  duration_ms: number;
  success: boolean;
  error?: string;
  timestamp: string;
}

export interface SessionTrace {
  id: string;
  task: string;  // High-level task description
  startUrl: string;
  actions: ActionTrace[];

  // Outcome
  success: boolean;
  finalState: DOMSnapshot;

  // For RLHF
  humanRating?: number;  // 1-5 rating
  humanFeedback?: string;

  // Metadata
  model: string;
  totalDuration_ms: number;
  tokenCount?: { input: number; output: number };
  timestamp: string;
}

export interface SFTExample {
  id: string;
  instruction: string;  // What to do
  input: string;        // Current state (DOM, context)
  output: string;       // Action taken
  metadata: {
    success: boolean;
    source_trace_id: string;
    action_index: number;
  };
}

export interface PreferencePair {
  id: string;
  instruction: string;
  input: string;
  chosen: string;      // Better response
  rejected: string;    // Worse response
  metadata: {
    chosen_trace_id: string;
    rejected_trace_id: string;
    reason: string;
  };
}

// === TRACE COLLECTOR CLASS ===

export class TraceCollector {
  private currentSession: SessionTrace | null = null;
  private actionBuffer: ActionTrace[] = [];

  generateId(): string {
    return crypto.randomBytes(8).toString('hex');
  }

  // Start a new trace session
  startSession(task: string, startUrl: string, model: string = 'claude-sonnet'): string {
    const sessionId = this.generateId();

    this.currentSession = {
      id: sessionId,
      task,
      startUrl,
      actions: [],
      success: false,
      finalState: null as any,
      model,
      totalDuration_ms: 0,
      timestamp: new Date().toISOString()
    };

    console.log(`[TRACE] Started session ${sessionId}: ${task}`);
    return sessionId;
  }

  // Capture DOM state
  async captureDOMSnapshot(page: any): Promise<DOMSnapshot> {
    const url = page.url();
    const title = await page.title();

    // Get cleaned HTML (remove scripts, styles, limit size)
    const html = await page.evaluate(() => {
      const clone = document.documentElement.cloneNode(true) as HTMLElement;

      // Remove noise
      clone.querySelectorAll('script, style, noscript, svg, path').forEach(el => el.remove());

      // Truncate long attributes
      clone.querySelectorAll('*').forEach(el => {
        Array.from(el.attributes).forEach(attr => {
          if (attr.value.length > 200) {
            el.setAttribute(attr.name, attr.value.slice(0, 200) + '...');
          }
        });
      });

      return clone.outerHTML.slice(0, 50000);  // Max 50KB
    });

    // Get visible text
    const text = await page.evaluate(() => {
      return document.body.innerText.slice(0, 10000);
    });

    // Get interactive elements
    const interactiveElements = await page.evaluate(() => {
      const elements: any[] = [];
      const selectors = 'a, button, input, select, textarea, [role="button"], [onclick]';

      document.querySelectorAll(selectors).forEach((el, i) => {
        if (i > 100) return;  // Limit to 100 elements

        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        elements.push({
          selector: el.tagName.toLowerCase() +
            (el.id ? `#${el.id}` : '') +
            (el.className ? `.${el.className.toString().split(' ')[0]}` : ''),
          tag: el.tagName.toLowerCase(),
          text: (el.textContent || '').slice(0, 100).trim(),
          attributes: {
            id: el.id || '',
            class: el.className?.toString() || '',
            href: (el as HTMLAnchorElement).href || '',
            type: (el as HTMLInputElement).type || '',
            placeholder: (el as HTMLInputElement).placeholder || ''
          },
          boundingBox: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height
          }
        });
      });

      return elements;
    });

    return {
      url,
      title,
      html,
      text,
      interactiveElements,
      timestamp: new Date().toISOString()
    };
  }

  // Capture screenshot and return path
  async captureScreenshot(page: any, name: string): Promise<string> {
    const filename = `${this.currentSession?.id || 'unknown'}_${name}_${Date.now()}.png`;
    const filepath = path.join(SCREENSHOTS_DIR, filename);

    await page.screenshot({ path: filepath, fullPage: false });

    return filepath;
  }

  // Record an action with before/after state
  async recordAction(
    page: any,
    type: ActionTrace['type'],
    instruction: string,
    execute: () => Promise<any>
  ): Promise<{ result: any; trace: ActionTrace }> {
    if (!this.currentSession) {
      throw new Error('No active session. Call startSession first.');
    }

    const actionId = this.generateId();
    const startTime = Date.now();

    // Capture BEFORE state
    const beforeDOM = await this.captureDOMSnapshot(page);
    const beforeScreenshot = await this.captureScreenshot(page, `${actionId}_before`);

    let success = true;
    let error: string | undefined;
    let result: any;

    try {
      result = await execute();
    } catch (e) {
      success = false;
      error = (e as Error).message;
    }

    // Small delay to let page settle
    await new Promise(r => setTimeout(r, 500));

    // Capture AFTER state
    const afterDOM = await this.captureDOMSnapshot(page);
    const afterScreenshot = await this.captureScreenshot(page, `${actionId}_after`);

    const trace: ActionTrace = {
      id: actionId,
      type,
      instruction,
      beforeDOM,
      beforeScreenshot,
      afterDOM,
      afterScreenshot,
      duration_ms: Date.now() - startTime,
      success,
      error,
      timestamp: new Date().toISOString()
    };

    this.currentSession.actions.push(trace);
    this.actionBuffer.push(trace);

    // Log immediately
    this.appendTrace(trace);

    console.log(`[TRACE] Action ${type}: ${instruction.slice(0, 50)}... (${success ? '✓' : '✗'})`);

    return { result, trace };
  }

  // End session and finalize
  async endSession(page: any, success: boolean, humanRating?: number, humanFeedback?: string): Promise<SessionTrace> {
    if (!this.currentSession) {
      throw new Error('No active session');
    }

    this.currentSession.success = success;
    this.currentSession.finalState = await this.captureDOMSnapshot(page);
    this.currentSession.totalDuration_ms = Date.now() - new Date(this.currentSession.timestamp).getTime();
    this.currentSession.humanRating = humanRating;
    this.currentSession.humanFeedback = humanFeedback;

    // Save full session trace
    this.appendToFile(TRACES_FILE, this.currentSession);

    // Generate SFT examples from this session
    this.generateSFTExamples(this.currentSession);

    console.log(`[TRACE] Session ${this.currentSession.id} ended. Success: ${success}`);

    const session = this.currentSession;
    this.currentSession = null;
    this.actionBuffer = [];

    return session;
  }

  // === DATA EXPORT ===

  private appendTrace(trace: ActionTrace) {
    // Append raw trace
    const traceEntry = {
      type: 'action',
      ...trace
    };
    this.appendToFile(path.join(DATA_DIR, 'raw_actions.jsonl'), traceEntry);
  }

  private appendToFile(filepath: string, data: object) {
    fs.appendFileSync(filepath, JSON.stringify(data) + '\n');
  }

  // Generate SFT training examples from a session
  private generateSFTExamples(session: SessionTrace) {
    for (let i = 0; i < session.actions.length; i++) {
      const action = session.actions[i];

      // Create instruction-input-output format
      const example: SFTExample = {
        id: `sft_${session.id}_${i}`,
        instruction: session.task,
        input: this.formatStateForTraining(action.beforeDOM, session.actions.slice(0, i)),
        output: this.formatActionForTraining(action),
        metadata: {
          success: action.success,
          source_trace_id: session.id,
          action_index: i
        }
      };

      this.appendToFile(SFT_FILE, example);
    }
  }

  // Format DOM state as training input
  private formatStateForTraining(dom: DOMSnapshot, previousActions: ActionTrace[]): string {
    const parts = [
      `URL: ${dom.url}`,
      `Title: ${dom.title}`,
      '',
      'Visible Text (truncated):',
      dom.text.slice(0, 2000),
      '',
      'Interactive Elements:',
      ...dom.interactiveElements.slice(0, 30).map(el =>
        `- [${el.tag}] ${el.text.slice(0, 50)} (${el.selector})`
      ),
    ];

    if (previousActions.length > 0) {
      parts.push('', 'Previous Actions:');
      previousActions.slice(-5).forEach(a => {
        parts.push(`- ${a.type}: ${a.instruction.slice(0, 100)}`);
      });
    }

    return parts.join('\n');
  }

  // Format action as training output
  private formatActionForTraining(action: ActionTrace): string {
    const parts = [
      `ACTION: ${action.type}`,
      `INSTRUCTION: ${action.instruction}`,
    ];

    if (action.selector) {
      parts.push(`SELECTOR: ${action.selector}`);
    }
    if (action.value) {
      parts.push(`VALUE: ${action.value}`);
    }

    return parts.join('\n');
  }

  // === PREFERENCE DATA FOR RLHF ===

  // Compare two sessions and create preference pair
  static createPreferencePair(
    better: SessionTrace,
    worse: SessionTrace,
    reason: string
  ): PreferencePair {
    // Use first diverging action as the comparison point
    const pair: PreferencePair = {
      id: `pref_${crypto.randomBytes(4).toString('hex')}`,
      instruction: better.task,
      input: '', // Will be filled based on common starting point
      chosen: '',
      rejected: '',
      metadata: {
        chosen_trace_id: better.id,
        rejected_trace_id: worse.id,
        reason
      }
    };

    // Find first action where they differ
    const minLen = Math.min(better.actions.length, worse.actions.length);
    for (let i = 0; i < minLen; i++) {
      if (better.actions[i].instruction !== worse.actions[i].instruction) {
        // Use state before divergence as input
        const collector = new TraceCollector();
        pair.input = collector.formatStateForTraining(
          better.actions[i].beforeDOM,
          better.actions.slice(0, i)
        );
        pair.chosen = collector.formatActionForTraining(better.actions[i]);
        pair.rejected = collector.formatActionForTraining(worse.actions[i]);
        break;
      }
    }

    // Append to preference file
    fs.appendFileSync(PREFERENCE_FILE, JSON.stringify(pair) + '\n');

    return pair;
  }

  // === UTILITIES ===

  static getStats(): { traces: number; sftExamples: number; preferencePairs: number } {
    const countLines = (file: string) => {
      if (!fs.existsSync(file)) return 0;
      return fs.readFileSync(file, 'utf-8').trim().split('\n').filter(Boolean).length;
    };

    return {
      traces: countLines(TRACES_FILE),
      sftExamples: countLines(SFT_FILE),
      preferencePairs: countLines(PREFERENCE_FILE)
    };
  }

  static exportForHuggingFace(outputDir: string) {
    // Convert to HuggingFace datasets format
    const sftData = fs.readFileSync(SFT_FILE, 'utf-8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line));

    // Alpaca format
    const alpacaFormat = sftData.map(ex => ({
      instruction: ex.instruction,
      input: ex.input,
      output: ex.output
    }));

    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(
      path.join(outputDir, 'train.json'),
      JSON.stringify(alpacaFormat, null, 2)
    );

    console.log(`Exported ${alpacaFormat.length} examples to ${outputDir}/train.json`);
  }
}

// === CLI ===

async function main() {
  const command = process.argv[2];

  switch (command) {
    case 'stats':
      const stats = TraceCollector.getStats();
      console.log('\n=== Training Data Stats ===');
      console.log(`Session traces: ${stats.traces}`);
      console.log(`SFT examples: ${stats.sftExamples}`);
      console.log(`Preference pairs: ${stats.preferencePairs}`);
      console.log(`\nData location: ${DATA_DIR}`);
      break;

    case 'export':
      const outputDir = process.argv[3] || './export';
      TraceCollector.exportForHuggingFace(outputDir);
      break;

    default:
      console.log('Usage:');
      console.log('  npx tsx src/trace-collector.ts stats    - Show data stats');
      console.log('  npx tsx src/trace-collector.ts export   - Export to HuggingFace format');
  }
}

main().catch(console.error);

export default TraceCollector;
