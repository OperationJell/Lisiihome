!macro customInstall
  CreateShortCut "$SMPROGRAMS\LISII HOME Server.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "--server"
!macroend
!macro customUnInstall
  Delete "$SMPROGRAMS\LISII HOME Server.lnk"
!macroend
