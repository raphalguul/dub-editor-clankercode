const COMPATIBLE_AUDIO_CODECS = ['aac', 'mp3', 'pcm_s16le', 'pcm_s24le', 'pcm_s32le', 'pcm_f32le', 'opus', 'flac'];
const COMPATIBLE_VIDEO_CODECS = ['h264', 'hevc', 'vp8', 'vp9', 'av1'];

function canPlayDirect(source, mediaInfo, selectedTrack) {
    let filePath = source.replace(/^localfile:\/{3}/, '').replace(/^[\/\\]/, '').toLowerCase();
    const ext = filePath.split('.').pop();
    const extFail = !filePath.endsWith('.mp4') && !filePath.endsWith('.webm') && !filePath.endsWith('.mkv');
    if (extFail) { console.log('canPlayDirect false: ext=' + ext); return false; }

    let firstAudioIndex = mediaInfo.tracks[0]?.index ?? 0;
    if (selectedTrack !== firstAudioIndex) { console.log('canPlayDirect false: track mismatch sel=' + selectedTrack + ' first=' + firstAudioIndex); return false; }

    let trackInfo = mediaInfo.tracks.find(t => t.index === selectedTrack) || mediaInfo.tracks[0];
    if (!COMPATIBLE_AUDIO_CODECS.includes(trackInfo?.codec)) { console.log('canPlayDirect false: audio codec=' + trackInfo?.codec); return false; }

    if (!COMPATIBLE_VIDEO_CODECS.includes(mediaInfo.videoCodec)) { console.log('canPlayDirect false: video codec=' + mediaInfo.videoCodec); return false; }

    // MKV/WebM only support VP8/VP9/AV1 natively — H.264/HEVC in MKV fails
    const isMkvOrWebm = filePath.endsWith('.mkv') || filePath.endsWith('.webm');
    const needsMkvCodec = ['vp8', 'vp9', 'av1'].includes(mediaInfo.videoCodec);
    if (isMkvOrWebm && !needsMkvCodec) { console.log('canPlayDirect false: mkv/webm with unsuitable codec=' + mediaInfo.videoCodec); return false; }

    if (mediaInfo.videoCodec === 'h264'
        && mediaInfo.videoPixFmt !== 'yuv420p'
        && mediaInfo.videoPixFmt !== 'yuvj420p') { console.log('canPlayDirect false: h264 non-8bit pixfmt=' + mediaInfo.videoPixFmt); return false; }

    console.log('canPlayDirect true: ext=' + ext + ' vcodec=' + mediaInfo.videoCodec + ' acodec=' + trackInfo?.codec);
    return true;
}

const storeTempVideo = async (videoArrayBuffer, type) => {
    return await window.api.send('storeTempVideo', {videoArrayBuffer , type});
};

const getVideoFile = async () => {
    return await window.api.send('openVideoFile');
};

const getAudioTracks = async (videoPath) => {
    return await window.api.send('getAudioTracks', videoPath);
};

const remuxForPlayback = async (videoSource, audioTrackIndex, forceReencode) => {
    return await window.api.send('remuxForPlayback', { videoSource, audioTrackIndex, forceReencode });
};

const cleanupTempFile = async (tempPath) => {
    return await window.api.send('cleanupTempFile', tempPath);
};

const showAudioTrackPrompt = async (tracks) => {
    return await window.api.send('showAudioTrackPrompt', { tracks });
};

const onRemuxProgress = (callback) => {
    window.api.onRemuxProgress(callback);
};

const removeRemuxProgressListener = () => {
    window.api.removeRemuxProgressListener();
};

export default {
    storeTempVideo,
    getVideoFile,
    getAudioTracks,
    remuxForPlayback,
    cleanupTempFile,
    showAudioTrackPrompt,
    onRemuxProgress,
    removeRemuxProgressListener,
};

export { COMPATIBLE_AUDIO_CODECS, COMPATIBLE_VIDEO_CODECS, canPlayDirect };

