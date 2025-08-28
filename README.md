# Fathom Meeting Transcript Extractor

A tool that automatically logs into Fathom.video and saves meeting transcripts as text files.

## 🚀 Quick Start

### Step 1: Install Required Software

1. **Install Node.js** (if not already installed)
   - Download from: https://nodejs.org/
   - Choose the "LTS" version
   - Run the installer with default settings

### Step 2: Set Up the Tool

1. **Open a terminal/command prompt** in the project folder

2. **Install the tool:**
   ```bash
   npm install
   npx playwright install chromium
   ```

### Step 3: Configure Your Login

1. **Copy the configuration template:**
   - Find the file named `env.example`
   - Make a copy and rename it to `.env`

2. **Edit the `.env` file** with your information:
   ```
   # Your Fathom login credentials
   AUTH_USERNAME=your-email@example.com
   AUTH_PASSWORD=your-password
   
   # How many meeting transcripts to extract (0 = none, 5 = last 5 meetings)
   MAX_MEETINGS_TO_VISIT=5
   ```

### Step 4: Run the Tool

**Basic usage - Just login test:**
```bash
npx playwright test auth.setup --project=setup
```

**Extract transcripts from meetings:**
```bash
# Windows PowerShell:
$env:MAX_MEETINGS_TO_VISIT="5"; npx playwright test auth.setup --project=setup

# Mac/Linux:
MAX_MEETINGS_TO_VISIT=5 npx playwright test auth.setup --project=setup
```

## 📁 Where to Find Your Transcripts

After running the tool, your transcripts will be saved in:
- **Folder:** `transcripts/`
- **Filename format:** `fathom_transcript_[date].txt`
- Each file contains the full meeting transcript

## 🔧 Troubleshooting

### "Browser may not be secure" Error
**Solution:** Add these settings to your `.env` file:
```
SECURE_MODE=true
HEADLESS=true
```

### 2FA (Two-Factor Authentication)
- The tool will wait up to 3 minutes for you to complete 2FA on your phone
- Have your phone ready when running the script

### Script Times Out
**Solution:** Increase the wait time in your `.env` file:
```
WAIT_TIMEOUT_MS=30000
NAV_TIMEOUT_MS=60000
```

### Can't See What's Happening
**Run in debug mode to watch the browser:**
```bash
# Windows:
$env:PWDEBUG="1"; npx playwright test auth.setup --project=setup

# Mac/Linux:
PWDEBUG=1 npx playwright test auth.setup --project=setup
```

## 🔐 Security Notes

- Your password is stored locally in the `.env` file (never shared)
- The `.env` file is automatically excluded from version control
- Use `SECURE_MODE=true` to hide passwords during screen sharing

## ⚙️ Optional Settings

Add these to your `.env` file if needed:

```env
# Run without showing browser window
HEADLESS=true

# Hide passwords in logs (for demos)
SECURE_MODE=true

# Skip scrolling to load all meetings
SKIP_SCROLL=true
```

## 💡 Tips

1. **First Time Setup:**
   - Test with `MAX_MEETINGS_TO_VISIT=1` first
   - Once working, increase the number

2. **Regular Use:**
   - The tool saves your login session
   - Delete `storage/auth.json` to force a fresh login

3. **Multiple Meetings Same Day:**
   - Only the last meeting of each day is saved
   - Each date gets one transcript file

## ❓ Need Help?

If you encounter issues:
1. Check your internet connection
2. Verify your login credentials in `.env`
3. Try running in debug mode to see what's happening
4. Make sure Fathom.video is accessible in your browser

---

**Note**: This tool automates your own Fathom account access. Please use responsibly.