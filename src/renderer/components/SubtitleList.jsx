import CollectionAPI from 'renderer/api/CollectionAPI';
import ConfigAPI from 'renderer/api/ConfigAPI';
import CensorBarList from './CensorBarList';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

let convertMillisecondsToTimestamp = (milliseconds) => {
    if (milliseconds === undefined || milliseconds === null) {
        return '';
    }

    let seconds = milliseconds / 1000;
    let h = Math.floor(seconds / 3600);
    let m = Math.floor((seconds % 3600) / 60);
    let s = Math.floor(seconds % 60);
    let ms = Math.floor((seconds - Math.trunc(seconds)) * 1000);

    return `${h.toString().padStart(2, '0')}:${m
        .toString()
        .padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms
        .toString()
        .padStart(3, '0')}`;
};

export default ({
    subs,
    censorBars,
    activeTab,
    onTabChange,
    onCensorBarsChange,
    videoId,
    clipNumberOverride,
    titleOverride,
    currentSub,
    currentCensor,
    currentRow,
    currentSliderPosition,
    game,
    videoLength,
    frameWidth,
    frameHeight,
    onSubsChange,
    onSelectSub,
    onSelectCensorBar,
    onSave,
    isEdit,
}) => {
    const [clipTitle, setClipTitle] = useState(titleOverride || '');
    const [clipNumber, setClipNumber] = useState(clipNumberOverride || 1);
    const [collections, setCollections] = useState([]);
    const [selectedCollection, setSelectedCollection] = useState('_none');
    const [rememberAddCollection, setRememberAddCollection] = useState(false);
    const [showNewPackModal, setShowNewPackModal] = useState(false);
    const [newPackName, setNewPackName] = useState('');
    const [previousCollection, setPreviousCollection] = useState('_none');

    let videoLengthMs = videoLength * 1000;
    let defaultClipSize = videoLengthMs * 0.1;

    useEffect(() => {
        getCollections();
    }, []);

    useEffect(() => {
        (async () => {
            const config = await ConfigAPI.getConfig();
            setRememberAddCollection(!!config.rememberAddCollection);
            if (config.rememberAddCollection && config.lastAddCollection?.[game]) {
                setSelectedCollection(config.lastAddCollection[game]);
            }
        })();
    }, []);

    useEffect(() => {
        if (rememberAddCollection && selectedCollection !== '_none') {
            ConfigAPI.storeConfig({
                lastAddCollection: {
                    rifftrax: null,
                    whatthedub: null,
                    [game]: selectedCollection,
                },
            });
        }
    }, [selectedCollection]);

    useEffect(() => {
        if (titleOverride && clipNumberOverride) {
            let found = Object.keys(collections).find((collectionId) => {
                return collections[collectionId].includes(videoId);
            });

            if (found) {
                setSelectedCollection(found);
            }
        }
    }, [collections]);

    const getCollections = async () => {
        let collections = await CollectionAPI.getCollections(game);
        setCollections(collections);
    };

    const handleCollectionChange = ({ target: { value } }) => {
        if (value === '__new_pack__') {
            setPreviousCollection(selectedCollection);
            setNewPackName('');
            setShowNewPackModal(true);
            return;
        }
        setSelectedCollection(value);
    };

    const createNewPack = async () => {
        const name = newPackName.trim();
        if (!name) return;
        if (collections[name]) return;
        await CollectionAPI.createNewCollection(name, game);
        const updated = await CollectionAPI.getCollections(game);
        setCollections(updated);
        setSelectedCollection(name);
        setShowNewPackModal(false);
    };

    let currentSubObject = subs[currentSub];

    let prevSpeaker = null;
    if (currentSub !== null && subs.length > 0) {
        for (let i = currentSub - 1; i >= 0; i--) {
            if (subs[i]?.speaker) {
                prevSpeaker = subs[i].speaker;
                break;
            }
        }
    }
    let speakerPlaceholder = prevSpeaker || 'YOU FORGOT TO DEFINE SPEAKERS';

    return (
        <div className="subtitle-window">
            <h3>Clip Details</h3>
            <div className="video-editor">
                <table style={{ margin: 'auto' }}>
                    <tbody>
                    <tr>
                        <td>Clip Name</td>
                        <td>
                            <input
                                type="text"
                                value={clipTitle}
                                onChange={({ target: { value } }) => {
                                    setClipTitle(value);
                                }}
                                disabled={isEdit}
                            />
                        </td>
                    </tr>
                    <tr>
                        <td>Clip Number</td>
                        <td>
                            <input
                                type="number"
                                value={clipNumber}
                                onChange={({ target: { value } }) => {
                                    setClipNumber(value);
                                }}
                                disabled={isEdit}
                            />
                        </td>
                    </tr>
                    <tr>
                        <td>Collection</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                            <select
                                value={selectedCollection}
                                onChange={handleCollectionChange}
                                disabled={isEdit}
                            >
                                <option value="_none">None</option>
                                <option value="__new_pack__">New Pack…</option>
                                {Object.keys(collections).sort().map(
                                    (collectionId) => (
                                        <option key={collectionId} value={collectionId}>{collectionId}</option>
                                    )
                                )}
                            </select>
                            <label style={{ fontSize: '0.8em', marginLeft: 4 }}>
                                <input
                                    type="checkbox"
                                    checked={rememberAddCollection}
                                    onChange={({ target: { checked } }) => {
                                        setRememberAddCollection(checked);
                                        ConfigAPI.storeConfig({ rememberAddCollection: checked });
                                        if (checked && selectedCollection !== '_none') {
                                            ConfigAPI.storeConfig({
                                                lastAddCollection: {
                                                    rifftrax: null,
                                                    whatthedub: null,
                                                    [game]: selectedCollection,
                                                },
                                            });
                                        }
                                    }}
                                />
                                Remember
                            </label>
                        </td>
                    </tr>
                    </tbody>
                </table>
                <button
                    onClick={() => {
                        onSave(clipTitle, clipNumber, selectedCollection);
                    }}
                    disabled={!subs.find(({ type }) => type === 'dynamic')}
                >
                    Finalize Clip
                </button>
                <br />
                <Link to="/">
                    <button>Cancel</button>
                </Link>
            </div>
            <div className="list-tabs">
                <button
                    className={activeTab === 'subtitles' ? 'selected' : ''}
                    onClick={() => onTabChange('subtitles')}
                >
                    Subtitles ({subs.length})
                </button>
                <button
                    className={activeTab === 'censors' ? 'selected' : ''}
                    onClick={() => onTabChange('censors')}
                >
                    Censor Bars ({censorBars.length})
                </button>
            </div>
            {activeTab === 'censors' ? (
                <CensorBarList
                    censorBars={censorBars}
                    currentBar={currentCensor}
                    currentSliderPosition={currentSliderPosition}
                    currentRow={currentRow}
                    videoLength={videoLength}
                    frameWidth={frameWidth}
                    frameHeight={frameHeight}
                    onCensorBarsChange={onCensorBarsChange}
                    onSelectBar={onSelectCensorBar}
                />
            ) : (
                <>
            <h3>Subtitles</h3>
            <div className="subtitle-list">
                <table>
                    <thead style={{position: "sticky", top: "0px", backgroundColor: "black"}}>
                        <tr>
                            <th>Index</th>
                            <th>In</th>
                            <th>Out</th>
                            <th>Type</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {subs.map((sub) => {
                            return (
                                <tr
                                    key={sub.index}
                                    className={
                                        sub.index === currentSub
                                            ? 'selected'
                                            : null
                                    }
                                    style={{ cursor: 'pointer' }}
                                    onClick={() => {
                                        onSelectSub(sub.index);
                                    }}
                                >
                                    <td>[{sub.index}]</td>
                                    <td>
                                        {convertMillisecondsToTimestamp(
                                            sub.startTime
                                        )}
                                    </td>
                                    <td>
                                        {convertMillisecondsToTimestamp(
                                            sub.endTime
                                        )}
                                    </td>
                                    <td>{sub.type}</td>
                                    <td>
                                        <button
                                            onClick={(e) => {
                                                onSubsChange('remove', sub);
                                                onSelectSub(null);
                                                e.stopPropagation();
                                            }}
                                        >
                                            Remove
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <button
                title="n"
                onClick={() => {
                    let startTime = parseInt(currentSliderPosition);
                    let nextSub = subs.find(sub => sub.startTime > startTime);
                    let maxEnd = nextSub ? nextSub.startTime : videoLengthMs;
                    let endTime = Math.min(startTime + defaultClipSize, maxEnd);
                    onSubsChange('add', {
                        rowIndex: currentRow,
                        startTime: startTime,
                        endTime: endTime,
                        text: '',
                        type: 'subtitle',
                        voice: 'male',
                        speaker: '',
                    });
                }}
            >
                Add Subtitle
            </button>
            <h3>Subtitle Editor</h3>
            <div className="subtitle-editor">
                <table style={{ margin: 'auto' }}>
                    <tbody>
                    <tr>
                        <td>
                            <label>Start</label>
                        </td>
                        <td>
                            {convertMillisecondsToTimestamp(
                                currentSubObject?.startTime
                            )}
                        </td>
                        <td>
                            <button
                                title="i"
                                onClick={() => {
                                    onSubsChange(
                                        'edit',
                                        {
                                            ...currentSubObject,
                                            startTime:
                                                currentSliderPosition,
                                        },
                                        currentSub
                                    );
                                }}
                                disabled={!currentSubObject}
                            >
                                Set at Play Head
                            </button>
                            <button
                                title="Set start to video start"
                                onClick={() => {
                                    onSubsChange(
                                        'edit',
                                        {
                                            ...currentSubObject,
                                            startTime: 0,
                                        },
                                        currentSub
                                    );
                                }}
                                disabled={!currentSubObject}
                            >
                                ⇤
                            </button>
                        </td>
                    </tr>
                    <tr>
                        <td>
                            <label>End</label>
                        </td>
                        <td>
                            {convertMillisecondsToTimestamp(
                                currentSubObject?.endTime
                            )}
                        </td>
                        <td>
                            <button
                                title="o"
                                onClick={() => {
                                    onSubsChange(
                                        'edit',
                                        {
                                            ...currentSubObject,
                                            endTime:
                                                currentSliderPosition,
                                        },
                                        currentSub
                                    );
                                }}
                                disabled={!currentSubObject}
                            >
                                Set at Play Head
                            </button>
                            <button
                                title="Set end to video end"
                                            onClick={() => {
                                                onSubsChange(
                                                    'edit',
                                                    {
                                                        ...currentSubObject,
                                                        endTime: videoLength * 1000 + 15,
                                                    },
                                                    currentSub
                                                );
                                            }}
                                disabled={!currentSubObject}
                            >
                                ⇥
                            </button>
                        </td>
                    </tr>
                    <tr>
                        <td>
                            <label>Subtitle Type</label>
                        </td>
                        <td>
                            <select
                                id="subtitle-type"
                                value={currentSubObject?.type}
                                onChange={({
                                    target: { value: type },
                                }) => {
                                    onSubsChange(
                                        'edit',
                                        {
                                            ...currentSubObject,
                                            type,
                                        },
                                        currentSub
                                    );
                                }}
                                disabled={!currentSubObject}
                            >
                                <option value="subtitle">
                                    Subtitle
                                </option>
                                <option value="dynamic">
                                    {game === 'rifftrax'
                                        ? 'Riff'
                                        : 'Dub'}
                                </option>
                            </select>
                        </td>
                    </tr>
                    {game === 'whatthedub' &&
                    currentSubObject?.type === 'dynamic' ? (
                        <tr>
                            <td>
                                <label>Voice</label>
                            </td>
                            <td>
                                <select
                                    id="subtitle-voice"
                                    value={currentSubObject?.voice}
                                    onChange={({
                                        target: { value: voice },
                                    }) => {
                                        onSubsChange(
                                            'edit',
                                            {
                                                ...currentSubObject,
                                                voice,
                                            },
                                            currentSub
                                        );
                                    }}
                                    disabled={!currentSubObject}
                                >
                                    <option value="male">Male</option>
                                    <option value="female">
                                        Female
                                    </option>
                                </select>
                            </td>
                        </tr>
                    ) : null}
                    <tr>
                        <td>
                            <label>Speaker</label>
                        </td>
                        <td>
                            <input
                                type="text"
                                value={currentSubObject?.speaker || ''}
                                onChange={({
                                    target: { value: speaker },
                                }) => {
                                    onSubsChange(
                                        'edit',
                                        {
                                            ...currentSubObject,
                                            speaker,
                                        },
                                        currentSub
                                    );
                                }}
                                disabled={!currentSubObject}
                                placeholder={speakerPlaceholder}
                            />
                        </td>
                    </tr>
                    {currentSubObject?.type !== 'dynamic' ? (
                        <tr>
                            <td>
                                <label>Subtitle</label>
                            </td>
                            <td>
                                <textarea
                                    id="subtitle-text"
                                    value={currentSubObject?.text}
                                    onChange={({
                                        target: { value: text },
                                    }) => {
                                        onSubsChange(
                                            'edit',
                                            {
                                                ...currentSubObject,
                                                text,
                                            },
                                            currentSub
                                        );
                                    }}
                                    disabled={!currentSubObject}
                                />
                            </td>
                        </tr>
                    ) : null}
                    </tbody>
                </table>
            </div>
                </>
            )}
        {showNewPackModal && (
            <div
                className="modal-overlay"
                onClick={() => {
                    setShowNewPackModal(false);
                    setSelectedCollection(previousCollection);
                }}
            >
                <div
                    className="modal"
                    onClick={(e) => e.stopPropagation()}
                >
                    <h4>Create New Clip Pack</h4>
                    <input
                        value={newPackName}
                        onChange={(e) => setNewPackName(e.target.value)}
                        placeholder="Pack name"
                        autoFocus
                        onKeyDown={(e) => e.key === 'Enter' && createNewPack()}
                    />
                    <div className="modal-buttons">
                        <button onClick={createNewPack}>Create</button>
                        <button onClick={() => {
                            setShowNewPackModal(false);
                            setSelectedCollection(previousCollection);
                        }}>Cancel</button>
                    </div>
                </div>
            </div>
        )}
        </div>
    );
};
