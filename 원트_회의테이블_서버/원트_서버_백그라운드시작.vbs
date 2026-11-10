Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = scriptDir
WshShell.Run "python server.py", 0, False
WshShell.Popup "원트부동산 네이버 연동 서버가 백그라운드에서 정상 실행되었습니다." & vbCrLf & vbCrLf & "이 창은 5초 후 자동으로 닫히며 백그라운드에서 계속 유지됩니다.", 5, "원트부동산 서버", 64
