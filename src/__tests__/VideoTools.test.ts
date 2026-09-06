import {
    convertSubtitlesToSrt,
    convertSrtToSubtitles,
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
