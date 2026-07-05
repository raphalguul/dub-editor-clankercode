import React, { useState, useEffect } from 'react';
import HelpButton from 'renderer/components/HelpButton';

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

const Config = (props) => {
    const [config, setConfig] = useState({});
    const [error, setError] = useState(null);
    const [showDrcSettings, setShowDrcSettings] = useState(false);

    useEffect(() => {
        getConfig();
    });

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

    const sliderRow = (label, field, min, max, step, helpText) => (
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
                />
                <span style={{ marginLeft: '8px', minWidth: '50px', display: 'inline-block' }}>
                    {config[field]}
                </span>
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
