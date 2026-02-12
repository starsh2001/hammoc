@echo off
REM Generate queue list from sharded PRD
REM Usage: generate-queue.bat [prd-file] [template-file] [output-file]

setlocal

set "PRD_FILE=%~1"
set "TEMPLATE_FILE=%~2"
set "OUTPUT_FILE=%~3"

set "ARGS="
if not "%PRD_FILE%"=="" set "ARGS=-PrdFile "%PRD_FILE%""
if not "%TEMPLATE_FILE%"=="" set "ARGS=%ARGS% -TemplateFile "%TEMPLATE_FILE%""
if not "%OUTPUT_FILE%"=="" set "ARGS=%ARGS% -OutputFile "%OUTPUT_FILE%""

powershell -ExecutionPolicy Bypass -File "%~dp0generate-queue.ps1" %ARGS%

endlocal
