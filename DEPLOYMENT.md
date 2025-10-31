# Deployment Guide - AudioRoad Streaming Server

## Step 1: Create GitHub Repository

```bash
# Create repo on GitHub: audioroad-streaming-server
# Then push:
git remote add origin https://github.com/YOUR-USERNAME/audioroad-streaming-server.git
git branch -M main
git push -u origin main
```

## Step 2: Deploy to Railway

### **Via Railway Dashboard:**

1. Go to Railway Dashboard: https://railway.com
2. Click **"New Project"**
3. Choose **"Deploy from GitHub repo"**
4. Select **`audioroad-streaming-server`**
5. Railway will auto-detect and deploy

### **Add Environment Variables:**

In Railway → Variables tab:

```
S3_BUCKET_NAME=destinationhealth-medical-docs-dev
AWS_ACCESS_KEY_ID=(copy from main app)
AWS_SECRET_ACCESS_KEY=(copy from main app)
AWS_REGION=us-east-1
MAIN_APP_URL=https://audioroad-broadcast-production.up.railway.app
NODE_ENV=production
```

### **Get Your Streaming URL:**

After deployment, Railway gives you a URL like:
```
https://audioroad-streaming-production.up.railway.app
```

**Your HLS stream will be:**
```
https://audioroad-streaming-production.up.railway.app/live.m3u8
```

---

## Step 3: Connect Main App to Streaming Server

In your main app (`audioroad-broadcast`), add to Railway variables:

```
STREAMING_SERVER_URL=https://audioroad-streaming-production.up.railway.app
```

Then update your streaming code to send audio to this service instead of handling it internally.

---

## Step 4: Test

### **Test Streaming Server Directly:**

```bash
# Health check
curl https://your-streaming-server.railway.app/health

# Test HLS stream  
curl https://your-streaming-server.railway.app/live.m3u8
```

### **Test in Browser:**

Open: `https://your-streaming-server.railway.app/live.m3u8`

Should download/play the HLS playlist.

---

## Cost

**Railway Pro Plan:**
- Main app: $20/month (existing)
- Streaming server: $10/month (new)
- **Total: $30/month**

**What You Get:**
- Dedicated streaming resources
- No more distortion
- Scalable architecture
- Professional setup

---

## Monitoring

**Check logs:**
```
Railway Dashboard → audioroad-streaming-server → Deployments → View Logs
```

**Look for:**
- ✅ HLS server started
- ✅ Auto DJ started
- 🎵 Track playback
- 📦 Segment creation

---

## Troubleshooting

**No audio?**
- Check S3 credentials in Railway variables
- Verify main app is sending audio chunks
- Check logs for FFmpeg errors

**Distortion?**
- Check instance count in logs (should be 1)
- Verify only ONE streaming server deployed
- Check memory/CPU usage in Railway

**Stream offline?**
- Health check: /health endpoint
- Check FFmpeg is running
- Verify segments are being created

---

## Next Steps After Deployment

1. Update main app to connect to this service
2. Test full flow: Auto DJ → Live → Auto DJ
3. Monitor for 24 hours
4. Add more tracks to playlist if desired

