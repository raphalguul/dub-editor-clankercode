/* eslint no-console: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import os from 'os';
import { execSync } from 'child_process';
import { app, BrowserWindow, dialog, shell, ipcMain, protocol } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';

function fromLocalfileUrl(url: string): string {
    return decodeURIComponent(url.replace(/^localfile:\/{2,}/, '').replace(/^[\/\\]/, ''));
}

import defaultConfig from './defaultConfig';
import JSZip from 'jszip';
import { ClipPaths, DirectoryList } from './types';
import * as whisper from './whisper';
import { isCompatible, convertToCompatible, probeMediaInfo, AudioTrackInfo } from './videoFormat';

const ffmpeg = require('fluent-ffmpeg');
const StreamZip = require('node-stream-zip');

// Fuck ASAR, it's a piece of shit with shitty documentation and it doesn't work the same way in every OS.
const baseDirectory =             __dirname.substring(0, __dirname.indexOf('app.asar'));
let ffmpegPath =                path.join(baseDirectory, 'node_modules/ffmpeg-static/ffmpeg');
let ffprobePath =               path.join(baseDirectory, 'node_modules/ffprobe-static/bin', process.platform, process.arch);
const defaultPreviewFilePath =    path.join(baseDirectory, 'images/preview.jpg');

if (process.platform === "win32") {
    ffmpegPath += ".exe";
    ffprobePath = path.join(ffprobePath, 'ffprobe.exe');
} else {
    ffprobePath = path.join(ffprobePath, 'ffprobe');
}

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

if (!fs.existsSync(ffmpegPath)) {
    log.error("Unable to locate FFMPEG");
}

if (!fs.existsSync(ffprobePath)) {
    log.error("Unable to locate FFPROBE");
}

if (!fs.existsSync(defaultPreviewFilePath)) {
    log.error("Unable to locate default preview image");
}

const HOME: string =
    process.platform === 'darwin'
        ? process.env.HOME || '/'
        : `${process.env.HOMEDRIVE}${process.env.HOMEPATH}/AppData/Local/DubEditor`;
const CONFIG_FILE =             `${HOME}/.dub-editor-config.v2.json`;
const COLLECTIONS_FILE =        '.dub-editor-collections.v2.json';
const BATCH_CACHE_FILE =        '.dub-editor-batch-cache.v2.json';
const LOG_FILE =                'dub-editor.log';

const VIDEO_SUB_DIRECTORY =             'VideoClips';
const SUBTITLE_SUB_DIRECTORY =          'Subtitles';
const THUMBNAIL_SUB_DIRECTORY =         'ThumbNails';
const PREVIEW_IMAGE_SUB_DIRECTORY =     'PreviewImages';
const LOGS_SUBDIRECTORY =               'logs';

function setupAutoUpdater() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
}

function checkForUpdatesAndPrompt(isStartup: boolean) {
    return new Promise<void>((resolve) => {
        let handled = false;

        const cleanup = () => {
            autoUpdater.removeAllListeners('update-available');
            autoUpdater.removeAllListeners('update-not-available');
            autoUpdater.removeAllListeners('error');
        };

        autoUpdater.once('update-available', async (info: any) => {
            if (handled) return;
            handled = true;
            log.info(`Update available: ${info.version}`);

            const result = await dialog.showMessageBox(mainWindow!, {
                type: 'info',
                message: `A new version (v${info.version}) is available.`,
                detail: 'Do you want to download and install it?',
                buttons: ['Update', 'Later'],
                defaultId: 0,
                cancelId: 1,
            });

            if (result.response === 0) {
                autoUpdater.once('update-downloaded', async (dlInfo: any) => {
                    log.info(`Update downloaded: ${dlInfo.version}`);
                    const restartResult = await dialog.showMessageBox(mainWindow!, {
                        type: 'info',
                        message: `Update downloaded (v${dlInfo.version}).`,
                        detail: 'Do you want to restart now?',
                        buttons: ['Restart', 'Later'],
                        defaultId: 0,
                        cancelId: 1,
                    });
                    if (restartResult.response === 0) {
                        autoUpdater.quitAndInstall(false, true);
                    }
                });
                autoUpdater.downloadUpdate();
            }

            cleanup();
            resolve();
        });

        autoUpdater.once('update-not-available', async () => {
            if (handled) return;
            handled = true;
            log.info('No update available');

            if (!isStartup) {
                await dialog.showMessageBox(mainWindow!, {
                    type: 'info',
                    message: 'No updates available.',
                    detail: 'You are running the latest version.',
                    buttons: ['OK'],
                });
            }

            cleanup();
            resolve();
        });

        autoUpdater.once('error', async (err: Error) => {
            if (handled) return;
            handled = true;
            log.error('Update check error:', err);
            cleanup();
            resolve();
        });

        autoUpdater.checkForUpdates().catch((err) => {
            log.error('Failed to check for updates:', err);
            cleanup();
            resolve();
        });
    });
}

let mainWindow: BrowserWindow | null = null;
const defaultBatchCache : any = {
    clips: [],
    video: null
}
let batchCache : any = defaultBatchCache;

const CACHE_DIR = path.join(os.tmpdir(), 'dub-editor-cache');
const CACHE_MAX_AGE = 24 * 60 * 60 * 1000;

try {
    if (fs.existsSync(CACHE_DIR)) {
        const now = Date.now();
        fs.readdirSync(CACHE_DIR).forEach(file => {
            const filePath = path.join(CACHE_DIR, file);
            try {
                const stat = fs.statSync(filePath);
                if (now - stat.mtimeMs > CACHE_MAX_AGE) { fs.unlinkSync(filePath); }
            } catch {}
        });
    }
} catch (err) {
    log.error('Cache cleanup error: ' + err);
}

try {
    const tmpDir = os.tmpdir();
    const oldPlaybackDirs = fs.readdirSync(tmpDir)
        .filter(d => d.startsWith('dub-editor-playback-'))
        .map(d => path.join(tmpDir, d));
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    for (const dir of oldPlaybackDirs) {
        try {
            if (fs.statSync(dir).mtimeMs < oneHourAgo) { fs.rmSync(dir, { recursive: true, force: true }); }
        } catch {}
    }
} catch (err) {
    log.error('Playback temp cleanup error: ' + err);
}

let detectedEncoder: string | null = null;

function getEncoder(): Promise<string> {
    return new Promise((resolve) => {
        if (detectedEncoder) { resolve(detectedEncoder); return; }
        ffmpeg.getAvailableEncoders((err: any, encoders: any) => {
            if (err) { detectedEncoder = 'libx264'; resolve(detectedEncoder); return; }
            if (encoders['h264_nvenc']?.canEncode) detectedEncoder = 'h264_nvenc';
            else if (encoders['h264_amf']?.canEncode) detectedEncoder = 'h264_amf';
            else if (encoders['h264_qsv']?.canEncode) detectedEncoder = 'h264_qsv';
            if (!detectedEncoder) {
                try {
                    const whichCmd = process.platform === 'win32' ? 'where' : 'which';
                    const systemFfmpeg = execSync(`${whichCmd} ffmpeg`, { encoding: 'utf8' }).split(/\r?\n/)[0]?.trim();
                    if (systemFfmpeg) {
                        const output = execSync(`"${systemFfmpeg}" -hide_banner -encoders`, { encoding: 'utf8', maxBuffer: 1024 * 1024 });
                        if (output.includes('h264_nvenc')) detectedEncoder = 'h264_nvenc';
                        else if (output.includes('h264_amf')) detectedEncoder = 'h264_amf';
                        else if (output.includes('h264_qsv')) detectedEncoder = 'h264_qsv';
                        if (detectedEncoder) {
                            log.info('Switching to system ffmpeg with ' + detectedEncoder + ': ' + systemFfmpeg);
                            ffmpeg.setFfmpegPath(systemFfmpeg);
                        }
                    }
                } catch (e) { log.info('System ffmpeg not available or lacks HW encoders'); }
            }
            if (!detectedEncoder) detectedEncoder = 'libx264';
            log.info('Using video encoder: ' + detectedEncoder);
            resolve(detectedEncoder);
        });
    });
}

function getCacheKey(filePath: string, trackIndex: number): string {
    try {
        const stat = fs.statSync(filePath);
        return crypto.createHash('md5').update(`${filePath}|${trackIndex}|${stat.mtimeMs}`).digest('hex');
    } catch {
        return crypto.createHash('md5').update(`${filePath}|${trackIndex}`).digest('hex');
    }
}

const defaultCollections: any = {
    whatthedub: {},
    rifftrax: {},
};
let collections: { [key: string]: any } = defaultCollections;

const createMediaFolders = (game: string) => {
    if (!config?.mediaDirectory) {
        return;
    }

    const {clips, subtitles, thumbnails, previewImage, logFile} = getDirectoriesForGame(game);
    fs.mkdirSync(clips, {recursive: true});
    fs.mkdirSync(subtitles, {recursive: true});
    fs.mkdirSync(thumbnails, {recursive: true});
    fs.mkdirSync(previewImage, {recursive: true});
    fs.mkdirSync(logFile, {recursive: true});
}

const processVideo = (inputFilePath: string, outputFilePath: string, startTime: number, duration: number, audioTrackIndex?: number) => {
    return new Promise((resolve, reject) => {
        log.info("PROCESSING " + inputFilePath);
        log.info("STORING TO " + outputFilePath);
        let cmd = ffmpeg(inputFilePath)
            .videoCodec("libx264")
            .audioCodec("aac")
            .audioBitrate("192k")
            .audioChannels(2)
            .audioFrequency(44100)
            .seekInput(startTime / 1000)
            .outputOptions(['-bf', '0', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-t', String(duration / 1000)]);

        const outputOpts: string[] = [];
        if (audioTrackIndex !== undefined) {
            outputOpts.push('-map', '0:v:0', '-map', `0:${audioTrackIndex}`);
        }
        if (outputOpts.length > 0) { cmd = cmd.outputOptions(outputOpts); }

        cmd.output(outputFilePath)
            .on('end', function(err: any) {
                if(!err) { resolve(0); }
            })
            .on('error', function(err: any){ reject(err); }).run();
    });
}

const trimAndWriteVideo = async (inputFilePath: string, outputFilePath: string, startTime: number, endTime: number, audioTrackIndex?: number) => {
    try {
        await processVideo(inputFilePath, outputFilePath, startTime, endTime - startTime, audioTrackIndex);
    } catch (err) {
        log.error("Unable to trim video: " + err);
        throw new Error("Unable to trim video: " + err);
    }
}

const createClipName = (title: string, clipNumber: number) => {
    return '_' + title.replace(' ', '_') + `-Clip${`${clipNumber}`.padStart(3, '0')}`;
};

const createThumbnail = async (videoFilePath: string, thumbnailTime: string, thumbFilePath: string) => {
    return new Promise((resolve, reject) => {
        ffmpeg(videoFilePath)
            .seekInput(thumbnailTime)
            .frames(1)
            .output(thumbFilePath)
            .on('end', () => {
                resolve(0);
            })
            .on('error', (err : any) => {
                log.error("Failed to create thumbnail: " + err);
                reject();
            })
            .run();
    });
}

const NORMALIZED_MARKER_SUFFIX = '.normalized';

const normalizeVideo = async (videoPath: string, cfg: any, audioTrackIndex?: number): Promise<boolean> => {
    const markerPath = videoPath + NORMALIZED_MARKER_SUFFIX;

if (fs.existsSync(markerPath)) {
        try {
            const marker = JSON.parse(fs.readFileSync(markerPath, 'utf-8'));
            if (
                marker.loudnessTarget === cfg.audioLoudnessTarget &&
                marker.drcEnabled === cfg.audioDrcEnabled &&
                marker.drcThreshold === cfg.audioDrcThreshold &&
                marker.drcRatio === cfg.audioDrcRatio &&
                marker.drcAttack === cfg.audioDrcAttack &&
                marker.drcRelease === cfg.audioDrcRelease
            ) {
                log.info('Audio already normalized, skipping');
                return true;
            }
        } catch {}
    }

    let duration: number;
    try {
        duration = await new Promise<number>((resolve, reject) => {
            ffmpeg.ffprobe(videoPath, (err: any, metadata: any) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(parseFloat(metadata.format?.duration || '0'));
                }
            });
        });
    } catch (err) {
        log.warn('ffprobe failed, skipping normalization: ' + err);
        return true;
    }

    return new Promise((resolve) => {
        try {
            const filters: string[] = [];

            if (cfg.audioDrcEnabled) {
                const threshold = Math.pow(10, cfg.audioDrcThreshold / 20);
                filters.push(
                    `acompressor=threshold=${threshold}:ratio=${cfg.audioDrcRatio}:attack=${cfg.audioDrcAttack * 1000}:release=${cfg.audioDrcRelease * 1000}`
                );
            }

            if (cfg.audioLoudnessTarget !== undefined && cfg.audioLoudnessTarget !== null) {
                const target = Math.max(-30, Math.min(-5, cfg.audioLoudnessTarget));
                filters.push(`loudnorm=I=${target}:LRA=7:TP=-1:linear=true`);
            } else if (cfg.audioDrcEnabled) {
                filters.push('dynaudnorm=peak=0.95');
            }

            const tmpOutput = videoPath + '.normalizing.mp4';
            let attempt = 0;

            const runNormalize = (filterChain: string[]) => {
                attempt++;
                let cmd = ffmpeg(videoPath)
                    .videoCodec('copy')
                    .audioCodec('aac')
                    .audioBitrate('192k')
                    .audioChannels(2)
                    .audioFrequency(44100)
                    .setDuration(duration);

                const normOpts: string[] = [];
                if (audioTrackIndex !== undefined) {
                    normOpts.push('-map', '0:v:0', '-map', `0:${audioTrackIndex}`);
                }
                if (normOpts.length > 0) { cmd = cmd.outputOptions(normOpts); }

                if (filterChain.length > 0) {
                    cmd.audioFilters(filterChain.join(','));
                }

                cmd.output(tmpOutput)
                    .on('end', () => {
                        try {
                            fs.renameSync(tmpOutput, videoPath);
                            fs.writeFileSync(
                                markerPath,
                                JSON.stringify({
                                    normalizedAt: new Date().toISOString(),
                                    loudnessTarget: cfg.audioLoudnessTarget,
                                    drcEnabled: cfg.audioDrcEnabled,
                                    drcThreshold: cfg.audioDrcThreshold,
                                    drcRatio: cfg.audioDrcRatio,
                                    drcAttack: cfg.audioDrcAttack,
                                    drcRelease: cfg.audioDrcRelease,
                                })
                            );
                            log.info('Audio normalized: ' + videoPath);
                            resolve(true);
                        } catch (err) {
                            log.error('Normalize swap failed: ' + err);
                            try { fs.unlinkSync(tmpOutput); } catch {}
                            resolve(false);
                        }
                    })
                    .on('error', (err: any, _stdout: string, stderr: string) => {
                        const errMsg = stderr || String(err);
                        if (attempt === 1 && cfg.audioDrcEnabled && filters.length > 0) {
                            log.info('Normalize DRC chain failed, retrying gain-only');
                            log.info('FFmpeg error: ' + errMsg.substring(0, 300));
                            const gainFilters: string[] = [];
                            if (cfg.audioLoudnessTarget !== undefined && cfg.audioLoudnessTarget !== null) {
                                const target = Math.max(-30, Math.min(-5, cfg.audioLoudnessTarget));
                                gainFilters.push(`loudnorm=I=${target}:LRA=7:TP=-1:linear=true`);
                            }
                            runNormalize(gainFilters);
                        } else {
                            log.error('Normalize failed: ' + errMsg);
                            try { fs.unlinkSync(tmpOutput); } catch {}
                            resolve(false);
                        }
                    })
                    .run();
            };

            runNormalize(filters);
        } catch (err) {
            log.error('Normalize setup failed: ' + err);
            resolve(false);
        }
    });
};

const getDirectoriesForGame = (game: string) : DirectoryList => {
    return {
        clips:          path.join(config.mediaDirectory, game, VIDEO_SUB_DIRECTORY),
        subtitles:      path.join(config.mediaDirectory, game, SUBTITLE_SUB_DIRECTORY),
        thumbnails:     path.join(config.mediaDirectory, game, THUMBNAIL_SUB_DIRECTORY),
        previewImage:   path.join(config.mediaDirectory, game, PREVIEW_IMAGE_SUB_DIRECTORY),
        logFile: path.join(config.mediaDirectory, LOGS_SUBDIRECTORY),
        collectionMeta: path.join(config.mediaDirectory, COLLECTIONS_FILE),
        batchCacheMeta: path.join(config.mediaDirectory, BATCH_CACHE_FILE),
    }
}

const getConfigDirectories = () : DirectoryList => {
    return {
        clips:          '',
        subtitles:      '',
        thumbnails:     '',
        previewImage:   '',
        logFile: path.join(config.mediaDirectory, LOGS_SUBDIRECTORY),
        collectionMeta: path.join(config.mediaDirectory, COLLECTIONS_FILE),
        batchCacheMeta: path.join(config.mediaDirectory, BATCH_CACHE_FILE),
    }
}

const getClipPaths = (videoId: string, game: string): ClipPaths => {
    const {clips, subtitles, thumbnails} = getDirectoriesForGame(game);

    return {
        clip: path.join(clips, `${videoId}.mp4`),
        subtitle: path.join(subtitles, `${videoId}.srt`),
        thumbnail: path.join(thumbnails, `${videoId}.jpg`)
    }
}

const addToCollection = (
    game: string,
    collectionId: string,
    videoIdList: Array<string>
) => {
    log.info(
        `ADDING ${videoIdList} for game ${game} to collection ${collectionId}`
    );

    // If the collection isn't present, create a key and an empty array for it.
    if (!(collectionId in collections[game])) {
        collections[game][collectionId] = [];
    }

    videoIdList.forEach((videoId) => {
        // Add video id to collection list if it's not already present.
        if (!collections[game][collectionId].includes(videoId)) {
            collections[game][collectionId].push(videoId);
        }
    });

    const {collectionMeta} = getConfigDirectories();

    log.info("WRITING TO " + collectionMeta);

    // Store updated file
    fs.writeFileSync(collectionMeta, JSON.stringify(collections, null, 5));
    return collections[game];
};

const removeFromCollection = (game: string, collectionId: string, videoId: string) => {
    log.info(
        `REMOVING ${videoId} for game ${game} from collection ${collectionId}`
    );

    // If the collection isn't present, return immediately.
    if (!(collectionId in collections[game])) {
        log.info("COLLECTION NOT PRESENT");
        return;
    }

    // Filter out videoId that's being removed.
    collections[game][collectionId] = collections[game][collectionId].filter(
        (element: string) => element !== videoId
    );

    const {collectionMeta} = getConfigDirectories();

    // Store updated file
    fs.writeFileSync(
        collectionMeta,
        JSON.stringify(collections, null, 5)
    );
}

const importZip = async (filePath: string, game: string) => {
    // Extract video names from zip
    const zip = new StreamZip.async({ file: filePath });
    const entries = await zip.entries();

    const videoDirectoryStack = ['StreamingAssets', 'VideoClips'];
    const videoCorrectionStack = [];
    let videoSource = '';
    while (videoDirectoryStack.length > 0) {
        const videoSearchDirectory = videoDirectoryStack.join('/');
        const foundEntry: any = Object.values(entries).find((entry: any) =>
            entry.name
                .toLowerCase()
                .startsWith(videoSearchDirectory.toLowerCase())
        );
        if (foundEntry) {
            videoSource = foundEntry.name.substring(
                0,
                foundEntry.name.lastIndexOf('/')
            );
            break;
        }
        videoCorrectionStack.push(videoDirectoryStack.shift());
    }

    const subtitleDirectoryStack = ['StreamingAssets', 'Subtitles'];
    const subtitleCorrectionStack = [];
    let subtitleSource = '';
    while (subtitleDirectoryStack.length > 0) {
        const subtitleSearchDirectory = subtitleDirectoryStack.join('/');
        const foundEntry: any = Object.values(entries).find((entry: any) =>
            entry.name
                .toLowerCase()
                .startsWith(subtitleSearchDirectory.toLowerCase())
        );
        if (foundEntry) {
            subtitleSource = foundEntry.name.substring(
                0,
                foundEntry.name.lastIndexOf('/')
            );
            break;
        }
        subtitleCorrectionStack.push(subtitleDirectoryStack.shift());
    }

    // Extract video files to resources folder
    const sourceVideoDirectory = `${videoSource}/`;
    const sourceSubtitlesDirectory = `${subtitleSource}/`;

    const {clips: targetVideoDirectory, subtitles: targetSubtitlesDirectory, thumbnails: targetThumbNailsDirectory, previewImage} = getDirectoriesForGame(game);

    Object.values(entries).forEach((entry: any) => log.info(entry.name));

    // Try with standard directory names
    await zip.extract(sourceVideoDirectory, targetVideoDirectory);
    await zip.extract(sourceSubtitlesDirectory, targetSubtitlesDirectory);
    await zip.extract('thumbnails', targetThumbNailsDirectory);

    const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.webm'];

    const videoIdList = Object.values(entries)
        .filter(
            (entry: any) =>
                entry.name
                    .toLowerCase()
                    .startsWith(sourceVideoDirectory.toLowerCase()) &&
                videoExtensions.some(ext => entry.name.toLowerCase().endsWith(ext))
        )
        .map((entry: any) => {
            const ext = videoExtensions.find(e => entry.name.toLowerCase().endsWith(e));
            return {
                id: entry.name.substring(
                    entry.name.lastIndexOf('/') + 1,
                    entry.name.lastIndexOf(ext)
                ),
                ext,
            };
        });

    // Convert non-mp4 files to mp4 after extraction
    for (const {id, ext} of videoIdList) {
        if (ext !== '.mp4') {
            const srcPath = path.join(targetVideoDirectory, `${id}${ext}`);
            const dstPath = path.join(targetVideoDirectory, `${id}.mp4`);
            if (fs.existsSync(srcPath)) {
                try {
                    log.info(`Converting extracted ${ext} to mp4: ${id}`);
                    await convertToCompatible(srcPath, dstPath);
                    fs.unlinkSync(srcPath);
                } catch (err) {
                    log.error(`Failed to convert ${id}: ${err}`);
                }
            }
        }
    }

    const ids = videoIdList.map(v => v.id);

    // Rename videos so they will be treated as custom clips
    const clipsDirectory = targetVideoDirectory;
    const subsDirectory = targetSubtitlesDirectory;
    const mismatchedIds: string[] = [];
    ids.forEach((videoId) => {
        if (videoId.startsWith('_')) {
            return;
        }
        if (
            fs.existsSync(path.join(clipsDirectory, `${videoId}.mp4`)) &&
            fs.existsSync(path.join(subsDirectory, `${videoId}.srt`))
        ) {
            fs.renameSync(
                path.join(clipsDirectory, `${videoId}.mp4`),
                path.join(clipsDirectory, `_${videoId}.mp4`)
            );
            fs.renameSync(
                path.join(subsDirectory, `${videoId}.srt`),
                path.join(subsDirectory, `_${videoId}.srt`)
            );
        } else {
            log.error('MISMATCHED FILES FOUND');
            if (fs.existsSync(path.join(clipsDirectory, `${videoId}.mp4`))) {
                fs.unlinkSync(path.join(clipsDirectory, `${videoId}.mp4`));
            }
            if (fs.existsSync(path.join(subsDirectory, `${videoId}.srt`))) {
                fs.unlinkSync(path.join(subsDirectory, `${videoId}.srt`));
            }
            mismatchedIds.push(videoId);
        }
    });

    // Create and add a collection
    const collectionId: string = filePath.substring(
        filePath.lastIndexOf(path.sep) + 1,
        filePath.lastIndexOf('.zip')
    );

    await zip.extract('preview.jpg', path.join(previewImage, `${collectionId}.jpg`))
    await zip.close();

    addToCollection(
        game,
        collectionId,
        ids
            .filter((videoId: string) => !mismatchedIds.includes(videoId))
            .map((videoId) => {
                if (videoId.startsWith('_')) {
                    return videoId;
                }
                return `_${videoId}`;
            })
    );
};

const exportToZip = async (
    filePath: string,
    collectionId: string,
    game: string
) => {
    const zipFilePath = `${filePath}/${collectionId}.zip`;

    const zip: JSZip = new JSZip();
    zip.file(zipFilePath);

    const root = zip.folder('');

    // Store preview image
    const {previewImage: previewImageDirectory} = getDirectoriesForGame(game);
    let previewImagePath = path.join(previewImageDirectory, `${collectionId}.jpg`);

    if (!fs.existsSync(previewImagePath)) {
        previewImagePath = defaultPreviewFilePath;
    }

    const previewImageBase64: string = fs.readFileSync(previewImagePath, {
        encoding: 'base64',
    });

    // @ts-ignore
    root.file('preview.jpg', previewImageBase64, {
        base64: true,
    });

    for (const videoId of collections[game][collectionId]) {
        const {clip: videoFilePath, subtitle: subFilePath, thumbnail: thumbFilePath} = getClipPaths(videoId, game);
        
        if (!fs.existsSync(videoFilePath) || !fs.existsSync(subFilePath)) {
            log.info("SKIPPING " + videoId);
            continue;
        } 

        if (!fs.existsSync(thumbFilePath)) {
            await createThumbnail(videoFilePath, '00:00:01', thumbFilePath);
        }

        const videoBase64: string = fs.readFileSync(videoFilePath, {
            encoding: 'base64',
        });
        const subtitlesBase64: string = fs.readFileSync(subFilePath, {
            encoding: 'base64',
        });
        const thumbNailBase64: string = fs.readFileSync(thumbFilePath, {
            encoding: 'base64',
        });
        // @ts-ignore
        root.folder('videoclips').file(`${videoId}.mp4`, videoBase64, {
            base64: true,
        });
        // @ts-ignore
        root.folder('subtitles').file(`${videoId}.srt`, subtitlesBase64, {
            base64: true,
        });
        // @ts-ignore
        root.folder('thumbnails').file(`${videoId}.jpg`, thumbNailBase64, {
            base64: true,
        });
    }

    zip.generateNodeStream({ streamFiles: true }).pipe(
        fs.createWriteStream(zipFilePath)
    );
};

const deleteClip = (id: string, game: string) => {
    log.info('DELETING ' + id + ' FOR GAME ' + game);

    const {clip: videoFilePath, subtitle: subFilePath, thumbnail: thumbnailFilePath} = getClipPaths(id, game);

    log.info('DELETING ' + videoFilePath);
    log.info('DELETING ' + subFilePath);
    log.info('DELETING ' + thumbnailFilePath);

    // Delete video files
    if (fs.existsSync(videoFilePath)) {
        fs.unlinkSync(videoFilePath);
    }

    // Delete subtitle files
    if (fs.existsSync(subFilePath)) {
        fs.unlinkSync(subFilePath);
    }

    if (fs.existsSync(thumbnailFilePath)) {
        fs.unlinkSync(thumbnailFilePath);
    }

    // Remove references to video in collections
    Object.keys(collections[game]).forEach((collectionId) => {
        collections[game][collectionId] = collections[game][
            collectionId
        ].filter((videoId: string) => videoId !== id);
    });
};

const createMetaDataFiles = () => {
    if (!config.mediaDirectory) {
        return;
    }

    if (!fs.existsSync(config.mediaDirectory)) {
        fs.mkdirSync(config.mediaDirectory);
    }

    const {collectionMeta, batchCacheMeta} = getConfigDirectories();

    // If config doesn't exist, then create it
    if (!fs.existsSync(CONFIG_FILE)) {
        fs.mkdirSync(HOME, { recursive: true });
        fs.writeFileSync(CONFIG_FILE, Buffer.from(JSON.stringify(config, null, 5)));
    } else {
        config = JSON.parse(fs.readFileSync(CONFIG_FILE, {}).toString());
        config = { ...defaultConfig, ...config };
    }

    // If batch storage doesn't exist, then create it
    if (!fs.existsSync(batchCacheMeta)) {
        log.info("CREATING BATCH CACHE " + batchCacheMeta);
        fs.mkdirSync(HOME, { recursive: true });
        fs.writeFileSync(
            batchCacheMeta,
            Buffer.from(JSON.stringify(batchCache, null, 5))
        );
        batchCache = defaultBatchCache;
    } else {
        batchCache = JSON.parse(fs.readFileSync(batchCacheMeta, {}).toString());
    }

    // Load default collections, and if the file for collections doesn't exist create it
    if (!fs.existsSync(collectionMeta)) {
        log.info("CREATING COLLECTIONS");
        fs.mkdirSync(HOME, { recursive: true });
        fs.writeFileSync(
            collectionMeta,
            Buffer.from(JSON.stringify(collections, null, 5))
        );
        collections = defaultCollections;
    } else {
        log.info("READING COLLECTIONS");
        collections = JSON.parse(fs.readFileSync(collectionMeta, {}).toString());
    }
}

const updateLogLocation = () => {
    const {logFile} = getConfigDirectories();
    const logFilePath = path.join(logFile, LOG_FILE);
    log.info("LOG LOCATION: " + logFilePath);
    log.info("HOME DIRECTORY: " + __dirname);
    log.info("FFMPEG PATH: " + ffmpegPath);
    log.info("DEFAULT PREVIEW IMAGE: " + defaultPreviewFilePath);
    log.transports.file.fileName = logFilePath;
    log.transports.file.resolvePath = () => logFilePath;
    log.transports.file.level = 'info';
}

// Load default config
let config = defaultConfig;
if (process.platform === 'darwin') {
    config.isMac = true;
}

// If config doesn't exist, then create it
if (!fs.existsSync(CONFIG_FILE)) {
    fs.mkdirSync(HOME, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, Buffer.from(JSON.stringify(config, null, 5)));
} else {
    config = JSON.parse(fs.readFileSync(CONFIG_FILE, {}).toString());
    // Ensure all default fields exist (in case config is from an older version)
    config = { ...defaultConfig, ...config };
    if (config.mediaDirectory) {
        updateLogLocation();
    }
}

createMetaDataFiles();

if (process.env.NODE_ENV === 'production') {
    const sourceMapSupport = require('source-map-support');
    sourceMapSupport.install();
}

const isDebug =
    process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

// if (isDebug) {
require('electron-debug')();
// }

const installExtensions = async () => {
    const installer = require('electron-devtools-installer');
    const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
    const extensions = ['REACT_DEVELOPER_TOOLS'];

    return installer
        .default(
            extensions.map((name) => installer[name]),
            forceDownload
        )
        .catch(log.error);
};

const createWindow = async () => {
    if (isDebug) {
        await installExtensions();
    }

    const RESOURCES_PATH = app.isPackaged
        ? path.join(process.resourcesPath, 'assets')
        : path.join(__dirname, '../../assets');

    const getAssetPath = (...paths: string[]): string => {
        return path.join(RESOURCES_PATH, ...paths);
    };

    mainWindow = new BrowserWindow({
        show: false,
        width: 1920,
        height: 1080,
        icon: getAssetPath('icon.png'),
        webPreferences: {
            sandbox: false,
            contextIsolation: true,
            preload: app.isPackaged
                ? path.join(__dirname, 'preload.js')
                : path.join(__dirname, '../../.erb/dll/preload.js'),
        },
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    mainWindow.loadURL(resolveHtmlPath('index.html'));

    mainWindow.on('ready-to-show', () => {
        if (!mainWindow) {
            throw new Error('"mainWindow" is not defined');
        }
        if (process.env.START_MINIMIZED) {
            mainWindow.minimize();
        } else {
            mainWindow.show();
        }

        // mainWindow.webContents.openDevTools();

        setTimeout(() => {
            checkForUpdatesAndPrompt(true);
        }, 3000);
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    const menuBuilder = new MenuBuilder(mainWindow);
    menuBuilder.buildMenu();

    // Open urls in the user's browser
    mainWindow.webContents.setWindowOpenHandler((edata) => {
        shell.openExternal(edata.url);
        return { action: 'deny' };
    });

    protocol.interceptFileProtocol('localfile', (request, callback) => {
        const filePath = decodeURIComponent(request.url.replace(/^localfile:\/{2,}/, ''));
        log.info("OLD localfile: " + filePath);
        callback(filePath);
    });

    protocol.interceptFileProtocol('game', async (request, callback) => {
        const url = request.url.substring('game://'.length);
        const pattern = /^(rifftrax|whatthedub)\/(.+)\.(mp4|srt|jpg)$/;
        const match : any = url.match(pattern);
        if (!match) { return null; }
        const game = match[1];
        const id = decodeURIComponent(match[2]);
        const ext = match[3];
        const {clip, subtitle, thumbnail} = getClipPaths(id, game);
        try {
            if (ext === 'mp4') { callback(clip); }
            else if (ext === 'srt') { callback(subtitle); }
            else if (ext === 'jpg') {
                if (!fs.existsSync(thumbnail) && fs.existsSync(clip)) {
                    await createThumbnail(clip, '00:00:01', thumbnail);
                }
                callback(thumbnail);
            } else { callback(clip); }
        } catch (error) { log.warn("Cannot fetch file " + id + "." + ext); }
        return;
    });
};

const MIME_TYPES: Record<string, string> = {
    mp4: 'video/mp4', mkv: 'video/x-matroska', webm: 'video/webm',
    mov: 'video/quicktime', avi: 'video/x-msvideo',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    srt: 'text/plain', vtt: 'text/vtt',
};

const MAX_CHUNK = 4 * 1024 * 1024;

function serveFile(filePath: string, mime: string, rangeHeader: string | null): Response {
    log.info('SERVE: ' + filePath + ' mime=' + mime + ' range=' + (rangeHeader || 'none'));
    if (!fs.existsSync(filePath)) {
        log.warn('SERVE not found: ' + filePath);
        return new Response('Not found', { status: 404 });
    }
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    if (rangeHeader) {
        const match = rangeHeader.replace(/bytes=/, '').match(/(\d*)-(\d*)/);
        if (match) {
            let start = parseInt(match[1], 10);
            let end = parseInt(match[2], 10);
            if (isNaN(start)) { start = Math.max(0, fileSize + start); end = fileSize - 1; }
            else { if (isNaN(end) || end >= fileSize) end = Math.min(fileSize - 1, start + MAX_CHUNK - 1); }
            const chunkSize = end - start + 1;
            const buf = Buffer.alloc(chunkSize);
            const fd = fs.openSync(filePath, 'r');
            fs.readSync(fd, buf, 0, chunkSize, start);
            fs.closeSync(fd);
            const data = buf;
            return new Response(data, {
                status: 206,
                headers: {
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Content-Type': mime,
                    'Content-Length': String(chunkSize),
                    'Accept-Ranges': 'bytes',
                }
            });
        }
    }
    const data = fs.readFileSync(filePath);
    return new Response(data, {
        status: 200,
        headers: {
            'Content-Type': mime,
            'Content-Length': String(fileSize),
            'Accept-Ranges': 'bytes',
        }
    });
}

protocol.registerSchemesAsPrivileged([
    { scheme: 'localfile', privileges: { secure: true, bypassCSP: true, corsEnabled: true, stream: true, supportFetchAPI: true } },
    { scheme: 'game', privileges: { standard: true, secure: true, bypassCSP: true, corsEnabled: true, stream: true, supportFetchAPI: true } },
]);

app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport,MojoMediaAudioDecoder,PlatformAudioDecoder');

app.whenReady()
    .then(() => {
        protocol.handle('localfile', async (request) => {
            const rawPath = request.url.substring('localfile:///'.length);
            const filePath = decodeURIComponent(rawPath.startsWith('/') ? rawPath.substring(1) : rawPath);
            log.info("NEW localfile: " + filePath);
            try {
                const ext = path.extname(filePath).replace('.', '').toLowerCase();
                const mime = MIME_TYPES[ext] || 'application/octet-stream';
                return serveFile(filePath, mime, request.headers.get('Range'));
            } catch (err) {
                log.error('localfile handler error: ' + err);
                return new Response('Not found', { status: 404 });
            }
        });
        protocol.handle('game', async (request) => {
            log.info('NEW game: ' + request.url);
            const url = request.url.substring('game://'.length);
            log.info('GAME afterPrefix: ' + url);
            const pattern = /^(rifftrax|whatthedub)\/(.+)\.(mp4|srt|jpg)$/;
            const match : any = url.match(pattern);
            if (!match) { log.warn('GAME no match'); return new Response('Not found', { status: 404 }); }
            const game = match[1];
            const id = decodeURIComponent(match[2]);
            const ext = match[3];
            log.info('GAME parsed: game=' + game + ' id=' + id + ' ext=' + ext);
            const {clip, subtitle, thumbnail} = getClipPaths(id, game);
            log.info('GAME paths: clip=' + clip);
            try {
                let filePath;
                if (ext === 'mp4') { filePath = clip; }
                else if (ext === 'srt') { filePath = subtitle; }
                else if (ext === 'jpg') {
                    if (!fs.existsSync(thumbnail) && fs.existsSync(clip)) {
                        await createThumbnail(clip, '00:00:01', thumbnail);
                    }
                    filePath = thumbnail;
                } else { filePath = clip; }
                log.info('GAME resolved: ' + filePath + ' exists=' + fs.existsSync(filePath));
                const mime = MIME_TYPES[ext] || 'application/octet-stream';
                const result = serveFile(filePath, mime, request.headers.get('Range'));
                log.info('GAME returning response for ext=' + ext);
                return result;
            } catch (error) {
                log.warn("GAME error: " + id + "." + ext + " " + error);
                return new Response('Not found', { status: 404 });
            }
        });
        createWindow();
        setupAutoUpdater();
        app.on('activate', () => {
            if (mainWindow === null) createWindow();
        });
    })
    .catch(log.error);

createMediaFolders('rifftrax');
createMediaFolders('whatthedub');

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') { app.quit(); }
});

app.on('render-process-gone', (_event, _webContents, details) => {
    log.error(`Render process gone (reason: ${details.reason}, exitCode: ${details.exitCode})`);
    if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.reload(); }
});

// Bridged functionality

ipcMain.handle('fileExists', (event, filePath) => {
    const exists = fs.existsSync(filePath);
    return exists;
});

ipcMain.handle('clipExists', (event, { title, clipNumber, game }) => {
    const id = createClipName(title, clipNumber);
    const {clip: videoFilePath} = getClipPaths(id, game);

    const exists =
        fs.existsSync(videoFilePath);

    return exists;
});

ipcMain.handle('findAvailableClipNumber', (event, { title, startNumber, game }) => {
    const MAX_ITERATIONS = 10000;
    for (let i = startNumber; i < startNumber + MAX_ITERATIONS; i++) {
        const id = createClipName(title, i);
        const {clip: videoFilePath} = getClipPaths(id, game);
        if (!fs.existsSync(videoFilePath)) {
            return i;
        }
    }
    return null;
});

ipcMain.handle('updateConfig', (event, newConfig) => {
    log.info('CONFIG: ' + JSON.stringify(newConfig));
    config = { ...config, ...newConfig };
    fs.writeFileSync(CONFIG_FILE, Buffer.from(JSON.stringify(config, null, 5)));
    createMediaFolders('rifftrax');
    createMediaFolders('whatthedub');
    createMetaDataFiles();
    
    updateLogLocation();
    
    return;
});

ipcMain.handle('getConfig', () => {
    return config;
});

ipcMain.handle('storeBatch', async (event, { clips, video, title, audioTrackIndex }) => {
    batchCache = {
        video,
        title,
        clipNumber: 1,
        clips,
        audioTrackIndex,
    };

    const {batchCacheMeta} = getConfigDirectories();

    // Write cache file
    fs.writeFileSync(
        batchCacheMeta,
        Buffer.from(JSON.stringify(batchCache, null, 5))
    );
});

ipcMain.handle('hasBatch', (_event) => {
    return batchCache.clips.length;
});

ipcMain.handle('nextBatchClip', (_event) => {
    return {
        title: batchCache.title,
        clipNumber: batchCache.clipNumber,
        clip: batchCache.clips[0],
        video: batchCache.video,
        audioTrackIndex: batchCache.audioTrackIndex,
    };
});

ipcMain.handle('processBatchClip', async (event, {videoSource, subtitles, subtitleObjects, title, clipNumber, game, audioTrackIndex}) => {
    log.info(`STORING ${title}-${clipNumber} for game ${game} with subtitles ${subtitles}`);
    log.info(`SUBTITLE OBJECTS: \n${JSON.stringify(subtitleObjects, null, 5)}`);

    createMediaFolders(game);

    const {batchCacheMeta} = getConfigDirectories();

    const clip : any = batchCache.clips[0];

    if (clip) {
        const id = createClipName(title, clipNumber);
        const {clip: videoFilePath, subtitle: subFilePath} = getClipPaths(id, game);

        await trimAndWriteVideo(fromLocalfileUrl(videoSource), videoFilePath, clip.startTime, clip.endTime, audioTrackIndex);

        try { fs.unlinkSync(videoFilePath + NORMALIZED_MARKER_SUFFIX); } catch {}

        fs.writeFileSync(subFilePath, subtitles);

        if (config.audioNormalizeOnFinalize) {
            normalizeVideo(videoFilePath, config, audioTrackIndex);
        }

        // Remove the clip from batch on completion
        batchCache.clips.shift();
        batchCache.clipNumber++;
        fs.writeFileSync(
            batchCacheMeta,
            Buffer.from(JSON.stringify(batchCache, null, 5))
        );

        return id;
    } else {
        throw new Error("No batches left to process");
    }
});

ipcMain.handle('clearBatchCache', (_event) => {
    batchCache = {
        clips: [],
        video: null,
    };
    fs.writeFileSync(
        BATCH_CACHE_FILE,
        Buffer.from(JSON.stringify(batchCache, null, 5))
    );
});

ipcMain.handle('getVideos', (event, game) => {
    const {clips: clipsDirectory} = getDirectoriesForGame(game);

    const files = fs.readdirSync(clipsDirectory);
    const fileObjects: Array<any> = files
        .filter(
            (file) => file.endsWith('.mp4')
        )
        .map((file) => {
            return {
                _id: file.substring(0, file.lastIndexOf('.mp4')),
                name: file
                    .replace(/_/g, ' ')
                    .substring(0, file.lastIndexOf('.mp4')),
                game,
                disabled: false,
            };
        });
    return fileObjects;
});

ipcMain.handle('getVideo', (event, { id, game }) => {
    log.info('OPENING: ' + id + ' from game ' + game);

    const {clip: videoFilePath, subtitle: subFilePath} = getClipPaths(id, game);

    const subtitles: string = fs.readFileSync(subFilePath, {
        encoding: 'base64',
    });

    const videoUrl = `localfile:///${videoFilePath.replace(/\\/g, '/')}`;
    log.info('GETVIDEO url=' + videoUrl + ' exists=' + fs.existsSync(videoFilePath));

    return {
        name: id.replace(/_/g, ' '),
        videoUrl,
        subtitles: [],
        srtBase64: subtitles,
    };
});

ipcMain.handle('getPreviewImage', (event, { collectionId, game }) => {
    log.info('OPENING: ' + collectionId + ' from game ' + game);

    const {previewImage} = getDirectoriesForGame(game);

    const previewImagePath: string = path.join(previewImage, `${collectionId}.jpg`);

    log.info("Opening " + previewImagePath);

    if (!fs.existsSync(previewImagePath)) {
        log.info("File doesn't exist?");
        return {
            name: 'Unknown',
            imageUrl: null
        }
    }

    const previewImageBase64: string = fs.readFileSync(previewImagePath, {
        encoding: 'base64',
    });

    return {
        name: collectionId.replace(/_/g, ' '),
        imageUrl: `data:image/jpeg;base64,${previewImageBase64}`
    };
});

ipcMain.handle(
    'renameVideo',
    (event, { id, newTitle, game, collectionId }) => {
        log.info(
            `RENAMING ${id} to new title ${newTitle} in collection ${collectionId} for game ${game}`
        );

        const newId = newTitle.replaceAll(' ', '_');

        const {clip: videoFilePath, subtitle: subFilePath, thumbnail: thumbNailPath} = getClipPaths(id, game);
        const {clip: newVideoFilePath, subtitle: newSubFilePath, thumbnail: newThumbNailPath} = getClipPaths(newId, game);

        log.info(`RENAMING ${videoFilePath} to ${newVideoFilePath}`);
        fs.renameSync(videoFilePath, newVideoFilePath);

        log.info(`RENAMING ${subFilePath} to ${newSubFilePath}`);
        fs.renameSync(subFilePath, newSubFilePath);

        log.info(`RENAMING ${thumbNailPath} to ${newThumbNailPath}`);
        fs.renameSync(thumbNailPath, newThumbNailPath);

        removeFromCollection(game, collectionId, id);
        addToCollection(game, collectionId, [newId]);
    }
);

ipcMain.handle(
    'storeVideo',
    async (event, { videoSource, subtitles, subtitleObjects, title, clipNumber, game, audioTrackIndex }) => {
        log.info(`STORING ${title}-${clipNumber} for game ${game} with subtitles \n${subtitles}`);
        log.info(`SUBTITLE OBJECTS: \n${JSON.stringify(subtitleObjects, null, 5)}`);

        createMediaFolders(game);

        const id = createClipName(title, clipNumber);
        const {clip: videoFilePath, subtitle: subFilePath, thumbnail: thumbNailPath} = getClipPaths(id, game);

        if (videoSource.startsWith("localfile://")) {
            log.info('SAVING VIDEO TO ' + videoFilePath + '\n' + subFilePath);

            const sourcePath = fromLocalfileUrl(videoSource);

            const isSelfCopy = path.resolve(sourcePath) === path.resolve(videoFilePath);

            if (!isSelfCopy) {
                if (audioTrackIndex !== undefined) {
                    log.info('Using audio track index: ' + audioTrackIndex + ' (stream copy)');
                    await new Promise((resolve, reject) => {
                        ffmpeg(sourcePath)
                            .videoCodec('copy').audioCodec('copy')
                            .outputOptions(['-map', '0:v:0', '-map', '0:' + audioTrackIndex])
                            .output(videoFilePath)
                            .on('end', resolve)
                            .on('error', (err: Error) => { log.error('Stream copy failed: ' + err); reject(err); })
                            .run();
                    });
                } else {
                    const compatible = await isCompatible(sourcePath);
                    if (!compatible) {
                        log.info('Source video is not compatible, converting...');
                        const tmpPath = videoFilePath + '.converting.mp4';
                        await convertToCompatible(sourcePath, tmpPath);
                        fs.copyFileSync(tmpPath, videoFilePath);
                        try { fs.unlinkSync(tmpPath); } catch {}
                    } else {
                        fs.copyFileSync(sourcePath, videoFilePath);
                    }
                }
                try { fs.unlinkSync(videoFilePath + NORMALIZED_MARKER_SUFFIX); } catch {}
            } else {
                log.info('Source is same as destination, skipping video copy');
            }

            await createThumbnail(videoFilePath, '00:00:01', thumbNailPath);
        }
        log.info('SAVING SUBS TO ' + subFilePath);
        fs.writeFileSync(subFilePath, subtitles);

        if (config.audioNormalizeOnFinalize) {
            await normalizeVideo(videoFilePath, config, audioTrackIndex);
        }

        return id;
    }
);

ipcMain.handle(
    'storePreviewImage',
    (event, { collectionId, imageBase64, game }) => {
        log.info(
            `STORING ${collectionId} for game ${game}`
        );

        const {previewImage} = getDirectoriesForGame(game);

        // Store the videos disabled by default to allow testing via collection
        const previewImagePath = path.join(previewImage, `${collectionId}.jpg`);

        log.info('SAVING TO ' + previewImagePath);

        fs.writeFileSync(previewImagePath, imageBase64.split(';base64,').pop(), {encoding: 'base64'});
    }
);

ipcMain.handle('deleteVideo', (event, { id, game }) => {
    deleteClip(id, game);
});

ipcMain.handle('createCollection', (event, { collectionId, game }) => {
    log.info(`CREATING COLLECTION ${collectionId} for game ${game}`);

    // If the collection isn't present, create a key and an empty array for it.
    if (!(collectionId in collections[game])) {
        collections[game][collectionId] = [];
    }

    const {collectionMeta} = getConfigDirectories();

    // Store updated file
    fs.writeFileSync(collectionMeta, JSON.stringify(collections, null, 5));

    return collections[game];
});

ipcMain.handle(
    'deleteCollection',
    (event, { collectionId, game, deleteFiles }) => {
        log.info(`DELETING COLLECTION ${collectionId} for game ${game}`);

        // If the collection isn't present, create a key and an empty array for it.
        if (
            !(collectionId in collections[game]) &&
            collectionId !== 'Originals'
        ) {
            return;
        }

        // If delete files, delete files with collection
        if (deleteFiles) {
            log.info('DELETING FILES FROM COLLECTION');
            collections[game][collectionId].forEach((id: string) => {
                deleteClip(id, game);
            });
        }

        const {previewImage} = getDirectoriesForGame(game);
        const previewImagePath = path.join(previewImage, `${collectionId}.jpg`);
        if (fs.existsSync(previewImagePath)) {
            fs.unlinkSync(previewImagePath);
        }
        log.info("DELETING PREVIEW IMAGE: " + previewImagePath);

        delete collections[game][collectionId];
        const {collectionMeta} = getConfigDirectories();

        // Store updated file
        fs.writeFileSync(
            collectionMeta,
            JSON.stringify(collections, null, 5)
        );

        return collections[game];
    }
);

ipcMain.handle('addToCollection', (event, { collectionId, videoId, game }) => {
    log.info(
        `ADDING ${videoId} for game ${game} to collection ${collectionId}`
    );

    // If the collection isn't present, create a key and an empty array for it.
    if (!(collectionId in collections[game])) {
        collections[game][collectionId] = [];
    }

    // Add video id to collection list if it's not already present.
    if (!collections[game][collectionId].includes(videoId)) {
        collections[game][collectionId].push(videoId);
    }

    const {collectionMeta} = getConfigDirectories();

    // Store updated file
    fs.writeFileSync(collectionMeta, JSON.stringify(collections, null, 5));
    return collections[game];
});

ipcMain.handle(
    'removeFromCollection',
    (event, { collectionId, videoId, game }) => {
        log.info(
            `REMOVING ${videoId} for game ${game} from collection ${collectionId}`
        );

        // If the collection isn't present, return immediately.
        if (!(collectionId in collections[game])) {
            log.info("COLLECTION NOT PRESENT");
            return;
        }

        // Filter out videoId that's being removed.
        collections[game][collectionId] = collections[game][collectionId].filter(
            (element: string) => element !== videoId
        );

        const {collectionMeta} = getConfigDirectories();

        // Store updated file
        fs.writeFileSync(
            collectionMeta,
            JSON.stringify(collections, null, 5)
        );
        return collections[game];
    }
);

ipcMain.handle(
    'renameCollection',
    (event, { oldCollectionId, newCollectionId, game }) => {
        log.info(
            `RENAME ${oldCollectionId} for game ${game} to ${newCollectionId}`
        );

        // If the collection isn't present or the new name is already in use, return immediately.
        if (
            !(oldCollectionId in collections) ||
            newCollectionId in collections
        ) {
            return;
        }

        // Transfer data from one key to the other.
        const collectionData = collections[game][oldCollectionId];
        collections[game][newCollectionId] = collectionData;
        delete collections[game][oldCollectionId];

        return collections[game];
    }
);

ipcMain.handle('exportCollection', async (event, { collectionId, game }) => {
    const response = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory'],
    });
    if (response.canceled) {
        return null;
    }

    return exportToZip(response.filePaths[0], collectionId, game);
});

ipcMain.handle('getCollections', (event, game) => {
    return collections[game];
});

ipcMain.handle('openDialog', async () => {
    const response = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory'],
    });
    if (!response.canceled) {
        return response.filePaths[0];
    } else {
        return null;
    }
});

ipcMain.handle('openVideoFile', async () => {
    const response = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
            {name: "Video Files", extensions: ["mp4", "mkv", "avi", "mov", "webm"]}
        ]
    });
    if (!response.canceled) {
        return response.filePaths[0];
    } else {
        return null;
    }
});

ipcMain.handle('openImageFile', async () => {
    const response = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
            {name: "Clips", extensions: ["jpg"]}
        ]
    });
    if (!response.canceled) {
        return response.filePaths[0];
    } else {
        return null;
    }
});



ipcMain.handle('showConfirmDialog', async (event, { message }) => {
    const result = await dialog.showMessageBox(mainWindow!, {
        type: 'question',
        buttons: ['Cancel', 'OK'],
        defaultId: 1,
        cancelId: 0,
        message,
    });
    return result.response !== 0;
});

ipcMain.handle('importZip', async (_event, game) => {
    log.info('IMPORTING ZIP');
    const response = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Zip File', extensions: ['zip'] }],
    });
    if (!response || response.canceled) {
        return null;
    }
    await importZip(response.filePaths[0], game);
    return collections[game];
});

ipcMain.handle('normalizeAudio', async (event, { videoPath }) => {
    if (!fs.existsSync(videoPath)) {
        throw new Error('Video file not found');
    }
    const success = await normalizeVideo(videoPath, config);
    return { success };
});

ipcMain.handle('normalizeCollection', async (event, { collectionId, game }) => {
    if (!collections[game] || !collections[game][collectionId]) {
        throw new Error('Collection not found');
    }

    const videoIds = collections[game][collectionId];
    let processed = 0;
    let skipped = 0;

    for (const videoId of videoIds) {
        const { clip: videoFilePath } = getClipPaths(videoId, game);
        if (!fs.existsSync(videoFilePath)) continue;

        const markerPath = videoFilePath + NORMALIZED_MARKER_SUFFIX;
        if (fs.existsSync(markerPath)) {
            skipped++;
            continue;
        }

        const success = await normalizeVideo(videoFilePath, config);
        if (success) processed++;
    }

    return { processed, skipped, total: videoIds.length };
});

ipcMain.handle('transcribeAudio', async (event, { videoPath, config: whisperConfig, startTime, endTime, audioTrackIndex }) => {
    let resolvedPath = videoPath;

    if (resolvedPath.startsWith('game://')) {
        const url = resolvedPath.substring('game://'.length);
        const pattern = /^(rifftrax|whatthedub)\/(.+)\.(mp4|srt|jpg)$/;
        const match = url.match(pattern);
        if (!match) { throw new Error('Video file not found'); }
        const { clip } = getClipPaths(match[2], match[1]);
        resolvedPath = clip;
    } else if (resolvedPath.startsWith('localfile://')) {
        resolvedPath = fromLocalfileUrl(resolvedPath);
    }

    if (!fs.existsSync(resolvedPath)) { throw new Error('Video file not found'); }

    let startSec: number | undefined;
    let durSec: number | undefined;
    if (startTime !== undefined && endTime !== undefined) {
        startSec = startTime / 1000;
        durSec = (endTime - startTime) / 1000;
    }

    const results = await whisper.transcribe(
        resolvedPath, whisperConfig,
        (msg: string) => { log.info('[whisper] ' + msg); mainWindow?.webContents.send('whisper:progress', msg, -1); },
        (pct: number) => { log.info('[whisper] Progress: ' + pct + '%'); mainWindow?.webContents.send('whisper:progress', '', pct); },
        startSec, durSec, audioTrackIndex
    );

    return { results };
});

ipcMain.handle('check-for-update', async () => {
    await checkForUpdatesAndPrompt(false);
});

ipcMain.handle('log', (event, msg) => {
    log.info('[r] ' + msg);
});

ipcMain.handle('showAudioTrackPrompt', async (event, { tracks }: { tracks: AudioTrackInfo[] }) => {
    const detail = tracks.map((t, i) =>
        `Track ${i + 1}: ${t.codec?.toUpperCase() || 'Unknown'} ${t.channels}ch${t.language ? `, ${t.language}` : ''}${t.title ? ` - ${t.title}` : ''}`
    ).join('\n');
    const buttons = tracks.map((_t, i) => `Track ${i + 1}`);
    buttons.push('Cancel');
    const result = await dialog.showMessageBox(mainWindow!, {
        type: 'question', buttons, defaultId: 0, cancelId: buttons.length - 1,
        message: 'Multiple audio tracks detected. Select the track to use:', detail,
    });
    if (result.response === buttons.length - 1) return -1;
    return tracks[result.response].index;
});

ipcMain.handle('getAudioTracks', async (event, videoSource) => {
    let resolvedPath = videoSource;
    if (resolvedPath.startsWith('localfile://')) { resolvedPath = fromLocalfileUrl(resolvedPath); }
    if (!fs.existsSync(resolvedPath)) { log.warn('PROBE not found: ' + resolvedPath); return { tracks: [], videoCodec: null, videoPixFmt: null }; }
    const info = await probeMediaInfo(resolvedPath);
    log.info('PROBE: ' + info.videoCodec + '/' + info.videoPixFmt + ' ' + info.tracks.length + 'tracks');
    return info;
});

ipcMain.handle('remuxForPlayback', async (event, { videoSource, audioTrackIndex }) => {
    let resolvedPath = videoSource;
    if (resolvedPath.startsWith('localfile://')) { resolvedPath = fromLocalfileUrl(resolvedPath); }
    if (!fs.existsSync(resolvedPath)) { throw new Error('Video file not found'); }
    const cacheKey = getCacheKey(resolvedPath, audioTrackIndex);
    const cachedFile = path.join(CACHE_DIR, cacheKey + '.mp4');
    if (fs.existsSync(cachedFile)) {
        try {
            const fd = fs.openSync(cachedFile, 'r');
            const buf = Buffer.alloc(8);
            fs.readSync(fd, buf, 0, 8, 4);
            fs.closeSync(fd);
            if (buf.readUInt32BE(0) === 0x66747970) {
                log.info('Cache hit for ' + resolvedPath + ' track ' + audioTrackIndex);
                return `localfile:///${cachedFile.replace(/\\/g, '/')}`;
            }
        } catch {}
        log.warn('Cache file invalid, re-remuxing: ' + cachedFile);
        try { fs.unlinkSync(cachedFile); } catch {}
    }
    const probeData = await probeMediaInfo(resolvedPath).catch(() => ({ tracks: [], videoCodec: '', videoPixFmt: '', duration: 0 }));
    const audioTrack = probeData.tracks.find(t => t.index === audioTrackIndex) || probeData.tracks[0] || {};
    const audioCodec = audioTrack.codec || '';
    const audioChannels = audioTrack.channels || 0;
    const compatibleAudioCodecs = ['aac', 'mp3', 'pcm_s16le', 'pcm_s24le', 'pcm_s32le', 'pcm_f32le', 'opus', 'flac'];
    const needAudioReencode = !compatibleAudioCodecs.includes(audioCodec);
    const compatibleVideoCodecs = ['h264', 'hevc', 'vp8', 'vp9', 'av1'];
    const isH264_8bit = probeData.videoCodec === 'h264' && (probeData.videoPixFmt === 'yuv420p' || probeData.videoPixFmt === 'yuvj420p');
    const needVideoReencode = !probeData.videoCodec || !compatibleVideoCodecs.includes(probeData.videoCodec) || (probeData.videoCodec === 'h264' && !isH264_8bit);
    log.info('REMUX DECISION: vcodec=' + probeData.videoCodec + ' pix=' + probeData.videoPixFmt + ' audio=' + audioCodec + ' video=' + (needVideoReencode ? 'reencode' : 'copy') + ' audio=' + (needAudioReencode ? 'reencode' : 'copy'));
    if (!fs.existsSync(CACHE_DIR)) { fs.mkdirSync(CACHE_DIR, { recursive: true }); }
    const convPath = cachedFile + '.conv';
    log.info('Remuxing for playback: track ' + audioTrackIndex + ' from ' + resolvedPath
        + (needVideoReencode ? ' (re-encoding video)' : ' (copying video)')
        + (needAudioReencode ? ' (re-encoding audio to FLAC)' : ' (copying audio)'));
    const encoder = needVideoReencode ? await getEncoder() : null;
    const effectiveEncoder = encoder;

    function parseTimemark(tm: string): number {
        const parts = tm.split(':');
        if (parts.length === 3) { return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]); }
        return 0;
    }

    return new Promise((resolve, reject) => {
        let lastReportedPct = -1;
        let command = ffmpeg(resolvedPath);
        if (effectiveEncoder === 'h264_nvenc') { command = command.inputOptions(['-hwaccel', 'd3d11va']); }
        else if (effectiveEncoder === 'h264_amf') { command = command.inputOptions(['-hwaccel', 'd3d11va']); }
        else if (effectiveEncoder === 'h264_qsv') { command = command.inputOptions(['-hwaccel', 'qsv']); }
        command = command
            .outputOptions(['-map', '0:v:0', '-map', `0:${audioTrackIndex}`, '-f', 'mp4', '-movflags', '+faststart'])
            .output(convPath)
            .on('progress', (info: any) => {
                let pct = 0;
                if (info.percent !== undefined && info.percent !== null) { pct = Math.round(info.percent); }
                else if (probeData.duration > 0 && info.timemark) { pct = Math.min(99, Math.round((parseTimemark(info.timemark) / probeData.duration) * 100)); }
                if (pct !== lastReportedPct) { lastReportedPct = pct; try { event.sender.send('remuxProgress', pct); } catch (_) {} }
            })
            .on('end', () => {
                try { fs.renameSync(convPath, cachedFile); } catch (e) { log.error('Failed to rename conv file: ' + e); }
                log.info('Remux complete: ' + cachedFile);
                try { event.sender.send('remuxProgress', 100); } catch (_) {}
                resolve(`localfile:///${cachedFile.replace(/\\/g, '/')}`);
            })
            .on('error', (err: any, _stdout: string, stderr: string) => {
                try { fs.unlinkSync(convPath); } catch {}
                const errMsg = stderr || String(err);
                log.error('Remux for playback failed');
                log.error('FFmpeg stderr: ' + errMsg.slice(-10000));
                reject(new Error(errMsg.slice(-500)));
            });
        if (needVideoReencode) {
            if (effectiveEncoder === 'h264_nvenc') { command = command.videoCodec('h264_nvenc').outputOptions(['-preset', 'p1', '-cq', '23']); }
            else if (effectiveEncoder === 'h264_amf') { command = command.videoCodec('h264_amf').outputOptions(['-quality', 'speed', '-qp_i', '23', '-qp_p', '23']); }
            else if (effectiveEncoder === 'h264_qsv') { command = command.videoCodec('h264_qsv').outputOptions(['-preset', 'veryfast', '-global_quality', '23']); }
            else { command = command.videoCodec('libx264').outputOptions(['-pix_fmt', 'yuv420p', '-preset', 'ultrafast', '-crf', '27']); }
        } else { command = command.videoCodec('copy'); }
        if (needAudioReencode) {
            command = command.audioCodec('flac');
            if (audioChannels > 6) { command = command.audioChannels(6); }
        } else { command = command.audioCodec('copy'); }
        command.run();
    });
});

ipcMain.handle('cleanupTempFile', async (event, tempPath) => {
    let resolvedPath = tempPath;
    if (resolvedPath.startsWith('localfile://')) { resolvedPath = fromLocalfileUrl(resolvedPath); }
    try {
        const dir = path.dirname(resolvedPath);
        if (fs.existsSync(dir) && dir.includes('dub-editor-playback-')) { fs.rmSync(dir, { recursive: true, force: true }); }
    } catch (err) { log.error('Failed to cleanup temp file: ' + err); }
});