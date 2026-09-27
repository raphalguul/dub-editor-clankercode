import {
    buildCensorFilterGraph,
    buildCensorOutputMaps,
    CensorBar,
    DEFAULT_BLUR_AMOUNT,
} from '../main/censorFilter';

const bar = (overrides: Partial<CensorBar> = {}): CensorBar => ({
    index: 0,
    rowIndex: 0,
    startTime: 1000,
    endTime: 2000,
    x: 0.1,
    y: 0.1,
    w: 0.2,
    h: 0.2,
    type: 'black',
    ...overrides,
});

describe('buildCensorFilterGraph', () => {
    it('returns an empty string when there are no bars', () => {
        expect(buildCensorFilterGraph([], 1920, 1080)).toBe('');
        expect(buildCensorFilterGraph(null, 1920, 1080)).toBe('');
    });

    it('returns an empty string for degenerate frame dimensions', () => {
        expect(buildCensorFilterGraph([bar()], 0, 1080)).toBe('');
        expect(buildCensorFilterGraph([bar()], 1920, 0)).toBe('');
    });

    it('builds a single drawbox for a black bar', () => {
        const graph = buildCensorFilterGraph([bar()], 1920, 1080);
        expect(graph).toBe(
            "[0:v]drawbox=x=192:y=108:w=384:h=216:color=black:t=fill:enable='between(t,1,2)'[vout]"
        );
    });

    it('chains multiple black bars in order', () => {
        const graph = buildCensorFilterGraph(
            [bar({ startTime: 0, endTime: 500 }), bar({ startTime: 500, endTime: 1500, x: 0.5, y: 0.5 })],
            1920,
            1080
        );
        expect(graph).toBe(
            "[0:v]drawbox=x=192:y=108:w=384:h=216:color=black:t=fill:enable='between(t,0,0.5)'[vstep0];" +
            "[vstep0]drawbox=x=960:y=540:w=384:h=216:color=black:t=fill:enable='between(t,0.5,1.5)'[vout]"
        );
    });

    it('rounds crop offsets and extents to even numbers for yuv420p', () => {
        const graph = buildCensorFilterGraph(
            [bar({ type: 'blur', x: 0.1015, y: 0.1015, w: 0.0111, h: 0.0111 })],
            1000,
            1000
        );
        expect(graph).toContain('crop=w=10:h=10:x=102:y=102');
    });

    it('builds a split/crop/gblur/overlay chain for a blur bar', () => {
        const graph = buildCensorFilterGraph(
            [bar({ type: 'blur', blurAmount: 0.05 })],
            1000,
            1000
        );
        expect(graph).toBe(
            "[0:v]split=2[cbase0][ccrop0];" +
            "[ccrop0]crop=w=200:h=200:x=100:y=100,gblur=sigma=50:enable='between(t,1,2)'[vblurred];" +
            "[cbase0][vblurred]overlay=x=100:y=100:enable='between(t,1,2)'[vout]"
        );
    });

    it('scales blur sigma by frame width so preview and output match', () => {
        const sigmaFor = (width: number) => {
            const graph = buildCensorFilterGraph([bar({ type: 'blur', blurAmount: 0.02 })], width, 1000);
            return graph!.match(/sigma=([\d.]+)/)![1];
        };
        expect(sigmaFor(1920)).toBe('38.4');
        expect(sigmaFor(640)).toBe('12.8');
    });

    it('falls back to the default blur amount when none is set', () => {
        const graph = buildCensorFilterGraph([bar({ type: 'blur' })], 1000, 1000);
        expect(graph).toContain(`sigma=${DEFAULT_BLUR_AMOUNT * 1000}`);
    });

    it('clamps blur sigma to a sane range', () => {
        const huge = buildCensorFilterGraph([bar({ type: 'blur', blurAmount: 5 })], 1920, 1080);
        expect(huge).toContain('sigma=200');
        const tiny = buildCensorFilterGraph([bar({ type: 'blur', blurAmount: 0.0000001 })], 1920, 1080);
        expect(tiny).toContain('sigma=1');
    });

    it('chains a blur bar onto a preceding black bar so overlaps compose', () => {
        const graph = buildCensorFilterGraph(
            [bar({ type: 'black' }), bar({ type: 'blur', startTime: 1200, endTime: 1800 })],
            1000,
            1000
        );
        expect(graph).toBe(
            "[0:v]drawbox=x=100:y=100:w=200:h=200:color=black:t=fill:enable='between(t,1,2)'[vstep0];" +
            "[vstep0]split=2[cbase1][ccrop1];" +
            "[ccrop1]crop=w=200:h=200:x=100:y=100,gblur=sigma=20:enable='between(t,1.2,1.8)'[vblurred];" +
            "[cbase1][vblurred]overlay=x=100:y=100:enable='between(t,1.2,1.8)'[vout]"
        );
    });

    it('shifts the enable window by timeOffsetMs for batch clips', () => {
        const graph = buildCensorFilterGraph([bar({ startTime: 10000, endTime: 12000 })], 1000, 1000, 9000);
        expect(graph).toContain("enable='between(t,1,3)'");
    });

    it('clamps a negative window start to zero', () => {
        const graph = buildCensorFilterGraph([bar({ startTime: 100, endTime: 900, x: 0, y: 0 })], 1000, 1000, 500);
        expect(graph).toContain("enable='between(t,0,0.4)'");
    });

    it('skips bars that fall entirely before the clip', () => {
        const graph = buildCensorFilterGraph(
            [bar({ startTime: 0, endTime: 1000, type: 'blur' }), bar({ startTime: 14000, endTime: 15000 })],
            1000,
            1000,
            10000
        );
        expect(graph).toBe(
            "[0:v]drawbox=x=100:y=100:w=200:h=200:color=black:t=fill:enable='between(t,4,5)'[vout]"
        );
    });

    it('keeps delogo strictly inside the frame', () => {
        const graph = buildCensorFilterGraph(
            [bar({ type: 'delogo', x: 0, y: 0, w: 1, h: 1 })],
            1000,
            1000
        );
        expect(graph).toBe(
            "[0:v]delogo=x=2:y=2:w=996:h=996:show=0:enable='between(t,1,2)'[vout]"
        );
    });

    it('clamps a bar that overhangs the right and bottom edges', () => {
        const graph = buildCensorFilterGraph([bar({ x: 0.8, y: 0.8, w: 0.5, h: 0.5 })], 1000, 1000);
        expect(graph).toContain('x=800:y=800:w=200:h=200');
    });

    it('never exceeds the frame when a bar is wider than the video', () => {
        const graph = buildCensorFilterGraph([bar({ x: 0, y: 0, w: 2, h: 2 })], 1000, 1000);
        expect(graph).toContain('x=0:y=0:w=1000:h=1000');
    });

    it('skips bars with an unknown type, a non-positive size, or a zero-length window', () => {
        const graph = buildCensorFilterGraph(
            [
                bar({ type: 'sparkle' as any }),
                bar({ w: 0 }),
                bar({ h: 0 }),
                bar({ startTime: 2000, endTime: 2000 }),
                bar({ endTime: 1000 }),
            ],
            1000,
            1000
        );
        expect(graph).toBe('');
    });

    it('skips a bar too small to survive even-pixel rounding', () => {
        const graph = buildCensorFilterGraph([bar({ w: 0.001, h: 0.001 })], 1000, 1000);
        expect(graph).toBe('');
    });

    it('rounds a small-but-usable bar up to the 2px minimum', () => {
        const graph = buildCensorFilterGraph([bar({ w: 0.003, h: 0.003 })], 1000, 1000);
        expect(graph).toContain('w=2:h=2');
    });
});

describe('buildCensorOutputMaps', () => {
    const graph = buildCensorFilterGraph([bar()], 1920, 1080);

    it('maps only the filtered output when a graph is present', () => {
        expect(buildCensorOutputMaps(graph, 1)).toEqual([
            '-map',
            '[vout]',
            '-map',
            '0:1',
        ]);
    });

    it('never maps the unfiltered input alongside the graph output', () => {
        expect(buildCensorOutputMaps(graph, 1)).not.toContain('0:v:0');
        expect(buildCensorOutputMaps(graph)).not.toContain('0:v:0');
    });

    it('maps an explicit audio stream when no track index is given', () => {
        expect(buildCensorOutputMaps(graph)).toEqual([
            '-map',
            '[vout]',
            '-map',
            '0:a:0',
        ]);
    });

    it('keeps the original stream copy behaviour when there is no graph', () => {
        expect(buildCensorOutputMaps('', 1)).toEqual([
            '-map',
            '0:v:0',
            '-map',
            '0:1',
        ]);
    });

    it('leaves stream selection to ffmpeg when there is neither a graph nor an index', () => {
        expect(buildCensorOutputMaps('')).toEqual([]);
        expect(buildCensorOutputMaps(null, undefined)).toEqual([]);
    });
});
