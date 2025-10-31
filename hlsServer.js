/**
 * HLS Streaming Server
 * Generates HLS segments from live audio
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
  }

  async start() {
    console.log('🎬 [HLS] Starting HLS streaming server...');

    try {
      // Clean old segments
      await fs.rm(this.streamPath, { recursive: true, force: true }).catch(() => {});
      await fs.mkdir(this.streamPath, { recursive: true });
      console.log('   ✓ Clean segment directory created');

      // Create input stream
      this.inputStream = new PassThrough();

      // Start FFmpeg
      this.ffmpeg = spawn('ffmpeg', [
        '-f', 'f32le',
        '-ar', '48000',
        '-ac', '2',
        '-i', 'pipe:0',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-f', 'hls',
        '-hls_time', '2',
        '-hls_list_size', '6',
        '-hls_flags', 'delete_segments+temp_file',
        '-hls_segment_filename', path.join(this.streamPath, 'segment-%05d.ts'),
        path.join(this.streamPath, 'playlist.m3u8')
      ]);

      this.inputStream.pipe(this.ffmpeg.stdin);
      this.streaming = true;

      this.ffmpeg.stderr.on('data', (data) => {
        const msg = data.toString();
        // Log segment creation
        if (msg.includes('Opening')) {
          console.log('📦 [HLS] Creating segment...');
        }
        // Log errors
        if (msg.includes('error') || msg.includes('Error')) {
          console.error(`❌ [HLS] FFmpeg error: ${msg.substring(0, 200)}`);
        }
      });

      this.ffmpeg.on('error', (err) => {
        console.error('❌ [HLS] FFmpeg error:', err);
      });
      
      this.ffmpeg.on('exit', (code) => {
        console.log(`📴 [HLS] FFmpeg exited with code: ${code}`);
        this.streaming = false;
      });

      console.log('✅ [HLS] HLS server started');
      console.log('   Waiting for audio input to create first segment...');
    } catch (error) {
      console.error('❌ [HLS] Failed to start:', error);
      throw error;
    }
  }

  processAudio(audioData) {
    if (!this.inputStream || !this.streaming) {
      console.error('❌ [HLS] Cannot process audio - stream not ready');
      return;
    }
    
    // Convert Float32Array to Buffer properly
    const buffer = Buffer.from(audioData.buffer, audioData.byteOffset, audioData.byteLength);
    
    // Write to FFmpeg stdin
    const written = this.inputStream.write(buffer);
    
    if (!written) {
      // Buffer is full, wait for drain
      this.inputStream.once('drain', () => {
        // Ready to write more
      });
    }
  }

  async getPlaylist() {
    const playlistPath = path.join(this.streamPath, 'playlist.m3u8');
    return await fs.readFile(playlistPath, 'utf8');
  }

  async getSegment(number) {
    const segmentPath = path.join(this.streamPath, `segment-${number.padStart(5, '0')}.ts`);
    return await fs.readFile(segmentPath);
  }

  isStreaming() {
    return this.streaming;
  }

  async stop() {
    console.log('📴 [HLS] Stopping...');
    if (this.ffmpeg) {
      this.ffmpeg.kill('SIGKILL');
      this.ffmpeg = null;
    }
    if (this.inputStream) {
      this.inputStream.end();
      this.inputStream = null;
    }
    this.streaming = false;
    console.log('✅ [HLS] Stopped');
  }
}
