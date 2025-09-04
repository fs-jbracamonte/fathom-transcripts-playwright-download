const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
let keytar = null;
try { keytar = require('keytar'); } catch {}

if (!app.requestSingleInstanceLock()) {
	app.quit();
}

let mainWindow = null;
let currentChild = null;

function createWindow() {
	mainWindow = new BrowserWindow({
		width: 1100,
		height: 760,
		webPreferences: {
			contextIsolation: true,
			preload: path.join(__dirname, 'preload.js'),
			nodeIntegration: false,
		},
	});

	mainWindow.removeMenu();
	mainWindow.loadFile(path.join(__dirname, '..', 'public', 'index.html'));
}

app.whenReady().then(() => {
	createWindow();

	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit();
});

function boolToStr(v) {
	return v ? 'true' : 'false';
}

function streamChild(child, onLine, onEnd) {
	let stdoutBuf = '';
	let stderrBuf = '';

	child.stdout?.on('data', (data) => {
		stdoutBuf += data.toString();
		let idx;
		while ((idx = stdoutBuf.indexOf('\n')) !== -1) {
			const line = stdoutBuf.slice(0, idx);
			stdoutBuf = stdoutBuf.slice(idx + 1);
			onLine(line);
		}
	});

	child.stderr?.on('data', (data) => {
		stderrBuf += data.toString();
		let idx;
		while ((idx = stderrBuf.indexOf('\n')) !== -1) {
			const line = stderrBuf.slice(0, idx);
			stderrBuf = stderrBuf.slice(idx + 1);
			onLine(line);
		}
	});

	child.on('close', (code) => {
		if (stdoutBuf) onLine(stdoutBuf);
		if (stderrBuf) onLine(stderrBuf);
		onEnd(code ?? -1);
	});
}

function killProcessTree(child) {
	if (!child || child.killed) return;
	try {
		if (process.platform === 'win32') {
			const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']);
			killer.on('close', () => {});
		} else {
			child.kill('SIGTERM');
			setTimeout(() => {
				if (!child.killed) child.kill('SIGKILL');
			}, 2000);
		}
	} catch {}
}

function getSettingsPath() {
	return path.join(app.getPath('userData'), 'settings.json');
}

function readSettingsFromDisk() {
	const p = getSettingsPath();
	try {
		const raw = fs.readFileSync(p, 'utf-8');
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

function writeSettingsToDisk(settings) {
	const p = getSettingsPath();
	try {
		fs.mkdirSync(path.dirname(p), { recursive: true });
		fs.writeFileSync(p, JSON.stringify(settings, null, 2), 'utf-8');
		return true;
	} catch {
		return false;
	}
}

function existsChromiumInMsPlaywright() {
	try {
		let base;
		if (process.platform === 'win32') {
			base = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
		} else if (process.platform === 'darwin') {
			base = path.join(os.homedir(), 'Library', 'Caches');
		} else {
			base = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
		}
		const msDir = path.join(base, 'ms-playwright');
		if (!fs.existsSync(msDir)) return false;
		const entries = fs.readdirSync(msDir, { withFileTypes: true });
		return entries.some(e => e.isDirectory() && e.name.toLowerCase().startsWith('chromium-'));
	} catch {
		return false;
	}
}

function existsChromiumInLocalBrowsers(cwd) {
	try {
		const candidates = [
			path.join(cwd, 'node_modules', 'playwright-core', '.local-browsers'),
			path.join(cwd, 'node_modules', 'playwright', '.local-browsers'),
		];
		for (const dir of candidates) {
			if (!fs.existsSync(dir)) continue;
			const entries = fs.readdirSync(dir, { withFileTypes: true });
			if (entries.some(e => e.isDirectory() && e.name.toLowerCase().startsWith('chromium-'))) return true;
		}
		return false;
	} catch {
		return false;
	}
}

function isChromiumInstalled(cwd) {
	// Check for pre-bundled browsers in production
	if (app.isPackaged) {
		const bundledBrowsersPath = path.join(process.resourcesPath, 'playwright-browsers');
		try {
			if (fs.existsSync(bundledBrowsersPath)) {
				const entries = fs.readdirSync(bundledBrowsersPath, { withFileTypes: true });
				if (entries.some(e => e.isDirectory() && e.name.toLowerCase().startsWith('chromium-'))) {
					return true;
				}
			}
		} catch {}
	}
	
	return existsChromiumInMsPlaywright() || existsChromiumInLocalBrowsers(cwd);
}

function playwrightBin(cwd) {
	if (process.platform === 'win32') {
		return path.join(cwd, 'node_modules', '.bin', 'playwright.cmd');
	}
	return path.join(cwd, 'node_modules', '.bin', 'playwright');
}

ipcMain.handle('settings:load', async () => {
	const s = readSettingsFromDisk() || {};
	return { settings: s };
});

ipcMain.handle('settings:save', async (_e, partial) => {
	const current = readSettingsFromDisk() || {};
	const next = { ...current, ...partial };
	const ok = writeSettingsToDisk(next);
	return { saved: ok };
});

ipcMain.handle('keytar:set', async (_e, { account, password }) => {
	if (!keytar) return { ok: false, error: 'keytar-unavailable' };
	try {
		await keytar.setPassword('com.fathom.transcripts', account, password);
		return { ok: true };
	} catch (e) {
		return { ok: false, error: String(e) };
	}
});

ipcMain.handle('keytar:get', async (_e, { account }) => {
	if (!keytar) return { ok: false, error: 'keytar-unavailable' };
	try {
		const pwd = await keytar.getPassword('com.fathom.transcripts', account);
		return { ok: true, password: pwd || '' };
	} catch (e) {
		return { ok: false, error: String(e) };
	}
});

ipcMain.handle('keytar:delete', async (_e, { account }) => {
	if (!keytar) return { ok: false, error: 'keytar-unavailable' };
	try {
		const ok = await keytar.deletePassword('com.fathom.transcripts', account);
		return { ok };
	} catch (e) {
		return { ok: false, error: String(e) };
	}
});

ipcMain.handle('tools:checkBrowsers', async () => {
	const cwd = path.join(__dirname, '..');
	return { installed: isChromiumInstalled(cwd) };
});

ipcMain.handle('run:start', async (event, settings) => {
	if (!mainWindow) return;

	if (currentChild) {
		killProcessTree(currentChild);
		currentChild = null;
	}

	const cwd = path.join(__dirname, '..');
	const bin = playwrightBin(cwd);

	let resolvedPassword = settings.password || '';
	if (!resolvedPassword && keytar && settings.username) {
		try {
			resolvedPassword = (await keytar.getPassword('com.fathom.transcripts', settings.username)) || '';
		} catch {}
	}

	const env = {
		...process.env,
		BASE_URL: settings.baseURL || '',
		LOGIN_PATH: settings.loginPath || '/login',
		DATA_PAGE_PATH: settings.dataPagePath || '/home',
		AUTH_PROVIDER: settings.authProvider || 'auto',
		AUTH_USERNAME: settings.username || '',
		AUTH_PASSWORD: resolvedPassword,
		// Force headed mode for better Google auth compatibility
		HEADLESS: 'false',
		SECURE_MODE: boolToStr(!!settings.secureMode),
		// Always minimize when running from Electron
		MINIMIZED: 'true',
		SKIP_SCROLL: boolToStr(!!settings.skipScroll),
		WAIT_TIMEOUT_MS: String(settings.waitTimeoutMs ?? ''),
		NAV_TIMEOUT_MS: String(settings.navTimeoutMs ?? ''),
		MAX_MEETINGS_TO_VISIT: String(settings.maxMeetings ?? '0'),
		DOWNLOAD_DIR: settings.downloadDir || 'downloads',
		TRANSCRIPT_PATH: settings.transcriptPath || '',
	};
	
	// Use bundled browsers in production
	if (app.isPackaged) {
		env.PLAYWRIGHT_BROWSERS_PATH = path.join(process.resourcesPath, 'playwright-browsers');
	}

	const child = spawn(bin, ['test', 'auth.setup', '--project=setup'], {
		cwd,
		env,
		shell: process.platform === 'win32',
	});

	currentChild = child;

	streamChild(
		child,
		(line) => mainWindow?.webContents.send('run:log', line),
		(code) => {
			currentChild = null;
			mainWindow?.webContents.send('run:end', { code });
		},
	);

	return { started: true };
});

ipcMain.handle('run:cancel', async () => {
	if (currentChild) {
		killProcessTree(currentChild);
		currentChild = null;
		return { cancelled: true };
	}
	return { cancelled: false };
});

ipcMain.handle('tools:installBrowsers', async () => {
	if (!mainWindow) return { started: false };
	
	// In production with bundled browsers, skip installation
	if (app.isPackaged) {
		mainWindow?.webContents.send('install:log', 'Browsers are pre-bundled in this version.');
		mainWindow?.webContents.send('install:end', { code: 0 });
		return { started: true };
	}
	
	const cwd = path.join(__dirname, '..');
	const bin = playwrightBin(cwd);
	const child = spawn(bin, ['install', 'chromium'], { cwd, env: process.env, shell: process.platform === 'win32' });

	streamChild(
		child,
		(line) => mainWindow?.webContents.send('install:log', line),
		(code) => mainWindow?.webContents.send('install:end', { code }),
	);

	return { started: true };
});

ipcMain.handle('fs:openTranscripts', async () => {
	// Get the transcript path from settings if available
	try {
		const settings = readSettingsFromDisk();
		if (settings && settings.transcriptPath && settings.transcriptPath.trim()) {
			await shell.openPath(settings.transcriptPath);
			return { opened: true };
		}
	} catch {}
	
	// Fall back to default transcripts folder
	const transcripts = path.join(path.join(__dirname, '..'), 'transcripts');
	await shell.openPath(transcripts);
	return { opened: true };
});

ipcMain.handle('fs:openReport', async () => {
	const report = path.join(path.join(__dirname, '..'), 'playwright-report', 'index.html');
	await shell.openPath(report);
	return { opened: true };
});

ipcMain.handle('fs:selectFolder', async () => {
	const result = await dialog.showOpenDialog(mainWindow, {
		properties: ['openDirectory'],
		title: 'Select Transcript Save Location',
		buttonLabel: 'Select Folder'
	});
	
	if (!result.canceled && result.filePaths.length > 0) {
		return { folderPath: result.filePaths[0] };
	}
	return { folderPath: null };
});
