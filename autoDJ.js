/**
 * Auto DJ Service
 * Plays audio files when no live broadcast
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
    this.tempFile = null;          // Keep temp file for resume
    this.pausedAt = 0;             // Track pause position in seconds
    this.startTime = null;         // Track when playback started
    this.playlist = [
      {
        title: 'ROTC 9-23-25',
        url: 'https://destinationhealth-medical-docs-dev.s3.us-east-1.amazonaws.com/autodj/1761828187592-20250923 ROTC.m4a',
        duration: 7117  // 1h 58m in seconds
      }
    ];
  }

  async start() {
    if (this.playing) {
      console.log('⚠️ [AUTO DJ] Already playing - ignoring start request');
      return;
    }
    
    console.log('🎵 [AUTO DJ] Starting...');
    console.log(`   Loaded ${this.playlist.length} track(s)`);
    
    this.playing = true;
    await this.playTrack(this.playlist[0]);
  }

  async playTrack(track) {
    if (!this.playing) {
      console.log('⚠️ [AUTO DJ] Not in playing state - skipping playTrack');
      return;
    }
    
    if (this.ffmpeg && !this.ffmpeg.killed) {
      console.log('⚠️ [AUTO DJ] FFmpeg already running - skipping playTrack');
      return;
    }

    console.log(`🎵 [AUTO DJ] Playing: ${track.title}`);
    
    try {
      // Check if we have a paused file to resume from
      if (this.tempFile && this.pausedAt > 0) {
        console.log(`   ⏩ Resuming from ${Math.floor(this.pausedAt / 60)}m ${Math.floor(this.pausedAt % 60)}s`);
        console.log(`   Using existing temp file: ${this.tempFile}`);
      } else {
        // Download file fresh
        console.log('   Downloading file...');
        const response = await axios.get(track.url, {
          responseType: 'arraybuffer',
          timeout: 120000
        });

        this.tempFile = `/tmp/autodj-${Date.now()}.m4a`;
        await fs.writeFile(this.tempFile, Buffer.from(response.data));
        console.log(`   ✓ Downloaded ${(response.data.byteLength / 1024 / 1024).toFixed(1)} MB`);
        this.pausedAt = 0;  // Starting from beginning
      }
      
      console.log('   Starting playback...');

      // Play with FFmpeg - seek to resume position if paused
      const ffmpegArgs = [];
      
      // If resuming, seek to the pause position BEFORE input
      if (this.pausedAt > 0) {
        ffmpegArgs.push('-ss', this.pausedAt.toString());  // Seek to position BEFORE -i
        console.log(`   🎯 Seeking to ${this.pausedAt}s in file`);
      }
      
      // Don't use -re flag - control timing at application level instead
      ffmpegArgs.push(
        '-i', this.tempFile,
        '-f', 'f32le',
        '-ar', '48000',
        '-ac', '2',
        '-vn',
        '-loglevel', 'error',  // Reduce noise
        'pipe:1'
      );
      
      console.log(`🎬 [AUTO DJ] FFmpeg command: ffmpeg ${ffmpegArgs.join(' ')}`);
      this.ffmpeg = spawn('ffmpeg', ffmpegArgs);
      this.startTime = Date.now() - (this.pausedAt * 1000);  // Adjust for resume position

      // Pipe audio to HLS server - just pass through directly
      // Let HLS FFmpeg handle buffering and timing
      let chunkCount = 0;
      let lastLog = Date.now();
      
      this.ffmpeg.stdout.on('data', (chunk) => {
        if (!this.playing) return;
        
        chunkCount++;
        
        // Log progress every 30 seconds
        const now = Date.now();
        if (now - lastLog > 30000) {
          const elapsed = ((now - this.startTime) / 1000).toFixed(0);
          console.log(`  🎵 [AUTO DJ] Playing... (${chunkCount} chunks, ${elapsed}s elapsed)`);
          lastLog = now;
        }
        
        // Pass buffer directly to HLS server
        this.hlsServer.processAudio(chunk);
      });

      this.ffmpeg.on('exit', async (code) => {
        console.log(`✅ [AUTO DJ] Track finished: ${track.title} (exit code: ${code}, chunks: ${chunkCount})`);
        
        // PREVENT MULTIPLE INSTANCES: Only restart if we're still marked as playing
        // and not currently playing (this.ffmpeg should be null or this one)
        if (code === 0 && this.playing && this.ffmpeg && this.ffmpeg.killed) {
          // Track played to the end naturally
          await fs.unlink(this.tempFile).catch(() => {});
          this.tempFile = null;
          this.pausedAt = 0;
          this.startTime = null;
          this.ffmpeg = null;
          
          // Wait 1 second before restarting to prevent rapid loops
          console.log('🔄 [AUTO DJ] Track completed - will restart in 1 second...');
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Double-check we're still supposed to be playing
          if (this.playing) {
            await this.playTrack(track);
          }
        } else if (code !== null && code !== 0) {
          // Error exit
          console.error(`❌ [AUTO DJ] FFmpeg exited abnormally with code ${code}`);
          this.ffmpeg = null;
        }
        // If code is null, it was killed (paused) - keep temp file and position for resume
      });

      this.ffmpeg.on('error', (error) => {
        console.error('❌ [AUTO DJ] FFmpeg error:', error);
      });
      
      this.ffmpeg.stderr.on('data', (data) => {
        const msg = data.toString();
        // Only log errors, not progress info
        if (msg.includes('error') || msg.includes('Error')) {
          console.error(`❌ [AUTO DJ] FFmpeg stderr: ${msg.substring(0, 200)}`);
        }
      });

    } catch (error) {
      console.error('❌ [AUTO DJ] Error playing track:', error);
    }
  }

  async stop() {
    console.log('⏸️ [AUTO DJ] Pausing (saving position for resume)...');
    
    // Calculate current position
    if (this.startTime) {
      const elapsed = (Date.now() - this.startTime) / 1000;  // Convert to seconds
      this.pausedAt = elapsed;
      console.log(`   Paused at: ${Math.floor(elapsed / 60)}m ${Math.floor(elapsed % 60)}s`);
    }
    
    this.playing = false;
    
    if (this.ffmpeg) {
      this.ffmpeg.kill('SIGKILL');
      this.ffmpeg = null;
    }
    
    // Keep temp file for resume! Don't delete it
    console.log(`   Keeping temp file for resume: ${this.tempFile}`);
    console.log('✅ [AUTO DJ] Paused - will resume from this position');
  }

  isPlaying() {
    return this.playing;
  }
}
