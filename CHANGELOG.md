Multi-track Audio Support
- Added multi-track audio support — users can select audio tracks from videos with multiple tracks
- Added audio track prompt dialog when opening a file with multiple audio tracks
- Audio track selection is persisted through batch processing and subtitle generation
Smart Video Remuxing for Playback
- Added intelligent canPlayDirect detection to determine if a video can play natively based on codec/format compatibility
- Implemented on-demand remuxing pipeline that re-encodes incompatible videos for reliable playback
- Hardware encoder auto-detection (NVENC, AMF, QSV) with fallback to system ffmpeg
- Added remux progress reporting UI via interstitial overlay
- Temp file caching with automatic cleanup (1-hour TTL for playback dirs, 24h for cache)
Playback & Player Improvements
- Fixed game:// URL resolution to use actual video URLs in subtitle generation (4cead77)
- Fixed clip playback button bug in batch mode (6083ffa)
- Added segment playback in batch mode (30f6dc1)
- Added length indicator to batch trimming (d92c6aa)
- Track srclang typo fix in <track> element (srcLang)
- Better error handling for video play promises (.catch(() => {}))
- Added video error state display in player (Video Error: ...)
- Added detailed video event logging (loadStart, stalled, error, etc.)
Timeline Zoom
- Added zoomable timeline with scroll-wheel zoom, +/- buttons, and 1:1 reset
- Timeline viewport follows the playhead when zoomed in
- All timeline calculations are now zoom-aware
Dub & Subtitle Fixes
- Fixed bug where dub voice defaulted to female_dub when dropdown untouched (337a61a)
- Improved playback audio when dub timestamps are changed (337a61a)
- Added checkboxes to remember previous settings (337a61a)
- Added settings toggle to disable subtitle fixing for debugging/testing (337a61a)
Config & Build
- Updated Electron from ^18 to ^28, electron-builder from ^23 to ^24
- Updated TypeScript from ^4.6 to ^5.3, tsconfig target from es2021 to es2022
- Updated ESLint + TypeScript ESLint plugin/parser to v6.21
- Updated @types/node from 17 to 20, ts-node to ^10.9.2
- Changed start:main to use compiled main.dev.js directly
- Removed Launcher import from App.jsx
- Added .audioChannels(2) to convertToCompatible in videoFormat.ts
- Expanded compatible codec lists (video: h264/hevc/vp8/vp9/av1, audio: aac/mp3/opus/flac/ac3/eac3/PCM variants)
- Version bump: 1.0.5 → 1.2.0
CI
- Fixed CI by adding lint step and fixing tsc/jest/eslint (d809e66)
- Updated deprecated GitHub Actions versions (611d360)
Backend
- Added probeMediaInfo function returning full track list, video codec, pixel format, and duration
- Audio extraction in whisper now accepts optional audioTrackIndex parameter
- storeVideo/processBatchClip/storeBatch all accept audioTrackIndex
- New IPC handlers: getAudioTracks, remuxForPlayback, cleanupTempFile, showAudioTrackPrompt, log
- New preload APIs: onRemuxProgress, removeRemuxProgressListener
Uncommitted Changes (22 files)
Same scope as above — all changes described in the committed section are present across both the 8 commits and the working tree, with the working tree representing the latest iteration of those features plus:
- ClipList.jsx: Fixed table markup by adding missing <tbody> wrapper
- SubtitleList.jsx: Minor whitespace cleanup
Note: The uncommitted changes contain the same feature work as the commits (they appear to be incremental refinements on top of the 8 commits). The package-lock.json changes are dependency resolution updates from the version bumps.