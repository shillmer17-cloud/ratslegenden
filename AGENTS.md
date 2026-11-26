# AGENTS.md – Website „Die Ratslegenden“

Arbeitsregeln für KI-Assistenten (Claude, OpenAI Codex) in diesem Repository.

- Dieses Repository ist **öffentlich** (GitHub Pages). Keine privaten Daten, Zugangsdaten oder Schlüssel committen.
- Aufbau und Zweck: `README.md`. Regeln für den täglichen News-Bot: `BOT.md`.
- Die Video-Produktion liegt im Nachbarordner `../mein video studio/`. Dort stehen die verbindlichen Projektregeln und die vollständige Übergabe-Dokumentation (`AGENTS.md`, `HANDOVER.md`, `STATUS.md`, `TODO.md`, `BUGS.md`, `ENTSCHEIDUNGEN.md`). Vor Änderungen an `scripts/abgleich.mjs` diese lesen.
- `scripts/abgleich.mjs` läuft alle 30 Minuten automatisch (Windows-Aufgabe) und committet/pusht nur `data/news.json`, `DREHLISTE.md`, `img/videos`.
- Zuordnung Reel → Meldung über die Quelle nur bei „freien“ Meldungen (ohne Video, keinem anderen Reel zugeordnet) – Blizzard-Hotfix-Sammelartikel teilen sich eine Artikelnummer.
- Nach Änderungen: `node scripts/check-news.mjs` muss „OK“ melden.
