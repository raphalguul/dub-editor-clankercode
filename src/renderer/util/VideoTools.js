import { version as APP_VERSION } from '../../../release/app/package.json';

export let convertTimestampToSeconds = (timestamp) => {
    let regex = /(\d\d):(\d\d):(\d\d),(\d\d\d)/;
    let match = regex.exec(timestamp);

    let h = parseInt(match[1]);
    let m = parseInt(match[2]);
    let s = parseInt(match[3]);
    let ms = parseInt(match[4]);

    return h * 3600 + m * 60 + s + ms / 1000;
};

export let convertSecondsToTimestamp = (seconds) => {
    let h = Math.floor(seconds / 3600);
    let m = Math.floor((seconds % 3600) / 60);
    let s = Math.floor(seconds % 60);
    let ms = Math.floor((seconds - Math.trunc(seconds)) * 1000);

    return `${h.toString().padStart(2, '0')}:${m
        .toString()
        .padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms
        .toString()
        .padStart(3, '0')}`;
};

export let convertSecondsToAltTimestamp = (seconds) => {
    let m = Math.floor(seconds / 60);
    let s = Math.floor(seconds % 60);
    let ms = Math.floor((seconds - Math.trunc(seconds)) * 1000);

    return `${m.toString().padStart(2, '0')}:${s
        .toString()
        .padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
};

export let convertSubtitlesToSrt = (subtitles, game) => {
    const body = subtitles
        .map((subtitle, index) => {
            let text;
            if (subtitle.type === 'dynamic' && game === 'rifftrax') {
                text = '[Insert Riff Here]';
            } else if (subtitle.type === 'dynamic' && game === 'whatthedub') {
                text =
                    subtitle.voice === 'female' ? '[female_dub]' : '[male_dub]';
            } else {
                text = subtitle.text;
            }
            if (subtitle.speaker) {
                text = `${subtitle.speaker}: ${text}`;
            }
            return `${index + 1}\n${convertSecondsToTimestamp(
                subtitle.startTime / 1000
            )} --> ${convertSecondsToTimestamp(
                subtitle.endTime / 1000
            )}\n${text}`;
        })
        .join('\n\n');
    const versionTag = APP_VERSION ? ` ${APP_VERSION}` : '';
    return `${body}\n\n# METADATA: Dub Editor CC${versionTag}`;
};

export let convertSrtToSubtitles = (srtBase64) => {
    let subtitles = [];
    let subtitle = {};
    let regex = /(\d\d:\d\d:\d\d,\d\d\d) --> (\d\d:\d\d:\d\d,\d\d\d)/;

    let srt = atob(srtBase64).replaceAll('\r', '');
    let n = 0;

    srt.split('\n').forEach((line) => {
        console.log('LINE: ' + line);
        console.log('n: ' + n);
        switch (n++) {
            case 0:
                break;
            case 1:
                let match = regex.exec(line);
                if (!match) {
                    return;
                }

                let startTime = match[1];
                let endTime = match[2];
                subtitle.startTime =
                    convertTimestampToSeconds(startTime) * 1000;
                subtitle.endTime = convertTimestampToSeconds(endTime) * 1000;
                break;
            case 2: {
                let speakerMatch = line.match(/^([^:\(\)]+):\s+(.+)/);
                if (speakerMatch) {
                    subtitle.speaker = speakerMatch[1];
                    subtitle.text = speakerMatch[2];
                } else {
                    subtitle.text = line;
                }
                break;
            }
            case 3:
                if (line !== '') {
                    subtitle.text += `\n${line}`;
                    n = 3;
                    return;
                }
                n = 0;
                subtitles.push(subtitle);
                subtitle = {};
                break;
        }
    });
    if (subtitle.text) {
        subtitles.push(subtitle);
    }

    return subtitles;
};

export let convertSubtitlesToWebVtt = (subtitles, substitution, offset = 0) => {
    if (!substitution || substitution === '') {
        substitution = '[Missing Audio]';
    }
    let webvtt =
        'WEBVTT\n\n' +
        subtitles
            .map((subtitle) => {
                let displayText;
                if (substitution && subtitle.type === 'dynamic') {
                    displayText = substitution;
                } else {
                    displayText = subtitle.text;
                }
                if (subtitle.speaker) {
                    displayText = `${subtitle.speaker}: ${displayText}`;
                }
                return `${convertSecondsToAltTimestamp(
                    (subtitle.startTime + offset) / 1000
                )} --> ${convertSecondsToAltTimestamp(
                    (subtitle.endTime + offset) / 1000
                )}\n${displayText}`;
            })
            .join('\n\n');

    return webvtt;
};

export let createWebVttDataUri = (subtitles, substitution, offset = 0) => {
    const bytes = new TextEncoder().encode(
        convertSubtitlesToWebVtt(subtitles, substitution, offset)
    );
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return 'data:text/vtt;base64,' + btoa(binary);
};

export const CENSOR_BAR_TYPES = ['black', 'blur', 'delogo'];

export const DEFAULT_BLUR_AMOUNT = 0.02;
export const DEFAULT_CENSOR_BAR_SIZE = 0.2;
export const MIN_CENSOR_BAR_SIZE = 0.01;

let clamp = (value, min, max) => {
    if (!isFinite(value)) {
        return min;
    }
    return Math.min(Math.max(value, min), max);
};

// Converts a picture rect (viewport coordinates) into the offset/size an absolutely
// positioned overlay should use inside its containing block.
//
// `base` MUST be the containing block's rect, never the overlay's own: the overlay is
// the element these offsets position, so reading it as the origin makes every
// measurement subtract the previous measurement's own result. The first measurement
// lands correctly and the next one cancels it, which pins the overlay to the wrong
// place -- and since the overlay is the shared parent of every bar, they all jump
// together.
export let toOverlayBox = (picture, base, insets = {}) => {
    const insetLeft = insets.left || 0;
    const insetTop = insets.top || 0;

    return {
        left: picture.left - base.left - insetLeft,
        top: picture.top - base.top - insetTop,
        width: picture.width,
        height: picture.height,
    };
};

// w and h are fractions of *different* axes, so swapping them squares the box only
// on a 1:1 frame -- on 16:9 it just produces another rectangle. Convert through
// pixels instead, matching the height to the width so the box keeps its horizontal
// extent and does not jump.
export let toSquare = (bar, frameWidth, frameHeight) => {
    if (!frameWidth || !frameHeight) {
        return { w: bar.h, h: bar.w };
    }

    const sidePx = bar.w * frameWidth;

    return {
        w: sidePx / frameWidth,
        h: sidePx / frameHeight,
    };
};

export let clampCensorBar = (bar) => {
    let w = clamp(bar.w, MIN_CENSOR_BAR_SIZE, 1);
    let h = clamp(bar.h, MIN_CENSOR_BAR_SIZE, 1);
    let x = clamp(bar.x, 0, 1 - w);
    let y = clamp(bar.y, 0, 1 - h);

    return {
        ...bar,
        x,
        y,
        w,
        h,
        blurAmount:
            typeof bar.blurAmount === 'number' && isFinite(bar.blurAmount)
                ? clamp(bar.blurAmount, 0.002, 0.2)
                : DEFAULT_BLUR_AMOUNT,
    };
};

export let createCensorBar = ({
    startTime = 0,
    endTime = 0,
    rowIndex = 0,
    type = 'black',
} = {}) => {
    return clampCensorBar({
        index: 0,
        rowIndex,
        startTime,
        endTime,
        x: (1 - DEFAULT_CENSOR_BAR_SIZE) / 2,
        y: (1 - DEFAULT_CENSOR_BAR_SIZE) / 2,
        w: DEFAULT_CENSOR_BAR_SIZE,
        h: DEFAULT_CENSOR_BAR_SIZE,
        type: CENSOR_BAR_TYPES.includes(type) ? type : 'black',
        blurAmount: DEFAULT_BLUR_AMOUNT,
    });
};

let overlaps = (aStart, aEnd, bStart, bEnd) => {
    return aStart <= bEnd && aEnd >= bStart;
};

export let distributeCensorBars = (censorBars) => {
    let placed = [];
    for (let bar of censorBars) {
        let restrictedRows = [];
        bar.rowIndex = 0;
        for (let other of placed) {
            if (
                overlaps(
                    bar.startTime,
                    bar.endTime,
                    other.startTime,
                    other.endTime
                )
            ) {
                if (!restrictedRows.includes(other.rowIndex)) {
                    restrictedRows.push(other.rowIndex);
                }
            }
        }
        for (let row = 0; row < 5; row++) {
            if (!restrictedRows.includes(row)) {
                bar.rowIndex = row;
                break;
            }
        }
        placed.push(bar);
    }
    return placed;
};

export let convertCensorBarsToJson = (censorBars) => {
    return JSON.stringify(
        {
            version: APP_VERSION || null,
            censorBars: (censorBars || []).map((bar) => ({
                index: bar.index,
                rowIndex: bar.rowIndex,
                startTime: bar.startTime,
                endTime: bar.endTime,
                x: bar.x,
                y: bar.y,
                w: bar.w,
                h: bar.h,
                type: bar.type,
                blurAmount: bar.blurAmount,
            })),
        },
        null,
        5
    );
};

export let convertJsonToCensorBars = (json) => {
    if (!json) {
        return [];
    }
    let parsed;
    try {
        parsed = typeof json === 'string' ? JSON.parse(json) : json;
    } catch (e) {
        console.error('Unable to parse censor bars: ' + e);
        return [];
    }
    let list = Array.isArray(parsed) ? parsed : parsed.censorBars;
    if (!Array.isArray(list)) {
        return [];
    }
    return list
        .filter((bar) => bar && typeof bar === 'object')
        .map((bar, index) =>
            clampCensorBar({
                ...bar,
                index,
                rowIndex: typeof bar.rowIndex === 'number' ? bar.rowIndex : 0,
                startTime: Number(bar.startTime) || 0,
                endTime: Number(bar.endTime) || 0,
                type: CENSOR_BAR_TYPES.includes(bar.type) ? bar.type : 'black',
            })
        );
};

export let addVideo = async (
    videoSource,
    subtitles,
    title,
    clipNumber = 1,
    type,
    isBatch,
    audioTrackIndex,
    censorBars = []
) => {
    let censorBarsJson = convertCensorBarsToJson(censorBars);
    if (isBatch) {
        return await window.api.send('processBatchClip', {
            videoSource,
            subtitles: convertSubtitlesToSrt(subtitles, type),
            subtitleObjects: subtitles,
            censorBars,
            censorBarsJson,
            title,
            clipNumber,
            game: type,
            audioTrackIndex,
        });
    }
    return await window.api.send('storeVideo', {
        videoSource,
        subtitles: convertSubtitlesToSrt(subtitles, type),
        subtitleObjects: subtitles,
        censorBars,
        censorBarsJson,
        title,
        clipNumber,
        game: type,
        audioTrackIndex,
    });
};
