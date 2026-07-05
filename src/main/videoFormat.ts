import log from 'electron-log';

const ffmpeg = require('fluent-ffmpeg');

const COMPATIBLE_VIDEO_CODECS = ['h264'];
const COMPATIBLE_AUDIO_CODECS = ['aac'];
const COMPATIBLE_CONTAINER = 'mp4';

interface ProbeResult {
    container: string;
    videoCodec: string | null;
    audioCodec: string | null;
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

export { probeVideo, isCompatible, convertToCompatible };
