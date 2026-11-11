// Nocturne – freigegebene Update-Listen prüfen und signieren (läuft in GitHub Actions, siehe .github/workflows/signieren.yml).
//
// Ablauf: Das Studio lädt neue Pakete und die Liste als „aktualisierung.json.unsigniert“ bzw.
// „aktualisierung-e.json.unsigniert“ (Eigentümer-Ausgabe, verschlüsselt) in das Release „aktualisierungen“ hoch und legt
// eine Freigabe-Datei in freigabe/ ab. Dieses Skript
//   1. prüft, ob das Secret zum öffentlichen Schlüssel der App passt (werkzeug/oeffentlicher-schluessel.txt),
//   2. prüft jede neue Liste (Format, Ausgabe, neuer als die bisherige, jedes Paket liegt mit passender Größe und
//      Prüfsumme im Release),
//   3. signiert den Klartext der Liste (Ed25519, wie die App es erwartet) und prüft die Signatur gegen,
//   4. ersetzt Liste + Signatur im Release und entfernt die unsignierte Fassung,
//   5. legt einen kurzen Bericht als „signier-bericht.txt“ ins Release.
// Der private Schlüssel steht nur im Secret – nie im Repository, nie in einer Ausgabe.
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';

const REPO = process.env.REPO;
const TAG = 'aktualisierungen';
const QUELLE = `https://github.com/${REPO}/releases/download/${TAG}/`;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'noc-sig-'));
const bericht = [`Nocturne-Signierlauf ${new Date().toISOString()}`];
const log = (s) => { console.log(s); bericht.push(s); };
const gh = (args) => execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'inherit'] });

function berichtAblegen(ok) {
  bericht.push(ok ? 'ERGEBNIS: erfolgreich' : 'ERGEBNIS: abgebrochen – nichts wurde veröffentlicht');
  const f = path.join(TMP, 'signier-bericht.txt');
  fs.writeFileSync(f, bericht.join('\n') + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '```\n' + bericht.join('\n') + '\n```\n');
  try { gh(['release', 'upload', TAG, f, '--clobber', '-R', REPO]); } catch (_) { /* Bericht ist nur eine Hilfe */ }
}
function abbrechen(grund) { log('FEHLER: ' + grund); berichtAblegen(false); process.exit(1); }

// 1. Schlüssel aus dem Secret lesen und gegen den öffentlichen Schlüssel der App prüfen
const geheim = String(process.env.NOCTURNE_SCHLUESSEL || '').trim();
if (!geheim) abbrechen('Das Secret NOCTURNE_SCHLUESSEL fehlt (Settings › Secrets and variables › Actions).');
let schl;
try { schl = JSON.parse(geheim); } catch (_) { abbrechen('Das Secret NOCTURNE_SCHLUESSEL ist kein gültiger Nocturne-Schlüssel (bitte den ganzen Inhalt der Datei einfügen).'); }
let privat;
try { privat = crypto.createPrivateKey({ key: Buffer.from(String(schl.signatur || ''), 'base64'), format: 'der', type: 'pkcs8' }); } catch (_) { abbrechen('Der Signaturschlüssel im Secret ist unlesbar.'); }
const PS = schl.paket ? Buffer.from(String(schl.paket), 'base64') : null;
if (PS && PS.length !== 32) abbrechen('Der Paketschlüssel im Secret hat nicht 32 Byte.');
const pubB64 = fs.readFileSync(new URL('./oeffentlicher-schluessel.txt', import.meta.url), 'utf8').trim();
const pubAusPrivat = crypto.createPublicKey(privat).export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64');
if (pubAusPrivat !== pubB64) abbrechen('Das Secret passt nicht zum öffentlichen Schlüssel der App – es wird nichts signiert.');
const pub = crypto.createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(pubB64, 'base64')]), format: 'der', type: 'spki' });
const entschl = (buf) => {
  if (buf.subarray(0, 4).toString() !== 'NOC1') throw new Error('kein NOC1-Format');
  const d = crypto.createDecipheriv('aes-256-gcm', PS, buf.subarray(4, 16)); d.setAuthTag(buf.subarray(buf.length - 16));
  return Buffer.concat([d.update(buf.subarray(16, buf.length - 16)), d.final()]);
};

// 2. Release und Dateien lesen
let rel;
try { rel = JSON.parse(gh(['api', `repos/${REPO}/releases/tags/${TAG}`])); } catch (_) { abbrechen(`Das Release „${TAG}“ fehlt.`); }
const seiten = JSON.parse(gh(['api', '--paginate', '--slurp', `repos/${REPO}/releases/${rel.id}/assets?per_page=100`]));
const assets = new Map(seiten.flat().map((x) => [x.name, x]));
const laden = (name) => {
  const ziel = path.join(TMP, 'dl');
  fs.mkdirSync(ziel, { recursive: true });
  fs.rmSync(path.join(ziel, name), { force: true });
  gh(['release', 'download', TAG, '-p', name, '-D', ziel, '--clobber', '-R', REPO]);
  return fs.readFileSync(path.join(ziel, name));
};
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

let erledigt = 0;
for (const name of ['aktualisierung.json', 'aktualisierung-e.json']) {
  if (!assets.has(name + '.unsigniert')) continue;
  const eigentuemer = name === 'aktualisierung-e.json';
  log(`– ${name}: neue Fassung gefunden`);
  if (eigentuemer && !PS) abbrechen('Für die Eigentümer-Liste fehlt der Paketschlüssel im Secret.');
  const neuRoh = laden(name + '.unsigniert');
  let klar;
  try { klar = eigentuemer ? entschl(neuRoh) : neuRoh; } catch (e) { abbrechen(`${name}: lässt sich nicht entschlüsseln (${e.message}).`); }
  let liste;
  try { liste = JSON.parse(klar.toString('utf8')); } catch (_) { abbrechen(`${name}: kein gültiges JSON.`); }
  if (liste.format !== 1 || !Array.isArray(liste.eintraege) || !liste.eintraege.length || !Date.parse(liste.erstellt)) abbrechen(`${name}: Format stimmt nicht.`);
  const edition = eigentuemer ? 'privat' : 'oeffentlich';
  const fremd = liste.eintraege.filter((e) => e.edition !== edition);
  if (fremd.length) abbrechen(`${name}: enthält Einträge einer anderen Ausgabe (${fremd.map((e) => e.id).join(', ')}).`);

  // bisherige signierte Liste: neue muss jünger sein (die App nimmt keine ältere Liste an)
  let altIds = new Set(); let altPakete = new Map(); // bereits geprüfte Pakete (Eintrag/Plattform → Prüfsumme + Adresse)
  if (assets.has(name) && assets.has(name + '.sig')) {
    try {
      const altRoh = laden(name); const altSig = laden(name + '.sig').toString('utf8');
      const altKlar = eigentuemer ? entschl(altRoh) : altRoh;
      if (!crypto.verify(null, altKlar, pub, Buffer.from(altSig, 'base64'))) log('  Hinweis: die bisherige Liste hatte keine gültige Signatur.');
      const alt = JSON.parse(altKlar.toString('utf8'));
      if (Date.parse(liste.erstellt) <= Date.parse(alt.erstellt)) abbrechen(`${name}: die neue Liste ist nicht neuer als die veröffentlichte.`);
      altIds = new Set((alt.eintraege || []).map((e) => e.id));
      for (const e of alt.eintraege || []) for (const [pf, p] of Object.entries(e.pakete || {})) altPakete.set(`${e.id}/${pf}`, `${p.sha256} ${p.url}`);
    } catch (e) { log(`  Hinweis: bisherige Liste nicht lesbar (${e.message}).`); } // abbrechen() beendet sofort, landet nie hier
  }

  // jedes Paket muss im Release liegen – Größe und Prüfsumme wie in der Liste
  for (const e of liste.eintraege) {
    for (const [pf, p] of Object.entries(e.pakete || {})) {
      if (!p || typeof p.url !== 'string' || !p.url.startsWith(QUELLE)) abbrechen(`${e.id}/${pf}: Paket-Adresse liegt nicht in diesem Release.`);
      const datei = decodeURIComponent(p.url.slice(QUELLE.length));
      const a = assets.get(datei);
      if (!a) abbrechen(`${e.id}/${pf}: Paket „${datei}“ fehlt im Release.`);
      if (a.size !== p.groesse) abbrechen(`${e.id}/${pf}: Größe stimmt nicht (${a.size} statt ${p.groesse}).`);
      if (a.digest) { if (a.digest !== 'sha256:' + p.sha256) abbrechen(`${e.id}/${pf}: Prüfsumme stimmt nicht.`); }
      else if (altPakete.get(`${e.id}/${pf}`) !== `${p.sha256} ${p.url}`) { if (sha256(laden(datei)) !== p.sha256) abbrechen(`${e.id}/${pf}: Prüfsumme stimmt nicht.`); }
    }
    if (!altIds.has(e.id)) log(`  neu: ${e.id} (${Object.keys(e.pakete || {}).join(', ')})`);
  }

  // 3. signieren (über den Klartext) und gegenprüfen
  const sig = crypto.sign(null, klar, privat);
  if (!crypto.verify(null, klar, pub, sig)) abbrechen(`${name}: Gegenprüfung der Signatur fehlgeschlagen.`);
  const aus = path.join(TMP, 'aus'); fs.mkdirSync(aus, { recursive: true });
  fs.writeFileSync(path.join(aus, name), neuRoh);
  fs.writeFileSync(path.join(aus, name + '.sig'), sig.toString('base64'));

  // 4. Liste und Signatur unmittelbar nacheinander ersetzen, dann die unsignierte Fassung entfernen
  gh(['release', 'upload', TAG, path.join(aus, name), path.join(aus, name + '.sig'), '--clobber', '-R', REPO]);
  gh(['release', 'delete-asset', TAG, name + '.unsigniert', '-y', '-R', REPO]);
  log(`✓ ${name}: ${liste.eintraege.length} Einträge, signiert und veröffentlicht`);
  erledigt++;
}
if (!erledigt) log('Nichts zu signieren (keine unsignierte Liste im Release).');
berichtAblegen(true);
fs.rmSync(TMP, { recursive: true, force: true });
