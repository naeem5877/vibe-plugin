@echo off
rem Dev installer: enables unsigned panels and links this folder into Premiere's extensions folder.
for %%v in (9 10 11 12) do reg add HKCU\Software\Adobe\CSXS.%%v /v PlayerDebugMode /t REG_SZ /d 1 /f >nul

for %%I in ("%~dp0.") do set "SRC=%%~fI"
set "DEST=%APPDATA%\Adobe\CEP\extensions\com.vibeplugin"

if exist "%DEST%" rmdir "%DEST%"
if not exist "%APPDATA%\Adobe\CEP\extensions" mkdir "%APPDATA%\Adobe\CEP\extensions"
mklink /J "%DEST%" "%SRC%"

echo.
echo Done. Restart Premiere Pro, then open: Window ^> Extensions ^> Vibe Plugin
pause
