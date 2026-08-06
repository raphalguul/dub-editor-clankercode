const storeBatch = async (clips, video, title, audioTrackIndex, forceReencode) => {
    return await window.api.send('storeBatch', { clips, video, title, audioTrackIndex, forceReencode });
};

const hasBatch = async () => {
    return await window.api.send('hasBatch');
};

const nextBatchClip = async () => {
    return await window.api.send('nextBatchClip');
};

const clearBatchCache = async () => {
    return await window.api.send('clearBatchCache');
};

export default {
    storeBatch,
    hasBatch,
    nextBatchClip,
    clearBatchCache,
};
