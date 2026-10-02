## What is Dub Editor ClankerCode?

Dub Editor ClankerCode is a tool for creating/managing clips for What the Dub. It is a fork from Michael C. Main's [Dub Editor 2.4.3-beta](https://github.com/deusprogrammer/dub-editor-electron).

Main additions/changes:
- Automatic subtitle generation with whisper
- Improved format support
- Automatic audio normalization
- Improved clip cutter
- Speaker support
- Automatic clip naming
- Bug fixes
- UI improvements
- Removal of simple editor

Note that the original Dub Editor was designed for What the Dub and Rifftrax. I did not remove the Rifftrax functionality, but don't plan on supporting it in this version of Dub Editor.

## How to Use

- Start Dub Editor ClankerCode
- Select What the Dub in the top right if necessary
- If you haven't already created the pack you want to make clips for, create it by clicking Packs, typing a Collection Name and clicking Create. Then click on Clips at the top

From here it depends if you have already trimmed a video file to the exact length of the clip. If you do, click New Clip, select your clip and follow the instructions in the section Video Editor below. If not, you can use Batch editor (From Scratch).

### From Scratch (unedited video file)

- Click New Batch
- Click Open Video
- Select your video (it may get re-encoded for compatibility, this only happens once per file)
- Navigate to the start point of your desired clip (use mousewheel to zoom into the timeline)
- Click Add Clip (its start point will be the play head)
- Navigate to the end point of your desired clip and define the End by clicking "Set at Play Head"
- Click the play button of the clip in the clip list to review the cut timing (adjust if necessary)
- Click the lock checkmark to prevent further changes being made to the clip
- If you have any more clips within this video file, navigate to the start point of the next clip, click Add Clip etc.
- When you've defined all your clips, click Process Batch.
- Dub Editor will now trim all the video files for you; afterwards you will see the video editor (see Video Editor below)

### Video Editor

- Once the clip is open, click Generate Subtitles (Whisper) - you may need to download additional dependencies for autogeneration to work
- Once the subtitles are generated, you can click them in the timeline and review/correct them
- Adjust timings
- Add more subtitles or remove the generated ones manually
- Add the name of the speaker whenever it changes
- Change the Subtitle Type to Dub for the line that is supposed to be dubbed over by the player
- Select if the tts voice is supposed to be male or female
- Preview the clip
- Check Clip Name and Number (these are automatically generated, but you can change them manually)
- Select the clip pack (Collection) the video belongs to
- Click Finalize Clip

### Finalizing the Clip Pack

- Click on Packs
- Find your clip pack and click Edit
- Check that all the desired clips are in the pack (you can add more by clicking clips on the right)
- Click Preview Image
- Upload the thumbnail for your clip pack
- Click Back to Collection List
- Click Export next to the pack you just edited

Once you select the export destination, Dub Editor will create a zip file with all the files required by the workshop. Export these files into an empty (!) folder, then start What the Dub and point the workshop uploader to this folder.

## Censoring

If your clip contains elements you don't want to be visible ingame (e.g. hard-coded subtitles) you can create one or several censorship bars. Click on Censor Bars next to Subtitles. Placing these bars works the same as placing subtitles: Define in the timeline when the bar should appear and disappear. You can reposition and resize the censorship bar directly in the preview.

You can also choose between different types of censoring:

- Black Box: A black rectangle
- Gaussian Blur: Blurs what's underneath (this takes the longest to process)
- Delogo (Pixel Fill): Blends the pixels at the edges to completely cover what's underneath (note that in preview this uses the same model as Gaussian Blur; it looks quite different on export)

Censor bars are currently static. There is no keyframe animation. If you want to move the bar you could create aditional bars and place them in the new positions, then time them such that one appears after the other.

### Censor Bar Storage

Finalizing a clip bakes the bars into the video either way. What differs is what Dub Editor keeps around it, and that choice is made in Settings under Censoring:

| Storage | What is saved | Reversible | Workspace space |
|---------|---------------|------------|-----------------|
| Keep an uncensored copy | censored clip + uncensored master + bar data | yes, bars can be moved, resized or removed later | roughly 2x for censored clips |
| Bake bars into the video only | censored clip | no, you would have to import the original video again | 1x |

Neither option changes the size of the exported clip pack: the pack always contains the censored video only. On your first censored clip you are asked which one to use and the answer becomes the default, but you can switch at any time in Settings. Switching to bake only does not remove masters that already exist; the next time you finalize such a clip you are asked whether to keep or delete the uncensored copy.

## Keyboard Shortcuts

| Key        | Function      |
|------------|---------------|
| Arrow Up   | prev sub/clip |
| Arrow Down | next sub/clip |
| Arrow Left | rw 1s         |
| Arrow Right| ffw 1s        |
|      ;     | rw 1 frame    |
|      '     | ffw 1 frame   |
|      \[    | go to in      |
|      \]    | go to out     |
|      i     | set in        |
|      o     | set out       |
|      w     | go up row     |
|      s     | go down row   |
|      e     | edit sub      |
|      t     | edit type     |
|      v     | edit voice    |
|    space   | play/pause    |

## How to Test Development

Make sure to run the following to install all of the dependencies.

    npm i

Then run the following to launch the application.

    npm run start

## How to Build

Install and run electron-packager on the root of the project.

    npm run package

## Configuring Program Directories

When you first launch the app, it will ask you to configure the game directories for Rifftrax and What the Dub. Use an empty folder. Dub Editor will build the required skeleton. This folder will hold all your clips and srt files plus a few more files that Dub Editor uses to keep track of normalization.

You can copy other Videoclips and Subtitles folders into the whatthedub folder Dub Editor creates if you want to edit existing clips in Dub Editor.

## Re-encode script

Dub Editor now comes with a little powershell script that allows you to batch re-encode all files within a folder. It unifies audio-encoding and reduces resolution and bitrate if necessary. Open a powershell window in the folder that contains the script and run:

    .\reencode-clips.ps1

Select your folder (subfolders will also be processed) and if files should be overwritten (if not, the script will create subfolders with the video files next to the originals).

## Whisper Transcription Troubleshooting

Whisper transcription runs `whisper.cpp` locally. On first use the app downloads a
whisper.cpp binary and your chosen model, then caches them. If transcription
fails immediately with an `HTTP 404` or `HTTP 403`, a download did not complete.

The quickest fix is **Config > Check & Download Whisper Components**. It reports
each component as Ready, Cached or Failed, so you can see exactly which download
failed. It also prints the cache folder path.

### Where the files live

The cache folder comes from the packaged app name, *not* the product name shown
in the Start menu:

    C:\Users\<your username>\AppData\Roaming\dub-editor-sa-electron\whisper\

| Folder | Contents |
| --- | --- |
| `_whisper_bin` | CPU binary, `whisper.cpp.exe` |
| `_cuda_bin` | CUDA binary, `whisper.cpp.cuda.exe` |
| `models` | Model `.bin` files |

The app must be **closed** while you add files by hand, otherwise it may
overwrite them.

### Downloading models by hand

All model URLs were verified reachable. Save each file under its exact filename
straight into the `models` folder — your browser may append `.txt`, which the
app will not recognise.

Base URL:

    https://huggingface.co/ggerganov/whisper.cpp/resolve/main/

| Config option | Filename | Size |
| --- | --- | --- |
| `tiny` | `ggml-tiny-q5_1.bin` | 31 MB |
| `base` (default) | `ggml-base-q5_1.bin` | 57 MB |
| `small` | `ggml-small-q5_1.bin` | 181 MB |
| `medium` | `ggml-medium-q5_0.bin` | 514 MB |
| `large` | `ggml-large-v3-q5_0.bin` | 1031 MB |

### Downloading the binaries by hand

If the binaries are what failed, downloading a model will not help. Use a pinned
release rather than `/releases/latest/download/`, because whisper.cpp no longer
attaches binaries to its newest tags:

| Binary | URL |
| --- | --- |
| CPU | `https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.2/whisper-bin-x64.zip` |
| CUDA | `https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.2/whisper-cublas-12.4.0-bin-x64.zip` |

Extract every file from the zip flat into the target folder (the zip contains a
`Release` subfolder — ignore it), then rename:

- `whisper-cli.exe` to `whisper.cpp.exe` in `_whisper_bin`
- `whisper-cli.exe` to `whisper.cpp.cuda.exe` in `_cuda_bin`

The DLLs next to it must stay in the same folder as the exe.

**Only have a CPU binary?** Also untick *Use CUDA (GPU Acceleration)* in Config.
While that box is ticked the app looks for the CUDA binary first, so it will fail
before it ever considers the CPU copy.

### Why this keeps happening

whisper.cpp publishes its Windows binaries on rolling `b####` prereleases, and
its `v*` tags carry no assets at all (v1.9.3 and v1.9.4 both have zero). Any
download URL built from `/releases/latest/download/` therefore returns 404. The
app now resolves asset URLs through the GitHub releases API and skips
asset-less tags, with the pinned v1.9.2 links above as a fallback.

## Bug Reports

If you encounter any issues, flag them on the issues page here on GitHub. I might be able to look into it.
