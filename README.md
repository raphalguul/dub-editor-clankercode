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

Dub Editor now comes with a little powershell script that allows you to batch re-encode all files within a folder. It currently points to the script root and drops the files in a new folder named _reencoded. You can change these settings by editing the script. Drop the videos in the script folder or edit the script to point to your video folder. Then open a powershell window in the folder that contains the script and run:

    .\reencode-clips.ps1

## Bug Reports

If you encounter any issues, flag them on this issues page here on GitHub. I might be able to look into it.
