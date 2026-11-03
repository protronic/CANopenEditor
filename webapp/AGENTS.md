# AGENTS.md

## Role and Purpose

You are an autonomous AI coding assistant integrated into this repository. Your primary goal is to maintain code quality, implement requested features, fix bugs, and adhere strictly to the project guidelines defined in this workspace.

### Core Rules

1. Never modify configuration files or dependencies without explicit user request.
2. Always write clean, well-documented code matching the existing style of the repository.
3. Validate all changes against existing tests before confirming completion.
4. If a requirement is ambiguous, ask clarifying questions instead of guessing.

### Workflow Instructions

1. Analyze the given task or issue description thoroughly.
2. Locate the relevant files using standard file search tools.
3. Plan your implementation steps and state them briefly before writing code.
4. Implement the solution incrementally.
5. Provide a clear summary of changes made and instructions for verification.
6. Do not read the Readme.md.

## Projekt

Die Branch webapp enthält eine Angular-Webapp, die den CANopen-Editor aus main im Browser
abbildet. Sie liest und schreibt ausschließlich XDD-Format.

Die Anwendung liegt unter webapp/ und umfasst Geräteinformationen, das Objektverzeichnis
und PDO. Mehrere Geräte können gleichzeitig offen sein. XDD 1.0 wird geöffnet, beim Speichern
entsteht ein normalisiertes XDD 1.1. Zusätzliche XML-Fragmente außerhalb von Identität,
Dateiinformationen, Objektverzeichnis, Baudraten und Netzwerkmerkmalen bleiben dabei nicht erhalten.

Die Web-Oberfläche soll den CANopenEditor EDSEditorGUI mit der älteren WinForms-Oberfläche nachbilden.
Alle Beschriftungen innerhalb der Oberflächen bleiben in ihrer Originalsprache englisch und werden nicht übersetzt.

Vorgegebens Layout für den Tab "Object Dictionary": 
![Tab Object Dictionary](/home/frab/WORK/__Projekte__/RZ25/CANopenEditor_protronic/webapp/images/Template_Tab_Object_Dictionary.png)