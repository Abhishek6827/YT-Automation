# YouTube Auto Uploader - Setup Guide

## Quick Start

```bash
cd yt-automation
npm run dev
```
Open [http://localhost:3000](http://localhost:3000)

---

## Google Cloud Setup (Required)

### Step 1: Create a Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project: **"YouTube Auto Uploader"**
3. Enable these APIs:
   - **Google Drive API**
   - **YouTube Data API v3**

### Step 2: Create OAuth Credentials
1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Select **Web application**
4. Add these redirect URIs:
   ```
   http://localhost:3000/api/auth/callback/google
   ```
5. Copy the **Client ID** and **Client Secret**

### Step 3: Configure OAuth Consent Screen
1. Go to **OAuth consent screen**
2. Select **External** (or Internal if using Google Workspace)
3. Add your email as a test user
4. Add scopes:
   - `../auth/youtube.upload`
   - `../auth/youtube.readonly`
   - `../auth/drive.readonly`

---

## Environment Variables

Edit the `.env` file in `yt-automation/`:

```env
# Google OAuth
GOOGLE_CLIENT_ID="your-client-id-here"
GOOGLE_CLIENT_SECRET="your-client-secret-here"

# Gemini AI (Get from https://aistudio.google.com/app/apikey)
GEMINI_API_KEY="your-gemini-api-key"

# NextAuth
NEXTAUTH_SECRET="generate-a-random-32-char-string"
NEXTAUTH_URL="http://localhost:3000"
```

---

## How to Use

1. **Sign In**: Click "Sign in with Google" and authorize access
2. **Configure**: Paste your Google Drive folder link
3. **Run**: Click "Run Now" to process videos
4. **Monitor**: View upload history in the "Video History" tab

---

## Notes

- Videos are uploaded as **Private** by default for safety
- The app tracks uploaded videos to prevent duplicates
- YouTube API quota: ~6 uploads per day on free tier
