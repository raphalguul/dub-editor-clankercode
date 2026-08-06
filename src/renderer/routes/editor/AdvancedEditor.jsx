import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { addVideo, convertSrtToSubtitles } from '../../util/VideoTools';

import { api } from '../../util/Api';

import WhatTheDubPlayer from '../../components/WhatTheDubPlayer';
import TimeLine from '../../components/TimeLine';
import SubtitleList from '../../components/SubtitleList';
import CollectionAPI from '../../api/CollectionAPI';
import BatchAPI from 'renderer/api/BatchAPI';
import { useAtom } from 'jotai';
import { interstitialAtom } from 'renderer/atoms/interstitial.atom';
import { handleInterstitial } from 'renderer/components/interstitial/Interstitial';
import VideoAPI, { canPlayDirect } from 'renderer/api/VideoAPI';
import { gameAtom } from 'renderer/atoms/game.atom';
import ConfigAPI from 'renderer/api/ConfigAPI';

let AdvancedEditor = () => {
    const [searchParams] = useSearchParams();
    const { id } = useParams();
    const [, setInterstitialState] = useAtom(interstitialAtom);

    const [type] = useAtom(gameAtom);
    const params = { ...useParams, type };
    const navigate = useNavigate();

    const [windowSize, setWindowSize] = useState({
        width: window.innerWidth,
        height: window.innerHeight,
    });

    const [titleOverride, setTitleOverride] = useState(null);
    const [clipNumberOverride, setClipNumberOverride] = useState(null);
    const [isEdit] = useState(id !== undefined);

    const [batchClip, setBatchClip] = useState(null);
    const [offset, setOffset] = useState(0);
    const [, setEndTime] = useState(0);

    const [error, setError] = useState(null);
    const [videoSource, setVideoSource] = useState('');
    const [subs, setSubs] = useState([]);
    const [currentSub, setCurrentSub] = useState(null);
    const [selectedAudioTrack, setSelectedAudioTrack] = useState(0);
    const [playbackSource, setPlaybackSource] = useState('');
    const playbackSourceRef = useRef('');
    const [substitution] = useState('');
    const [, setButtonsDisabled] = useState(false);
    const [playerKey, setPlayerKey] = useState(0);
    const [trackKey, setTrackKey] = useState(0);

    const [isPlaying, setIsPlaying] = useState(false);
    const [currentPosition, setCurrentPosition] = useState(0);
    const [currentSliderPosition, setCurrentSliderPosition] = useState(0);
    const [currentRow, setCurrentRow] = useState(0);

    const [videoLength, setVideoLength] = useState(0);

    let videoLengthMs = videoLength * 1000;
    let defaultClipSize = 8000; // 8 seconds

    let isBatch = searchParams.get('batch') === 'true';

    window.onresize = () => {
        setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };

    const isActiveElementInput = () => {
        let activeElement = document.activeElement;
        if (!activeElement) return false;

        let tag = activeElement.tagName.toLowerCase();

        if (tag === 'textarea') return true;
        if (tag === 'input') {
            if (activeElement.type === 'range') return false;
            if (activeElement.type === 'checkbox') return false;
            return true;
        }
        return false;
    };

    const stateRef = useRef();
    stateRef.current = {
        currentSub,
        currentRow,
        currentSliderPosition,
        subs,
        isPlaying,
        defaultClipSize,
        videoLength,
        offset,
    };
    const keyboardHandler = useCallback((event) => {
        if (isActiveElementInput()) {
            if (event.key === 'Enter') {
                document.activeElement.blur();
                event.stopPropagation();
            }

            return;
        }

        switch (event.key) {
            case 'ArrowUp': {
                if (!stateRef.current.currentSub === null) {
                    return;
                }
                setCurrentSub((currentSub) =>
                    Math.min(stateRef.current.subs.length - 1, currentSub + 1)
                );
                break;
            }
            case 'ArrowDown': {
                if (stateRef.current.currentSub === null) {
                    return;
                }
                setCurrentSub((currentSub) => Math.max(0, currentSub - 1));
                break;
            }
            case 'ArrowLeft': {
                scrub(
                    Math.max(
                        0 + stateRef.current.offset,
                        stateRef.current.currentSliderPosition - 1000
                    )
                );

                break;
            }
            case 'ArrowRight': {
                scrub(
                    Math.min(
                        stateRef.current.currentSliderPosition + 1000,
                        stateRef.current.videoLength * 1000 +
                            stateRef.current.offset
                    )
                );

                break;
            }
            case ';': {
                scrub(
                    Math.max(
                        0 + stateRef.current.offset,
                        stateRef.current.currentSliderPosition - 1000 / 60
                    )
                );

                break;
            }
            case "'": {
                scrub(
                    Math.min(
                        stateRef.current.currentSliderPosition + 1000 / 60,
                        stateRef.current.videoLength * 1000 +
                            stateRef.current.offset
                    )
                );

                break;
            }
            case 'i': {
                let currentSubObject =
                    stateRef.current.subs[stateRef.current.currentSub];
                subChangeHandler(
                    'edit',
                    {
                        ...currentSubObject,
                        startTime:
                            stateRef.current.currentSliderPosition -
                            stateRef.current.offset,
                    },
                    stateRef.current.currentSub
                );
                break;
            }
            case 'o': {
                let currentSubObject =
                    stateRef.current.subs[stateRef.current.currentSub];
                subChangeHandler(
                    'edit',
                    {
                        ...currentSubObject,
                        endTime:
                            stateRef.current.currentSliderPosition -
                            stateRef.current.offset,
                    },
                    stateRef.current.currentSub
                );
                break;
            }
            case '[': {
                let currentSubObject =
                    stateRef.current.subs[stateRef.current.currentSub];
                scrub(currentSubObject.startTime + stateRef.current.offset);
                break;
            }
            case ']': {
                let currentSubObject =
                    stateRef.current.subs[stateRef.current.currentSub];
                scrub(currentSubObject.endTime + stateRef.current.offset);
                break;
            }
            case 'w': {
                setCurrentRow((currentRow) => Math.max(0, currentRow - 1));
                break;
            }
            case 's': {
                setCurrentRow((currentRow) => Math.min(4, currentRow + 1));
                break;
            }
            case 'n':
                subChangeHandler('add', {
                    rowIndex: stateRef.current.currentRow,
                    startTime:
                        parseInt(stateRef.current.currentSliderPosition) -
                        stateRef.current.offset,
                    endTime:
                        Math.min(parseInt(stateRef.current.currentSliderPosition) -
                        stateRef.current.offset +
                        stateRef.current.defaultClipSize, stateRef.current.videoLength * 1000),
                    text: '',
                    type: 'subtitle',
                    voice: 'male',
                    speaker: '',
                });
                break;
            case 't':
                document.getElementById('subtitle-type').focus();
                break;
            case 'g':
                document.getElementById('subtitle-voice').focus();
                break;
            case 'e':
                document.getElementById('subtitle-text').focus();
                break;
            case ' ':
                setIsPlaying((isPlaying) => !isPlaying);
                break;
        }
        event.stopPropagation();
        event.preventDefault();
    });

    const getCurrentIndex = () => {
        let index = subs.findIndex((subtitle) => {
            return (
                currentSliderPosition >= subtitle.startTime + offset &&
                currentSliderPosition < subtitle.endTime + offset
            );
        });

        return index;
    };

    useEffect(() => {
        if (id) {
            getVideo(id);
        } else if (isBatch) {
            getNextBatch();
        }

        document.addEventListener('keydown', keyboardHandler);

        return () => {
            document.removeEventListener('keydown', keyboardHandler);
        };
    }, []);

    useEffect(() => {
        let index = getCurrentIndex();
        if (index >= 0) {
            setCurrentSub(index);
        }
    }, [currentSliderPosition]);

    useEffect(() => {
        return () => {
            if (playbackSourceRef.current) {
                VideoAPI.cleanupTempFile(playbackSourceRef.current).catch(() => {});
            }
        };
    }, []);

    const getVideo = async (id) => {
        let videoDetails = await window.api.send('getVideo', {
            id,
            game: params.type,
        });
        let subtitles = convertSrtToSubtitles(videoDetails.srtBase64);
        subtitles = subtitles.map((subtitle, index) => {
            let voice;
            if (subtitle.text === '[male_dub]') {
                voice = 'male';
            } else if (subtitle.text === '[female_dub]') {
                voice = 'female';
            }
            return {
                ...subtitle,
                index,
                rowIndex: 0,
                type:
                    subtitle.text.startsWith('[') && subtitle.text.endsWith(']')
                        ? 'dynamic'
                        : 'subtitle',
                voice,
            };
        });

        let clipTextIndex = id.lastIndexOf('-Clip');
        let clipNumber = id.slice(clipTextIndex + 5);
        let title = id.slice(0, clipTextIndex);

        setTitleOverride(title.slice(1).replaceAll('_', ' '));
        setClipNumberOverride(parseInt(clipNumber));
        setVideoSource(videoDetails.videoUrl);
        setPlaybackSource(videoDetails.videoUrl);
        playbackSourceRef.current = videoDetails.videoUrl;

        let mediaInfo = await VideoAPI.getAudioTracks(videoDetails.videoUrl);
        let firstAudioIndex = mediaInfo.tracks[0]?.index ?? 0;
        setSelectedAudioTrack(firstAudioIndex);

        subtitles = distributeSubs(subtitles);
        setSubs(subtitles);

        if (subtitles.length > 0) {
            setCurrentSub(0);
        }
    };

    const overlaps = (clip1Start, clip1End, clip2Start, clip2End) => {
        return (
            (clip1Start <= clip2End && clip1End >= clip2Start) ||
            (clip2Start <= clip1End && clip2End >= clip1Start)
        );
    };

    const distributeSubs = (subtitles) => {
        let placedSubtitles = [];
        for (let subtitle of subtitles) {
            let restrictedRows = [];
            subtitle.rowIndex = 0;
            for (let placedSubtitle of placedSubtitles) {
                if (
                    overlaps(
                        subtitle.startTime,
                        subtitle.endTime,
                        placedSubtitle.startTime,
                        placedSubtitle.endTime
                    )
                ) {
                    if (!restrictedRows.includes(placedSubtitle.rowIndex)) {
                        restrictedRows.push(placedSubtitle.rowIndex);
                    }
                }
            }
            for (let row = 0; row < 5; row++) {
                if (!restrictedRows.includes(row)) {
                    subtitle.rowIndex = row;
                    break;
                }
            }
            placedSubtitles.push(subtitle);
        }

        return placedSubtitles;
    };

    const fixSubs = (videoLength) => {
        let subtitles = [...subs];

        subtitles.forEach((subtitle) => {
            // Adjust clip if it goes over the edge of the video
            subtitle.startTime = Math.max(0, subtitle.startTime);
            subtitle.endTime = Math.min(videoLength, subtitle.endTime);
        });

        setSubs(subtitles);
    };

    const getNextBatch = async () => {
        let batchClip = await handleInterstitial(
            BatchAPI.nextBatchClip(),
            (isOpen) => {
                setInterstitialState({
                    isOpen,
                    message: 'Getting next clip...',
                });
            }
        );
        let { clip, video, title, clipNumber, audioTrackIndex, forceReencode } = batchClip;

        const config = await ConfigAPI.getConfig();
        if (config.autoIncrementClipNumber !== false) {
            let availableNumber = await api.send('findAvailableClipNumber', {
                title,
                startNumber: clipNumber,
                game: params.type,
            });
            if (availableNumber !== null) {
                setClipNumberOverride(availableNumber);
            }
        }

        let mediaInfo = await VideoAPI.getAudioTracks(video);
        let firstAudioIndex = mediaInfo.tracks[0]?.index ?? 0;
        let track = audioTrackIndex !== undefined ? audioTrackIndex : firstAudioIndex;

        let playSource;
        if (!forceReencode && canPlayDirect(video, mediaInfo, track)) {
            playSource = video;
        } else {
            setInterstitialState({ isOpen: true, message: 'Preparing video for playback...' });
            VideoAPI.onRemuxProgress((pct) => {
                setInterstitialState({ isOpen: true, message: `Preparing video for playback... ${pct}%` });
            });
            try {
                playSource = await VideoAPI.remuxForPlayback(video, track, forceReencode);
            } catch (err) {
                console.error('Remux failed, using original:', err);
                playSource = video;
                toast.error('Remux failed, playing original video');
            }
            VideoAPI.removeRemuxProgressListener();
            setInterstitialState({ isOpen: false, message: '' });
        }

        setVideoSource(video);
        setPlaybackSource(playSource);
        playbackSourceRef.current = playSource;
        setSelectedAudioTrack(track);
        setVideoLength((clip.endTime - clip.startTime) / 1000);
        setBatchClip(batchClip);
        setEndTime(clip.endTime);
        setOffset(clip.startTime);
        setCurrentSliderPosition(clip.startTime);
        setCurrentPosition(clip.startTime / 1000);
    };

    let onFileOpen = async () => {
        let filePath = await VideoAPI.getVideoFile();
        if (!filePath) {
            return;
        }

        let source = `localfile:///${encodeURI(filePath.replace(/\\/g, '/'))}`;
        let fileName = filePath.replace(/^.*[\\\/]/, '').replace(/\.[^.]*$/, '');
        let sanitized = fileName.replace(/[^a-zA-Z0-9]/g, '').substring(0, 20);
        setTitleOverride(sanitized);

        const config = await ConfigAPI.getConfig();
        if (config.autoIncrementClipNumber !== false) {
            let availableNumber = await api.send('findAvailableClipNumber', {
                title: sanitized,
                startNumber: 1,
                game: params.type,
            });
            if (availableNumber !== null) {
                setClipNumberOverride(availableNumber);
            }
        }

        let mediaInfo = await VideoAPI.getAudioTracks(source);
        let firstAudioIndex = mediaInfo.tracks[0]?.index ?? 0;
        let selectedTrack = firstAudioIndex;

        if (mediaInfo.tracks.length > 1) {
            let pick = await VideoAPI.showAudioTrackPrompt(mediaInfo.tracks);
            if (pick !== -1) selectedTrack = pick;
        }

        let playSource;
        if (canPlayDirect(source, mediaInfo, selectedTrack)) {
            playSource = source;
        } else {
            setInterstitialState({ isOpen: true, message: 'Preparing video for playback...' });
            VideoAPI.onRemuxProgress((pct) => {
                setInterstitialState({ isOpen: true, message: `Preparing video for playback... ${pct}%` });
            });
            try {
                playSource = await VideoAPI.remuxForPlayback(source, selectedTrack);
            } catch (err) {
                console.error('Remux failed, using original:', err);
                playSource = source;
            }
            VideoAPI.removeRemuxProgressListener();
            setInterstitialState({ isOpen: false, message: '' });
        }

        setVideoSource(source);
        setPlaybackSource(playSource);
        playbackSourceRef.current = playSource;
        setSelectedAudioTrack(selectedTrack);
    };

    let scrub = (milliseconds) => {
        if (milliseconds < Math.max(0, stateRef.current.offset)) {
            milliseconds = Math.max(0, stateRef.current.offset);
        } else {
            let videoEnd = stateRef.current.offset + stateRef.current.videoLength * 1000;
            if (milliseconds >= videoEnd - 100) {
                milliseconds = videoEnd + 15;
            }
        }

        console.log('SCRUB TO ' + milliseconds);

        setCurrentPosition(milliseconds / 1000);
        setCurrentSliderPosition(milliseconds);
        setIsPlaying(false);
    };

    let addVideoToGame = async (videoName, clipNumber, collectionId) => {
        const config = await ConfigAPI.getConfig();
        if (
            config.checkSpeakersOnFinalize !== false &&
            !subs.some((s) => s.speaker)
        ) {
            const confirmed = await window.api.send(
                'showConfirmDialog',
                { message: 'No speakers are defined. Finalize anyway?' }
            );
            if (!confirmed) {
                return;
            }
        }

        if (!isEdit && (await checkClipExists(videoName, clipNumber))) {
            const config = await ConfigAPI.getConfig();
            if (config.autoIncrementClipNumber !== false) {
                let availableNumber = await api.send('findAvailableClipNumber', {
                    title: videoName,
                    startNumber: clipNumber,
                    game: params.type,
                });
                if (availableNumber !== null) {
                    clipNumber = availableNumber;
                    toast(`Clip number auto-incremented to ${clipNumber}`, {
                        type: 'info',
                    });
                } else {
                    setError(
                        'Clip with this name already exists (all numbers up to 10000 are taken)'
                    );
                    return;
                }
            } else {
                setError('Clip with this name and number already exists');
                return;
            }
        }

        setError(null);

        try {
            setButtonsDisabled(true);
            const adjustedSubs = [...subs];
            if (adjustedSubs.length > 0) {
                const lastSub = adjustedSubs[adjustedSubs.length - 1];
                const clipDurationMs = videoLength * 1000;
                if (lastSub.type === 'dynamic' && (clipDurationMs - lastSub.endTime) <= 80) {
                    adjustedSubs[adjustedSubs.length - 1] = { ...lastSub, endTime: clipDurationMs + 50 };
                }
            }
            let videoId = await addVideo(
                videoSource,
                adjustedSubs,
                videoName,
                clipNumber,
                params.type,
                isBatch,
                selectedAudioTrack
            );
            if (!collectionId.startsWith('_')) {
                await CollectionAPI.addToCollection(
                    collectionId,
                    params.type,
                    videoId
                );
            }
            setButtonsDisabled(false);

            toast(`Clip added successfully!`, { type: 'info' });
            if (!isBatch) {
                navigate('/');
            } else {
                let hasBatch = await BatchAPI.hasBatch();
                if (hasBatch > 0) {
                    navigate(`/create?batch=true`);
                } else {
                    navigate('/');
                }
            }
        } catch (error) {
            console.error(error);
            toast(`Clip add failed!`, { type: 'error' });
        }
    };

    let transcribeAudio = async () => {
        const cfg = await ConfigAPI.getConfig();

        const whisperConfig = {
            modelSize: cfg.whisperModelSize || 'base',
            useCuda: cfg.whisperUseCuda !== false,
            cudaFallbackCpu: cfg.whisperCudaFallbackCpu !== false,
            suppressSilence: cfg.whisperSuppressSilence !== false,
        };

        window.api.onProgress((msg, pct) => {
            let displayMsg = msg || 'Transcribing with Whisper...';
            if (pct >= 0) displayMsg += ` (${pct}%)`;
            setInterstitialState({ isOpen: true, message: displayMsg });
        });

        setInterstitialState({ isOpen: true, message: 'Transcribing with Whisper...' });

        try {
            let payload = {
                videoPath: videoSource,
                config: whisperConfig,
                audioTrackIndex: selectedAudioTrack,
            };
            if (isBatch && batchClip) {
                payload.startTime = batchClip.clip.startTime;
                payload.endTime = batchClip.clip.endTime;
            }

            const { results } = await window.api.send('transcribeAudio', payload);

            window.api.removeProgressListener();
            setInterstitialState({ isOpen: false, message: '' });

            const newSubs = results.map((r, _i) => ({
                startTime: r.startTime,
                endTime: r.endTime,
                text: r.text,
                type: 'subtitle',
                row: 0,
                speaker: '',
                voice: 'male',
            }));

            const distributed = distributeSubs(
                newSubs.sort((a, b) => a.startTime - b.startTime).map((s, i) => ({ ...s, index: i }))
            );
            setSubs(distributed);
            setTrackKey((k) => k + 1);
            if (distributed.length > 0) {
                setCurrentSub(0);
            }
            toast(`Generated ${results.length} subtitles`, { type: 'info' });
        } catch (err) {
            window.api.removeProgressListener();
            setInterstitialState({ isOpen: false, message: '' });
            console.error(err);
            toast(`Transcription failed: ${err}`, { type: 'error' });
        }
    };

    let checkClipExists = async (title, clipNumber) => {
        return await api.send('clipExists', {
            title,
            clipNumber,
            game: params.type,
        });
    };

    const subChangeHandler = (mode, sub) => {
        if (mode === 'add') {
            let newSubIndex = 0;
            let subList = [...stateRef.current.subs, sub]
                .sort((a, b) => a.startTime - b.startTime)
                .map((modifiedSub, index) => {
                    if (!modifiedSub.index) {
                        newSubIndex = index;
                    }
                    return {
                        ...modifiedSub,
                        index,
                    };
                });
            subList = distributeSubs(subList);
            setCurrentSub(newSubIndex);
            setSubs(subList);
        } else if (mode === 'edit') {
            let subLength = sub.endTime - sub.startTime;
            if (sub.startTime < 0) {
                sub.startTime = 0;
                sub.endTime = sub.startTime + subLength;
            }
            let videoEndMs = stateRef.current.videoLength * 1000;
            if (sub.endTime > videoEndMs) {
                sub.endTime = videoEndMs;
            } else if (videoEndMs - sub.endTime < 100) {
                sub.endTime = videoEndMs;
            }
            let subList = [...stateRef.current.subs];
            subList[sub.index] = sub;
            subList = subList.map((modifiedSub, index) => {
                return {
                    ...modifiedSub,
                    index,
                };
            });
            subList = distributeSubs(subList);
            setSubs(subList);
        } else if (mode === 'remove') {
            let subList = [...stateRef.current.subs];
            subList.splice(sub.index, 1);
            subList = subList.map((modifiedSub, index) => {
                return {
                    ...modifiedSub,
                    index,
                };
            });
            setSubs(subList);
        } else if (mode === 'sort') {
            let subList = [...stateRef.current.subs];
            subList = subList
                .sort((a, b) => a.startTime - b.startTime)
                .map((modifiedSub, index) => {
                    return {
                        ...modifiedSub,
                        index,
                    };
                });
            setSubs(subList);
        }
    };

    if (isBatch && !videoSource) {
        return <div>Loading Video...</div>;
    }

    return (
        <div>
            <div style={{ color: 'red' }}>{error}</div>
            {videoSource ? (
                <div className="editor-container">
                    <div className="top-pane">
                        <WhatTheDubPlayer
                            key={playerKey}
                            trackKey={trackKey}
                            width="100%"
                            videoSource={playbackSource}
                            isPlaying={
                                isPlaying &&
                                (!batchClip ||
                                    (currentSliderPosition >=
                                        batchClip.clip.startTime &&
                                        currentSliderPosition <=
                                            batchClip.clip.endTime))
                            }
                            videoPosition={currentPosition}
                            subs={subs}
                            offset={offset}
                            substitution={substitution}
                            onEnd={() => {
                                setIsPlaying(false);
                                setCurrentSliderPosition(stateRef.current.offset + stateRef.current.videoLength * 1000 + 15);
                            }}
                            onIndexChange={(index) => {
                                setCurrentSub(index);
                            }}
                            onVideoPositionChange={(position) => {
                                setCurrentSliderPosition(Math.max(offset, position * 1000));
                            }}
                            onVideoLoaded={async (video) => {
                                if (!isBatch) {
                                    setEndTime(video.duration * 1000);
                                }
                                if (!videoLength) {
                                    setVideoLength(video.duration);
                                }
                                const config = await ConfigAPI.getConfig();
                                if (config.fixSubsOnLoad !== false && !isBatch) {
                                    fixSubs(video.duration * 1000);
                                }
                            }}
                        />
                        <div style={{ margin: '10px 0' }}>
                            <button
                                onClick={transcribeAudio}
                                style={{ fontWeight: 'bold' }}
                            >
                                Generate Subtitles (Whisper)
                            </button>
                            <button
                                onClick={() => setPlayerKey(k => k + 1)}
                                style={{ marginLeft: 10 }}
                            >
                                Refresh Player
                            </button>
                        </div>
                        <SubtitleList
                            game={params.type}
                            currentSliderPosition={
                                currentSliderPosition - offset
                            }
                            videoId={id}
                                clipNumberOverride={
                                    clipNumberOverride ??
                                    batchClip?.clipNumber
                                }
                            isEdit={isEdit}
                            titleOverride={batchClip?.title || titleOverride}
                            currentSub={currentSub}
                            currentRow={currentRow}
                            offset={offset}
                            subs={subs}
                            videoLength={videoLength}
                            onSubsChange={subChangeHandler}
                            onSelectSub={setCurrentSub}
                            onSave={(title, number, collectionId) => {
                                handleInterstitial(
                                    addVideoToGame(title, number, collectionId),
                                    (isOpen) => {
                                        setInterstitialState({
                                            isOpen,
                                            message:
                                                'Creating clip and adding subs...',
                                        });
                                    }
                                );
                            }}
                        />
                    </div>
                    <TimeLine
                        timelineWidth={windowSize.width * 0.9}
                        rowCount={5}
                        isPlaying={isPlaying}
                        currentSub={currentSub}
                        currentRow={currentRow}
                        offset={offset}
                        currentPosition={currentPosition * 1000}
                        currentSliderPosition={currentSliderPosition}
                        videoLength={videoLength}
                        subs={subs}
                        onStateChange={setIsPlaying}
                        onSubSelect={setCurrentSub}
                        onSubsChange={subChangeHandler}
                        onSliderPositionChange={scrub}
                        onRowChange={setCurrentRow}
                    />
                </div>
            ) : (
                <div>
                    <p>
                        Please choose the video you wish to add subtitles to.
                        Note that the file needs to already be trimmed to the
                        length you want it. However you can use batch mode if
                        you want to cut up your video into smaller pieces.
                    </p>
                    <button onClick={onFileOpen}>Open Video</button>
                    <Link to="/">
                        <button type="button">Cancel</button>
                    </Link>
                </div>
            )}
        </div>
    );
};

export default AdvancedEditor;
