# UML-Modell der Webapp

Dieses Verzeichnis überträgt die Angular-Webapp unter `webapp/src/` in die Unified Modeling Language (UML 2). Die Diagramme liegen als [PlantUML](https://plantuml.com/) vor und beschreiben den gebauten Stand. Die verbindliche Verhaltensbeschreibung bleibt `webapp/GUIDANCE.md`; die Diagramme bilden die Struktur und die Abläufe des Codes ab.

Die Typen heißen wie im TypeScript-Code. Erläuterungen in den Diagrammen sind Deutsch. TypeScript-Interfaces mit Zustand sind als Klassen modelliert, weil sie Daten tragen und keine Verhaltensschnittstellen sind. Modulweite Funktionen sind als Klasse mit dem Stereotyp `«module»` und statischen Operationen zusammengefasst.

## Diagramme

| Datei | UML-Diagramm | Inhalt |
|-------|----------------|--------|
| `01-anwendungsfaelle.puml` | Anwendungsfall | Was die Nutzerin oder der Nutzer mit der App tut |
| `02-komponenten.puml` | Komponente | Angular-Komponenten, Dienste und Fachmodule und ihre Abhängigkeiten |
| `03-pakete.puml` | Paket | Zuordnung der Dateien zu Paketen |
| `04-domaenenmodell.puml` | Klasse | `DeviceDocument`, `OdEntry` und die Aufzählungen des Objektverzeichnisses |
| `05-pdo-modell.puml` | Klasse | PDO-Slots, Mapping, COB-ID, Entwurf und die abgeleiteten Sichten |
| `06-klassen-sichten-und-dienste.puml` | Klasse | Shell, vier Tabs, Dialoge und die vier Dienste |
| `07-sequenz-projekt.puml` | Sequenz | Neues Projekt, Öffnen, Speichern und Schließen |
| `08-sequenz-object-dictionary.puml` | Sequenz | Entwurf, Apply, Objekt anlegen, Reset all |
| `09-sequenz-pdo.puml` | Sequenz | PDO-Entwurf, Zuordnen, Apply und Tab-Konflikt |
| `10-sequenz-profil-clone.puml` | Sequenz | Profil einfügen und Objekte klonen |
| `11-zustand-entwurf.puml` | Zustandsautomat | Ungespeicherte Änderungen im Object Dictionary und im PDO-Tab |
| `12-zustand-dialog.puml` | Zustandsautomat | Warteschlange der Meldungsfenster |
| `13-aktivitaet-apply.puml` | Aktivität | Apply im PDO-Tab und die Granularitätsprüfung |
| `14-verteilung.puml` | Verteilung | Alles läuft im Browser, ohne Server |

## Lesen ohne Werkzeug

Die `.puml`-Dateien sind Text. Jede Datei ist ein Diagramm zwischen `@startuml` und `@enduml`. Beziehungen:

- durchgezogene Linie mit gefüllter Raute: Komposition (Teil lebt mit dem Ganzen)
- durchgezogene Linie mit Pfeil: Abhängigkeit oder Aufruf
- gestrichelte Linie mit weißem Pfeil: Realisierung oder «include» / «extend»
- `+` öffentlich, `-` privat

## Bilder

`bilder/` enthält die aus den `.puml`-Dateien erzeugten SVG-Dateien. Die Quelle sind die `.puml`-Dateien. Neu erzeugen, mit PlantUML und Graphviz:

```bash
cd webapp/UML
plantuml -tsvg -o bilder *.puml
```

Zustands- und Verteilungsdiagramme brauchen Graphviz (`dot`). Die übrigen Diagramme nutzen die Layout-Engine Smetana (`!pragma layout smetana`).
