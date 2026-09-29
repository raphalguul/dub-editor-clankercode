import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { addVideo, convertSrtToSubtitles, convertJsonToCensorBars, createCensorBar, clampCensorBar, distributeCensorBars, censorDefaultsFromConfig } from '../../util/VideoTools';

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
    const [censorBars, setCensorBars] = useState([]);
    const [hasCensorSource, setHasCensorSource] = useState(false);
    const [hasCensorData, setHasCensorData] = useState(false);
    const [censorModePrompt, setCensorModePrompt] = useState(null);
    const [censorBarDefaults, setCensorBarDefaults] = useState(null);
    const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });
    const [activeTab, setActiveTab] = useState('subtitles');

// When switching to subtitles tab, deselect any censor bar
    const handleTabChange = (tab) => {
        setActiveTab(tab);
        if (tab === 'subtitles') {
            setCurrentSub(null);
            setCurrentCensor(null);
        }
    };

    // In subtitle mode, clicking a censor bar should select it AND switch to censor tab
    const handleCensorSelect = (index) => {
        if (isCensorTab) {
            setCurrentCensor(index);
        } else {
            setCurrentCensor(index);
            setActiveTab('censors');
        }
    };
    const [currentSub, setCurrentSub] = useState(null);
    const [currentCensor, setCurrentCensor] = useState(null);
    const [selectedAudioTrack, setSelectedAudioTrack] = useState(0);
    const [playbackSource, setPlaybackSource] = useState('');
    const playbackSourceRef = useRef('');
    const [substitution] = useState('');
    const [buttonsDisabled, setButtonsDisabled] = useState(false);
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

    const isCensorTab = activeTab === 'censors';
    const activeItems = isCensorTab ? censorBars : subs;

    const stateRef = useRef();
    stateRef.current = {
        currentSub,
        currentCensor,
        currentRow,
        currentSliderPosition,
        subs,
        censorBars,
        activeTab,
        activeItems,
        isPlaying,
        defaultClipSize,
        videoLength,
        offset,
        censorBarDefaults,
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
                const currentIndex = isCensorTab
                    ? stateRef.current.currentCensor
                    : stateRef.current.currentSub;
                if (currentIndex === null) {
                    return;
                }
                if (isCensorTab) {
                    setCurrentCensor((idx) =>
                        Math.min(stateRef.current.activeItems.length - 1, idx + 1)
                    );
                } else {
                    setCurrentSub((idx) =>
                        Math.min(stateRef.current.activeItems.length - 1, idx + 1)
                    );
                }
                break;
            }
            case 'ArrowDown': {
                const currentIndex = isCensorTab
                    ? stateRef.current.currentCensor
                    : stateRef.current.currentSub;
                if (currentIndex === null) {
                    return;
                }
                if (isCensorTab) {
                    setCurrentCensor((idx) => Math.max(0, idx - 1));
                } else {
                    setCurrentSub((idx) => Math.max(0, idx - 1));
                }
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
                const currentIndex = isCensorTab
                    ? stateRef.current.currentCensor
                    : stateRef.current.currentSub;
                let currentSubObject = stateRef.current.activeItems[currentIndex];
                activeChangeHandler(
                    'edit',
                    {
                        ...currentSubObject,
                        startTime:
                            stateRef.current.currentSliderPosition -
                            stateRef.current.offset,
                    },
                    currentIndex
                );
                break;
            }
            case 'o': {
                const currentIndex = isCensorTab
                    ? stateRef.current.currentCensor
                    : stateRef.current.currentSub;
                let currentSubObject = stateRef.current.activeItems[currentIndex];
                activeChangeHandler(
                    'edit',
                    {
                        ...currentSubObject,
                        endTime:
                            stateRef.current.currentSliderPosition -
                            stateRef.current.offset,
                    },
                    currentIndex
                );
                break;
            }
            case '[': {
                const currentIndex = isCensorTab
                    ? stateRef.current.currentCensor
                    : stateRef.current.currentSub;
                let currentSubObject = stateRef.current.activeItems[currentIndex];
                scrub(currentSubObject.startTime + stateRef.current.offset);
                break;
            }
            case ']': {
                const currentIndex = isCensorTab
                    ? stateRef.current.currentCensor
                    : stateRef.current.currentSub;
                let currentSubObject = stateRef.current.activeItems[currentIndex];
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
            case 'n': {
                let startTime =
                    parseInt(stateRef.current.currentSliderPosition) -
                    stateRef.current.offset;
                if (stateRef.current.activeTab === 'censors') {
                    activeChangeHandler('add', {
                        ...createCensorBar({
                            startTime,
                            endTime: Math.min(
                                startTime + stateRef.current.defaultClipSize,
                                stateRef.current.videoLength * 1000
                            ),
                            rowIndex: stateRef.current.currentRow,
                            ...(stateRef.current.censorBarDefaults || {}),
                        }),
                        rowIndex: stateRef.current.currentRow,
                    });
                } else {
                    activeChangeHandler('add', {
                        rowIndex: stateRef.current.currentRow,
                        startTime: startTime,
                        endTime:
                            Math.min(startTime + stateRef.current.defaultClipSize, stateRef.current.videoLength * 1000),
                        text: '',
                        type: 'subtitle',
                        voice: 'male',
                        speaker: '',
                    });
                }
                break;
            }
            case 't': {
                let typeSelect = document.getElementById(
                    stateRef.current.activeTab === 'censors'
                        ? 'censor-bar-type'
                        : 'subtitle-type'
                );
                if (typeSelect) {
                    typeSelect.focus();
                }
                break;
            }
            case 'g': {
                let voiceSelect =
                    document.getElementById('subtitle-voice');
                if (voiceSelect) {
                    voiceSelect.focus();
                }
                break;
            }
            case 'e': {
                let textArea = document.getElementById('subtitle-text');
                if (textArea) {
                    textArea.focus();
                }
                break;
            }
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
        if (activeTab !== 'subtitles') {
            return;
        }
        let index = getCurrentIndex();
        if (index >= 0) {
            setCurrentSub(index);
        }
    }, [currentSliderPosition, activeTab]);

    useEffect(() => {
        return () => {
            if (playbackSourceRef.current) {
                VideoAPI.cleanupTempFile(playbackSourceRef.current).catch(() => {});
            }
        };
    }, []);

    useEffect(() => {
        (async () => {
            const config = await ConfigAPI.getConfig();
            setCensorBarDefaults(censorDefaultsFromConfig(config));
        })();
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
        setFrameSize({
            width: mediaInfo.videoWidth || 0,
            height: mediaInfo.videoHeight || 0,
        });
        setSelectedAudioTrack(firstAudioIndex);

        subtitles = distributeSubs(subtitles);
        setSubs(subtitles);

        setCensorBars(
            distributeCensorBars(
                convertJsonToCensorBars(videoDetails.censorBars)
            )
        );

        setHasCensorSource(!!videoDetails.hasCensorSource);
        setHasCensorData(!!videoDetails.hasCensorData);

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
        // The batch advances by remounting the editor, so clear anything left
        // over from the previous clip before the next one loads. A stale bar
        // list or sidecar flag would otherwise leak into this clip and get
        // written out on finalize.
        setSubs([]);
        setCensorBars([]);
        setHasCensorSource(false);
        setHasCensorData(false);

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
        setFrameSize({
            width: mediaInfo.videoWidth || 0,
            height: mediaInfo.videoHeight || 0,
        });
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
        setFrameSize({
            width: mediaInfo.videoWidth || 0,
            height: mediaInfo.videoHeight || 0,
        });
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

    const chooseCensorMode = () =>
        new Promise((resolve) => setCensorModePrompt({ resolve, remember: true }));

    const resolveCensorMode = (mode) => {
        if (!censorModePrompt) {
            return;
        }
        const { resolve, remember } = censorModePrompt;
        setCensorModePrompt(null);
        resolve({ mode, remember });
    };

    // Runs before the finalize interstitial is raised, otherwise the full screen
    // spinner would sit on top of these questions. Returns null if the user
    // backed out.
    const confirmCensorFinalize = async () => {
        const noKeep = { keepCensorSource: false, censorMode: null };
        if (censorBars.length === 0) {
            return noKeep;
        }

        const config = await ConfigAPI.getConfig();
        let censorMode = config.censorMode;
        // Only set when the user answered the popup for this clip and declined
        // to make it the default. Remembered choices are left to main to read.
        let perClipCensorMode = null;
        if (!censorMode) {
            // Nothing is remembered, so the answer does not become the default
            // and this comes back on the next censored finalize.
            const choice = await chooseCensorMode();
            if (!choice || !choice.mode) {
                return null;
            }
            censorMode = choice.mode;
            if (choice.remember) {
                await ConfigAPI.storeConfig({ censorMode });
            } else {
                perClipCensorMode = censorMode;
            }
        }

        const bakeOnly = censorMode === 'bakeOnly';
        let keepCensorSource = false;
        if (bakeOnly && isEdit && hasCensorSource) {
            // showConfirmDialog resolves to "a button other than the first was
            // clicked", so with this button order the result means delete, not
            // keep. Index 0 is also the cancel button, so Escape keeps it.
            const deleteCensorSource = await window.api.send('showConfirmDialog', {
                message:
                    'This clip still has an uncensored copy left over from an earlier finalize.\n\n' +
                    'Censor Bar Storage is set to bake only, so it is normally dropped to save space. ' +
                    'Keeping it means you can still reopen the clip and move or remove the bars, but it keeps costing about twice the space.\n\n' +
                    'Delete the uncensored copy and the saved bar data?',
                buttons: ['Keep Uncensored Copy', 'Delete It'],
                defaultId: 0,
            });
            keepCensorSource = !deleteCensorSource;
        }

        if (isEdit && !hasCensorSource && (hasCensorData || bakeOnly)) {
            // In bake only mode there is no sidecar to prove the clip was ever
            // censored, so the wording stays true either way.
            const confirmed = await window.api.send('showConfirmDialog', {
                message: bakeOnly
                    ? 'This clip has no uncensored copy, so there is nothing to fall back on.\n\n' +
                      'If any bars are already baked into the video they stay in the picture, and your bars are baked on top of them, ' +
                      'permanently stacking the blur and box edges. This cannot be undone.'
                    : 'The uncensored master for this clip is missing, so the existing censor bars are already burned into the video.\n\n' +
                      'Finalizing now will bake the new bars on top of the burned-in ones, permanently stacking the blur and box edges. ' +
                      'This cannot be undone.',
            });
            if (!confirmed) {
                return null;
            }
        }

        return { keepCensorSource, censorMode: perClipCensorMode };
    };

    let addVideoToGame = async (
        videoName,
        clipNumber,
        collectionId,
        censorSettings
    ) => {
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
                selectedAudioTrack,
                censorBars,
                censorSettings.keepCensorSource,
                censorSettings.censorMode
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

            // Go straight to the destination. Navigating to '/' relied on the
            // catch all <Navigate> in App.jsx, and that two hop bounce was
            // getting dropped when reached from this async continuation, which
            // left the editor on screen after a successful finalize.
            let destination = '/videos';
            if (isBatch && (await BatchAPI.hasBatch()) > 0) {
                destination = '/create?batch=true';
            }
            navigate(destination);
        } catch (error) {
            console.error(error);
            await window.api
                .send('log', `Clip add failed: ${error?.stack || error}`)
                .catch(() => {});
            toast(`Clip add failed!`, { type: 'error' });
        } finally {
            // Without this the Finalize button stays dead whenever addVideo
            // throws, since the reset above is never reached.
            setButtonsDisabled(false);
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

    const censorBarChangeHandler = (mode, bar) => {
        if (mode === 'add') {
            let newIndex = 0;
            let barList = [...stateRef.current.censorBars, bar]
                .sort((a, b) => a.startTime - b.startTime)
                .map((modifiedBar, index) => {
                    if (modifiedBar.index === undefined || modifiedBar.index === null) {
                        newIndex = index;
                    }
                    return { ...modifiedBar, index };
                });
            barList = distributeCensorBars(barList);
            setCurrentSub(newIndex);
            setCensorBars(barList);
        } else if (mode === 'edit') {
            let length = bar.endTime - bar.startTime;
            if (bar.startTime < 0) {
                bar.startTime = 0;
                bar.endTime = bar.startTime + length;
            }
            let videoEndMs = stateRef.current.videoLength * 1000;
            if (bar.endTime > videoEndMs) {
                bar.endTime = videoEndMs;
            } else if (videoEndMs - bar.endTime < 100) {
                bar.endTime = videoEndMs;
            }

            const edited = clampCensorBar(bar);
            // Applied through the updater so the edit always lands on the live list
            // rather than a snapshot that may predate it -- a drag fires one of these
            // per mousemove, which is far faster than the list re-renders.
            setCensorBars((prev) => {
                // `bar.index` was captured when the interaction started, so a re-sort
                // in the meantime can leave it pointing at a different bar. Geometry
                // edits never touch startTime, so use it to confirm the slot before
                // overwriting, and re-derive the real position if it has moved.
                let target = edited.index;
                const atIndex = Number.isInteger(target) ? prev[target] : undefined;
                if (!atIndex || atIndex.startTime !== edited.startTime) {
                    const match = prev.findIndex(
                        (existing) => existing.startTime === edited.startTime
                    );
                    if (match >= 0) {
                        target = match;
                    }
                }
                if (!Number.isInteger(target) || target < 0 || target >= prev.length) {
                    return prev;
                }

                let barList = [...prev];
                barList[target] = { ...edited, index: target };
                barList = barList.map((modifiedBar, index) => ({ ...modifiedBar, index }));
                return distributeCensorBars(barList);
            });
        } else if (mode === 'remove') {
            let barList = [...stateRef.current.censorBars];
            barList.splice(bar.index, 1);
            barList = barList.map((modifiedBar, index) => ({ ...modifiedBar, index }));
            setCensorBars(barList);
        } else if (mode === 'sort') {
            let barList = [...stateRef.current.censorBars]
                .sort((a, b) => a.startTime - b.startTime)
                .map((modifiedBar, index) => ({ ...modifiedBar, index }));
            setCensorBars(distributeCensorBars(barList));
        }
    };

    const activeChangeHandler = (mode, item) => {
        if (stateRef.current.activeTab === 'censors') {
            censorBarChangeHandler(mode, item);
        } else {
            subChangeHandler(mode, item);
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
                            censorBars={censorBars}
                            censorBarPosition={currentSliderPosition - offset}
currentBarIndex={currentCensor}
                            isCensorTab={isCensorTab}
                            onCensorBarChange={censorBarChangeHandler}
                            onSelectCensorBar={handleCensorSelect}
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
                            currentCensor={currentCensor}
                            currentRow={currentRow}
                            offset={offset}
                            subs={subs}
                            censorBars={censorBars}
                            activeTab={activeTab}
                            onTabChange={handleTabChange}
                            videoLength={videoLength}
                            frameWidth={frameSize.width}
                            frameHeight={frameSize.height}
                            onCensorBarsChange={censorBarChangeHandler}
                            onSubsChange={subChangeHandler}
                            onSelectSub={setCurrentSub}
                            onSelectCensorBar={handleCensorSelect}
                            buttonsDisabled={buttonsDisabled}
                            onSave={async (title, number, collectionId) => {
                                if (buttonsDisabled) {
                                    return;
                                }
                                setButtonsDisabled(true);
                                try {
                                    const censorSettings =
                                        await confirmCensorFinalize();
                                    if (!censorSettings) {
                                        return;
                                    }
                                    await handleInterstitial(
                                        addVideoToGame(
                                            title,
                                            number,
                                            collectionId,
                                            censorSettings
                                        ),
                                        (isOpen) => {
                                            setInterstitialState({
                                                isOpen,
                                                message:
                                                    'Creating clip and adding subs...',
                                            });
                                        }
                                    );
                                } finally {
                                    setButtonsDisabled(false);
                                }
                            }}
                        />
                    </div>
                    <TimeLine
                        timelineWidth={windowSize.width * 0.9}
                        rowCount={5}
                        kind={isCensorTab ? 'censor' : 'subtitle'}
                        isPlaying={isPlaying}
                        currentSub={currentSub}
                        currentCensor={currentCensor}
                        currentRow={currentRow}
                        offset={offset}
                        currentPosition={currentPosition * 1000}
                        currentSliderPosition={currentSliderPosition}
                        videoLength={videoLength}
                        subs={activeItems}
                        onStateChange={setIsPlaying}
                        onSubSelect={setCurrentSub}
                        onCensorSelect={handleCensorSelect}
                        onSubsChange={activeChangeHandler}
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
            {censorModePrompt && (
                <div
                    className="modal-overlay"
                    onClick={() => resolveCensorMode(null)}
                >
                    <div
                        className="modal modal-wide"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h4>Censor Bar Storage</h4>
                        <p>
                            Choose how Dub Editor should store these censor
                            bars. You can change this at any time in Settings.
                        </p>
                        <button
                            className="censor-mode-option"
                            onClick={() => resolveCensorMode('saveSource')}
                        >
                            <strong>
                                Keep an uncensored copy (reversible)
                            </strong>
                            <span>
                                Censored clips take roughly twice as much space in your workspace.
                            </span>
                        </button>
                        <button
                            className="censor-mode-option"
                            onClick={() => resolveCensorMode('bakeOnly')}
                        >
                            <strong>
                                Bake bars into the video only (not reversible)
                            </strong>
                            <span>
                                Bars cannot be changed or removed
                            </span>
                        </button>
                        <label className="censor-mode-remember">
                            <input
                                type="checkbox"
                                checked={censorModePrompt.remember}
                                onChange={({ target: { checked } }) => {
                                    setCensorModePrompt((prompt) =>
                                        prompt
                                            ? { ...prompt, remember: checked }
                                            : prompt
                                    );
                                }}
                            />
                            Remember this choice
                        </label>
                        <p>
                            Note: This choice does not affect the size of the exported pack.
                        </p>
                        <div className="modal-buttons">
                            <button onClick={() => resolveCensorMode(null)}>
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdvancedEditor;
