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