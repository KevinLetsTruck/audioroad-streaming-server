# Railway Environment Variables - FINAL SETUP

## ✅ **audioroad-streaming-server** (NEW - Already configured)

These should already be set from the Dockerfile deployment:

```
S3_BUCKET_NAME=destinationhealth-medical-docs-dev
AWS_ACCESS_KEY_ID=(copy from main app)
AWS_SECRET_ACCESS_KEY=(copy from main app)
AWS_REGION=us-east-1
NODE_ENV=production
```

**Verify FFmpeg is installed:**
- Railway will use the Dockerfile
- FFmpeg installed via `apk add ffmpeg`
- Should see in logs: `✅ [HLS] HLS encoder started`

---

## ⚙️ **audioroad-broadcast** (MAIN APP - Needs 1 new variable)

**Add this ONE new variable:**

```
STREAM_SERVER_URL=https://audioroad-streaming-server-production.up.railway.app
```

**How to add:**
1. Go to Railway → audioroad-broadcast service
2. Click "Variables" tab
3. Click "Add Variable"
4. Name: `STREAM_SERVER_URL`
5. Value: `https://audioroad-streaming-server-production.up.railway.app`
6. Click "Add"
7. Railway will auto-redeploy

---

## 📊 **How It Works After Setup:**

```
Browser (your mic) 
  ↓ Socket.IO
Main App (audioroad-broadcast)
  ↓ Socket.IO: live-audio events
Streaming Server (audioroad-streaming-server)
  ↓ HLS segments
Listeners (mobile/web)
```

**Key Benefits:**
- ✅ **Main app stays stable** (no FFmpeg overload)
- ✅ **Streaming isolated** (can scale independently)
- ✅ **Auto DJ managed separately** (no interference)
- ✅ **Clean transitions** (live ↔ Auto DJ)

---

## 🧪 **Testing After Railway Redeploys** (~3 minutes)

### **Test 1: Auto DJ (24/7 Streaming)**
1. Open: `https://audioroad-streaming-server-production.up.railway.app/live.m3u8`
2. Should play ROTC episode automatically
3. Check Railway logs for:
   ```
   ✅ Auto DJ started
   🎵 [AUTO DJ] Playing ROTC 9-23-25...
   ```

### **Test 2: Live Show**
1. Start a live show from your app
2. Auto DJ should stop
3. Your live audio should play
4. Check Railway logs for:
   ```
   📡 [LIVE] Live show starting - pausing Auto DJ...
   ✅ [LIVE] Auto DJ paused
   ```

### **Test 3: Auto DJ Resume**
1. End your live show
2. Auto DJ should resume automatically
3. Check Railway logs for:
   ```
   📴 [LIVE] Live show ended - resuming Auto DJ...
   ✅ [LIVE] Auto DJ resumed
   ```

---

## 🔍 **Troubleshooting**

### **If /listen page shows 404:**
- Streaming server hasn't finished deploying
- Wait 2-3 minutes for Dockerfile build

### **If Auto DJ not playing:**
- Check Railway logs for FFmpeg errors
- Verify S3 credentials are correct
- Check if file exists at S3 URL

### **If live audio not coming through:**
- Check main app connects to streaming server:
  ```
  ✅ [STREAMING] Connected to dedicated streaming server
  ```
- Verify STREAM_SERVER_URL is set correctly

### **If audio is distorted:**
- Should NOT happen anymore!
- Both services completely isolated
- If it does: Check for duplicate deployments/instances

---

## 🎉 **Success Indicators**

You'll know it's working when:

✅ **Railway logs show:**
```
audioroad-streaming-server:
  ✅ [HLS] HLS encoder started
  ✅ Auto DJ started
  🎵 [AUTO DJ] Playing ROTC 9-23-25...

audioroad-broadcast:
  ✅ [STREAMING] Connected to dedicated streaming server
  📡 [STREAMING] Using dedicated streaming server
```

✅ **/listen page:**
- Plays Auto DJ content 24/7
- Switches to live when show starts
- Smooth, no distortion!

✅ **Mobile stream URL:**
- `https://audioroad-streaming-server-production.up.railway.app/live.m3u8`
- Works in all players
- No jumping, no distortion

