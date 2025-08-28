# Repository Description

## Brief Description (for GitHub/GitLab)

**Fathom Meeting Transcript Extractor** - Automated tool to download and save meeting transcripts from Fathom.video

## One-liner
Playwright-based automation tool that logs into Fathom.video and extracts meeting transcripts as text files.

## Detailed Description

### What it does
This tool automates the process of logging into Fathom.video and extracting meeting transcripts. It handles Google/Microsoft SSO authentication, 2FA verification, and automatically scrolls through your meeting history to save transcripts as organized text files.

### Key Features
- 🔐 Secure authentication with Google/Microsoft SSO support
- 📱 2FA (Two-Factor Authentication) compatible
- 📄 Bulk transcript extraction from multiple meetings
- 🎯 Automatic scrolling to load all meeting content
- 💾 Organized transcript storage with date-based filenames
- 🔒 Security mode for demos (hides sensitive information)
- 🐛 Debug mode for troubleshooting

### Use Cases
- Archive meeting transcripts for record-keeping
- Extract transcripts for analysis or documentation
- Backup important meeting conversations
- Automate repetitive transcript downloading tasks

### Technologies
- **Playwright** - Browser automation framework
- **TypeScript/Node.js** - Core runtime
- **Google/Microsoft OAuth** - SSO authentication support

### Requirements
- Node.js 14+
- Fathom.video account with meeting recordings
- Meeting transcripts available in your Fathom account

### Tags
`playwright` `automation` `web-scraping` `fathom` `transcript-extraction` `meeting-notes` `nodejs` `typescript` `sso-authentication` `2fa`
