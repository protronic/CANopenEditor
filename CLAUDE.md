# Hinweise für Claude

## Projekt
Fork von CANopenNode/CANopenEditor, gepflegt von Protronic: Editor für
CANopen-Objektverzeichnisse (EDS/DCF/XDD) und Generator für CANopenNode-Quellcode.
Halte dich an `CONTRIBUTING.md` (u. a.: keine reinen Refactorings, nur geänderten
Code umformatieren, Änderungen testen, komplexe Stellen und Magic Numbers kommentieren).

| Projekt | Inhalt | Ziel-Frameworks |
|---|---|---|
| `libEDSsharp/` | Kernbibliothek: Parser, Modell, Exporter | net481; net8.0 |
| `EDSSharp/` | Kommandozeilen-Konverter | net481; net8.0 |
| `EDSEditorGUI/` | klassische WinForms-GUI (nur Windows) | net481; net8.0-windows |
| `EDSEditorGUI2/` | neue Avalonia-GUI (plattformübergreifend) | net8.0 |
| `Tests/` | xUnit-Tests für libEDSsharp und CLI | net481; net8.0 |
| `GUITests/` | Headless-Tests für EDSEditorGUI2 | net8.0 |

`demo/` enthält Beispiele für Firmware-Projekte; deren `AGENTS.md` gilt nur dort.

## Befehle (Linux, .NET 8)
- Tests: `dotnet test Tests/Tests.csproj -p:BuildNet8=true -f net8.0`
- CLI bauen: `dotnet build EDSSharp/EDSSharp.csproj -p:BuildNet8=true -f net8.0`
- Avalonia-GUI: `dotnet build EDSEditorGUI2/EDSEditorGUI2.csproj -p:BuildNet8=true`
- GUI-Tests: `dotnet test GUITests/GUITests.csproj -p:BuildNet8=true`

Ohne `-p:BuildNet8=true` wird auch net481 gebaut, was unter Linux scheitert.
`EDSEditorGUI` (WinForms) und `EditorRegressionTests` lassen sich unter Linux nicht
bauen; sie werden am PR vom Windows-Workflow `.github/workflows/dotnet.yml` geprüft.
Wenn du dort etwas änderst, weise im PR ausdrücklich darauf hin.

## Arbeiten über GitHub (@claude in Issues/PRs)
- Antworte in Issues und PRs auf Deutsch.
- Nie direkt auf `main` pushen. Änderungen nur auf dem eigenen `claude/...`-Branch;
  gemergt wird nach Review durch einen Menschen.
- Ist eine Anforderung unklar, stelle die Rückfrage als Kommentar im Issue, statt
  zu raten.
- Vor dem Push die passenden Tests/Builds von oben ausführen und das Ergebnis im
  Kommentar nennen. Neue Logik in `libEDSsharp` bekommt Tests in `Tests/`.
- Keine neuen NuGet-Pakete und keine Änderungen an Workflows, Release-Skripten
  (`create_release_packages.ps1`, `setup.nsi`, `RELEASE_TAG`) oder Solution-Dateien,
  außer das Issue verlangt es ausdrücklich.
- Änderungen sollen sich möglichst sauber nach upstream (CANopenNode/CANopenEditor)
  zurückspielen lassen: keine protronic-spezifischen Anpassungen in gemeinsam
  genutzten Code mischen, ohne das im PR zu erwähnen.
