type Config = {
    whatTheDubDirectory: any;
    rifftraxDirectory: any;
    mediaDirectory: any;
    isMac: boolean;
    lastGame: string;
    rememberGame: boolean;
    lastCollection: {
        rifftrax: string | null;
        whatthedub: string | null;
    };
    rememberCollection: boolean;
    rememberAddCollection: boolean;
    lastAddCollection: {
        rifftrax: string | null;
        whatthedub: string | null;
    };
    fixSubsOnLoad: boolean;
    checkSpeakersOnFinalize: boolean;
    audioNormalizeOnFinalize: boolean;
    audioLoudnessTarget: number;
    audioDrcEnabled: boolean;
    audioDrcThreshold: number;
    audioDrcRatio: number;
    audioDrcAttack: number;
    audioDrcRelease: number;
    whisperModelSize: string;
    whisperUseCuda: boolean;
    whisperCudaFallbackCpu: boolean;
    whisperSuppressSilence: boolean;
    autoIncrementClipNumber: boolean;
    hardwareVideoDecode: boolean;
    // 'saveSource' keeps an uncensored copy plus the bar data so censoring stays
    // reversible, 'bakeOnly' keeps neither, and null means the user has not
    // picked yet so the editor asks on the first censored finalize.
    censorMode: 'saveSource' | 'bakeOnly' | null;
    // Seeds newly created bars only. Bars already on disk keep whatever their
    // sidecar stored, so changing these never rewrites existing clips.
    defaultCensorType: 'black' | 'blur' | 'delogo';
    // A fraction of frame width. Bounded by the clamp in clampCensorBar.
    defaultCensorBlurAmount: number;
};

const defaultConfig: Config = {
    whatTheDubDirectory: null,
    rifftraxDirectory: null,
    mediaDirectory: null,
    isMac: false,
    lastGame: "rifftrax",
    rememberGame: true,
    lastCollection: {
        rifftrax: null,
        whatthedub: null,
    },
    rememberCollection: true,
    rememberAddCollection: false,
    lastAddCollection: {
        rifftrax: null,
        whatthedub: null,
    },
    fixSubsOnLoad: true,
    checkSpeakersOnFinalize: true,
    audioNormalizeOnFinalize: true,
    audioLoudnessTarget: -20,
    audioDrcEnabled: true,
    audioDrcThreshold: -12,
    audioDrcRatio: 2,
    audioDrcAttack: 0.2,
    audioDrcRelease: 1.0,
    whisperModelSize: "base",
    whisperUseCuda: true,
    whisperCudaFallbackCpu: true,
    whisperSuppressSilence: true,
    autoIncrementClipNumber: true,
    hardwareVideoDecode: true,
    censorMode: null,
    defaultCensorType: "black",
    defaultCensorBlurAmount: 0.02,
};

export default defaultConfig;
