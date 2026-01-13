/**
 * Observability Logger - Full SDLC logging for browser agent
 * Logs to JSON Lines format for easy parsing and dashboard display
 */

import * as fs from 'fs';
import * as path from 'path';

const LOG_DIR = path.join(process.cwd(), 'logs');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  action: string;
  details?: Record<string, unknown>;
  duration_ms?: number;
  success?: boolean;
  screenshot?: string;
}

export interface ActionLog {
  timestamp: string;
  action_type: 'navigate' | 'click' | 'type' | 'extract' | 'screenshot' | 'custom';
  target?: string;
  value?: string;
  duration_ms: number;
  success: boolean;
  error?: string;
  url?: string;
}

export interface PriceLog {
  timestamp: string;
  plan: string;
  price: string;
  credits: string;
  currency: string;
  source_url: string;
}

function getLogPath(filename: string): string {
  return path.join(LOG_DIR, filename);
}

function appendToLog(filename: string, entry: object): void {
  const logPath = getLogPath(filename);
  const line = JSON.stringify(entry) + '\n';
  fs.appendFileSync(logPath, line);
}

export function logAction(action: ActionLog): void {
  appendToLog('actions.jsonl', action);

  // Also log to console for visibility
  const status = action.success ? '✓' : '✗';
  console.log(`[${action.timestamp}] ${status} ${action.action_type}: ${action.target || ''} (${action.duration_ms}ms)`);
}

export function logPrice(price: PriceLog): void {
  appendToLog('prices.jsonl', price);
  console.log(`[PRICE] ${price.plan}: ${price.price} (${price.credits} credits)`);
}

export function logInfo(action: string, details?: Record<string, unknown>): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level: 'info',
    action,
    details
  };
  appendToLog('agent.jsonl', entry);
  console.log(`[INFO] ${action}`);
}

export function logError(action: string, error: Error | string, details?: Record<string, unknown>): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level: 'error',
    action,
    details: {
      ...details,
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined
    },
    success: false
  };
  appendToLog('agent.jsonl', entry);
  console.error(`[ERROR] ${action}: ${error instanceof Error ? error.message : error}`);
}

export function logDebug(action: string, details?: Record<string, unknown>): void {
  if (process.env.DEBUG) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'debug',
      action,
      details
    };
    appendToLog('agent.jsonl', entry);
    console.log(`[DEBUG] ${action}`);
  }
}

// Timer utility for measuring durations
export function createTimer(): { elapsed: () => number } {
  const start = Date.now();
  return {
    elapsed: () => Date.now() - start
  };
}

// Read logs for dashboard
export function readLogs(filename: string, limit = 100): object[] {
  const logPath = getLogPath(filename);
  if (!fs.existsSync(logPath)) {
    return [];
  }

  const content = fs.readFileSync(logPath, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);
  const entries = lines.slice(-limit).map(line => {
    try {
      return JSON.parse(line);
    } catch {
      return { raw: line };
    }
  });

  return entries;
}

export default {
  logAction,
  logPrice,
  logInfo,
  logError,
  logDebug,
  createTimer,
  readLogs
};
