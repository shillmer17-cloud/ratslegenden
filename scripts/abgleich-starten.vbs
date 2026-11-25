' Startet den Website-Abgleich unsichtbar (ohne Konsolenfenster) – wird von der Windows-Aufgabe alle 30 Minuten aufgerufen.
Set sh = CreateObject("WScript.Shell")
ordner = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = ordner & "\.."
sh.Run "node """ & ordner & "\abgleich.mjs""", 0, True
