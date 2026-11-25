// Abgleich zwischen "Heute hochladen" (Video-Studio), TikTok und der Website – läuft alle 30 Minuten
// (Windows-Aufgabe "Ratslegenden Website-Abgleich", gestartet über scripts/abgleich-starten.vbs).
//
// Ablauf:
//  1. git pull (neuester Stand, auch vom News-Bot)
//  2. abgleich/reels.json lesen – schreibt das Video-Studio (scripts/hochladen.mjs) beim Ablegen der Reels
//  3. TikTok-Profil @sheeviltv prüfen (öffentliches Profil-Embed): welche Reels sind schon hochgeladen?
//     Zuordnung über die erste Zeile der Beschreibung (Titel/Akzent) oder – eindeutig – über die Videolänge.
//  4. data/news.json: jedes Reel bekommt einen Eintrag (vorhandene Meldung über die Quelle finden, sonst neu anlegen);
//     sobald das TikTok-Video da ist, wird der Link ins Feld "video" eingetragen ("Zum Video").
//     Verfilmte Meldungen verschwinden aus DREHLISTE.md.
//  5. Prüfen (check-news.mjs), committen, pushen → GitHub Pages aktualisiert die Seite.
//  6. "Heute hochladen" aufräumen: Dateien von gestern und älter löschen (nur Kopien; Originale liegen im Video-Studio).
//     Statusdatei "Heute hochladen/Status.txt": was ist schon auf TikTok, was fehlt noch.
//
// Aufruf von Hand: node scripts/abgleich.mjs [--ohne-push]
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HEUTE = path.join(os.homedir(), "Desktop", "Heute hochladen");
const DIR = path.join(WEB, "abgleich");
const REELS = path.join(DIR, "reels.json");
const TT_CACHE = path.join(DIR, "tiktok.json");
const LOG = path.join(DIR, "abgleich.log");
const LOCK = path.join(DIR, "abgleich.lock");
const NEWS = path.join(WEB, "data", "news.json");
const DREH = path.join(WEB, "DREHLISTE.md");
const KANAL = "sheeviltv";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
const OHNE_PUSH = process.argv.includes("--ohne-push");
const REELS_BEHALTEN_TAGE = 7; // so lange werden spät hochgeladene Reels noch zugeordnet

fs.mkdirSync(DIR, { recursive: true });
const berlin = (d = new Date()) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" }).format(d);
const heute = berlin().slice(0, 10);
const logZeilen = [];
const log = (s) => { logZeilen.push(s); console.log(s); };
const schreibeLog = () => {
  const alt = fs.existsSync(LOG) ? fs.readFileSync(LOG, "utf8").split("\n").filter(Boolean) : [];
  const neu = [...alt, `=== ${berlin()} ===`, ...logZeilen].slice(-600);
  fs.writeFileSync(LOG, neu.join("\n") + "\n");
};

// Nur ein Lauf gleichzeitig (veraltete Sperre nach 20 min ignorieren)
if (fs.existsSync(LOCK) && Date.now() - fs.statSync(LOCK).mtimeMs < 20 * 60e3) { console.log("Läuft bereits."); process.exit(0); }
fs.writeFileSync(LOCK, String(process.pid));

const git = (...a) => execFileSync("git", a, { cwd: WEB, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const lies = (f, fallback) => { try { return JSON.parse(fs.readFileSync(f, "utf8").replace(/^﻿/, "")); } catch { return fallback; } };
const norm = (s) => s.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, " ").trim();
const ttLink = (id) => `https://www.tiktok.com/@${KANAL}/video/${id}`;
const ttZeit = (id) => new Date(Number(BigInt(id) >> 32n) * 1000); // TikTok-IDs enthalten den Upload-Zeitpunkt
const tagStart = (datum) => new Date(`${datum}T00:00:00+01:00`);

async function main() {
  // 1. neuester Stand
  let pullOk = true;
  try { git("pull", "--ff-only", "--quiet"); } catch (e) { pullOk = false; log(`WARNUNG git pull: ${String(e.stderr || e).trim().split("\n")[0]}`); }

  // 2. Reels aus dem Video-Studio
  const abgleich = lies(REELS, { reels: [] });
  const grenze = new Date(tagStart(heute) - REELS_BEHALTEN_TAGE * 864e5);
  abgleich.reels = abgleich.reels.filter((r) => tagStart(r.datum) >= grenze);

  // 3. TikTok
  const cache = lies(TT_CACHE, {});
  let videos = [];
  try {
    const r = await fetch(`https://www.tiktok.com/embed/@${KANAL}`, { headers: { "user-agent": UA } });
    const html = await r.text();
    const m = html.match(/<script id="__FRONTITY_CONNECT_STATE__"[^>]*>([\s\S]*?)<\/script>/);
    const liste = m ? JSON.parse(m[1])?.source?.data?.[`/embed/@${KANAL}`]?.videoList : null;
    if (!Array.isArray(liste)) throw new Error(`Videoliste nicht gefunden (HTTP ${r.status})`);
    videos = liste.filter((v) => /^\d{15,}$/.test(v.id)).map((v) => ({ id: v.id, desc: v.desc || "", play: v.playAddr, zeit: ttZeit(v.id) }));
    log(`TikTok: ${videos.length} neueste Videos gelesen.`);
  } catch (e) { log(`WARNUNG TikTok nicht erreichbar: ${e.message} – nächster Versuch in 30 Minuten.`); }

  const dauerTT = (v) => {
    if (cache[v.id]?.dauer) return cache[v.id].dauer;
    if (!v.play) return null;
    try {
      const d = Number(execFileSync("ffprobe", ["-v", "error", "-user_agent", UA, "-headers", "Referer: https://www.tiktok.com/\r\n",
        "-show_entries", "format=duration", "-of", "csv=p=0", v.play], { timeout: 45000 }).toString().trim());
      if (d > 0) { cache[v.id] = { dauer: d, desc: v.desc.slice(0, 120) }; return d; }
    } catch {}
    return null;
  };

  const news = lies(NEWS, null);
  if (!Array.isArray(news)) { log("FEHLER: data/news.json nicht lesbar – Abbruch."); return; }
  const belegt = new Set([...abgleich.reels.map((r) => r.tiktok), ...news.map((n) => n.video)].filter(Boolean).map((l) => l.match(/(\d{15,})/)?.[1]));

  for (const reel of abgleich.reels.filter((r) => !r.tiktok)) {
    const marke = reel.reihe === "news" ? "EVILS BLIZZNEWS" : "EVILS BLIZZTIPPS";
    const kandidaten = videos.filter((v) => !belegt.has(v.id) && v.zeit >= tagStart(reel.datum) && v.desc.includes(marke));
    // a) erste Zeile der Beschreibung (vor dem festen Block) passt zu Titel/Akzent
    const woerter = norm(`${reel.titel} ${reel.akzent}`).split(" ").filter((w) => w.length >= 3);
    const perText = kandidaten.filter((v) => {
      const kopf = norm(v.desc.split(/🔥|💡/)[0]);
      if (!kopf || !woerter.length) return false;
      return woerter.filter((w) => kopf.includes(w)).length / woerter.length >= 0.6;
    });
    // b) Videolänge (TikTok rechnet leicht um, daher ±0,35 s)
    const perLaenge = reel.dauer ? kandidaten.filter((v) => { const d = dauerTT(v); return d && Math.abs(d - reel.dauer) <= 0.35; }) : [];
    let treffer = null, wie = "";
    if (perText.length === 1) { treffer = perText[0]; wie = "Beschreibung"; }
    else if (perLaenge.length === 1) { treffer = perLaenge[0]; wie = "Videolänge"; }
    else if (perText.length > 1 || perLaenge.length > 1) log(`HINWEIS ${reel.id}: mehrere TikTok-Videos passen – bitte Link von Hand nennen.`);
    if (treffer) {
      reel.tiktok = ttLink(treffer.id);
      belegt.add(treffer.id);
      log(`TikTok gefunden: ${reel.id} „${reel.titel}: ${reel.akzent}“ → ${reel.tiktok} (über ${wie})`);
    }
  }

  // 4. Website-Einträge
  const vorher = JSON.stringify(news, null, 2);
  const urlKern = (u) => u.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/[?#].*$/, "").replace(/\/+$/, "")
    .replace(/(\/t\/[^/]+\/\d+)\/\d+$/, "$1"); // Forenlink auf einen bestimmten Beitrag → Thema
  const nummern = (u) => (u.match(/\d{6,}/g) || []);
  for (const reel of abgleich.reels) {
    let eintrag = reel.website ? news.find((n) => n.title === reel.website) : null;
    if (!eintrag && reel.tiktok) eintrag = news.find((n) => n.video === reel.tiktok);
    if (!eintrag && reel.quellen?.length) {
      const kerne = new Set(reel.quellen.map(urlKern));
      const nrs = new Set(reel.quellen.flatMap(nummern));
      eintrag = news.find((n) => n.source && kerne.has(urlKern(n.source)))
        ?? news.find((n) => n.source && tagStart(n.date) >= new Date(tagStart(reel.datum) - 3 * 864e5) && nummern(n.source).some((x) => nrs.has(x)));
    }
    if (!eintrag) {
      let titel = `${reel.titel}: ${reel.akzent}`;
      if (news.some((n) => norm(n.title) === norm(titel))) titel += ` (${reel.datum.slice(8, 10)}.${reel.datum.slice(5, 7)}.)`;
      const saetze = reel.sprechtext.split("\n").map((s) => s.trim()).filter(Boolean);
      let text = "";
      for (const s of saetze) { if ((text + " " + s).length > 420 || text.split(/[.!?]/).length > 4) break; text = (text + " " + s).trim(); }
      const quellen = (reel.quellen || []).filter((q) => !q.includes("akamaihd.net") && !/\.pdf$/i.test(q));
      const quelle = quellen.find((q) => !news.some((n) => urlKern(n.source || "") === urlKern(q))) || "";
      eintrag = { date: reel.datum, tag: reel.reihe === "news" ? "Forever" : "Video", title: titel, text, source: quelle, video: "" };
      news.push(eintrag);
      log(`Website: neuer Eintrag „${titel}“ (${reel.id})`);
    }
    reel.website = eintrag.title;
    if (reel.tiktok && !eintrag.video) { eintrag.video = reel.tiktok; log(`Website: Video-Link bei „${eintrag.title}“ eingetragen.`); }
    else if (reel.tiktok && eintrag.video && eintrag.video !== reel.tiktok) log(`HINWEIS: „${eintrag.title}“ hat schon einen anderen Video-Link – nicht geändert.`);
  }

  // Drehliste: verfilmte Meldungen entfernen
  let dreh = fs.existsSync(DREH) ? fs.readFileSync(DREH, "utf8") : null;
  const drehVorher = dreh;
  if (dreh) {
    const fertig = new Set(news.filter((n) => n.video).map((n) => norm(n.title)));
    const teile = dreh.split(/\n(?=## )/);
    dreh = teile.filter((t, i) => {
      if (i === 0 || !t.startsWith("## ")) return true;
      const titel = t.split("\n")[0].split(" · ").slice(2).join(" · ");
      return !fertig.has(norm(titel));
    }).join("\n");
    if (dreh !== drehVorher) dreh = dreh.replace(/^Stand: \d{4}-\d{2}-\d{2}/m, `Stand: ${heute}`);
  }

  // 5. Prüfen, committen, pushen
  const nachher = JSON.stringify(news, null, 2);
  const geaendert = nachher !== vorher || dreh !== drehVorher;
  if (geaendert) {
    fs.writeFileSync(NEWS, nachher + "\n");
    if (dreh !== drehVorher) fs.writeFileSync(DREH, dreh);
    let ok = false;
    try { ok = execFileSync(process.execPath, [path.join(WEB, "scripts", "check-news.mjs")], { cwd: WEB, encoding: "utf8" }).startsWith("OK:"); } catch {}
    if (!ok) {
      log("FEHLER: check-news.mjs meldet Fehler – Änderungen verworfen.");
      try { git("checkout", "--", "data/news.json", "DREHLISTE.md"); } catch {}
      for (const r of abgleich.reels) if (!news.some((n) => n.title === r.website)) delete r.website;
    } else if (OHNE_PUSH || !pullOk) {
      log(OHNE_PUSH ? "Geändert (ohne Push, Testlauf)." : "Geändert, aber nicht gepusht (git pull fehlgeschlagen) – nächster Lauf versucht es erneut.");
    } else {
      try {
        git("add", "data/news.json", "DREHLISTE.md");
        git("commit", "-m", `Videos abgeglichen ${berlin()}`, "-m", "Automatischer Abgleich: Heute hochladen + TikTok (scripts/abgleich.mjs)");
        git("push", "--quiet");
        log("Website aktualisiert (Commit + Push).");
      } catch (e) { log(`WARNUNG git commit/push: ${String(e.stderr || e).trim().split("\n")[0]} – nächster Lauf versucht es erneut.`); }
    }
  } else log("Website: nichts zu ändern.");

  // 6. "Heute hochladen" aufräumen + Status
  if (fs.existsSync(HEUTE)) {
    let weg = 0;
    for (const dir of [HEUTE, path.join(HEUTE, "News"), path.join(HEUTE, "Tipps")]) {
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir)) {
        const m = f.match(/^(\d{4}-\d{2}-\d{2}) .+\.(mp4|txt)$/);
        if (m && m[1] < heute) { fs.rmSync(path.join(dir, f)); weg++; }
      }
    }
    if (weg) log(`Heute hochladen: ${weg} Dateien von gestern/älter gelöscht.`);
    const zeilen = [`Stand: ${berlin()} (wird alle 30 Minuten aktualisiert)`, ""];
    const heutige = abgleich.reels.filter((r) => r.datum === heute);
    if (!heutige.length) zeilen.push("Heute noch keine Reels abgelegt.");
    for (const r of heutige) zeilen.push(`${r.tiktok ? "✓ auf TikTok" : "✗ noch nicht auf TikTok"}  ${r.reihe === "news" ? "News" : "Tipps"} ${r.nummer}: ${r.titel} – ${r.akzent}${r.tiktok ? "  " + r.tiktok : ""}`);
    const offen = abgleich.reels.filter((r) => r.datum < heute && !r.tiktok);
    if (offen.length) zeilen.push("", "Ältere Reels ohne TikTok-Video:", ...offen.map((r) => `✗ ${r.datum} ${r.titel} – ${r.akzent}`));
    // Jede Website-News soll ein Video bekommen: News ohne Video und ohne abgelegtes Reel auflisten
    const mitReel = new Set(abgleich.reels.map((r) => r.website).filter(Boolean));
    const ohneVideo = news.filter((n) => n.video === "" && !mitReel.has(n.title) && ["Forever", "Patch", "Event"].includes(n.tag));
    if (ohneVideo.length) {
      zeilen.push("", "Website-News ohne Video (brauchen noch ein Reel):", ...ohneVideo.map((n) => `• ${n.date} ${n.title}`));
      log(`Website-News ohne Video/Reel: ${ohneVideo.length}`);
    }
    zeilen.push("", "Website: https://shillmer17-cloud.github.io/ratslegenden/ · Protokoll: website/abgleich/abgleich.log");
    fs.writeFileSync(path.join(HEUTE, "Status.txt"), zeilen.join("\r\n") + "\r\n");
  }

  fs.writeFileSync(REELS, JSON.stringify(abgleich, null, 2) + "\n");
  fs.writeFileSync(TT_CACHE, JSON.stringify(cache, null, 2) + "\n");
}

try { await main(); }
catch (e) { log(`FEHLER: ${e.stack || e}`); process.exitCode = 1; }
finally { schreibeLog(); fs.rmSync(LOCK, { force: true }); }
