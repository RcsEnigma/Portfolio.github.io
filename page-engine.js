/**
 * page-engine.js
 * Renders a single custom subpage. Loaded by auto-generated stub files.
 * Do not edit directly — change /pages/<slug>/ then re-run generate-manifest.js.
 */

(function () {
  const SLUG = window.PAGE_SLUG;
  let pagesData = null;

  // ── Critical styles injected at boot ────────────────────────────
  // Lives here rather than page-widgets.css so a stale CDN-cached
  // stylesheet can never break these features.
  ;(function injectCriticalStyles() {
    const s = document.createElement("style");
    s.textContent =
      // Title-bar heading — large, close to full-bleed but slightly smaller
      ".w-title-bar-heading{" +
        "font-size:clamp(2.6rem,6.5vw,5rem)!important;" +
        "letter-spacing:.05em!important;" +
        "line-height:1.05!important;" +
      "}" +

      // Carousel stage
      ".w-carousel-stage{" +
        "position:relative;width:100%;height:clamp(300px,44vh,520px);" +
        "overflow:hidden;background:var(--bg);" +
      "}" +

      // Carousel items — all items share the same CSS width (44% of stage).
      // Scale() in the transform handles visual size differences between slots.
      // This means only `left` animates position and `transform` animates scale —
      // no width animation, which was causing the "grows while sliding" artifact.
      ".w-carousel-item{" +
        "position:absolute;top:0;height:100%;overflow:hidden;" +
        "width:44%;border-radius:var(--radius);" +
        "transition:" +
          "left .55s cubic-bezier(.22,1,.36,1)," +
          "transform .55s cubic-bezier(.22,1,.36,1)," +
          "opacity .55s ease;" +
      "}" +
      ".w-carousel-item img,.w-carousel-item video{" +
        "width:100%;height:100%;display:block;" +
      "}" +

      // Duration-bar animation for carousel dots (matches homepage style)
      ".w-carousel-dot{position:relative;overflow:hidden;}" +
      ".w-carousel-dot::after{" +
        "content:'';position:absolute;inset:0;" +
        "background:var(--accent);" +
        "transform-origin:left;transform:scaleX(0);" +
      "}" +
      ".w-carousel-dot.active::after{" +
        "animation:wcd-fill 5s linear forwards;" +
      "}" +
      "@keyframes wcd-fill{from{transform:scaleX(0)}to{transform:scaleX(1)}}" +

      // Carousel controls row
      ".w-carousel-controls{" +
        "display:flex;align-items:center;justify-content:center;" +
        "gap:.7rem;margin-top:1rem;" +
      "}" +
      ".w-carousel-btn{" +
        "background:rgba(255,255,255,.06);" +
        "border:1px solid rgba(255,255,255,.18);" +
        "color:rgba(255,255,255,.7);width:26px;height:26px;border-radius:50%;" +
        "display:flex;align-items:center;justify-content:center;" +
        "cursor:pointer;font-size:1rem;line-height:1;" +
        "transition:background .2s,color .2s;" +
      "}" +
      ".w-carousel-btn:hover{background:rgba(255,255,255,.18);color:#fff;}" +

      // Game embed — poster + lazily-mounted iframe
      // scroll-snap-type:proximity (not mandatory) on the page + a single
      // scroll-snap-align target on the widget: settles/centers the game
      // if a scroll gesture drifts near it, but a real scroll past it
      // breaks free immediately — mandatory would fight the scroll wheel
      // instead.
      "html{scroll-snap-type:y proximity;}" +
      ".w-game-embed-bleed{scroll-snap-align:center;}" +
      // Two-layer structure on purpose: .w-game-embed-bleed does ONLY the
      // viewport breakout (must stay in pure vw units — left:50% +
      // margin:-50vw is the scrollbar-safe version of this trick; mixing
      // in a max-width on the same element fights that math and is what
      // caused the phantom scrollbar). .w-game-embed does the actual
      // sizing/centering as a normal box once its parent is full-width.
      ".w-game-embed-bleed{" +
        "position:relative;left:50%;right:50%;" +
        "margin-left:-50vw;margin-right:-50vw;" +
        "width:100vw;" +
      "}" +
      ".w-game-embed{" +
        "position:relative;box-sizing:border-box;" +
        "width:100%;" +
        "aspect-ratio:3/2;max-height:92vh;" +
        "overflow:hidden;background:#0a0a0a;" +
      "}" +
      "@media (max-width:640px){" +
        ".w-game-embed{max-height:80vh;}" +
      "}" +
      ".w-game-embed iframe{" +
        "position:absolute;inset:0;width:100%;height:100%;border:0;display:block;" +
      "}" +
      ".w-game-poster{" +
        "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;" +
        "cursor:pointer;background:#0a0a0a;" +
      "}" +
      ".w-game-poster img{" +
        "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;" +
        "opacity:.5;transition:opacity .25s ease;" +
      "}" +
      ".w-game-poster:hover img{opacity:.65;}" +
      ".w-game-poster-inner{" +
        "position:relative;z-index:1;display:flex;flex-direction:column;" +
        "align-items:center;gap:.8rem;padding:0 1.5rem;text-align:center;" +
      "}" +
      ".w-game-play-btn{" +
        "width:60px;height:60px;border-radius:50%;flex-shrink:0;" +
        "background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.3);" +
        "display:flex;align-items:center;justify-content:center;" +
        "transition:background .2s ease,transform .2s ease;" +
      "}" +
      ".w-game-poster:hover .w-game-play-btn{background:var(--accent);transform:scale(1.08);}" +
      ".w-game-play-btn svg{width:20px;height:20px;fill:#fff;margin-left:3px;}" +
      ".w-game-title{" +
        "font-family:var(--mono);font-size:.8rem;letter-spacing:.08em;" +
        "text-transform:uppercase;color:rgba(255,255,255,.9);" +
      "}" +
      ".w-game-caption{font-size:.85rem;color:rgba(255,255,255,.55);max-width:32rem;}" +

      // Zoom overlay
      "#page-zoom-overlay{" +
        "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.97);" +
        "opacity:0;pointer-events:none;transition:opacity .22s ease;" +
        "overflow:hidden;cursor:crosshair;touch-action:none;" +
      "}" +
      "#page-zoom-overlay.open{opacity:1;pointer-events:all;}" +
      "#page-zoom-canvas{position:absolute;top:0;left:0;transform-origin:0 0;will-change:transform;}" +
      "#page-zoom-canvas img{display:block;max-width:none;user-select:none;-webkit-user-drag:none;transition:opacity .15s ease;}" +
      "#page-zoom-close{" +
        "position:fixed;top:1rem;right:1rem;" +
        "background:rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.15);" +
        "color:rgba(255,255,255,.8);width:34px;height:34px;" +
        "border-radius:50%;cursor:pointer;font-size:.9rem;" +
        "display:flex;align-items:center;justify-content:center;" +
        "z-index:10000;transition:background .2s;" +
      "}" +
      "#page-zoom-close:hover{background:rgba(255,255,255,.1);}" +
      "#page-zoom-hint{" +
        "position:fixed;bottom:1.4rem;left:50%;transform:translateX(-50%);" +
        "font-family:var(--mono);font-size:.62rem;letter-spacing:.1em;text-transform:uppercase;" +
        "color:rgba(255,255,255,.3);pointer-events:none;z-index:10000;transition:opacity .6s ease;" +
      "}";
    document.head.appendChild(s);
  })();

  // ── Video observers ──────────────────────────────────────────────
  const autoplayObserver = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) e.target.play().catch(() => {});
      else e.target.pause();
    });
  }, { threshold: 0.15 });

  const pauseOnlyObserver = new IntersectionObserver(entries => {
    entries.forEach(e => { if (!e.isIntersecting) e.target.pause(); });
  }, { threshold: 0.15 });

  // ── Boot ─────────────────────────────────────────────────────────
  async function boot() {
    try {
      const res = await fetch("/pages.json?" + Date.now());
      pagesData = await res.json();
    } catch (e) {
      document.getElementById("page-root").innerHTML =
        '<div class="page-error">Could not load page data.</div>';
      buildHeader([]);
      buildFooter();
      return;
    }
    const page = pagesData.pages.find(p => p.slug === SLUG);
    buildHeader(pagesData.pages || []);
    buildFooter();
    if (!page) {
      document.getElementById("page-root").innerHTML =
        '<div class="page-error">Page not found.</div>';
      return;
    }
    document.title = page.label + " \u2014 AJ Ambrozic";
    buildContent(page);
  }

  // ── Header ───────────────────────────────────────────────────────
  function buildHeader(pages) {
    const root = document.getElementById("header-root");
    const left = pages.map(p =>
      `<a class="nav-link${p.slug === SLUG ? " active" : ""}" href="/${p.slug}/">${esc(p.label)}</a>`
    ).join("");
    root.innerHTML = `
      <header id="site-header">
        <a id="wordmark" href="/">AJ Ambrozic</a>
        <button id="nav-toggle" aria-label="Toggle menu">
          <span class="nav-toggle-bar"></span>
          <span class="nav-toggle-bar"></span>
          <span class="nav-toggle-bar"></span>
        </button>
        <nav id="site-nav">
          <div id="nav-left">
            <a class="nav-link" href="/">Work</a>
            ${left}
          </div>
          <div id="nav-right">
            <a class="nav-link" href="/#about">About</a>
            <a class="nav-link" href="/#contact">Contact</a>
          </div>
        </nav>
      </header>`;
    document.getElementById("nav-toggle").onclick = () => {
      document.getElementById("site-nav").classList.toggle("open");
      document.getElementById("nav-toggle").classList.toggle("open");
    };
  }

  function buildFooter() {
    document.getElementById("footer-root").innerHTML = `
      <footer>
        <a class="nav-link" href="/">&larr; Back to Work</a>
        <span>AJ Ambrozic</span>
      </footer>`;
  }

  // ── Content ──────────────────────────────────────────────────────
  function buildContent(page) {
    const root = document.getElementById("page-root");
    root.innerHTML = "";
    page.widgets.forEach((w, i) => root.appendChild(buildWidget(w, page.slug, i)));
  }

  function mediaPath(slug, file) { return "/pages/" + slug + "/" + file; }

  function makeMissingPlaceholder() {
    const ph = document.createElement("div");
    ph.className = "w-media-missing";
    ph.textContent = "missing media file";
    return ph;
  }

  function buildMediaEl(slug, item, opts) {
    opts = opts || {};
    if (!item) return null;

    const origUrl  = mediaPath(slug, item.file);
    const thumbUrl = item.thumb ? "/pages/" + slug + "/thumbs/" + item.thumb : null;
    // Zoom-tier: size-capped so the pan/zoom overlay never has to composite
    // an unbounded image (see generate-manifest.js ZOOM_MAX_PX / makeZoomImage).
    // Falls back to the raw original if no zoom-tier asset was generated.
    const zoomUrl  = item.zoomThumb ? "/pages/" + slug + "/thumbs/" + item.zoomThumb : origUrl;

    if (item.type === "video") {
      const v = document.createElement("video");
      v.src = origUrl;
      v.muted = true; v.loop = true; v.playsInline = true;
      v.controls = !!opts.controls;
      v.controlsList = "nodownload nofullscreen";
      v.disablePictureInPicture = true;
      if (thumbUrl) v.poster = thumbUrl; // poster frame from ffmpeg
      if (opts.autoplay) v.autoplay = true;
      if (opts.manage === "autoplay")        autoplayObserver.observe(v);
      else if (opts.manage === "pause-only") pauseOnlyObserver.observe(v);
      return v;
    }

    const img = document.createElement("img");
    img.alt = ""; img.loading = "lazy";
    img.onerror = () => img.replaceWith(makeMissingPlaceholder());
    // Display the thumbnail if available; zoom opens the size-capped
    // zoom-tier image on phones, or the true original on desktop/laptop
    // (openZoom() decides — see isLikelyDesktop()).
    img.src = thumbUrl || origUrl;
    img.dataset.orig = zoomUrl;
    img.dataset.origFull = origUrl;
    if (!opts.noZoom) {
      img.style.cursor = "zoom-in";
      img.onclick = () => openZoom(zoomUrl, origUrl);
    }
    return img;
  }

  // ── Luminance / auto light-bg text ───────────────────────────────
  function getLuminance(hex) {
    if (!hex) return null;
    const c = hex.replace("#","").trim();
    let r, g, b;
    if (c.length === 3) {
      r=parseInt(c[0]+c[0],16); g=parseInt(c[1]+c[1],16); b=parseInt(c[2]+c[2],16);
    } else if (c.length === 6) {
      r=parseInt(c.slice(0,2),16); g=parseInt(c.slice(2,4),16); b=parseInt(c.slice(4,6),16);
    } else return null;
    if ([r,g,b].some(n=>isNaN(n))) return null;
    return (0.299*r + 0.587*g + 0.114*b) / 255;
  }
  const LIGHT_BG_THRESHOLD = 0.6;

  // ── Widget dispatcher ─────────────────────────────────────────────
  function buildWidget(w, slug, index) {
    const section = document.createElement("section");
    section.className = "widget";
    section.dataset.type = w.type;
    section.style.background = w.background || "var(--bg)";
    const lum = getLuminance(w.background);
    if (lum !== null && lum > LIGHT_BG_THRESHOLD) section.classList.add("widget-on-light");

    switch (w.type) {
      case "image-left":
      case "text-left":  section.appendChild(buildSplitText(w, slug)); break;
      case "split":       section.appendChild(buildSplitFlanked(w, slug)); break;
      case "media-only": section.appendChild(buildMediaOnly(w, slug)); break;
      case "full-bleed": section.appendChild(buildFullBleed(w, slug)); break;
      case "carousel":   section.appendChild(buildCarouselWidget(w, slug)); break;
      case "trio":        section.appendChild(buildTrio(w, slug)); break;
      case "title-bar":  section.appendChild(buildTitleBar(w)); break;
      case "game-embed": section.appendChild(buildGameEmbed(w, slug)); break;
      case "text-only":
      default:            section.appendChild(buildTextOnly(w)); break;
    }
    return section;
  }

  function buildTextBlock(w) {
    const wrap = document.createElement("div");
    wrap.className = "w-text";
    wrap.innerHTML =
      (w.title ? `<h2 class="w-title">${esc(w.title)}</h2>` : "") +
      (w.text  ? `<p  class="w-body">${esc(w.text)}</p>`  : "");
    return wrap;
  }

  function buildSplitText(w, slug) {
    const grid = document.createElement("div");
    grid.className = "widget-grid";
    const mw = document.createElement("div"); mw.className = "w-media";
    const m  = buildMediaEl(slug, w.media[0], { autoplay:true, manage:"autoplay" });
    mw.appendChild(m || makeMissingPlaceholder());
    grid.appendChild(mw);
    grid.appendChild(buildTextBlock(w));
    return grid;
  }

  function buildSplitFlanked(w, slug) {
    const grid = document.createElement("div");
    grid.className = "widget-grid widget-grid-split";
    const lw = document.createElement("div"); lw.className = "w-media";
    const rw = document.createElement("div"); rw.className = "w-media";
    const lm = buildMediaEl(slug, w.media[0], { autoplay:true, manage:"autoplay" });
    const rm = buildMediaEl(slug, w.media[1], { autoplay:true, manage:"autoplay" });
    lw.appendChild(lm || makeMissingPlaceholder());
    rw.appendChild(rm || makeMissingPlaceholder());
    grid.appendChild(lw);
    grid.appendChild(buildTextBlock(w));
    grid.appendChild(rw);
    return grid;
  }

  function buildMediaOnly(w, slug) {
    const wrap = document.createElement("div");
    wrap.className = "w-media-only";
    const m = buildMediaEl(slug, w.media[0], { controls:true, manage:"pause-only" });
    wrap.appendChild(m || makeMissingPlaceholder());
    return wrap;
  }

  function buildFullBleed(w, slug) {
    const wrap = document.createElement("div");
    wrap.className = "w-fullbleed";
    const m = buildMediaEl(slug, w.media[0], { autoplay:true, manage:"autoplay" });
    if (m) wrap.appendChild(m);
    const cap = document.createElement("div");
    cap.className = "w-fullbleed-caption";
    cap.innerHTML =
      (w.title ? `<h2 class="w-title-large">${esc(w.title)}</h2>` : "") +
      (w.text  ? `<p  class="w-body">${esc(w.text)}</p>` : "");
    wrap.appendChild(cap);
    return wrap;
  }

  function buildTextOnly(w) {
    const wrap = document.createElement("div");
    wrap.className = "w-text-only";
    wrap.appendChild(buildTextBlock(w));
    return wrap;
  }

  function buildTrio(w, slug) {
    const row = document.createElement("div");
    row.className = "w-trio";
    for (let i = 0; i < 3; i++) {
      const cell = document.createElement("div"); cell.className = "w-trio-cell";
      const m = buildMediaEl(slug, w.media[i] || null, { autoplay:true, manage:"autoplay" });
      cell.appendChild(m || makeMissingPlaceholder());
      row.appendChild(cell);
    }
    return row;
  }

  function buildTitleBar(w) {
    const bar = document.createElement("div");
    bar.className = "w-title-bar";
    if (w.title) {
      const h = document.createElement("h2");
      h.className = "w-title-bar-heading";
      h.textContent = w.title;
      bar.appendChild(h);
    }
    if (w.text) {
      const p = document.createElement("p");
      p.className = "w-title-bar-sub";
      p.textContent = w.text;
      bar.appendChild(p);
    }
    return bar;
  }

  // ── Game embed — click-to-play Unity WebGL build in an iframe ─────
  // Deliberately not auto-loaded: Unity builds are large (often 10MB+ of
  // .wasm/.data), so nothing is fetched until the person actually clicks
  // play. Fullscreen is handled by the Unity build's own fullscreen button
  // (see /pages/<slug>/<game>/index.html) calling unityInstance.SetFullscreen —
  // that call only succeeds from inside the iframe because of the
  // allow="fullscreen" / allowfullscreen attributes set below.
  function buildGameEmbed(w, slug) {
    const bleed = document.createElement("div");
    bleed.className = "w-game-embed-bleed";

    const wrap = document.createElement("div");
    wrap.className = "w-game-embed";

    const gameFolder = w.game || "game";
    const gameUrl = "/pages/" + slug + "/" + gameFolder + "/index.html";

    const poster = document.createElement("div");
    poster.className = "w-game-poster";

    const posterItem = w.media && w.media[0];
    if (posterItem) {
      const img = buildMediaEl(slug, posterItem, { noZoom: true });
      if (img) poster.appendChild(img);
    }

    const inner = document.createElement("div");
    inner.className = "w-game-poster-inner";
    inner.innerHTML =
      '<div class="w-game-play-btn"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>' +
      (w.title ? `<div class="w-game-title">${esc(w.title)}</div>` : "") +
      (w.text  ? `<div class="w-game-caption">${esc(w.text)}</div>` : "");
    poster.appendChild(inner);

    poster.onclick = () => {
      const iframe = document.createElement("iframe");
      iframe.src = gameUrl;
      iframe.setAttribute("allowfullscreen", "");
      iframe.setAttribute("allow", "fullscreen; autoplay");
      iframe.setAttribute("scrolling", "no");
      iframe.style.overflow = "hidden";
      wrap.innerHTML = "";
      wrap.appendChild(iframe);
    };

    wrap.appendChild(poster);
    bleed.appendChild(wrap);
    return bleed;
  }

  // ── Carousel — film-strip with centre-pivot positioning ───────────
  //
  // Items are positioned by their CENTRE x-coordinate (not left edge).
  // el.style.left  = cx%  (centre of this item)
  // el.style.transform = "translateX(-50%)"  (always — pivots around centre)
  // el.style.width = w%
  //
  // This means only `left` drives the sliding motion. Width expanding /
  // contracting happens symmetrically around the stationary centre point,
  // so there's no visual artifact of the image appearing to grow sideways
  // while it's mid-slide.
  //
  // Desktop shows 5 items (slots -2 to +2).
  // Mobile (<= 640px) shows 3 items (slots -1 to +1) to avoid clutter.
  //
  function buildCarouselWidget(w, slug) {
    const wrap = document.createElement("div");
    wrap.className = "w-carousel";

    if (w.title || w.text) {
      const cap = document.createElement("div");
      cap.className = "w-carousel-caption";
      cap.innerHTML =
        (w.title ? `<h2 class="w-title">${esc(w.title)}</h2>` : "") +
        (w.text  ? `<p  class="w-body">${esc(w.text)}</p>`  : "");
      wrap.appendChild(cap);
    }

    const items = w.media;
    const N = items.length;
    let active = 0, timer = null;

    // cx     = centre of item as % of stage width
    // scale  = CSS scale() applied via transform (1.0 = full size, fills the 44% box)
    // op     = opacity
    // z      = z-index
    //
    // All items share a constant CSS width of 44% (set in the injected CSS above).
    // Visual width = 44% * scale. Items are centred at cx%.
    // Outer items (slots ±2) are positioned so their inner edge clears the stage edge
    // and their outer edge is just barely visible.
    const SLOT_DESKTOP = {
      "-2": { cx: 13, scale: 0.55, op: 0.22, z: 1 },
      "-1": { cx: 27, scale: 0.72, op: 0.55, z: 2 },
       "0": { cx: 50, scale: 1.00, op: 1.00, z: 4 },
       "1": { cx: 73, scale: 0.72, op: 0.55, z: 2 },
       "2": { cx: 87, scale: 0.55, op: 0.22, z: 1 },
    };
    const SLOT_MOBILE = {
      "-1": { cx: 11, scale: 0.72, op: 0.45, z: 2 },
       "0": { cx: 50, scale: 1.00, op: 1.00, z: 4 },
       "1": { cx: 89, scale: 0.72, op: 0.45, z: 2 },
    };

    const stage = document.createElement("div");
    stage.className = "w-carousel-stage";

    // Build item elements — no click handlers yet; assigned in applyPositions
    const itemEls = items.map((m, i) => {
      const div = document.createElement("div");
      div.className = "w-carousel-item";
      const el = buildMediaEl(slug, m, { noZoom: true }); // zoom managed per-position
      div.appendChild(el || makeMissingPlaceholder());
      stage.appendChild(div);
      return div;
    });

    wrap.appendChild(stage);

    // Wrapping relative position: -floor(N/2) .. +floor(N/2)
    function relPos(i) {
      let p = ((i - active) % N + N) % N;
      if (p > Math.floor(N / 2)) p -= N;
      return p;
    }

    function applyPositions() {
      const isMobile = window.innerWidth <= 640;
      const SLOT = isMobile ? SLOT_MOBILE : SLOT_DESKTOP;

      itemEls.forEach((el, i) => {
        const pos  = relPos(i);
        const spec = SLOT[String(pos)];

        // Reset click handlers on every call so they don't accumulate
        el.onclick = null;
        const img = el.querySelector("img");
        if (img) img.onclick = null;

        if (!spec) {
          // Park off-screen so it slides in smoothly when it next enters range
          el.style.left      = (pos < 0 ? "-10" : "110") + "%";
          el.style.transform = "translateX(-50%) scale(0.55)";
          el.style.opacity   = "0";
          el.style.zIndex    = "0";
          el.style.cursor    = "default";
          el.style.pointerEvents = "none";
          if (img) { img.style.cursor = "default"; img.style.objectFit = "cover"; }
          const vid = el.querySelector("video");
          if (vid) { vid.pause(); vid.style.objectFit = "cover"; }
          return;
        }

        el.style.left      = spec.cx + "%";
        el.style.transform = `translateX(-50%) scale(${spec.scale})`;
        el.style.opacity   = spec.op;
        el.style.zIndex    = spec.z;

        // Center: full visible with object-fit contain (no crop), zoomable
        if (pos === 0) {
          el.style.cursor        = "default";
          el.style.pointerEvents = "auto";
          if (img) {
            img.style.objectFit = "contain";
            img.style.cursor    = "zoom-in";
            // dataset.orig/origFull are set by buildMediaEl; openZoom picks
            // between them based on isLikelyDesktop()
            img.onclick = e => { e.stopPropagation(); openZoom(img.dataset.orig || img.src, img.dataset.origFull || img.src); };
          }
          const vid = el.querySelector("video");
          if (vid) {
            vid.style.objectFit = "contain";
            vid.play().catch(() => {});
          }
        } else {
          // Side items: tap to jump, cover-cropped
          el.style.cursor        = "pointer";
          el.style.pointerEvents = "auto";
          const capturedI = i; // explicit capture for closure
          el.onclick = () => go(capturedI);
          if (img) { img.style.objectFit = "cover"; img.style.cursor = "pointer"; }
          const vid = el.querySelector("video");
          if (vid) { vid.pause(); vid.style.objectFit = "cover"; }
        }
      });
    }

    // Dots
    const dotsWrap = document.createElement("div");
    dotsWrap.className = "w-carousel-dots";
    const dotEls = N > 1 ? items.map((_, i) => {
      const d = document.createElement("div");
      d.className = "w-carousel-dot" + (i === 0 ? " active" : "");
      d.onclick = () => go(i);
      dotsWrap.appendChild(d);
      return d;
    }) : [];

    // Controls: [←] [duration-bar dots] [→]
    const controls = document.createElement("div");
    controls.className = "w-carousel-controls";
    if (N > 1) {
      const prev = document.createElement("button");
      prev.className = "w-carousel-btn";
      prev.innerHTML = "&#8249;";
      prev.onclick = () => go(active - 1);

      const next = document.createElement("button");
      next.className = "w-carousel-btn";
      next.innerHTML = "&#8250;";
      next.onclick = () => go(active + 1);

      controls.appendChild(prev);
      controls.appendChild(dotsWrap);
      controls.appendChild(next);
    }
    wrap.appendChild(controls);

    function go(n) {
      active = ((n % N) + N) % N;
      applyPositions();

      // Restart duration-bar animation: remove active first to kill running
      // animation, force a reflow, then re-add to trigger @keyframes from 0.
      dotEls.forEach((d, i) => {
        d.classList.remove("active");
        if (i === active) {
          void d.offsetWidth; // force reflow — without this animation won't restart
          d.classList.add("active");
        }
      });

      clearInterval(timer);
      if (N > 1) timer = setInterval(() => go(active + 1), 5000);
    }

    // Pause/resume center video when widget scrolls in/out of view
    const obs = new IntersectionObserver(entries => {
      const v = itemEls[active]?.querySelector("video");
      if (!v) return;
      if (entries[0].isIntersecting) v.play().catch(() => {});
      else v.pause();
    }, { threshold: 0.15 });
    obs.observe(wrap);

    // Set initial positions instantly (no slide animation on first render)
    itemEls.forEach(el => el.style.transition = "none");
    applyPositions();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      itemEls.forEach(el => el.style.removeProperty("transition"));
    }));

    if (N > 1) timer = setInterval(() => go(active + 1), 5000);
    return wrap;
  }

  // ── Helpers ───────────────────────────────────────────────────────
  function esc(s) {
    return String(s||"")
      .replace(/&/g,"&amp;").replace(/</g,"&lt;")
      .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  // ── Pan/zoom overlay — matches the gallery zoom in index.html ────
  // Scroll/pinch to zoom (anchored to cursor/fingers), drag to pan.
  // Opens the size-capped zoom-tier image on phones/tablets (see
  // generate-manifest.js ZOOM_MAX_PX), or the true full-resolution original
  // on desktop/laptop (see isLikelyDesktop() below).
  let _pzOverlay = null, _pzCanvas = null, _pzHint = null;
  let _pzScale = 1, _pzFitScale = 1, _pzX = 0, _pzY = 0;
  let _pzDrag = false, _pzDragSX = 0, _pzDragSY = 0, _pzOX = 0, _pzOY = 0;
  let _pzPinchDist = 0;
  const PZ_MAX = 12;

  // See the matching comment in index.html — same heuristic, duplicated
  // here since subpages don't share a script context with the main page.
  const PZ_DESKTOP_MIN_WIDTH = 900;
  function isLikelyDesktop() {
    return window.matchMedia("(pointer: fine)").matches && window.innerWidth >= PZ_DESKTOP_MIN_WIDTH;
  }

  function _pzApply() {
    _pzCanvas.style.transform = `translate(${_pzX}px,${_pzY}px) scale(${_pzScale})`;
  }

  function _pzClamp() {
    const img = _pzCanvas.querySelector("img");
    if (!img || !img.naturalWidth) return;
    const W = img.naturalWidth * _pzScale, H = img.naturalHeight * _pzScale;
    const vw = window.innerWidth, vh = window.innerHeight;
    _pzX = W < vw ? (vw-W)/2 : Math.min(0, Math.max(_pzX, vw-W));
    _pzY = H < vh ? (vh-H)/2 : Math.min(0, Math.max(_pzY, vh-H));
  }

  function _pzAt(cx, cy, factor) {
    const prev = _pzScale;
    _pzScale = Math.max(_pzFitScale, Math.min(PZ_MAX, _pzScale * factor));
    const r = _pzScale / prev;
    _pzX = cx - r*(cx - _pzX);
    _pzY = cy - r*(cy - _pzY);
    _pzClamp(); _pzApply();
  }

  function initZoom() {
    if (_pzOverlay) return;

    _pzOverlay = document.createElement("div");
    _pzOverlay.id = "page-zoom-overlay";

    const btn = document.createElement("button");
    btn.id = "page-zoom-close";
    btn.innerHTML = "&#x2715;";
    btn.onclick = closeZoom;

    _pzCanvas = document.createElement("div");
    _pzCanvas.id = "page-zoom-canvas";

    _pzHint = document.createElement("div");
    _pzHint.id = "page-zoom-hint";
    _pzHint.textContent = "Scroll to zoom \u00b7 Drag to pan \u00b7 Esc to close";

    _pzOverlay.appendChild(btn);
    _pzOverlay.appendChild(_pzCanvas);
    _pzOverlay.appendChild(_pzHint);
    document.body.appendChild(_pzOverlay);

    // Scroll-wheel zoom
    _pzOverlay.addEventListener("wheel", e => {
      e.preventDefault();
      _pzAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1/1.12);
    }, { passive: false });

    // Drag pan
    _pzOverlay.addEventListener("mousedown", e => {
      if (e.button !== 0) return;
      _pzDrag = true; _pzDragSX = e.clientX; _pzDragSY = e.clientY;
      _pzOX = _pzX; _pzOY = _pzY;
      _pzOverlay.style.cursor = "grabbing";
    });
    window.addEventListener("mousemove", e => {
      if (!_pzDrag) return;
      _pzX = _pzOX + (e.clientX - _pzDragSX);
      _pzY = _pzOY + (e.clientY - _pzDragSY);
      _pzClamp(); _pzApply();
    });
    window.addEventListener("mouseup", () => {
      _pzDrag = false;
      if (_pzOverlay.classList.contains("open")) _pzOverlay.style.cursor = "crosshair";
    });

    // Pinch + touch-drag
    _pzOverlay.addEventListener("touchstart", e => {
      if (e.touches.length === 2) {
        _pzDrag = false;
        _pzPinchDist = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
      } else if (e.touches.length === 1) {
        _pzDrag = true;
        _pzDragSX = e.touches[0].clientX; _pzDragSY = e.touches[0].clientY;
        _pzOX = _pzX; _pzOY = _pzY;
      }
    }, { passive: true });
    _pzOverlay.addEventListener("touchmove", e => {
      e.preventDefault();
      if (e.touches.length === 2) {
        const dist = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
        const cx = (e.touches[0].clientX+e.touches[1].clientX)/2;
        const cy = (e.touches[0].clientY+e.touches[1].clientY)/2;
        if (_pzPinchDist > 0) _pzAt(cx, cy, dist/_pzPinchDist);
        _pzPinchDist = dist;
      } else if (_pzDrag && e.touches.length === 1) {
        _pzX = _pzOX + (e.touches[0].clientX - _pzDragSX);
        _pzY = _pzOY + (e.touches[0].clientY - _pzDragSY);
        _pzClamp(); _pzApply();
      }
    }, { passive: false });
    _pzOverlay.addEventListener("touchend", () => { _pzDrag = false; _pzPinchDist = 0; }, { passive: true });

    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && _pzOverlay.classList.contains("open")) closeZoom();
    });
  }

  function openZoom(cappedSrc, fullSrc) {
    initZoom();
    _pzCanvas.innerHTML = "";
    _pzScale = 1; _pzFitScale = 1; _pzX = 0; _pzY = 0;
    _pzApply();

    // Desktops/laptops have far more memory headroom than phones, so give
    // them the true full-resolution original; phones/tablets get the
    // size-capped zoom-tier image instead. See isLikelyDesktop() above.
    const origSrc = isLikelyDesktop() ? (fullSrc || cappedSrc) : cappedSrc;

    // Disable native browser pinch-zoom while our zoom canvas is active —
    // otherwise iOS intercepts two-finger touches as a page-zoom gesture
    // instead of delivering them to our touchmove handler. (Matches
    // index.html's gallery zoom, which already does this.)
    const _vp = document.querySelector("meta[name=viewport]");
    if (_vp) { _vp.dataset.savedContent = _vp.content; _vp.content = "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"; }

    const img = new Image();
    img.draggable = false;
    img.style.opacity = "0"; // hidden until sized, so there's no unscaled top-left flash
    img.onload = () => {
      const fw = window.innerWidth  / img.naturalWidth;
      const fh = window.innerHeight / img.naturalHeight;
      _pzFitScale = Math.min(fw, fh);
      _pzScale = _pzFitScale;
      _pzX = (window.innerWidth  - img.naturalWidth  * _pzScale) / 2;
      _pzY = (window.innerHeight - img.naturalHeight * _pzScale) / 2;
      _pzApply();
      img.style.opacity = "1";
    };
    img.src = origSrc;
    _pzCanvas.appendChild(img);
    _pzApply();

    _pzOverlay.classList.add("open");
    document.body.style.overflow = "hidden";

    _pzHint.style.opacity = "1";
    clearTimeout(_pzHint._t);
    _pzHint._t = setTimeout(() => { _pzHint.style.opacity = "0"; }, 2200);
  }

  function closeZoom() {
    if (!_pzOverlay) return;
    _pzOverlay.classList.remove("open");
    document.body.style.overflow = "";
    setTimeout(() => { if (_pzCanvas) _pzCanvas.innerHTML = ""; }, 230);

    // Re-enable native pinch-zoom.
    const _vp = document.querySelector("meta[name=viewport]");
    if (_vp && _vp.dataset.savedContent) {
      _vp.content = _vp.dataset.savedContent;
      delete _vp.dataset.savedContent;
    }
  }

  boot();
})();
