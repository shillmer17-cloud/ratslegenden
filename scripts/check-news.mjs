// Prüft data/news.json: gültiges JSON, Pflichtfelder, erlaubte Tags, Datum, Quellen-Links, Duplikate.
// Aufruf: node scripts/check-news.mjs   (Exit-Code 0 = alles ok, 1 = Fehler)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "news.json");
const TAGS = ["Forever", "Patch", "Event", "Stream", "Gilde", "Video"];
const FIELDS = ["date", "tag", "title", "text", "source"];
const OPTIONAL = ["video"]; // "" = noch nicht verfilmt, Link = fertiges Blizznews-Video

const errors = [];
let data;
try {
  data = JSON.parse(readFileSync(FILE, "utf8").replace(/^﻿/, ""));
} catch (e) {
  console.error(`FEHLER: data/news.json ist kein gültiges JSON: ${e.message}`);
  process.exit(1);
}

if (!Array.isArray(data)) {
  console.error("FEHLER: data/news.json muss ein Array [ ... ] sein.");
  process.exit(1);
}

const seenTitles = new Map();
const seenSources = new Map();
const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();

data.forEach((n, i) => {
  const where = `Eintrag ${i + 1}`;
  if (!n || typeof n !== "object" || Array.isArray(n)) {
    errors.push(`${where}: ist kein Objekt.`);
    return;
  }
  for (const f of FIELDS) {
    if (!(f in n)) errors.push(`${where}: Feld "${f}" fehlt.`);
    else if (typeof n[f] !== "string") errors.push(`${where}: Feld "${f}" muss Text sein.`);
  }
  for (const f of ["date", "tag", "title", "text"]) {
    if (typeof n[f] === "string" && !n[f].trim()) errors.push(`${where}: Feld "${f}" ist leer.`);
  }
  if ("video" in n) {
    if (typeof n.video !== "string") errors.push(`${where}: Feld "video" muss Text sein (leer oder Link).`);
    else if (n.video) {
      let ok = false;
      try { ok = ["http:", "https:"].includes(new URL(n.video).protocol); } catch {}
      if (!ok) errors.push(`${where}: Video "${n.video}" ist kein gültiger http(s)-Link.`);
    }
  }
  const extra = Object.keys(n).filter((k) => !FIELDS.includes(k) && !OPTIONAL.includes(k));
  if (extra.length) errors.push(`${where}: unbekannte Felder: ${extra.join(", ")}.`);

  if (typeof n.date === "string") {
    const d = new Date(n.date + "T00:00:00Z");
    const ok = /^\d{4}-\d{2}-\d{2}$/.test(n.date) && !isNaN(d) && d.toISOString().slice(0, 10) === n.date;
    if (!ok) errors.push(`${where}: Datum "${n.date}" ist nicht im Format YYYY-MM-DD oder ungültig.`);
  }
  if (typeof n.tag === "string" && n.tag && !TAGS.includes(n.tag)) {
    errors.push(`${where}: Tag "${n.tag}" ist nicht erlaubt (erlaubt: ${TAGS.join(", ")}).`);
  }
  if (typeof n.source === "string" && n.source) {
    let ok = false;
    try { ok = ["http:", "https:"].includes(new URL(n.source).protocol); } catch {}
    if (!ok) errors.push(`${where}: Quelle "${n.source}" ist kein gültiger http(s)-Link.`);
  }

  if (typeof n.title === "string" && n.title.trim()) {
    const t = norm(n.title);
    if (seenTitles.has(t)) errors.push(`${where}: gleicher Titel wie Eintrag ${seenTitles.get(t)} (doppelt?).`);
    else seenTitles.set(t, i + 1);
  }
  if (typeof n.source === "string" && n.source.trim()) {
    const s = n.source.trim().replace(/\/+$/, "");
    if (seenSources.has(s)) errors.push(`${where}: gleiche Quelle wie Eintrag ${seenSources.get(s)} (doppelt?).`);
    else seenSources.set(s, i + 1);
  }
});

if (errors.length) {
  console.error(`data/news.json hat ${errors.length} Fehler:`);
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(`OK: data/news.json ist gültig (${data.length} Einträge).`);
