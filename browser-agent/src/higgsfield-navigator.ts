/**
 * Higgsfield AI Navigator
 * Specialized agent for navigating higgsfield.ai
 */

import { z } from 'zod';
import BrowserAgent from './agent.js';
import { logInfo, logError, logPrice } from './logger.js';

const HIGGSFIELD_URLS = {
  home: 'https://higgsfield.ai',
  pricing: 'https://higgsfield.ai/pricing',
  videoGen: 'https://higgsfield.ai/create/video',
  library: 'https://higgsfield.ai/library/video',
  cinematic: 'https://higgsfield.ai/cinematic-video-generator'
};

// Schema for extracting pricing info
const PricingSchema = z.object({
  plans: z.array(z.object({
    name: z.string().describe('Plan name like Free, Basic, Pro, etc'),
    price: z.string().describe('Monthly price like $9.99/month or Free'),
    credits: z.string().describe('Number of credits or generations included'),
    features: z.array(z.string()).describe('List of features')
  }))
});

// Schema for page info
const PageInfoSchema = z.object({
  title: z.string().describe('Page title'),
  description: z.string().describe('Main description or tagline'),
  mainFeatures: z.array(z.string()).describe('Key features listed on the page'),
  hasLoginButton: z.boolean().describe('Whether there is a login/signup button'),
  hasVideoGenerator: z.boolean().describe('Whether video generation interface is visible')
});

export class HiggsfieldNavigator {
  private agent: BrowserAgent;

  constructor(agent: BrowserAgent) {
    this.agent = agent;
  }

  async goToHome(): Promise<void> {
    logInfo('Navigating to Higgsfield AI home');
    await this.agent.navigate(HIGGSFIELD_URLS.home);
    await this.agent.screenshot('higgsfield_home');
  }

  async goToPricing(): Promise<void> {
    logInfo('Navigating to Higgsfield AI pricing');
    await this.agent.navigate(HIGGSFIELD_URLS.pricing);
    await this.agent.screenshot('higgsfield_pricing');
  }

  async goToVideoGeneration(): Promise<void> {
    logInfo('Navigating to Higgsfield AI video generation');
    await this.agent.navigate(HIGGSFIELD_URLS.videoGen);
    await this.agent.screenshot('higgsfield_video_gen');
  }

  async goToCinemaStudio(): Promise<void> {
    logInfo('Navigating to Higgsfield Cinema Studio');
    await this.agent.navigate(HIGGSFIELD_URLS.cinematic);
    await this.agent.screenshot('higgsfield_cinema');
  }

  async extractPageInfo(): Promise<z.infer<typeof PageInfoSchema>> {
    logInfo('Extracting page information');

    const info = await this.agent.extract(
      'Extract the page title, main description/tagline, key features, and whether there are login buttons or video generation interfaces',
      PageInfoSchema
    );

    return info;
  }

  async extractPricing(): Promise<z.infer<typeof PricingSchema>> {
    logInfo('Extracting pricing information');

    await this.goToPricing();

    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 2000));

    const pricing = await this.agent.extract(
      'Extract all pricing plans including plan name, price, credits/generations, and features. Look for pricing cards or tables.',
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
        source_url: HIGGSFIELD_URLS.pricing
      });
    }

    return pricing;
  }

  async exploreHome(): Promise<void> {
    logInfo('Exploring Higgsfield home page');

    await this.goToHome();
    await new Promise(resolve => setTimeout(resolve, 2000));

    const info = await this.extractPageInfo();
    console.log('\n=== PAGE INFO ===');
    console.log(`Title: ${info.title}`);
    console.log(`Description: ${info.description}`);
    console.log(`Features: ${info.mainFeatures.join(', ')}`);
    console.log(`Has Login: ${info.hasLoginButton}`);
    console.log(`Has Video Gen: ${info.hasVideoGenerator}`);

    // Observe interactive elements
    const elements = await this.agent.observe('Find all buttons and interactive elements on the page');
    logInfo('Found elements', { count: elements.length });

    await this.agent.screenshot('higgsfield_home_explored');
  }

  async exploreVideoGeneration(): Promise<void> {
    logInfo('Exploring video generation interface');

    await this.goToVideoGeneration();
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Observe the page structure
    const elements = await this.agent.observe('Find all interactive elements for video generation including input fields, buttons, and options');
    logInfo('Found elements', { elements });

    await this.agent.screenshot('higgsfield_video_gen_elements');
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'home';

  const agent = new BrowserAgent({ headless: false });

  try {
    await agent.init();
    const navigator = new HiggsfieldNavigator(agent);

    switch (command) {
      case 'home':
        await navigator.exploreHome();
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

      case 'video':
        await navigator.exploreVideoGeneration();
        break;

      case 'cinema':
        await navigator.goToCinemaStudio();
        break;

      default:
        console.log('Commands: home, pricing, video, cinema');
    }

    console.log('\nPress Ctrl+C to close browser...');
    await new Promise(() => {});
  } catch (error) {
    logError('Higgsfield navigator failed', error as Error);
    process.exit(1);
  }
}

main().catch(console.error);

export default HiggsfieldNavigator;
