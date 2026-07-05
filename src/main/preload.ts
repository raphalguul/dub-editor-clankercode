import { contextBridge, ipcRenderer } from 'electron';

export type Channels = 'ipc-example';

contextBridge.exposeInMainWorld('api', {
    send: async (channel: string, args: any) => {
        // whitelist channels
        let validChannels = [
            'clipExists',
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
            'disableVideos',
            'createCollection',
            'deleteCollection',
            'getCollections',
            'addToCollection',
            'removeFromCollection',
            'exportCollection',
            'setActive',
            'showConfirmDialog',
            'openDialog',
            'openVideoFile',
            'importZip',
            'getSubtitle',
            'normalizeAudio',
            'normalizeCollection',
            'transcribeAudio'
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
});
