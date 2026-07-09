import React, { useEffect, useRef, useState } from 'react';

let convertMillisecondsToTimestamp = (milliseconds) => {
    if (milliseconds < 0) {
        return '00:00:00,000';
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

let dragStart = null;
let dragStartTime = null;
let dragEndTime = null;
let dragSub = null;
let isResizing = false;

export default ({
    timelineWidth,
    isPlaying,
    currentSub,
    currentSliderPosition: actualSliderPosition,
    videoLength,
    offset,
    subs,
    onSliderPositionChange,
    onSubsChange,
    onStateChange,
    onSubSelect,
    onRowChange,
    rowCount,
    currentRow,
}) => {
    if (!offset) {
        offset = 0;
    }

    let videoLengthMs = videoLength * 1000;

    const [zoom, setZoom] = useState(1);
    const [viewStartMs, setViewStartMs] = useState(0);
    const [blinkingSubIndex, setBlinkingSubIndex] = useState(null);
    const blinkTimerRef = useRef(null);
    const timelineContainerRef = useRef(null);

    const triggerBlink = (index) => {
        setBlinkingSubIndex(index);
        if (blinkTimerRef.current) {
            clearTimeout(blinkTimerRef.current);
        }
        blinkTimerRef.current = setTimeout(() => {
            setBlinkingSubIndex(null);
            blinkTimerRef.current = null;
        }, 400);
    };

    let currentSliderPosition = actualSliderPosition - offset;
    let currentPosition = currentSliderPosition / 1000;

    let visibleWindowMs = Math.max(1, videoLengthMs / Math.max(1, zoom));
    let viewEndMs = viewStartMs + visibleWindowMs;

    useEffect(() => {
        document.ondragover = (e) => {
            e.preventDefault();
        };
    });

    useEffect(() => {
        return () => {
            if (blinkTimerRef.current) {
                clearTimeout(blinkTimerRef.current);
            }
        };
    }, []);

    useEffect(() => {
        const el = timelineContainerRef.current;
        if (!el) {
            return;
        }
        el.addEventListener('wheel', handleWheel, { passive: false });
        return () => {
            el.removeEventListener('wheel', handleWheel);
        };
    }, [videoLengthMs, zoom, viewStartMs, timelineWidth]);

    useEffect(() => {
        if (!videoLengthMs || videoLengthMs <= 0) {
            return;
        }
        if (zoom <= 1) {
            setViewStartMs(0);
            return;
        }
        let margin = visibleWindowMs * 0.15;
        if (currentSliderPosition < viewStartMs + margin) {
            setViewStartMs(
                Math.max(0, currentSliderPosition - margin)
            );
        } else if (currentSliderPosition > viewEndMs - margin) {
            setViewStartMs(
                Math.max(
                    0,
                    Math.min(
                        videoLengthMs - visibleWindowMs,
                        currentSliderPosition - visibleWindowMs + margin
                    )
                )
            );
        }
    }, [currentSliderPosition, zoom, videoLengthMs]);

    if (!videoLengthMs || videoLengthMs <= 0) {
        return <div className="timeline" style={{ width: timelineWidth }} />;
    }

    let timeToPixel = (timeMs) =>
        ((timeMs - viewStartMs) / visibleWindowMs) * timelineWidth;

    let pixelToTimeDelta = (pixelDelta) =>
        (pixelDelta / timelineWidth) * visibleWindowMs;

    let handleWheel = (e) => {
        e.preventDefault();
        let rect = e.currentTarget.getBoundingClientRect();
        let mouseX = e.clientX - rect.left;
        let timeAtMouse = viewStartMs + (mouseX / timelineWidth) * visibleWindowMs;

        let factor = e.deltaY < 0 ? 1.3 : 1 / 1.3;
        let newZoom = Math.max(1, Math.min(100, zoom * factor));

        let newVisibleWindow = videoLengthMs / newZoom;
        let newViewStart = timeAtMouse - (mouseX / timelineWidth) * newVisibleWindow;
        newViewStart = Math.max(
            0,
            Math.min(videoLengthMs - newVisibleWindow, newViewStart)
        );

        setZoom(newZoom);
        setViewStartMs(newViewStart);
    };

    let zoomIn = () => {
        let centerTime = viewStartMs + visibleWindowMs / 2;
        let newZoom = Math.min(100, zoom * 2);
        if (newZoom === zoom) return;
        let newVisibleWindow = videoLengthMs / newZoom;
        let newViewStart = centerTime - newVisibleWindow / 2;
        newViewStart = Math.max(
            0,
            Math.min(videoLengthMs - newVisibleWindow, newViewStart)
        );
        setZoom(newZoom);
        setViewStartMs(newViewStart);
    };

    let zoomOut = () => {
        let centerTime = viewStartMs + visibleWindowMs / 2;
        let newZoom = Math.max(1, zoom / 2);
        if (newZoom === zoom) return;
        let newVisibleWindow = videoLengthMs / newZoom;
        let newViewStart = centerTime - newVisibleWindow / 2;
        newViewStart = Math.max(
            0,
            Math.min(videoLengthMs - newVisibleWindow, newViewStart)
        );
        setZoom(newZoom);
        setViewStartMs(newViewStart);
    };

    let resetZoom = () => {
        setZoom(1);
        setViewStartMs(0);
    };

    const timelineRows = [];
    for (let i = 0; i < rowCount; i++) {
        timelineRows.push([]);
    }
    subs.forEach((sub) => {
        if (sub.rowIndex >= rowCount) {
            return;
        }
        timelineRows[sub.rowIndex].push(sub);
    });

    const markers = [];
    if (videoLengthMs > 0) {
        const visibleStart = Math.max(0, viewStartMs);
        const visibleEnd = Math.min(videoLengthMs, viewEndMs);
        const firstMark = Math.ceil(visibleStart / 10000) * 10000;
        for (let t = firstMark; t <= visibleEnd; t += 10000) {
            markers.push({ timeMs: t, isMinute: t % 60000 === 0 });
        }
    }

    return (
        <div className="timeline" style={{width: timelineWidth}} ref={timelineContainerRef}>
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                }}
            >
                <div>
                    {convertMillisecondsToTimestamp(currentSliderPosition)}
                </div>
                <div className="timeline-zoom" style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                    <button title="Zoom Out" onClick={zoomOut}>-</button>
                    <span style={{ minWidth: '50px', display: 'inline-block', textAlign: 'center', fontFamily: 'monospace' }}>
                        {Math.round(zoom * 100)}%
                    </span>
                    <button title="Zoom In" onClick={zoomIn}>+</button>
                    {zoom > 1 && (
                        <button title="Reset Zoom" onClick={resetZoom} style={{ marginLeft: '4px' }}>1:1</button>
                    )}
                </div>
                <div>
                    <button
                        title="Left Arrow (back 1 second)"
                        onClick={() => {
                            onSliderPositionChange(
                                Math.max(
                                    0 + offset,
                                    currentSliderPosition + offset - 1000
                                )
                            );
                        }}
                    >
                        &lt;&lt;
                    </button>
                    <button
                        title="; (back 1 frame)"
                        onClick={() => {
                            onSliderPositionChange(
                                Math.max(
                                    0 + offset,
                                    currentSliderPosition + offset - 1000 / 60
                                )
                            );
                        }}
                    >
                        &lt;
                    </button>
                    {!isPlaying && currentPosition < videoLength ? (
                        <button
                            title="Space"
                            onClick={() => {
                                if (currentSliderPosition < videoLengthMs) {
                                    onStateChange(true);
                                }
                            }}
                        >
                            Play
                        </button>
                    ) : (
                        <button
                            title="Space"
                            onClick={() => {
                                onStateChange(false);
                            }}
                        >
                            Pause
                        </button>
                    )}
                    <button
                        title="' (forward 1 frame)"
                        onClick={() => {
                            if (currentSliderPosition < videoLengthMs) {
                                onSliderPositionChange(
                                    currentSliderPosition + offset + 1000 / 60
                                );
                            }
                        }}
                    >
                        &gt;
                    </button>
                    <button
                        title="Right Arrow (forward 1 sec)"
                        onClick={() => {
                            if (currentSliderPosition < videoLengthMs) {
                                onSliderPositionChange(
                                    currentSliderPosition + offset + 1000
                                );
                            }
                        }}
                    >
                        &gt;&gt;
                    </button>
                </div>
                <div></div>
            </div>
            <input
                type="range"
                style={{
                    position: 'relative',
                    left: '-8px',
                    width: `${timelineWidth + 16}px`,
                    padding: '0px',
                    margin: '0px',
                }}
                value={Math.max(viewStartMs, Math.min(viewEndMs, currentSliderPosition))}
                min={viewStartMs}
                step={1}
                max={viewEndMs}
                onChange={(e) => {
                    onSliderPositionChange(parseFloat(e.target.value) + offset);
                }}
            />
            <div
                style={{
                    width: `${timelineWidth}px`,
                    position: 'relative',
                }}
            >
                <div
                    style={{
                        position: 'absolute',
                        left: `${timeToPixel(currentSliderPosition)}px`,
                        width: '2px',
                        height: '100%',
                        backgroundColor: 'black',
                        zIndex: 10001,
                    }}
                />
                {timelineRows.map((timelineRow, rowIndex) => {
                    return (
                        <div
                            key={rowIndex}
                            style={{
                                cursor: 'pointer',
                                position: 'relative',
                                overflow: 'hidden',
                                borderTop:
                                    rowIndex === 0 ? '1px solid black' : 'none',
                                borderBottom: '1px solid black',
                                height: '27px',
                                width: timelineWidth,
                                backgroundColor:
                                    rowIndex === currentRow
                                        ? 'darkgray'
                                        : 'white',
                            }}
                            onClick={() => {
                                onRowChange(rowIndex);
                            }}
                            onDragOver={(event) => {
                                if (isResizing || dragSub === null) {
                                    return;
                                }
                                let sub = subs[dragSub];

                                let subLength = sub.endTime - sub.startTime;
                                let dragDelta = event.clientX - dragStart;
                                let timeDelta =
                                    pixelToTimeDelta(dragDelta);
                                let startTime = dragStartTime + timeDelta;
                                let endTime = startTime + subLength;

                                if (startTime < 0) {
                                    startTime = 0;
                                    endTime = startTime + subLength;
                                } else if (endTime > videoLengthMs) {
                                    startTime = videoLengthMs - subLength;
                                    endTime = videoLengthMs;
                                }

                                onSubsChange('edit', {
                                    ...subs[dragSub],
                                    rowIndex,
                                    startTime,
                                    endTime,
                                });
                                onRowChange(rowIndex);
                                onSliderPositionChange(startTime + offset);
                            }}
                        >
                            {timelineRow.map((sub) => {
                                return (
                                    <React.Fragment key={sub.index}>
                                        <div
                                            className={`resize-left ${sub.locked ? 'locked-resize-left' : ''} ${blinkingSubIndex === sub.index ? 'blink-red' : ''}`}
                                            onDragStart={(event) => {
                                                if (sub.locked) {
                                                    event.preventDefault();
                                                    triggerBlink(sub.index);
                                                    return;
                                                }
                                                isResizing = true;

                                                const img = new Image();
                                                img.src =
                                                    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFhAJ/wlseKgAAAABJRU5ErkJggg==';
                                                event.dataTransfer.setDragImage(
                                                    img,
                                                    10,
                                                    10
                                                );

                                                dragStart = event.clientX;
                                                dragStartTime = sub.startTime;
                                            }}
                                            onDrag={(event) => {
                                                let dragDelta =
                                                    event.clientX - dragStart;
                                                let timeDelta =
                                                    pixelToTimeDelta(dragDelta);
                                                let startTime = Math.max(
                                                    0,
                                                    dragStartTime + timeDelta
                                                );

                                                onRowChange(rowIndex);
                                                onSubsChange('edit', {
                                                    ...sub,
                                                    startTime,
                                                });
                                                onSliderPositionChange(
                                                    startTime + offset
                                                );
                                                onSubSelect(sub.index);
                                            }}
                                            onDragEnd={(_event) => {
                                                isResizing = false;
                                                onSubsChange('sort');
                                            }}
                                            draggable
                                            style={{
                                                left: `${timeToPixel(
                                                    sub.startTime
                                                )}px`,
                                            }}
                                        ></div>
                                        <div
                                            className={`${sub.index === currentSub ? 'subtitle selected' : 'subtitle'} ${sub.locked ? 'locked-clip' : ''} ${blinkingSubIndex === sub.index ? 'blink-red' : ''}`}
                                            onClick={() => {
                                                onSubSelect(sub.index);
                                            }}
                                            onDragStart={(event) => {
                                                if (sub.locked) {
                                                    event.preventDefault();
                                                    triggerBlink(sub.index);
                                                    return;
                                                }
                                                dragSub = sub.index;

                                                const img = new Image();
                                                img.src =
                                                    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFhAJ/wlseKgAAAABJRU5ErkJggg==';
                                                event.dataTransfer.setDragImage(
                                                    img,
                                                    10,
                                                    10
                                                );

                                                dragStart = event.clientX;
                                                dragStartTime = sub.startTime;
                                                dragEndTime = sub.endTime;
                                            }}
                                            onDrag={(event) => {
                                                let subLength =
                                                    sub.endTime - sub.startTime;
                                                let dragDelta =
                                                    event.clientX - dragStart;
                                                let timeDelta =
                                                    pixelToTimeDelta(dragDelta);
                                                let startTime =
                                                    dragStartTime + timeDelta;
                                                let endTime =
                                                    startTime + subLength;

                                                if (startTime < 0) {
                                                    startTime = 0;
                                                    endTime =
                                                        startTime + subLength;
                                                } else if (
                                                    endTime > videoLengthMs
                                                ) {
                                                    startTime =
                                                        videoLengthMs -
                                                        subLength;
                                                    endTime = videoLengthMs;
                                                }

                                                onRowChange(rowIndex);
                                                onSubsChange('edit', {
                                                    ...sub,
                                                    startTime,
                                                    endTime,
                                                });
                                                onSliderPositionChange(
                                                    startTime + offset
                                                );
                                                onSubSelect(sub.index);
                                            }}
                                            onDragEnd={(_event) => {
                                                dragResizeRight = null;
                                                onSubsChange('sort');
                                            }}
                                            draggable
                                            style={{
                                                left: `${timeToPixel(
                                                    sub.startTime
                                                )}px`,
                                                width: `${
                                                    timeToPixel(sub.endTime) -
                                                    timeToPixel(sub.startTime)
                                                }px`,
                                                textAlign: 'center',
                                                lineHeight: '25px',
                                            }}
                                        >
                                            {sub.locked ? '\uD83D\uDD12 ' : ''}{sub.index}
                                        </div>
                                        <div
                                            className={`resize-right ${sub.locked ? 'locked-resize-right' : ''} ${blinkingSubIndex === sub.index ? 'blink-red' : ''}`}
                                            onDragStart={(event) => {
                                                if (sub.locked) {
                                                    event.preventDefault();
                                                    triggerBlink(sub.index);
                                                    return;
                                                }
                                                isResizing = true;

                                                const img = new Image();
                                                img.src =
                                                    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFhAJ/wlseKgAAAABJRU5ErkJggg==';
                                                event.dataTransfer.setDragImage(
                                                    img,
                                                    10,
                                                    10
                                                );

                                                dragStart = event.clientX;
                                                dragEndTime = sub.endTime;
                                            }}
                                            onDrag={(event) => {
                                                let dragDelta =
                                                    event.clientX - dragStart;
                                                let timeDelta =
                                                    pixelToTimeDelta(dragDelta);
                                                let endTime = Math.min(
                                                    dragEndTime + timeDelta,
                                                    videoLengthMs
                                                );

                                                onRowChange(rowIndex);
                                                onSubsChange('edit', {
                                                    ...sub,
                                                    endTime,
                                                });
                                                onSliderPositionChange(
                                                    endTime + offset
                                                );
                                                onSubSelect(sub.index);
                                            }}
                                            onDragEnd={(_event) => {
                                                isResizing = false;
                                                onSubsChange('sort');
                                            }}
                                            draggable
                                            style={{
                                                left: `${
                                                    timeToPixel(sub.endTime) -
                                                    10
                                                }px`,
                                            }}
                                        ></div>
                                    </React.Fragment>
                                );
                            })}
                        </div>
                    );
                })}
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        pointerEvents: 'none',
                        zIndex: 5000,
                    }}
                >
                    {markers.map((m) => (
                        <div
                            key={m.timeMs}
                            style={{
                                position: 'absolute',
                                left: `${timeToPixel(m.timeMs)}px`,
                                top: 0,
                                width: '1px',
                                height: '100%',
                                backgroundColor: m.isMinute ? '#ff6b6b' : '#555',
                                opacity: m.isMinute ? 0.9 : 0.6,
                            }}
                        />
                    ))}
                </div>
            </div>
            <div
                style={{
                    width: `${timelineWidth}px`,
                    height: '14px',
                    position: 'relative',
                    backgroundColor: '#333',
                    borderRadius: '2px',
                    cursor: 'pointer',
                    marginTop: '4px',
                }}
                onMouseDown={(e) => {
                    if (e.target === e.currentTarget) {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = e.clientX - rect.left;
                        const targetMs = (x / timelineWidth) * videoLengthMs;
                        setViewStartMs(Math.max(0, Math.min(
                            videoLengthMs - visibleWindowMs,
                            targetMs - visibleWindowMs / 2
                        )));
                    }
                }}
            >
                <div
                    style={{
                        position: 'absolute',
                        left: `${videoLengthMs > 0 ? (viewStartMs / videoLengthMs) * timelineWidth : 0}px`,
                        width: `${videoLengthMs > 0 ? Math.max(10, (visibleWindowMs / videoLengthMs) * timelineWidth) : timelineWidth}px`,
                        height: '100%',
                        backgroundColor: '#777',
                        borderRadius: '2px',
                        cursor: 'grab',
                        minWidth: '10px',
                    }}
                    onMouseDown={(e) => {
                        e.stopPropagation();
                        const startX = e.clientX;
                        const startVSM = viewStartMs;
                        const trackW = timelineWidth;
                        const vidLen = videoLengthMs;
                        const visWin = visibleWindowMs;

                        const onMouseMove = (ev) => {
                            const dx = ev.clientX - startX;
                            const ratio = dx / trackW;
                            const deltaMs = ratio * vidLen;
                            setViewStartMs(Math.max(0, Math.min(
                                vidLen - visWin,
                                startVSM + deltaMs
                            )));
                        };

                        const onMouseUp = () => {
                            document.removeEventListener('mousemove', onMouseMove);
                            document.removeEventListener('mouseup', onMouseUp);
                        };

                        document.addEventListener('mousemove', onMouseMove);
                        document.addEventListener('mouseup', onMouseUp);
                    }}
                />
            </div>
        </div>
    );
};
