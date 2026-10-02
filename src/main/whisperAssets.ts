export interface WhisperReleaseAsset {
    name: string;
    browser_download_url: string;
}

export interface WhisperRelease {
    tag_name: string;
    assets: WhisperReleaseAsset[];
}

export interface ResolvedWhisperBinary {
    whisperExe: string | null;
    useCuda: boolean;
}

const WINDOWS_X64_ZIP = /-x64\.zip$/i;
const NOT_WINDOWS_X64 = /ubuntu|arm|win32|opencl|xcframework/i;

export function isWindowsX64Asset(name: string): boolean {
    return (
        name.toLowerCase().endsWith('.zip') &&
        WINDOWS_X64_ZIP.test(name) &&
        !NOT_WINDOWS_X64.test(name)
    );
}

export function selectWindowsX64Asset(
    assets: WhisperReleaseAsset[],
    prefix: string
): WhisperReleaseAsset | null {
    const candidates = assets.filter(
        (a) => a.name.startsWith(prefix) && isWindowsX64Asset(a.name)
    );

    if (candidates.length === 0) return null;

    if (prefix.startsWith('whisper-cublas-')) {
        const cuda12 = candidates.find((a) => /-12\./.test(a.name));
        if (cuda12) return cuda12;
    }

    return candidates[0];
}

export function selectAssetUrl(
    releases: WhisperRelease[],
    prefix: string
): string | null {
    for (const release of releases) {
        const asset = selectWindowsX64Asset(release.assets || [], prefix);
        if (asset) return asset.browser_download_url;
    }
    return null;
}

export async function resolveWhisperBinary(
    useCuda: boolean,
    cudaFallbackCpu: boolean,
    getCudaBinary: () => Promise<string | null>,
    getCpuBinary: () => Promise<string | null>,
    onLog?: (msg: string) => void
): Promise<ResolvedWhisperBinary> {
    let whisperExe: string | null = null;

    if (useCuda) {
        whisperExe = await getCudaBinary();
        if (!whisperExe) {
            if (!cudaFallbackCpu) return { whisperExe: null, useCuda: true };
            onLog?.('CUDA binary not available, falling back to CPU');
            useCuda = false;
        }
    }

    if (!useCuda && !whisperExe) {
        whisperExe = await getCpuBinary();
    }

    return { whisperExe, useCuda };
}
