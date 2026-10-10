[CmdletBinding()]
param(
    [switch]$Permanent,
    [switch]$ListAll
)

Add-Type -AssemblyName Microsoft.VisualBasic

$defaultFolder = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
$inputFolder = Read-Host "Folder to process (default: $defaultFolder)"
if (-not $inputFolder.Trim()) { $inputFolder = $defaultFolder }
$inputFolder = (Resolve-Path -LiteralPath $inputFolder).Path

$subDir = Join-Path $inputFolder 'Subtitles'
$thumbDir = Join-Path $inputFolder 'thumbnails'
$videoDir = Join-Path $inputFolder 'videoclips'

function Remove-Orphan {
    param([string]$Path)
    if ($Permanent) {
        Remove-Item -LiteralPath $Path -Force -ErrorAction Stop
    } else {
        [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($Path, 'OnlyErrorDialogs', 'SendToRecycleBin')
    }
}

$videoSet = [System.Collections.Generic.HashSet[string]]::new()
$mp4Count = 0
if (Test-Path -LiteralPath $videoDir) {
    Get-ChildItem -LiteralPath $videoDir -File -Filter *.mp4 | ForEach-Object {
        [void]$videoSet.Add([System.IO.Path]::GetFileNameWithoutExtension($_.Name).ToLower())
        $mp4Count++
    }
} else {
    Write-Host "WARNING: folder not found: $videoDir" -ForegroundColor Yellow
}

$srtAll = if (Test-Path -LiteralPath $subDir) {
    @(Get-ChildItem -LiteralPath $subDir -File -Filter *.srt)
} else {
    Write-Host "WARNING: folder not found: $subDir" -ForegroundColor Yellow
    @()
}

$jpgAll = if (Test-Path -LiteralPath $thumbDir) {
    @(Get-ChildItem -LiteralPath $thumbDir -File -Filter *.jpg)
} else {
    Write-Host "WARNING: folder not found: $thumbDir" -ForegroundColor Yellow
    @()
}

$orphanSrt = @($srtAll | Where-Object {
    $base = [System.IO.Path]::GetFileNameWithoutExtension($_.Name).ToLower()
    $base -ne 'preview' -and -not $videoSet.Contains($base)
})

$orphanJpg = @($jpgAll | Where-Object {
    $base = [System.IO.Path]::GetFileNameWithoutExtension($_.Name).ToLower()
    $base -ne 'preview' -and -not $videoSet.Contains($base)
})

$allOrphans = @($orphanSrt) + @($orphanJpg)

Write-Host ""
Write-Host "Orphan Killer -- $inputFolder" -ForegroundColor Cyan
Write-Host ""
Write-Host ("  videoclips : {0,5} mp4" -f $mp4Count)
Write-Host ("  Subtitles  : {0,5} srt   ({1} orphan)" -f $srtAll.Count, $orphanSrt.Count)
Write-Host ("  thumbnails : {0,5} jpg   ({1} orphan, preview.jpg excluded)" -f $jpgAll.Count, $orphanJpg.Count)
Write-Host "  ---------------------------------------------"
Write-Host ("  TOTAL ORPHANS: {0}" -f $allOrphans.Count)
Write-Host ""

$listPath = if ($PSScriptRoot) { Join-Path $PSScriptRoot 'orphan-list.txt' } else { Join-Path (Get-Location).Path 'orphan-list.txt' }
$allOrphans | ForEach-Object { $_.FullName } | Set-Content -LiteralPath $listPath -Encoding UTF8
Write-Host "Full list written to: $listPath" -ForegroundColor DarkGray
Write-Host ""

if ($allOrphans.Count -gt 0) {
    if ($ListAll) {
        Write-Host "Orphans:"
        $allOrphans | ForEach-Object {
            Write-Host ("  " + $_.FullName.Substring($inputFolder.Length).TrimStart('\'))
        }
    } else {
        Write-Host "Sample (first 12):"
        $allOrphans | Select-Object -First 12 | ForEach-Object {
            Write-Host ("  " + $_.FullName.Substring($inputFolder.Length).TrimStart('\'))
        }
        if ($allOrphans.Count -gt 12) {
            Write-Host ("  ... and {0} more" -f ($allOrphans.Count - 12))
        }
    }
    Write-Host ""

    $verb = if ($Permanent) { 'Permanently delete' } else { 'Move to Recycle Bin' }
    $answer = Read-Host "$verb $($allOrphans.Count) files? (y/N)"
    if ($answer -match '^[Yy]') {
        $ok = 0
        $fail = 0
        $i = 0
        foreach ($file in $allOrphans) {
            $i++
            try {
                Remove-Orphan -Path $file.FullName
                $ok++
            } catch {
                $fail++
                Write-Host "FAILED: $($file.FullName) -- $($_.Exception.Message)" -ForegroundColor Red
            }
            if ($i % 100 -eq 0) { Write-Host ("  ... {0}/{1}" -f $i, $allOrphans.Count) -ForegroundColor DarkGray }
        }
        $past = if ($Permanent) { 'deleted' } else { 'recycled' }
        Write-Host "$past $ok, failed $fail." -ForegroundColor Green
    } else {
        Write-Host "Aborted. No files moved." -ForegroundColor Yellow
    }
} else {
    Write-Host "No orphans found." -ForegroundColor Green
}

Write-Host ""

if (Test-Path -LiteralPath $listPath) {
    try { Remove-Orphan -Path $listPath } catch { Write-Host "Could not remove list: $($_.Exception.Message)" -ForegroundColor Yellow }
}
