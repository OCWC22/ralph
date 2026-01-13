/**
 * Simple Navigator - fetch-based for testing without Playwright
 * Demonstrates the Ralph loop pattern without requiring browser binaries
 */

import * as fs from 'fs';
import * as path from 'path';

const LOG_DIR = path.join(process.cwd(), 'logs');

// Ensure log dir exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function log(entry: object) {
  const line = JSON.stringify({ ...entry, timestamp: new Date().toISOString() }) + '\n';
  fs.appendFileSync(path.join(LOG_DIR, 'actions.jsonl'), line);
  console.log(`[LOG] ${JSON.stringify(entry)}`);
}

async function fetchPage(url: string): Promise<string> {
  const start = Date.now();
  console.log(`\nFetching: ${url}`);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RalphBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml'
      }
    });

    const html = await response.text();
    const duration = Date.now() - start;

    log({
      action_type: 'fetch',
      url,
      status: response.status,
      duration_ms: duration,
      success: response.ok,
      content_length: html.length
    });

    return html;
  } catch (error) {
    log({
      action_type: 'fetch',
      url,
      success: false,
      error: (error as Error).message
    });
    throw error;
  }
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title>([^<]+)<\/title>/i);
  return match ? match[1].trim() : null;
}

function extractMeta(html: string, name: string): string | null {
  const regex = new RegExp(`<meta[^>]*name=["']${name}["'][^>]*content=["']([^"']+)["']`, 'i');
  const match = html.match(regex);
  if (match) return match[1];

  // Try og: prefix
  const ogRegex = new RegExp(`<meta[^>]*property=["']og:${name}["'][^>]*content=["']([^"']+)["']`, 'i');
  const ogMatch = html.match(ogRegex);
  return ogMatch ? ogMatch[1] : null;
}

function extractLinks(html: string): string[] {
  const links: string[] = [];
  const regex = /<a[^>]*href=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    if (match[1].startsWith('http') || match[1].startsWith('/')) {
      links.push(match[1]);
    }
  }
  return [...new Set(links)].slice(0, 20); // Unique, max 20
}

function extractPricingInfo(html: string): { plan: string; price: string }[] {
  const plans: { plan: string; price: string }[] = [];

  // Look for common pricing patterns
  const priceRegex = /\$[\d,]+(?:\.\d{2})?(?:\/mo(?:nth)?)?/gi;
  const prices = html.match(priceRegex) || [];

  // Look for plan names near prices
  const planNames = ['free', 'basic', 'starter', 'pro', 'premium', 'enterprise', 'team', 'business'];

  for (const name of planNames) {
    const regex = new RegExp(`${name}[^$]*?(\\$[\\d,]+(?:\\.\\d{2})?(?:\\/mo(?:nth)?)?)`, 'gi');
    const match = regex.exec(html);
    if (match) {
      plans.push({ plan: name.charAt(0).toUpperCase() + name.slice(1), price: match[1] });
    }
  }

  // If no structured plans found, just list unique prices
  if (plans.length === 0 && prices.length > 0) {
    const uniquePrices = [...new Set(prices)];
    uniquePrices.forEach((price, i) => {
      plans.push({ plan: `Plan ${i + 1}`, price });
    });
  }

  return plans;
}

async function navigateHiggsfield() {
  console.log('\n========================================');
  console.log('  HIGGSFIELD.AI NAVIGATOR');
  console.log('========================================\n');

  // Step 1: Home page
  console.log('--- STEP 1: Home Page ---');
  const homeHtml = await fetchPage('https://higgsfield.ai');

  const title = extractTitle(homeHtml);
  const description = extractMeta(homeHtml, 'description');

  console.log(`Title: ${title}`);
  console.log(`Description: ${description?.slice(0, 100)}...`);

  const homeLinks = extractLinks(homeHtml);
  console.log(`Found ${homeLinks.length} links`);

  log({
    action_type: 'extract',
    page: 'home',
    title,
    description: description?.slice(0, 200),
    link_count: homeLinks.length,
    success: true
  });

  // Step 2: Pricing page
  console.log('\n--- STEP 2: Pricing Page ---');
  const pricingHtml = await fetchPage('https://higgsfield.ai/pricing');

  const pricingTitle = extractTitle(pricingHtml);
  console.log(`Title: ${pricingTitle}`);

  const plans = extractPricingInfo(pricingHtml);
  console.log('\nPricing Plans Found:');
  for (const plan of plans) {
    console.log(`  ${plan.plan}: ${plan.price}`);

    // Log to prices.jsonl
    const priceEntry = {
      timestamp: new Date().toISOString(),
      plan: plan.plan,
      price: plan.price,
      source_url: 'https://higgsfield.ai/pricing'
    };
    fs.appendFileSync(path.join(LOG_DIR, 'prices.jsonl'), JSON.stringify(priceEntry) + '\n');
  }

  log({
    action_type: 'extract',
    page: 'pricing',
    plans_found: plans.length,
    plans,
    success: true
  });

  // Step 3: Video generation page
  console.log('\n--- STEP 3: Video Generation Page ---');
  const videoHtml = await fetchPage('https://higgsfield.ai/create/video');

  const videoTitle = extractTitle(videoHtml);
  console.log(`Title: ${videoTitle}`);

  const videoLinks = extractLinks(videoHtml);
  console.log(`Found ${videoLinks.length} links on video page`);

  log({
    action_type: 'extract',
    page: 'video',
    title: videoTitle,
    link_count: videoLinks.length,
    success: true
  });

  // Summary
  console.log('\n========================================');
  console.log('  NAVIGATION COMPLETE');
  console.log('========================================');
  console.log(`\nLogs written to: ${LOG_DIR}/`);
  console.log('  - actions.jsonl');
  console.log('  - prices.jsonl');

  return {
    home: { title, description, links: homeLinks.length },
    pricing: { title: pricingTitle, plans },
    video: { title: videoTitle, links: videoLinks.length }
  };
}

// Run
navigateHiggsfield()
  .then(result => {
    console.log('\n=== FINAL RESULT ===');
    console.log(JSON.stringify(result, null, 2));
  })
  .catch(error => {
    console.error('Navigation failed:', error);
    process.exit(1);
  });
