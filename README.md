# AudioRoad Streaming Server

**Dedicated microservice for 24/7 HLS streaming and Auto DJ**

## Architecture

This service runs **separately** from the main AudioRoad broadcast application.

**Responsibilities:**
- HLS stream generation (FFmpeg)
- Auto DJ playback (background music/content)
- Audio segment delivery to listeners

**Does NOT handle:**
- User authentication
- Twilio calls
- Database operations
- Web UI

## Why Separate?

**Stability:**
- FFmpeg audio processing isolated from main app
- Can't crash your broadcast features
- Dedicated resources prevent interference

**Scalability:**
- Scale streaming independently
- Add more streaming servers if needed
- Main app stays lightweight

**Reliability:**
- Single responsibility = simpler code
- Easier to debug and monitor
- Clean restarts don't affect main app

## Setup

### Local Development

```bash
npm install
npm start
```

Stream available at: `http://localhost:8081/live.m3u8`

### Railway Deployment

1. Create new Railway service from this directory
2. Add environment variables:
   - `S3_BUCKET_NAME`
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`  
   - `MAIN_APP_URL` (your main app URL)
3. Deploy!

### Connect to Main App

In your main app, connect via Socket.IO:

```javascript
import { io } from 'socket.io-client';

const streamingServer = io('https://your-streaming-server.railway.app');

// Send live audio
streamingServer.emit('live-audio', float32ArrayData);

// Control Auto DJ
streamingServer.emit('start-live'); // Pause Auto DJ
streamingServer.emit('stop-live');  // Resume Auto DJ
```

## API Endpoints

**GET /health** - Health check
**GET /live.m3u8** - HLS playlist
**GET /segment-XXXXX.ts** - Audio segments

## Stream URL for Mobile Apps

```
https://your-streaming-server.railway.app/live.m3u8
```

Use with:
- iOS: AVPlayer
- Android: ExoPlayer  
- React Native: react-native-video

## Monitoring

Check health: `curl https://your-server.railway.app/health`

Logs show:
- Segment creation
- Auto DJ track playback
- Live broadcast transitions
- Error details

## Cost

Railway Pro: ~$10/month for dedicated streaming resources

## Benefits

✅ Rock-solid 24/7 streaming  
✅ No interference with main app  
✅ Clean, maintainable code  
✅ Easy to scale  
✅ Industry-standard architecture

