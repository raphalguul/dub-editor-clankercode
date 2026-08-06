import React, { useState, useEffect, useRef } from 'react';
import { createWebVttDataUri } from '../util/VideoTools';

let isTalking = false;
let hasEnded = false;

export default (props) => {
    const [muted, setMuted] = useState(false);
    const [loading, setLoading] = useState(false);
    const [videoError, setVideoError] = useState(null);
    const currentIndexRef = useRef(-1);
    const intervalRef = useRef(null);
    const shouldMuteRef = useRef(false);
    const retryCountRef = useRef(0);
    const lastGoodPosRef = useRef(0);
    const subsRef = useRef(props.subs);
    subsRef.current = props.subs;

    const videoElement = React.createRef();

    const maleVoice = window.speechSynthesis.getVoices().find((element) => {
        return (
            element.name === 'Microsoft David Desktop - English (United States)'
        );
    });

    const femaleVoice = window.speechSynthesis.getVoices().find((element) => {
        return (
            element.name === 'Microsoft Zira Desktop - English (United States)'
        );
    });

    useEffect(() => {
        if (videoElement.current) {
            videoElement.current.currentTime = props.videoPosition;
        }
        lastGoodPosRef.current = props.videoPosition;
        isTalking = false;
        setMuted(false);
        currentIndexRef.current = -1;
    }, [props.videoPosition, props.seekKey]);

    useEffect(() => {
        retryCountRef.current = 0;
        setVideoError(null);
    }, [props.videoSource]);

    const handleVideoError = (e) => {
        const ve = e.target;
        const err = ve?.error;
        const msg = err ? `code=${err.code} message=${err.message}` : 'unknown error';
        window.api.send('log', 'WTD: error ' + msg);
        setLoading(false);
        if (retryCountRef.current < 2) {
            retryCountRef.current++;
            setVideoError(null);
            const el = document.getElementById('videoElement');
            if (el) {
                try {
                    const target =
                        lastGoodPosRef.current > 0
                            ? lastGoodPosRef.current
                            : 0;
                    const retryLoad = () => {
                        try {
                            el.currentTime = Math.max(0, target - 0.1);
                        } catch {}
                        if (props.isPlaying) {
                            const promise = el.play();
                            if (promise !== undefined) promise.catch(() => {});
                        }
                    };
                    el.addEventListener('loadedmetadata', retryLoad, {
                        once: true,
                    });
                    el.load();
                } catch (recoveryErr) {
                    console.error('Video recovery failed:', recoveryErr);
                    setVideoError(msg);
                }
            }
        } else {
            setVideoError(msg);
        }
    };

    useEffect(() => {
        if (!videoElement.current) return;
        if (props.isPlaying) {
            const promise = videoElement.current.play();
            if (promise !== undefined) promise.catch(() => {});
        } else {
            videoElement.current.pause();
        }
    }, [props.isPlaying]);

    let setIsTalking = (b) => {
        isTalking = b;
    };

    let speak = (subtitle, text) => {
        let voice = null;

        setIsTalking(true);

        if (subtitle.voice === 'male') {
            voice = maleVoice;
        } else {
            voice = femaleVoice;
        }

        let msg = new SpeechSynthesisUtterance();
        msg.voice = voice;
        msg.text = text;
        msg.onend = () => {
            setIsTalking(false);
            let ve = document.getElementById('videoElement');
            if (ve) {
                const promise = ve.play();
                if (promise !== undefined) promise.catch(() => {});
            }

            if (hasEnded) {
                props.onEnd();
            }
        };
        window.speechSynthesis.speak(msg);
    };

    let updateSubtitle = (video) => {
        if (!video) {
            return;
        }

        const subs = subsRef.current;

        lastGoodPosRef.current = video.currentTime;
        props.onVideoPositionChange(video.currentTime);
        let index = subs.findIndex((subtitle) => {
            return (
                video.currentTime > (subtitle.startTime + props.offset) / 1000 &&
                video.currentTime < (subtitle.endTime + props.offset) / 1000
            );
        });

        const shouldMute = index >= 0 && subs[index].type === 'dynamic';
        if (shouldMute !== shouldMuteRef.current) {
            shouldMuteRef.current = shouldMute;
            setMuted(shouldMute);
        }

        if (index !== currentIndexRef.current) {
            if (isTalking) {
                video.pause();
                return;
            }

            if (index >= 0) {
                let subtitle = subs[index];
                if (subtitle.type === 'dynamic' && props.substitution) {
                    speak(subtitle, props.substitution);
                }
                props.onIndexChange(index);
            }

            currentIndexRef.current = index;
        }
    };

    useEffect(() => {
        if (props.isPlaying) {
            intervalRef.current = setInterval(() => {
                let video = document.getElementById('videoElement');
                updateSubtitle(video);
            }, 1000 / 60);
        }

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [props.isPlaying, props.subs]);

    if (props.width) {
        return (
            <div
                style={{
                    position: 'relative',
                    background: 'black',
                    color: 'white',
                }}
                className="video-window"
            >
                <div
                    style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                    }}
                >
                    {loading && !videoError ? 'Loading Video...' : null}
                    {videoError ? `Video Error: ${videoError}` : null}
                </div>
                    {props.videoSource ? (
                    <video
                        id="videoElement"
                        ref={videoElement}
                        src={props.videoSource}
                        style={{ width: props.width }}
                        muted={muted}
                        onEnded={() => {
                            if (!isTalking) {
                                props.onEnd();
                            } else {
                                hasEnded = true;
                            }
                        }}
                        onLoadStart={() => window.api.send('log', 'WTD: loadStart')}
                        onLoadedMetadata={() => window.api.send('log', 'WTD: loadedMetadata')}
                        onCanPlay={() => { window.api.send('log', 'WTD: canPlay'); setLoading(false); }}
                        onWaiting={() => window.api.send('log', 'WTD: waiting')}
                        onStalled={() => window.api.send('log', 'WTD: stalled')}
                        onError={handleVideoError}
                        controls={props.controls}
                        onCanPlayThrough={() => {
                            props.onVideoLoaded(videoElement.current);
                        }}
                    >
                        <track
                            key={props.trackKey}
                            label="English"
                            kind="subtitles"
                            srcLang="en"
                            src={createWebVttDataUri(
                                props.subs,
                                props.substitution,
                                props.offset
                            )}
                            default
                        ></track>
                    </video>
                ) : null}
            </div>
        );
    }

    return (
        <div
            style={{
                position: 'relative',
                background: 'black',
                color: 'white',
            }}
            className="video-window"
        >
            <div
                style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                }}
            >
                {loading && !videoError ? 'Loading Video...' : null}
                {videoError ? `Video Error: ${videoError}` : null}
            </div>
            {props.videoSource ? (
                <video
                    id="videoElement"
                    ref={videoElement}
                    src={props.videoSource}
                    muted={muted}
                    onEnded={() => {
                        if (!isTalking) {
                            props.onEnd();
                        } else {
                            hasEnded = true;
                        }
                    }}
                    onLoadStart={() => window.api.send('log', 'WTD: loadStart2')}
                    onLoadedMetadata={() => window.api.send('log', 'WTD: loadedMetadata2')}
                    onCanPlay={() => { window.api.send('log', 'WTD: canPlay2'); setLoading(false); }}
                    onWaiting={() => window.api.send('log', 'WTD: waiting2')}
                    onStalled={() => window.api.send('log', 'WTD: stalled2')}
                    onError={handleVideoError}
                    controls={props.controls}
                    onCanPlayThrough={() => {
                        props.onVideoLoaded(videoElement.current);
                    }}
                >
                    <track
                        key={props.trackKey}
                        label="English"
                        kind="subtitles"
                        srclang="en"
                        src={createWebVttDataUri(
                            props.subs,
                            props.substitution,
                            props.offset
                        )}
                        default
                    ></track>
                </video>
            ) : null}
        </div>
    );
};
