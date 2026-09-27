import {
    CENSOR_BAR_TYPES,
    createCensorBar,
    toSquare,
} from '../util/VideoTools';

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

const CENSOR_TYPE_LABELS = {
    black: 'Black Box',
    blur: 'Gaussian Blur',
    delogo: 'Delogo (Pixel Fill)',
};

// Accepts HH:MM:SS,mmm, HH:MM:SS.mmm, MM:SS(.mmm) or a bare millisecond count.
const parseTimestampToMs = (value) => {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    if (trimmed === '') {
        return null;
    }

    if (/^\d+$/.test(trimmed)) {
        return parseInt(trimmed, 10);
    }

    const match = trimmed.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/);
    if (!match) {
        return null;
    }

    const hours = match[1] ? parseInt(match[1], 10) : 0;
    const minutes = parseInt(match[2], 10);
    const seconds = parseInt(match[3], 10);
    const fraction = (match[4] || '0').padEnd(3, '0');

    return hours * 3600000 + minutes * 60000 + seconds * 1000 + parseInt(fraction, 10);
};

const MIN_BAR_LENGTH_MS = 1;

export default ({
    censorBars,
    currentBar,
    currentSliderPosition,
    currentRow,
    videoLength,
    frameWidth,
    frameHeight,
    onCensorBarsChange,
    onSelectBar,
}) => {
    let videoLengthMs = videoLength * 1000;
    let defaultBarSize = videoLengthMs * 0.1;

    let currentBarObject = censorBars[currentBar];

    // Editing a boundary must never produce an inverted range: the change handler
    // clamps to the video bounds but never enforces start < end, and an inverted
    // bar is dropped by the filter builder.
    const commitTime = (field, rawValue, input) => {
        const parsed = parseTimestampToMs(rawValue);
        if (parsed === null || !currentBarObject) {
            // Put the last good value back so the box does not keep showing text
            // that was never applied.
            if (input) {
                input.value = convertMillisecondsToTimestamp(
                    currentBarObject[field]
                );
            }
            return;
        }

        const next = { ...currentBarObject };
        next[field] = Math.max(0, Math.min(parsed, videoLengthMs));

        if (field === 'startTime') {
            next.startTime = Math.min(next.startTime, next.endTime - MIN_BAR_LENGTH_MS);
        } else {
            next.endTime = Math.max(next.endTime, next.startTime + MIN_BAR_LENGTH_MS);
        }

        if (next.startTime < 0) {
            next.startTime = 0;
        }

        onCensorBarsChange('edit', next);
    };

    const timeInput = (field, value) => (
        <input
            type="text"
            defaultValue={convertMillisecondsToTimestamp(value)}
            key={`${currentBar}-${field}-${value}`}
            disabled={!currentBarObject}
            style={{ width: '11ch' }}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => commitTime(field, e.target.value, e.target)}
            onKeyDown={(e) => {
                if (e.key === 'Enter') {
                    commitTime(field, e.currentTarget.value, e.currentTarget);
                    e.currentTarget.blur();
                }
            }}
        />
    );

    return (
        <div>
            <h3>Censor Bars</h3>
            <div className="subtitle-list">
                <table>
                    <thead
                        style={{
                            position: 'sticky',
                            top: '0px',
                            backgroundColor: 'black',
                        }}
                    >
                        <tr>
                            <th>Index</th>
                            <th>In</th>
                            <th>Out</th>
                            <th>Type</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {censorBars.map((bar) => {
                            return (
                                <tr
                                    key={bar.index}
                                    className={
                                        bar.index === currentBar
                                            ? 'selected'
                                            : null
                                    }
                                    style={{ cursor: 'pointer' }}
                                    onClick={() => {
                                        onSelectBar(bar.index);
                                    }}
                                >
                                    <td>[{bar.index}]</td>
                                    <td>
                                        {convertMillisecondsToTimestamp(
                                            bar.startTime
                                        )}
                                    </td>
                                    <td>
                                        {convertMillisecondsToTimestamp(
                                            bar.endTime
                                        )}
                                    </td>
                                    <td>{bar.type}</td>
                                    <td>
                                        <button
                                            onClick={(e) => {
                                                onCensorBarsChange(
                                                    'remove',
                                                    bar
                                                );
                                                onSelectBar(null);
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
                    let nextBar = censorBars.find(
                        (bar) => bar.startTime > startTime
                    );
                    let maxEnd = nextBar ? nextBar.startTime : videoLengthMs;
                    let endTime = Math.min(
                        startTime + defaultBarSize,
                        maxEnd
                    );
                    onCensorBarsChange(
                        'add',
                        createCensorBar({
                            startTime,
                            endTime,
                            rowIndex: currentRow,
                        })
                    );
                }}
            >
                Add Censor Bar
            </button>
            <h3>Censor Bar Editor</h3>
            <div className="subtitle-editor">
                <table style={{ margin: 'auto' }}>
                    <tbody>
                        <tr>
                            <td>
                                <label>Start</label>
                            </td>
                            <td>
                                {timeInput('startTime', currentBarObject?.startTime)}
                            </td>
                            <td>
                                <button
                                    title="i"
                                    onClick={() => {
                                        onCensorBarsChange('edit', {
                                            ...currentBarObject,
                                            startTime: currentSliderPosition,
                                        });
                                    }}
                                    disabled={!currentBarObject}
                                >
                                    Set at Play Head
                                </button>
                                <button
                                    title="Set start to video start"
                                    onClick={() => {
                                        onCensorBarsChange('edit', {
                                            ...currentBarObject,
                                            startTime: 0,
                                        });
                                    }}
                                    disabled={!currentBarObject}
                                >
                                    &#8676; 0
                                </button>
                            </td>
                        </tr>
                        <tr>
                            <td>
                                <label>End</label>
                            </td>
                            <td>
                                {timeInput('endTime', currentBarObject?.endTime)}
                            </td>
                            <td>
                                <button
                                    title="o"
                                    onClick={() => {
                                        onCensorBarsChange('edit', {
                                            ...currentBarObject,
                                            endTime: currentSliderPosition,
                                        });
                                    }}
                                    disabled={!currentBarObject}
                                >
                                    Set at Play Head
                                </button>
                                <button
                                    title="Set end to video end"
                                    onClick={() => {
                                        onCensorBarsChange('edit', {
                                            ...currentBarObject,
                                            endTime: videoLengthMs,
                                        });
                                    }}
                                    disabled={!currentBarObject}
                                >
                                    &#8677; End
                                </button>
                            </td>
                        </tr>
                        <tr>
                            <td>
                                <label>Type</label>
                            </td>
                            <td>
                                <select
                                    id="censor-bar-type"
                                    value={currentBarObject?.type}
                                    onChange={({ target: { value } }) => {
                                        onCensorBarsChange('edit', {
                                            ...currentBarObject,
                                            type: value,
                                        });
                                    }}
                                    disabled={!currentBarObject}
                                >
                                    {CENSOR_BAR_TYPES.map((type) => (
                                        <option key={type} value={type}>
                                            {CENSOR_TYPE_LABELS[type]}
                                        </option>
                                    ))}
                                </select>
                            </td>
                        </tr>
                        {currentBarObject?.type !== 'black' ? (
                            <tr>
                                <td>
                                    <label>Blur Strength</label>
                                </td>
                                <td>
                                    <input
                                        type="range"
                                        min="0.005"
                                        max="0.1"
                                        step="0.005"
                                        value={
                                            currentBarObject?.blurAmount ??
                                            0.02
                                        }
                                        onChange={({
                                            target: { value },
                                        }) => {
                                            onCensorBarsChange('edit', {
                                                ...currentBarObject,
                                                blurAmount:
                                                    parseFloat(value),
                                            });
                                        }}
                                        disabled={!currentBarObject}
                                    />
                                    <span style={{ marginLeft: '6px' }}>
                                        {Math.round(
                                            (currentBarObject
                                                ?.blurAmount ?? 0.02) * 1000
                                        )}
                                        /1000 frame width
                                    </span>
                                </td>
                            </tr>
                        ) : null}
                        <tr>
                            <td>
                                <label>Position</label>
                            </td>
                            <td>
                                {currentBarObject
                                    ? `x ${Math.round(
                                          currentBarObject.x * 100
                                      )}%  y ${Math.round(
                                          currentBarObject.y * 100
                                      )}%  w ${Math.round(
                                          currentBarObject.w * 100
                                      )}%  h ${Math.round(
                                          currentBarObject.h * 100
                                      )}%`
                                    : ''}
                            </td>
                        </tr>
                        <tr>
                            <td></td>
                            <td>
                                <button
                                    onClick={() => {
                                        onCensorBarsChange('edit', {
                                            ...currentBarObject,
                                            ...toSquare(
                                                currentBarObject,
                                                frameWidth,
                                                frameHeight
                                            ),
                                        });
                                    }}
                                    disabled={!currentBarObject}
                                >
                                    Make Square
                                </button>
                                <button
                                    onClick={() => {
                                        onCensorBarsChange('edit', {
                                            ...currentBarObject,
                                            x: (1 - currentBarObject.w) / 2,
                                            y: (1 - currentBarObject.h) / 2,
                                        });
                                    }}
                                    disabled={!currentBarObject}
                                >
                                    Center
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
};
