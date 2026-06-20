/**
 * page-engine.js
 * Renders a single custom subpage. Loaded only by the tiny
 * auto-generated stub files at /pages/<slug>/ -> /<slug>/index.html
 * You should never need to edit this file directly.
 */

(function () {
  const SLUG = window.PAGE_SLUG;
  let pagesData = null;

  // Videos that should auto-loop (full-bleed, carousel): pause when off-screen,
  // resume automatically when back in view -- including after a resize/reflow.
  const autoplayObserver = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) e.target.play().catch(()=>{});
      else e.target.pause();
    });
  }, { threshold: 0.15 });

  // Videos with native controls (media-only): pause when off-screen to save
  // resources, but never force-resume -- that would override the user's
  // own play/pause choice.
  const pauseOnlyObserver = new IntersectionObserver(entries => {
    entries.forEach(e => { if (!e.isIntersecting) e.target.pause(); });
  }, { threshold: 0.15 });

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

  // ── Header — mirrors index.html's left/right split nav ──────
  function buildHeader(pages) {
    const root = document.getElementById("header-root");
    const left = pages.map(p =>
      `<a class="nav-link${p.slug === SLUG ? " active" : ""}" href="/${p.slug}/">${esc(p.label)}</a>`
    ).join("");

    root.innerHTML = `
      <header id="site-header">
        <a id="wordmark" href="/">AJ Ambrozic</a>
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
  }

  function buildFooter() {
    document.getElementById("footer-root").innerHTML = `
      <footer>
        <a class="nav-link" href="/">&larr; Back to Work</a>
        <span>AJ Ambrozic</span>
      </footer>`;
  }

  // ── Content ──────────────────────────────────────────────
  // No hardcoded page title -- the widgets themselves carry titles
  // wherever you want one (e.g. a text-only or full-bleed widget first).
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

  // opts.autoplay: muted/looping background-style video (no controls)
  // opts.controls: user-operated video, no autoplay, no forced resume
  // opts.manage: which observer to register with ("autoplay" | "pause-only" | none)
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

      if (opts.manage === "autoplay") autoplayObserver.observe(v);
      else if (opts.manage === "pause-only") pauseOnlyObserver.observe(v);

      return v;
    }
    const img = document.createElement("img");
    img.alt = ""; img.loading = "lazy";
    img.onerror = () => img.replaceWith(makeMissingPlaceholder());
    img.src = mediaPath(slug, item.file);
    return img;
  }

  function buildWidget(w, slug, index) {
    const section = document.createElement("section");
    section.className = "widget";
    section.dataset.type = w.type;
    section.style.background = w.background || "var(--bg)";

    switch (w.type) {
      case "image-left":
      case "text-left":   section.appendChild(buildSplitText(w, slug)); break;
      case "split":        section.appendChild(buildSplitFlanked(w, slug)); break;
      case "media-only":  section.appendChild(buildMediaOnly(w, slug)); break;
      case "full-bleed":  section.appendChild(buildFullBleed(w, slug)); break;
      case "carousel":    section.appendChild(buildCarouselWidget(w, slug, index)); break;
      case "text-only":
      default:             section.appendChild(buildTextOnly(w)); break;
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

  // image-left / text-left: media treated like a silent looping clip if it's a video
  function buildSplitText(w, slug) {
    const grid = document.createElement("div");
    grid.className = "widget-grid";
    const mediaWrap = document.createElement("div");
    mediaWrap.className = "w-media";
    const m = buildMediaEl(slug, w.media[0], { autoplay: true, manage: "autoplay" });
    if (m) mediaWrap.appendChild(m); else mediaWrap.appendChild(makeMissingPlaceholder());
    grid.appendChild(mediaWrap);
    grid.appendChild(buildTextBlock(w));
    return grid;
  }

  function buildSplitFlanked(w, slug) {
    const grid = document.createElement("div");
    grid.className = "widget-grid widget-grid-split";

    const left = document.createElement("div");
    left.className = "w-media";
    const lm = buildMediaEl(slug, w.media[0], { autoplay: true, manage: "autoplay" });
    if (lm) left.appendChild(lm);

    const right = document.createElement("div");
    right.className = "w-media";
    const rm = buildMediaEl(slug, w.media[1], { autoplay: true, manage: "autoplay" });
    if (rm) right.appendChild(rm);

    grid.appendChild(left);
    grid.appendChild(buildTextBlock(w));
    grid.appendChild(right);
    return grid;
  }

  // media-only: a deliberate single showcase piece -- user-operated controls,
  // never auto-resumed against their wishes
  function buildMediaOnly(w, slug) {
    const wrap = document.createElement("div");
    wrap.className = "w-media-only";
    const m = buildMediaEl(slug, w.media[0], { controls: true, manage: "pause-only" });
    if (m) wrap.appendChild(m); else wrap.appendChild(makeMissingPlaceholder());
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

  // Carousel: video lifecycle is managed at the WIDGET level, not per-slide --
  // only the active slide's video should ever be playing, and resize/scroll
  // should resume that same active slide rather than every hidden one at once.
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

    const track = document.createElement("div");
    track.className = "w-carousel-track";
    const dots = document.createElement("div");
    dots.className = "w-carousel-dots";

    const items = w.media;
    let active = 0, timer = null;

    items.forEach((m, i) => {
      const slide = document.createElement("div");
      slide.className = "w-carousel-slide" + (i === 0 ? " active" : "");
      // No per-element observer here -- managed by the widget-level observer below
      const el = buildMediaEl(slug, m, { autoplay: i === 0 });
      if (el) slide.appendChild(el); else slide.appendChild(makeMissingPlaceholder());
      track.appendChild(slide);

      const dot = document.createElement("div");
      dot.className = "w-carousel-dot" + (i === 0 ? " active" : "");
      dot.onclick = () => go(i);
      dots.appendChild(dot);
    });

    function go(i) {
      track.querySelectorAll(".w-carousel-slide").forEach((s, idx) => {
        s.classList.toggle("active", idx === i);
        const v = s.querySelector("video");
        if (v) { if (idx === i) v.play().catch(()=>{}); else v.pause(); }
      });
      dots.querySelectorAll(".w-carousel-dot").forEach((d, idx) => d.classList.toggle("active", idx === i));
      active = i;
      clearInterval(timer);
      if (items.length > 1) timer = setInterval(() => go((active + 1) % items.length), 5000);
    }
    if (items.length > 1) timer = setInterval(() => go((active + 1) % items.length), 5000);

    // Resize/scroll resume -- always targets whichever slide is currently active
    const widgetObserver = new IntersectionObserver(entries => {
      entries.forEach(e => {
        const activeVideo = track.querySelector(".w-carousel-slide.active video");
        if (!activeVideo) return;
        if (e.isIntersecting) activeVideo.play().catch(()=>{});
        else activeVideo.pause();
      });
    }, { threshold: 0.15 });
    widgetObserver.observe(wrap);

    wrap.appendChild(track);
    if (items.length > 1) wrap.appendChild(dots);
    return wrap;
  }

  function esc(s) {
    return String(s || "")
      .replace(/&/g,"&amp;").replace(/</g,"&lt;")
      .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  boot();
})();
