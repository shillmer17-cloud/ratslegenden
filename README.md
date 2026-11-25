# Die Ratslegenden – Stream- und Gildenseite

Statische Website für den WoW-Forever-Stream und die Horde-Gilde „Die Ratslegenden“.
Gehostet mit GitHub Pages, News werden täglich von einem Bot ergänzt.

## Aufbau

| Datei | Zweck |
|---|---|
| `index.html` | Die komplette Seite (Design, Streamplan, Gilde, Kooperation, Setup) |
| `data/news.json` | Alle News; die Seite zeigt die neuesten 30 |
| `BOT.md` | Regeln für den täglichen News-Bot |
| `DREHLISTE.md` | Spickzettel für „Evils Blizznews“: alle noch nicht verfilmten Meldungen mit Stichpunkten |
| `scripts/check-news.mjs` | Prüft `data/news.json` auf gültiges JSON und Pflichtfelder |
| `.github/workflows/pages.yml` | Veröffentlicht die Seite bei jedem Push auf `main` |

## Lokal ansehen

Im Projektordner ausführen und dann http://localhost:8000 im Browser öffnen:

```
python -m http.server 8000
```

(Ein Doppelklick auf `index.html` reicht nicht, weil der Browser `data/news.json` dann nicht laden darf.)

## News von Hand eintragen

Einen Eintrag an `data/news.json` anhängen und prüfen:

```json
{ "date": "2026-11-24", "tag": "Stream", "title": "Titel", "text": "Zwei bis vier Sätze.", "source": "" }
```

```
node scripts/check-news.mjs
```

Erlaubte Tags: `Forever`, `Patch`, `Event`, `Stream`, `Gilde`, `Video`. `source` ist ein Link oder leer.

Optional `video`: `""` = noch nicht verfilmt (Website zeigt „Video folgt“), ein Link = fertiges Video (Website zeigt „Zum Video“).
Nach dem Dreh einfach den Video-Link bei der Meldung eintragen; der Bot nimmt sie dann aus der Drehliste.

## Veröffentlichen

Jeder Push auf `main` veröffentlicht die Seite automatisch (Reiter „Actions“ auf GitHub zeigt den Fortschritt).
Ist `data/news.json` fehlerhaft, bricht die Veröffentlichung ab und die alte Version bleibt online.

## Automatischer Abgleich mit den Videos (alle 30 Minuten)

`scripts/abgleich.mjs` läuft über die Windows-Aufgabe „Ratslegenden Website-Abgleich“ (unsichtbar gestartet von `scripts/abgleich-starten.vbs`):

- liest `abgleich/reels.json` (schreibt das Video-Studio beim Ablegen in „Heute hochladen“; nicht im Repository),
- prüft das TikTok-Profil @sheeviltv und ordnet die Reels zu (erste Zeile der Beschreibung oder Videolänge),
- legt für jedes Reel einen Eintrag in `data/news.json` an oder findet die Meldung über die Quelle und trägt den TikTok-Link ins Feld `video` ein,
- entfernt verfilmte Meldungen aus `DREHLISTE.md`, prüft mit `check-news.mjs`, committet und pusht,
- hält „Heute hochladen“ (Unterordner News/Tipps) auf die Videos des Tages beschränkt und schreibt `abgleich/Status.txt`.

Von Hand testen ohne Veröffentlichung: `node scripts/abgleich.mjs --ohne-push`. Protokoll: `abgleich/abgleich.log`.
