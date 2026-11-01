@echo off
setlocal
set "HERE=%~dp0"
set "NODE=node"

where node >nul 2>nul
if errorlevel 1 (
  if exist "%USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe" (
    set "NODE=%USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
  ) else if exist "C:\Program Files\nodejs\node.exe" (
    set "NODE=C:\Program Files\nodejs\node.exe"
  ) else (
    echo [error] Node.js not found. Install Node 22.9+ from https://nodejs.org
    exit /b 1
  )
)

"%NODE%" --env-file-if-exists="%HERE%.env" --experimental-strip-types "%HERE%pipeline\cli.ts" %*
