/**
 * Kling AI Navigator
 * Specialized agent for navigating klingai.com
 */

import { z } from 'zod';
import BrowserAgent from './agent.js';
import { logInfo, logError, logPrice } from './logger.js';

const KLING_URLS = {
  home: 'https://klingai.com',
  app: 'https://app.klingai.com',
  pricing: 'https://klingai.com/membership/membership-plan',
  videoGen: 'https://app.klingai.com/global/ai-video'
};

// Schema for extracting pricing info
const PricingSchema = z.object({
  plans: z.array(z.object({
    name: z.string().describe('Plan name like Free, Standard, Pro'),
    price: z.string().describe('Monthly price like $10/month or Free'),
    credits: z.string().describe('Number of credits included'),
    features: z.array(z.string()).describe('List of features')
  }))
});

export class KlingNavigator {
  private agent: BrowserAgent;

  constructor(agent: BrowserAgent) {
    this.agent = agent;
  }

  async goToHome(): Promise<void> {
    logInfo('Navigating to Kling AI home');
    await this.agent.navigate(KLING_URLS.home);
    await this.agent.screenshot('kling_home');
  }

  async goToPricing(): Promise<void> {
    logInfo('Navigating to Kling AI pricing');
    await this.agent.navigate(KLING_URLS.pricing);
    await this.agent.screenshot('kling_pricing');
  }

  async goToVideoGeneration(): Promise<void> {
    logInfo('Navigating to Kling AI video generation');
    await this.agent.navigate(KLING_URLS.videoGen);
    await this.agent.screenshot('kling_video_gen');
  }

  async extractPricing(): Promise<z.infer<typeof PricingSchema>> {
    logInfo('Extracting pricing information');

    await this.goToPricing();

    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 2000));

    const pricing = await this.agent.extract(
      'Extract all pricing plans including plan name, price, credits, and features',
      PricingSchema
    );

    // Log each plan to prices.jsonl
    for (const plan of pricing.plans) {
      logPrice({
        timestamp: new Date().toISOString(),
        plan: plan.name,
        price: plan.price,
        credits: plan.credits,
        currency: 'USD',
        source_url: KLING_URLS.pricing
      });
    }

    return pricing;
  }

  async checkForPriceChanges(): Promise<boolean> {
    // Read previous prices from log
    const { readLogs } = await import('./logger.js');
    const previousPrices = readLogs('prices.jsonl', 10) as { plan: string; price: string }[];

    // Get current prices
    const current = await this.extractPricing();

    // Compare
    let changed = false;
    for (const plan of current.plans) {
      const prev = previousPrices.find(p => p.plan === plan.name);
      if (prev && prev.price !== plan.price) {
        logInfo(`PRICE CHANGE DETECTED: ${plan.name} changed from ${prev.price} to ${plan.price}`);
        changed = true;
      }
    }

    return changed;
  }

  async exploreVideoGeneration(): Promise<void> {
    logInfo('Exploring video generation interface');

    await this.goToVideoGeneration();

    // Observe the page structure
    const elements = await this.agent.observe('Find all interactive elements for video generation');
    logInfo('Found elements', { elements });

    await this.agent.screenshot('video_gen_elements');
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'pricing';

  const agent = new BrowserAgent({ headless: false });

  try {
    await agent.init();
    const navigator = new KlingNavigator(agent);

    switch (command) {
      case 'home':
        await navigator.goToHome();
        break;

      case 'pricing':
        const pricing = await navigator.extractPricing();
        console.log('\n=== PRICING PLANS ===');
        for (const plan of pricing.plans) {
          console.log(`\n${plan.name}: ${plan.price}`);
          console.log(`  Credits: ${plan.credits}`);
          console.log(`  Features: ${plan.features.join(', ')}`);
        }
        break;

      case 'check-prices':
        const changed = await navigator.checkForPriceChanges();
        console.log(changed ? 'Prices have changed!' : 'No price changes detected');
        break;

      case 'video':
        await navigator.exploreVideoGeneration();
        break;

      default:
        console.log('Commands: home, pricing, check-prices, video');
    }

    console.log('\nPress Ctrl+C to close browser...');
    await new Promise(() => {});
  } catch (error) {
    logError('Kling navigator failed', error as Error);
    process.exit(1);
  }
}

main().catch(console.error);

export default KlingNavigator;
