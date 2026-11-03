; Ollama is a per-user application. Keep both installers in the same user context.
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

!macro customInstall
  SetDetailsPrint both
  DetailPrint "Setting up Ollama. Internet required; download is 1.68 GB."
  SetOutPath "$PLUGINSDIR"
  File /oname=install-ollama.ps1 "${PROJECT_DIR}/scripts/install-ollama.ps1"
  ollama_retry:
  ; No timeout: the download can take several minutes on a slow connection.
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\install-ollama.ps1"'
  Pop $0
  ${If} $0 != 0
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Ollama setup failed. Check your internet connection and free disk space. Log: $TEMP\Petya-Ollama-install.log" /SD IDCANCEL IDRETRY ollama_retry
    SetErrorLevel 1
    Abort
  ${EndIf}
  SetOutPath "$INSTDIR"
!macroend
