## What is WTD Tool?

Dub Editor is a tool for creating/managing clips for Rifftrax the Game and What the Dub.

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

When you first launch the app, it will ask you to configure the game directories for Rifftrax and What the Dub. The directory you want to use is the directory that contains the StreamingAssets folder. In a future release I will have the config page validate that the folder is correct before allowing the user to continue.

## Re-encode script

Dub Editor now comes with a little powershell script that allows you to batch re-encode all files within a folder. It currently points to the script root and drops the files in a new folder named _reencoded. You can change these settings by editing the script. Drop the videos in the script folder or edit the script to point to your video folder. Then open a powershell window in the folder that contains the script and run:

    .\reencode-clips.ps1