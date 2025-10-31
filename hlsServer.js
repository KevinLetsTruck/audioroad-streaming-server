/**
 * HLS Streaming Server
 * 
 * Generates HLS segments from live audio for mobile/web playback
 * Simple, focused, reliable
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { PassThrough } from 'stream';

export class HLSServer {
  constructor() {
    this.ffmpeg = null;
    this.inputStream = null;
    this.streaming = false;
    this.streamPath = '/tmp/hls-stream';
    this.currentSegment = 0;
  }

  async start() {
    console.log('🎬 [HLS] Starting HLS streaming server...');

    try {
      // Clean old segments
      try {
        await fs.rm(this.streamPath, { recursive: true, force: true });
      } catch (e) {
        // Directory might not exist
      }
      
      await fs.mkdir(this.streamPath, { recursive: true });
      console.log('   ✓ Clean segment directory created');

      // Create input stream for audio data
      this.inputStream = new PassThrough();

      // Start FFmpeg HLS encoder
      this.ffmpeg = spawn('ffmpeg', [
        // Input: PCM audio
        '-f', 'f32le',
        '-ar', '48000',
        '-ac', '2',
        '-i', 'pipe:0',
        
        // Output: HLS
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ar', '48000',
        '-ac', '2',
        '-f', 'hls',
        '-hls_time', '2',              // 2-second segments
        '-hls_list_size', '6',         // Keep 6 segments in playlist
        '-hls_flags', 'delete_segments+temp_file',
        '-hls_segment_filename', path.join(this.streamPath, 'segment-%05d.ts'),
        path.join(this.streamPath, 'playlist.m3u8')
      ], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Pipe input to FFmpeg
      this.inputStream.pipe(this.ffmpeg.stdin);

      // Handle FFmpeg output
      this.ffmpeg.stderr.on('data', (data) => {
        const msg = data.toString();
        if (msg.includes('segment')) {
          const match = msg.match(/segment-(\d+)/);
          if (match) {
            this.currentSegment = parseInt(match[1]);
          }
        }
      });

      this.ffmpeg.on('error', (error) => {
        console.error('❌ [HLS] FFmpeg error:', error);
      });

      this.ffmpeg.on('exit', (code) => {
        console.log(`📴 [HLS] FFmpeg exited with code ${code}`);
        this.streaming = false;
      });

      // Wait for FFmpeg to initialize
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      this.streaming = true;
      console.log('✅ [HLS] HLS encoder started');

    } catch (error) {
      console.error('❌ [HLS] Failed to start:', error);
      throw error;
    }
  }

  processAudioChunk(audioData) {
    if (!this.streaming || !this.inputStream) {
      return;
    }

    try {
      // Convert Float32Array to Buffer
      const buffer = Buffer.from(audioData.buffer);
      this.inputStream.write(buffer);
    } catch (error) {
      console.error('❌ [HLS] Error processing audio:', error);
    }
  }

  async getPlaylist() {
    const playlistPath = path.join(this.streamPath, 'playlist.m3u8');
    return await fs.readFile(playlistPath, 'utf-8');
  }

  async getSegment(number) {
    const segmentPath = path.join(this.streamPath, `segment-${number.padStart(5, '0')}.ts`);
    return await fs.readFile(segmentPath);
  }

  isStreaming() {
    return this.streaming;
  }

  async stop() {
    console.log('📴 [HLS] Stopping HLS server...');
    
    this.streaming = false;

    if (this.inputStream) {
      this.inputStream.end();
      this.inputStream = null;
    }

    if (this.ffmpeg) {
      this.ffmpeg.kill('SIGKILL');
      this.ffmpeg = null;
    }

    try {
      await fs.rm(this.streamPath, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }

    console.log('✅ [HLS] HLS server stopped');
  }
}

