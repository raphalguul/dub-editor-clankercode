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

const EDITOR_HELP_TEXT = (
    <>
        <h4>Editor</h4>
        <p style={{ fontSize: '0.8rem' }}>
            This selects the editor you wish to utilize. The advanced editor
            looks more like a full on video editting tool and allows you to
            perform batch processing on systems that support it. The simple
            editor is just the bare essentials and some prefer it.
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

const Config = (props) => {
    const [config, setConfig] = useState({});
    const [error, setError] = useState(null);

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

    const otherConfig = (
        <table style={{ margin: 'auto' }}>
            <tbody>
                <tr>
                    <td style={{ fontWeight: 'bold', textAlign: 'left' }}>
                        Default Editor{' '}
                        <HelpButton helpText={EDITOR_HELP_TEXT} />
                    </td>
                    <td>
                        <select
                            value={config.editor}
                            onChange={({ target: { value } }) => {
                                updateConfig('editor', value);
                                save({ ...config, editor: value });
                            }}
                        >
                            <option>None</option>
                            <option value="simple">Simple</option>
                            <option value="advanced">Advanced</option>
                        </select>
                    </td>
                </tr>
                <tr>
                    <td style={{ fontWeight: 'bold', textAlign: 'left' }}>
                        Fix Subtitles on Load{' '}
                        <HelpButton helpText={FIXSUBS_HELP_TEXT} />
                    </td>
                    <td>
                        <input
                            type="checkbox"
                            checked={config.fixSubsOnLoad !== false}
                            onChange={({ target: { checked } }) => {
                                updateConfig('fixSubsOnLoad', checked);
                                save({ ...config, fixSubsOnLoad: checked });
                            }}
                        />
                    </td>
                </tr>
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
