export type CensorBarType = 'black' | 'blur' | 'delogo';

export interface CensorBar {
    index: number;
    rowIndex: number;
    startTime: number;
    endTime: number;
    x: number;
    y: number;
    w: number;
    h: number;
    type: CensorBarType;
    blurAmount?: number;
}

export const DEFAULT_BLUR_AMOUNT = 0.02;

const MIN_SIGMA = 1;
const MAX_SIGMA = 200;
const MIN_PIXELS = 2;

const formatNumber = (value: number): string => {
    return String(Math.round(value * 1000) / 1000);
};

const toEven = (value: number): number => {
    const clamped = Math.max(0, Math.round(value));
    return clamped - (clamped % 2);
};

interface PixelRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

// yuv420p chroma sits on a 2px grid, so every crop offset and extent has to be even.
const toPixelRect = (bar: CensorBar, videoWidth: number, videoHeight: number): PixelRect => {
    const evenWidth = toEven(videoWidth);
    const evenHeight = toEven(videoHeight);

    const x = Math.min(toEven(bar.x * videoWidth), evenWidth - 2);
    const y = Math.min(toEven(bar.y * videoHeight), evenHeight - 2);
    const w = Math.max(2, Math.min(toEven(bar.w * videoWidth), evenWidth - x));
    const h = Math.max(2, Math.min(toEven(bar.h * videoHeight), evenHeight - y));

    return { x, y, w, h };
};

interface CensorPlan {
    bar: CensorBar;
    rect: PixelRect;
    enable: string;
    sigma: number;
}

const planBar = (
    bar: CensorBar,
    videoWidth: number,
    videoHeight: number,
    timeOffsetMs: number
): CensorPlan | null => {
    if (!bar) {
        return null;
    }
    if (bar.type !== 'black' && bar.type !== 'blur' && bar.type !== 'delogo') {
        return null;
    }
    if (!(bar.endTime > bar.startTime)) {
        return null;
    }
    if (!(bar.w > 0) || !(bar.h > 0)) {
        return null;
    }
    if (bar.w * videoWidth < MIN_PIXELS || bar.h * videoHeight < MIN_PIXELS) {
        return null;
    }

    const start = (bar.startTime - timeOffsetMs) / 1000;
    const end = (bar.endTime - timeOffsetMs) / 1000;
    if (end <= 0) {
        return null;
    }

    const rect = toPixelRect(bar, videoWidth, videoHeight);
    if (rect.w < 2 || rect.h < 2) {
        return null;
    }

    // delogo refuses to run unless the region is strictly inside the frame.
    if (bar.type === 'delogo') {
        const evenWidth = toEven(videoWidth);
        const evenHeight = toEven(videoHeight);
        rect.x = Math.max(2, rect.x);
        rect.y = Math.max(2, rect.y);
        rect.w = Math.max(2, Math.min(rect.w, evenWidth - 2 - rect.x));
        rect.h = Math.max(2, Math.min(rect.h, evenHeight - 2 - rect.y));
    }

    const amount =
        typeof bar.blurAmount === 'number' && isFinite(bar.blurAmount)
            ? bar.blurAmount
            : DEFAULT_BLUR_AMOUNT;
    const sigma = Math.max(MIN_SIGMA, Math.min(MAX_SIGMA, amount * videoWidth));

    return {
        bar,
        rect,
        enable: `between(t,${formatNumber(Math.max(0, start))},${formatNumber(end)})`,
        sigma,
    };
};

// ffmpeg turns off automatic stream selection the moment any -map is present, and
// mapping 0:v:0 alongside [vout] muxes the uncensored original as the primary video
// with the censored graph hidden behind it as a second stream. So name exactly one
// video stream, and always name the audio explicitly whenever a graph is used.
export const buildCensorOutputMaps = (
    filterGraph: string | null | undefined,
    audioTrackIndex?: number
): string[] => {
    if (filterGraph) {
        return [
            '-map',
            '[vout]',
            '-map',
            audioTrackIndex !== undefined ? `0:${audioTrackIndex}` : '0:a:0',
        ];
    }

    if (audioTrackIndex !== undefined) {
        return ['-map', '0:v:0', '-map', `0:${audioTrackIndex}`];
    }

    return [];
};

export const buildCensorFilterGraph = (
    bars: CensorBar[] | null | undefined,
    videoWidth: number,
    videoHeight: number,
    timeOffsetMs = 0
): string => {
    if (!bars || bars.length === 0 || !(videoWidth > 0) || !(videoHeight > 0)) {
        return '';
    }

    const plans = bars
        .map((bar) => planBar(bar, videoWidth, videoHeight, timeOffsetMs))
        .filter((plan): plan is CensorPlan => plan !== null);

    if (plans.length === 0) {
        return '';
    }

    const segments: string[] = [];
    let currentLabel = '0:v';

    plans.forEach((plan, i) => {
        const { bar, rect, enable } = plan;
        const isLast = i === plans.length - 1;
        const outLabel = isLast ? '[vout]' : `[vstep${i}]`;

        if (bar.type === 'blur') {
            const baseLabel = `cbase${i}`;
            const cropLabel = `ccrop${i}`;
            const blurLabel = isLast ? 'vblurred' : `cblur${i}`;

            segments.push(`[${currentLabel}]split=2[${baseLabel}][${cropLabel}]`);
            segments.push(`[${cropLabel}]crop=w=${rect.w}:h=${rect.h}:x=${rect.x}:y=${rect.y},gblur=sigma=${formatNumber(plan.sigma)}:enable='${enable}'[${blurLabel}]`);
            segments.push(`[${baseLabel}][${blurLabel}]overlay=x=${rect.x}:y=${rect.y}:enable='${enable}'${outLabel}`);
        } else {
            const filter = bar.type === 'black' ? 'drawbox' : 'delogo';
            const drawOptions = bar.type === 'black' ? ':color=black:t=fill' : ':show=0';
            segments.push(`[${currentLabel}]${filter}=x=${rect.x}:y=${rect.y}:w=${rect.w}:h=${rect.h}${drawOptions}:enable='${enable}'${outLabel}`);
        }

        currentLabel = isLast ? 'vout' : `vstep${i}`;
    });

    return segments.join(';');
};
