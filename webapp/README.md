# CANopen Editor Web

Angular-Oberfläche für das CANopen-Objektverzeichnis. Sie folgt der Desktop-Anwendung in diesem Repository: Geräteinformationen, Objektverzeichnis und PDO.

Gelesen und geschrieben wird nur das Dateiformat **XDD** (CiA 311). EDS, DCF, XDC, Dokumentation und C-Quelltext werden nicht importiert oder exportiert. XDD 1.0 kann geöffnet werden. Beim Speichern entsteht ein normalisiertes XDD 1.1 mit Geräteidentität, Dateiinformationen, Objektverzeichnis, Baudraten und Netzwerkmerkmalen. Andere XML-Fragmente bleiben dabei nicht erhalten.

```bash
cd webapp
npm install
npm start
```

Die Anwendung läuft dann unter `http://localhost:4200`. Prüfungen des XDD-Lesens und -Schreibens:

```bash
npm test
```

Die Quellen stehen unter der [GNU GPL v3](../License-GPLv3.txt).
