# Fathom Meeting Transcript Extractor

A tool that automatically logs into Fathom.video and saves meeting transcripts as text files.

## ✨ Features

- 🔐 **Supports multiple authentication methods**: Google SSO, Microsoft SSO, and password login
- 📝 **Extracts full meeting transcripts**: Not just summaries
- 🔄 **Smart retry logic**: Automatically retries failed extractions up to 5 times
- ⏱️ **Timeout protection**: Won't hang indefinitely (2-minute limit per meeting)
- 🎯 **Handles dynamic content**: Waits for loading overlays to disappear
- 📊 **Detailed reporting**: Shows which transcripts succeeded or failed
- 💾 **Unique filenames**: Prevents overwrites with date + meeting name + ID format
- 🔒 **Secure mode**: Hide sensitive data during screen sharing

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

### Step 3: Run Playwright from the CLI (Headless or Headed)

- Headless login + optional transcript extraction:
```bash
# Windows PowerShell
$env:HEADLESS="true"; $env:MAX_MEETINGS_TO_VISIT="0"; npm run test:setup

# Mac/Linux
HEADLESS=true MAX_MEETINGS_TO_VISIT=0 npm run test:setup
```

- Headed login + optional transcript extraction:
```bash
# Shows the browser window
npm run test:setup:headed
```

- Extract N transcripts after login (works in both modes):
```bash
# Windows PowerShell
$env:MAX_MEETINGS_TO_VISIT="5"; npm run test:setup      # headless if HEADLESS=true
$env:MAX_MEETINGS_TO_VISIT="5"; npm run test:setup:headed

# Mac/Linux
MAX_MEETINGS_TO_VISIT=5 npm run test:setup
MAX_MEETINGS_TO_VISIT=5 npm run test:setup:headed
```

- Debug/Inspector (headed):
```bash
# Windows
$env:PWDEBUG="1"; npm run test:setup:headed

# Mac/Linux
PWDEBUG=1 npm run test:setup:headed
```

### Step 3: Configure Your Login

1. **Copy the configuration template:**
   - Find the file named `env.example`
   - Make a copy and rename it to `.env`

2. **Edit the `.env` file** with your information:
   ```env
   # Required: Your Fathom login credentials
   AUTH_USERNAME=your-email@example.com
   AUTH_PASSWORD=your-password
   
   # Optional: How many meeting transcripts to extract (0 = none, 5 = last 5 meetings)
   MAX_MEETINGS_TO_VISIT=5
   
   # Optional: Authentication provider (auto|google|microsoft|password)
   AUTH_PROVIDER=auto
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

### Step 5: Run From the Electron App (UI)

1. Start the app UI:
```bash
npm run electron
```
2. Fill in Auth Provider, Username, Password.
3. Optional: set "Max Meetings to Visit" or click "Browse" to choose a Transcript folder.
4. Click "Start Extraction". The browser runs minimized and logs stream into the app.
5. Use "Transcripts" and "Report" to open output locations.

## 📁 Where to Find Your Transcripts

After running the tool, your transcripts will be saved in:
- **Folder:** `transcripts/`
- **Filename format:** `transcript_[date]_[meeting_name]_[meeting_id].txt`
- Each file contains the full meeting transcript with metadata
  
You can override the location by setting `TRANSCRIPT_PATH` in the environment or using the Electron app's "Browse" button.

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

### Script Times Out or Hangs
**Solution 1:** Increase the wait time in your `.env` file:
```
WAIT_TIMEOUT_MS=30000
NAV_TIMEOUT_MS=60000
```

**Solution 2:** The script has built-in protections:
- Automatically handles loading overlays
- Has a 2-minute timeout per meeting transcript
- Retries failed extractions up to 5 times

### Playwright browsers in Electron builds
Browsers are bundled with the installer build. For local development, you can install Chromium via:
```bash
npm run install:browsers
```

### Simulate packaged mode in development
```bash
npm run prepare-build      # downloads Chromium and portable Node into build/
npm run electron:test-packaged
```
This makes Electron use the pre-bundled browsers and Node similarly to the installer.

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

## ⚙️ All Environment Variables

Complete list of available settings for your `.env` file:

### Required Settings
```env
# Your Fathom login credentials
AUTH_USERNAME=your-email@example.com
AUTH_PASSWORD=your-password
```

### Optional Settings
```env
# Base URL for Fathom (default: https://fathom.video)
BASE_URL=https://fathom.video

# Authentication provider: auto|google|microsoft|password (default: auto)
AUTH_PROVIDER=auto

# Number of meetings to extract transcripts from (default: 0)
MAX_MEETINGS_TO_VISIT=5

# Run without showing browser window (default: false)
HEADLESS=true

# Hide passwords in logs for demos/screen sharing (default: false)
SECURE_MODE=true

# Minimize browser window when running (default: false)
MINIMIZED=false

# Skip scrolling to load all meetings (default: false)
SKIP_SCROLL=false

# Path settings
LOGIN_PATH=/login              # Login page path (default: /login)
DATA_PAGE_PATH=/home           # Page after login (default: /home)
DOWNLOAD_DIR=downloads         # Directory for downloads (default: downloads)
TRANSCRIPT_PATH=               # Optional absolute folder to save transcripts

# Timeout settings (in milliseconds)
WAIT_TIMEOUT_MS=15000          # Element detection timeout (default: 15000)
NAV_TIMEOUT_MS=30000           # Navigation timeout (default: 30000)
```

## 💡 Tips

1. **First Time Setup:**
   - Test with `MAX_MEETINGS_TO_VISIT=1` first
   - Once working, increase the number

2. **Regular Use:**
   - The tool saves your login session
   - Delete `storage/auth.json` to force a fresh login

3. **Multiple Meetings:**
   - Each meeting gets its own transcript file
   - Files are named with date, meeting name, and unique ID to prevent overwrites

## 🖥️ Running From Electron vs CLI

- CLI is ideal for automation and CI. Use `HEADLESS=true` for silent runs.
- Electron UI is ideal for interactive SSO flows (Google/Microsoft). Use the UI to install browsers, enter credentials, and monitor logs.

## 📦 Build the Installer (Electron Builder)

1. Prepare the build (downloads Playwright Chromium and portable Node to bundle):
```bash
npm run prepare-build
```
2. Build for your OS:
```bash
# Windows
npm run dist-win

# macOS
npm run dist-mac

# Linux
npm run dist-linux
```
The output appears in the `dist/` folder. On Windows you’ll get an installer `.exe` and a `win-unpacked/` folder.

Notes:
- The `dist*` scripts already run `prepare-build`; you can call them directly.
- Browsers and Node are pre-bundled so first run works offline.
- Code signing is disabled by default (`forceCodeSigning: false`).

## ❓ Need Help?

If you encounter issues:
1. Check your internet connection
2. Verify your login credentials in `.env`
3. Try running in debug mode to see what's happening
4. Make sure Fathom.video is accessible in your browser

---

**Note**: This tool automates your own Fathom account access. Please use responsibly.