const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
	start: (settings) => ipcRenderer.invoke('run:start', settings),
	cancel: () => ipcRenderer.invoke('run:cancel'),
	installBrowsers: () => ipcRenderer.invoke('tools:installBrowsers'),
	checkBrowsers: () => ipcRenderer.invoke('tools:checkBrowsers'),
	openTranscripts: () => ipcRenderer.invoke('fs:openTranscripts'),
	openReport: () => ipcRenderer.invoke('fs:openReport'),
	loadSettings: () => ipcRenderer.invoke('settings:load'),
	saveSettings: (partial) => ipcRenderer.invoke('settings:save', partial),
	setSecret: ({ account, password }) => ipcRenderer.invoke('keytar:set', { account, password }),
	getSecret: ({ account }) => ipcRenderer.invoke('keytar:get', { account }),
	deleteSecret: ({ account }) => ipcRenderer.invoke('keytar:delete', { account }),
	onRunLog: (cb) => ipcRenderer.on('run:log', (_e, line) => cb(line)),
	onRunEnd: (cb) => ipcRenderer.on('run:end', (_e, payload) => cb(payload)),
	onInstallLog: (cb) => ipcRenderer.on('install:log', (_e, line) => cb(line)),
	onInstallEnd: (cb) => ipcRenderer.on('install:end', (_e, payload) => cb(payload)),
});
