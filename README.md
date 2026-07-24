# Portfolio

Drop files in a folder, run one command, push to GitHub. Done.

---

## Setup (do this once)

1. Put everything in a folder and push it to a GitHub repo
2. In your repo settings, enable GitHub Pages (Settings > Pages > Deploy from main branch)
3. Install Node.js from nodejs.org if you don't have it
4. Install image compression: open a terminal in your portfolio folder and run `npm install sharp`
5. Add a `.gitignore` file with `node_modules/` in it so that folder doesn't get committed

---

## Adding a new work

1. Drop your image/video file into `/works/`
2. Drop a `.txt` file with the same name into `/works/`
3. Run `node generate-manifest.js` in a terminal pointed at the folder
4. Commit and push with GitHub Desktop

That's the whole loop every time.

---

## The .txt file

Every field is optional. You can use any combination.

```
[title]
My Work Title

[description]
Whatever you want to write here.
URLs like https://yoursite.com/page automatically become clickable links.

[tags]
3D, animation, sci-fi

[date]
2024-11

[featured]
true

[square]
true

[link]
https://vimeo.com/whatever

[extra]
mywork_02.jpg, mywork_03.mp4
```

**What each field does:**

`[title]` - shows on hover and in the popup. defaults to filename if you leave it out.

`[description]` - shows in the popup info panel.

`[tags]` - comma separated. they show up as filter buttons on the site. selecting multiple tags filters to works that have ALL of them (not any of them).

`[date]` - any string. works sort newest first by this field.

`[featured]` - set to true and it shows up in the big carousel at the top of the page.

`[square]` - set to true to force a 1x1 square grid cell regardless of the image's actual dimensions.

`[link]` - shows as a clickable link in the popup.

`[extra]` - list extra files to bundle into this same gallery entry (comma separated filenames).

---

## Grouping multiple files together

Two ways to do this:

**Numbered filenames** - name your files `project_01.jpg`, `project_02.jpg`, `project_03.mp4` with the same base name. They'll automatically bundle together. The lowest numbered one becomes the thumbnail.

**The [extra] field** - list additional filenames directly in the txt file. Useful when the files have different names.

---

## Grid sizes

The grid automatically picks a span based on the image's real dimensions. Landscape goes wide, portrait goes tall, square stays square.

You can override it with `[square]\ntrue` in the txt file to force a 1x1 cell.

---

## The carousel

The big carousel at the top shows any work with `[featured]\ntrue` in its txt file. It also shows any subpages (see below) that have `[featured]\ntrue` in their `_page.txt`. Clicking a work slide opens its popup. Clicking a subpage slide takes you to that page.

---

## Thumbnails (speeds up loading)

After running `npm install sharp`, the script automatically generates compressed WebP thumbnails at 1200px in a `works/thumbs/` folder. The grid and carousel use these. The zoom-in view always loads the original full-res file.

GIFs are skipped (compressing them kills the animation).

For videos, if you have ffmpeg installed on your system, it'll extract a poster frame as a thumbnail. If not, it just skips it.

Thumbnails are only regenerated if the source file is newer than the existing thumbnail, so it's fast on subsequent runs.

---

## Subpages

You can make custom project pages that live at `yoursite.com/pagename/`.

Create a folder inside `/pages/` with the page name. Inside it, put:
- `_page.txt` for page-level settings
- Numbered `.txt` files for each section/widget on the page
- Your media files for that page

Run `node generate-manifest.js` and the page stub gets created automatically. Delete the source folder and run again and the stub gets cleaned up automatically.

### _page.txt

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
A short description for the homepage carousel slide.
```

`[label]` - the name shown in the nav and at the top of the page.
`[order]` - controls left-to-right order in the nav (lower number = further left).
`[featured]` - shows this page in the homepage carousel.
`[carousel_media]` - which file to use as the carousel slide image (must be in the same page folder). if you skip this it uses the first image it finds in your widgets.
`[carousel_caption]` - text shown under the title in the carousel slide.

### Widget files

Name them `01_whatever.txt`, `02_whatever.txt` etc. The number controls the order they appear on the page.

```
[type]
image-left

[title]
Section Title

[text]
Body text goes here.

[media]
myimage.jpg

[background]
#1a1a1a

[compress]
false
```

`[type]` - picks the layout (see below).
`[title]` - section heading.
`[text]` - body copy.
`[media]` - file(s) to use. some types need more than one.
`[background]` - hex color for the section background. if it's a light color the text automatically switches to dark so it stays readable.
`[compress]` - set to false to skip thumbnail generation for this widget's images. defaults to true.

### Layout types

`image-left` - image on left, text on right. on mobile stacks image above text.

`text-left` - text on left, image on right. on mobile stacks image above text.

`split` - text in the middle, one image on each side. needs two files in [media]. on mobile stacks them vertically.

`media-only` - single centered image or video with playback controls.

`full-bleed` - edge to edge media with a big title overlaid in the center.

`text-only` - centered text block, no image.

`carousel` - film strip carousel. center item is large and uncropped, neighbors peek in from the sides. 5 to 7 images works best. on mobile shows 3.

`trio` - three images side by side in equal columns, no text. needs three files in [media]. on mobile stacks them.

`title-bar` - big centered heading, good for dividing sections.

### Images are zoomable on subpages

Clicking any image in a widget opens the same full pan/zoom view as the main gallery. Scroll to zoom, drag to pan, Esc or the X button to close.

---

## Colours and text

All the colour variables are in the `:root` block at the top of `index.html`. Same variables are in `theme.css` for subpages. If you change them, update both files.

About and Contact page text is in `index.html`, search for `about-page` and `contact-page`.

---

## If the subpage looks out of date after pushing

Run `node generate-manifest.js` before pushing. The script stamps a version number on the stylesheet and script links in each subpage stub, so browsers and CDNs always fetch fresh copies.

---

## Local preview

Browsers block fetch() on file:// URLs so opening index.html directly won't load your data. Use a local server instead:

```
npx serve .
```
