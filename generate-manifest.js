/**
 * generate-manifest.js
 * Run after adding files to /works or /pages:
 *   node generate-manifest.js
 *
 * Builds manifest.json, pages.json, and writes/removes stub index.html
 * files that give each subpage a real clean URL.
 * Stamps a version number on every stylesheet/script link in each stub
 * so stale CDN-cached copies are never served after a push.
 */

const fs   = require("fs");
const path = require("path");
const { execSync, execFileSync } = require("child_process");

// ── Optional thumbnail dependencies ─────────────────────────
// sharp: npm install sharp  (images → compressed WebP thumbnails)
// ffmpeg (+ffprobe): system install (videos → poster frames, web-safe copies)
let sharp = null;
try { sharp = require("sharp"); } catch(_) {}

let hasFfmpeg = false;
try { execSync("ffmpeg -version", { stdio:"pipe" }); hasFfmpeg = true; } catch(_) {}
let hasFfprobe = false;
try { execSync("ffprobe -version", { stdio:"pipe" }); hasFfprobe = true; } catch(_) {}

// What this machine's ffmpeg is and can do — printed at the start of a run so
// "it didn't convert my .mkv" is diagnosable at a glance.
let ffmpegVersionLine = "", hasX264 = true;
if (hasFfmpeg) {
  try { ffmpegVersionLine = execSync("ffmpeg -version", { stdio:"pipe" }).toString().split(/\r?\n/)[0]; } catch(_) {}
  try { hasX264 = /libx264/.test(execSync("ffmpeg -hide_banner -encoders", { stdio:"pipe", maxBuffer: 16*1024*1024 }).toString()); } catch(_) {}
}
// Every video that ended up without a poster and/or web-safe copy, with the
// reason — summarised at the end of the run.
const videoProblems = [];

// ── Video / size-limit settings ──────────────────────────────
// GitHub rejects any pushed file over 100 MB; 95 MB leaves headroom.
const SIZE_LIMIT_BYTES = 95 * 1024 * 1024;
// Originals of files that had to be shrunk are parked here (git-ignored, so
// they stay on this machine only — keep your own backup too).
const SRC_BACKUP_DIR = "works-src";
// Web-safe video copies (see makeWebCopy): long side capped at this, x264 CRF.
const VIDEO_WEB_MAX_LONG_SIDE = 1920;
const VIDEO_WEB_CRF = 23;
// Poster-frame picker: a candidate frame counts as "good" when its average
// brightness (0-255) and contrast (std-dev) both clear these floors.
const POSTER_MIN_LUMA  = 40;
const POSTER_MIN_STDEV = 12;

const THUMB_DIR    = "thumbs";   // subfolder name inside works/ and pages/<slug>/
const THUMB_MAX_PX = 1200;       // longest side of grid/modal thumbnail
const THUMB_QUALITY = 82;        // WebP quality (0-100)

// Zoom-tier — what the pan/zoom overlay loads on phones/tablets, instead of
// the raw original. This exists to cap DECODED PIXEL DIMENSIONS, not just
// file size. The overlay renders its image inside a `will-change: transform`
// layer, which forces the browser to allocate a GPU-backed texture sized to
// the image's native pixel dimensions — regardless of how small the file is
// on disk. An oversized original (a 30+ MB photo, or just a very high native
// resolution) can exceed an older device's texture/compositor limit and
// crash the tab, even though it displays at a small on-screen scale.
// Converting to WebP alone would NOT fix this — it shrinks bytes on disk,
// not decoded pixels. ZOOM_MAX_PX is the part that actually matters; the
// WebP re-encode is a free bonus (faster download) that rides along with it.
// Desktop/laptop browsers skip this tier entirely and load the true original
// instead (see isLikelyDesktop() in index.html / page-engine.js) — so this
// cap only ever affects what phones and tablets see. 4096px comfortably
// exceeds what any phone screen can show pixel-for-pixel even at max
// pinch-zoom, so it shouldn't be visible as a quality loss there.
const ZOOM_MAX_PX  = 4096;
const ZOOM_QUALITY = 90;

// Printed at the top of every run, so you can tell at a glance which copy of
// this script you're running.
const SCRIPT_VERSION = "video pipeline v2 (2026-11-08)";

const WORKS_DIR   = path.join(__dirname, "works");
const PAGES_DIR   = path.join(__dirname, "pages");
const MANIFEST_OUT = path.join(__dirname, "manifest.json");
const MANIFEST_FULL_OUT = path.join(__dirname, "manifest-full.json");
const PAGES_OUT   = path.join(__dirname, "pages.json");
const STUB_MARKER = "AUTO-GENERATED-PAGE-STUB";
const FULL_PAGE_DIR = path.join(__dirname, "full");

// ── Link previews (shareable per-work URLs) ───────────────────
// Every work gets one tiny HTML file — w/<slug>.html, served by GitHub Pages
// at /w/<slug> — whose <meta> tags give Discord/Slack/iMessage/etc. a title,
// description and image for the link. Visitors who open it are forwarded
// straight into the gallery with that work open. Gated works get theirs under
// full/w/ (so their link contains /full) with a BLURRED preview image.
const SITE_URL  = "https://ajambrozic.com";   // no trailing slash
const SITE_NAME = "AJ Ambrozic";
const PREVIEW_DIR      = path.join(__dirname, "w");
const FULL_PREVIEW_DIR = path.join(FULL_PAGE_DIR, "w");
const PREVIEW_MARKER   = "AUTO-GENERATED-WORK-PREVIEW";
const OG_DESC_MAX = 200;                       // characters of description shown
const OG_VIDEO_MAX_BYTES = 20 * 1024 * 1024;   // og:video only when the MP4 is this small
const OG_BLUR_WIDTH = 600;                     // gated preview: size and blur strength
const OG_BLUR_SIGMA = 28;

// Works tagged with any of these (case-insensitive) are left out of
// manifest.json entirely — not just hidden client-side, they're never sent
// to a visitor browsing the main site at all. They only appear in
// manifest-full.json, which /full/index.html loads instead. This is a
// default-visibility gate, not real access control: /full/ isn't password
// protected, and the underlying image files in works/ are just as publicly
// fetchable as everything else on GitHub Pages to anyone who has (or
// guesses) the direct URL. Add more tag names here if you want more than
// one gated category.
const GATED_TAGS = ["violent", "mature"];
function isGatedWork(work) {
  return work.tags.some(t => GATED_TAGS.includes(t.toLowerCase()));
}

const IMAGE_EXT = new Set([".jpg",".jpeg",".png",".gif",".webp",".avif",".svg"]);
const VIDEO_EXT = new Set([".mp4",".webm",".mov",".ogg",".mkv"]);
const MEDIA_EXT = new Set([...IMAGE_EXT, ...VIDEO_EXT]);

// ── Generic [section] block parser ───────────────────────────
function parseBlocks(raw) {
  const out = {};
  const lines = raw.replace(/\r\n/g,"\n").split("\n");
  let key = null, buf = [];
  const flush = () => {
    if (!key) return;
    out[key] = buf.join("\n").trim();
    buf = []; key = null;
  };
  for (const line of lines) {
    const m = line.match(/^\[(\w+)\]\s*$/i);
    if (m) { flush(); key = m[1].toLowerCase(); } else { buf.push(line); }
  }
  flush();
  return out;
}

function mediaType(f) {
  const ext = path.extname(f).toLowerCase();
  return VIDEO_EXT.has(ext) ? "video" : IMAGE_EXT.has(ext) ? "image" : "unknown";
}

function canonical(base) { return base.replace(/[-_\s]*\d+$/, ""); }

function slugify(name) {
  return name.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// URL-friendly name for a work: "Neon Drift!" -> "neon-drift". Accents are
// folded ("café" -> "cafe") so non-English titles don't collapse to nothing.
function workSlugBase(id) {
  const s = String(id).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s || "work";
}

// ══════════════════════════════════════════════════════════════
//  WORKS — manifest.json
// ══════════════════════════════════════════════════════════════

function parseWorkTxt(raw) {
  const b = parseBlocks(raw);
  return {
    title:      b.title || "",
    description:b.description || "",
    tags:       (b.tags||"").split(/[\n,]+/).map(t=>t.trim()).filter(Boolean),
    featured:   /^(true|yes|1)$/i.test(b.featured||""),
    square:     /^(true|yes|1)$/i.test(b.square||""),
    extraMedia: (b.extra||"").split(/[\n,]+/).map(t=>t.trim()).filter(Boolean),
    date:       b.date||"",
    link:       b.link||"",
  };
}

function readDimensions(filepath) {
  const ext = path.extname(filepath).toLowerCase();
  if (!IMAGE_EXT.has(ext) || ext === ".svg" || ext === ".avif") return null;
  try {
    const size = (ext===".jpg"||ext===".jpeg") ? 65536 : 128;
    const buf  = Buffer.alloc(size);
    const fd   = fs.openSync(filepath,"r");
    const read = fs.readSync(fd, buf, 0, size, 0);
    fs.closeSync(fd);
    const d = buf.slice(0, read);
    if (ext===".png" && d[0]===0x89 && d[1]===0x50 && d.length>=24)
      return { w:d.readUInt32BE(16), h:d.readUInt32BE(20) };
    if (ext===".gif" && d[0]===0x47 && d[1]===0x49 && d.length>=10)
      return { w:d.readUInt16LE(6), h:d.readUInt16LE(8) };
    if (ext===".jpg"||ext===".jpeg") {
      let i=2;
      while (i<d.length-10) {
        if (d[i]!==0xFF) break;
        const m=d[i+1];
        const isSOF=(m>=0xC0&&m<=0xC3)||(m>=0xC5&&m<=0xC7)||(m>=0xC9&&m<=0xCB)||(m>=0xCD&&m<=0xCF);
        if (isSOF) return { w:d.readUInt16BE(i+7), h:d.readUInt16BE(i+5) };
        const segLen=d.readUInt16BE(i+2);
        if (segLen<2) break;
        i+=2+segLen;
      }
    }
    if (ext===".webp" && d.toString("ascii",0,4)==="RIFF" && d.toString("ascii",8,12)==="WEBP") {
      const chunk=d.toString("ascii",12,16);
      if (chunk==="VP8 "&&d.length>=30) return { w:(d[26]|d[27]<<8)&0x3FFF, h:(d[28]|d[29]<<8)&0x3FFF };
      if (chunk==="VP8L"&&d.length>=25) { const bits=d.readUInt32LE(21); return { w:(bits&0x3FFF)+1, h:((bits>>14)&0x3FFF)+1 }; }
      if (chunk==="VP8X"&&d.length>=34) return { w:1+(d[24]|d[25]<<8|d[26]<<16), h:1+(d[27]|d[28]<<8|d[29]<<16) };
    }
  } catch(_) {}
  return null;
}

function deriveSpan(ar, type) {
  if (!ar) return type==="video" ? "wide" : "normal";
  if (ar>2.2)  return "ultrawide";
  if (ar>1.45) return "wide";
  if (ar<0.85) return "tall";
  return "normal";
}

// ── Thumbnail generation ─────────────────────────────────────
//
// Freshness is tracked by file SIZE, in a small ".thumb-cache.json" sidecar
// inside each thumbs/ folder — not by mtime. git does not preserve mtimes on
// checkout/pull/clone, so an mtime-based "is the thumb newer than the
// source?" check can come out true or false almost arbitrarily after any
// git operation, independent of whether the source actually changed. Byte
// size only changes when the source file is genuinely replaced, so it
// survives commits/checkouts across machines correctly. The cache file is
// meant to be committed alongside the thumbs it describes — don't gitignore
// it, and don't hand-edit it.

function loadThumbCache(thumbDir) {
  try { return JSON.parse(fs.readFileSync(path.join(thumbDir, ".thumb-cache.json"), "utf8")); }
  catch(_) { return {}; }
}
function saveThumbCache(thumbDir, cache) {
  try { fs.writeFileSync(path.join(thumbDir, ".thumb-cache.json"), JSON.stringify(cache)); }
  catch(_) {}
}

// Returns the thumb filename (e.g. "mywork.webp") or null on failure.
// Skips regeneration if the source's byte size matches what's on record
// for this variant AND the output file still exists on disk.
async function makeImageThumb(srcPath, thumbDir, srcFilename, cache) {
  if (!sharp) return null;
  const ext = path.extname(srcFilename).toLowerCase();
  if (ext === ".gif") return null; // skip: converting GIF kills animation
  const baseName  = path.basename(srcFilename, path.extname(srcFilename));
  const thumbName = baseName + ".webp";
  const thumbPath = path.join(thumbDir, thumbName);
  const cacheKey  = srcFilename + "::thumb";
  try {
    const srcSize = fs.statSync(srcPath).size;
    if (cache[cacheKey] === srcSize && fs.existsSync(thumbPath)) return thumbName;
    await sharp(srcPath)
      .resize(THUMB_MAX_PX, THUMB_MAX_PX, { fit:"inside", withoutEnlargement:true })
      .webp({ quality:THUMB_QUALITY })
      .toFile(thumbPath);
    cache[cacheKey] = srcSize;
    return thumbName;
  } catch(e) {
    process.stdout.write("  thumb skipped (" + srcFilename + "): " + e.message + "\n");
    return null;
  }
}

// Returns the zoom-tier filename (e.g. "mywork_zoom.webp") or null.
// This is a size-capped stand-in for the raw original — see ZOOM_MAX_PX
// comment above for why capping dimensions (not just file size) matters.
async function makeZoomImage(srcPath, thumbDir, srcFilename, cache) {
  if (!sharp) return null;
  const ext = path.extname(srcFilename).toLowerCase();
  if (ext === ".gif") return null; // skip: converting GIF kills animation
  const baseName = path.basename(srcFilename, path.extname(srcFilename));
  const zoomName = baseName + "_zoom.webp";
  const zoomPath = path.join(thumbDir, zoomName);
  const cacheKey = srcFilename + "::zoom";
  try {
    const srcSize = fs.statSync(srcPath).size;
    if (cache[cacheKey] === srcSize && fs.existsSync(zoomPath)) return zoomName;
    await sharp(srcPath)
      .resize(ZOOM_MAX_PX, ZOOM_MAX_PX, { fit:"inside", withoutEnlargement:true })
      .webp({ quality:ZOOM_QUALITY })
      .toFile(zoomPath);
    cache[cacheKey] = srcSize;
    return zoomName;
  } catch(e) {
    process.stdout.write("  zoom image skipped (" + srcFilename + "): " + e.message + "\n");
    return null;
  }
}

// ── Video toolkit ────────────────────────────────────────────

// Print a line without being garbled by the single-line progress bar.
function logLine(msg) {
  process.stdout.write("\r" + " ".repeat(100) + "\r" + msg + "\n");
}

function ffErr(e) {
  const t = (e && e.stderr ? e.stderr.toString() : "") || (e && e.message) || String(e);
  return t.trim().split("\n").slice(-2).join(" | ").slice(0, 220);
}

// Turn a raw ffmpeg failure into something actionable.
function ffHint(e, probe) {
  const t = ((e && e.stderr ? e.stderr.toString() : "") + " " + ((e && e.message) || "")).toLowerCase();
  const codec = probe && probe.vcodec ? " (" + probe.vcodec + ")" : "";
  if (/decoder.*not found|unknown decoder|no decoder|decoding.*not supported/.test(t))
    return "this ffmpeg can't decode the video's codec" + codec + " — update ffmpeg";
  if (/unknown encoder|libx264/.test(t) && /encoder/.test(t))
    return "this ffmpeg build has no libx264 encoder — install a full ffmpeg build";
  if (/moov atom not found|invalid data found|end of file|truncated/.test(t))
    return "the file looks damaged or incomplete";
  return "";
}
function noteProblem(file, what, e, probe) {
  const hint = ffHint(e, probe);
  videoProblems.push({ file, what, why: ffErr(e), hint });
  return hint ? "  (" + hint + ")" : "";
}

function runFfmpeg(args) {
  return execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args],
    { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 256 * 1024 * 1024 });
}

// ffmpeg scale expression that caps the LONG side at maxPx (never upscales)
// and keeps both dimensions even (x264 + yuv420p requires that).
function capScale(maxPx) {
  return `scale='if(gt(iw,ih),min(${maxPx},iw),-2)':'if(gt(iw,ih),-2,min(${maxPx},ih))',` +
         `scale=trunc(iw/2)*2:trunc(ih/2)*2`;
}

function probeVideo(file) {
  if (!hasFfprobe) return null;
  try {
    const out = execFileSync("ffprobe",
      ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file],
      { maxBuffer: 16 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }).toString();
    const j = JSON.parse(out);
    const v = (j.streams || []).find(x => x.codec_type === "video");
    const a = (j.streams || []).find(x => x.codec_type === "audio");
    if (!v) return null;
    return {
      duration: parseFloat((j.format && j.format.duration) || v.duration || "0") || 0,
      vcodec: v.codec_name, pix_fmt: v.pix_fmt,
      width: v.width || 0, height: v.height || 0,
      acodec: a ? a.codec_name : null,
    };
  } catch (_) { return null; }
}

// True if an MP4/MOV's "moov" metadata box comes BEFORE the media data
// ("faststart"). When it's at the end, iOS Safari has to download most of the
// file before it can start — a common cause of long gray loading screens.
// Returns null when it can't tell.
function moovBeforeMdat(file) {
  let fd;
  try {
    fd = fs.openSync(file, "r");
    const size = fs.fstatSync(fd).size;
    const hdr = Buffer.alloc(16);
    let pos = 0;
    for (let i = 0; i < 64 && pos + 8 <= size; i++) {
      fs.readSync(fd, hdr, 0, 16, pos);
      let len = hdr.readUInt32BE(0);
      const type = hdr.toString("ascii", 4, 8);
      if (type === "moov") return true;
      if (type === "mdat") return false;
      if (len === 1) len = Number(hdr.readBigUInt64BE(8));
      else if (len === 0) len = size - pos;
      if (len < 8) return null;
      pos += len;
    }
    return null;
  } catch (_) { return null; }
  finally { if (fd !== undefined) { try { fs.closeSync(fd); } catch (_) {} } }
}

// Why (if at all) this video needs a web-safe copy. null = plays fine as-is.
function webCopyReason(filePath, probe) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== ".mp4") return "container " + ext;
  if (!probe) return null; // no ffprobe: can only judge by container
  if (probe.vcodec !== "h264") return "video codec " + probe.vcodec;
  if (probe.pix_fmt && probe.pix_fmt !== "yuv420p") return "pixel format " + probe.pix_fmt;
  if (probe.acodec && !["aac", "mp3"].includes(probe.acodec)) return "audio codec " + probe.acodec;
  if (Math.max(probe.width, probe.height) > VIDEO_WEB_MAX_LONG_SIDE) return "larger than 1080p";
  if (moovBeforeMdat(filePath) === false) return "metadata at end of file";
  return null;
}

function mbOf(bytes) { return (bytes / 1048576).toFixed(1) + " MB"; }

// Returns the filename (inside thumbs/) of a web-safe H.264/AAC MP4, or null
// when the original already plays everywhere (no copy is made in that case, so
// compatible files never double in repo size). If the ONLY problem is
// metadata-at-end, the streams are copied untouched (lossless, fast).
function makeWebCopy(srcPath, thumbDir, srcFilename, cache, probe) {
  if (!hasFfmpeg) return null;
  const baseName = path.basename(srcFilename, path.extname(srcFilename));
  const outName  = baseName + "_web.mp4";
  const outPath  = path.join(thumbDir, outName);
  const cacheKey = srcFilename + "::web";
  let reason;
  try { reason = webCopyReason(srcPath, probe); } catch (_) { reason = null; }
  if (!reason) {
    if (fs.existsSync(outPath)) { try { fs.unlinkSync(outPath); } catch (_) {} }
    delete cache[cacheKey];
    return null;
  }
  const srcSize = fs.statSync(srcPath).size;
  if (cache[cacheKey] === srcSize && fs.existsSync(outPath)) return outName;

  if (reason !== "metadata at end of file" && !hasX264) {
    logLine("  web copy skipped for " + srcFilename + ": this ffmpeg build has no libx264 encoder.");
    videoProblems.push({ file: srcFilename, what: "web copy", why: "no libx264 encoder", hint: "install a full ffmpeg build" });
    return null;
  }
  if (hasFfprobe && !probe) {
    videoProblems.push({ file: srcFilename, what: "probe", why: "ffprobe couldn't read this file", hint: "the file may be damaged, or ffmpeg is too old for its format" });
  }
  const remux = reason === "metadata at end of file";
  logLine("  web copy: " + srcFilename + "  (" + reason + (remux ? ", lossless remux" : ", re-encoding") + ")");
  const tmp = outPath + ".tmp";
  const args = ["-i", srcPath, "-map", "0:v:0", "-map", "0:a:0?", "-sn", "-dn"];
  if (remux) {
    args.push("-c", "copy", "-movflags", "+faststart");
  } else {
    args.push("-vf", capScale(VIDEO_WEB_MAX_LONG_SIDE),
      "-c:v", "libx264", "-preset", "medium", "-crf", String(VIDEO_WEB_CRF),
      "-profile:v", "high", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "-max_muxing_queue_size", "1024");
  }
  args.push("-f", "mp4", tmp);
  try {
    runFfmpeg(args);
    fs.renameSync(tmp, outPath);
    cache[cacheKey] = srcSize;
    const outSize = fs.statSync(outPath).size;
    logLine("    -> thumbs/" + outName + "  (" + mbOf(srcSize) + " -> " + mbOf(outSize) + ")");
    return outName;
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (_) {}
    logLine("  web copy FAILED for " + srcFilename + ": " + ffErr(e) + noteProblem(srcFilename, "web copy", e, probe));
    return null;
  }
}

// Candidate timestamps (seconds) to sample for a poster frame.
function posterCandidateTimes(duration) {
  const t = [0, 0.5, 1, 2, 3, 5];
  if (duration > 0) t.push(duration * 0.1, duration * 0.25, duration * 0.5);
  const limit = duration > 0 ? Math.max(duration - 0.1, 0.01) : Infinity;
  return [...new Set(t.filter(x => x < limit).map(x => Math.round(x * 100) / 100))]
    .sort((x, y) => x - y).slice(0, 9);
}

// One decoded frame as a PNG buffer (long side capped at maxPx).
function grabFrame(srcPath, seconds, maxPx) {
  const tail = ["-frames:v", "1", "-vf", capScale(maxPx), "-f", "image2pipe", "-vcodec", "png", "pipe:1"];
  try {
    const fast = runFfmpeg(["-ss", String(seconds), "-i", srcPath, ...tail]);
    if (fast && fast.length) return fast;
  } catch (_) {}
  // Slower but more forgiving (files with a missing/odd seek index, e.g. an
  // unfinished recording): decode up to the timestamp instead of seeking.
  return runFfmpeg(["-i", srcPath, "-ss", String(seconds), ...tail]);
}

// Returns the poster filename (e.g. "myvideo_poster.webp") or null.
// Instead of blindly taking frame 0 (often black — fade-ins, title cards), it
// samples several candidate frames and uses the first one that's bright and
// contrasty enough; if none qualifies, the best-scoring candidate wins.
async function makeVideoPoster(srcPath, thumbDir, srcFilename, cache, probe) {
  if (!hasFfmpeg) return null;
  const baseName = path.basename(srcFilename, path.extname(srcFilename));
  const cacheKey = srcFilename + "::poster2";
  const srcSize  = fs.statSync(srcPath).size;

  if (sharp) {
    const outName = baseName + "_poster.webp";
    const outPath = path.join(thumbDir, outName);
    if (cache[cacheKey] === srcSize && fs.existsSync(outPath)) return outName;
    try {
      let chosen = null, best = null, lastErr = null;
      for (const t of posterCandidateTimes(probe ? probe.duration : 0)) {
        let buf;
        try { buf = grabFrame(srcPath, t, 320); } catch (e) { lastErr = e; continue; }
        if (!buf || !buf.length) continue;
        const st = await sharp(buf).stats();
        const ch = st.channels;
        const luma = ch.length >= 3
          ? 0.299 * ch[0].mean + 0.587 * ch[1].mean + 0.114 * ch[2].mean
          : ch[0].mean;
        const sd = ch.reduce((acc, c) => acc + c.stdev, 0) / ch.length;
        if (luma >= POSTER_MIN_LUMA && sd >= POSTER_MIN_STDEV) { chosen = t; break; }
        const score = luma * Math.min(1, sd / POSTER_MIN_STDEV);
        if (!best || score > best.score) best = { t, score };
      }
      if (chosen === null && !best) throw (lastErr || new Error("no frame could be decoded"));
      const at = chosen !== null ? chosen : best.t;
      const frame = grabFrame(srcPath, at, THUMB_MAX_PX);
      if (!frame || !frame.length) throw new Error("no frame decoded");
      await sharp(frame)
        .resize(THUMB_MAX_PX, THUMB_MAX_PX, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: THUMB_QUALITY })
        .toFile(outPath);
      // Older versions wrote a JPEG poster; drop it so it doesn't linger.
      const oldJpg = path.join(thumbDir, baseName + "_poster.jpg");
      if (fs.existsSync(oldJpg)) { try { fs.unlinkSync(oldJpg); } catch (_) {} }
      cache[cacheKey] = srcSize;
      return outName;
    } catch (e) {
      logLine("  poster FAILED for " + srcFilename + ": " + ffErr(e) + noteProblem(srcFilename, "poster", e, probe));
      return null;
    }
  }

  // No sharp: plain ffmpeg JPEG at ~1s (no brightness check).
  const outName = baseName + "_poster.jpg";
  const outPath = path.join(thumbDir, outName);
  if (cache[cacheKey] === srcSize && fs.existsSync(outPath)) return outName;
  try {
    runFfmpeg(["-ss", "1", "-i", srcPath, "-frames:v", "1", "-vf", capScale(THUMB_MAX_PX), outPath]);
    if (!fs.existsSync(outPath)) runFfmpeg(["-i", srcPath, "-frames:v", "1", "-vf", capScale(THUMB_MAX_PX), outPath]);
    cache[cacheKey] = srcSize;
    return outName;
  } catch (e) {
    logLine("  poster FAILED for " + srcFilename + ": " + ffErr(e) + noteProblem(srcFilename, "poster", e, probe));
    return null;
  }
}

// ── Oversize files (GitHub's 100 MB push limit) ──────────────
//
// Any media file over SIZE_LIMIT_BYTES is shrunk automatically:
//   1. the untouched original is copied to works-src/<same relative path>
//      (git-ignored — it lives on this machine only),
//   2. a smaller version is made (videos -> H.264 .mp4, big PNG/WebP/AVIF ->
//      high-quality .webp, big JPEG -> re-encoded .jpg),
//   3. only once that result is verified to be under the limit does it replace
//      the original in works/ (or pages/<slug>/).
// If the file's extension changes (e.g. .mkv -> .mp4), any [extra] / [media] /
// carousel_media lines in the neighbouring .txt files that name it are
// updated to match. If a result can't get under the limit, the original is
// left exactly as it was and a warning is printed.

function ensureGitignoreEntry(entry) {
  const gi = path.join(__dirname, ".gitignore");
  let cur = "";
  try { cur = fs.readFileSync(gi, "utf8"); } catch (_) {}
  const has = cur.split(/\r?\n/).some(l => l.trim().replace(/^\//, "") === entry);
  if (has) return;
  fs.writeFileSync(gi, cur + (cur && !cur.endsWith("\n") ? "\n" : "") + entry + "\n");
  logLine("  added " + entry + " to .gitignore");
}

function updateTxtReferences(dir, oldName, newName) {
  let files; try { files = fs.readdirSync(dir); } catch (_) { return; }
  for (const f of files) {
    if (path.extname(f).toLowerCase() !== ".txt") continue;
    const fp = path.join(dir, f);
    let txt; try { txt = fs.readFileSync(fp, "utf8"); } catch (_) { continue; }
    if (!txt.includes(oldName)) continue;
    fs.writeFileSync(fp, txt.split(oldName).join(newName));
    logLine("    updated reference in " + f + ": " + oldName + " -> " + newName);
  }
}

async function shrinkVideo(full, tmp, limit) {
  const probe = probeVideo(full);
  const dur = probe ? probe.duration : 0;
  const attempts = [{ crf: VIDEO_WEB_CRF, maxPx: VIDEO_WEB_MAX_LONG_SIDE }];
  if (dur > 0) {
    const audioBps = 128000;
    const base = Math.floor((limit * 8 * 0.9) / dur) - audioBps;
    if (base < 250000) { logLine("    video is too long to fit under the limit at a watchable bitrate"); }
    else {
      attempts.push({ vbps: base,                    maxPx: VIDEO_WEB_MAX_LONG_SIDE });
      attempts.push({ vbps: Math.floor(base * 0.8),  maxPx: VIDEO_WEB_MAX_LONG_SIDE });
      attempts.push({ vbps: Math.floor(base * 0.65), maxPx: 1280 });
    }
  }
  for (const at of attempts) {
    const args = ["-i", full, "-map", "0:v:0", "-map", "0:a:0?", "-sn", "-dn",
      "-vf", capScale(at.maxPx), "-c:v", "libx264", "-preset", "medium"];
    if (at.crf) args.push("-crf", String(at.crf));
    else args.push("-b:v", String(at.vbps), "-maxrate", String(Math.floor(at.vbps * 1.4)),
                   "-bufsize", String(at.vbps * 2));
    args.push("-profile:v", "high", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart", "-max_muxing_queue_size", "1024", "-f", "mp4", tmp);
    try { runFfmpeg(args); } catch (e) { logLine("    encode failed: " + ffErr(e)); return false; }
    const size = fs.statSync(tmp).size;
    logLine("    attempt -> " + mbOf(size) + (size <= limit ? "  (under limit)" : "  (still too big, retrying lower)"));
    if (size <= limit) return true;
  }
  return false;
}

async function shrinkImage(full, tmp, limit, outExt) {
  const steps = [{ q: 92, s: 1 }, { q: 85, s: 1 }, { q: 80, s: 0.85 }, { q: 75, s: 0.7 }, { q: 70, s: 0.5 }];
  const meta = await sharp(full, { limitInputPixels: false }).metadata();
  for (const st of steps) {
    let img = sharp(full, { limitInputPixels: false });
    if (st.s < 1 && meta.width) img = img.resize(Math.round(meta.width * st.s));
    img = outExt === ".jpg" ? img.jpeg({ quality: st.q, mozjpeg: true }) : img.webp({ quality: st.q });
    await img.toFile(tmp);
    const size = fs.statSync(tmp).size;
    logLine("    attempt q" + st.q + (st.s < 1 ? " @" + Math.round(st.s * 100) + "%" : "") + " -> " + mbOf(size));
    if (size <= limit) return true;
  }
  return false;
}

async function shrinkFile(dir, f) {
  const full = path.join(dir, f);
  const type = mediaType(f);
  const ext  = path.extname(f).toLowerCase();
  const base = path.basename(f, path.extname(f));
  const size = fs.statSync(full).size;

  if (type === "video" && !hasFfmpeg) { logLine("  " + f + " is " + mbOf(size) + " but ffmpeg isn't installed — can't shrink it."); return; }
  if (type === "image" && (!sharp || ext === ".gif" || ext === ".svg")) {
    logLine("  " + f + " is " + mbOf(size) + " — " + (ext === ".gif" || ext === ".svg" ? ext + " files can't be shrunk automatically" : "sharp isn't installed") + "; GitHub will reject it. Shrink it by hand.");
    return;
  }

  const outExt = type === "video" ? ".mp4" : (ext === ".jpg" || ext === ".jpeg") ? ".jpg" : ".webp";
  const finalPath = path.join(dir, base + outExt);
  if (finalPath !== full && fs.existsSync(finalPath)) {
    logLine("  " + f + " is " + mbOf(size) + " but " + base + outExt + " already exists next to it — rename one and re-run.");
    return;
  }

  logLine("  " + f + " is " + mbOf(size) + " (limit " + mbOf(SIZE_LIMIT_BYTES) + ") — shrinking…");

  // 1. Park the untouched original (verified) in works-src/
  const rel = path.relative(__dirname, full);
  const backup = path.join(__dirname, SRC_BACKUP_DIR, rel);
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  if (!fs.existsSync(backup) || fs.statSync(backup).size !== size) fs.copyFileSync(full, backup);
  if (fs.statSync(backup).size !== size) { logLine("    backup copy failed verification — leaving the original alone."); return; }
  ensureGitignoreEntry(SRC_BACKUP_DIR + "/");

  // 2. Make the smaller version next to it
  const tmp = full + ".shrink.tmp";
  let ok = false;
  try {
    ok = type === "video" ? await shrinkVideo(full, tmp, SIZE_LIMIT_BYTES)
                          : await shrinkImage(full, tmp, SIZE_LIMIT_BYTES, outExt);
  } catch (e) { logLine("    failed: " + ffErr(e)); }
  if (!ok) {
    try { fs.unlinkSync(tmp); } catch (_) {}
    logLine("    couldn't get " + f + " under the limit — original left untouched; GitHub will still reject it.");
    return;
  }

  // 3. Swap it in
  fs.renameSync(tmp, finalPath);
  if (finalPath !== full) {
    fs.unlinkSync(full);
    updateTxtReferences(dir, f, base + outExt);
  }
  logLine("    done: " + rel + " -> " + path.relative(__dirname, finalPath) + "  (original kept in " + SRC_BACKUP_DIR + "/" + rel + ")");
}

async function enforceSizeLimits() {
  const dirs = [WORKS_DIR];
  if (fs.existsSync(PAGES_DIR)) {
    for (const f of fs.readdirSync(PAGES_DIR)) {
      const d = path.join(PAGES_DIR, f);
      try { if (fs.statSync(d).isDirectory()) dirs.push(d); } catch (_) {}
    }
  }
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      const full = path.join(dir, f);
      let st; try { st = fs.statSync(full); } catch (_) { continue; }
      if (!st.isFile() || f.startsWith(".")) continue;
      if (!MEDIA_EXT.has(path.extname(f).toLowerCase())) continue;
      if (st.size > SIZE_LIMIT_BYTES) await shrinkFile(dir, f);
    }
  }
}

// Last check: anything still over the limit anywhere in the repo (including
// non-media files like game builds) — GitHub would reject the push.
function warnLargeFiles() {
  const hits = [];
  (function walk(dir) {
    let entries; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of entries) {
      if (e.name === ".git" || e.name === "node_modules" || e.name === SRC_BACKUP_DIR) continue;
      const fp = path.join(dir, e.name);
      if (e.isDirectory()) walk(fp);
      else { try { const sz = fs.statSync(fp).size; if (sz > SIZE_LIMIT_BYTES) hits.push([path.relative(__dirname, fp), sz]); } catch (_) {} }
    }
  })(__dirname);
  if (hits.length) {
    console.log("\nWARNING: files over " + mbOf(SIZE_LIMIT_BYTES) + " (GitHub rejects pushes with files over 100 MB):");
    for (const [f, sz] of hits) console.log("  " + f + "  (" + mbOf(sz) + ")");
  }
}

function ensureThumbDir(dir) {
  const d = path.join(dir, THUMB_DIR);
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive:true });
  return d;
}

// ── Progress bar ──────────────────────────────────────────────
// Compressing a folder of large photos/videos can take a while (each image
// gets processed for BOTH the display tier and the zoom tier). Without any
// feedback, that looks identical to a frozen/crashed script — the single
// biggest way people (understandably) interrupt this halfway through. This
// prints a live-updating single-line progress bar instead.
function countMediaFiles(dir) {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  for (const f of fs.readdirSync(dir)) {
    if (f === THUMB_DIR || f.startsWith(".")) continue;
    const full = path.join(dir, f);
    let stat; try { stat = fs.statSync(full); } catch(_) { continue; }
    if (stat.isDirectory()) count += countMediaFiles(full);
    else if (MEDIA_EXT.has(path.extname(f).toLowerCase())) count++;
  }
  return count;
}

const progress = { done: 0, total: 0 };
const PROGRESS_BAR_WIDTH = 28;
function tickProgress(label) {
  progress.done++;
  const frac   = progress.total ? Math.min(1, progress.done / progress.total) : 1;
  const filled = Math.round(PROGRESS_BAR_WIDTH * frac);
  const bar    = "#".repeat(filled) + "-".repeat(Math.max(0, PROGRESS_BAR_WIDTH - filled));
  const line   = "  [" + bar + "] " + progress.done + "/" + progress.total + "  " + label;
  process.stdout.write("\r" + line.padEnd(80).slice(0, 100));
}
function finishProgress() {
  if (progress.total > 0) process.stdout.write("\r" + " ".repeat(100) + "\r");
}

async function buildWorks() {
  if (!fs.existsSync(WORKS_DIR)) { fs.mkdirSync(WORKS_DIR); }
  const thumbDir = ensureThumbDir(WORKS_DIR);
  const cache = loadThumbCache(thumbDir);
  const files = fs.readdirSync(WORKS_DIR).filter(f => fs.statSync(path.join(WORKS_DIR,f)).isFile());
  const txtMap={}, groups={};

  for (const f of files) {
    const origExt = path.extname(f);
    const ext     = origExt.toLowerCase();
    const base    = path.basename(f, origExt);
    if (ext===".txt") { txtMap[base]=fs.readFileSync(path.join(WORKS_DIR,f),"utf8"); continue; }
    if (!MEDIA_EXT.has(ext)) continue;
    const canon = canonical(base);
    (groups[canon]=groups[canon]||[]).push(f);
  }

  const entries = [];
  for (const [canon, mediaFiles] of Object.entries(groups)) {
    const txtRaw = txtMap[canon] ?? mediaFiles.map(f=>txtMap[path.basename(f,path.extname(f))]).find(Boolean) ?? null;
    const meta = txtRaw ? parseWorkTxt(txtRaw)
      : { title:canon, description:"", tags:[], featured:false, square:false, extraMedia:[], date:"", link:"" };
    const sorted = [...mediaFiles].sort((a,b)=>{
      const na=parseInt(path.basename(a,path.extname(a)).match(/(\d+)$/)?.[1]??"0");
      const nb=parseInt(path.basename(b,path.extname(b)).match(/(\d+)$/)?.[1]??"0");
      return na-nb;
    });
    const allMedia = [...sorted, ...meta.extraMedia.filter(m=>!sorted.includes(m))];
    const primary  = allMedia[0];
    const type     = mediaType(primary);
    const dims     = readDimensions(path.join(WORKS_DIR, primary));
    const ar       = dims ? parseFloat((dims.w/dims.h).toFixed(3)) : null;

    // Per-media thumbnails (webp, capped at THUMB_MAX_PX) for EVERY item in
    // allMedia — not just the primary. Previously only the primary media got
    // a thumbnail, so stepping to the 2nd/3rd image in a multi-file gallery
    // entry loaded the raw original straight into the modal. modalThumbs[0]
    // doubles as the grid/carousel thumbnail (thumbMedia, kept below for
    // backward compatibility with the existing grid rendering code).
    const modalThumbs = [];
    // Web-safe MP4 copies (in thumbs/) for videos that wouldn't play on every
    // browser as-is (see makeWebCopy); null for images and already-fine videos.
    const webMedia = [];
    // Size-capped zoom-tier images for every image in allMedia — what the
    // pan/zoom overlay opens instead of the raw original (see ZOOM_MAX_PX).
    const zoomMedia = [];
    for (const file of allMedia) {
      const mt = mediaType(file);
      const fp = path.join(WORKS_DIR, file);
      const exists = fs.existsSync(fp);
      if (mt === "image") {
        modalThumbs.push(exists ? await makeImageThumb(fp, thumbDir, file, cache) : null);
        zoomMedia.push(exists ? await makeZoomImage(fp, thumbDir, file, cache) : null);
        webMedia.push(null);
      } else if (mt === "video") {
        const probe = exists ? probeVideo(fp) : null;
        modalThumbs.push(exists ? await makeVideoPoster(fp, thumbDir, file, cache, probe) : null);
        webMedia.push(exists ? makeWebCopy(fp, thumbDir, file, cache, probe) : null);
        zoomMedia.push(null);
      } else {
        modalThumbs.push(null);
        zoomMedia.push(null);
        webMedia.push(null);
      }
      if (exists) tickProgress(file);
    }
    const thumbMedia = modalThumbs[0];

    entries.push({
      id:canon, primaryMedia:primary, allMedia, type,
      title:meta.title||canon, description:meta.description,
      tags:meta.tags, featured:meta.featured, date:meta.date, link:meta.link,
      aspectRatio:ar, gridSpan: meta.square ? "normal" : deriveSpan(ar,type),
      thumbMedia, modalThumbs, zoomMedia, webMedia,
    });
  }

  saveThumbCache(thumbDir, cache);

  entries.sort((a,b)=>{
    if (a.date&&b.date) return b.date.localeCompare(a.date);
    return a.title.localeCompare(b.title);
  });

  // Stable URL slugs (derived from the work's id, which comes from its filename;
  // renaming a file changes its slug). Duplicates get -2, -3, ...
  const usedSlugs = new Set();
  for (const e of entries) {
    let slug = workSlugBase(e.id), n = 2;
    while (usedSlugs.has(slug)) slug = workSlugBase(e.id) + "-" + n++;
    usedSlugs.add(slug);
    e.slug = slug;
    if (isGatedWork(e)) e.gated = true;   // only ever appears in manifest-full.json
  }

  const allTags = [...new Set(entries.flatMap(e=>e.tags))].sort();
  return { generated:new Date().toISOString(), tags:allTags, works:entries };
}

// ══════════════════════════════════════════════════════════════
//  PAGES — pages.json + stub index.html files
// ══════════════════════════════════════════════════════════════

const VALID_WIDGET_TYPES = new Set([
  "image-left","text-left","split","media-only","full-bleed",
  "text-only","carousel","trio","title-bar","game-embed"
]);

function parsePageMeta(raw, folderName) {
  const b = parseBlocks(raw);
  return {
    label:           b.label || folderName,
    order:           b.order ? parseInt(b.order,10) : null,
    featured:        /^(true|yes|1)$/i.test(b.featured||""),
    carouselMedia:   b.carousel_media||null,
    carouselCaption: b.carousel_caption||"",
  };
}

function parseWidget(raw) {
  const b = parseBlocks(raw);
  const type = (b.type||"text-only").toLowerCase().trim();
  const mediaList = (b.media||"").split(/[\n,]+/).map(s=>s.trim()).filter(Boolean);
  // [compress] defaults to true — set to false to skip thumbnail generation for this widget
  const compress = !/^(false|no|0)$/i.test(b.compress||"");
  // [game] only applies to type=game-embed — subfolder (relative to the page
  // folder) containing the game's own index.html + Build/ output. Defaults
  // to "game". [media] on a game-embed widget is optional and, if present,
  // is used as the click-to-play poster image (goes through the normal
  // thumbnail pipeline like any other widget image).
  const game = (b.game || "game").trim();
  return {
    type: VALID_WIDGET_TYPES.has(type) ? type : "text-only",
    title: b.title||"",
    text:  b.text||"",
    media: mediaList,
    background: b.background||null,
    compress,
    game,
  };
}

async function buildPages() {
  if (!fs.existsSync(PAGES_DIR)) return [];
  const pageFolders = fs.readdirSync(PAGES_DIR)
    .filter(f=>fs.statSync(path.join(PAGES_DIR,f)).isDirectory());

  const pages = [];
  for (const folderName of pageFolders) {
    const pageDir = path.join(PAGES_DIR, folderName);
    const slug    = slugify(folderName);
    if (!slug) continue;
    if (slug === "full") {
      console.log("  skipping /pages/" + folderName + "/ — \"full\" is reserved for the gated-content page (see GATED_TAGS); rename the folder.");
      continue;
    }
    if (slug === "w") {
      console.log("  skipping /pages/" + folderName + "/ — \"w\" is reserved for shareable work links (/w/<name>); rename the folder.");
      continue;
    }

    const metaPath = path.join(pageDir, "_page.txt");
    const metaRaw  = fs.existsSync(metaPath) ? fs.readFileSync(metaPath,"utf8") : "";
    const meta     = parsePageMeta(metaRaw, folderName);

    const thumbDir = ensureThumbDir(pageDir);
    const cache = loadThumbCache(thumbDir);

    const allFiles = fs.readdirSync(pageDir).filter(f=>fs.statSync(path.join(pageDir,f)).isFile());
    const widgetFiles = allFiles
      .filter(f=>path.extname(f).toLowerCase()===".txt" && f.toLowerCase()!=="_page.txt")
      .sort((a,b)=>{
        const na=parseInt(a.match(/^(\d+)/)?.[1]??"999999",10);
        const nb=parseInt(b.match(/^(\d+)/)?.[1]??"999999",10);
        if (na!==nb) return na-nb;
        return a.localeCompare(b);
      });

    const widgets = [];
    for (const f of widgetFiles) {
      const raw = fs.readFileSync(path.join(pageDir,f),"utf8");
      const w   = parseWidget(raw);

      // Build media items with optional thumbnails
      const mediaItems = [];
      for (const file of w.media) {
        const mtype = mediaType(file);
        const srcPath = path.join(pageDir, file);
        const srcExists = fs.existsSync(srcPath);
        let thumb = null, zoomThumb = null, webFile = null;
        let probe = null;
        if (mtype === "video" && srcExists) probe = probeVideo(srcPath);
        if (w.compress && srcExists) {
          if (mtype === "image") thumb = await makeImageThumb(srcPath, thumbDir, file, cache);
          else if (mtype === "video") thumb = await makeVideoPoster(srcPath, thumbDir, file, cache, probe);
        }
        // A web-safe copy is about playback compatibility (e.g. iOS can't play
        // .mkv), not quality, so — like the zoom tier — it ignores [compress].
        if (mtype === "video" && srcExists) webFile = makeWebCopy(srcPath, thumbDir, file, cache, probe);
        // Zoom-tier generation always runs for images, regardless of
        // [compress] — that flag controls display-thumbnail quality, but the
        // zoom-tier cap is a stability safeguard (see ZOOM_MAX_PX above), not
        // a quality preference, so it shouldn't be opt-out-able per widget.
        if (mtype === "image" && srcExists) {
          zoomThumb = await makeZoomImage(srcPath, thumbDir, file, cache);
        }
        if (srcExists) tickProgress(file);
        mediaItems.push({ file, type:mtype, thumb, zoomThumb, webFile });
      }
      w.media = mediaItems;

      if (w.type === "game-embed") {
        const gameIndexPath = path.join(pageDir, w.game, "index.html");
        if (!fs.existsSync(gameIndexPath)) {
          console.log(`  warning: /pages/${folderName}/${f} is type "game-embed" but ` +
            `/pages/${folderName}/${w.game}/index.html doesn't exist — check [game] or the folder contents.`);
        }
      }

      widgets.push(w);
    }

    let carouselFile = meta.carouselMedia;
    if (!carouselFile) {
      const firstWithMedia = widgets.find(w=>w.media.length>0);
      if (firstWithMedia) carouselFile = firstWithMedia.media[0].file;
    }
    const carouselType = carouselFile ? mediaType(carouselFile) : null;

    saveThumbCache(thumbDir, cache);

    pages.push({
      slug, folder:folderName,
      label:meta.label, order:meta.order, featured:meta.featured,
      carouselMedia:carouselFile, carouselType, carouselCaption:meta.carouselCaption,
      widgets,
    });
  }

  pages.sort((a,b)=>{
    if (a.order!==null&&b.order!==null) return a.order-b.order;
    if (a.order!==null) return -1;
    if (b.order!==null) return 1;
    return a.label.localeCompare(b.label);
  });
  return pages;
}

function stubTemplate(slug, label, v) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>${label} \u2014 AJ Ambrozic</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/theme.css?v=${v}">
<link rel="stylesheet" href="/page-widgets.css?v=${v}">
</head>
<body>
<!-- ${STUB_MARKER}: ${slug} -- do not edit. Edit /pages/${slug}/ and re-run generate-manifest.js -->
<div id="header-root"></div>
<main id="page-root"></main>
<div id="footer-root"></div>
<script>window.PAGE_SLUG = ${JSON.stringify(slug)};</script>
<script src="/page-engine.js?v=${v}"></script>
</body>
</html>
`;
}

// /full/index.html is a byte-for-byte copy of the root index.html — same
// gallery, same code, just served from a different path so its boot()
// fetches manifest-full.json instead of manifest.json (see boot() in
// index.html). Copying it fresh on every run means there's exactly one
// source of truth to maintain; you never edit /full/index.html directly.
function writeFullPageStub() {
  const rootIndexPath = path.join(__dirname, "index.html");
  if (!fs.existsSync(rootIndexPath)) return;
  if (!fs.existsSync(FULL_PAGE_DIR)) fs.mkdirSync(FULL_PAGE_DIR, { recursive:true });
  fs.copyFileSync(rootIndexPath, path.join(FULL_PAGE_DIR, "index.html"));
}

function escAttr(v) {
  return String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function absUrl(rel) {   // "works/thumbs/a b.webp" -> "https://site/works/thumbs/a%20b.webp"
  return SITE_URL + "/" + rel.split("/").map(encodeURIComponent).join("/");
}
function excerpt(work) {
  let t = String(work.description || "").replace(/\s+/g, " ").trim();
  if (!t) return (work.tags && work.tags.length) ? work.tags.join(" \u00b7 ") : "A work by " + SITE_NAME;
  if (t.length > OG_DESC_MAX) {
    t = t.slice(0, OG_DESC_MAX);
    const sp = t.lastIndexOf(" ");
    if (sp > OG_DESC_MAX * 0.6) t = t.slice(0, sp);
    t = t.replace(/[\s,.;:\u2014-]+$/, "") + "\u2026";
  }
  return t;
}

// Preview image for an ordinary (public) work: the existing WebP thumbnail /
// video poster, else the original if it's a web-friendly image. Returns
// { url, width, height } or null.
async function publicPreviewImage(w) {
  let rel = null;
  if (w.thumbMedia) rel = "works/thumbs/" + w.thumbMedia;
  else if (w.type === "image" && /\.(jpe?g|png|webp)$/i.test(w.primaryMedia)) rel = "works/" + w.primaryMedia;
  if (!rel) return null;
  const file = path.join(__dirname, rel);
  if (!fs.existsSync(file)) return null;
  let width = null, height = null;
  if (sharp) { try { const m = await sharp(file).metadata(); width = m.width; height = m.height; } catch (_) {} }
  return { url: absUrl(rel), width, height };
}

// Gated works: a small, heavily blurred copy of the image, saved next to the
// stub (full/w/<slug>.preview.webp). The real image is never used in the
// preview. No sharp -> no image at all (never fall back to the sharp original).
async function gatedPreviewImage(w, dir) {
  if (!sharp) return null;
  let src = null;
  if (w.thumbMedia && fs.existsSync(path.join(__dirname, "works", "thumbs", w.thumbMedia)))
    src = path.join(__dirname, "works", "thumbs", w.thumbMedia);
  else if (w.type === "image" && fs.existsSync(path.join(__dirname, "works", w.primaryMedia)))
    src = path.join(__dirname, "works", w.primaryMedia);
  if (!src) return null;
  const file = w.slug + ".preview.webp";
  try {
    const info = await sharp(src, { limitInputPixels: false })
      .resize(OG_BLUR_WIDTH, null, { withoutEnlargement: true })
      .blur(OG_BLUR_SIGMA).webp({ quality: 70 }).toFile(path.join(dir, file));
    return { url: SITE_URL + "/full/w/" + encodeURIComponent(file), width: info.width, height: info.height, file };
  } catch (e) { logLine("  blurred preview FAILED for " + w.slug + ": " + (e.message || e)); return null; }
}

// og:video (plays inline in Discord): only for public video works whose
// playable file is a small MP4.
function publicPreviewVideo(w) {
  if (w.type !== "video") return null;
  let rel = null;
  if (w.webMedia && w.webMedia[0]) rel = "works/thumbs/" + w.webMedia[0];
  else if (/\.mp4$/i.test(w.primaryMedia)) rel = "works/" + w.primaryMedia;
  if (!rel) return null;
  const file = path.join(__dirname, rel);
  let size; try { size = fs.statSync(file).size; } catch (_) { return null; }
  if (size > OG_VIDEO_MAX_BYTES) return null;
  const pr = probeVideo(file);
  return { url: absUrl(rel), width: pr ? pr.width : null, height: pr ? pr.height : null };
}

function previewStubHtml(w, ctx) {
  const e = escAttr;
  const title = w.title;
  const desc  = excerpt(w);
  const target = (w.gated ? "/full/" : "/") + "?work=" + encodeURIComponent(w.slug);
  const m = [];
  m.push(`<meta name="robots" content="noindex, nofollow">`);
  m.push(`<link rel="canonical" href="${e(ctx.url)}">`);
  m.push(`<meta name="description" content="${e(desc)}">`);
  m.push(`<meta property="og:site_name" content="${e(SITE_NAME)}">`);
  m.push(`<meta property="og:type" content="${ctx.video ? "video.other" : "website"}">`);
  m.push(`<meta property="og:title" content="${e(title)}">`);
  m.push(`<meta property="og:description" content="${e(desc)}">`);
  m.push(`<meta property="og:url" content="${e(ctx.url)}">`);
  if (ctx.image) {
    m.push(`<meta property="og:image" content="${e(ctx.image.url)}">`);
    if (ctx.image.width && ctx.image.height) {
      m.push(`<meta property="og:image:width" content="${ctx.image.width}">`);
      m.push(`<meta property="og:image:height" content="${ctx.image.height}">`);
    }
    m.push(`<meta property="og:image:alt" content="${e(title)}">`);
  }
  if (ctx.video) {
    m.push(`<meta property="og:video" content="${e(ctx.video.url)}">`);
    m.push(`<meta property="og:video:secure_url" content="${e(ctx.video.url)}">`);
    m.push(`<meta property="og:video:type" content="video/mp4">`);
    if (ctx.video.width && ctx.video.height) {
      m.push(`<meta property="og:video:width" content="${ctx.video.width}">`);
      m.push(`<meta property="og:video:height" content="${ctx.video.height}">`);
    }
  }
  m.push(`<meta name="twitter:card" content="${ctx.image ? "summary_large_image" : "summary"}">`);
  m.push(`<meta name="twitter:title" content="${e(title)}">`);
  m.push(`<meta name="twitter:description" content="${e(desc)}">`);
  if (ctx.image) m.push(`<meta name="twitter:image" content="${e(ctx.image.url)}">`);
  return `<!DOCTYPE html>
<!-- ${PREVIEW_MARKER}: ${w.slug} -- do not edit; regenerated by generate-manifest.js -->
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${e(title)} — ${e(SITE_NAME)}</title>
${m.join("\n")}
<script>
// Link-preview bots read the tags above and stop here. People get forwarded
// into the gallery with this work open (any ?m= / ?zoom= is passed along).
(function () {
  var q = location.search.replace(/^\\?/, "");
  location.replace(${JSON.stringify(target)} + (q ? "&" + q : ""));
})();
</script>
</head>
<body style="background:#0e0e0e;color:#e8e4dc;font-family:sans-serif;padding:2rem">
<p>Opening <a href="${e(target)}" style="color:#c8b89a">${e(title)}</a>…</p>
</body>
</html>
`;
}

async function writePreviewStubs(works) {
  const keep = new Map([[PREVIEW_DIR, new Set()], [FULL_PREVIEW_DIR, new Set()]]);
  let count = 0, blurred = 0;
  for (const w of works) {
    const gated = !!w.gated;
    const dir = gated ? FULL_PREVIEW_DIR : PREVIEW_DIR;
    fs.mkdirSync(dir, { recursive: true });
    const url = SITE_URL + (gated ? "/full/w/" : "/w/") + w.slug;
    const image = gated ? await gatedPreviewImage(w, dir) : await publicPreviewImage(w);
    const video = gated ? null : publicPreviewVideo(w);
    if (gated && image) { blurred++; keep.get(dir).add(image.file); }
    const name = w.slug + ".html";
    fs.writeFileSync(path.join(dir, name), previewStubHtml(w, { url, image, video }));
    keep.get(dir).add(name);
    count++;
  }
  // Remove stubs/previews for works that no longer exist (only files we made).
  for (const [dir, keepSet] of keep) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (keepSet.has(f)) continue;
      const fp = path.join(dir, f);
      try {
        if (f.endsWith(".preview.webp")) { fs.unlinkSync(fp); continue; }
        if (f.endsWith(".html") && fs.readFileSync(fp, "utf8").includes(PREVIEW_MARKER)) {
          fs.unlinkSync(fp);
          logLine("  removed stale link preview: " + path.relative(__dirname, fp));
        }
      } catch (_) {}
    }
    try { if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir); } catch (_) {}
  }
  return { count, blurred };
}

function writeStubs(pages) {
  const validSlugs = new Set(pages.map(p=>p.slug));
  // Version stamp changes on every run, forcing browsers/CDNs to fetch
  // fresh copies of theme.css, page-widgets.css, and page-engine.js.
  const v = Date.now();

  for (const p of pages) {
    const dir = path.join(__dirname, p.slug);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir,{recursive:true});
    fs.writeFileSync(path.join(dir,"index.html"), stubTemplate(p.slug, p.label, v));
  }

  // Remove stale stubs (only stubs WE generated — checked via marker string)
  const rootEntries = fs.readdirSync(__dirname).filter(f=>{
    try { return fs.statSync(path.join(__dirname,f)).isDirectory(); } catch(_) { return false; }
  });
  for (const entry of rootEntries) {
    if (validSlugs.has(entry)) continue;
    const indexPath = path.join(__dirname, entry, "index.html");
    if (!fs.existsSync(indexPath)) continue;
    let content="";
    try { content=fs.readFileSync(indexPath,"utf8"); } catch(_) { continue; }
    if (content.includes(STUB_MARKER)) {
      fs.unlinkSync(indexPath);
      const remaining=fs.readdirSync(path.join(__dirname,entry));
      if (remaining.length===0) fs.rmdirSync(path.join(__dirname,entry));
      console.log("  removed stale stub: /" + entry + "/");
    }
  }
}

// ══════════════════════════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════════════════════════
async function build() {
  console.log("generate-manifest.js — " + SCRIPT_VERSION + "\n");
  // Report thumbnail tool availability
  if (!sharp) console.log("\nNote: sharp not installed — skipping image thumbnails. Run: npm install sharp\n");
  if (hasFfmpeg) console.log("ffmpeg: " + (ffmpegVersionLine || "found") + (hasFfprobe ? "" : "  (no ffprobe)") + (hasX264 ? "" : "  (NO libx264 encoder)") + "\n");
  if (!hasFfmpeg) console.log("Note: ffmpeg not found — skipping video poster frames and web-safe video copies.\n");
  else if (!hasFfprobe) console.log("Note: ffprobe not found (it normally ships with ffmpeg) — videos will only be converted by container, not by codec.\n");

  await enforceSizeLimits();

  progress.total = countMediaFiles(WORKS_DIR) + countMediaFiles(PAGES_DIR);
  if (progress.total > 0 && sharp) {
    console.log("Compressing images & videos — this can take a while for large files.");
    console.log("DO NOT CLOSE this window until you see \"Done compressing\" below.\n");
  }

  const manifestFull = await buildWorks();
  const pages = await buildPages();
  finishProgress();
  if (progress.total > 0 && sharp) console.log("Done compressing.\n");

  // manifest.json (public) excludes gated-tag works entirely; manifest-full.json
  // (loaded only by /full/) includes everything. See GATED_TAGS above.
  const publicWorks = manifestFull.works.filter(e => !isGatedWork(e));
  const publicTags  = [...new Set(publicWorks.flatMap(e=>e.tags))].sort();
  const manifestPublic = { generated: manifestFull.generated, tags: publicTags, works: publicWorks };
  const gatedCount = manifestFull.works.length - publicWorks.length;

  fs.writeFileSync(MANIFEST_OUT, JSON.stringify(manifestPublic,null,2));
  fs.writeFileSync(MANIFEST_FULL_OUT, JSON.stringify(manifestFull,null,2));
  writeFullPageStub();
  const previews = await writePreviewStubs(manifestFull.works);

  console.log("manifest.json: " + publicWorks.length + " work(s), " + publicTags.length + " tag(s)"
    + (gatedCount ? "  (+" + gatedCount + " gated — see manifest-full.json / /full/)" : "") + "\n");
  for (const e of manifestFull.works) {
    const span  = e.gridSpan.padEnd(10);
    const ar    = e.aspectRatio ? e.aspectRatio+" ar" : "no dims";
    let thumb = e.thumbMedia ? " [thumb: "+e.thumbMedia+"]" : (sharp ? " [no thumb]" : "");
    if (e.type === "video" && !e.thumbMedia)
      thumb = !hasFfmpeg ? " [NO VIDEO POSTER: ffmpeg not found]"
            : " [NO VIDEO POSTER: see \"Videos with problems\" below]";
    const gated = isGatedWork(e) ? "  [GATED, /full/ only]" : "";
    console.log("  "+span+" "+e.title+"  ("+ar+", "+e.allMedia.length+" file(s))"+thumb+gated);
  }

  console.log("\nlink previews: " + previews.count + " file(s) in w/ and full/w/" + (previews.blurred ? " (" + previews.blurred + " blurred gated preview image(s))" : ""));

  fs.writeFileSync(PAGES_OUT, JSON.stringify({generated:new Date().toISOString(),pages},null,2));
  writeStubs(pages);
  console.log("\npages.json: " + pages.length + " page(s)\n");
  for (const p of pages)
    console.log("  /"+p.slug+"/  \""+p.label+"\"  "+p.widgets.length+" widget(s)"+(p.featured?"  [carousel]":""));

  const webCopies = manifestFull.works.reduce((n, e) => n + (e.webMedia || []).filter(Boolean).length, 0);
  if (webCopies) console.log("\n" + webCopies + " video(s) in works/ have a web-safe copy in works/thumbs/ (served instead of the original).");
  warnLargeFiles();
  if (!hasFfmpeg) {
    let vids = 0;
    for (const e of manifestFull.works) vids += (e.allMedia || []).filter(f => mediaType(f) === "video").length;
    for (const pg of pages) for (const w of pg.widgets) vids += (w.media || []).filter(m => m.type === "video").length;
    if (vids) {
      console.log("\n" + "=".repeat(64));
      console.log("WARNING: ffmpeg was NOT FOUND on this computer, so " + vids + " video(s) got");
      console.log("no poster image and no web-safe copy. On iPhones, videos without a");
      console.log("poster show up blank in the grid, and .mkv files won't play at all.");
      console.log("Install ffmpeg, open a NEW terminal window, confirm that");
      console.log("  ffmpeg -version");
      console.log("prints a version number, then run this script again.");
      console.log("=".repeat(64));
    }
  }
  if (videoProblems.length) {
    console.log("\nVideos with problems (they will be retried on the next run):");
    for (const pr of videoProblems)
      console.log("  " + pr.file + "  [" + pr.what + "]  " + pr.why + (pr.hint ? "\n      -> " + pr.hint : ""));
    console.log("\nIf several of these mention a missing decoder/encoder, update ffmpeg and re-run.");
  }
  console.log("");
}

build().catch(e => { console.error("Build error:", e.message); process.exit(1); });
