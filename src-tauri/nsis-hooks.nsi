!macro NSIS_HOOK_POSTINSTALL
  CreateShortCut "$DESKTOP\Imprime+.lnk" "$INSTDIR\Imprime+.exe"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  Delete "$DESKTOP\Imprime+.lnk"
!macroend
