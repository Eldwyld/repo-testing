@echo off
title JOI Forge (offline)
rem Starts a local-only server for the offline build and opens your browser.
rem Close this window to stop JOI Forge.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
if errorlevel 1 pause
