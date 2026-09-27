import {
    convertSubtitlesToSrt,
    convertSrtToSubtitles,
    convertCensorBarsToJson,
    convertJsonToCensorBars,
    clampCensorBar,
    createCensorBar,
    distributeCensorBars,
    toSquare,
    toOverlayBox,
} from '../renderer/util/VideoTools';
import { version } from '../../release/app/package.json';

const subtitles = [
    {
        startTime: 0,
        endTime: 2620,
        text: "And then there's people who stand in doorways",
        speaker: 'Ricky',
        type: 'subtitle',
        voice: 'male',
    },
];

describe('convertSubtitlesToSrt', () => {
    it('appends a METADATA footer with the app version', () => {
        const srt = convertSubtitlesToSrt(subtitles, 'whatthedub');
        expect(srt.endsWith(`# METADATA: Dub Editor CC ${version}`)).toBe(true);
        expect(srt.split('\n').pop()).toBe(`# METADATA: Dub Editor CC ${version}`);
    });

    it('puts an empty line between the last subtitle block and the footer', () => {
        const srt = convertSubtitlesToSrt(subtitles, 'whatthedub');
        const lines = srt.split('\n');
        const metaIndex = lines.findIndex((line) => line.startsWith('# METADATA'));
        expect(lines[metaIndex - 1]).toBe('');
    });
});

describe('convertSrtToSubtitles metadata handling', () => {
    it('ignores an existing METADATA footer when re-importing', () => {
        const taggedSrt = `1\n00:00:00,000 --> 00:00:02,620\nRicky: And then there's people who stand in doorways\n\n# METADATA: Dub Editor CC 2.0.5`;
        const srtBase64 = Buffer.from(taggedSrt, 'utf-8').toString('base64');
        const parsed = convertSrtToSubtitles(srtBase64) as any[];
        expect(parsed).toHaveLength(1);
        expect(parsed[0].text).toBe("And then there's people who stand in doorways");
        expect(parsed[0].speaker).toBe('Ricky');
    });
});

const censorBars = [
    {
        index: 0,
        rowIndex: 0,
        startTime: 1000,
        endTime: 2000,
        x: 0.1,
        y: 0.2,
        w: 0.3,
        h: 0.25,
        type: 'blur',
        blurAmount: 0.04,
    },
];

describe('censor bar serialization', () => {
    it('round-trips through JSON', () => {
        const parsed = convertJsonToCensorBars(convertCensorBarsToJson(censorBars));
        expect(parsed).toHaveLength(1);
        expect(parsed[0]).toMatchObject({
            startTime: 1000,
            endTime: 2000,
            x: 0.1,
            y: 0.2,
            w: 0.3,
            h: 0.25,
            type: 'blur',
            blurAmount: 0.04,
        });
    });

    it('stamps the app version', () => {
        const parsed = JSON.parse(convertCensorBarsToJson(censorBars));
        expect(parsed.version).toBe(version);
    });

    it('accepts a bare array as well as the wrapped form', () => {
        expect(convertJsonToCensorBars(JSON.stringify(censorBars))).toHaveLength(1);
    });

    it('returns an empty list for missing or corrupt data', () => {
        expect(convertJsonToCensorBars(null)).toEqual([]);
        expect(convertJsonToCensorBars('')).toEqual([]);
        expect(convertJsonToCensorBars('{not json')).toEqual([]);
        expect(convertJsonToCensorBars('{"nope":1}')).toEqual([]);
    });

    it('coerces a non-numeric time to zero instead of producing NaN', () => {
        const parsed = convertJsonToCensorBars(
            JSON.stringify([{ startTime: 'abc', endTime: null, type: 'black' }])
        );
        expect(parsed[0].startTime).toBe(0);
        expect(parsed[0].endTime).toBe(0);
    });

    it('falls back to black for an unknown type', () => {
        const parsed = convertJsonToCensorBars(
            JSON.stringify([{ startTime: 0, endTime: 1, type: 'rainbow' }])
        );
        expect(parsed[0].type).toBe('black');
    });

    it('renumbers indexes on load', () => {
        const parsed = convertJsonToCensorBars(
            JSON.stringify([
                { startTime: 0, endTime: 1, type: 'black' },
                { startTime: 2, endTime: 3, type: 'black' },
            ])
        );
        expect(parsed.map((b: any) => b.index)).toEqual([0, 1]);
    });
});

describe('clampCensorBar', () => {
    it('keeps a rect that is already inside the frame', () => {
        expect(clampCensorBar({ x: 0.1, y: 0.2, w: 0.3, h: 0.25 })).toMatchObject({
            x: 0.1,
            y: 0.2,
            w: 0.3,
            h: 0.25,
        });
    });

    it('pushes a rect back inside the right and bottom edges', () => {
        const clamped = clampCensorBar({ x: 0.9, y: 0.9, w: 0.3, h: 0.3 });
        expect(clamped.x + clamped.w).toBeLessThanOrEqual(1);
        expect(clamped.y + clamped.h).toBeLessThanOrEqual(1);
    });

    it('pulls a negative origin back to zero', () => {
        const clamped = clampCensorBar({ x: -0.5, y: -0.2, w: 0.3, h: 0.3 });
        expect(clamped.x).toBe(0);
        expect(clamped.y).toBe(0);
    });

    it('caps a rect larger than the frame', () => {
        const clamped = clampCensorBar({ x: 0, y: 0, w: 3, h: 4 });
        expect(clamped.w).toBe(1);
        expect(clamped.h).toBe(1);
    });

    it('enforces a minimum size so a bar cannot collapse to nothing', () => {
        const clamped = clampCensorBar({ x: 0.5, y: 0.5, w: 0, h: -1 });
        expect(clamped.w).toBeGreaterThan(0);
        expect(clamped.h).toBeGreaterThan(0);
    });

    it('replaces non-finite origins with the safe minimum', () => {
        const clamped = clampCensorBar({
            x: NaN,
            y: Infinity,
            w: NaN,
            h: 0.3,
        });
        expect(clamped.x).toBe(0);
        expect(clamped.y).toBe(0);
        expect(isNaN(clamped.w)).toBe(false);
    });

    it('defaults blurAmount and clamps it to a usable range', () => {
        expect(clampCensorBar({ x: 0, y: 0, w: 0.2, h: 0.2 }).blurAmount).toBe(0.02);
        expect(clampCensorBar({ x: 0, y: 0, w: 0.2, h: 0.2, blurAmount: 99 }).blurAmount).toBe(0.2);
        expect(clampCensorBar({ x: 0, y: 0, w: 0.2, h: 0.2, blurAmount: 0 }).blurAmount).toBe(0.002);
    });
});

describe('createCensorBar', () => {
    it('creates a centered square that fits in the frame', () => {
        const bar = createCensorBar();
        expect(bar.w).toBe(bar.h);
        expect(bar.x).toBeCloseTo(bar.y);
        expect(bar.x).toBeGreaterThan(0);
        expect(bar.x + bar.w).toBeLessThanOrEqual(1);
        expect(bar.type).toBe('black');
    });

    it('honours the requested type and falls back for unknown types', () => {
        expect(createCensorBar({ type: 'delogo' }).type).toBe('delogo');
        expect(createCensorBar({ type: 'nope' as any }).type).toBe('black');
    });
});

describe('distributeCensorBars', () => {
    it('keeps overlapping bars on separate rows', () => {
        const placed = distributeCensorBars([
            { startTime: 0, endTime: 1000, rowIndex: 0 },
            { startTime: 500, endTime: 1500, rowIndex: 0 },
            { startTime: 2000, endTime: 3000, rowIndex: 0 },
        ]);
        expect(placed[0].rowIndex).toBe(0);
        expect(placed[1].rowIndex).toBe(1);
        expect(placed[2].rowIndex).toBe(0);
    });
});

describe('toSquare', () => {
    it('produces equal pixel width and height on a 16:9 frame', () => {
        const bar = { w: 0.2, h: 0.2 };
        const squared = toSquare(bar, 1920, 1080);

        // The whole point: w and h are fractions of different axes, so equal
        // fractions are not equal pixels. Swapping them was the old behaviour.
        expect(squared.w).toBeCloseTo(0.2, 6);
        expect(squared.h).toBeCloseTo(1920 * 0.2 / 1080, 6);
        expect(squared.w * 1920).toBeCloseTo(squared.h * 1080, 6);
    });

    it('leaves the horizontal extent untouched', () => {
        const squared = toSquare({ w: 0.35, h: 0.9 }, 1280, 720);
        expect(squared.w).toBeCloseTo(0.35, 6);
    });

    it('squares a 4:3 frame too', () => {
        const squared = toSquare({ w: 0.5, h: 0.1 }, 640, 480);
        expect(squared.w * 640).toBeCloseTo(squared.h * 480, 6);
    });

    it('falls back to swapping fractions when the frame size is unknown', () => {
        expect(toSquare({ w: 0.2, h: 0.4 }, 0, 0)).toEqual({ w: 0.4, h: 0.2 });
    });
});

describe('toOverlayBox', () => {
    // A 16:9 picture letterboxed inside a taller element box.
    const picture = { left: 100, top: 130, width: 1600, height: 900 };
    const host = { left: 100, top: 100, width: 1600, height: 960 };

    it('offsets the picture by the letterbox margin within the containing block', () => {
        expect(toOverlayBox(picture, host)).toEqual({
            left: 0,
            top: 30,
            width: 1600,
            height: 900,
        });
    });

    it('is idempotent when re-measured after the overlay has been placed', () => {
        // The real sequence: on mount the overlay has no inline offsets yet, so its
        // own rect coincides with the containing block. We then place it, and
        // loadedmetadata / window resizes measure again. Against the containing
        // block that second read must be identical, not one margin further along.
        const first = toOverlayBox(picture, host);
        const overlayAfterPlacement = {
            left: host.left + first.left,
            top: host.top + first.top,
        };

        expect(overlayAfterPlacement.top).toBe(host.top + 30);
        expect(toOverlayBox(picture, host)).toEqual(first);

        // Why the caller must not use the overlay as its own base: doing so
        // subtracts the offset it just applied and silently cancels the margin.
        expect(toOverlayBox(picture, overlayAfterPlacement).top).toBe(0);
    });

    it('recomputes from new geometry when the window resizes instead of accumulating', () => {
        const resizedHost = { left: 140, top: 60, width: 1200, height: 700 };
        const resizedPicture = {
            left: 140,
            top: 82,
            width: 1200,
            height: 675,
        };

        expect(toOverlayBox(resizedPicture, resizedHost)).toEqual({
            left: 0,
            top: 22,
            width: 1200,
            height: 675,
        });
    });

    it('accounts for the containing block border and padding', () => {
        // left/top resolve against the padding box; getBoundingClientRect reports the
        // border box, so host insets have to come off explicitly.
        expect(
            toOverlayBox(picture, host, { left: 2, top: 6 })
        ).toEqual({
            left: -2,
            top: 24,
            width: 1600,
            height: 900,
        });
    });

    it('defaults missing insets to zero', () => {
        expect(toOverlayBox(picture, host, {})).toEqual(
            toOverlayBox(picture, host)
        );
    });
});
