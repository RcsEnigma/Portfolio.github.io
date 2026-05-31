# Portfolio Website

A self-updating gallery-style portfolio. Add media + a `.txt` file to `/works`, run one command, done.

---

## File structure

```
portfolio/
├── index.html              ← the entire website (edit About/Contact text inside)
├── manifest.json           ← auto-generated, do not edit manually
├── generate-manifest.js    ← run this after adding works
└── works/
    ├── my_project.jpg      ← primary media
    ├── my_project.txt      ← metadata for that work
    ├── series_01.jpg       ← } these three share the same
    ├── series_02.jpg       ← } canonical name "series"
    ├── series_03.jpg       ← } and are grouped automatically
    ├── series.txt          ← metadata for the series
    └── ...
```

---

## The `.txt` format

Every field is optional. Order doesn't matter.

```
[title]
Your Work Title Here

[description]
Any length. Supports line breaks.
Second paragraph goes here.

[tags]
animation, sci-fi, 3D, personal

[date]
2024-11

[link]
https://vimeo.com/your-video

[featured]
true

[extra]
my_project_02.mp4, my_project_03.jpg
```

### Fields explained

| Field        | What it does |
|-------------|--------------|
| `[title]`   | Displayed on hover and in the modal. Defaults to filename if omitted. |
| `[description]` | Shown in the detail modal. Supports multi-line. |
| `[tags]`    | Comma or newline separated. Populates the filter menu automatically. |
| `[date]`    | Any string — `2024-11`, `Autumn 2024`, etc. Shown in modal. |
| `[link]`    | External URL — shows an "↗" button in the modal. |
| `[featured]`| Set to `true` to include this work in the hero carousel at the top. |
| `[extra]`   | Additional media files to attach (comma or newline separated filenames). |

---

## Grouping multiple media files

**Method A — numbered filenames** (easiest)

Name your files with a shared base and sequential numbers:

```
cityscape_01.jpg
cityscape_02.jpg
cityscape_03.mp4
cityscape.txt        ← one txt covers all three
```

Anything matching `cityscape*` gets bundled together automatically. The lowest-numbered file becomes the grid thumbnail.

**Method B — `[extra]` field in the txt**

```
[extra]
making_of.mp4, final_render.jpg
```

This lets you mix files with completely different names.

---

## The carousel

Add `[featured]\ntrue` to any `.txt` to include that work in the hero carousel. Multiple works can be featured — they'll auto-cycle every 5 seconds.

---

## Updating the site

```bash
# 1. Drop your new media + .txt into /works
# 2. Run:
node generate-manifest.js

# 3. Commit and push. The site reads manifest.json on load.
```

That's it. No build step, no framework, no bundler.

---

## Customising the site

Open `index.html` and find:

- **Site name** → search for `Studio Name` in the header
- **About page** → the `#about-page` div
- **Contact page** → the `#contact-page` div
- **Colours** → the `:root` CSS variables at the top of the `<style>` block
- **Grid row height** → `grid-auto-rows: 280px` (increase for taller thumbnails)

---

## Deployment

Works anywhere static files are served:

- **GitHub Pages** — push to a repo, enable Pages
- **Netlify / Vercel** — drag the folder in
- **Any web host** — upload everything

> **Local preview:** Open with a local server (e.g. `npx serve .` or VS Code Live Server). Browsers block `fetch()` on `file://` URLs, so opening `index.html` directly will use the built-in demo data instead of your manifest.
