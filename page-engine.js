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

      // Carousel items — positioned by centre-x via transform so only
      // left% drives the slide motion; width scales around the centre
      // which eliminates the resize-grows-while-moving artifact.
      ".w-carousel-item{" +
        "position:absolute;top:5%;height:90%;overflow:hidden;" +
        "border-radius:var(--radius);" +
        "transform:translateX(-50%);" +
        "transition:" +
          "left .55s cubic-bezier(.22,1,.36,1)," +
          "width .55s cubic-bezier(.22,1,.36,1)," +
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

      // Zoom overlay
      "#page-zoom-overlay{" +
        "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.97);" +
        "display:flex;align-items:center;justify-content:center;" +
        "opacity:0;pointer-events:none;transition:opacity .22s ease;" +
        "cursor:zoom-out;overflow:auto;" +
      "}" +
      "#page-zoom-overlay.open{opacity:1;pointer-events:all;}" +
      "#page-zoom-content{" +
        "display:flex;align-items:center;justify-content:center;" +
        "min-height:100vh;padding:2rem;" +
      "}" +
      "#page-zoom-content img{" +
        "max-width:96vw;max-height:96vh;" +
        "width:auto;height:auto;display:block;" +
        "object-fit:contain;cursor:zoom-out;" +
      "}" +
      "#page-zoom-close{" +
        "position:fixed;top:1rem;right:1rem;" +
        "background:rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.15);" +
        "color:rgba(255,255,255,.8);width:34px;height:34px;" +
        "border-radius:50%;cursor:pointer;font-size:.9rem;" +
        "display:flex;align-items:center;justify-content:center;" +
        "z-index:10000;transition:background .2s;" +
      "}" +
      "#page-zoom-close:hover{background:rgba(255,255,255,.1);}";
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
        <a href="/" style="
          font-family:var(--mono);font-size:0.72rem;letter-spacing:0.12em;
          text-transform:uppercase;text-decoration:none;
          color:var(--muted);border:1px solid var(--border);
          padding:0.4rem 0.9rem;border-radius:var(--radius);
          transition:color 0.2s,border-color 0.2s;
        " onmouseover="this.style.color='var(--text)';this.style.borderColor='var(--muted)'"
           onmouseout="this.style.color='var(--muted)';this.style.borderColor='var(--border)'">
          &larr; Back to Work
        </a>
        <span style="font-family:var(--mono);font-size:0.62rem;letter-spacing:0.1em;color:var(--muted);text-transform:uppercase;">
          AJ Ambrozic
        </span>
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
      if (opts.manage === "autoplay")        autoplayObserver.observe(v);
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

    // cx = centre position as % of stage width
    // w  = item width as % of stage width
    // op = opacity (1 = fully visible)
    // z  = z-index
    const SLOT_DESKTOP = {
      "-2": { cx:  7, w: 13, op: 0.20, z: 1 },
      "-1": { cx: 23, w: 22, op: 0.55, z: 2 },
       "0": { cx: 50, w: 44, op: 1.00, z: 4 },
       "1": { cx: 77, w: 22, op: 0.55, z: 2 },
       "2": { cx: 93, w: 13, op: 0.20, z: 1 },
    };
    const SLOT_MOBILE = {
      "-1": { cx: 10, w: 18, op: 0.45, z: 2 },
       "0": { cx: 50, w: 62, op: 1.00, z: 4 },
       "1": { cx: 90, w: 18, op: 0.45, z: 2 },
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
          // Park off-screen on the correct side so it slides in smoothly
          const parkW = isMobile ? 18 : 13;
          el.style.left      = (pos < 0 ? -10 : 110) + "%";
          el.style.transform = "translateX(-50%)";
          el.style.width     = parkW + "%";
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
        el.style.transform = "translateX(-50%)";
        el.style.width     = spec.w  + "%";
        el.style.opacity   = spec.op;
        el.style.zIndex    = spec.z;

        // Center: full visible with object-fit contain (no crop), zoomable
        if (pos === 0) {
          el.style.cursor        = "default";
          el.style.pointerEvents = "auto";
          if (img) {
            img.style.objectFit = "contain";
            img.style.cursor    = "zoom-in";
            img.onclick = e => { e.stopPropagation(); openZoom(img.src); };
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

  // ── Image zoom overlay ───────────────────────────────────────────
  // CSS for this is injected by injectCriticalStyles() above.
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
