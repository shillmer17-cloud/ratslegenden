// Vorschaubilder für die Videos in data/news.json: img/videos/<TikTok-ID>.webp
// Die Website zeigt das Bild als Video-Karte; TikTok selbst wird erst beim Klick auf „Abspielen“ geladen.
// Wird von scripts/abgleich.mjs aufgerufen; von Hand: node scripts/video-cover.mjs
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ZIEL = path.join(WEB, "img", "videos");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";

/** Liest die neuesten Videos des Profils (öffentliches Profil-Embed) mit Vorschaubild-Adresse. */
export async function profilVideos(kanal = "sheeviltv") {
  const r = await fetch(`https://www.tiktok.com/embed/@${kanal}`, { headers: { "user-agent": UA } });
  const html = await r.text();
  const m = html.match(/<script id="__FRONTITY_CONNECT_STATE__"[^>]*>([\s\S]*?)<\/script>/);
  const liste = m ? JSON.parse(m[1])?.source?.data?.[`/embed/@${kanal}`]?.videoList : null;
  if (!Array.isArray(liste)) throw new Error(`Videoliste nicht gefunden (HTTP ${r.status})`);
  return liste.filter((v) => /^\d{15,}$/.test(v.id)).map((v) => ({ id: v.id, desc: v.desc || "", play: v.playAddr, cover: v.originCoverUrl || v.coverUrl || "" }));
}

/** Lädt fehlende Vorschaubilder. videos = Liste aus profilVideos(). Gibt die neu angelegten Dateien zurück. */
export async function holeCovers(news, videos, log = console.log) {
  fs.mkdirSync(ZIEL, { recursive: true });
  const nachId = new Map(videos.map((v) => [v.id, v]));
  const neu = [];
  for (const n of news) {
    const id = typeof n.video === "string" ? n.video.match(/tiktok\.com\/.*video\/(\d{15,})/)?.[1] : null;
    if (!id) continue;
    const datei = path.join(ZIEL, `${id}.webp`);
    if (fs.existsSync(datei)) continue;
    const v = nachId.get(id);
    if (!v) { log(`HINWEIS Vorschaubild für „${n.title}“: Video nicht unter den neuesten im Profil – übersprungen.`); continue; }
    try {
      const skal = ["-vf", "scale=360:640:force_original_aspect_ratio=increase,crop=360:640", "-frames:v", "1", "-quality", "80", datei];
      if (v.cover) {
        const roh = path.join(os.tmpdir(), `cover-${id}.img`);
        const b = await fetch(v.cover, { headers: { "user-agent": UA } });
        if (!b.ok) throw new Error(`Bild nicht ladbar (HTTP ${b.status})`);
        fs.writeFileSync(roh, Buffer.from(await b.arrayBuffer()));
        execFileSync("ffmpeg", ["-v", "error", "-y", "-i", roh, ...skal], { timeout: 60000 });
        fs.rmSync(roh, { force: true });
      } else if (v.play) {
        // kein Vorschaubild: Standbild nach 1,5 s aus dem Video
        execFileSync("ffmpeg", ["-v", "error", "-y", "-user_agent", UA, "-headers", "Referer: https://www.tiktok.com/" + String.fromCharCode(13, 10),
          "-ss", "1.5", "-i", v.play, ...skal], { timeout: 60000 });
      } else throw new Error("weder Vorschaubild noch Video-Adresse");
      neu.push(datei);
      log(`Vorschaubild gespeichert: img/videos/${id}.webp („${n.title}“)`);
    } catch (e) { log(`WARNUNG Vorschaubild für „${n.title}“: ${e.message} – nächster Lauf versucht es erneut.`); }
  }
  return neu;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const news = JSON.parse(fs.readFileSync(path.join(WEB, "data", "news.json"), "utf8"));
  const neu = await holeCovers(news, await profilVideos());
  console.log(`${neu.length} neue Vorschaubilder.`);
}
