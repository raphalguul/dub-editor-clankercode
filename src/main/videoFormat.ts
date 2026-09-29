import log from 'electron-log';

const ffmpeg = require('fluent-ffmpeg');

const COMPATIBLE_VIDEO_CODECS = ['h264', 'hevc', 'vp8', 'vp9', 'av1'];
const COMPATIBLE_AUDIO_CODECS = ['aac', 'mp3', 'opus', 'flac', 'ac3', 'eac3', 'pcm_s16le', 'pcm_s24le', 'pcm_s32le', 'pcm_f32le'];
const COMPATIBLE_CONTAINER = 'mp4';

// What the game will actually load. The lists above are for preview playback,
// which the browser is far more forgiving about than the game is.
export const EXPORT_VIDEO_CODEC = 'h264';
export const EXPORT_PIX_FMT = 'yuv420p';
export const EXPORT_AUDIO_CODEC = 'aac';
export const EXPORT_AUDIO_CHANNELS = 2;
export const EXPORT_AUDIO_BITRATE = '192k';
const EXPORT_ACCEPTED_PIX_FMTS = ['yuv420p', 'yuvj420p'];

interface ProbeResult {
    container: string;
    videoCodec: string | null;
    audioCodec: string | null;
}

export interface AudioTrackInfo {
    index: number;
    codec: string | null;
    language: string | null;
    channels: number;
    channelLayout: string | null;
    title: string | null;
}

export interface MediaInfo {
    tracks: AudioTrackInfo[];
    videoCodec: string | null;
    videoPixFmt: string | null;
    videoWidth: number;
    videoHeight: number;
    duration: number;
}

// Whether the video stream can be handed to the game untouched. Deciding this
// per stream rather than per file is what lets the audio-only case keep its
// fast path: the video passes, so only the picked audio track is re-encoded.
export function isVideoStreamExportSafe(info: MediaInfo): boolean {
    if (info.videoCodec !== EXPORT_VIDEO_CODEC) {
        return false;
    }
    return EXPORT_ACCEPTED_PIX_FMTS.includes(info.videoPixFmt || '');
}

// Whether the whole file can be copied straight across. Stricter than the video
// check alone, because a non-aac audio stream is not something the game takes,
// and a verbatim copy carries every track in the file, not just the first.
export function isExportSafe(info: MediaInfo): boolean {
    if (!isVideoStreamExportSafe(info)) {
        return false;
    }
    return info.tracks.every(
        (track) => track.codec === null || track.codec === EXPORT_AUDIO_CODEC
    );
}

// Video copied as-is, audio re-encoded to what the game needs. Only valid on a
// source that already passed isVideoStreamExportSafe.
export function remuxToExportAudio(
    inputPath: string,
    outputPath: string,
    audioTrackIndex?: number
): Promise<void> {
    return new Promise((resolve, reject) => {
        const maps = ['-map', '0:v:0'];
        if (audioTrackIndex !== undefined) {
            maps.push('-map', '0:' + audioTrackIndex);
        }

        log.info('Export remux ' + inputPath + ' (video copy, audio ' + EXPORT_AUDIO_CODEC + ')');

        ffmpeg(inputPath)
            .videoCodec('copy')
            .audioCodec(EXPORT_AUDIO_CODEC)
            .audioBitrate(EXPORT_AUDIO_BITRATE)
            .audioChannels(EXPORT_AUDIO_CHANNELS)
            .outputOptions([...maps, '-movflags', '+faststart'])
            .output(outputPath)
            .on('end', () => {
                log.info('Export remux complete: ' + outputPath);
                resolve();
            })
            .on('error', (err: any) => {
                log.error('Export remux failed: ' + err);
                reject(err);
            })
            .run();
    });
}

function probeVideo(filePath: string): Promise<ProbeResult> {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err: any, metadata: any) => {
            if (err) {
                log.error('ffprobe failed: ' + err);
                reject(err);
                return;
            }

            const format = metadata.format;
            const videoStream = metadata.streams.find((s: any) => s.codec_type === 'video');
            const audioStream = metadata.streams.find((s: any) => s.codec_type === 'audio');

            resolve({
                container: format.format_name?.split(',')[0] || 'unknown',
                videoCodec: videoStream?.codec_name || null,
                audioCodec: audioStream?.codec_name || null,
            });
        });
    });
}

async function isCompatible(filePath: string): Promise<boolean> {
    try {
        const info = await probeVideo(filePath);

        if (!info.videoCodec) {
            return false;
        }

        const containerOk = info.container === COMPATIBLE_CONTAINER;
        const videoOk = COMPATIBLE_VIDEO_CODECS.includes(info.videoCodec);
        const audioOk = !info.audioCodec || COMPATIBLE_AUDIO_CODECS.includes(info.audioCodec);

        return containerOk && videoOk && audioOk;
    } catch (err) {
        log.error('Compatibility check failed: ' + err);
        return false;
    }
}

// The game rejects a good deal of what the browser previews happily, so an
// export is only ever judged by the strict helpers above. This permissive check
// still describes playback, and must not be used to decide what gets written to
// the clip folder.

function convertToCompatible(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        log.info('Converting ' + inputPath + ' to compatible format...');
        ffmpeg(inputPath)
            .videoCodec('libx264')
            .audioCodec('aac')
            .audioBitrate('192k')
            .audioChannels(2)
            .outputOptions(['-crf', '27', '-preset', 'medium', '-pix_fmt', EXPORT_PIX_FMT, '-movflags', '+faststart'])
            .output(outputPath)
            .on('end', () => {
                log.info('Conversion complete: ' + outputPath);
                resolve();
            })
            .on('error', (err: any) => {
                log.error('Conversion failed: ' + err);
                reject(err);
            })
            .run();
    });
}

function probeMediaInfo(filePath: string): Promise<MediaInfo> {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err: any, metadata: any) => {
            if (err) {
                log.error('ffprobe failed: ' + err);
                reject(err);
                return;
            }

            const videoStream = metadata.streams.find((s: any) => s.codec_type === 'video');
            const audioStreams = metadata.streams.filter((s: any) => s.codec_type === 'audio');
            const tracks: AudioTrackInfo[] = audioStreams.map((s: any) => ({
                index: s.index,
                codec: s.codec_name || null,
                language: s.tags?.language || null,
                channels: s.channels || 0,
                channelLayout: s.channel_layout || null,
                title: s.tags?.title || null,
            }));

            resolve({
                tracks,
                videoCodec: videoStream?.codec_name || null,
                videoPixFmt: videoStream?.pix_fmt || null,
                videoWidth: videoStream?.width || 0,
                videoHeight: videoStream?.height || 0,
                duration: parseFloat(metadata.format?.duration || '0'),
            });
        });
    });
}

export { probeVideo, isCompatible, convertToCompatible, probeMediaInfo };

