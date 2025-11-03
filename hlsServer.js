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
    this.acceptAutoDJ = true;  // Control whether to accept Auto DJ audio
  }

  async start() {
    console.log('🎬 [HLS] Starting HLS streaming server...');

    try {
      // Clean old segments
      await fs.rm(this.streamPath, { recursive: true, force: true }).catch(() => {});
      await fs.mkdir(this.streamPath, { recursive: true });
      console.log('   ✓ Clean segment directory created');

      // Create input stream with larger buffer to prevent audio dropouts
      this.inputStream = new PassThrough({ highWaterMark: 1024 * 1024 }); // 1MB buffer

      // Start FFmpeg with MINIMAL buffer for fast live transitions
      // Smaller buffer = faster switch from Auto DJ to live (less overlap)
      this.ffmpeg = spawn('ffmpeg', [
        '-f', 'f32le',
        '-ar', '48000',
        '-ac', '2',
        '-i', 'pipe:0',
        
        // Audio encoding
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ar', '48000',
        '-ac', '2',
        
        // HLS output settings - MINIMAL BUFFER for fast live switching
        '-f', 'hls',
        '-hls_time', '4',              // 4-second segments (was 6)
        '-hls_list_size', '3',         // Keep only 3 segments (12 seconds total - was 60!)
        '-hls_flags', 'delete_segments+omit_endlist',  // Delete old segments immediately
        '-hls_segment_filename', path.join(this.streamPath, 'segment-%05d.ts'),
        '-start_number', '0',
        '-hls_allow_cache', '0',       // No caching for instant updates
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

  processAudio(audioData, source = 'auto') {
    if (!this.inputStream || !this.streaming) {
      return; // Silently ignore if not ready
    }
    
    // When live audio is active, ignore Auto DJ audio
    if (source === 'auto' && !this.acceptAutoDJ) {
      return; // Silently ignore Auto DJ when live is active
    }
    
    // audioData can be either Buffer (from Auto DJ) or Float32Array (from browser via Socket.IO)
    let buffer;
    
    if (Buffer.isBuffer(audioData)) {
      // Already a buffer from Auto DJ FFmpeg (f32le PCM data)
      buffer = audioData;
    } else if (audioData instanceof Float32Array || audioData.buffer) {
      // Float32Array from browser - convert to Buffer
      buffer = Buffer.from(audioData.buffer, audioData.byteOffset, audioData.byteLength);
    } else {
      console.error('❌ [HLS] Unknown audio data type:', typeof audioData);
      return;
    }
    
    // Write to FFmpeg stdin (expects f32le PCM)
    try {
      this.inputStream.write(buffer);
    } catch (error) {
      console.error('❌ [HLS] Error writing to FFmpeg:', error);
    }
  }
  
  setLiveMode(isLive) {
    this.acceptAutoDJ = !isLive;
    console.log(`🎚️ [HLS] Audio source: ${isLive ? 'LIVE SHOW' : 'AUTO DJ'}`);
    
    // Don't restart FFmpeg - it breaks browser connections
    // Just block the audio source and let buffered audio play out
    // Within 10-20 seconds, only live audio will be flowing
    
    if (isLive) {
      console.log('ℹ️ [HLS] Buffered Auto DJ audio will play out over ~10-20 seconds');
      console.log('ℹ️ [HLS] Then stream will contain ONLY live audio');
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
