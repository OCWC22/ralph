/**
 * Video Generator
 * Workflow for generating videos on Kling AI
 */

import { z } from 'zod';
import BrowserAgent from './agent.js';
import KlingNavigator from './kling-navigator.js';
import { logInfo, logError, logAction, createTimer } from './logger.js';

const VideoStatusSchema = z.object({
  status: z.enum(['pending', 'processing', 'completed', 'failed']),
  progress: z.number().optional(),
  videoUrl: z.string().optional(),
  error: z.string().optional()
});

export interface VideoRequest {
  prompt: string;
  duration?: '5s' | '10s';
  quality?: 'standard' | 'high';
}

export interface VideoResult {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  prompt: string;
  videoUrl?: string;
  error?: string;
  duration_ms: number;
}

export class VideoGenerator {
  private agent: BrowserAgent;
  private navigator: KlingNavigator;

  constructor() {
    this.agent = new BrowserAgent({ headless: false });
    this.navigator = new KlingNavigator(this.agent);
  }

  async init(): Promise<void> {
    await this.agent.init();
  }

  async generateVideo(request: VideoRequest): Promise<VideoResult> {
    const timer = createTimer();
    const requestId = `video_${Date.now()}`;

    logInfo('Starting video generation', { requestId, prompt: request.prompt });

    try {
      // Navigate to video generation page
      await this.navigator.goToVideoGeneration();

      // Take screenshot of initial state
      await this.agent.screenshot(`${requestId}_1_initial`);

      // Wait for page to load
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check if login is required
      const pageContent = await this.agent.extract(
        'Is there a login button or login required message on this page?',
        z.object({
          requiresLogin: z.boolean(),
          loginButtonText: z.string().optional()
        })
      );

      if (pageContent.requiresLogin) {
        logInfo('Login required for video generation');
        await this.agent.screenshot(`${requestId}_login_required`);

        return {
          id: requestId,
          status: 'failed',
          prompt: request.prompt,
          error: 'Login required. Please log in to Kling AI first.',
          duration_ms: timer.elapsed()
        };
      }

      // Find and interact with prompt input
      await this.agent.act('Click on the text input field for entering video prompt');
      await this.agent.screenshot(`${requestId}_2_input_focused`);

      // Type the prompt
      await this.agent.act(`Type "${request.prompt}" into the prompt input field`);
      await this.agent.screenshot(`${requestId}_3_prompt_entered`);

      // Set duration if available
      if (request.duration) {
        await this.agent.act(`Select ${request.duration} duration option if available`);
      }

      // Set quality if available
      if (request.quality) {
        await this.agent.act(`Select ${request.quality} quality option if available`);
      }

      await this.agent.screenshot(`${requestId}_4_settings_configured`);

      // Click generate button
      await this.agent.act('Click the generate or create video button');
      await this.agent.screenshot(`${requestId}_5_generation_started`);

      logAction({
        timestamp: new Date().toISOString(),
        action_type: 'custom',
        target: 'video_generation_initiated',
        value: request.prompt,
        duration_ms: timer.elapsed(),
        success: true
      });

      // Wait and check status (basic polling)
      let attempts = 0;
      const maxAttempts = 6; // 30 seconds max

      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        attempts++;

        const status = await this.agent.extract(
          'What is the current status of the video generation? Look for progress indicators, completion messages, or errors.',
          VideoStatusSchema
        );

        await this.agent.screenshot(`${requestId}_status_${attempts}`);

        if (status.status === 'completed') {
          logInfo('Video generation completed', { videoUrl: status.videoUrl });
          return {
            id: requestId,
            status: 'completed',
            prompt: request.prompt,
            videoUrl: status.videoUrl,
            duration_ms: timer.elapsed()
          };
        }

        if (status.status === 'failed') {
          return {
            id: requestId,
            status: 'failed',
            prompt: request.prompt,
            error: status.error || 'Unknown error',
            duration_ms: timer.elapsed()
          };
        }

        logInfo(`Video generation in progress (attempt ${attempts}/${maxAttempts})`, {
          progress: status.progress
        });
      }

      // Timeout - still processing
      return {
        id: requestId,
        status: 'processing',
        prompt: request.prompt,
        error: 'Video still processing. Check Kling AI dashboard for results.',
        duration_ms: timer.elapsed()
      };

    } catch (error) {
      logError('Video generation failed', error as Error);
      await this.agent.screenshot(`${requestId}_error`);

      return {
        id: requestId,
        status: 'failed',
        prompt: request.prompt,
        error: (error as Error).message,
        duration_ms: timer.elapsed()
      };
    }
  }

  async close(): Promise<void> {
    await this.agent.close();
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const prompt = args.join(' ') || 'A serene mountain landscape with flowing clouds';

  console.log(`\n=== Kling AI Video Generator ===`);
  console.log(`Prompt: ${prompt}\n`);

  const generator = new VideoGenerator();

  try {
    await generator.init();

    console.log('Starting video generation...\n');
    const result = await generator.generateVideo({ prompt });

    console.log('\n=== RESULT ===');
    console.log(`ID: ${result.id}`);
    console.log(`Status: ${result.status}`);
    console.log(`Duration: ${result.duration_ms}ms`);

    if (result.videoUrl) {
      console.log(`Video URL: ${result.videoUrl}`);
    }
    if (result.error) {
      console.log(`Error: ${result.error}`);
    }

    console.log('\nCheck logs/ directory for screenshots and detailed logs.');

    // Keep browser open for inspection
    console.log('\nPress Ctrl+C to close browser...');
    await new Promise(() => {});

  } catch (error) {
    console.error('Failed:', error);
  }
}

main().catch(console.error);

export default VideoGenerator;
