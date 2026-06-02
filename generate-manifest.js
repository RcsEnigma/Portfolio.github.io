/**
 * generate-manifest.js
 * Run after adding files to /works:
 *   node generate-manifest.js
 *
 * Reads image dimensions natively (no npm needed) to assign
 * correct grid spans.
 */

const fs   = require("fs");
const path = require("path");

const WORKS_DIR    = path.join(__dirname, "works");
const MANIFEST_OUT = path.join(__dirname, "manifest.json");

const IMAGE_EXT = new Set([".jpg",".jpeg",".png",".gif",".webp",".avif",".svg"]);
const VIDEO_EXT = new Set([".mp4",".webm",".mov",".ogg",".mkv"]);
const MEDIA_EXT = new Set([...IMAGE_EXT, ...VIDEO_EXT]);

// ── Parse .txt file ──────────────────────────────────────────
function parseTxt(raw) {
  const out = { title:"", description:"", tags:[], featured:false, extraMedia:[], date:"", link:"" };
  const lines = raw.replace(/\r\n/g,"\n").split("\n");
  let key = null, buf = [];
  const flush = () => {
    if (!key) return;
    const val = buf.join("\n").trim();
    switch (key) {
      case "title":       out.title       = val; break;
      case "description": out.description = val; break;
      case "date":        out.date        = val; break;
      case "link":        out.link        = val; break;
      case "tags":
        out.tags = val.split(/[\n,]+/).map(t=>t.trim()).filter(Boolean); break;
      case "featured":
        out.featured = /^(true|yes|1)$/i.test(val); break;
      case "extra":
        out.extraMedia = val.split(/[\n,]+/).map(t=>t.trim()).filter(Boolean); break;
    }
    buf = []; key = null;
  };
  for (const line of lines) {
    const m = line.match(/^\[(\w+)\]\s*$/i);
    if (m) { flush(); key = m[1].toLowerCase(); } else { buf.push(line); }
  }
  flush();
  return out;
}

// ── Read image dimensions (no npm) ───────────────────────────
function readDimensions(filepath) {
  const ext = path.extname(filepath).toLowerCase();
  if (!IMAGE_EXT.has(ext) || ext === ".svg" || ext === ".avif") return null;
  try {
    const size = (ext === ".jpg" || ext === ".jpeg") ? 65536 : 128;
    const buf  = Buffer.alloc(size);
    const fd   = fs.openSync(filepath, "r");
    const read = fs.readSync(fd, buf, 0, size, 0);
    fs.closeSync(fd);
    const d = buf.slice(0, read);

    if (ext === ".png" && d[0]===0x89 && d[1]===0x50 && d.length >= 24)
      return { w: d.readUInt32BE(16), h: d.readUInt32BE(20) };

    if (ext === ".gif" && d[0]===0x47 && d[1]===0x49 && d.length >= 10)
      return { w: d.readUInt16LE(6), h: d.readUInt16LE(8) };

    if (ext === ".jpg" || ext === ".jpeg") {
      let i = 2;
      while (i < d.length - 10) {
        if (d[i] !== 0xFF) break;
        const m = d[i+1];
        const isSOF = (m>=0xC0&&m<=0xC3)||(m>=0xC5&&m<=0xC7)||
                      (m>=0xC9&&m<=0xCB)||(m>=0xCD&&m<=0xCF);
        if (isSOF) return { w: d.readUInt16BE(i+7), h: d.readUInt16BE(i+5) };
        const segLen = d.readUInt16BE(i+2);
        if (segLen < 2) break;
        i += 2 + segLen;
      }
    }

    if (ext === ".webp" && d.toString("ascii",0,4)==="RIFF" && d.toString("ascii",8,12)==="WEBP") {
      const chunk = d.toString("ascii",12,16);
      if (chunk==="VP8 " && d.length>=30)
        return { w:(d[26]|d[27]<<8)&0x3FFF, h:(d[28]|d[29]<<8)&0x3FFF };
      if (chunk==="VP8L" && d.length>=25) {
        const bits = d.readUInt32LE(21);
        return { w:(bits&0x3FFF)+1, h:((bits>>14)&0x3FFF)+1 };
      }
      if (chunk==="VP8X" && d.length>=34)
        return { w:1+(d[24]|d[25]<<8|d[26]<<16), h:1+(d[27]|d[28]<<8|d[29]<<16) };
    }
  } catch(_) {}
  return null;
}

// ── Grid span from aspect ratio ──────────────────────────────
// Tall threshold: 0.85 — any portrait or near-portrait image
function deriveSpan(ar, type) {
  if (!ar) return type === "video" ? "wide" : "normal";
  if (ar > 2.2)  return "ultrawide";
  if (ar > 1.45) return "wide";
  if (ar < 0.85) return "tall";   // raised threshold — catches more portrait images
  return "normal";
}

function canonical(base) { return base.replace(/[-_\s]*\d+$/, ""); }
function mediaType(f) {
  const ext = path.extname(f).toLowerCase();
  return VIDEO_EXT.has(ext) ? "video" : IMAGE_EXT.has(ext) ? "image" : "unknown";
}

// ── Main ─────────────────────────────────────────────────────
function build() {
  if (!fs.existsSync(WORKS_DIR)) { console.warn("Warning: /works not found, creating."); fs.mkdirSync(WORKS_DIR); }

  const files = fs.readdirSync(WORKS_DIR).filter(f => fs.statSync(path.join(WORKS_DIR,f)).isFile());
  const txtMap = {}, groups = {};

  for (const f of files) {
    const ext  = path.extname(f).toLowerCase();
    const base = path.basename(f, ext);
    if (ext === ".txt") { txtMap[base] = fs.readFileSync(path.join(WORKS_DIR,f),"utf8"); continue; }
    if (!MEDIA_EXT.has(ext)) continue;
    const canon = canonical(base);
    (groups[canon] = groups[canon] || []).push(f);
  }

  const entries = [];
  for (const [canon, mediaFiles] of Object.entries(groups)) {
    const txtRaw = txtMap[canon] ?? mediaFiles.map(f => txtMap[path.basename(f,path.extname(f))]).find(Boolean) ?? null;
    const meta = txtRaw ? parseTxt(txtRaw)
      : { title:canon, description:"", tags:[], featured:false, extraMedia:[], date:"", link:"" };

    const sorted = [...mediaFiles].sort((a,b) => {
      const na = parseInt(path.basename(a,path.extname(a)).match(/(\d+)$/)?.[1] ?? "0");
      const nb = parseInt(path.basename(b,path.extname(b)).match(/(\d+)$/)?.[1] ?? "0");
      return na - nb;
    });

    const allMedia = [...sorted, ...meta.extraMedia.filter(m => !sorted.includes(m))];
    const primary  = allMedia[0];
    const type     = mediaType(primary);
    const dims     = readDimensions(path.join(WORKS_DIR, primary));
    const ar       = dims ? parseFloat((dims.w / dims.h).toFixed(3)) : null;

    entries.push({
      id: canon, primaryMedia: primary, allMedia, type,
      title: meta.title || canon, description: meta.description,
      tags: meta.tags, featured: meta.featured, date: meta.date, link: meta.link,
      aspectRatio: ar, gridSpan: deriveSpan(ar, type),
    });
  }

  // Sort by date descending, then title — featured does NOT affect grid order
  entries.sort((a,b) => {
    if (a.date && b.date) return b.date.localeCompare(a.date);
    return a.title.localeCompare(b.title);
  });

  const allTags = [...new Set(entries.flatMap(e => e.tags))].sort();
  const manifest = { generated: new Date().toISOString(), tags: allTags, works: entries };
  fs.writeFileSync(MANIFEST_OUT, JSON.stringify(manifest, null, 2));

  console.log("\nmanifest.json written: " + entries.length + " work(s), " + allTags.length + " tag(s)\n");
  for (const e of entries) {
    const span = e.gridSpan.padEnd(10);
    const ar   = e.aspectRatio ? e.aspectRatio + " ar" : "no dims";
    const feat = e.featured ? " [featured]" : "";
    console.log("  " + span + " " + e.title + feat + "  (" + ar + ", " + e.allMedia.length + " file(s))");
  }
  console.log("\nNote: .mkv files need H.264/VP8/VP9 codec inside to play in browsers.");
  console.log();
}

build();
