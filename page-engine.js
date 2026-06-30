/**
 * page-engine.js
 * Renders a single custom subpage. Loaded by auto-generated stub files.
 * You should never need to edit this file directly.
 */

(function () {
  const SLUG = window.PAGE_SLUG;
  let pagesData = null;

  // ── Inject critical styles at boot ──────────────────────────────
  // These live in JS rather than page-widgets.css so a stale CDN-cached
  // stylesheet can never break them. Lesson learned the hard way.
  ;(function injectCriticalStyles() {
    const s = document.createElement("style");
    s.textContent =
      // Title-bar heading — override any cached small size
      ".w-title-bar-heading{font-size:clamp(3rem,7vw,5rem)!important;" +
        "letter-spacing:.05em!important;line-height:1.05!important;}" +

      // Carousel — film-strip stage and sliding items
      ".w-carousel-stage{position:relative;width:100%;height:clamp(320px,46vh,540px);" +
        "overflow:hidden;background:var(--bg);}" +
      ".w-carousel-item{position:absolute;top:5%;height:90%;overflow:hidden;" +
        "border-radius:var(--radius);" +
        "transition:left .55s cubic-bezier(.22,1,.36,1)," +
          "width .55s cubic-bezier(.22,1,.36,1)," +
          "opacity .55s ease;}" +
      ".w-carousel-item img,.w-carousel-item video{width:100%;height:100%;display:block;}" +
      ".w-carousel-controls{display:flex;align-items:center;justify-content:center;" +
        "gap:.7rem;margin-top:1rem;}" +
      ".w-carousel-btn{background:rgba(255,255,255,.06);" +
        "border:1px solid rgba(255,255,255,.18);color:rgba(255,255,255,.7);" +
        "width:26px;height:26px;border-radius:50%;" +
        "display:flex;align-items:center;justify-content:center;" +
        "cursor:pointer;font-size:1rem;line-height:1;" +
        "transition:background .2s,color .2s;}" +
      ".w-carousel-btn:hover{background:rgba(255,255,255,.18);color:#fff;}" +

      // Zoom overlay
      "#page-zoom-overlay{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.97);" +
        "display:flex;align-items:center;justify-content:center;" +
        "opacity:0;pointer-events:none;transition:opacity .22s ease;" +
        "cursor:zoom-out;overflow:auto;}" +
      "#page-zoom-overlay.open{opacity:1;pointer-events:all;}" +
      "#page-zoom-content{display:flex;align-items:center;justify-content:center;" +
        "min-height:100vh;padding:2rem;}" +
      "#page-zoom-content img{max-width:96vw;max-height:96vh;width:auto;height:auto;" +
        "display:block;object-fit:contain;cursor:zoom-out;}" +
      "#page-zoom-close{position:fixed;top:1rem;right:1rem;background:rgba(0,0,0,.6);" +
        "border:1px solid rgba(255,255,255,.15);color:rgba(255,255,255,.8);" +
        "width:34px;height:34px;border-radius:50%;cursor:pointer;font-size:.9rem;" +
        "display:flex;align-items:center;justify-content:center;" +
        "z-index:10000;transition:background .2s;}" +
      "#page-zoom-close:hover{background:rgba(255,255,255,.1);}";
    document.head.appendChild(s);
  })();

  // ── Video observers ──────────────────────────────────────────────
  // autoplayObserver: muted looping videos (full-bleed, image-left, etc.)
  //   pause when off-screen, resume automatically when back in view.
  const autoplayObserver = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) e.target.play().catch(() => {});
      else e.target.pause();
    });
  }, { threshold: 0.15 });

  // pauseOnlyObserver: user-controlled videos (media-only)
  //   pause when off-screen but never force-resume (respects user pause).
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
    if (item.type === "video") {
      const v = document.createElement("video");
      v.src = mediaPath(slug, item.file);
      v.muted = true; v.loop = true; v.playsInline = true;
      v.controls = !!opts.controls;
      v.controlsList = "nodownload nofullscreen";
      v.disablePictureInPicture = true;
      if (opts.autoplay) v.autoplay = true;
      if (opts.manage === "autoplay")    autoplayObserver.observe(v);
      else if (opts.manage === "pause-only") pauseOnlyObserver.observe(v);
      return v;
    }
    const img = document.createElement("img");
    img.alt = ""; img.loading = "lazy";
    img.onerror = () => img.replaceWith(makeMissingPlaceholder());
    img.src = mediaPath(slug, item.file);
    if (!opts.noZoom) {
      img.style.cursor = "zoom-in";
      img.onclick = () => openZoom(img.src);
    }
    return img;
  }

  // ── Luminance / light-background detection ────────────────────────
  function getLuminance(hex) {
    if (!hex) return null;
    const c = hex.replace("#", "").trim();
    let r, g, b;
    if (c.length === 3) {
      r = parseInt(c[0]+c[0],16); g = parseInt(c[1]+c[1],16); b = parseInt(c[2]+c[2],16);
    } else if (c.length === 6) {
      r = parseInt(c.slice(0,2),16); g = parseInt(c.slice(2,4),16); b = parseInt(c.slice(4,6),16);
    } else { return null; }
    if ([r,g,b].some(n => isNaN(n))) return null;
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
      (w.text  ? `<p class="w-body">${esc(w.text)}</p>` : "");
    return wrap;
  }

  function buildSplitText(w, slug) {
    const grid = document.createElement("div");
    grid.className = "widget-grid";
    const mw = document.createElement("div");
    mw.className = "w-media";
    const m = buildMediaEl(slug, w.media[0], { autoplay: true, manage: "autoplay" });
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
    const lm = buildMediaEl(slug, w.media[0], { autoplay: true, manage: "autoplay" });
    const rm = buildMediaEl(slug, w.media[1], { autoplay: true, manage: "autoplay" });
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
    const m = buildMediaEl(slug, w.media[0], { controls: true, manage: "pause-only" });
    wrap.appendChild(m || makeMissingPlaceholder());
    return wrap;
  }

  function buildFullBleed(w, slug) {
    const wrap = document.createElement("div");
    wrap.className = "w-fullbleed";
    const m = buildMediaEl(slug, w.media[0], { autoplay: true, manage: "autoplay" });
    if (m) wrap.appendChild(m);
    const cap = document.createElement("div");
    cap.className = "w-fullbleed-caption";
    cap.innerHTML =
      (w.title ? `<h2 class="w-title-large">${esc(w.title)}</h2>` : "") +
      (w.text  ? `<p class="w-body">${esc(w.text)}</p>` : "");
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
      const cell = document.createElement("div");
      cell.className = "w-trio-cell";
      const m = buildMediaEl(slug, w.media[i] || null, { autoplay: true, manage: "autoplay" });
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

  // ── Carousel — film-strip with 5 simultaneous slots ──────────────
  //
  // Slot positions (-2 to +2) relative to the active item:
  //   -2        -1       [0-CENTER]    +1         +2
  //  8% peek  21% wide   42% wide    21% wide   8% peek
  //
  // Center uses object-fit:contain so portrait images never get cropped.
  // Side items use object-fit:cover (they're partial previews).
  // Items beyond ±2 are parked off-screen left/right so they slide in
  // naturally when they next enter the visible range.
  //
  function buildCarouselWidget(w, slug) {
    const wrap = document.createElement("div");
    wrap.className = "w-carousel";

    if (w.title || w.text) {
      const cap = document.createElement("div");
      cap.className = "w-carousel-caption";
      cap.innerHTML =
        (w.title ? `<h2 class="w-title">${esc(w.title)}</h2>` : "") +
        (w.text  ? `<p class="w-body">${esc(w.text)}</p>` : "");
      wrap.appendChild(cap);
    }

    const items = w.media;
    const N = items.length;
    let active = 0, timer = null;

    // Slot specs: left position and width as % of stage width
    const SLOT = {
      "-2": { l: -6,  wid: 14, op: 0.18, z: 1 },
      "-1": { l:  8,  wid: 21, op: 0.50, z: 2 },
       "0": { l: 29,  wid: 42, op: 1.00, z: 4 },
       "1": { l: 71,  wid: 21, op: 0.50, z: 2 },
       "2": { l: 92,  wid: 14, op: 0.18, z: 1 },
    };

    const stage = document.createElement("div");
    stage.className = "w-carousel-stage";

    const itemEls = items.map((m, i) => {
      const div = document.createElement("div");
      div.className = "w-carousel-item";
      const el = buildMediaEl(slug, m, { noZoom: true });
      div.appendChild(el || makeMissingPlaceholder());
      div.addEventListener("click", () => { if (i !== active) go(i); });
      stage.appendChild(div);
      return div;
    });

    wrap.appendChild(stage);

    // Relative slot position of item i from active, in range -floor(N/2)..+floor(N/2)
    function relPos(i) {
      let p = ((i - active) % N + N) % N;
      if (p > Math.floor(N / 2)) p -= N;
      return p;
    }

    function applyPositions() {
      itemEls.forEach((el, i) => {
        const pos  = relPos(i);
        const spec = SLOT[pos];

        if (!spec) {
          // Park off-screen on the correct side so it slides in when needed
          el.style.left          = pos < 0 ? "-20%" : "120%";
          el.style.width         = "14%";
          el.style.opacity       = "0";
          el.style.zIndex        = "0";
          el.style.pointerEvents = "none";
          el.style.cursor        = "default";
          return;
        }

        el.style.left          = spec.l + "%";
        el.style.width         = spec.wid + "%";
        el.style.opacity       = spec.op;
        el.style.zIndex        = spec.z;
        el.style.pointerEvents = pos === 0 ? "none" : "auto";
        el.style.cursor        = pos === 0 ? "default" : "pointer";

        // Center: contain (no cropping); sides: cover (crop is fine for previews)
        const img = el.querySelector("img");
        if (img) img.style.objectFit = pos === 0 ? "contain" : "cover";
        const vid = el.querySelector("video");
        if (vid) {
          vid.style.objectFit = pos === 0 ? "contain" : "cover";
          if (pos === 0) vid.play().catch(() => {});
          else vid.pause();
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

    // Controls row: [←] [dots] [→]
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
      dotEls.forEach((d, i) => d.classList.toggle("active", i === active));
      clearInterval(timer);
      if (N > 1) timer = setInterval(() => go(active + 1), 5000);
    }

    // Intersection observer: resume/pause the center video on scroll/resize
    const obs = new IntersectionObserver(entries => {
      const v = itemEls[active]?.querySelector("video");
      if (!v) return;
      if (entries[0].isIntersecting) v.play().catch(() => {});
      else v.pause();
    }, { threshold: 0.15 });
    obs.observe(wrap);

    // Set initial positions without animation, then re-enable transitions
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
    return String(s || "")
      .replace(/&/g,"&amp;").replace(/</g,"&lt;")
      .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  // ── Zoom overlay ──────────────────────────────────────────────────
  // CSS for the overlay is injected by injectCriticalStyles() above.
  let _zoomOverlay = null, _zoomContent = null;

  function initZoom() {
    if (_zoomOverlay) return;

    _zoomOverlay = document.createElement("div");
    _zoomOverlay.id = "page-zoom-overlay";
    _zoomOverlay.onclick = closeZoom;

    const btn = document.createElement("button");
    btn.id = "page-zoom-close";
    btn.innerHTML = "&#x2715;";
    btn.onclick = closeZoom;

    _zoomContent = document.createElement("div");
    _zoomContent.id = "page-zoom-content";
    _zoomContent.onclick = e => e.stopPropagation();

    _zoomOverlay.appendChild(btn);
    _zoomOverlay.appendChild(_zoomContent);
    document.body.appendChild(_zoomOverlay);

    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && _zoomOverlay.classList.contains("open")) closeZoom();
    });
  }

  function openZoom(src) {
    initZoom();
    _zoomContent.innerHTML = "";
    const img = document.createElement("img");
    img.src = src;
    _zoomContent.appendChild(img);
    _zoomOverlay.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function closeZoom() {
    _zoomOverlay.classList.remove("open");
    document.body.style.overflow = "";
    setTimeout(() => { if (_zoomContent) _zoomContent.innerHTML = ""; }, 230);
  }

  boot();
})();
