# What's changed

## Batch Editor Upgrades
- Batch editor is now precise enough that it makes trimming outside of Dub Editor pretty much unnecessary (just load your original into batch mode and define your clips)
- Timeline is zoomable for better precision (everywhere, but batch mode benefits the most)
- Clips can be locked in during cutting (to avoid accidentally overwriting the In/Out point of the previous clip)
- Added Clip length indicator
- Added segment playback (only plays the currently selected clip, ideal for previewing before finalizing a batch)
- Automatic Clip naming (manual naming is still available)
- Added more robust re-encoding to prevent the videostream copy from snapping to keyframes (this used to result in batch clips that didn't exactly align with the In/Out points the user set)
- Default clip length is now 8s (was 10% of total source length before)
- Many minor bugs fixed
## Improved filetype and codec support
- Incompatible files will now be encoded for playback (should improve file compatibility, creates temporary files for quicker reload)
- Clips will always be encoded to be compatible with WTD
## Multi-track Audio Support
- Users can select audio tracks from videos with multiple tracks (it used to just go with the default one)
## Misc
- Collection names are now ordered alphabetically
- Audio normalizer now correctly writes and checks a file that prevents Dub Editor from normalizing the same file repeatedly
- Max length of new subtitles is now reduced if they would overlap with existing subtitles
- Editor now autoselects the first subtitle after auto-generation
## Under the Hood Upgrade (this was stupid, but it seems to work)
- Updated Electron from 18 to 28 (This was done in hopes of improving codec compatibility. Not sure if it was worth it.)
- Updated electron-builder from 23 to 24
- Updated TypeScript from 4.6 to 5.3
- Updated ESLint + TypeScript ESLint plugin/parser to 6.21
- Updated @types/node from 17 to 20, ts-node to 10.9.2