# Portfolio Website

A self-updating gallery-style portfolio, plus an optional system for
fully custom subpages (case studies, deep-dive project pages, etc).
Add files, run one script, push.

---

## File structure

```
portfolio/
├── index.html              the main gallery homepage
├── theme.css                shared styles for subpages
├── page-widgets.css         layout styles for subpage widgets
├── page-engine.js           renders subpages (don't edit)
├── generate-manifest.js     run this after adding anything
├── manifest.json            auto-generated — gallery data
├── pages.json                auto-generated — subpage data
├── .gitattributes
├── works/                    gallery pieces
│   ├── my_project.jpg
│   └── my_project.txt
├── pages/                    custom subpages
│   └── studies/
│       ├── _page.txt
│       ├── 01_intro.txt
│       ├── 01_intro_hero.jpg
│       └── 02_showcase.txt
└── studies/                  AUTO-GENERATED — gives the page a real URL
    └── index.html            never edit this directly
```

Every time you add or change anything in `/works` or `/pages`, run:

```bash
node generate-manifest.js
```

then commit and push as usual. That single command rebuilds the gallery,
rebuilds every subpage, and creates or removes the tiny auto-generated
folders that give each subpage a clean URL like `yoursite.com/studies/`.

---

## Part 1 — The gallery (`/works`)

### The `.txt` format

```
[title]
Your Work Title Here

[description]
Any length. Supports line breaks.

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

| Field | What it does |
|---|---|
| `[title]` | Shown on hover and in the lightbox. Defaults to filename. |
| `[description]` | Shown in the lightbox info panel. Any `https://` URL typed inline becomes a clickable link automatically — useful for linking to a subpage. |
| `[tags]` | Comma or newline separated. Selecting multiple tags shows only works that have **all** selected tags (AND logic, not OR). |
| `[date]` | Any string. Works sort newest-first by this field. |
| `[link]` | External URL, shown as a dedicated link button in the lightbox. |
| `[featured]` | `true` to include this work in the homepage carousel. |
| `[extra]` | Extra media files to bundle into this work's gallery. |

### Grouping multiple files into one gallery entry

**Numbered filenames** (easiest): `cityscape_01.jpg`, `cityscape_02.jpg`,
`cityscape.txt` — anything sharing a base name bundles automatically,
lowest number becomes the thumbnail.

**`[extra]` field**: list filenames directly in the `.txt`, useful when
filenames don't share a pattern.

### Grid spans

`generate-manifest.js` reads each image's real dimensions and assigns a
grid span automatically — wide for landscape, tall for portrait
(anything narrower than ~0.85 aspect ratio), normal for square-ish.
Videos default to wide if dimensions can't be read.

---

## Part 2 — Custom subpages (`/pages`)

Use this for anything bigger than a single gallery card — a case study,
a deep dive, a multi-part showcase. Each subpage gets its own real URL.

### Folder structure for one page

```
pages/studies/
├── _page.txt          page-level settings
├── 01_intro.txt        first widget (section)
├── 01_intro_hero.jpg
├── 02_showcase.txt     second widget
└── 02_showcase_01.jpg
```

The folder name becomes the URL slug (lowercased, spaces become
hyphens) — `pages/Case Study One/` becomes `yoursite.com/case-study-one/`.

### `_page.txt` — page-level settings

```
[label]
Studies

[order]
1

[featured]
true

[carousel_media]
hero.jpg

[carousel_caption]
A short blurb shown under the title in the homepage carousel.
```

| Field | What it does |
|---|---|
| `[label]` | Shown in the nav tab and as the page's `<h1>`. |
| `[order]` | Optional. Controls left-to-right position among your custom nav tabs. Omit to sort alphabetically. |
| `[featured]` | `true` to include this page in the homepage carousel. |
| `[carousel_media]` | Filename (lives in this same page folder) used as the carousel preview. If omitted, the first widget with media is used automatically. |
| `[carousel_caption]` | Optional subtitle text for the carousel slide. Clicking the slide takes the visitor straight to the page. |

### Widget files — one `.txt` per section

Every other `.txt` file in the page folder (except `_page.txt`) is a
widget. They render top to bottom in filename order — prefix with
numbers (`01_`, `02_`...) to control the sequence.

```
[type]
image-left

[title]
Section Title

[text]
Body copy. Multiple paragraphs are fine.

[media]
some_image.jpg

[background]
#141414
```

`[background]` is optional — omit it and the section blends into the
site's normal background. Set a hex code to break a section out visually.

### The nine layout types

| `[type]` value | What it looks like | On mobile |
|---|---|---|
| `image-left` | Image left, text right | Image stacks above text |
| `text-left` | Text left, image right | Image stacks above text |
| `split` | Text centered, one image on each side | Image, text, image — stacked |
| `media-only` | A single centered image or video (with playback controls) | Same |
| `full-bleed` | Edge-to-edge media, large centered title overlaid | Same, smaller type |
| `text-only` | Centered text block, no media | Same |
| `carousel` | Swipeable multi-media block, same UI as the homepage hero | Same |
| `trio` | Three images in a horizontal row, equal width, no text | Stacks vertically |
| `title-bar` | Large centered heading strip — quick section divider | Same |

For `split`, `[media]` needs two filenames — first is left, second is right.

For `trio`, `[media]` needs three filenames. Images are cropped to a 4:3 ratio.

For `carousel`, `[media]` takes any number of filenames.

### Clicking images to zoom

All images on subpages (in `image-left`, `text-left`, `split`, `media-only`, and `trio`
widgets) can be clicked to open a full-screen zoom overlay. Click anywhere
outside the image or press Escape to close it.

---

## Deleting a page

Delete the folder under `/pages/`, run `node generate-manifest.js`
again, and the script automatically removes the matching auto-generated
URL folder too. It only ever touches folders it created itself (marked
internally), so it will never delete `/works`, `/pages`, or anything
you made by hand.

---

## Customising site-wide text & colours

- **Site name, About/Contact copy** — edit directly inside `index.html`
- **Colours, fonts** — the `:root` CSS variables at the top of
  `index.html`'s `<style>` block. If you change them, also update the
  matching `:root` block in `theme.css` so subpages stay visually
  consistent.

---

## Local preview

Browsers block `fetch()` on `file://` URLs, so opening `index.html`
directly won't load your real data — use a local server instead:

```bash
npx serve .
```

---

## Deployment

Works on GitHub Pages, Netlify, Vercel, or any static host. If using a
custom domain, point it at the repo root the same way you already have
— subpages rely on root-relative paths (`/works/...`, `/pages/...`,
`/theme.css`) so they work correctly regardless of which page you're
viewing.
