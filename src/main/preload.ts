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
            'log'
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
});
