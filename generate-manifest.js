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
const { execSync } = require("child_process");

// ── Optional thumbnail dependencies ─────────────────────────
// sharp: npm install sharp  (images → compressed WebP thumbnails)
// ffmpeg: system install    (videos → poster frame JPEGs)
let sharp = null;
try { sharp = require("sharp"); } catch(_) {}

let hasFfmpeg = false;
try { execSync("ffmpeg -version", { stdio:"pipe" }); hasFfmpeg = true; } catch(_) {}

const THUMB_DIR    = "thumbs";   // subfolder name inside works/ and pages/<slug>/
const THUMB_MAX_PX = 1200;       // longest side of grid/modal thumbnail
const THUMB_QUALITY = 82;        // WebP quality (0-100)

// Zoom-tier — what the pan/zoom overlay actually loads, instead of the raw
// original. This exists to cap DECODED PIXEL DIMENSIONS, not just file size.
// The overlay renders its image inside a `will-change: transform` layer,
// which forces the browser to allocate a GPU-backed texture sized to the
// image's native pixel dimensions — regardless of how small the file is on
// disk. An oversized original (a 30+ MB photo, or just a very high native
// resolution) can exceed an older device's texture/compositor limit and
// crash the tab, even though it displays at a small on-screen scale.
// Converting to WebP alone would NOT fix this — it shrinks bytes on disk,
// not decoded pixels. ZOOM_MAX_PX is the part that actually matters; the
// WebP re-encode is a free bonus (faster download) that rides along with it.
// 4096px comfortably exceeds what any screen can show pixel-for-pixel even
// at max pinch-zoom, so this shouldn't be visible as a quality loss — but
// raise it if you want more headroom on capable devices (at the cost of
// reintroducing risk on old ones).
const ZOOM_MAX_PX  = 4096;
const ZOOM_QUALITY = 90;

const WORKS_DIR   = path.join(__dirname, "works");
const PAGES_DIR   = path.join(__dirname, "pages");
const MANIFEST_OUT = path.join(__dirname, "manifest.json");
const PAGES_OUT   = path.join(__dirname, "pages.json");
const STUB_MARKER = "AUTO-GENERATED-PAGE-STUB";

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

// Returns the thumb filename (e.g. "mywork.webp") or null on failure.
// Skips regeneration if the existing thumb is newer than the source.
async function makeImageThumb(srcPath, thumbDir, srcFilename) {
  if (!sharp) return null;
  const ext = path.extname(srcFilename).toLowerCase();
  if (ext === ".gif") return null; // skip: converting GIF kills animation
  const baseName  = path.basename(srcFilename, path.extname(srcFilename));
  const thumbName = baseName + ".webp";
  const thumbPath = path.join(thumbDir, thumbName);
  try {
    const srcMtime = fs.statSync(srcPath).mtimeMs;
    try { if (fs.statSync(thumbPath).mtimeMs >= srcMtime) return thumbName; } catch(_) {}
    await sharp(srcPath)
      .resize(THUMB_MAX_PX, THUMB_MAX_PX, { fit:"inside", withoutEnlargement:true })
      .webp({ quality:THUMB_QUALITY })
      .toFile(thumbPath);
    return thumbName;
  } catch(e) {
    process.stdout.write("  thumb skipped (" + srcFilename + "): " + e.message + "\n");
    return null;
  }
}

// Returns the zoom-tier filename (e.g. "mywork_zoom.webp") or null.
// This is a size-capped stand-in for the raw original — see ZOOM_MAX_PX
// comment above for why capping dimensions (not just file size) matters.
async function makeZoomImage(srcPath, thumbDir, srcFilename) {
  if (!sharp) return null;
  const ext = path.extname(srcFilename).toLowerCase();
  if (ext === ".gif") return null; // skip: converting GIF kills animation
  const baseName = path.basename(srcFilename, path.extname(srcFilename));
  const zoomName = baseName + "_zoom.webp";
  const zoomPath = path.join(thumbDir, zoomName);
  try {
    const srcMtime = fs.statSync(srcPath).mtimeMs;
    try { if (fs.statSync(zoomPath).mtimeMs >= srcMtime) return zoomName; } catch(_) {}
    await sharp(srcPath)
      .resize(ZOOM_MAX_PX, ZOOM_MAX_PX, { fit:"inside", withoutEnlargement:true })
      .webp({ quality:ZOOM_QUALITY })
      .toFile(zoomPath);
    return zoomName;
  } catch(e) {
    process.stdout.write("  zoom image skipped (" + srcFilename + "): " + e.message + "\n");
    return null;
  }
}

// Returns the poster filename (e.g. "myvideo_poster.jpg") or null.
function makeVideoThumb(srcPath, thumbDir, srcFilename) {
  if (!hasFfmpeg) return null;
  const baseName  = path.basename(srcFilename, path.extname(srcFilename));
  const thumbName = baseName + "_poster.jpg";
  const thumbPath = path.join(thumbDir, thumbName);
  try {
    const srcMtime = fs.statSync(srcPath).mtimeMs;
    try { if (fs.statSync(thumbPath).mtimeMs >= srcMtime) return thumbName; } catch(_) {}
    execSync(
      `ffmpeg -i "${srcPath}" -vf "thumbnail=300,scale=${THUMB_MAX_PX}:-1" -frames:v 1 "${thumbPath}" -y`,
      { stdio:"pipe" }
    );
    return thumbName;
  } catch(_) { return null; }
}

function ensureThumbDir(dir) {
  const d = path.join(dir, THUMB_DIR);
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive:true });
  return d;
}

async function buildWorks() {
  if (!fs.existsSync(WORKS_DIR)) { fs.mkdirSync(WORKS_DIR); }
  const thumbDir = ensureThumbDir(WORKS_DIR);
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
    // Size-capped zoom-tier images for every image in allMedia — what the
    // pan/zoom overlay opens instead of the raw original (see ZOOM_MAX_PX).
    const zoomMedia = [];
    for (const file of allMedia) {
      const mt = mediaType(file);
      const fp = path.join(WORKS_DIR, file);
      const exists = fs.existsSync(fp);
      if (mt === "image") {
        modalThumbs.push(exists ? await makeImageThumb(fp, thumbDir, file) : null);
        zoomMedia.push(exists ? await makeZoomImage(fp, thumbDir, file) : null);
      } else if (mt === "video") {
        modalThumbs.push(exists ? makeVideoThumb(fp, thumbDir, file) : null);
        zoomMedia.push(null);
      } else {
        modalThumbs.push(null);
        zoomMedia.push(null);
      }
    }
    const thumbMedia = modalThumbs[0];

    entries.push({
      id:canon, primaryMedia:primary, allMedia, type,
      title:meta.title||canon, description:meta.description,
      tags:meta.tags, featured:meta.featured, date:meta.date, link:meta.link,
      aspectRatio:ar, gridSpan: meta.square ? "normal" : deriveSpan(ar,type),
      thumbMedia, modalThumbs, zoomMedia,
    });
  }

  entries.sort((a,b)=>{
    if (a.date&&b.date) return b.date.localeCompare(a.date);
    return a.title.localeCompare(b.title);
  });

  const allTags = [...new Set(entries.flatMap(e=>e.tags))].sort();
  return { generated:new Date().toISOString(), tags:allTags, works:entries };
}

// ══════════════════════════════════════════════════════════════
//  PAGES — pages.json + stub index.html files
// ══════════════════════════════════════════════════════════════

const VALID_WIDGET_TYPES = new Set([
  "image-left","text-left","split","media-only","full-bleed",
  "text-only","carousel","trio","title-bar"
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
  return {
    type: VALID_WIDGET_TYPES.has(type) ? type : "text-only",
    title: b.title||"",
    text:  b.text||"",
    media: mediaList,
    background: b.background||null,
    compress,
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

    const metaPath = path.join(pageDir, "_page.txt");
    const metaRaw  = fs.existsSync(metaPath) ? fs.readFileSync(metaPath,"utf8") : "";
    const meta     = parsePageMeta(metaRaw, folderName);

    const thumbDir = ensureThumbDir(pageDir);

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
        let thumb = null, zoomThumb = null;
        if (w.compress && srcExists) {
          if (mtype === "image") thumb = await makeImageThumb(srcPath, thumbDir, file);
          else if (mtype === "video") thumb = makeVideoThumb(srcPath, thumbDir, file);
        }
        // Zoom-tier generation always runs for images, regardless of
        // [compress] — that flag controls display-thumbnail quality, but the
        // zoom-tier cap is a stability safeguard (see ZOOM_MAX_PX above), not
        // a quality preference, so it shouldn't be opt-out-able per widget.
        if (mtype === "image" && srcExists) {
          zoomThumb = await makeZoomImage(srcPath, thumbDir, file);
        }
        mediaItems.push({ file, type:mtype, thumb, zoomThumb });
      }
      w.media = mediaItems;
      widgets.push(w);
    }

    let carouselFile = meta.carouselMedia;
    if (!carouselFile) {
      const firstWithMedia = widgets.find(w=>w.media.length>0);
      if (firstWithMedia) carouselFile = firstWithMedia.media[0].file;
    }
    const carouselType = carouselFile ? mediaType(carouselFile) : null;

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
  // Report thumbnail tool availability
  if (!sharp) console.log("\nNote: sharp not installed — skipping image thumbnails. Run: npm install sharp\n");
  if (!hasFfmpeg) console.log("Note: ffmpeg not found — skipping video poster frames.\n");

  const manifest = await buildWorks();
  fs.writeFileSync(MANIFEST_OUT, JSON.stringify(manifest,null,2));
  console.log("\nmanifest.json: " + manifest.works.length + " work(s), " + manifest.tags.length + " tag(s)\n");
  for (const e of manifest.works) {
    const span  = e.gridSpan.padEnd(10);
    const ar    = e.aspectRatio ? e.aspectRatio+" ar" : "no dims";
    const thumb = e.thumbMedia ? " [thumb: "+e.thumbMedia+"]" : (sharp ? " [no thumb]" : "");
    console.log("  "+span+" "+e.title+"  ("+ar+", "+e.allMedia.length+" file(s))"+thumb);
  }

  const pages = await buildPages();
  fs.writeFileSync(PAGES_OUT, JSON.stringify({generated:new Date().toISOString(),pages},null,2));
  writeStubs(pages);
  console.log("\npages.json: " + pages.length + " page(s)\n");
  for (const p of pages)
    console.log("  /"+p.slug+"/  \""+p.label+"\"  "+p.widgets.length+" widget(s)"+(p.featured?"  [carousel]":""));

  console.log("\nNote: .mkv files need H.264/VP8/VP9 codec to play in-browser.\n");
}

build().catch(e => { console.error("Build error:", e.message); process.exit(1); });
