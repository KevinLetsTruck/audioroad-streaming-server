/**
 * AudioRoad Streaming Server
 * 
 * Dedicated microservice for 24/7 HLS streaming and Auto DJ
 * Runs separately from main broadcast app for stability and scalability
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { HLSServer } from './hlsServer.js';
import { AutoDJ } from './autoDJ.js';

const app = express();
const PORT = parseInt(process.env.PORT || '8081', 10);

// Middleware - WIDE OPEN CORS for streaming (public content)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false
}));
app.use(express.json());

// Create HTTP server
const httpServer = createServer(app);

// Initialize Socket.IO (for receiving audio from main app)
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: '*', // Accept from any origin (secure with API keys in production)
    methods: ['GET', 'POST']
  },
  maxHttpBufferSize: 1e8 // 100MB for audio data
});

// Initialize services
const hlsServer = new HLSServer();
const autoDJ = new AutoDJ(hlsServer);

// Health check
app.get('/health', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  res.json({
    status: 'ok',
    service: 'AudioRoad Streaming Server',
    timestamp: new Date().toISOString(),
    streaming: hlsServer.isStreaming(),
    autoDJ: autoDJ.isPlaying()
  });
});

// Get HLS playlist
app.get('/live.m3u8', async (req, res) => {
  try {
    const playlist = await hlsServer.getPlaylist();
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(playlist);
  } catch (error) {
    console.error('Error serving playlist:', error);
    res.status(503).send('Stream offline');
  }
});

// Get HLS segment
app.get('/segment-:number.ts', async (req, res) => {
  try {
    const segment = await hlsServer.getSegment(req.params.number);
    res.setHeader('Content-Type', 'video/mp2t');
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(segment);
  } catch (error) {
    console.error('Error serving segment:', error);
    res.status(404).send('Segment not found');
  }
});

// Socket.IO handlers
io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  // Receive live audio from main app
  socket.on('live-audio', (audioData) => {
    if (hlsServer.isStreaming()) {
      hlsServer.processAudioChunk(audioData);
    }
  });

  // Live show starting - pause Auto DJ
  socket.on('live-start', async () => {
    console.log('📡 [LIVE] Live show starting - pausing Auto DJ...');
    try {
      if (autoDJ && autoDJ.isPlaying()) {
        await autoDJ.stop();
        console.log('✅ [LIVE] Auto DJ stopped - ready for live audio');
      }
    } catch (error) {
      console.error('❌ [LIVE] Error stopping Auto DJ:', error);
    }
  });

  // Live show ended - resume Auto DJ
  socket.on('live-stop', async () => {
    console.log('📴 [LIVE] Live show ended - resuming Auto DJ...');
    try {
      if (autoDJ && !autoDJ.isPlaying()) {
        await autoDJ.start();
        console.log('✅ [LIVE] Auto DJ resumed');
      }
    } catch (error) {
      console.error('❌ [LIVE] Error resuming Auto DJ:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

// Start server
async function start() {
  try {
    console.log('🎙️  Starting AudioRoad Streaming Server...');
    console.log(`📡 Port: ${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV}`);

    // Start HLS server
    await hlsServer.start();
    console.log('✅ HLS server started');

    // Start Auto DJ
    await autoDJ.start();
    console.log('✅ Auto DJ started');

    // Start HTTP server
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`\n✅ Streaming server running on port ${PORT}`);
      console.log(`📊 HLS stream: http://localhost:${PORT}/live.m3u8`);
      console.log(`🎵 Auto DJ: ${autoDJ.isPlaying() ? 'Playing' : 'Stopped'}\n`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  
  await autoDJ.stop();
  await hlsServer.stop();
  
  httpServer.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

start();

