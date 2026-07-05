import React, { useState, useEffect, useRef } from 'react';
import { createWebVttDataUri } from '../util/VideoTools';

let isTalking = false;
let hasEnded = false;

export default (props) => {
    const [muted, setMuted] = useState(false);
    const [loading, setLoading] = useState(true);
    const currentIndexRef = useRef(-1);
    const intervalRef = useRef(null);
    const shouldMuteRef = useRef(false);
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
        videoElement.current.currentTime = props.videoPosition;
        isTalking = false;
        setMuted(false);
        currentIndexRef.current = -1;
    }, [props.videoPosition]);

    useEffect(() => {
        if (props.isPlaying) {
            videoElement.current.play();
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
            ve.play();

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
                    {loading ? 'Loading Video...' : null}
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
                        onCanPlay={() => {
                            setLoading(false);
                        }}
                        controls={props.controls}
                        onCanPlayThrough={() => {
                            props.onVideoLoaded(videoElement.current);
                        }}
                    >
                        <track
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
                {loading ? 'Loading Video...' : null}
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
                    onCanPlay={() => {
                        setLoading(false);
                    }}
                    controls={props.controls}
                    onCanPlayThrough={() => {
                        props.onVideoLoaded(videoElement.current);
                    }}
                >
                    <track
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
