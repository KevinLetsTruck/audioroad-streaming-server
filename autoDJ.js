/**
 * Auto DJ Service
 * 
 * Plays audio files when no live broadcast is active
 * Simple approach: Just play files sequentially, no complex pause/resume
 */

import { spawn } from 'child_process';
import axios from 'axios';
import { promises as fs } from 'fs';
import path from 'path';

export class AutoDJ {
  constructor(hlsServer) {
    this.hlsServer = hlsServer;
    this.playing = false;
    this.ffmpeg = null;
    this.playlist = [];
    this.currentIndex = 0;
  }

  async start() {
    console.log('🎵 [AUTO DJ] Starting Auto DJ...');
    
    this.playing = true;
    
    // Load playlist from S3 bucket or hardcoded list
    this.playlist = [
      {
        title: 'ROTC 9-23-25',
        url: 'https://destinationhealth-medical-docs-dev.s3.us-east-1.amazonaws.com/autodj/1761828187592-20250923 ROTC.m4a',
        duration: 7117 // seconds (1h 58m)
      }
    ];
    
    console.log(`   Loaded ${this.playlist.length} track(s)`);
    
    // Start playing
    this.playNext();
  }

  async playNext() {
    if (!this.playing) {
      console.log('⏸️ [AUTO DJ] Not playing - stopping');
      return;
    }

    if (this.playlist.length === 0) {
      console.log('⚠️ [AUTO DJ] No tracks in playlist');
      return;
    }

    // Get next track (loop playlist)
    const track = this.playlist[this.currentIndex % this.playlist.length];
    console.log(`🎵 [AUTO DJ] Playing: ${track.title}`);

    try {
      // Download to temp file
      const tempFile = path.join('/tmp', `autodj-${Date.now()}.m4a`);
      console.log('   Downloading file...');
      
      const response = await axios.get(track.url, {
        responseType: 'arraybuffer',
        timeout: 120000
      });
      
      await fs.writeFile(tempFile, Buffer.from(response.data));
      console.log(`   ✓ Downloaded ${(response.data.byteLength / 1024 / 1024).toFixed(1)} MB`);

      // Play with FFmpeg
      console.log('   Starting playback...');
      
      this.ffmpeg = spawn('ffmpeg', [
        '-readrate', '1',      // Real-time playback
        '-i', tempFile,        // Input file
        '-f', 'f32le',         // Output format
        '-ar', '48000',        // Sample rate
        '-ac', '2',            // Stereo
        '-vn',                 // No video
        'pipe:1'               // Output to stdout
      ]);

      // Send audio to HLS server
      this.ffmpeg.stdout.on('data', (chunk) => {
        if (!this.playing) return; // Stop immediately if paused

        const float32Data = new Float32Array(
          chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength)
        );
        
        this.hlsServer.processAudioChunk(float32Data);
      });

      // Handle completion
      this.ffmpeg.on('exit', async (code) => {
        console.log(`✅ [AUTO DJ] Track finished: ${track.title}`);
        
        // Clean up temp file
        try {
          await fs.unlink(tempFile);
        } catch (e) {
          // Ignore
        }

        // Move to next track
        this.currentIndex++;
        
        // Play next if still supposed to be playing
        if (this.playing) {
          await new Promise(resolve => setTimeout(resolve, 500)); // Brief gap
          this.playNext();
        }
      });

      this.ffmpeg.on('error', (error) => {
        console.error('❌ [AUTO DJ] FFmpeg error:', error);
        this.currentIndex++;
        if (this.playing) {
          setTimeout(() => this.playNext(), 2000); // Retry next track
        }
      });

    } catch (error) {
      console.error('❌ [AUTO DJ] Error playing track:', error);
      this.currentIndex++;
      if (this.playing) {
        setTimeout(() => this.playNext(), 5000); // Retry
      }
    }
  }

  async pause() {
    console.log('⏸️ [AUTO DJ] Pausing...');
    
    this.playing = false;
    
    if (this.ffmpeg) {
      this.ffmpeg.kill('SIGKILL');
      this.ffmpeg = null;
    }
    
    console.log('✅ [AUTO DJ] Paused');
  }

  async resume() {
    console.log('▶️ [AUTO DJ] Resuming...');
    
    if (this.playing) {
      console.log('   Already playing');
      return;
    }
    
    this.playing = true;
    this.playNext();
    
    console.log('✅ [AUTO DJ] Resumed');
  }

  async stop() {
    console.log('📴 [AUTO DJ] Stopping...');
    
    this.playing = false;
    
    if (this.ffmpeg) {
      this.ffmpeg.kill('SIGKILL');
      this.ffmpeg = null;
    }
    
    console.log('✅ [AUTO DJ] Stopped');
  }

  isPlaying() {
    return this.playing;
  }
}

