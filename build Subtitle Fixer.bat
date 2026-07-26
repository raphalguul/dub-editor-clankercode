@echo off
echo ===================================
echo  Subtitle Gap Fixer - Build Script
echo ===================================
echo.

echo Installing dependencies...
pip install -r requirements-gui.txt
if %ERRORLEVEL% neq 0 (
    echo Failed to install dependencies.
    pause
    exit /b 1
)

echo.
echo Building exe with PyInstaller...
pyinstaller ^
    --onefile ^
    --windowed ^
    --name "SubtitleGapFixer" ^
    --clean ^
    fix_subtitles_gui.py

if %ERRORLEVEL% neq 0 (
    echo Build failed.
    pause
    exit /b 1
)

echo.
echo ===================================
echo  Build complete!
echo  Output: dist\SubtitleGapFixer.exe
echo ===================================
pause
