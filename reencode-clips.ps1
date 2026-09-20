$defaultFolder = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
$inputFolder = Read-Host "Folder to process (default: $defaultFolder)"
if (-not $inputFolder.Trim()) { $inputFolder = $defaultFolder }
$inputFolder = (Resolve-Path -LiteralPath $inputFolder).Path

$answer = Read-Host "Overwrite original files? (y/N)"
$overwrite = $answer -match '^[Yy]'

$maxVideoKbps = 4000

function Get-VideoKbps {
    param([string]$FilePath, [int]$CeilingKbps)
    $probe = & ffprobe -v error -select_streams v:0 -show_entries stream=bit_rate -of json $FilePath | Out-String
    $json = $probe | ConvertFrom-Json
    if ($json.streams -and $json.streams.Count -gt 0) {
        $bitRate = $json.streams[0].bit_rate
        if ($bitRate -match '^\d+$' -and [long]$bitRate -gt 0) {
            return [int][Math]::Min($CeilingKbps, [long]$bitRate / 1000)
        }
    }
    $format = (& ffprobe -v error -show_entries format=duration,size -of json $FilePath | Out-String) | ConvertFrom-Json
    $duration = [double]$format.format.duration
    $size = [long]$format.format.size
    if ($duration -gt 0 -and $size -gt 0) {
        $estKbps = [long]$size * 8 / $duration / 1000
        return [int][Math]::Min($CeilingKbps, [long]$estKbps)
    }
    return $CeilingKbps
}

$extensions = @('*.mp4', '*.mkv', '*.mov', '*.avi', '*.webm', '*.wmv', '*.m4v', '*.ts')
$files = Get-ChildItem -Path $inputFolder -Recurse -File -Include $extensions

foreach ($file in $files) {
    $outDir = $file.DirectoryName
    if (-not $overwrite) {
        $outDir = Join-Path $file.DirectoryName "_reencoded"
        New-Item -ItemType Directory -Path $outDir -Force | Out-Null
    }
    $outFile = Join-Path $outDir ($file.BaseName + '.mp4')
    $tmpFile = Join-Path $outDir ('_tmp_' + $file.BaseName + '.mp4')

    $videoKbps = Get-VideoKbps -FilePath $file.FullName -CeilingKbps $maxVideoKbps
    $maxRateKbps = [int]($videoKbps * 1.25)
    $bufSizeKbps = $videoKbps * 2

    Write-Host "Re-encoding: $($file.FullName) ($($videoKbps)k video)"
    & ffmpeg -i $file.FullName `
        -vf "scale=w='min(1920,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease" `
        -c:v libx264 -b:v "${videoKbps}k" -maxrate "${maxRateKbps}k" -bufsize "${bufSizeKbps}k" -bf 0 -pix_fmt yuv420p `
        -c:a aac -b:a 192k -ac 2 -ar 44100 `
        -movflags +faststart `
        -y $tmpFile
    if ($?) {
        Move-Item -LiteralPath $tmpFile -Destination $outFile -Force
        if ($overwrite -and $outFile -ne $file.FullName) { Remove-Item -LiteralPath $file.FullName -Force }
        Write-Host "Done: $outFile"
    } else {
        Remove-Item -LiteralPath $tmpFile -Force -ErrorAction SilentlyContinue
        Write-Host "FAILED: $($file.FullName)" -ForegroundColor Red
    }
}