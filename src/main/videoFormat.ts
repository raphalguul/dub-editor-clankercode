import log from 'electron-log';

const ffmpeg = require('fluent-ffmpeg');

const COMPATIBLE_VIDEO_CODECS = ['h264', 'hevc', 'vp8', 'vp9', 'av1'];
const COMPATIBLE_AUDIO_CODECS = ['aac', 'mp3', 'opus', 'flac', 'ac3', 'eac3', 'pcm_s16le', 'pcm_s24le', 'pcm_s32le', 'pcm_f32le'];
const COMPATIBLE_CONTAINER = 'mp4';

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

interface MediaInfo {
    tracks: AudioTrackInfo[];
    videoCodec: string | null;
    videoPixFmt: string | null;
    duration: number;
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

function convertToCompatible(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        log.info('Converting ' + inputPath + ' to compatible format...');
        ffmpeg(inputPath)
            .videoCodec('libx264')
            .audioCodec('aac')
            .audioBitrate('192k')
            .audioChannels(2)
            .outputOptions(['-crf', '23', '-preset', 'medium'])
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
                duration: parseFloat(metadata.format?.duration || '0'),
            });
        });
    });
}

export { probeVideo, isCompatible, convertToCompatible, probeMediaInfo };

