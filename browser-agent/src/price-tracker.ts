/**
 * Price Tracker
 * Monitors Kling AI pricing and detects changes over time
 */

import * as fs from 'fs';
import * as path from 'path';
import BrowserAgent from './agent.js';
import KlingNavigator from './kling-navigator.js';
import { logInfo, logError, readLogs, type PriceLog } from './logger.js';

const PRICES_FILE = path.join(process.cwd(), 'logs', 'prices.jsonl');

interface PriceHistoryEntry {
  date: string;
  plans: {
    name: string;
    price: string;
    credits: string;
  }[];
}

export class PriceTracker {
  private agent: BrowserAgent;
  private navigator: KlingNavigator;

  constructor() {
    this.agent = new BrowserAgent({ headless: true }); // Headless for automated tracking
    this.navigator = new KlingNavigator(this.agent);
  }

  async init(): Promise<void> {
    await this.agent.init();
  }

  async trackPrices(): Promise<void> {
    logInfo('Starting price tracking');
    await this.navigator.extractPricing();
    logInfo('Price tracking complete');
  }

  async close(): Promise<void> {
    await this.agent.close();
  }

  // Analyze price history from logs
  static analyzePriceHistory(): void {
    const logs = readLogs('prices.jsonl', 1000) as PriceLog[];

    if (logs.length === 0) {
      console.log('No price history found');
      return;
    }

    // Group by date
    const byDate = new Map<string, PriceLog[]>();
    for (const log of logs) {
      const date = log.timestamp.split('T')[0];
      if (!byDate.has(date)) {
        byDate.set(date, []);
      }
      byDate.get(date)!.push(log);
    }

    console.log('\n=== PRICE HISTORY ===\n');

    // Show history by date
    for (const [date, prices] of byDate) {
      console.log(`${date}:`);
      const uniquePlans = new Map<string, PriceLog>();
      for (const p of prices) {
        uniquePlans.set(p.plan, p);
      }
      for (const [plan, data] of uniquePlans) {
        console.log(`  ${plan}: ${data.price} (${data.credits} credits)`);
      }
      console.log('');
    }

    // Detect changes
    const dates = Array.from(byDate.keys()).sort();
    if (dates.length > 1) {
      console.log('=== PRICE CHANGES ===\n');

      for (let i = 1; i < dates.length; i++) {
        const prevDate = dates[i - 1];
        const currDate = dates[i];
        const prevPrices = byDate.get(prevDate)!;
        const currPrices = byDate.get(currDate)!;

        const prevByPlan = new Map(prevPrices.map(p => [p.plan, p]));
        const currByPlan = new Map(currPrices.map(p => [p.plan, p]));

        for (const [plan, curr] of currByPlan) {
          const prev = prevByPlan.get(plan);
          if (prev && prev.price !== curr.price) {
            console.log(`${currDate}: ${plan} changed from ${prev.price} to ${curr.price}`);
          }
        }
      }
    }
  }

  // Export price history to JSON for dashboard
  static exportForDashboard(): object {
    const logs = readLogs('prices.jsonl', 1000) as PriceLog[];

    const data = {
      lastUpdated: new Date().toISOString(),
      totalEntries: logs.length,
      latestPrices: [] as { plan: string; price: string; credits: string }[],
      history: [] as { date: string; plan: string; price: string }[]
    };

    // Get latest prices (most recent entry for each plan)
    const latestByPlan = new Map<string, PriceLog>();
    for (const log of logs) {
      latestByPlan.set(log.plan, log);
    }
    data.latestPrices = Array.from(latestByPlan.values()).map(p => ({
      plan: p.plan,
      price: p.price,
      credits: p.credits
    }));

    // Build history for chart
    data.history = logs.map(log => ({
      date: log.timestamp.split('T')[0],
      plan: log.plan,
      price: log.price
    }));

    return data;
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'track';

  switch (command) {
    case 'track': {
      const tracker = new PriceTracker();
      try {
        await tracker.init();
        await tracker.trackPrices();
      } finally {
        await tracker.close();
      }
      break;
    }

    case 'history':
      PriceTracker.analyzePriceHistory();
      break;

    case 'export':
      const data = PriceTracker.exportForDashboard();
      console.log(JSON.stringify(data, null, 2));
      break;

    default:
      console.log('Commands: track, history, export');
  }
}

main().catch(error => {
  logError('Price tracker failed', error);
  process.exit(1);
});

export default PriceTracker;
