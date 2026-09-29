import React, { useCallback, useEffect, useRef, useState } from 'react';
import { clampCensorBar, DEFAULT_BLUR_AMOUNT, toOverlayBox } from '../util/VideoTools';

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

// Normalised handle anchors, as fractions of the box they sit on. Deriving these
// from the handle name with ternaries put 'e', 'sw' and 'se' in the middle of the
// box instead of on its border.
const HANDLE_ANCHORS = {
    nw: [0, 0],
    n: [0.5, 0],
    ne: [1, 0],
    e: [1, 0.5],
    se: [1, 1],
    s: [0.5, 1],
    sw: [0, 1],
    w: [0, 0.5],
};

// The shape is the containing block and is already placed at the bar's own
// position, so the anchors are plain fractions of it. Adding the bar's x/w here
// too would offset every grip twice and pull them in towards the centre.
const handleStyle = (name) => {
    const [horizontal, vertical] = HANDLE_ANCHORS[name];

    return {
        left: `${horizontal * 100}%`,
        top: `${vertical * 100}%`,
        transform: 'translate(-50%, -50%)',
    };
};

const applyResize = (bar, handle, dx, dy) => {
    let { x, y, w, h } = bar;

    if (handle.includes('w')) {
        x += dx;
        w -= dx;
    }
    if (handle.includes('e')) {
        w += dx;
    }
    if (handle.includes('n')) {
        y += dy;
        h -= dy;
    }
    if (handle.includes('s')) {
        h += dy;
    }

    return clampCensorBar({ ...bar, x, y, w, h });
};

// CSS stretches the <video> element to fill the window (width and height both
// 100%), so the drawn picture is letterboxed *inside* the element box. Bars are
// stored as fractions of the frame, so they have to be mapped onto the picture
// rectangle, not the element rectangle -- otherwise they land off by the
// letterbox margin and drift every time the window is resized.
//
// Returns null when the picture cannot be determined yet (no intrinsic size
// reported, or a zero-sized element). Callers must treat that as "keep the last
// known geometry": falling back to the element box here is what put the bars
// above their real position, because the element box starts higher up.
const getPictureRect = (video, rect) => {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh || !rect.width || !rect.height) {
        return null;
    }

    const fit = window.getComputedStyle(video).objectFit;
    let scale;
    if (fit === 'fill') {
        scale = 1;
    } else if (fit === 'cover') {
        scale = Math.max(rect.width / vw, rect.height / vh);
    } else {
        scale = Math.min(rect.width / vw, rect.height / vh);
    }

    const width = vw * scale;
    const height = vh * scale;

    return {
        left: rect.left + (rect.width - width) / 2,
        top: rect.top + (rect.height - height) / 2,
        width,
        height,
    };
};

export default ({
    bars,
    currentPosition,
    selectedIndex,
    interactive,
    videoRef,
    onChange,
    onSelect,
    barVisibility,
    videoLengthMs,
}) => {
    const containerRef = useRef(null);
    const dragRef = useRef(null);
    // Drag deltas are normalised against the live video rect, so it lives in a ref
    // and never in state; a state value captured when the drag started is what made
    // the box jump when the player was resized or toggled fullscreen.
    const videoSizeRef = useRef({ width: 0, height: 0 });
    const frameRef = useRef(null);
    const [videoBox, setVideoBox] = useState({
        left: 0,
        top: 0,
        width: 0,
        height: 0,
    });

    // Last committed geometry, so an unchanged measurement can be discarded.
    const lastBoxRef = useRef(null);
    const commitMeasure = useCallback(() => {
        const overlay = containerRef.current;
        const video = videoRef?.current;
        if (!overlay || !video) {
            return;
        }

        // The base is the containing block, never the overlay: the overlay is the
        // element these offsets position, so using it as the origin would make each
        // measurement subtract the previous one's result and land one letterbox
        // margin too high. offsetParent is the box left/top actually resolve against.
        const host = overlay.offsetParent || overlay.parentElement;
        if (!host) {
            return;
        }

        const base = host.getBoundingClientRect();
        const element = video.getBoundingClientRect();
        const rect = getPictureRect(video, element);

        // A zero-sized element box, or intrinsic dimensions the media element has
        // not reported yet, describes a transient reflow rather than the real
        // picture. Keep the last known geometry rather than committing that.
        if (!rect) {
            return;
        }

        // left/top resolve against the containing block's padding box, while
        // getBoundingClientRect reports the border box.
        const hostStyle = window.getComputedStyle(host);
        const next = toOverlayBox(rect, base, {
            left:
                parseFloat(hostStyle.borderLeftWidth) +
                parseFloat(hostStyle.paddingLeft),
            top:
                parseFloat(hostStyle.borderTopWidth) +
                parseFloat(hostStyle.paddingTop),
        });

        // setVideoBox always gets a fresh object, so an unchanged measurement would
        // still force a re-render and repaint. Deduplicating here keeps the overlay
        // quiet while something else re-renders the player many times a second.
        const last = lastBoxRef.current;
        if (
            last &&
            last.left === next.left &&
            last.top === next.top &&
            last.width === next.width &&
            last.height === next.height
        ) {
            return;
        }
        lastBoxRef.current = next;

        // Kept in step with the overlay on purpose: dividing a pixel delta by the
        // stretched element width instead of the picture width is what made the box
        // travel further than the cursor under wide/narrow window shapes.
        videoSizeRef.current = { width: rect.width, height: rect.height };
        setVideoBox(next);
    }, [videoRef]);

    // Coalesce to one measurement per frame, and do the reads inside the frame
    // rather than inside the observer callback: reading geometry synchronously from
    // a ResizeObserver can catch the box mid-reflow.
    const measure = useCallback(() => {
        if (frameRef.current !== null) {
            return;
        }
        frameRef.current = requestAnimationFrame(() => {
            frameRef.current = null;
            commitMeasure();
        });
    }, [commitMeasure]);

    useEffect(
        () => () => {
            if (frameRef.current !== null) {
                cancelAnimationFrame(frameRef.current);
                frameRef.current = null;
            }
        },
        []
    );

    useEffect(() => {
        const overlay = containerRef.current;
        const video = videoRef?.current;
        if (!overlay) {
            return undefined;
        }

        measure();

        // The video is the sized element, so observing it (rather than the overlay,
        // whose size we set ourselves) keeps this free of resize feedback loops.
        let observer;
        if (video && typeof ResizeObserver !== 'undefined') {
            observer = new ResizeObserver(measure);
            observer.observe(video);
        }
        window.addEventListener('resize', measure);

        // videoWidth/videoHeight are 0 until metadata lands, and the element box does
        // not change when they do, so the observer above stays quiet. Without this
        // the overlay would keep the pre-metadata guess and the letterbox offset
        // would never be corrected.
        if (video) {
            video.addEventListener('loadedmetadata', measure);
            video.addEventListener('resize', measure);
        }

        return () => {
            if (observer) {
                observer.disconnect();
            }
            window.removeEventListener('resize', measure);
            if (video) {
                video.removeEventListener('loadedmetadata', measure);
                video.removeEventListener('resize', measure);
            }
        };
    }, [measure, videoRef]);

    const handleMove = useCallback(
        (event) => {
            const drag = dragRef.current;
            const size = videoSizeRef.current;
            if (!drag || !size.width || !size.height) {
                return;
            }

            // Deltas are measured from where the button went down, so they must be
            // applied to that same starting geometry. Feeding the previous frame's
            // result back in as the base compounds the error 1 + 2 + 3 + ... and the
            // box races away from the cursor.
            const dx = (event.clientX - drag.startX) / size.width;
            const dy = (event.clientY - drag.startY) / size.height;

            const next =
                drag.handle === 'move'
                    ? clampCensorBar({
                          ...drag.origin,
                          x: drag.origin.x + dx,
                          y: drag.origin.y + dy,
                      })
                    : applyResize(drag.origin, drag.handle, dx, dy);

            onChange('edit', next);
        },
        [onChange]
    );

    const endDrag = useCallback(() => {
        dragRef.current = null;
        document.body.style.userSelect = '';
    }, []);

    useEffect(() => {
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', endDrag);
        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', endDrag);
        };
    }, [handleMove, endDrag]);

    const startDrag = (event, bar, handle) => {
        // Always select on click, regardless of tab
        onSelect(bar.index);

        // Only start drag if in censor tab AND this bar is selected
        if (!interactive || bar.index !== selectedIndex) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        document.body.style.userSelect = 'none';
        dragRef.current = {
            origin: bar,
            handle,
            startX: event.clientX,
            startY: event.clientY,
        };
    };

    const visibleBars = (bars || []).filter((bar) => {
        const active =
            currentPosition >= bar.startTime && currentPosition <= bar.endTime;
        const atEnd = videoLengthMs && currentPosition >= videoLengthMs - 100;
        const barEndsAtVideoEnd = videoLengthMs && bar.endTime >= videoLengthMs - 100;
        const activeAtEnd = atEnd && barEndsAtVideoEnd;
        const selected = bar.index === selectedIndex;
        return active || activeAtEnd || selected;
    });

    // Pin the overlay to the video's drawn picture so coordinates stay true under
    // letterboxing, and fall back to the CSS inset until the first measurement.
    // Both dimensions are required: guarding on width alone let a zero-height
    // measurement through, which drew every bar as a 0px line at the top.
    const hasBox = videoBox.width > 0 && videoBox.height > 0;
    const overlayStyle = hasBox
        ? {
              left: `${videoBox.left}px`,
              top: `${videoBox.top}px`,
              width: `${videoBox.width}px`,
              height: `${videoBox.height}px`,
              // The stylesheet insets this on all four sides. Setting only left/top
              // and a size would leave it over-constrained and rely on the browser
              // dropping right/bottom, so neutralise them outright.
              right: 'auto',
              bottom: 'auto',
          }
        : undefined;

    return (
        <div className="censor-bar-overlay" ref={containerRef} style={overlayStyle}>
            {visibleBars.map((bar) => {
                const isSelected = bar.index === selectedIndex;

                // Three states:
                // - Active (playhead in range) + preview ON: full fill
                // - Active at video end (paused at end) + preview ON: full fill
                // - Preview OFF: never fill, outline when selected
                // - Inactive + unselected: hidden (filtered out above)
                const isActiveNow =
                    currentPosition >= bar.startTime &&
                    currentPosition <= bar.endTime;
                const atEnd = videoLengthMs && currentPosition >= videoLengthMs - 100;
                const barEndsAtVideoEnd = videoLengthMs && bar.endTime >= videoLengthMs - 100;
                const isActiveAtEnd = atEnd && barEndsAtVideoEnd;
                const showPreview = barVisibility?.get(bar.index) !== false;
                const showFill = (isActiveNow || isActiveAtEnd) && showPreview;
                const showHandles = isSelected;

                // Blur radius is stored as a fraction of frame width so the
                // preview matches what the encoder bakes at full resolution. Before
                // the first valid measurement there is no frame width to scale
                // against, so those frames get no blur.
                const blurPx = hasBox
                    ? (bar.blurAmount ?? DEFAULT_BLUR_AMOUNT) * videoBox.width
                    : 0;

                const style = {
                    left: `${bar.x * 100}%`,
                    top: `${bar.y * 100}%`,
                    width: `${bar.w * 100}%`,
                    height: `${bar.h * 100}%`,
                };

                // Only apply fill when active; outline-only state has transparent background
                if (showFill) {
                    if (bar.type === 'black') {
                        style.background = 'black';
                    } else {
                        style.backdropFilter = `blur(${blurPx}px)`;
                        style.WebkitBackdropFilter = `blur(${blurPx}px)`;
                    }
                } else {
                    // Outline-only: transparent background, border from inline style
                    style.background = 'transparent';
                    style.border = '1px dashed rgba(255, 255, 255, 0.9)';
                    style.boxSizing = 'border-box';
                }

                // Interactive class enables pointer events for dragging; only on selected bars in censor tab
                const isInteractive = interactive && isSelected;

                return (
                    <div
                        key={bar.index}
                        className={`censor-bar-shape ${isInteractive ? 'interactive' : ''}`}
                        style={style}
                        onMouseDown={(event) =>
                            startDrag(event, bar, 'move')
                        }
                    >
                        {isSelected ? (
                            <>
                                <span
                                    style={{
                                        position: 'absolute',
                                        top: 2,
                                        left: 4,
                                        fontSize: 10,
                                        color: 'white',
                                        textShadow: '0 0 3px black',
                                        pointerEvents: 'none',
                                    }}
                                >
                                    {bar.type} [{bar.index}]
                                </span>
                                {showHandles ? (
                                    HANDLES.map((name) => (
                                        <div
                                            key={name}
                                            className={`censor-bar-handle ${name}`}
                                            style={handleStyle(name)}
                                            onMouseDown={(event) =>
                                                startDrag(event, bar, name)
                                            }
                                        />
                                    ))
                                ) : null}
                            </>
                        ) : null}
                    </div>
                );
            })}
        </div>
    );
};
