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
};

export default defaultConfig;
