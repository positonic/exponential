# Testing Fireflies Webhook Locally

## 1. Setup Local Environment

### Install ngrok (if not already installed)
```bash
# Using Homebrew (macOS)
brew install ngrok

# Or download from https://ngrok.com/download
```

### Create API Key for Webhook
1. Go to `/tokens` in your app
2. Click "Create API Key"
3. Name it "Fireflies Webhook" 
4. Copy the 32-character API key (e.g., `a1b2c3d4e5f6789012345678901234567890abcd`)
5. This key will be used as your Fireflies webhook secret

## 2. Start Your Development Server
```bash
npm run dev
```
Your app should be running on `http://localhost:3000`

## 3. Expose Your Local Server with ngrok
In a new terminal:
```bash
ngrok http 3000
```

You'll see output like:
```
Session Status                online
Account                       your-email@example.com
Version                       3.x.x
Region                        United States (us)
Latency                       -
Web Interface                 http://127.0.0.1:4040
Forwarding                    https://abc123.ngrok-free.app -> http://localhost:3000
```

## 4. Get Your Webhook URL
Your webhook URL will be:
```
https://abc123.ngrok-free.app/api/webhooks/fireflies
```

## 5. Configure in Fireflies
1. Go to [Fireflies Dashboard Settings](https://app.fireflies.ai/settings)
2. Navigate to "Developer Settings" tab
3. Enter your ngrok URL: `https://abc123.ngrok-free.app/api/webhooks/fireflies`
4. Enter your 32-character API key (from step 1) as the webhook secret
5. Save the settings

## 6. Test the Webhook

### Method 1: Upload Audio via Fireflies Dashboard
1. Go to [app.fireflies.ai/upload](https://app.fireflies.ai/upload)
2. Upload an audio file
3. Check your terminal logs for webhook events

### Method 2: Test with curl (Manual Testing)
```bash
curl -X POST http://localhost:3000/api/webhooks/fireflies \
  -H "Content-Type: application/json" \
  -H "x-hub-signature: sha256=test-signature" \
  -d '{
    "meetingId": "test-meeting-123",
    "eventType": "Transcription completed",
    "clientReferenceId": "test-client-ref-456"
  }'
```

### Method 3: Test Webhook Signature (with your API key)
```bash
# Replace YOUR_API_KEY_HERE with your actual 32-character API key
API_KEY="a1b2c3d4e5f6789012345678901234567890abcd"

# Generate proper signature for testing
echo -n '{"meetingId":"test-meeting-123","eventType":"Transcription completed"}' | \
openssl dgst -sha256 -hmac "$API_KEY" | \
awk '{print "sha256="$2}'

# Then use the output in your curl request
curl -X POST http://localhost:3000/api/webhooks/fireflies \
  -H "Content-Type: application/json" \
  -H "x-hub-signature: sha256=GENERATED_SIGNATURE_HERE" \
  -d '{"meetingId":"test-meeting-123","eventType":"Transcription completed"}'
```

## 7. Monitor Webhook Activity

### Check Your Terminal Logs
Look for messages like:
```
🔥 Fireflies webhook received: { signature: ..., body: ... }
✅ Webhook signature verified
📝 Processing Fireflies webhook: { meetingId: ..., eventType: ... }
✅ Transcription completion handled successfully
```

### Check ngrok Web Interface
Visit `http://127.0.0.1:4040` to see all requests to your local server

### Check Database
Use Prisma Studio to verify data was created:
```bash
npx prisma studio
```

## 8. Production Deployment
When ready for production:
1. Deploy your app to Vercel/Railway/etc.
2. Create an API key in your production app at `/tokens`
3. Update the webhook URL in Fireflies to your production domain:
   ```
   https://your-app.vercel.app/api/webhooks/fireflies
   ```
4. Update the webhook secret in Fireflies to use your production API key

## Troubleshooting

### Common Issues:
1. **ngrok URL changes**: Free ngrok URLs change each restart. Upgrade to ngrok Pro for static URLs
2. **Signature verification fails**: Make sure your API key matches exactly in both your app and Fireflies
3. **API key expired**: Check that your API key hasn't expired in `/tokens`
4. **CORS issues**: The webhook endpoint handles POST requests, browsers might show CORS warnings for GET requests (this is normal)
5. **Webhook not firing**: Ensure the URL is accessible and returns 200 status codes

### Testing Connectivity:
```bash
# Test if your webhook endpoint is accessible
curl https://your-ngrok-url.ngrok-free.app/api/webhooks/fireflies

# Should return: {"message":"Fireflies webhook endpoint is active","timestamp":"..."}
```