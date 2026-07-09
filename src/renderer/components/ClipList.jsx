import { useEffect, useRef, useState } from 'react';
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
    clips,
    currentClip,
    currentSliderPosition,
    videoLength,
    onClipsChange,
    onSelectClip,
    onProcess,
    onPlayClip,
    initialTitle,
}) => {
    const [clipTitle, setClipTitle] = useState(initialTitle || '');
    const [blinkingClipIndex, setBlinkingClipIndex] = useState(null);
    const blinkTimerRef = useRef(null);
    let currentClipObject = clips[currentClip];

    let videoLengthMs = videoLength * 1000;
    let defaultClipSize = videoLengthMs * 0.1;

    useEffect(() => {
        return () => {
            if (blinkTimerRef.current) {
                clearTimeout(blinkTimerRef.current);
            }
        };
    }, []);

    const triggerBlink = (clipIndex) => {
        setBlinkingClipIndex(clipIndex);
        if (blinkTimerRef.current) {
            clearTimeout(blinkTimerRef.current);
        }
        blinkTimerRef.current = setTimeout(() => {
            setBlinkingClipIndex(null);
            blinkTimerRef.current = null;
        }, 400);
    };

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
                                />
                            </td>
                        </tr>

                    </tbody>
                </table>
                <button
                    onClick={() => {
                        onProcess(clipTitle, clips);
                    }}
                    disabled={clips.length < 1}
                >
                    Process Batch
                </button>
                <br />
                <Link to="/">
                    <button>Cancel</button>
                </Link>
            </div>
            <h3>Clips</h3>
            <div className="subtitle-list">
                <table>
                <thead style={{position: "sticky", top: "0px", backgroundColor: "black"}}>
                        <tr>
                            <th>Index</th>
                            <th>In</th>
                            <th>Out</th>
                            <th className="clip-lock-col"></th>
                            <th></th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {clips.map((clip) => {
                            return (
                                <tr
                                    className={`${clip.index === currentClip ? 'selected' : ''} ${blinkingClipIndex === clip.index ? 'blink-red' : ''}`}
                                    style={{ cursor: 'pointer' }}
                                    onClick={() => {
                                        onSelectClip(clip.index);
                                    }}
                                >
                                    <td>[{clip.index}]</td>
                                    <td>
                                        {convertMillisecondsToTimestamp(
                                            clip.startTime
                                        )}
                                    </td>
                                    <td>
                                        {convertMillisecondsToTimestamp(
                                            clip.endTime
                                        )}
                                    </td>
                                    <td className="clip-lock-col">
                                        <input
                                            type="checkbox"
                                            checked={clip.locked || false}
                                            title={clip.locked ? 'Unlock clip' : 'Lock clip'}
                                            onChange={() => {
                                                onClipsChange('edit', {
                                                    ...clip,
                                                    locked: !clip.locked,
                                                }, clip.index);
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    </td>
                                    <td>
                                        <button
                                            title="Play Clip"
                                            onClick={(e) => {
                                                onPlayClip(clip);
                                                e.stopPropagation();
                                            }}
                                        >
                                            ▶
                                        </button>
                                    </td>
                                    <td>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (clip.locked) {
                                                    triggerBlink(clip.index);
                                                    return;
                                                }
                                                onClipsChange('remove', clip);
                                                onSelectClip(null);
                                            }}
                                            className={blinkingClipIndex === clip.index ? 'blink-red' : ''}
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
                    onClipsChange('add', {
                        rowIndex: 0,
                        startTime: parseInt(currentSliderPosition),
                        endTime:
                            Math.min(parseInt(currentSliderPosition) + defaultClipSize, videoLengthMs),
                    });
                }}
            >
                Add Clip
            </button>
                <h3>Clip Editor</h3>
                <div className="subtitle-editor">
                    <table style={{ margin: 'auto' }}>
                        <tr>
                            <td>
                                <label>Start</label>
                            </td>
                            <td>
                                {convertMillisecondsToTimestamp(
                                    currentClipObject?.startTime
                                )}
                            </td>
                            <td>
                                <button
                                    title="i"
                                    onClick={() => {
                                        if (!currentClipObject || currentClipObject?.locked) {
                                            onClipsChange('add', {
                                                rowIndex: 0,
                                                startTime: parseInt(currentSliderPosition),
                                                endTime: Math.min(parseInt(currentSliderPosition) + defaultClipSize, videoLengthMs),
                                            });
                                        } else {
                                            onClipsChange(
                                                'edit',
                                                {
                                                    ...currentClipObject,
                                                    startTime:
                                                        currentSliderPosition,
                                                },
                                                currentClip
                                            );
                                        }
                                    }}
                                >
                                    Set at Play Head
                                </button>
                            </td>
                        </tr>
                        <tr>
                            <td>
                                <label>End</label>
                            </td>
                            <td>
                                {convertMillisecondsToTimestamp(
                                    currentClipObject?.endTime
                                )}
                            </td>
                            <td>
                                <button
                                    title="o"
                                    onClick={() => {
                                        if (!currentClipObject || currentClipObject?.locked) {
                                            let newStart = Math.max(0,
                                                parseInt(currentSliderPosition) -
                                                defaultClipSize
                                            );
                                            onClipsChange('add', {
                                                rowIndex: 0,
                                                startTime: newStart,
                                                endTime: parseInt(currentSliderPosition),
                                            });
                                        } else {
                                            onClipsChange(
                                                'edit',
                                                {
                                                    ...currentClipObject,
                                                    endTime:
                                                        currentSliderPosition,
                                                },
                                                currentClip
                                            );
                                        }
                                    }}
                                >
                                    Set at Play Head
                                </button>
                            </td>
                        </tr>
                        <tr>
                            <td>
                                <label>Length</label>
                            </td>
                            <td>
                                {currentClipObject
                                    ? convertMillisecondsToTimestamp(
                                          currentClipObject.endTime -
                                              currentClipObject.startTime
                                      )
                                    : ''}
                            </td>
                            <td></td>
                        </tr>
                        <tr>
                            <td>
                                <label>Locked</label>
                            </td>
                            <td>
                                <input
                                    type="checkbox"
                                    checked={currentClipObject?.locked || false}
                                    disabled={!currentClipObject}
                                    title={currentClipObject?.locked ? 'Unlock clip' : 'Lock clip'}
                                    onChange={() => {
                                        if (!currentClipObject) return;
                                        onClipsChange('edit', {
                                            ...currentClipObject,
                                            locked: !currentClipObject.locked,
                                        }, currentClip);
                                    }}
                                />
                            </td>
                            <td></td>
                        </tr>
                    </table>
                </div>
        </div>
    );
};
