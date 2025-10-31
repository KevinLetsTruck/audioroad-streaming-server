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
    this.playlist = [
      {
        title: 'ROTC 9-23-25',
        url: 'https://destinationhealth-medical-docs-dev.s3.us-east-1.amazonaws.com/autodj/1761828187592-20250923 ROTC.m4a'
      }
    ];
  }

  async start() {
    console.log('🎵 [AUTO DJ] Starting...');
    console.log(`   Loaded ${this.playlist.length} track(s)`);
    
    this.playing = true;
    await this.playTrack(this.playlist[0]);
  }

  async playTrack(track) {
    if (!this.playing) return;

    console.log(`🎵 [AUTO DJ] Playing: ${track.title}`);
    console.log('   Downloading file...');

    try {
      // Download file
      const response = await axios.get(track.url, {
        responseType: 'arraybuffer',
        timeout: 120000
      });

      const tempFile = `/tmp/autodj-${Date.now()}.m4a`;
      await fs.writeFile(tempFile, Buffer.from(response.data));
      console.log(`   ✓ Downloaded ${(response.data.byteLength / 1024 / 1024).toFixed(1)} MB`);
      console.log('   Starting playback...');

      // Play with FFmpeg
      this.ffmpeg = spawn('ffmpeg', [
        '-readrate', '1',
        '-i', tempFile,
        '-f', 'f32le',
        '-ar', '48000',
        '-ac', '2',
        '-vn',
        'pipe:1'
      ]);

      // Pipe audio to HLS server
      this.ffmpeg.stdout.on('data', (chunk) => {
        if (!this.playing) return;
        
        const float32Data = new Float32Array(
          chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength)
        );
        this.hlsServer.processAudio(float32Data);
      });

      this.ffmpeg.on('exit', async (code) => {
        console.log(`✅ [AUTO DJ] Track finished: ${track.title}`);
        
        // Clean up
        await fs.unlink(tempFile).catch(() => {});
        
        // Loop: play again
        if (this.playing) {
          await this.playTrack(track);
        }
      });

      this.ffmpeg.on('error', (error) => {
        console.error('❌ [AUTO DJ] FFmpeg error:', error);
      });

    } catch (error) {
      console.error('❌ [AUTO DJ] Error playing track:', error);
    }
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
