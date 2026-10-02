import {
    isWindowsX64Asset,
    resolveWhisperBinary,
    selectAssetUrl,
    selectWindowsX64Asset,
    WhisperRelease,
} from '../main/whisperAssets';

const assets = (names: string[], tag = 'b5130'): WhisperRelease => ({
    tag_name: tag,
    assets: names.map((name) => ({
        name,
        browser_download_url: `https://example.test/${tag}/${name}`,
    })),
});

// Real asset list from ggml-org/whisper.cpp release b5130, in the order the
// GitHub API returns it. The Linux ARM tarball sorts ahead of the Windows zip,
// so a naive prefix match resolves to a file that cannot be extracted.
const B5130 = assets([
    'whisper-b5130-xcframework.zip',
    'whisper-bin-ubuntu-arm64.tar.gz',
    'whisper-bin-ubuntu-x64.tar.gz',
    'whisper-bin-win-cpu-arm64.zip',
    'whisper-bin-win-cuda-13.4-arm64.zip',
    'whisper-bin-win-opencl-adreno-arm64.zip',
    'whisper-bin-Win32.zip',
    'whisper-bin-x64.zip',
    'whisper-blas-bin-Win32.zip',
    'whisper-blas-bin-x64.zip',
    'whisper-cublas-11.8.0-bin-x64.zip',
    'whisper-cublas-12.4.0-bin-x64.zip',
]);

const NO_ASSETS = assets([], 'v1.9.4');
const V192 = assets(
    [
        'whisper-bin-ubuntu-x64.tar.gz',
        'whisper-bin-Win32.zip',
        'whisper-bin-x64.zip',
        'whisper-blas-bin-x64.zip',
        'whisper-cublas-11.8.0-bin-x64.zip',
        'whisper-cublas-12.4.0-bin-x64.zip',
    ],
    'v1.9.2'
);

describe('isWindowsX64Asset', () => {
    it('accepts the Windows x64 zips', () => {
        expect(isWindowsX64Asset('whisper-bin-x64.zip')).toBe(true);
        expect(isWindowsX64Asset('whisper-cublas-12.4.0-bin-x64.zip')).toBe(true);
    });

    it('rejects other platforms, architectures and formats', () => {
        expect(isWindowsX64Asset('whisper-bin-ubuntu-arm64.tar.gz')).toBe(false);
        expect(isWindowsX64Asset('whisper-bin-ubuntu-x64.tar.gz')).toBe(false);
        expect(isWindowsX64Asset('whisper-bin-Win32.zip')).toBe(false);
        expect(isWindowsX64Asset('whisper-bin-win-cuda-13.4-arm64.zip')).toBe(
            false
        );
        expect(isWindowsX64Asset('whisper-b5130-xcframework.zip')).toBe(false);
    });
});

describe('selectWindowsX64Asset', () => {
    it('picks the Windows x64 zip rather than the first prefix match', () => {
        expect(selectWindowsX64Asset(B5130.assets, 'whisper-bin-')?.name).toBe(
            'whisper-bin-x64.zip'
        );
    });

    it('prefers CUDA 12.x over 11.8', () => {
        expect(
            selectWindowsX64Asset(B5130.assets, 'whisper-cublas-')?.name
        ).toBe('whisper-cublas-12.4.0-bin-x64.zip');
    });

    it('does not treat a BLAS zip as a CPU binary', () => {
        expect(
            selectWindowsX64Asset(
                assets(['whisper-blas-bin-x64.zip']).assets,
                'whisper-bin-'
            )
        ).toBeNull();
    });

    it('returns null when nothing matches', () => {
        expect(selectWindowsX64Asset([], 'whisper-bin-')).toBeNull();
    });
});

describe('selectAssetUrl', () => {
    it('skips releases that carry no assets and keeps walking back', () => {
        // v1.9.4 and v1.9.3 are tag-only upstream; the binaries live on older
        // tags and rolling b#### prereleases.
        expect(selectAssetUrl([NO_ASSETS, V192], 'whisper-bin-')).toBe(
            'https://example.test/v1.9.2/whisper-bin-x64.zip'
        );
    });

    it('prefers the newest release that actually has the asset', () => {
        expect(selectAssetUrl([B5130, V192], 'whisper-bin-')).toBe(
            'https://example.test/b5130/whisper-bin-x64.zip'
        );
    });

    it('tolerates a release with a missing assets array', () => {
        expect(
            selectAssetUrl(
                [{ tag_name: 'v9.9.9' } as WhisperRelease, V192],
                'whisper-bin-'
            )
        ).toBe('https://example.test/v1.9.2/whisper-bin-x64.zip');
    });

    it('returns null when no release has the asset', () => {
        expect(selectAssetUrl([B5130, NO_ASSETS], 'whisper-foo-')).toBeNull();
    });
});

describe('resolveWhisperBinary', () => {
    it('uses the CUDA binary when it is available', async () => {
        const getCpu = jest.fn();
        const resolved = await resolveWhisperBinary(
            true,
            true,
            async () => 'cuda.exe',
            getCpu,
            () => undefined
        );

        expect(resolved).toEqual({ whisperExe: 'cuda.exe', useCuda: true });
        expect(getCpu).not.toHaveBeenCalled();
    });

    it('falls back to the CPU binary when the CUDA binary is unavailable', async () => {
        const getCpu = jest.fn(async () => 'cpu.exe');
        const resolved = await resolveWhisperBinary(
            true,
            true,
            async () => null,
            getCpu,
            () => undefined
        );

        expect(resolved).toEqual({ whisperExe: 'cpu.exe', useCuda: false });
        expect(getCpu).toHaveBeenCalledTimes(1);
    });

    it('never consults the CPU binary when fallback is disabled', async () => {
        const getCpu = jest.fn(async () => 'cpu.exe');
        const resolved = await resolveWhisperBinary(
            true,
            false,
            async () => null,
            getCpu,
            () => undefined
        );

        expect(resolved).toEqual({ whisperExe: null, useCuda: true });
        expect(getCpu).not.toHaveBeenCalled();
    });

    it('skips the CUDA lookup entirely when CUDA is disabled', async () => {
        const getCuda = jest.fn();
        const resolved = await resolveWhisperBinary(
            false,
            true,
            getCuda,
            async () => 'cpu.exe',
            () => undefined
        );

        expect(resolved).toEqual({ whisperExe: 'cpu.exe', useCuda: false });
        expect(getCuda).not.toHaveBeenCalled();
    });

    it('reports no binary when neither lookup produces one', async () => {
        const resolved = await resolveWhisperBinary(
            true,
            true,
            async () => null,
            async () => null,
            () => undefined
        );

        expect(resolved).toEqual({ whisperExe: null, useCuda: false });
    });

    it('explains the fallback when the CUDA binary is missing', async () => {
        const logs: string[] = [];
        await resolveWhisperBinary(
            true,
            true,
            async () => null,
            async () => 'cpu.exe',
            (msg) => logs.push(msg)
        );

        expect(logs).toEqual([
            'CUDA binary not available, falling back to CPU',
        ]);
    });
});
