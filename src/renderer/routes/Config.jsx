import React, { useState, useEffect } from 'react';
import HelpButton from 'renderer/components/HelpButton';
import WhisperAPI from 'renderer/api/WhisperAPI';
import {
    BLUR_AMOUNT_STEP,
    MAX_BLUR_AMOUNT,
    MIN_BLUR_AMOUNT,
} from 'renderer/util/VideoTools';

const WHISPER_STATUS_LABELS = {
    ok: { text: 'Ready', color: '#4caf50' },
    cached: { text: 'Cached', color: '#888' },
    error: { text: 'Failed', color: '#f44336' },
};

const WORKSPACE_HELP_TEXT = (
    <>
        <h4>Workspace Directory</h4>
        <p style={{ fontSize: '0.8rem' }}>
            This directory is where you store works in progress before you
            either export the clip pack to use in Steamworkshop or the launcher.
            Do not use either game install directory for this.
        </p>
    </>
);

const SPEAKER_CONFIRM_HELP_TEXT = (
    <>
        <h4>Warn if no speakers on Finalize</h4>
        <p style={{ fontSize: '0.8rem' }}>
            When enabled, you will be prompted to confirm before finalizing a
            clip that has no speakers defined. Disable this to skip the warning.
        </p>
    </>
);

const AUTO_INCREMENT_HELP_TEXT = (
    <>
        <h4>Auto-increment clip number on duplicate</h4>
        <p style={{ fontSize: '0.8rem' }}>
            When enabled, the editor automatically finds an available clip
            number (iterating upwards from 1) instead of showing a warning
            when a clip with the same name already exists. Capped at 10000
            iterations to prevent infinite loops.
        </p>
    </>
);

const FIXSUBS_HELP_TEXT = (
    <>
        <h4>Fix Subtitles on Load</h4>
        <p style={{ fontSize: '0.8rem' }}>
            When enabled, subtitle timestamps are automatically clamped to the
            video length when a clip is loaded. Disable this if you need to
            preserve original SRT timestamps that extend past the video end.
        </p>
    </>
);

const HARDWARE_DECODE_HELP = (
    <>
        <h4>Hardware Video Decode</h4>
        <p style={{ fontSize: '0.8rem' }}>
            Uses your GPU to decode video during playback. Turn this off only if
            you see decode errors or video glitches (some files with irregular
            timestamps fail on hardware decoders). Requires an app restart to
            take effect.
        </p>
    </>
);

const NORMALIZE_FINALIZE_HELP = (
    <>
        <h4>Normalize Audio on Finalize</h4>
        <p style={{ fontSize: '0.8rem' }}>
            Automatically normalizes audio (loudness + dynamic range
            compression) when you finalize a clip. Already-normalized clips are
            skipped. Disable if you prefer raw audio levels.
        </p>
    </>
);

const DRC_HELP = (
    <>
        <h4>Dynamic Range Compression</h4>
        <p style={{ fontSize: '0.8rem' }}>
            Evens out volume differences between quiet and loud parts.
            Recommended for WTD:
            Threshold -12
            Ratio 2
            Attack 0,2
            Release 1
        </p>
    </>
);

const LOUDNESS_HELP = (
    <>
        <h4>Loudness Target (EBU R128)</h4>
        <p style={{ fontSize: '0.8rem' }}>
            Target integrated loudness in LUFS.
            Recommended for WTD: -20
        </p>
    </>
);

const WHISPER_MODEL_HELP = (
    <>
        <h4>Whisper Model Size</h4>
        <p style={{ fontSize: '0.8rem' }}>
            Larger models produce better transcriptions but are slower and use
            more RAM. tiny (32MB) is fastest, large (1GB) is most accurate.
            Models download on first use. GPU acceleration only works with Nvidia cards.
            Fallback is recommended. Suppress silence is intended to prevent subtitle 
            generation on quiet portions of the video. Experimental.
        </p>
    </>
);

const WHISPER_FILES_HELP = (
    <>
        <h4>Check &amp; Download Whisper Components</h4>
        <p style={{ fontSize: '0.8rem' }}>
            Verifies that the whisper.cpp binaries and your selected model are
            present, and downloads anything missing. Run this if transcription
            fails, so you can see exactly which download failed.
        </p>
        <p style={{ fontSize: '0.8rem' }}>
            If you have no internet connection, you can place the files
            yourself. See the Whisper Troubleshooting section of the README for
            the URLs and folder locations.
        </p>
    </>
);

const CENSOR_MODE_HELP = (
    <>
        <h4>Censor Bar Storage</h4>
        <p style={{ fontSize: '0.8rem' }}>
            <strong>Keep an uncensored copy</strong> saves the uncensored video
            and the censor bar data next to every censored clip, so you can
            reopen the clip and move, resize or remove the bars at any time.
            Censored clips take roughly twice as much space in your workspace.
        </p>
        <p style={{ fontSize: '0.8rem' }}>
            <strong>Bake only</strong> saves just the censored clip. Nothing
            else is kept, so the bars cannot be changed or removed afterwards
            and you would have to import the original video again. This is the
            smaller option.
        </p>
        <p style={{ fontSize: '0.8rem' }}>
            Either way the exported clip pack contains the censored video only,
            so this setting does not change the size of the pack.
        </p>
        <p style={{ fontSize: '0.8rem' }}>
            <strong>Ask me each time</strong> shows this popup on
            every censored finalize until you choose to remember a setting.
        </p>
    </>
);

const CENSOR_MODES = [
    ['', 'Ask each time'],
    ['saveSource', 'Keep an uncensored copy (reversible)'],
    ['bakeOnly', 'No uncensored copy (not reversible)'],
];

const CENSOR_TYPE_HELP = (
    <>
        <h4>Default Censor Bar Type</h4>
        <p style={{ fontSize: '0.8rem' }}>
            The type given to newly added censor bars. Every bar can still be
            changed individually in the censor bar editor afterwards.
        </p>
        <p style={{ fontSize: '0.8rem' }}>
            <strong>Black Box</strong> covers the region with a solid black
            rectangle, <strong>Gaussian Blur</strong> blurs it, and{' '}
            <strong>Delogo</strong> interpolates over it from the surrounding
            pixels. Blur strength is only used by the blur type.
        </p>
    </>
);

const CENSOR_TYPE_OPTIONS = [
    ['black', 'Black Box'],
    ['blur', 'Gaussian Blur'],
    ['delogo', 'Delogo (Pixel Fill)'],
];

const CENSOR_BLUR_HELP = (
    <>
        <h4>Default Blur Strength</h4>
        <p style={{ fontSize: '0.8rem' }}>
            The blur given to newly added Gaussian Blur bars, as a fraction of
            frame width. 2/1000 is a very light blur, 20/1000 is heavy, and
            200/1000 is about the point where the region is unreadable.
        </p>
        <p style={{ fontSize: '0.8rem' }}>
            This is only a starting point for new bars. Existing bars keep the
            strength they were saved with, and each bar keeps its own value if
            you adjust it in the editor.
        </p>
    </>
);

const Config = (props) => {
    const [config, setConfig] = useState({});
    const [error, setError] = useState(null);
    const [showDrcSettings, setShowDrcSettings] = useState(false);
    const [whisperStatus, setWhisperStatus] = useState(null);
    const [whisperBusy, setWhisperBusy] = useState(false);
    const [whisperLog, setWhisperLog] = useState('');

    useEffect(() => {
        getConfig();
    }, []);

    const updateConfig = (field, value) => {
        const newConfig = { ...config };
        newConfig[field] = value;
        setConfig(newConfig);

        return newConfig;
    };

    const save = async (newConfig) => {
        setError(null);
        await window.api.send('updateConfig', newConfig);
    };

    const getConfig = async () => {
        const config = await window.api.send('getConfig');
        setConfig(config);
    };

    const openDialog = async (field) => {
        let filePath = await window.api.send('openDialog');

        if (filePath) {
            let newConfig = updateConfig(field, filePath);
            save(newConfig);
        }
    };

    const runWhisperPreflight = async () => {
        setWhisperBusy(true);
        setWhisperStatus(null);
        setWhisperLog('');

        window.api.onProgress((msg) => {
            if (msg) setWhisperLog(msg);
        });

        const whisperConfig = {
            modelSize: config.whisperModelSize || 'base',
            useCuda: config.whisperUseCuda !== false,
            cudaFallbackCpu: config.whisperCudaFallbackCpu !== false,
            suppressSilence: config.whisperSuppressSilence !== false,
        };

        try {
            setWhisperStatus(await WhisperAPI.preflight(whisperConfig));
        } catch (err) {
            setWhisperStatus({
                ok: false,
                items: [
                    {
                        label: 'Preflight',
                        status: 'error',
                        detail: `${err}`,
                    },
                ],
            });
        } finally {
            window.api.removeProgressListener();
            setWhisperBusy(false);
        }
    };

    const checkboxRow = (label, field, helpText) => (
        <tr>
            <td style={{ fontWeight: 'bold', textAlign: 'left' }}>
                {label} <HelpButton helpText={helpText} />
            </td>
            <td>
                <input
                    type="checkbox"
                    checked={config[field] !== false}
                    onChange={({ target: { checked } }) => {
                        let nc = { ...config, [field]: checked };
                        setConfig(nc);
                        save(nc);
                    }}
                />
            </td>
        </tr>
    );

    const sliderRow = (label, field, min, max, step, helpText, format) => (
        <tr>
            <td style={{ fontWeight: 'bold', textAlign: 'left' }}>
                {label} <HelpButton helpText={helpText} />
            </td>
            <td style={{ textAlign: 'left', paddingLeft: '10px' }}>
                <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={config[field] ?? 0}
                    onChange={({ target: { value } }) => {
                        let nc = { ...config, [field]: parseFloat(value) };
                        setConfig(nc);
                    }}
                    onMouseUp={() => save(config)}
                    onBlur={() => save(config)}
                />
                <span style={{ marginLeft: '8px', minWidth: '50px', display: 'inline-block' }}>
                    {format ? format(config[field]) : config[field]}
                </span>
            </td>
        </tr>
    );

    const selectRow = (label, field, options, fallback, helpText) => (
        <tr>
            <td style={{ fontWeight: 'bold', textAlign: 'left' }}>
                {label} <HelpButton helpText={helpText} />
            </td>
            <td style={{ textAlign: 'left', paddingLeft: '10px' }}>
                <select
                    value={config[field] ?? fallback}
                    onChange={({ target: { value } }) => {
                        let nc = { ...config, [field]: value === '' ? null : value };
                        setConfig(nc);
                        save(nc);
                    }}
                >
                    {options.map(([value, text]) => (
                        <option key={value} value={value}>
                            {text}
                        </option>
                    ))}
                </select>
            </td>
        </tr>
    );

    const audioSection = (
        <div style={{ marginTop: '30px' }}>
            <h4>Audio Normalization</h4>
            <table style={{ margin: 'auto' }}>
                <tbody>
                    {checkboxRow(
                        'Normalize Audio on Finalize',
                        'audioNormalizeOnFinalize',
                        NORMALIZE_FINALIZE_HELP
                    )}
                    {sliderRow(
                        'Loudness Target (LUFS)',
                        'audioLoudnessTarget',
                        -30,
                        -5,
                        1,
                        LOUDNESS_HELP
                    )}
                    {checkboxRow(
                        'Enable DRC',
                        'audioDrcEnabled',
                        DRC_HELP
                    )}
                    {config.audioDrcEnabled !== false && (
                        <tr>
                            <td colSpan={2} style={{ padding: '5px 0' }}>
                                <button
                                    type="button"
                                    onClick={() => setShowDrcSettings(!showDrcSettings)}
                                    style={{
                                        fontSize: '0.8rem',
                                        padding: '2px 8px',
                                    }}
                                >
                                    {showDrcSettings ? 'Hide' : 'Show'} DRC Settings
                                </button>
                            </td>
                        </tr>
                    )}
                    {config.audioDrcEnabled !== false && showDrcSettings && (
                        <>
                            {sliderRow(
                                'DRC Threshold (dB)',
                                'audioDrcThreshold',
                                -30,
                                0,
                                1,
                                DRC_HELP
                            )}
                            {sliderRow(
                                'DRC Ratio',
                                'audioDrcRatio',
                                1,
                                10,
                                0.5,
                                DRC_HELP
                            )}
                            {sliderRow(
                                'DRC Attack (s)',
                                'audioDrcAttack',
                                0.01,
                                1,
                                0.01,
                                DRC_HELP
                            )}
                            {sliderRow(
                                'DRC Release (s)',
                                'audioDrcRelease',
                                0.05,
                                5,
                                0.05,
                                DRC_HELP
                            )}
                        </>
                    )}
                </tbody>
            </table>
        </div>
    );

    const modelSizes = ['tiny', 'base', 'small', 'medium', 'large'];

    const whisperSection = (
        <div style={{ marginTop: '30px' }}>
            <h4>Whisper Transcription</h4>
            <p style={{ fontSize: '0.75rem', color: '#888' }}>
                Models and binaries download automatically on first use.
            </p>
            <table style={{ margin: 'auto' }}>
                <tbody>
                    <tr>
                        <td style={{ fontWeight: 'bold', textAlign: 'left' }}>
                            Model Size <HelpButton helpText={WHISPER_MODEL_HELP} />
                        </td>
                        <td style={{ textAlign: 'left', paddingLeft: '10px' }}>
                            <select
                                value={config.whisperModelSize || 'base'}
                                onChange={({ target: { value } }) => {
                                    let nc = { ...config, whisperModelSize: value };
                                    setConfig(nc);
                                    save(nc);
                                }}
                            >
                                {modelSizes.map((s) => (
                                    <option key={s} value={s}>
                                        {s}
                                    </option>
                                ))}
                            </select>
                        </td>
                    </tr>
                    {checkboxRow(
                        'Use CUDA (GPU Acceleration)',
                        'whisperUseCuda',
                        WHISPER_MODEL_HELP
                    )}
                    {checkboxRow(
                        'Fallback to CPU if CUDA fails',
                        'whisperCudaFallbackCpu',
                        WHISPER_MODEL_HELP
                    )}
                    {checkboxRow(
                        'Suppress Silence',
                        'whisperSuppressSilence',
                        WHISPER_MODEL_HELP
                    )}
                    <tr>
                        <td style={{ fontWeight: 'bold', textAlign: 'left' }}>
                            Whisper Files <HelpButton helpText={WHISPER_FILES_HELP} />
                        </td>
                        <td style={{ textAlign: 'left', paddingLeft: '10px' }}>
                            <button
                                onClick={runWhisperPreflight}
                                disabled={whisperBusy}
                                style={{ fontWeight: 'bold' }}
                            >
                                {whisperBusy
                                    ? 'Downloading...'
                                    : 'Check & Download Whisper Components'}
                            </button>
                        </td>
                    </tr>
                </tbody>
            </table>
            {whisperBusy && whisperLog && (
                <p style={{ fontSize: '0.7rem', color: '#888', marginTop: '8px' }}>
                    {whisperLog}
                </p>
            )}
            {whisperStatus && (
                <div style={{ marginTop: '10px' }}>
                    <table style={{ margin: 'auto' }}>
                        <tbody>
                            {whisperStatus.items.map((item) => (
                                <tr key={item.label}>
                                    <td
                                        style={{
                                            textAlign: 'left',
                                            paddingRight: '10px',
                                            fontWeight: 'bold',
                                            color:
                                                WHISPER_STATUS_LABELS[
                                                    item.status
                                                ].color,
                                        }}
                                    >
                                        {
                                            WHISPER_STATUS_LABELS[
                                                item.status
                                            ].text
                                        }
                                    </td>
                                    <td style={{ textAlign: 'left' }}>
                                        {item.label}
                                    </td>
                                    <td
                                        style={{
                                            textAlign: 'left',
                                            paddingLeft: '10px',
                                            color: '#888',
                                        }}
                                    >
                                        {item.detail}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {whisperStatus.modelDir && (
                        <p
                            style={{
                                fontSize: '0.7rem',
                                color: '#888',
                                marginTop: '8px',
                            }}
                        >
                            Files are stored in {whisperStatus.modelDir}
                        </p>
                    )}
                </div>
            )}
        </div>
    );

    const censorSection = (
        <div style={{ marginTop: '30px' }}>
            <h4>Censoring</h4>
            <table style={{ margin: 'auto' }}>
                <tbody>
                    {selectRow(
                        'Censor Bar Storage',
                        'censorMode',
                        CENSOR_MODES,
                        '',
                        CENSOR_MODE_HELP
                    )}
                    {selectRow(
                        'Default Censor Bar Type',
                        'defaultCensorType',
                        CENSOR_TYPE_OPTIONS,
                        'black',
                        CENSOR_TYPE_HELP
                    )}
                    {sliderRow(
                        'Default Blur Strength',
                        'defaultCensorBlurAmount',
                        MIN_BLUR_AMOUNT,
                        MAX_BLUR_AMOUNT,
                        BLUR_AMOUNT_STEP,
                        CENSOR_BLUR_HELP,
                        (value) =>
                            `${Math.round((value ?? 0) * 1000)}/1000 frame width`
                    )}
                </tbody>
            </table>
        </div>
    );

    const otherConfig = (
        <table style={{ margin: 'auto' }}>
            <tbody>
                {checkboxRow('Fix Subtitles on Load', 'fixSubsOnLoad', FIXSUBS_HELP_TEXT)}
                {checkboxRow(
                    'Warn if no speakers on Finalize',
                    'checkSpeakersOnFinalize',
                    SPEAKER_CONFIRM_HELP_TEXT
                )}
                {checkboxRow(
                    'Auto-increment clip number on duplicate',
                    'autoIncrementClipNumber',
                    AUTO_INCREMENT_HELP_TEXT
                )}
                {checkboxRow(
                    'Hardware Video Decode',
                    'hardwareVideoDecode',
                    HARDWARE_DECODE_HELP
                )}
            </tbody>
        </table>
    );

    return (
        <div>
            <h3>Application Config</h3>
            <div style={{ color: 'red' }}>{error}</div>
            <table style={{ margin: 'auto' }}>
                <tbody>
                    <tr>
                        <td style={{ fontWeight: 'bold', textAlign: 'left' }}>
                            Workspace Directory{' '}
                            <HelpButton helpText={WORKSPACE_HELP_TEXT} />
                        </td>
                        <td>
                            <button
                                onClick={() => {
                                    openDialog('mediaDirectory');
                                }}
                            >
                                Browse
                            </button>
                        </td>
                        <td
                            style={{
                                textAlign: 'left',
                                verticalAlign: 'middle',
                            }}
                        >
                            {config.mediaDirectory
                                ? config.mediaDirectory
                                : 'None'}
                        </td>
                    </tr>
                </tbody>
            </table>
            {otherConfig}
            {censorSection}
            {audioSection}
            {whisperSection}
            {props.onRefresh ? (
                <button
                    onClick={() => {
                        props.onRefresh();
                    }}
                    disabled={error || !config.mediaDirectory}
                >
                    Save
                </button>
            ) : null}
        </div>
    );
};

export default Config;
