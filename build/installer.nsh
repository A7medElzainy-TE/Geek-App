!include "nsDialogs.nsh"
!include "LogicLib.nsh"
Var GeekLicenseInput
Var GeekLicenseStatus
Var GeekActivationFile

!macro customHeader
  Page custom GeekLicensePage GeekLicenseLeave
!macroend

!macro customInit
  InitPluginsDir
  File /oname=$PLUGINSDIR\geek-activate.ps1 "${BUILD_RESOURCES_DIR}\activate.ps1"
  StrCpy $GeekActivationFile "$PLUGINSDIR\geek-license.json"
!macroend

Function GeekLicensePage
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 26u "تفعيل Geek POS"
  Pop $0
  CreateFont $1 "Tahoma" 12 700
  SendMessage $0 ${WM_SETFONT} $1 1
  ${NSD_CreateLabel} 0 34u 100% 28u "أدخل مفتاح التفعيل الأصلي. يلزم الاتصال بالإنترنت لهذه الخطوة فقط ولن يبدأ التثبيت قبل نجاح التفعيل."
  Pop $0
  ${NSD_CreateText} 0 70u 100% 14u ""
  Pop $GeekLicenseInput
  ${NSD_CreateLabel} 0 94u 100% 30u "في حالة عدم امتلاك مفتاح صالح، تواصل مع الإدارة المالكة للتطبيق لشراء نسخة."
  Pop $GeekLicenseStatus
  nsDialogs::Show
FunctionEnd

Function GeekLicenseLeave
  ${NSD_GetText} $GeekLicenseInput $0
  ${If} $0 == ""
    MessageBox MB_ICONEXCLAMATION|MB_OK "أدخل مفتاح التفعيل أولاً."
    Abort
  ${EndIf}
  nsExec::ExecToStack 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\geek-activate.ps1" -LicenseKey "$0" -OutputFile "$GeekActivationFile"'
  Pop $1
  Pop $2
  ${If} $1 != 0
    MessageBox MB_ICONSTOP|MB_OK "تعذر تفعيل النسخة.$\r$\n$\r$\n$2$\r$\n$\r$\nتواصل مع الإدارة المالكة للتطبيق لشراء نسخة أو مراجعة المفتاح."
    Abort
  ${EndIf}
FunctionEnd

!macro customInstall
  SetShellVarContext all
  CreateDirectory "$COMMONAPPDATA\Geek POS"
  CopyFiles /SILENT "$GeekActivationFile" "$COMMONAPPDATA\Geek POS\license.json"
!macroend
