/**
 * generate-manifest.js
 * Run this once after adding new files to /works:
 *   node generate-manifest.js
 *
 * It scans /works for media + .txt pairs and writes manifest.json
 * which the website reads automatically.
 */

const fs = require("fs");
const path = require("path");

const WORKS_DIR = path.join(__dirname, "works");
const MANIFEST_PATH = path.join(__dirname, "manifest.json");

const MEDIA_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".svg",
  ".mp4", ".webm", ".mov", ".ogg"
]);

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".svg"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".webm", ".mov", ".ogg"]);

// ── Parse a .txt file into structured fields ────────────────────────────────
function parseTxt(content) {
  const result = {
    title: "",
    description: "",
    tags: [],
    featured: false,
    extraMedia: [],
    date: "",
    link: "",
  };

  // Normalise line endings
  const lines = content.replace(/\r\n/g, "\n").split("\n");

  let currentKey = null;
  let buffer = [];

  const flush = () => {
    if (!currentKey) return;
    const value = buffer.join("\n").trim();
    switch (currentKey) {
      case "title":       result.title = value; break;
      case "description": result.description = value; break;
      case "date":        result.date = value; break;
      case "link":        result.link = value; break;
      case "tags":
        result.tags = value
          .split(/[\n,]+/)
          .map((t) => t.trim())
          .filter(Boolean);
        break;
      case "featured":
        result.featured = /^(true|yes|1)$/i.test(value);
        break;
      case "extra":
        result.extraMedia = value
          .split(/[\n,]+/)
          .map((t) => t.trim())
          .filter(Boolean);
        break;
    }
    buffer = [];
    currentKey = null;
  };

  for (const line of lines) {
    const keyMatch = line.match(/^\[(\w+)\]\s*$/i);
    if (keyMatch) {
      flush();
      currentKey = keyMatch[1].toLowerCase();
    } else {
      buffer.push(line);
    }
  }
  flush();

  return result;
}

// ── Detect aspect ratio bucket from filename hint or default ────────────────
function mediaType(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  return "unknown";
}

// ── Strip trailing digits + possible separator from a base name ─────────────
// e.g. "cityscape_01" → "cityscape", "project2" → "project"
function stripTrailingNumber(base) {
  return base.replace(/[-_\s]*\d+$/, "");
}

// ── Main ────────────────────────────────────────────────────────────────────
function buildManifest() {
  if (!fs.existsSync(WORKS_DIR)) {
    console.error("⚠  /works directory not found. Creating it...");
    fs.mkdirSync(WORKS_DIR);
  }

  const files = fs.readdirSync(WORKS_DIR).filter((f) => {
    const fullPath = path.join(WORKS_DIR, f);
    return fs.statSync(fullPath).isFile();
  });

  // Group media files by their "canonical base name" (stripping trailing numbers)
  // and collect txt files separately.
  const txtMap = {};      // base → txt content
  const mediaGroups = {}; // canonicalBase → [filename, ...]

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const base = path.basename(file, ext);

    if (ext === ".txt") {
      txtMap[base] = fs.readFileSync(path.join(WORKS_DIR, file), "utf8");
      continue;
    }

    if (!MEDIA_EXTENSIONS.has(ext)) continue;

    const canonical = stripTrailingNumber(base);
    if (!mediaGroups[canonical]) mediaGroups[canonical] = [];
    // Keep original filename; sort later
    mediaGroups[canonical].push(file);
  }

  // For every canonical group, find the matching txt (exact base, or canonical)
  const entries = [];

  for (const [canonical, mediaFiles] of Object.entries(mediaGroups)) {
    // Try exact match first (for files without a number suffix),
    // then stripped canonical.
    const txtContent =
      txtMap[canonical] ??
      txtMap[mediaFiles[0] && path.basename(mediaFiles[0], path.extname(mediaFiles[0]))] ??
      null;

    const meta = txtContent
      ? parseTxt(txtContent)
      : { title: canonical, description: "", tags: [], featured: false, extraMedia: [], date: "", link: "" };

    // Sort primary media: non-numbered file first, then numbered ascending
    const sortedMedia = [...mediaFiles].sort((a, b) => {
      const aBase = path.basename(a, path.extname(a));
      const bBase = path.basename(b, path.extname(b));
      const aNum = parseInt(aBase.match(/(\d+)$/)?.[1] ?? "0", 10);
      const bNum = parseInt(bBase.match(/(\d+)$/)?.[1] ?? "0", 10);
      return aNum - bNum;
    });

    // Merge extra media declared in txt
    const allMedia = [
      ...sortedMedia,
      ...meta.extraMedia.filter((m) => !sortedMedia.includes(m)),
    ];

    entries.push({
      id: canonical,
      primaryMedia: allMedia[0],
      allMedia,
      type: mediaType(allMedia[0]),
      title: meta.title || canonical,
      description: meta.description,
      tags: meta.tags,
      featured: meta.featured,
      date: meta.date,
      link: meta.link,
    });
  }

  // Sort: featured first, then by date desc, then alpha
  entries.sort((a, b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    if (a.date && b.date) return b.date.localeCompare(a.date);
    return a.title.localeCompare(b.title);
  });

  // Collect all tags
  const allTags = [...new Set(entries.flatMap((e) => e.tags))].sort();

  const manifest = { generated: new Date().toISOString(), tags: allTags, works: entries };
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

  console.log(`✅  manifest.json written — ${entries.length} work(s), ${allTags.length} tag(s)`);
  console.log("    Works:", entries.map((e) => `"${e.title}"`).join(", "));
  console.log("    Tags:", allTags.join(", ") || "(none)");
}

buildManifest();
