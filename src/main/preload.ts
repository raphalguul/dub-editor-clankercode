import { contextBridge, ipcRenderer } from 'electron';

export type Channels = 'ipc-example';

contextBridge.exposeInMainWorld('api', {
    send: async (channel: string, args: any) => {
        // whitelist channels
        const validChannels = [
            'clipExists',
            'findAvailableClipNumber',
            'fileExists',
            'updateConfig',
            'getConfig',
            'storeBatch',
            'hasBatch',
            'nextBatchClip',
            'popNextBatchClip',
            'processBatchClip',
            'clearBatchCache',
            'getPreviewImage',
            'storePreviewImage',
            'getVideos',
            'getVideo',
            'renameVideo',
            'storeVideo',
            'storeTempVideo',
            'deleteVideo',
            'createCollection',
            'deleteCollection',
            'getCollections',
            'addToCollection',
            'removeFromCollection',
            'showAudioTrackPrompt',
            'exportCollection',
            'showConfirmDialog',
            'openDialog',
            'openVideoFile',
            'getAudioTracks',
            'remuxForPlayback',
            'cleanupTempFile',
            'importZip',
            'getSubtitle',
            'normalizeAudio',
            'normalizeCollection',
            'transcribeAudio',
            'log',
            'check-for-update'
        ];
        if (validChannels.includes(channel)) {
            return await ipcRenderer.invoke(channel, args);
        } else {
            throw `Invalid channel: ${channel}`;
        }
    },
    onProgress: (callback: (msg: string, pct: number) => void) => {
        ipcRenderer.on('whisper:progress', (event, msg, pct) => callback(msg, pct));
    },
    removeProgressListener: () => {
        ipcRenderer.removeAllListeners('whisper:progress');
    },
    onRemuxProgress: (callback: (pct: number) => void) => {
        ipcRenderer.on('remuxProgress', (event, pct) => callback(pct));
    },
    removeRemuxProgressListener: () => {
        ipcRenderer.removeAllListeners('remuxProgress');
    },
    onUpdateAvailable: (callback: (version: string) => void) => {
        ipcRenderer.on('update-available', (_event, version) => callback(version));
    },
    onUpdateDownloadProgress: (callback: (percent: number) => void) => {
        ipcRenderer.on('update-download-progress', (_event, percent) => callback(percent));
    },
    onUpdateDownloaded: (callback: (version: string) => void) => {
        ipcRenderer.on('update-downloaded', (_event, version) => callback(version));
    },
    onUpdateError: (callback: (message: string) => void) => {
        ipcRenderer.on('update-error', (_event, message) => callback(message));
    },
});
