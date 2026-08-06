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
};

export default defaultConfig;
