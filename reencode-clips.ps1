# Change this to your target folder
$InputFolder = "$PSScriptRoot"

$outDir = Join-Path $InputFolder "_reencoded"
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

Get-ChildItem -Path $InputFolder -Filter "*.mp4" | ForEach-Object {
    $outFile = Join-Path $outDir $_.Name
    Write-Host "Re-encoding: $($_.Name)"
    & ffmpeg -i $_.FullName `
        -c:v libx264 -bf 0 -pix_fmt yuv420p `
        -c:a aac -b:a 192k -ac 2 -ar 44100 `
        -movflags +faststart `
        -y $outFile
    Write-Host "Done: $($_.Name)"
}
