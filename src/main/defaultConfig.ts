type Config = {
    whatTheDubDirectory: any;
    rifftraxDirectory: any;
    mediaDirectory: any;
    editor: string | null;
    isMac: boolean;
    lastGame: string;
    rememberGame: boolean;
    lastCollection: {
        rifftrax: string | null;
        whatthedub: string | null;
    };
    rememberCollection: boolean;
    fixSubsOnLoad: boolean;
};

const defaultConfig: Config = {
    whatTheDubDirectory: null,
    rifftraxDirectory: null,
    mediaDirectory: null,
    editor: "advanced",
    isMac: false,
    lastGame: "rifftrax",
    rememberGame: true,
    lastCollection: {
        rifftrax: null,
        whatthedub: null,
    },
    rememberCollection: true,
    fixSubsOnLoad: true,
};

export default defaultConfig;
