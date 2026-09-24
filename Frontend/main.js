// ==================== 0. SHARED OVERLAY / SCROLL LOCK ====================
// Several independent surfaces can lock page scroll at once — the basic
// modals (login/code/upload/success), the dashboard, the gallery, and the
// separate "Find My Photos" flow below. Previously each one set
// `document.body.style.overflow` directly, so closing any one of them wiped
// out the lock even while another overlay was still open, and the page could
// end up either permanently locked or scrollable behind a full-screen view.
// This tracks every currently-open overlay by name and only restores
// scrolling once none remain, so opens/closes can never step on each other.
window.PFOverlayLock = (function () {
  const openOverlays = new Set();
  const closeHandlers = new Map();
  let suppressedPopCount = 0;
  function apply() {
    const locked = openOverlays.size > 0;
    document.documentElement.style.overflow = locked ? "hidden" : "";
    document.body.style.overflow = locked ? "hidden" : "";
  }
  window.addEventListener("popstate", () => {
    if (suppressedPopCount) { suppressedPopCount -= 1; apply(); return; }
    const name = [...openOverlays].at(-1);
    if (!name) return;
    const close = closeHandlers.get(name);
    if (close) close(); else { openOverlays.delete(name); apply(); }
  });
  return {
    add(name, close) {
      if (close) closeHandlers.set(name, close);
      if (!openOverlays.has(name)) {
        openOverlays.add(name);
        if (window.history?.pushState) {
          const state = window.history.state && typeof window.history.state === "object" ? window.history.state : {};
          if (state.__photoFinderOverlay !== name) window.history.pushState({ ...state, __photoFinderOverlay: name }, "", window.location.href);
        }
      }
      apply();
    },
    remove(name) {
      openOverlays.delete(name);
      closeHandlers.delete(name);
      if (window.history?.state?.__photoFinderOverlay === name) { suppressedPopCount += 1; window.history.back(); }
      apply();
    },
  };
})();

// ==================== 0b. SHARED HTML / THUMBNAIL UTILITIES ====================
// Used by both the Auth/Dashboard/Gallery IIFE and the separate "Find My
// Photos" IIFE below, so these are declared once here instead of being
// duplicated inside each closure. Declared as `function`/`const` at the top
// of the script (before either IIFE runs) so both closures can see them.
function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>'"]/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[char],
  );
}

// A small inline camera-icon placeholder shown whenever an event has no
// usable cover image, or whenever a real cover image URL fails to load.
// This is a self-contained data URI — not a fetched or invented external
// image URL — so it can never itself produce a broken-image icon and never
// triggers a network request.
const EVENT_THUMB_FALLBACK =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
      '<rect width="64" height="64" rx="10" fill="#1c1c1c"/>' +
      '<path d="M20 24h5l2-4h10l2 4h5a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H20a2 2 0 0 1-2-2V26a2 2 0 0 1 2-2z" fill="none" stroke="#666" stroke-width="2"/>' +
      '<circle cx="32" cy="34" r="6" fill="none" stroke="#666" stroke-width="2"/>' +
      "</svg>",
  );

// Reads any of the common cover-image field names a backend event record
// might use. Returns null (never a fabricated URL) when none is present, so
// callers know to fall back to EVENT_THUMB_FALLBACK instead of leaving
// `src` empty or pointing somewhere invalid.
function getEventThumbUrl(event) {
  const url =
    event?.thumbnail ??
    event?.thumbnailUrl ??
    event?.thumbnail_url ??
    event?.coverUrl ??
    event?.cover_url ??
    event?.coverImage ??
    event?.cover_image ??
    event?.imageUrl ??
    event?.image_url ??
    null;

  return typeof url === "string" && url.trim() ? url : null;
}

function formatEventAccessCode(value) {
  const raw = String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 10);

  // Existing demo codes use 4-4. Current event codes use 2-4-4.
  if (raw.length <= 8) {
    return raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4, 8)}` : raw;
  }

  return `${raw.slice(0, 2)}-${raw.slice(2, 6)}-${raw.slice(6, 10)}`;
}

(() => {
  // ==================== 1. CANVAS SCROLL SEQUENCE ====================
  const TOTAL_FRAMES = 300;
  const canvas = document.getElementById("sequence-canvas");
  const ctx = canvas.getContext("2d", { alpha: false });

  const images = new Array(TOTAL_FRAMES);
  const loaded = new Array(TOTAL_FRAMES).fill(false);

  let currentFrame = 0;
  let targetFrame = 0;
  let lastDrawnFrame = -1;
  let dpr = 1;
  let canvasWidth = 0;
  let canvasHeight = 0;

  function getFrameSrc(index) {
    const frameNum = String(index + 1).padStart(3, "0");
    return `frames/ezgif-frame-${frameNum}.jpg`;
  }

  function drawImageCover(img) {
    if (!img || !img.complete || img.naturalWidth === 0) return;

    const imgWidth = img.naturalWidth;
    const imgHeight = img.naturalHeight;
    const imgRatio = imgWidth / imgHeight;
    const canvasRatio = canvasWidth / canvasHeight;

    let renderWidth, renderHeight, offsetX, offsetY;

    if (canvasRatio > imgRatio) {
      renderWidth = canvasWidth;
      renderHeight = canvasWidth / imgRatio;
      offsetX = 0;
      offsetY = (canvasHeight - renderHeight) / 2;
    } else {
      renderHeight = canvasHeight;
      renderWidth = canvasHeight * imgRatio;
      offsetX = (canvasWidth - renderWidth) / 2;
      offsetY = 0;
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, offsetX, offsetY, renderWidth, renderHeight);
  }

  function getNearestLoadedIndex(targetIdx) {
    if (loaded[targetIdx]) return targetIdx;
    let offset = 1;
    while (offset < TOTAL_FRAMES) {
      const prev = targetIdx - offset;
      if (prev >= 0 && loaded[prev]) return prev;
      const next = targetIdx + offset;
      if (next < TOTAL_FRAMES && loaded[next]) return next;
      offset++;
    }
    return -1;
  }

  function renderFrame(index, force = false) {
    const clampedIndex = Math.max(
      0,
      Math.min(TOTAL_FRAMES - 1, Math.round(index)),
    );
    const actualIndex = getNearestLoadedIndex(clampedIndex);

    if (actualIndex === -1) return;
    if (!force && actualIndex === lastDrawnFrame) return;

    drawImageCover(images[actualIndex]);
    lastDrawnFrame = actualIndex;
  }

  function handleResize() {
    // Keep the CSS box in device-independent pixels while the backing store
    // tracks the display density. This avoids stretching a low-resolution
    // canvas during mobile browser-chrome/orientation resizes.
    const viewport = window.visualViewport;
    const displayWidth = Math.round(viewport?.width || window.innerWidth);
    const displayHeight = Math.round(viewport?.height || window.innerHeight);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvasWidth = Math.max(1, Math.round(displayWidth * dpr));
    canvasHeight = Math.max(1, Math.round(displayHeight * dpr));

    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    renderFrame(currentFrame, true);
  }

  window.addEventListener("resize", handleResize, { passive: true });
  window.visualViewport?.addEventListener("resize", handleResize, { passive: true });
  window.addEventListener("orientationchange", handleResize, { passive: true });
  handleResize();

  function preloadImages() {
    const firstImg = new Image();
    firstImg.src = getFrameSrc(0);
    images[0] = firstImg;

    firstImg.onload = () => {
      loaded[0] = true;
      renderFrame(0, true);
    };

    for (let i = 1; i < TOTAL_FRAMES; i++) {
      const img = new Image();
      img.src = getFrameSrc(i);
      images[i] = img;

      if ("decode" in img) {
        img
          .decode()
          .then(() => {
            loaded[i] = true;
            if (Math.round(currentFrame) === i) {
              renderFrame(i, true);
            }
          })
          .catch(() => {
            img.onload = () => {
              loaded[i] = true;
              if (Math.round(currentFrame) === i) {
                renderFrame(i, true);
              }
            };
          });
      } else {
        img.onload = () => {
          loaded[i] = true;
          if (Math.round(currentFrame) === i) {
            renderFrame(i, true);
          }
        };
      }
    }
  }

  preloadImages();

  // Initialize Lenis smooth scroll
  //
  // `smoothWheel: true` makes Lenis intercept wheel/trackpad input and drive
  // the scroll position itself. That's the standard way Lenis works, but it
  // means that if Lenis's own scroll math ever gets out of sync with the
  // page (e.g. a resize or layout change while it's mid-animation), it can
  // end up swallowing every wheel/trackpad event via preventDefault() without
  // ever moving the page — while native browser scrollbar dragging keeps
  // working because it never goes through Lenis's wheel listener at all.
  // That exact split (scrollbar works, wheel/trackpad don't) is what was
  // reported. Rather than risk breaking Lenis's own bundled code (not part
  // of this frontend's editable files), we disable only the wheel/touch
  // hijacking so the browser's native scrolling handles wheel, trackpad,
  // touch and the scrollbar consistently. Lenis stays initialized purely for
  // its `scrollTo()` easing (used by the brand "back to top" action) and the
  // rest of the scroll-linked canvas/section animation system is untouched —
  // it already reads scroll position from the native `scroll` event, not
  // from Lenis.
  let lenis = null;
  if (typeof Lenis !== "undefined") {
    lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: "vertical",
      gestureOrientation: "vertical",
      smoothWheel: false,
      wheelMultiplier: 1.0,
      smoothTouch: false,
      touchMultiplier: 1.5,
    });
  }

  // Storytelling section fade effects based on scroll progress
  const progressBar = document.getElementById("scroll-progress-bar");
  const secHero = document.getElementById("section-hero");
  const secIntro = document.getElementById("section-intro");
  const secHow = document.getElementById("section-how");
  const secUploadDemo = document.getElementById("section-upload-demo");
  const secCode = document.getElementById("section-code");
  const secSearch = document.getElementById("section-search");
  const secEditorial = document.getElementById("section-editorial");
  const secUseCases = document.getElementById("section-use-cases");
  const secPrivacy = document.getElementById("section-privacy");
  const secUpload = document.getElementById("section-upload");

  function calcSectionFade(p, startIn, peakIn, peakOut, endOut) {
    if (p < startIn || p > endOut) return 0;
    if (p < peakIn) return (p - startIn) / Math.max(0.001, peakIn - startIn);
    if (p <= peakOut) return 1;
    return 1 - (p - peakOut) / Math.max(0.001, endOut - peakOut);
  }

  function applySectionState(el, opacity, translateY = 0) {
    if (!el) return;
    const clampedOpacity = Math.max(0, Math.min(1, opacity));
    el.style.opacity = clampedOpacity;
    el.style.pointerEvents = clampedOpacity > 0.15 ? "auto" : "none";
    el.style.transform = `translateY(${translateY}px)`;
    if (clampedOpacity > 0.25) {
      el.classList.add("active-visible");
    } else {
      el.classList.remove("active-visible");
    }
  }

  function updateScroll() {
    const scrollContainer = document.documentElement;
    const maxScroll = scrollContainer.scrollHeight - window.innerHeight;
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const progress =
      maxScroll > 0 ? Math.max(0, Math.min(1, scrollY / maxScroll)) : 0;
    targetFrame = progress * (TOTAL_FRAMES - 1);

    // Update top progress bar
    if (progressBar) {
      progressBar.style.width = `${progress * 100}%`;
    }

    // Section 1: Hero (0.0 -> 0.10)
    const heroOpacity = progress < 0.1 ? 1 - progress / 0.08 : 0;
    applySectionState(secHero, heroOpacity, -(progress * 120));

    // Section 2: Intro & 3 Editorial Words (0.07 -> 0.19)
    const introOpacity = calcSectionFade(progress, 0.06, 0.11, 0.16, 0.2);
    applySectionState(secIntro, introOpacity, (1 - introOpacity) * 24);

    // Section 3: How It Works (0.17 -> 0.29)
    const howOpacity = calcSectionFade(progress, 0.16, 0.21, 0.26, 0.3);
    applySectionState(secHow, howOpacity, (1 - howOpacity) * 24);

    // Section 4: Floating Upload UI Demo (0.27 -> 0.39)
    const uploadDemoOpacity = calcSectionFade(progress, 0.26, 0.31, 0.36, 0.4);
    applySectionState(
      secUploadDemo,
      uploadDemoOpacity,
      (1 - uploadDemoOpacity) * 24,
    );

    // Section 5: Access Code Section (0.37 -> 0.50)
    const codeOpacity = calcSectionFade(progress, 0.36, 0.42, 0.47, 0.51);
    applySectionState(secCode, codeOpacity, (1 - codeOpacity) * 24);

    // Section 6: Smart Search (0.48 -> 0.61)
    const searchOpacity = calcSectionFade(progress, 0.47, 0.53, 0.58, 0.62);
    applySectionState(secSearch, searchOpacity, (1 - searchOpacity) * 24);

    // Section 7: Editorial Feature List (0.59 -> 0.72)
    const editorialOpacity = calcSectionFade(progress, 0.58, 0.64, 0.69, 0.73);
    applySectionState(
      secEditorial,
      editorialOpacity,
      (1 - editorialOpacity) * 24,
    );

    // Section 8: Use Cases & Stories (0.70 -> 0.83)
    const casesOpacity = calcSectionFade(progress, 0.69, 0.75, 0.8, 0.84);
    applySectionState(secUseCases, casesOpacity, (1 - casesOpacity) * 24);

    // Section 9: Privacy & Security (0.81 -> 0.93)
    const privacyOpacity = calcSectionFade(progress, 0.8, 0.85, 0.9, 0.94);
    applySectionState(secPrivacy, privacyOpacity, (1 - privacyOpacity) * 24);

    // Section 10: Eiffel Tower Climax Upload (0.90 -> 1.0)
    const uploadOpacity =
      progress > 0.89 ? Math.min(1, (progress - 0.89) / 0.08) : 0;
    applySectionState(secUpload, uploadOpacity, (1 - uploadOpacity) * 24);
  }

  window.addEventListener("scroll", updateScroll, { passive: true });
  updateScroll();

  function tick(time) {
    if (lenis) lenis.raf(time);
    updateScroll();

    const delta = targetFrame - currentFrame;
    if (Math.abs(delta) > 0.0005) {
      currentFrame += delta * 0.14;
    } else {
      currentFrame = targetFrame;
    }

    renderFrame(currentFrame);
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);

  // ==================== 2. AUTH & STATE MANAGEMENT ====================
  // api.js already exports API_BASE_URL for exactly this reason: direct
  // fetch() calls in this file (login, signup, the /api/auth/me check) must
  // agree with whatever origin api.js itself is calling, or a request can
  // silently land on the wrong port (e.g. this frontend's own :3000 dev
  // server instead of the :5000 backend) and come back as an unexpected
  // 404/401. Reuse it here instead of hard-coding a second, possibly
  // inconsistent URL.
  const apiOrigin = () =>
    window.PhotoFinderApi?.getApiBaseUrl?.() ||
    `${window.location.protocol === "https:" ? "https:" : "http:"}//${window.location.hostname}:5000`;

  let currentUser = null;
  let authToken = localStorage.getItem("pf_token") || null;
  const eventMediaCache = new Map();
  const eventMediaRequests = new Map();
  const knownAccessCodes = new Map();

  const navAuthBtn = document.getElementById("nav-auth-btn");
  const navDashboardBtn = document.getElementById("nav-dashboard-btn");
  const navLogoutBtn = document.getElementById("nav-logout-btn");
  const navBrand = document.getElementById("nav-brand");
  const mainNav = document.getElementById("main-nav");
  const mobileNavToggle = document.getElementById("mobile-nav-toggle");

  function closeMobileNav() {
    mainNav?.classList.remove("menu-open");
    mobileNavToggle?.setAttribute("aria-expanded", "false");
    mobileNavToggle?.setAttribute("aria-label", "Open navigation");
  }

  mobileNavToggle?.addEventListener("click", () => {
    const open = mainNav?.classList.toggle("menu-open");
    mobileNavToggle.setAttribute("aria-expanded", String(Boolean(open)));
    mobileNavToggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
  });
  document.getElementById("mobile-find-photos-btn")?.addEventListener("click", () => {
    closeMobileNav();
    document.getElementById("nav-find-photos-btn")?.click();
  });
  document.querySelectorAll(".nav-menu a").forEach((link) =>
    link.addEventListener("click", closeMobileNav),
  );

  function updateAuthUI() {
    if (authToken && currentUser) {
      navAuthBtn.classList.add("hidden");
      navDashboardBtn.classList.remove("hidden");
      navLogoutBtn.classList.remove("hidden");
      const userGreeting = document.getElementById("dashboard-user-name");
      if (userGreeting)
        userGreeting.textContent = `Welcome, ${currentUser.name}`;
    } else {
      navAuthBtn.classList.remove("hidden");
      navDashboardBtn.classList.add("hidden");
      navLogoutBtn.classList.add("hidden");
    }
  }

  // ROOT CAUSE OF THE LOGIN BUG: `logout` was referenced in several places
  // below (the nav/dashboard logout buttons, and the 401 handlers inside
  // loadCollections() and the upload submit handler) but was never defined
  // anywhere in this file.
navLogoutBtn?.addEventListener("click", logout);
  // runs synchronously the moment this script executes, and referencing the
  // undefined `logout` identifier there throws a ReferenceError immediately
  // on page load — before Section 7 (the real login/signup submit handlers)
  // ever gets a chance to run. With those listeners never attached, submitting
  // the login form fell back to a native, non-JS form submission: the POST
  // request itself could still reach the backend and "succeed" (visible as a
  // 200 in the Network tab), but no JS ever read the response, stored the
  // token, or updated app state, so the page ended up back on its default
  // logged-out UI immediately after. Defining `logout` here removes the
  // crash and gives every one of its call sites a real implementation.
  function logout() {
    authToken = null;
    currentUser = null;
    localStorage.removeItem("pf_token");
    eventMediaCache.clear();
    eventMediaRequests.clear();
    knownAccessCodes.clear();

    closeAllModals();
    dashboardView.classList.add("hidden");
    galleryView.classList.add("hidden");
    window.PFOverlayLock.remove("dashboard");
    window.PFOverlayLock.remove("gallery");

    updateAuthUI();
    showToast("Logged out successfully");
  }

  async function checkAuthStatus() {
    if (!authToken) {
      updateAuthUI();
      return;
    }

    try {
      const res = await fetch(`${apiOrigin()}/api/auth/me`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        currentUser = data.user;
      } else {
        console.warn("Auth check failed:", res.status);
        // Previously the rejected token was left in localStorage forever,
        // so every future page load repeated this same failed check
        // against a token the backend had already rejected. Clear it so
        // the UI correctly settles into a logged-out state.
        authToken = null;
        currentUser = null;
        localStorage.removeItem("pf_token");
      }
    } catch (e) {
      console.warn("Auth check error:", e);
    }

    updateAuthUI();
  }

  checkAuthStatus();
  // ==================== 3. TOAST NOTIFICATIONS ====================
  const toastContainer = document.getElementById("toast-container");
  function showToast(message, duration = 3000) {
    if (!toastContainer) return;
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(10px)";
      toast.style.transition = "all 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  async function copyText(text) {
    if (!text || text === "Code unavailable") {
      showToast("This access code is unavailable in this session.");
      return false;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        textarea.remove();
        if (!copied) throw new Error("Copy failed");
      }
      return true;
    } catch (error) {
      console.warn("Clipboard copy failed:", error);
      showToast("Could not copy the access code.");
      return false;
    }
  }

  // ==================== 4. MODAL MANAGEMENT ====================
  const codeModal = document.getElementById("code-modal");
  const authModal = document.getElementById("auth-modal");
  const uploadModal = document.getElementById("upload-modal");
  const successModal = document.getElementById("success-modal");
  const deleteEventModal = document.getElementById("delete-event-modal");
  const dashboardView = document.getElementById("dashboard-view");
  const galleryView = document.getElementById("gallery-view");
  const lightbox = document.getElementById("lightbox");

  function closeAllModals() {
    codeModal?.classList.add("hidden");
    authModal?.classList.add("hidden");
    uploadModal?.classList.add("hidden");
    successModal?.classList.add("hidden");
    deleteEventModal?.classList.add("hidden");
    document.getElementById("delete-photo-modal")?.classList.add("hidden");
    window.PFOverlayLock.remove("basicModal");
  }

  function openModal(modalEl) {
    if (!modalEl) return;
    closeAllModals();
    modalEl.classList.remove("hidden");
    window.PFOverlayLock.add("basicModal", closeAllModals);
  }

  window.addEventListener("photoFinder:open-event-code", (event) => {
    const subtext = codeModal?.querySelector(".modal-subtext");
    if (subtext) subtext.textContent = event.detail?.eventId
      ? "This link selected a private event. Enter the code shared by its owner to continue."
      : "Enter the event code shared by its owner to continue.";
    openModal(codeModal);
  });

  document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeAllModals();
    });
  });

  document
    .getElementById("code-modal-close")
    ?.addEventListener("click", closeAllModals);
  document
    .getElementById("auth-modal-close")
    ?.addEventListener("click", closeAllModals);
  document
    .getElementById("upload-modal-close")
    ?.addEventListener("click", closeAllModals);
  document
    .getElementById("upload-cancel-btn")
    ?.addEventListener("click", closeAllModals);

  // Esc key closes modals
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!lightbox.classList.contains("hidden")) {
        closeLightbox();
      } else {
        closeAllModals();
      }
    }
  });

  // ==================== 5. CODE FORMATTING & VERIFICATION ====================
  function formatAccessCode(inputEl) {
    inputEl.addEventListener("input", (e) => {
      e.target.value = formatEventAccessCode(e.target.value);
    });

    inputEl.addEventListener("paste", (e) => {
      const pastedText = e.clipboardData?.getData("text");
      if (typeof pastedText !== "string") return;
      e.preventDefault();
      inputEl.value = formatEventAccessCode(pastedText);
      inputEl.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  const inlineCodeInput = document.getElementById("inline-code-input");
  const modalCodeInput = document.getElementById("modal-code-input");
  if (inlineCodeInput) formatAccessCode(inlineCodeInput);
  if (modalCodeInput) formatAccessCode(modalCodeInput);

  async function handleCodeVerification(code, feedbackEl, submitBtn) {
    if (!authToken || !currentUser) {
      closeAllModals();
      openModal(authModal);
      showToast("Please login first.");
      return;
    }

    if (!code || code.trim().length < 4) {
      if (feedbackEl) {
        feedbackEl.classList.remove("hidden");
        feedbackEl.innerHTML =
          "<h4>CODE NOT FOUND</h4><p>Check the code and try again.</p>";
      }
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "VERIFYING...";
    }

    try {
      const data = await window.PhotoFinderApi.redeemAccessCode(code);

      if (!data?.event?.id) {
        throw new Error("No event was returned.");
      }

      knownAccessCodes.set(data.event.id, code.trim().toUpperCase());

      closeAllModals();
      await loadCollections();
      if (window.PhotoFinderOpenWelcome) await window.PhotoFinderOpenWelcome(data.event);
      else await openEventGallery(data.event);

      showToast("Event access granted.");
    } catch (error) {
      if (feedbackEl) {
        feedbackEl.classList.remove("hidden");

        const message =
          error?.status === 401
            ? "Please login first."
            : error?.status === 403
              ? "You are not allowed to access this event."
              : error?.message || "Invalid access code.";

        feedbackEl.innerHTML = `<h4>ACCESS FAILED</h4><p>${message}</p>`;
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = "VIEW MEMORIES <span>→</span>";
      }
    }
  }

  // Inline form submit
  document
    .getElementById("inline-code-form")
    ?.addEventListener("submit", (e) => {
      e.preventDefault();
      const code = inlineCodeInput.value.trim();
      const msg = document.getElementById("inline-code-msg");
      const submitBtn = document.getElementById("inline-code-submit");
      handleCodeVerification(code, msg, submitBtn);
    });

  // Modal form submit
  document
    .getElementById("modal-code-form")
    ?.addEventListener("submit", (e) => {
      e.preventDefault();
      const code = modalCodeInput.value.trim();
      const msg = document.getElementById("code-feedback");
      const submitBtn = document.getElementById("modal-code-submit");
      handleCodeVerification(code, msg, submitBtn);
    });

  document.getElementById("home-create-event-btn")?.addEventListener("click", () => {
    document.getElementById("hero-upload-btn")?.click();
  });

  // ==================== EDITORIAL PILLARS (FIND / SHARE / EXPERIENCE) ====================
  const pillarItems = document.querySelectorAll(".pillar-item");
  pillarItems.forEach((item) => {
    item.addEventListener("mouseenter", () => {
      pillarItems.forEach((p) => p.classList.remove("active"));
      item.classList.add("active");
    });
    item.addEventListener("click", () => {
      pillarItems.forEach((p) => p.classList.remove("active"));
      item.classList.add("active");
    });
  });

  // ==================== STORY TABS SWITCHER ====================
  const storyData = {
    travel: {
      badge: "EXPEDITION & EXPLORATION",
      title: "Road Trips & Scenic Flights",
      desc: "Share an event code and let travel companions find their own photos with private face matching.",
      stat1: "Private event gallery",
      stat2: "Find photos with face matching",
    },
    weddings: {
      badge: "CEREMONIES & CELEBRATIONS",
      title: "Collect Every Angle From Every Guest",
      desc: "Place QR cards on reception tables. Guests can securely open the event and use Find My Photos.",
      stat1: "Owner-issued code or QR access",
      stat2: "Guests can search their event photos",
    },
    events: {
      badge: "FESTIVALS & CONFERENCES",
      title: "Live Event Photo Hubs",
      desc: "Create a private event gallery, track photo processing, and let attendees find their memories.",
      stat1: "Owner can see processing status",
      stat2: "Private gallery downloads",
    },
    family: {
      badge: "HERITAGE & GENERATIONS",
      title: "Preserve Milestones In High Definition",
      desc: "Safe from algorithmic feeds and public advertising. A quiet, private haven for family memories.",
      stat1: "Private by design",
      stat2: "Save loved photos to a collection",
    },
    creators: {
      badge: "PROFESSIONAL PROOFING",
      title: "Deliver Private Event Galleries",
      desc: "Create a branded event space with QR access, private downloads, and shareable loved collections.",
      stat1: "Share a read-only loved collection",
      stat2: "Manage private event galleries",
    },
  };

  const storyTabs = document.querySelectorAll(".story-tab");
  const storyBadgeEl = document.getElementById("story-badge");
  const storyTitleEl = document.getElementById("story-title");
  const storyDescEl = document.getElementById("story-desc");
  const storyFactOneEl = document.getElementById("story-fact-one");
  const storyFactTwoEl = document.getElementById("story-fact-two");

  storyTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      storyTabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const key = tab.dataset.story;
      const data = storyData[key];
      if (data && storyBadgeEl && storyTitleEl && storyDescEl) {
        storyBadgeEl.textContent = data.badge;
        storyTitleEl.textContent = data.title;
        storyDescEl.textContent = data.desc;
        if (storyFactOneEl) storyFactOneEl.textContent = data.stat1;
        if (storyFactTwoEl) storyFactTwoEl.textContent = data.stat2;
      }
    });
  });

  // ==================== 6. NAVIGATION ACTIONS ====================
  document.getElementById("hero-upload-btn")?.addEventListener("click", () => {
    if (authToken && currentUser) {
      openDashboard();
      openCreateModal();
    } else {
      openModal(authModal);
    }
  });

  document
    .getElementById("climax-upload-btn")
    ?.addEventListener("click", () => {
      if (authToken && currentUser) {
        openDashboard();
        openCreateModal();
      } else {
        openModal(authModal);
      }
    });

  document
    .getElementById("footer-login-link")
    ?.addEventListener("click", (e) => {
      e.preventDefault();
      if (authToken && currentUser) {
        openDashboard();
      } else {
        openModal(authModal);
      }
    });

  navAuthBtn?.addEventListener("click", () => openModal(authModal));
  navDashboardBtn?.addEventListener("click", () => openDashboard());
  navLogoutBtn?.addEventListener("click", logout);
  document
    .getElementById("dashboard-logout-btn")
    ?.addEventListener("click", logout);

  document
    .getElementById("dashboard-back-home-btn")
    ?.addEventListener("click", () => {
      dashboardView.classList.add("hidden");
      window.PFOverlayLock.remove("dashboard");
    });

  navBrand?.addEventListener("click", () => {
    dashboardView.classList.add("hidden");
    galleryView.classList.add("hidden");
    window.PFOverlayLock.remove("dashboard");
    window.PFOverlayLock.remove("gallery");
    closeAllModals();
    if (lenis) {
      lenis.scrollTo(0);
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });

  // Smooth scroll for nav anchor links
  document
    .querySelectorAll('.nav-menu a, .footer-links a[href^="#"], .hero-quick-links a[href^="#"]')
    .forEach((link) => {
      link.addEventListener("click", (e) => {
        const targetId = link.getAttribute("href");
        if (targetId && targetId.startsWith("#")) {
          e.preventDefault();
          const targetEl = document.querySelector(targetId);
          if (targetEl) {
            if (lenis) {
              lenis.scrollTo(targetEl, { offset: -60 });
            } else {
              targetEl.scrollIntoView({ behavior: "smooth" });
            }
          }
        }
      });
    });

  // ==================== 7. AUTH TABS & SUBMISSION ====================
  const tabLoginBtn = document.getElementById("tab-login-btn");
  const tabSignupBtn = document.getElementById("tab-signup-btn");
  const loginPanel = document.getElementById("login-panel");
  const signupPanel = document.getElementById("signup-panel");
  const authErrorMsg = document.getElementById("auth-error-msg");

  function showLoginTab() {
    tabLoginBtn.classList.add("active");
    tabSignupBtn.classList.remove("active");
    loginPanel.classList.remove("hidden");
    signupPanel.classList.add("hidden");
    authErrorMsg.classList.add("hidden");
  }

  function showSignupTab() {
    tabSignupBtn.classList.add("active");
    tabLoginBtn.classList.remove("active");
    signupPanel.classList.remove("hidden");
    loginPanel.classList.add("hidden");
    authErrorMsg.classList.add("hidden");
  }

  tabLoginBtn?.addEventListener("click", showLoginTab);
  tabSignupBtn?.addEventListener("click", showSignupTab);
  document
    .getElementById("switch-to-signup")
    ?.addEventListener("click", (e) => {
      e.preventDefault();
      showSignupTab();
    });
  document.getElementById("switch-to-login")?.addEventListener("click", (e) => {
    e.preventDefault();
    showLoginTab();
  });

  // Quick Demo Login
  document.getElementById("demo-login-fill")?.addEventListener("click", () => {
    document.getElementById("login-email").value = "alex@photofinder.io";
    document.getElementById("login-password").value = "demo123";
    document.getElementById("login-form").dispatchEvent(new Event("submit"));
  });

  // Login Submit
  document
    .getElementById("login-form")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      authErrorMsg.classList.add("hidden");
      const email = document.getElementById("login-email").value;
      const password = document.getElementById("login-password").value;
      const submitBtn = document.getElementById("login-submit-btn");

      submitBtn.disabled = true;
      submitBtn.textContent = "LOGGING IN...";

      try {
        const res = await fetch(`${apiOrigin()}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (res.ok) {
          eventMediaCache.clear();
          eventMediaRequests.clear();
          knownAccessCodes.clear();
          authToken = data.token;
          currentUser = data.user;
          localStorage.setItem("pf_token", authToken);
          updateAuthUI();
          closeAllModals();
          openDashboard();
          showToast(`Welcome back, ${currentUser.name}`);
          if (new URLSearchParams(window.location.search).get("eventCode")) setTimeout(() => document.getElementById("hero-find-photos-btn")?.click(), 0);
        } else {
          authErrorMsg.textContent = data.error || "Invalid email or password";
          authErrorMsg.classList.remove("hidden");
        }
      } catch (err) {
        authErrorMsg.textContent = "Connection error, please try again";
        authErrorMsg.classList.remove("hidden");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "LOGIN";
      }
    });

  // Sign Up Submit
  document
    .getElementById("signup-form")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      authErrorMsg.classList.add("hidden");
      const name = document.getElementById("signup-name").value;
      const email = document.getElementById("signup-email").value;
      const password = document.getElementById("signup-password").value;
      const confirmPassword = document.getElementById(
        "signup-confirm-password",
      ).value;
      const submitBtn = document.getElementById("signup-submit-btn");

      if (password !== confirmPassword) {
        authErrorMsg.textContent = "Passwords do not match";
        authErrorMsg.classList.remove("hidden");
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = "CREATING ACCOUNT...";

      try {
        const res = await fetch(`${apiOrigin()}/api/auth/signup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password, confirmPassword }),
        });
        const data = await res.json();
        if (res.ok) {
          eventMediaCache.clear();
          eventMediaRequests.clear();
          knownAccessCodes.clear();
          authToken = data.token;
          currentUser = data.user;
          localStorage.setItem("pf_token", authToken);
          updateAuthUI();
          closeAllModals();
          openDashboard();
          showToast(`Account created! Welcome, ${currentUser.name}`);
          if (new URLSearchParams(window.location.search).get("eventCode")) setTimeout(() => document.getElementById("hero-find-photos-btn")?.click(), 0);
        } else {
          authErrorMsg.textContent = data.error || "Failed to create account";
          authErrorMsg.classList.remove("hidden");
        }
      } catch (err) {
        authErrorMsg.textContent = "Connection error, please try again";
        authErrorMsg.classList.remove("hidden");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "CREATE ACCOUNT";
      }
    });

  // ==================== 8. UPLOADER DASHBOARD ====================
  const collectionsGrid = document.getElementById("collections-grid");
  const collectionsBadge = document.getElementById("collections-badge");
  const collectionsEmpty = document.getElementById("collections-empty");
  const collectionCards = new Map();
  const MEDIA_CACHE_TTL = 50 * 60 * 1000;

  async function openDashboard() {
    if (!authToken) {
      openModal(authModal);
      return;
    }
    dashboardView.classList.remove("hidden");
    window.PFOverlayLock.add("dashboard", () => { dashboardView.classList.add("hidden"); window.PFOverlayLock.remove("dashboard"); });
    await loadCollections();
  }

  async function loadCollections() {
    if (!authToken || !currentUser) {
      renderCollections([]);
      return;
    }

    try {
      const response = await window.PhotoFinderApi.getEvents();

      const events = Array.isArray(response)
        ? response
        : response?.events || [];

      renderCollections(events);
      void hydrateDashboardMedia(events);
      void loadLovedCollections(events);
    } catch (error) {
      console.error("Error fetching events:", error);

      if (error?.status === 401) {
        logout();
        return;
      }

      showToast(error?.message || "Failed to load events");

      renderCollections([]);
    }
  }

  // Normalizes one raw event record (from getEvents()/createEvent()/
  // redeemAccessCode()) into the fields the dashboard card and the gallery
  // bridge below need, tolerating whichever field-naming convention the
  // backend uses (camelCase vs snake_case, `media` present or not).
  function normalizeEventRecord(event) {
    const id = event?.id ?? event?.eventId ?? event?._id ?? "";
    const name = event?.name ?? event?.title ?? "Untitled event";
    const accessCode =
      event?.accessCode ??
      event?.access_code ??
      event?.code ??
      knownAccessCodes.get(id) ??
      null;
    const media = Array.isArray(event?.media) ? event.media : [];
    const photosCount =
      event?.photosCount ??
      event?.photos_count ??
      event?.photoCount ??
      (media.length
        ? media.filter((item) => item?.type !== "video").length
        : null);
    const videosCount =
      event?.videosCount ??
      event?.videos_count ??
      event?.videoCount ??
      (media.length
        ? media.filter((item) => item?.type === "video").length
        : null);

    return {
      id,
      name,
      accessCode,
      ownerId: event?.owner_id ?? event?.ownerId ?? null,
      description: event?.description ?? "",
      coverPhotoId: event?.cover_photo_id ?? event?.coverPhotoId ?? null,
      photosCount,
      videosCount,
      media,
    };
  }

  function normalizeMedia(media) {
    return (Array.isArray(media) ? media : [])
      .filter((item) => item?.url)
      .map((item) => ({
        ...item,
        type: item.type || "image",
        filename:
          item.filename || item.storage_path?.split("/").pop() || "Event photo",
      }));
  }

  async function getCachedEventMedia(eventId) {
    const cached = eventMediaCache.get(eventId);
    if (cached && Date.now() - cached.cachedAt < MEDIA_CACHE_TTL) {
      return cached.media;
    }

    if (eventMediaRequests.has(eventId)) {
      return eventMediaRequests.get(eventId);
    }

    const request = window.PhotoFinderApi.getEventPhotos(eventId)
      .then((response) => {
        const media = normalizeMedia(
          Array.isArray(response)
            ? response
            : response?.media || response?.photos,
        );
        eventMediaCache.set(eventId, { media, cachedAt: Date.now() });
        return media;
      })
      .finally(() => eventMediaRequests.delete(eventId));

    eventMediaRequests.set(eventId, request);
    return request;
  }

  function mediaSummary(media) {
    const videos = media.filter((item) => item.type === "video").length;
    return { photos: media.length - videos, videos };
  }

  // ROOT CAUSE OF "0 collections": this function was called from
  // loadCollections() (both on success and in every error branch) but was
  // never defined anywhere in this file — the same class of bug the
  // `logout` comment above describes. Calling an undefined function throws
  // a ReferenceError, which loadCollections()'s own try/catch swallowed
  // into a generic toast, so the dashboard grid/badge/empty-state were
  // never actually updated and stayed on their static zero-state markup no
  // matter what getEvents() returned. This implementation is driven
  // entirely by the current Events API response — no legacy collections
  // endpoint shape involved.
  function renderCollections(events) {
    if (!collectionsGrid) return;

    const list = Array.isArray(events) ? events : [];
    collectionCards.clear();

    if (collectionsBadge) {
      collectionsBadge.textContent = `${list.length} collection${list.length === 1 ? "" : "s"}`;
    }

    collectionsGrid.innerHTML = "";

    if (!list.length) {
      collectionsEmpty?.classList.remove("hidden");
      collectionsGrid.classList.add("hidden");
      return;
    }

    collectionsEmpty?.classList.add("hidden");
    collectionsGrid.classList.remove("hidden");

    list.forEach((rawEvent) => {
      const collection = normalizeEventRecord(rawEvent);
      // The event-list response has no safe cover URL. Leave the card on the
      // local fallback until its authorized photo request supplies a signed URL.
      const thumbUrl = null;
      const isOwner =
        collection.ownerId && collection.ownerId === currentUser?.id;

      // NOTE: these class names (collection-card / collection-thumb-box /
      // collection-thumb / collection-info / collection-name /
      // collection-meta / collection-code) follow the same naming
      // convention as the existing upload file-preview cards. If
      // style.css doesn't already have matching rules for them, the cards
      // will still render and work correctly (clickable, safe thumbnail),
      // just unstyled — add matching CSS rules to match your design.
      const card = document.createElement("div");
      card.className = "collection-card";
      card.dataset.eventId = collection.id;
      card.innerHTML = `
        <div class="card-cover">
          <img class="collection-thumb" src="${escapeHtml(thumbUrl || EVENT_THUMB_FALLBACK)}" alt="" loading="lazy" />
        </div>
          <div class="card-content">
            <div class="card-title" title="${escapeHtml(collection.name)}">${escapeHtml(collection.name)}</div>
            ${collection.description ? `<div class="card-description">${escapeHtml(collection.description)}</div>` : ""}
            <div class="card-stats">${collection.photosCount === null ? "Loading media…" : `${collection.photosCount} photo${collection.photosCount === 1 ? "" : "s"} · ${collection.videosCount} video${collection.videosCount === 1 ? "" : "s"}`}</div>
          <div class="card-code ${collection.accessCode ? "" : "unavailable"}">CODE: <strong>${escapeHtml(collection.accessCode || "Code unavailable")}</strong></div>
          <div class="card-actions">
            <button type="button" class="secondary-button view-btn">VIEW COLLECTION</button>
            ${isOwner ? '<button type="button" class="delete-col-btn" title="Delete collection" aria-label="Delete collection">⌫</button>' : ""}
          </div>
        </div>
      `;

      const thumbImg = card.querySelector(".collection-thumb");
      thumbImg?.addEventListener(
        "error",
        () => {
          thumbImg.onerror = null;
          thumbImg.src = EVENT_THUMB_FALLBACK;
        },
        { once: true },
      );

      card.addEventListener("click", () => openEventGallery(rawEvent));
      card.querySelector(".view-btn")?.addEventListener("click", (event) => {
        event.stopPropagation();
        openEventGallery(rawEvent);
      });
      card
        .querySelector(".delete-col-btn")
        ?.addEventListener("click", (event) => {
          event.stopPropagation();
          openDeleteEventModal(rawEvent);
        });

      collectionsGrid.appendChild(card);
      collectionCards.set(collection.id, { card, event: rawEvent });
    });
  }

  async function hydrateCollectionCard(rawEvent) {
    const collection = normalizeEventRecord(rawEvent);
    if (!collection.id) return;

    try {
      const media = collection.media.length
        ? normalizeMedia(collection.media)
        : await getCachedEventMedia(collection.id);
      const cardEntry = collectionCards.get(collection.id);
      if (!cardEntry) return;
      const summary = mediaSummary(media);
      const stats = cardEntry.card.querySelector(".card-stats");
      if (stats) {
        stats.textContent = `${summary.photos} photo${summary.photos === 1 ? "" : "s"} · ${summary.videos} video${summary.videos === 1 ? "" : "s"}`;
      }
      const cover = cardEntry.card.querySelector(".collection-thumb");
      const coverPhoto = media.find((photo) => String(photo.id) === String(collection.coverPhotoId)) || media[0];
      if (cover && coverPhoto?.url) cover.src = coverPhoto.url;
    } catch (error) {
      console.warn("Could not hydrate event media:", error);
      const stats = collectionCards
        .get(collection.id)
        ?.card.querySelector(".card-stats");
      if (stats) stats.textContent = "Media unavailable";
    }
  }

  async function hydrateDashboardMedia(events) {
    const queue = [...events];
    const worker = async () => {
      while (queue.length) {
        await hydrateCollectionCard(queue.shift());
      }
    };
    await Promise.all([worker(), worker()]);
  }

  // Bridges any event record (from a dashboard card click, or from the
  // "Enter Code" success path in handleCodeVerification) into the existing
  // openGallery() renderer below. This was previously called but never
  // defined, which silently broke the "Enter Code" -> gallery flow.
  // If the event record doesn't already carry a full media array (some
  // list endpoints only return counts), it fetches the authoritative photo
  // list via the existing PhotoFinderApi.getEventPhotos() — no new
  // endpoint, no legacy event-photos route.
  async function openEventGallery(event) {
    const collection = normalizeEventRecord(event);
    const cachedMedia = collection.media.length
      ? normalizeMedia(collection.media)
      : eventMediaCache.get(collection.id)?.media;

    openGallery({
      id: collection.id,
      ownerId: collection.ownerId,
      name: collection.name,
      description: collection.description,
      coverPhotoId: collection.coverPhotoId,
      accessCode: collection.accessCode,
      photosCount: collection.photosCount,
      videosCount: collection.videosCount,
      media: cachedMedia || [],
      loading: !cachedMedia,
    });

    if (cachedMedia) return;

    try {
      const media = await getCachedEventMedia(collection.id);
      const summary = mediaSummary(media);
      openGallery({
        id: collection.id,
        ownerId: collection.ownerId,
        name: collection.name,
        description: collection.description,
        coverPhotoId: collection.coverPhotoId,
        accessCode: collection.accessCode,
        photosCount: summary.photos,
        videosCount: summary.videos,
        media,
      });
    } catch (error) {
      console.warn("Failed to load event photos:", error);
      openGallery({
        id: collection.id,
        ownerId: collection.ownerId,
        ...collection,
        media: [],
        loading: false,
        loadError: true,
      });
    }
  }

  // ==================== 9. DRAG AND DROP & MEDIA UPLOAD ====================
  let selectedFiles = [];
  const dropZone = document.getElementById("drop-zone");
  const fileInput = document.getElementById("file-input");
  const selectedFilesContainer = document.getElementById(
    "selected-files-container",
  );
  const filesPreviewGrid = document.getElementById("files-preview-grid");
  const selectedCount = document.getElementById("selected-count");
  const uploadProgressContainer = document.getElementById(
    "upload-progress-container",
  );
  const uploadProgressFill = document.getElementById("upload-progress-fill");
  const uploadProgressLabel = document.getElementById("upload-progress-label");
  const uploadSubmitBtn = document.getElementById("upload-submit-btn");

  function openCreateModal() {
    selectedFiles = [];
    document.getElementById("upload-col-name").value = "";
    renderSelectedFiles();
    uploadProgressContainer.classList.add("hidden");
    uploadProgressFill.style.width = "0%";
    openModal(uploadModal);
  }

  document
    .getElementById("dash-create-btn")
    ?.addEventListener("click", openCreateModal);
  document
    .getElementById("empty-create-btn")
    ?.addEventListener("click", openCreateModal);

  document
    .getElementById("browse-files-btn")
    ?.addEventListener("click", (e) => {
      e.stopPropagation();
      fileInput.click();
    });

  dropZone?.addEventListener("click", () => fileInput.click());

  dropZone?.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("drag-over");
  });

  dropZone?.addEventListener("dragleave", () => {
    dropZone.classList.remove("drag-over");
  });

  dropZone?.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("drag-over");
    if (e.dataTransfer.files) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  });

  fileInput?.addEventListener("change", () => {
    if (fileInput.files) {
      addFiles(Array.from(fileInput.files));
      fileInput.value = "";
    }
  });

  document.getElementById("clear-files-btn")?.addEventListener("click", () => {
    selectedFiles = [];
    renderSelectedFiles();
  });

  function addFiles(newFiles) {
    const validExts = [
      ".jpg",
      ".jpeg",
      ".png",
      ".webp",
      ".mp4",
      ".mov",
      ".webm",
    ];
    newFiles.forEach((file) => {
      const ext = "." + file.name.split(".").pop().toLowerCase();
      if (validExts.includes(ext)) {
        selectedFiles.push(file);
      }
    });
    renderSelectedFiles();
  }

  function formatBytes(bytes) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }

  function renderSelectedFiles() {
    if (!filesPreviewGrid) return;
    filesPreviewGrid.innerHTML = "";

    if (selectedFiles.length === 0) {
      selectedFilesContainer.classList.add("hidden");
      if (uploadSubmitBtn) uploadSubmitBtn.disabled = true;
      return;
    }

    selectedFilesContainer.classList.remove("hidden");
    selectedCount.textContent = `${selectedFiles.length} file${selectedFiles.length === 1 ? "" : "s"} selected`;
    if (uploadSubmitBtn) uploadSubmitBtn.disabled = false;

    selectedFiles.forEach((file, index) => {
      const card = document.createElement("div");
      // NOTE: these class names must match the .file-preview-item / .file-thumb-box /
      // .file-name-truncate rules in style.css — a prior mismatch here (file-preview-card /
      // file-preview-thumb / file-preview-name) meant every preview card rendered completely
      // unstyled, so newly added photos had no visible size or layout and appeared broken.
      card.className = "file-preview-item";

      const isVideo =
        file.type.startsWith("video/") ||
        file.name.endsWith(".mov") ||
        file.name.endsWith(".mp4") ||
        file.name.endsWith(".webm");
      let thumbContent = isVideo ? '<span class="video-badge">▶</span>' : "";

      card.innerHTML = `
        <div class="file-thumb-box" id="thumb-${index}">${thumbContent}</div>
        <div class="file-name-truncate" title="${file.name}">${file.name}</div>
        <div class="file-preview-size">${formatBytes(file.size)}</div>
        <button type="button" class="file-remove-btn" data-index="${index}">×</button>
      `;

      if (!isVideo) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const thumbEl = card.querySelector(`#thumb-${index}`);
          if (thumbEl)
            thumbEl.innerHTML = `<img src="${e.target.result}" alt="" />`;
        };
        reader.readAsDataURL(file);
      }

      card.querySelector(".file-remove-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        selectedFiles.splice(index, 1);
        renderSelectedFiles();
      });

      filesPreviewGrid.appendChild(card);
    });
  }

  // Submit Upload
  uploadSubmitBtn?.addEventListener("click", async () => {
    if (!authToken || !currentUser) {
      closeAllModals();
      openModal(authModal);
      return;
    }

    if (!selectedFiles.length) {
      showToast("Please select at least one photo.");
      return;
    }

    const eventName = document.getElementById("upload-col-name").value.trim();

    if (!eventName) {
      showToast("Please enter an event name.");
      return;
    }

    const imageFiles = selectedFiles.filter((file) =>
      ["image/jpeg", "image/png", "image/webp"].includes(file.type),
    );

    if (!imageFiles.length) {
      showToast("Please select JPG, PNG or WEBP images.");
      return;
    }

    uploadProgressContainer.classList.remove("hidden");
    uploadSubmitBtn.disabled = true;
    uploadProgressFill.style.width = "0%";
    uploadProgressLabel.textContent = "Creating event...";

    try {
      const eventResponse = await window.PhotoFinderApi.createEvent(eventName);

      const event = eventResponse?.event;

      if (!event?.id) {
        throw new Error("Event creation failed.");
      }

      uploadProgressLabel.textContent = "Uploading photos...";

      await window.PhotoFinderApi.uploadEventPhotos(
        event.id,
        imageFiles,
        undefined,
        (uploaded, total) => {
          const percent = Math.round((uploaded / total) * 100);

          uploadProgressFill.style.width = `${percent}%`;

          uploadProgressLabel.textContent = `Uploading photo ${uploaded} of ${total}...`;
        },
      );

      uploadProgressLabel.textContent = "Generating access code...";

      const codeResponse = await window.PhotoFinderApi.generateAccessCode(
        event.id,
      );

      const createdEvent = {
        ...event,
        accessCode: codeResponse?.access_code || null,
      };

      if (createdEvent.accessCode) {
        knownAccessCodes.set(event.id, createdEvent.accessCode);
      }
      eventMediaCache.delete(event.id);

      closeAllModals();

      showSuccessModal(codeResponse?.access_code || "GENERATED", createdEvent);

      await loadCollections();
    } catch (error) {
      console.error("Create event error:", error);

      if (error?.status === 401) {
        logout();
      } else {
        showToast(error?.message || "Event creation failed.");
      }
    } finally {
      uploadSubmitBtn.disabled = false;
      uploadProgressContainer.classList.add("hidden");
    }
  });

  // Success Modal Handling
  let lastCreatedCollection = null;
  function showSuccessModal(code, collection) {
    lastCreatedCollection = collection;
    document.getElementById("generated-code-value").textContent = code;
    openModal(successModal);
  }

  document
    .getElementById("copy-code-btn")
    ?.addEventListener("click", async () => {
      const code = document.getElementById("generated-code-value").textContent;
      if (!(await copyText(code))) return;
      document.getElementById("copy-text").textContent = "COPIED!";
      showToast(`Access code copied: ${code}`);
      setTimeout(() => {
        document.getElementById("copy-text").textContent = "COPY CODE";
      }, 2000);
    });

  document.getElementById("success-done-btn")?.addEventListener("click", () => {
    closeAllModals();
    openDashboard();
  });

  document.getElementById("success-view-btn")?.addEventListener("click", () => {
    closeAllModals();
    const code = document.getElementById("generated-code-value").textContent;
    handleCodeVerification(code);
  });

  // ==================== 10. PRIVATE COLLECTION GALLERY ====================
  let currentGalleryMedia = [];
  let currentGalleryEvent = null;
  const selectedGalleryPhotos = new Set();
  let gallerySelectionMode = false;

  function saveBrowserDownload(file) {
    const url = URL.createObjectURL(file.blob);
    const link = document.createElement("a");
    link.href = url; link.download = file.filename; link.rel = "noopener";
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function loadLovedCollections(events) {
    const grid = document.getElementById("loved-collections-grid");
    const section = document.getElementById("loved-section");
    if (!grid || !section) return;
    try {
      const response = await window.PhotoFinderApi.getNamedLovedCollections();
      const loved = response?.collections || [];
      section.classList.remove("hidden");
      document.getElementById("loved-collections-empty")?.classList.toggle("hidden", loved.length > 0);
      grid.innerHTML = "";
      loved.forEach((collection) => {
        const card = document.createElement("article");
        card.className = "collection-card loved-card";
        card.dataset.lovedCollectionId = collection.id;
        const photos = (collection.photos || []).slice(0, 4);
        const previews = photos.length
          ? photos.map((photo, index) => `<img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.filename || `Saved memory ${index + 1}`)}" loading="lazy">`).join("")
          : '<div class="loved-card-empty-preview" aria-hidden="true">♥</div>';
        card.innerHTML = `<div class="loved-card-previews">${previews}<span class="loved-card-photo-count">${collection.count} ${collection.count === 1 ? "PHOTO" : "PHOTOS"}</span></div><div class="loved-card-content"><p class="loved-card-kicker">PRIVATE COLLECTION</p><h3 class="loved-card-title">${escapeHtml(collection.name)}</h3><p class="loved-card-meta">${collection.count} saved memor${collection.count === 1 ? "y" : "ies"}</p><div class="loved-card-actions"><button type="button" class="primary-button view-btn">VIEW COLLECTION</button><button type="button" class="secondary-button download-loved-btn">↓ DOWNLOAD</button><button type="button" class="loved-delete-btn" title="Delete entire loved collection">DELETE COLLECTION</button></div></div>`;
        card.querySelector(".loved-card-actions").insertAdjacentHTML("beforeend", '<button type="button" class="secondary-button share-loved-btn">SHARE</button>');
        card.querySelector(".view-btn").addEventListener("click", () => window.LovedCollectionView?.open(collection));
        card.querySelector(".download-loved-btn").addEventListener("click", async () => { try { saveBrowserDownload(await window.PhotoFinderApi.downloadLovedCollection(collection.id)); } catch (error) { showToast(error?.message || "Could not prepare collection download."); } });
        card.querySelector(".share-loved-btn").addEventListener("click", () => window.openCollectionShare?.(collection));
        card.querySelector(".loved-delete-btn").addEventListener("click", (event) => { event.stopPropagation(); window.LovedCollectionDeletion?.open(collection, card); });
        grid.appendChild(card);
      });
    } catch (error) { console.warn("Could not load loved collections", error); section.classList.remove("hidden"); document.getElementById("loved-collections-empty")?.classList.remove("hidden"); }

    const photosGrid = document.getElementById("loved-photos-grid");
    const photosEmpty = document.getElementById("loved-photos-empty");
    try {
      const result = await window.PhotoFinderApi.getLovedCollections(); const groups = result?.collections || [];
      photosGrid.innerHTML = ""; photosEmpty.classList.toggle("hidden", groups.length > 0);
      groups.forEach((group) => {
        const raw = (events || []).find((event) => String(event.id) === String(group.event_id));
        const card = document.createElement("article"); card.className = "collection-card loved-photo-card";
        card.innerHTML = `<div class="card-content"><div class="card-title">${escapeHtml(group.name || "Event")}</div><div class="card-stats">${Number(group.count || 0)} loved photo${Number(group.count || 0) === 1 ? "" : "s"}</div><button type="button" class="secondary-button view-btn">VIEW LOVED PHOTOS</button></div>`;
        card.querySelector(".view-btn").onclick = async () => {
          try {
            const media = normalizeMedia((await window.PhotoFinderApi.getEventPhotos(group.event_id)).photos).filter((photo) => photo.loved);
            const normalized = normalizeEventRecord(raw || { id: group.event_id, name: group.name });
            openGallery({ ...normalized, media, photosCount: media.length, videosCount: 0 });
          } catch (error) { showToast(error?.message || "Loved photos are unavailable."); }
        };
        photosGrid.append(card);
      });
    } catch (error) { console.warn("Could not load loved photos", error); photosEmpty.classList.remove("hidden"); }

    try {
      const list = document.getElementById("recent-searches-list"); const result = await window.PhotoFinderApi.getMyActivity();
      const activity = result?.activity || [];
      const renderActivity = (items, empty, label) => items.length ? items.map((item) => {
        const date = new Date(item.created_at);
        return `<li><strong>${escapeHtml(item.event_name || "Event")} · ${label}</strong><time datetime="${escapeHtml(item.created_at || "")}">${Number.isNaN(date.valueOf()) ? "Time unavailable" : escapeHtml(date.toLocaleString())}</time></li>`;
      }).join("") : `<li>${empty}</li>`;
      list.innerHTML = renderActivity(activity.filter((item) => item.kind === "match_search"), "No recent searches yet.", "Photo search");
      document.getElementById("recent-downloads-list").innerHTML = renderActivity(activity.filter((item) => item.kind === "download"), "No recent downloads yet.", "Download");
    } catch (error) { document.getElementById("recent-searches-list").innerHTML = "<li>Recent searches are unavailable right now.</li>"; document.getElementById("recent-downloads-list").innerHTML = "<li>Recent downloads are unavailable right now.</li>"; }
  }

  const activeProcessingPolls = new Set();
  function waitForProcessing(eventId) {
    if (activeProcessingPolls.has(eventId)) return;
    activeProcessingPolls.add(eventId);
    const poll = async () => {
      if (currentGalleryEvent?.id !== eventId) { activeProcessingPolls.delete(eventId); return; }
      try { await refreshCurrentGallery(); } catch { /* Keep the current gallery usable during transient errors. */ }
      const active = currentGalleryEvent?.id === eventId && await refreshProcessingProgress(eventId);
      if (active) setTimeout(poll, 2500);
      else activeProcessingPolls.delete(eventId);
    };
    setTimeout(poll, 800);
  }
  async function refreshCurrentGallery() {
    if (!currentGalleryEvent?.id) return;
    eventMediaCache.delete(currentGalleryEvent.id);
    const media = await getCachedEventMedia(currentGalleryEvent.id);
    openGallery({ ...currentGalleryEvent, media, photosCount: media.length, videosCount: 0 });
    void loadCollections();
  }

  async function refreshProcessingProgress(eventId) {
    const progress = document.getElementById("gallery-processing-progress");
    if (!progress || currentGalleryEvent?.id !== eventId) return false;
    try {
      const metrics = (await window.PhotoFinderApi.getEventInsights(eventId)).metrics;
      if (currentGalleryEvent?.id !== eventId) return false;
      const total = Number(metrics?.total_photos || 0);
      const counts = { pending: Number(metrics?.pending || 0), processing: Number(metrics?.processing || 0), ready: Number(metrics?.ready || 0), failed: Number(metrics?.failed || 0) };
      const known = Object.values(counts).reduce((sum, count) => sum + count, 0);
      const pct = total > 0 && known === total ? Math.round(counts.ready / total * 100) : null;
      progress.classList.toggle("hidden", !total);
      if (total) progress.innerHTML = `<strong>PHOTO PROCESSING</strong><span>${total} total · ${counts.pending} pending · ${counts.processing} processing · ${counts.ready} ready · ${counts.failed} failed${pct === null ? "" : ` · ${pct}% ready`}</span>${pct === null ? "" : `<div class="processing-track"><i style="width:${pct}%"></i></div>`}${counts.failed ? `<small>${counts.failed} photo${counts.failed === 1 ? "" : "s"} failed processing and may need to be uploaded again.</small>` : ""}`;
      return counts.pending + counts.processing > 0;
    } catch {
      if (currentGalleryEvent?.id === eventId) { progress.classList.remove("hidden"); progress.innerHTML = "<strong>PHOTO PROCESSING</strong><span>Processing status is temporarily unavailable.</span>"; }
      return false;
    }
  }

  function openGallery(collection) {
    currentGalleryMedia = collection.media || [];
    currentGalleryEvent = { ...collection };
    window.currentGalleryEvent = currentGalleryEvent;
    const validPhotoIds = new Set(currentGalleryMedia.filter((item) => item.type !== "video" && item.id).map((item) => String(item.id)));
    for (const id of selectedGalleryPhotos) if (!validPhotoIds.has(id)) selectedGalleryPhotos.delete(id);
    const isOwner = Boolean(collection.ownerId && collection.ownerId === currentUser?.id);
    let progress = document.getElementById("gallery-processing-progress");
    if (!progress) { progress = document.createElement("section"); progress.id = "gallery-processing-progress"; progress.className = "owner-processing-progress hidden"; progress.setAttribute("aria-live", "polite"); document.querySelector("#gallery-view .gallery-header")?.after(progress); }
    progress.classList.toggle("hidden", !isOwner || collection.loading);
    document.getElementById("gallery-add-btn")?.classList.toggle("hidden", !isOwner);
    document.getElementById("gallery-qr-btn")?.classList.toggle("hidden", !isOwner);
    document.getElementById("gallery-analytics-btn")?.classList.toggle("hidden", !isOwner);
    document.getElementById("gallery-branding-btn")?.classList.toggle("hidden", !isOwner);
    document.getElementById("gallery-reindex-btn")?.classList.toggle("hidden", !isOwner);
    document.getElementById("gallery-select-btn")?.setAttribute("aria-pressed", String(gallerySelectionMode));
    document.getElementById("gallery-select-btn")?.classList.toggle("is-active", gallerySelectionMode);
    document.getElementById("gallery-selection-toolbar")?.classList.toggle("hidden", !gallerySelectionMode);
    document.getElementById("gallery-selection-count").textContent = `${selectedGalleryPhotos.size} selected`;
    document.getElementById("gallery-title").textContent = collection.name;
    const photos = collection.photosCount ?? 0;
    const videos = collection.videosCount ?? 0;
    document.getElementById("gallery-stats").textContent = collection.loading
      ? "Loading memories…"
      : `${photos} photo${photos === 1 ? "" : "s"} · ${videos} video${videos === 1 ? "" : "s"}`;
    const galleryCode = document.getElementById("gallery-code-text");
    const galleryCodeBadge = document.getElementById("gallery-code-badge");
    galleryCode.textContent = collection.accessCode || "Code unavailable";
    galleryCodeBadge.classList.toggle(
      "code-unavailable",
      !collection.accessCode,
    );
    galleryCodeBadge.title = collection.accessCode
      ? "Click to copy code"
      : "This code is unavailable in this session";

    const grid = document.getElementById("gallery-grid");
    const empty = document.getElementById("gallery-empty");
    grid.innerHTML = "";

    if (collection.loading) {
      empty.classList.add("hidden");
      grid.innerHTML =
        '<div class="gallery-loading" role="status">Loading event memories…</div>';
    } else if (currentGalleryMedia.length === 0) {
      empty.classList.remove("hidden");
      if (collection.loadError) {
        empty.querySelector("p").textContent =
          "We could not load this collection. Please try again.";
      }
    } else {
      empty.classList.add("hidden");

      currentGalleryMedia.forEach((item, index) => {
        const el = document.createElement("div");
        el.className = "gallery-item";

        if (item.type === "video") {
          el.innerHTML = `
            <video src="${item.url}" preload="metadata" muted playsinline></video>
            <div class="item-badge">▶ VIDEO</div>
            <div class="gallery-item-overlay">
              <span class="gallery-item-name">${item.filename}</span>${item.processing_status ? `<span class="item-badge processing-${item.processing_status}">${item.processing_status.toUpperCase()}</span>` : ""}${isOwner && item.duplicate_of ? `<span class="item-badge duplicate-badge">DUPLICATE</span>` : ""}
            </div>
          `;
          // Play preview on hover
          const vid = el.querySelector("video");
          el.addEventListener("mouseenter", () => vid.play().catch(() => {}));
          el.addEventListener("mouseleave", () => {
            vid.pause();
            vid.currentTime = 0;
          });
        } else {
          el.innerHTML = `
            <img src="${item.url}" alt="${item.filename}" loading="lazy" />
            <div class="gallery-item-overlay">
              <span class="gallery-item-name">${item.filename}</span>${item.processing_status ? `<span class="item-badge processing-${item.processing_status}">${item.processing_status.toUpperCase()}</span>` : ""}${isOwner && item.duplicate_of ? `<span class="item-badge duplicate-badge">DUPLICATE</span>` : ""}
            </div>
          `;
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox"; checkbox.className = "gallery-selection-check"; checkbox.setAttribute("aria-label", `Select ${item.filename || "photo"}`);
          checkbox.checked = selectedGalleryPhotos.has(String(item.id)); checkbox.hidden = !gallerySelectionMode;
          checkbox.addEventListener("click", (event) => event.stopPropagation());
          checkbox.addEventListener("change", () => { if (checkbox.checked) selectedGalleryPhotos.add(String(item.id)); else selectedGalleryPhotos.delete(String(item.id)); document.getElementById("gallery-selection-count").textContent = `${selectedGalleryPhotos.size} selected`; });
          el.appendChild(checkbox);
        }

        const actions = document.createElement("div");
        actions.className = "photo-actions";
        actions.innerHTML = `
          <button type="button" class="photo-action love-action ${item.loved ? "is-loved" : ""}" aria-label="${item.loved ? "Remove love" : "Love photo"}" title="Love photo">♥</button>
          <button type="button" class="photo-action download-action" aria-label="Download ${escapeHtml(item.filename)}" title="Download photo">↓</button>
          ${isOwner ? '<button type="button" class="photo-action delete-action" aria-label="Delete photo" title="Delete photo">×</button>' : ""}`;
        actions.querySelector(".love-action")?.addEventListener("click", async (event) => {
          event.stopPropagation();
          const button = event.currentTarget; if (button.dataset.saving === "true") return;
          button.dataset.saving = "true";
          const previous = Boolean(item.loved); item.loved = !previous;
          button.classList.toggle("is-loved", item.loved); button.setAttribute("aria-label", item.loved ? "Remove love" : "Love photo");
          try { const result = await window.PhotoFinderApi.setPhotoFavorite(currentGalleryEvent.id, item.id, item.loved); item.loved = result.loved; }
          catch (error) { item.loved = previous; button.classList.toggle("is-loved", previous); button.setAttribute("aria-label", previous ? "Remove love" : "Love photo"); showToast(error?.message || "Could not save your reaction."); }
          finally { delete button.dataset.saving; }
        });
        actions.querySelector(".download-action")?.addEventListener("click", async (event) => {
          event.stopPropagation();
          try { saveBrowserDownload(await window.PhotoFinderApi.downloadPhoto(currentGalleryEvent.id, item.id)); }
          catch (error) { showToast(error?.message || "Could not download this photo."); }
        });
        actions.querySelector(".delete-action")?.addEventListener("click", (event) => { event.stopPropagation(); openDeletePhotoModal(item); });
        if (isOwner && item.duplicate_of) { el.addEventListener("dblclick", (event) => { event.preventDefault(); event.stopPropagation(); openDeletePhotoModal(item); }); }
        el.appendChild(actions);

        el.addEventListener("click", () => openLightbox(index));
        grid.appendChild(el);
      });
    }

    galleryView.classList.remove("hidden");
    window.PFOverlayLock.add("gallery", () => document.getElementById("gallery-back-btn")?.click());
    if (isOwner && !collection.loading) void refreshProcessingProgress(collection.id).then((active) => { if (active) waitForProcessing(collection.id); });
  }

  document.getElementById("gallery-back-btn")?.addEventListener("click", () => {
    galleryView.classList.add("hidden");
    window.PFOverlayLock.remove("gallery");
  });

  document
    .getElementById("gallery-code-badge")
    ?.addEventListener("click", async () => {
      const code = document.getElementById("gallery-code-text").textContent;
      if (!(await copyText(code))) return;
      showToast(`Code copied: ${code}`);
    });

  document.getElementById("gallery-add-btn")?.addEventListener("click", () => document.getElementById("gallery-add-files")?.click());
  document.getElementById("gallery-add-files")?.addEventListener("change", async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length || !currentGalleryEvent?.id) return;
    try {
      const upload = await window.PhotoFinderApi.uploadEventPhotos(currentGalleryEvent.id, files);
      await refreshCurrentGallery();
      const duplicateCount = upload.results.reduce((count, result) => count + (result?.data?.duplicates?.length || 0), 0);
      showToast(`${files.length} photo${files.length === 1 ? "" : "s"} queued for AI processing.${duplicateCount ? ` ${duplicateCount} duplicate candidate${duplicateCount === 1 ? "" : "s"} found.` : ""}`);
      waitForProcessing(currentGalleryEvent.id);
    } catch (error) { showToast(error?.message || "Could not add photos."); }
  });
  document.getElementById("gallery-love-all-btn")?.addEventListener("click", async (event) => {
    if (!currentGalleryEvent?.id) return;
    const button = event.currentTarget; button.disabled = true;
    try { await window.PhotoFinderApi.loveAll(currentGalleryEvent.id); currentGalleryMedia.forEach((photo) => { photo.loved = true; }); openGallery({ ...currentGalleryEvent, media: currentGalleryMedia }); showToast("Every photo is now loved."); }
    catch (error) { showToast(error?.message || "Could not save your reactions."); } finally { button.disabled = false; }
  });
  document.getElementById("gallery-download-all-btn")?.addEventListener("click", async () => {
    if (!currentGalleryEvent?.id) return;
    try { saveBrowserDownload(await window.PhotoFinderApi.downloadAll(currentGalleryEvent.id)); showToast("Your ZIP download is ready. On mobile, choose your browser's Save option."); }
    catch (error) { showToast(error?.message || "Could not prepare download."); }
  });

  let pendingDeletionPhoto = null;
  function openDeletePhotoModal(photo) { pendingDeletionPhoto = photo; openModal(document.getElementById("delete-photo-modal")); }
  function closeDeletePhotoModal() { pendingDeletionPhoto = null; closeAllModals(); }
  document.getElementById("delete-photo-close")?.addEventListener("click", closeDeletePhotoModal);
  document.getElementById("delete-photo-cancel-btn")?.addEventListener("click", closeDeletePhotoModal);
  document.getElementById("delete-photo-confirm-btn")?.addEventListener("click", async (event) => {
    if (!pendingDeletionPhoto?.id) return;
    const button = event.currentTarget; button.disabled = true;
    try { await window.PhotoFinderApi.deletePhoto(pendingDeletionPhoto.id); closeDeletePhotoModal(); await refreshCurrentGallery(); showToast("Photo deleted permanently."); }
    catch (error) { showToast(error?.message || "Could not delete this photo."); } finally { button.disabled = false; }
  });

  let pendingDeletionEvent = null;

  function openDeleteEventModal(event) {
    const collection = normalizeEventRecord(event);
    if (!collection.id || collection.ownerId !== currentUser?.id) {
      showToast("Only the event owner can delete this collection.");
      return;
    }

    pendingDeletionEvent = collection;
    document.getElementById("delete-event-name").textContent = collection.name;
    openModal(deleteEventModal);
  }

  function closeDeleteEventModal() {
    pendingDeletionEvent = null;
    closeAllModals();
  }

  document
    .getElementById("delete-event-close")
    ?.addEventListener("click", closeDeleteEventModal);
  document
    .getElementById("delete-event-cancel-btn")
    ?.addEventListener("click", closeDeleteEventModal);
  document
    .getElementById("delete-event-confirm-btn")
    ?.addEventListener("click", async () => {
      if (!pendingDeletionEvent?.id) return;

      const button = document.getElementById("delete-event-confirm-btn");
      const eventId = pendingDeletionEvent.id;
      button.disabled = true;
      button.textContent = "DELETING…";

      try {
        await window.PhotoFinderApi.deleteEvent(eventId);
        eventMediaCache.delete(eventId);
        knownAccessCodes.delete(eventId);
        collectionCards.get(eventId)?.card.remove();
        collectionCards.delete(eventId);
        closeDeleteEventModal();
        showToast("Collection deleted permanently.");
        await loadCollections();
      } catch (error) {
        if (error?.status === 401) {
          logout();
          return;
        }
        showToast(error?.message || "Could not delete this collection.");
      } finally {
        button.disabled = false;
        button.textContent = "DELETE PERMANENTLY";
      }
    });

  // ==================== 11. MEDIA VIEWER / LIGHTBOX ====================
  let activeLightboxIndex = 0;
  const lightboxContent = document.getElementById("lightbox-content");
  const lightboxCounter = document.getElementById("lightbox-counter");
  const lightboxDownloadBtn = document.getElementById("lightbox-download-btn");

  function closeLightbox() {
    lightbox.classList.add("hidden");
    window.PFOverlayLock?.remove("lightbox");
    const vid = lightboxContent.querySelector("video");
    if (vid) vid.pause();
    lightboxContent.innerHTML = "";
  }

  let lightboxMedia = [];
  let lightboxEvent = null;
  const lightboxLoveBtn = document.getElementById("lightbox-love-btn");

  function openLightbox(index, media = currentGalleryMedia, event = currentGalleryEvent) {
    if (!media?.length) return;
    lightboxMedia = media;
    lightboxEvent = event;
    activeLightboxIndex = Math.max(0, Math.min(media.length - 1, index));
    renderLightboxItem();
    lightbox.classList.remove("hidden");
    window.PFOverlayLock?.add("lightbox", closeLightbox);
  }

  function renderLightboxItem() {
    const item = lightboxMedia[activeLightboxIndex];
    if (!item) return;

    lightboxCounter.textContent = `${activeLightboxIndex + 1} / ${lightboxMedia.length}`;
    document.getElementById("lightbox-prev-btn").disabled = activeLightboxIndex === 0;
    document.getElementById("lightbox-next-btn").disabled = activeLightboxIndex === lightboxMedia.length - 1;
    lightboxLoveBtn?.classList.toggle("is-loved", Boolean(item.loved));
    lightboxLoveBtn.textContent = item.loved ? "♥" : "♡";
    lightboxLoveBtn.disabled = !lightboxEvent?.id || item.type === "video";

    if (item.type === "video") {
      lightboxContent.innerHTML = `
        <video src="${item.url}" controls autoplay playsinline style="max-width: 85vw; max-height: 80vh;"></video>
      `;
    } else {
      lightboxContent.innerHTML = `
        <img src="${item.url}" alt="${item.filename}" />
      `;
    }
  }

  function nextLightboxItem() {
    if (activeLightboxIndex < lightboxMedia.length - 1) {
      activeLightboxIndex++;
      renderLightboxItem();
    }
  }
  window.PhotoFinderOpenGallery = openEventGallery;

  function prevLightboxItem() {
    if (activeLightboxIndex > 0) {
      activeLightboxIndex--;
      renderLightboxItem();
    }
  }

  document
    .getElementById("lightbox-close-btn")
    ?.addEventListener("click", closeLightbox);
  document
    .getElementById("lightbox-next-btn")
    ?.addEventListener("click", nextLightboxItem);
  document
    .getElementById("lightbox-prev-btn")
    ?.addEventListener("click", prevLightboxItem);
  lightboxDownloadBtn?.addEventListener("click", async () => {
    const item = lightboxMedia[activeLightboxIndex];
    if (!item || !lightboxEvent?.id) return;
    try {
      saveBrowserDownload(await window.PhotoFinderApi.downloadPhoto(lightboxEvent.id, item.id));
      showToast("Download started.");
    } catch (error) {
      showToast(error?.message || "Could not download this photo.");
    }
  });

  document.querySelectorAll("[data-home-action]").forEach((entry) => {
    const activate = () => {
      const action = entry.dataset.homeAction;
      if (action === "find") document.getElementById("nav-find-photos-btn")?.click();
      if (action === "code" || action === "stories-find") window.dispatchEvent(new CustomEvent("photoFinder:open-event-code"));
      if (action === "dashboard" || action === "loved") {
        void openDashboard().then(() => {
          if (action === "loved") setTimeout(() => document.getElementById("loved-section")?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
        });
      }
    };
    entry.addEventListener("click", activate);
    if (entry.matches("[role=button]")) entry.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(); }
    });
  });

  document.getElementById("gallery-select-btn")?.addEventListener("click", (event) => {
    gallerySelectionMode = !gallerySelectionMode;
    event.currentTarget.setAttribute("aria-pressed", String(gallerySelectionMode));
    document.getElementById("gallery-selection-toolbar")?.classList.toggle("hidden", !gallerySelectionMode);
    document.querySelectorAll(".gallery-selection-check").forEach((checkbox) => { checkbox.hidden = !gallerySelectionMode; });
  });
  document.getElementById("gallery-select-all-btn")?.addEventListener("click", () => {
    currentGalleryMedia.filter((photo) => photo.type !== "video" && photo.id).forEach((photo) => selectedGalleryPhotos.add(String(photo.id)));
    document.querySelectorAll(".gallery-selection-check").forEach((checkbox) => { checkbox.checked = true; });
    document.getElementById("gallery-selection-count").textContent = `${selectedGalleryPhotos.size} selected`;
  });
  document.getElementById("gallery-clear-selection-btn")?.addEventListener("click", () => {
    selectedGalleryPhotos.clear(); document.querySelectorAll(".gallery-selection-check").forEach((checkbox) => { checkbox.checked = false; });
    document.getElementById("gallery-selection-count").textContent = "0 selected";
  });
  document.getElementById("gallery-download-selected-btn")?.addEventListener("click", async () => {
    const ids = currentGalleryMedia.filter((photo) => selectedGalleryPhotos.has(String(photo.id))).map((photo) => photo.id);
    if (!ids.length) return showToast("Select at least one photo first.");
    try { saveBrowserDownload(await window.PhotoFinderApi.downloadSelected(currentGalleryEvent.id, ids)); showToast(`${ids.length} selected photo${ids.length === 1 ? " is" : "s are"} ready in one ZIP.`); }
    catch (error) { showToast(error?.message || "Could not download selected photos."); }
  });
  document.getElementById("gallery-love-selected-btn")?.addEventListener("click", async () => {
    const ids = currentGalleryMedia.filter((photo) => selectedGalleryPhotos.has(String(photo.id))).map((photo) => photo.id);
    if (!ids.length) return showToast("Select at least one photo first.");
    try { await window.PhotoFinderApi.loveSelected(currentGalleryEvent.id, ids); currentGalleryMedia.forEach((photo) => { if (selectedGalleryPhotos.has(String(photo.id))) photo.loved = true; }); openGallery({ ...currentGalleryEvent, media: currentGalleryMedia }); showToast(`${ids.length} photo${ids.length === 1 ? "" : "s"} added to Loved Photos.`); }
    catch (error) { showToast(error?.message || "Could not save selected photos."); }
  });
  lightboxLoveBtn?.addEventListener("click", async () => {
    const item = lightboxMedia[activeLightboxIndex];
    if (!item || !lightboxEvent?.id || lightboxLoveBtn.disabled) return;
    lightboxLoveBtn.disabled = true; const previous = Boolean(item.loved); item.loved = !previous; renderLightboxItem();
    try {
      const result = await window.PhotoFinderApi.setPhotoFavorite(lightboxEvent.id, item.id, item.loved);
      item.loved = result.loved;
      renderLightboxItem();
      showToast(item.loved ? "Added to Loved Memories." : "Removed from Loved Memories.");
    } catch (error) { item.loved = previous; renderLightboxItem();
      showToast(error?.message || "Could not save your reaction.");
    } finally {
      lightboxLoveBtn.disabled = false;
    }
  });

  lightbox?.addEventListener("click", (e) => {
    if (e.target === lightbox) closeLightbox();
  });

  window.addEventListener("keydown", (e) => {
    if (!lightbox.classList.contains("hidden")) {
      if (e.key === "ArrowRight") nextLightboxItem();
      if (e.key === "ArrowLeft") prevLightboxItem();
      if (e.key === "Escape") closeLightbox();
      e.stopPropagation();
    }
  });
  window.PhotoFinderLightbox = {
    open(media, index, event) {
      openLightbox(index, media, event);
    },
  };
})();

// ==================== SHARE, QR, INSIGHTS & RECIPIENT MODE ====================
// These controls are deliberately thin clients: every privileged action is
// still checked by the FastAPI owner/token endpoints.
(() => {
  const api = window.PhotoFinderApi;
  const $ = (selector, root = document) => root.querySelector(selector);
  const escape = (value) => String(value ?? "").replace(/[&<>\"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  const download = (file) => {
    const url = URL.createObjectURL(file.blob);
    const anchor = Object.assign(document.createElement("a"), { href: url, download: file.filename });
    document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
  async function copy(value) {
    try { await navigator.clipboard.writeText(value); return true; }
    catch { const input = document.createElement("textarea"); input.value = value; document.body.append(input); input.select(); const result = document.execCommand("copy"); input.remove(); return result; }
  }
  function modal(markup, className = "integration-modal", onClose = null) {
    const overlay = document.createElement("div");
    overlay.className = `modal-backdrop ${className}`;
    overlay.innerHTML = `<div class="modal-card integration-card" role="dialog" aria-modal="true">${markup}</div>`;
    const close = () => { overlay.querySelectorAll(".qr-canvas").forEach((target) => { if (target.dataset.qrBlobUrl) URL.revokeObjectURL(target.dataset.qrBlobUrl); }); overlay.remove(); onClose?.(); window.PFOverlayLock?.remove(className); };
    overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
    document.body.append(overlay); window.PFOverlayLock?.add(className, close);
    return { overlay, close };
  }
  function renderQr(target, text) {
    target.innerHTML = "";
    target.textContent = "Generating QR image…";
    target.qrPromise = (async () => {
      try {
        const response = await fetch("/api/qr", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
        if (!response.ok) throw new Error("QR image is unavailable. Use Copy Link or try again.");
        const blob = await response.blob();
        if (!blob.type.startsWith("image/")) throw new Error("QR service returned an invalid image.");
        const url = URL.createObjectURL(blob); target.dataset.qrBlobUrl = url;
        const image = document.createElement("img"); image.src = url; image.alt = "Scannable QR code"; image.width = 220; image.height = 220; image.className = "generated-qr-image";
        target.replaceChildren(image);
      } catch (error) { target.textContent = error?.message || "QR image could not be generated. Use Copy Link instead."; }
    })();
    return target.qrPromise;
  }
  async function qrFile(target, name = "event-qr.png") {
    if (target.qrPromise) await target.qrPromise;
    const canvas = $("canvas", target);
    if (canvas) return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(new File([blob], name, { type: "image/png" })) : reject(new Error("Could not create QR image.")), "image/png"));
    const image = $("img", target);
    if (image?.src?.startsWith("blob:")) { const blob = await (await fetch(image.src)).blob(); return new File([blob], name, { type: blob.type || "image/png" }); }
    if (image?.src?.startsWith("data:")) { const blob = await (await fetch(image.src)).blob(); return new File([blob], name, { type: blob.type || "image/png" }); }
    throw new Error("QR image is unavailable. Try refreshing this page.");
  }
  async function shareQr(target, url, name) {
    try {
      const file = await qrFile(target, name);
      if (navigator.canShare?.({ files: [file] }) && navigator.share) { await navigator.share({ files: [file], title: "Event access QR", text: url }); return; }
      window.showToast?.("This browser cannot share QR image files. Use DOWNLOAD QR or COPY LINK.");
    } catch (error) { if (error?.name === "AbortError") return; window.showToast?.(error?.message || "Could not share the QR image. Use DOWNLOAD QR or COPY LINK."); }
  }
  async function downloadQr(target, name) {
    const file = await qrFile(target, name);
    const url = URL.createObjectURL(file); const anchor = Object.assign(document.createElement("a"), { href: url, download: name });
    document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  async function openEventQr() {
    const event = window.currentGalleryEvent || null;
    const code = $("#gallery-code-text")?.textContent?.trim();
    if (!event?.id || !code || code === "Code unavailable") return;
    const view = modal(`<button class="modal-close" aria-label="Close">×</button><p class="eyebrow">EVENT ACCESS</p><h2>${escape(event.name || "Event")}</h2><p class="modal-subtext">Code: <strong>${escape(code)}</strong> <button type="button" class="copy-event-code">COPY CODE</button><br>QR opens the private code entry flow on this device.</p><div class="qr-canvas hidden" aria-label="Event access QR code"></div><input class="integration-link" readonly placeholder="Detecting a device-reachable address…"><p class="qr-origin-error hidden" role="status"></p><div class="modal-actions"><button class="secondary-button integration-copy" disabled>COPY LINK</button><button class="secondary-button qr-download" disabled>DOWNLOAD QR</button><button class="primary-button integration-share" disabled>SHARE QR</button></div>`);
    const qr = $(".qr-canvas", view.overlay); let value = "";
    $(".modal-close", view.overlay).onclick = view.close;
    $(".copy-event-code", view.overlay).onclick = async () => { if (await copy(code)) window.showToast?.("Event code copied."); };
    $(".integration-copy", view.overlay).onclick = async () => { if (value && await copy(value)) window.showToast?.("Event link copied."); };
    $(".qr-download", view.overlay).onclick = async () => { try { await downloadQr(qr, `event-${event.id}-qr.png`); } catch (error) { window.showToast?.(error.message); } };
    $(".integration-share", view.overlay).onclick = async () => { try { await shareQr(qr, value, `event-${event.id}-qr.png`); } catch (error) { window.showToast?.(error.message); } };
    try {
      if (!view.overlay.isConnected) return;
      value = await api.buildReachableUrl(window.location.pathname, { eventId: event.id });
      if (!view.overlay.isConnected) return;
      $(".integration-link", view.overlay).value = value; qr.classList.remove("hidden"); renderQr(qr, value);
      view.overlay.querySelectorAll(".integration-copy,.qr-download,.integration-share").forEach((button) => { button.disabled = false; });
    } catch (error) { $(".qr-origin-error", view.overlay).textContent = error.message; $(".qr-origin-error", view.overlay).classList.remove("hidden"); }
  }
  async function openInsights() {
    const event = window.currentGalleryEvent || null;
    if (!event?.id) return;
    const view = modal(`<button class="modal-close" aria-label="Close">×</button><p class="eyebrow">OWNER ONLY</p><h2>EVENT INSIGHTS</h2><div class="insights-body" role="status">Loading real event metrics…</div>`);
    $(".modal-close", view.overlay).onclick = view.close;
    try {
      const data = await api.getEventInsights(event.id); const metrics = data?.metrics;
      if (!metrics) throw new Error("No insights are available yet.");
      const labels = [["Total Photos", metrics.total_photos], ["Ready", metrics.ready], ["Pending", metrics.pending], ["Processing", metrics.processing], ["Failed", metrics.failed], ["Match Searches", metrics.match_searches], ["Downloads", metrics.downloads], ["Loved Photos", metrics.loved_photos], ["Loved Collections", metrics.loved_collections]];
      const activity = Array.isArray(data.activity) ? data.activity : [];
      const activityMarkup = activity.length ? activity.map((item) => {
        const label = item.kind === "match_search" ? "Photo search" : item.kind === "download" ? "Photo download" : "Event activity";
        const time = item.created_at ? new Date(item.created_at) : null;
        return `<li><strong>${label}</strong><time datetime="${escape(item.created_at || "")}">${time && !Number.isNaN(time.valueOf()) ? escape(time.toLocaleString()) : "Time unavailable"}</time></li>`;
      }).join("") : '<li class="empty-activity">No analytics activity yet.</li>';
      $(".insights-body", view.overlay).innerHTML = `<div class="insight-grid">${labels.map(([label, value]) => `<article><span>${escape(label)}</span><strong>${Number(value || 0)}</strong></article>`).join("")}</div><h3>RECENT ACTIVITY</h3><ul class="recent-activity">${activityMarkup}</ul><h3>SYSTEM STATUS</h3><button type="button" class="secondary-button system-status-refresh">CHECK SYSTEM</button><ul class="system-status-list" aria-live="polite"><li>Checking connected services…</li></ul>${Number(metrics.total_photos || 0) === 0 ? '<p class="modal-subtext">Photos will appear here once they are uploaded.</p>' : ""}`;
      const statusList = $(".system-status-list", view.overlay);
      const checkStatus = async () => {
        statusList.innerHTML = "<li>Checking connected services…</li>";
        try {
          const status = (await api.getSystemStatus(event.id)).status || {};
          const rows = [["Frontend", true], ["Backend API", status.backend_api], ["AI Service", status.ai_service], ["Supabase", status.supabase], ["Photo Storage", status.photo_storage], ["AI Processing", status.ai_processing]];
          statusList.innerHTML = rows.map(([label, ready]) => `<li><strong>${escape(label)}</strong><span class="health-${ready ? "ok" : "failed"}">${ready ? "✓ Connected" : "× Unavailable"}</span></li>`).join("");
        } catch (error) { statusList.innerHTML = `<li class="empty-activity">System check unavailable: ${escape(error?.message || "Could not check service status.")}</li>`; }
      };
      $(".system-status-refresh", view.overlay).onclick = checkStatus;
      await checkStatus();
    } catch (error) { $(".insights-body", view.overlay).innerHTML = `<p class="find-validation">${escape(error?.message || "Could not load insights.")}</p>`; }
  }
  window.PhotoFinderOpenWelcome = async (event) => {
    const view = modal(`<button class="modal-close" aria-label="Close">×</button><div class="welcome-cover"></div><p class="eyebrow">PRIVATE EVENT</p><h2 class="welcome-title">${escape(event?.name || "Event")}</h2><p class="welcome-description"></p><div class="welcome-facts" role="status">Loading event details…</div><div class="modal-actions"><button type="button" class="secondary-button welcome-gallery">VIEW GALLERY</button><button type="button" class="primary-button welcome-find">FIND MY PHOTOS</button><button type="button" class="secondary-button welcome-retry hidden">TRY AGAIN</button></div>`);
    $(".modal-close", view.overlay).onclick = view.close;
    const facts = $(".welcome-facts", view.overlay);
    try {
      const payload = await api.getEventWelcome(event.id); const realEvent = { ...event, ...(payload.event || {}), owner_id: event?.owner_id ?? payload.event?.owner_id };
      $(".welcome-title", view.overlay).textContent = realEvent.name || "Event";
      $(".welcome-description", view.overlay).textContent = realEvent.description || "Your event memories are ready to explore.";
      if (payload.cover_url) $(".welcome-cover", view.overlay).style.backgroundImage = `linear-gradient(0deg,rgba(3,7,13,.62),rgba(3,7,13,.08)),url("${String(payload.cover_url).replaceAll('"', "%22")}")`;
      const state = payload.processing || {}; const inProgress = Number(state.pending || 0) + Number(state.processing || 0);
      const photoCount = Number(payload.photo_count || 0);
      facts.textContent = `${photoCount} photos · ${photoCount === 0 ? "No photos uploaded yet" : inProgress ? `${inProgress} still processing` : Number(state.failed || 0) ? `${state.failed} processing failed` : "Ready to view"} · Private event`;
      $(".welcome-gallery", view.overlay).onclick = () => { view.close(); window.PhotoFinderOpenGallery?.(realEvent); };
      $(".welcome-find", view.overlay).onclick = () => {
        view.close();
        if (window.PhotoFinderContinueFind) window.PhotoFinderContinueFind(realEvent.id);
        else $("#hero-find-photos-btn")?.click();
      };
    } catch (error) {
      facts.textContent = error?.status === 403 ? "This event is private. Enter a valid event code to continue." : error?.status === 404 ? "This event is unavailable or has been removed." : "Event details are temporarily unavailable.";
      $(".welcome-gallery", view.overlay).disabled = true; $(".welcome-find", view.overlay).disabled = true;
      const retry = $(".welcome-retry", view.overlay); retry.classList.remove("hidden"); retry.textContent = error?.status === 404 ? "RETURN HOME" : "TRY AGAIN";
      retry.onclick = () => { if (error?.status === 404) { view.close(); window.location.assign(window.location.pathname); } else { view.close(); window.PhotoFinderOpenWelcome(event); } };
    }
  };
  $("#gallery-branding-btn")?.addEventListener("click", () => {
    const event = window.currentGalleryEvent; if (!event?.id) return;
    const coverPhotos = (Array.isArray(event.media) ? event.media : []).filter((photo) => photo?.id && photo.type !== "video");
    let draftEventBranding = {
      name: event.name || "",
      description: event.description || "",
      cover_photo_id: coverPhotos.some((photo) => String(photo.id) === String(event.coverPhotoId)) ? event.coverPhotoId : null,
    };
    const coverOptions = coverPhotos.length
      ? `<option value="">Automatic first photo</option>${coverPhotos.map((photo) => `<option value="${escape(photo.id)}">${escape(photo.filename || "Event photo")}</option>`).join("")}`
      : '<option value="">No photos available</option>';
    const view = modal(`<button class="modal-close" aria-label="Close">×</button><p class="eyebrow">EVENT BRANDING</p><h2>EDIT EVENT DETAILS</h2><label>Event name<input class="branding-name" maxlength="120" value="${escape(draftEventBranding.name)}"></label><label>Short description<textarea class="branding-description" maxlength="280">${escape(draftEventBranding.description)}</textarea></label><label>Cover photo<select class="branding-cover" ${coverPhotos.length ? "" : "disabled"}>${coverOptions}</select></label><p class="modal-subtext">${coverPhotos.length ? "Choose an existing photo from this event. Its authorized signed URL is used for covers." : "No photos are available for this event yet."}</p><p class="branding-error find-validation hidden" role="alert"></p><div class="modal-actions"><button type="button" class="secondary-button branding-cancel">CANCEL</button><button type="button" class="primary-button branding-save">SAVE</button></div>`, "integration-modal", () => { draftEventBranding = null; });
    const nameInput = $(".branding-name", view.overlay);
    const descriptionInput = $(".branding-description", view.overlay);
    const coverInput = $(".branding-cover", view.overlay);
    coverInput.value = draftEventBranding.cover_photo_id || "";
    nameInput.addEventListener("input", () => { if (draftEventBranding) draftEventBranding.name = nameInput.value; });
    descriptionInput.addEventListener("input", () => { if (draftEventBranding) draftEventBranding.description = descriptionInput.value; });
    coverInput.addEventListener("change", () => { if (draftEventBranding) draftEventBranding.cover_photo_id = coverInput.value || null; });
    $(".modal-close", view.overlay).onclick = view.close; $(".branding-cancel", view.overlay).onclick = view.close;
    $(".branding-save", view.overlay).onclick = async (clickEvent) => {
      const button = clickEvent.currentTarget;
      if (button.disabled) return;
      button.disabled = true;
      button.textContent = "SAVING…";
      let errorNode = $(".branding-error", view.overlay);
      if (!errorNode) {
        errorNode = document.createElement("p");
        errorNode.className = "branding-error find-validation hidden";
        errorNode.setAttribute("role", "alert");
        $(".modal-actions", view.overlay).before(errorNode);
      }
      errorNode.classList.add("hidden");
      try {
        const saved = await api.updateEventBranding(event.id, { ...draftEventBranding });
        const savedEvent = saved?.event;
        if (!savedEvent) throw new Error("The server did not confirm the saved event details.");
        event.name = savedEvent.name ?? draftEventBranding.name;
        event.description = savedEvent.description ?? draftEventBranding.description;
        event.coverPhotoId = Object.prototype.hasOwnProperty.call(savedEvent, "cover_photo_id") ? savedEvent.cover_photo_id : draftEventBranding.cover_photo_id;
        const galleryTitle = $("#gallery-title");
        if (galleryTitle) galleryTitle.textContent = event.name;
        const card = document.querySelector(`[data-event-id="${CSS.escape(event.id)}"]`);
        if (card) {
          const title = card.querySelector(".card-title");
          if (title) title.textContent = event.name;
          let description = card.querySelector(".card-description");
          if (event.description && !description) { description = document.createElement("div"); description.className = "card-description"; title?.after(description); }
          if (description) { description.textContent = event.description; description.classList.toggle("hidden", !event.description); }
          const cover = card.querySelector(".collection-thumb");
          const galleryPhotos = Array.isArray(event.media) ? event.media.filter((photo) => photo?.id && photo.type !== "video") : [];
          const chosen = galleryPhotos.find((photo) => String(photo.id) === String(event.coverPhotoId)) || galleryPhotos[0];
          if (cover && chosen?.url) cover.src = chosen.url;
        }
        view.close(); window.showToast?.("Event branding saved.");
      } catch (error) { errorNode.textContent = error?.message || "Could not save event details."; errorNode.classList.remove("hidden"); }
      finally { if (view.overlay.isConnected) { button.disabled = false; button.textContent = "SAVE"; } }
    };
  });
  window.openCollectionShare = async (collection) => {
    const view = modal(`<button class="modal-close" aria-label="Close">×</button><p class="eyebrow">READ-ONLY SHARING</p><h2>SHARE COLLECTION</h2><p class="modal-subtext">Recipients can view and download only these saved photos. They cannot access or edit the event.</p><div class="share-status">No active link yet.</div><div class="qr-canvas hidden"></div><input class="integration-link hidden" readonly><div class="modal-actions"><button class="primary-button create-share">CREATE SHARE LINK</button><button class="secondary-button copy-share hidden">COPY LINK</button><button class="secondary-button download-share-qr hidden">DOWNLOAD QR</button><button class="secondary-button share-share-qr hidden">SHARE QR</button><button class="danger-button revoke-share hidden">REVOKE SHARE</button></div>`);
    $(".modal-close", view.overlay).onclick = view.close;
    let share = null;
    const presentShare = async (activeShare) => {
      share = activeShare;
      const value = await api.buildReachableUrl(window.location.pathname, { collectionShare: share.share_token });
      const input = $(".integration-link", view.overlay); input.value = value; input.classList.remove("hidden");
      $(".share-status", view.overlay).textContent = share.expires_at ? `Active until ${new Date(share.expires_at).toLocaleString()}.` : "Active read-only share link.";
      const qr = $(".qr-canvas", view.overlay); qr.classList.remove("hidden"); renderQr(qr, value);
      $(".create-share", view.overlay).classList.add("hidden"); $(".copy-share", view.overlay).classList.remove("hidden"); $(".download-share-qr", view.overlay).classList.remove("hidden"); $(".share-share-qr", view.overlay).classList.remove("hidden"); $(".revoke-share", view.overlay).classList.remove("hidden");
    };
    api.getCollectionShare(collection.id).then((response) => { if (response?.share) return presentShare(response.share); }).catch((error) => { $(".share-status", view.overlay).textContent = `Could not prepare a cross-device link: ${error?.message || "address detection failed"}`; });
    $(".create-share", view.overlay).onclick = async (event) => {
      const button = event.currentTarget; button.disabled = true; button.textContent = "CREATING…";
      try {
        const response = await api.createCollectionShare(collection.id); await presentShare(response.share);
      } catch (error) { $(".share-status", view.overlay).textContent = error?.message || "Could not create a share link."; button.disabled = false; button.textContent = "CREATE SHARE LINK"; }
    };
    $(".copy-share", view.overlay).onclick = async () => { if (await copy($(".integration-link", view.overlay).value)) window.showToast?.("Collection link copied."); };
    $(".download-share-qr", view.overlay).onclick = async () => { try { await downloadQr($(".qr-canvas", view.overlay), `collection-${collection.id}-qr.png`); } catch (error) { window.showToast?.(error.message); } };
    $(".share-share-qr", view.overlay).onclick = async () => { try { await shareQr($(".qr-canvas", view.overlay), $(".integration-link", view.overlay).value, `collection-${collection.id}-qr.png`); } catch (error) { window.showToast?.(error.message); } };
    $(".revoke-share", view.overlay).onclick = async () => { if (!share) return; try { await api.revokeCollectionShare(collection.id, share.id); $(".share-status", view.overlay).textContent = "Share revoked. The old link no longer works."; $(".integration-link", view.overlay).classList.add("hidden"); $(".qr-canvas", view.overlay).classList.add("hidden"); $(".copy-share", view.overlay).classList.add("hidden"); $(".download-share-qr", view.overlay).classList.add("hidden"); $(".share-share-qr", view.overlay).classList.add("hidden"); $(".revoke-share", view.overlay).classList.add("hidden"); $(".create-share", view.overlay).classList.remove("hidden"); share = null; } catch (error) { window.showToast?.(error?.message || "Could not revoke share."); } };
  };
  $("#gallery-qr-btn")?.addEventListener("click", openEventQr);
  $("#gallery-reindex-btn")?.addEventListener("click", async (event) => {
    const button = event.currentTarget; const eventId = window.currentGalleryEvent?.id;
    if (!eventId || button.disabled) return;
    button.disabled = true; button.textContent = "QUEUING…";
    try { const result = await api.reindexEventPhotos(eventId); window.showToast?.(result.message || "Re-index queued."); }
    catch (error) { window.showToast?.(error?.message || "Could not queue photo re-indexing."); }
    finally { button.disabled = false; button.textContent = "RE-INDEX PHOTOS"; }
  });
  $("#gallery-analytics-btn")?.addEventListener("click", openInsights);
  // Recipient route has no owner UI, auth requirement, or event id. It is a
  // read-only view constructed solely from the share-token response.
  const params = new URLSearchParams(window.location.search); const shareToken = params.get("collectionShare");
  if (shareToken) {
    document.body.classList.add("recipient-mode");
    const root = document.createElement("main"); root.className = "shared-collection-page"; root.innerHTML = '<p class="eyebrow">SHARED LOVED MEMORIES</p><h1>Loading collection…</h1>'; document.body.append(root);
    api.getSharedCollection(shareToken).then((payload) => {
      const collection = payload.collection; const photos = collection.photos || [];
      root.innerHTML = `<p class="eyebrow">SHARED LOVED MEMORIES</p><h1>${escape(collection.name)}</h1><p>${collection.count} photo${collection.count === 1 ? "" : "s"} shared with you</p><button class="secondary-button shared-download-all">↓ DOWNLOAD COLLECTION</button><div class="shared-photo-grid">${photos.map((photo, index) => `<article><img src="${escape(photo.url)}" alt="${escape(photo.filename || "Shared memory")}" loading="lazy"><button data-index="${index}">VIEW</button><button data-download="${escape(photo.id)}">↓ DOWNLOAD</button></article>`).join("") || '<p>No photos are available in this collection.</p>'}</div>`;
      $(".shared-download-all", root).onclick = async () => { try { download(await api.downloadSharedCollection(shareToken)); } catch (error) { window.showToast?.(error?.message || "Could not prepare collection download."); } };
      root.querySelectorAll("[data-download]").forEach((button) => button.onclick = async () => { try { download(await api.downloadSharedCollectionPhoto(shareToken, button.dataset.download)); } catch (error) { window.showToast?.(error?.message || "Could not download photo."); } });
      root.querySelectorAll("[data-index]").forEach((button) => button.onclick = () => {
        let index = Number(button.dataset.index);
        const overlay = modal(`<button class="modal-close" aria-label="Close">×</button><img class="recipient-lightbox" alt="Shared memory"><p class="recipient-counter"></p><div class="modal-actions"><button class="secondary-button recipient-prev">← PREVIOUS</button><button class="secondary-button recipient-download">↓ DOWNLOAD</button><button class="secondary-button recipient-next">NEXT →</button></div>`, "recipient-lightbox-modal");
        const render = () => { const photo = photos[index]; const image = $(".recipient-lightbox", overlay.overlay); image.src = photo.url; image.alt = photo.filename || "Shared memory"; $(".recipient-counter", overlay.overlay).textContent = `${index + 1} / ${photos.length}`; $(".recipient-prev", overlay.overlay).disabled = index === 0; $(".recipient-next", overlay.overlay).disabled = index === photos.length - 1; };
        $(".modal-close", overlay.overlay).onclick = overlay.close;
        $(".recipient-prev", overlay.overlay).onclick = () => { if (index > 0) { index--; render(); } };
        $(".recipient-next", overlay.overlay).onclick = () => { if (index < photos.length - 1) { index++; render(); } };
        $(".recipient-download", overlay.overlay).onclick = async () => download(await api.downloadSharedCollectionPhoto(shareToken, photos[index].id));
        render();
      });
    }).catch((error) => {
      const expired = error?.status === 410; const unavailable = error?.status === 404;
      root.innerHTML = `<p class="eyebrow">SHARED LOVED MEMORIES</p><h1>${expired ? "LINK EXPIRED" : unavailable ? "LINK UNAVAILABLE" : "COULD NOT OPEN COLLECTION"}</h1><p>${expired ? "This collection link has expired." : unavailable ? "This link may have been revoked or is no longer available." : "The collection could not be loaded right now."}</p><button type="button" class="secondary-button shared-retry">TRY AGAIN</button>`;
      $(".shared-retry", root).onclick = () => window.location.reload();
    });
  }
  const eventCode = params.get("eventCode");
  const linkedEventId = params.get("eventId");
  if (eventCode) { const input = $("#find-access-code-input"); if (input) input.value = eventCode; api.redeemAccessCode(eventCode).then((result) => window.PhotoFinderOpenWelcome(result.event)).catch((error) => { if (error?.status === 401) document.getElementById("auth-modal")?.classList.remove("hidden"); else window.showToast?.(error?.message || "Event access is unavailable. Enter the code again."); }); }
  else if (linkedEventId) window.dispatchEvent(new CustomEvent("photoFinder:open-event-code", { detail: { eventId: linkedEventId } }));
})();

// ==================== NAMED LOVED COLLECTIONS ====================
// Kept separate from event ownership: this UI only ever mutates the current
// user's collection rows/memberships, never an original event photo.
(() => {
  const modal = document.getElementById("loved-collection-modal");
  const nameInput = document.getElementById("loved-collection-name");
  const error = document.getElementById("loved-collection-error");
  const save = document.getElementById("loved-collection-save");
  const deleteModal = document.getElementById("delete-loved-collection-modal");
  const deleteName = document.getElementById("delete-loved-collection-name");
  const deleteConfirm = document.getElementById("delete-loved-collection-confirm");
  let selectedPhotos = [];
  let pendingDeletion = null;
  const toast = (message) => { const node = document.createElement("div"); node.className = "toast"; node.textContent = message; document.getElementById("toast-container")?.append(node); setTimeout(() => node.remove(), 3200); };
  const close = () => { modal?.classList.add("hidden"); window.PFOverlayLock?.remove("lovedCollection"); error?.classList.add("hidden"); };
  window.LovedCollectionComposer = {
    open(photos) {
      selectedPhotos = (photos || []).filter((photo) => photo?.id);
      if (!selectedPhotos.length) return;
      nameInput.value = "";
      document.getElementById("loved-collection-message").textContent = `You loved ${selectedPhotos.length} photo${selectedPhotos.length === 1 ? "" : "s"}. Give this collection a name.`;
      modal.classList.remove("hidden"); window.PFOverlayLock?.add("lovedCollection", close); nameInput.focus();
    },
  };
  document.getElementById("loved-collection-close")?.addEventListener("click", close);
  document.getElementById("loved-collection-cancel")?.addEventListener("click", close);
  save?.addEventListener("click", async () => {
    const name = nameInput.value.trim();
    if (!name) { error.textContent = "Please give your collection a name."; error.classList.remove("hidden"); return; }
    save.disabled = true; save.textContent = "SAVING…";
    try { await window.PhotoFinderApi.createLovedCollection(name, selectedPhotos); close(); toast("Loved collection saved to your dashboard."); document.getElementById("nav-dashboard-btn")?.click(); }
    catch (exception) { error.textContent = exception?.message || "Could not save this collection."; error.classList.remove("hidden"); }
    finally { save.disabled = false; save.textContent = "SAVE COLLECTION"; }
  });
  const closeDeleteCollection = () => { pendingDeletion = null; deleteModal?.classList.add("hidden"); deleteModal?.setAttribute("aria-hidden", "true"); window.PFOverlayLock?.remove("lovedCollectionDelete"); };
  window.LovedCollectionDeletion = {
    open(collection, card) {
      pendingDeletion = { collection, card };
      deleteName.textContent = collection.name;
      deleteModal.classList.remove("hidden");
      deleteModal.setAttribute("aria-hidden", "false");
      window.PFOverlayLock?.add("lovedCollectionDelete", closeDeleteCollection);
      deleteConfirm.focus();
    },
  };
  document.getElementById("delete-loved-collection-close")?.addEventListener("click", closeDeleteCollection);
  document.getElementById("delete-loved-collection-cancel")?.addEventListener("click", closeDeleteCollection);
  deleteConfirm?.addEventListener("click", async () => {
    if (!pendingDeletion) return;
    const { collection, card } = pendingDeletion;
    deleteConfirm.disabled = true;
    deleteConfirm.textContent = "DELETING…";
    try {
      await window.PhotoFinderApi.deleteLovedCollection(collection.id);
      card.remove();
      const grid = document.getElementById("loved-collections-grid");
      document.getElementById("loved-section")?.classList.toggle("hidden", !grid?.children.length);
      closeDeleteCollection();
      toast("Loved collection deleted. Original event photos are unchanged.");
    } catch (exception) {
      toast(exception?.message || "Could not delete this loved collection.");
    } finally {
      deleteConfirm.disabled = false;
      deleteConfirm.textContent = "DELETE COLLECTION";
    }
  });
  window.LovedCollectionView = {
    open(collection) {
      const panel = document.createElement("div"); panel.className = "loved-collection-view";
      panel.innerHTML = `<div class="loved-collection-header"><button type="button" class="nav-btn nav-link">← BACK</button><div><p class="eyebrow">LOVED MEMORIES</p><h2>${escapeHtml(collection.name)}</h2><p>${collection.count} saved photo${collection.count === 1 ? "" : "s"}</p></div><button type="button" class="secondary-button collection-download">↓ DOWNLOAD COLLECTION</button></div><div class="gallery-grid"></div>`;
      const grid = panel.querySelector(".gallery-grid");
      (collection.photos || []).forEach((photo, index) => { const item = document.createElement("div"); item.className = "gallery-item collection-photo"; item.innerHTML = `<img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.filename || "Loved photo")}"><div class="photo-actions"><button class="photo-action download-collection-photo" type="button" title="Download photo">↓</button><button class="photo-action remove-collection-photo" type="button" title="Remove from collection">×</button></div>`; item.querySelector("img").addEventListener("click", () => window.PhotoFinderLightbox?.open(collection.photos, index, { id: photo.event_id })); item.querySelector(".download-collection-photo").addEventListener("click", async (event) => { event.stopPropagation(); try { const file = await window.PhotoFinderApi.downloadLovedCollectionPhoto(collection.id, photo.id); const url = URL.createObjectURL(file.blob); const link = Object.assign(document.createElement("a"), { href: url, download: file.filename }); document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); } catch (exception) { toast(exception?.message || "Could not download photo."); } }); item.querySelector(".remove-collection-photo").addEventListener("click", async (event) => { event.stopPropagation(); try { await window.PhotoFinderApi.removeCollectionPhoto(collection.id, photo.id); item.remove(); collection.photos = collection.photos.filter((candidate) => candidate.id !== photo.id); collection.count = collection.photos.length; panel.querySelector("p:last-child").textContent = `${collection.count} saved photo${collection.count === 1 ? "" : "s"}`; toast("Removed from collection."); } catch (exception) { toast(exception?.message || "Could not remove photo."); } }); grid.append(item); });
      panel.querySelector(".nav-btn").addEventListener("click", () => panel.remove());
      panel.querySelector(".collection-download").addEventListener("click", async () => { try { const file = await window.PhotoFinderApi.downloadLovedCollection(collection.id); const url = URL.createObjectURL(file.blob); const link = Object.assign(document.createElement("a"), { href: url, download: file.filename }); document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); } catch (exception) { toast(exception?.message || "Could not prepare download."); } });
      document.body.append(panel);
    },
  };
})();

// ==================== FIND MY PHOTOS FLOW ====================
(() => {
  const modal = document.getElementById("find-photos-modal");
  if (!modal) return;

  const api = window.PhotoFinderApi;

  // Keep the quality check entirely within the existing Find My Photos UI.
  // The selected File object is retained, so accepting it hands the exact
  // same image to the pre-existing matching request below.
  const qualityStep = document.createElement("section");
  qualityStep.className = "find-step hidden";
  qualityStep.id = "find-quality-step";
  qualityStep.setAttribute("aria-live", "polite");
  qualityStep.innerHTML = `
    <div class="find-state-message" id="face-quality-loading">Checking your face photo…</div>
    <div class="hidden" id="face-quality-result">
      <div class="find-results-heading">
        <span class="eyebrow">FACE PHOTO CHECK</span>
        <h3>YOUR PHOTO IS READY</h3>
        <p>Here’s what we found before searching the event.</p>
      </div>
      <div class="find-events" id="face-quality-details"></div>
      <div class="find-step-actions">
        <button class="secondary-button" id="face-quality-another" type="button">CHOOSE ANOTHER</button>
        <button class="primary-button" id="face-quality-use" type="button">USE THIS PHOTO <span>→</span></button>
      </div>
    </div>`;
  document.getElementById("find-upload-step")?.after(qualityStep);
  const resultsGrid = document.getElementById("matched-photo-grid");
  const matchControls = document.createElement("div");
  matchControls.id = "find-match-controls";
  matchControls.className = "find-step-actions";
  matchControls.innerHTML = `
    <div class="find-events" aria-label="Match filters">
      <button class="secondary-button" type="button" data-match-filter="all">ALL MATCHES</button>
      <button class="secondary-button" type="button" data-match-filter="best">BEST MATCHES</button>
      <button class="secondary-button" type="button" data-match-filter="high">HIGH CONFIDENCE</button>
      <button class="secondary-button" type="button" data-match-filter="balanced">BALANCED</button>
      <button class="secondary-button" type="button" data-match-filter="more">MORE RESULTS</button>
    </div>
    <button class="primary-button" id="save-best-memories-btn" type="button" disabled>SAVE BEST MEMORIES</button>`;
  resultsGrid?.before(matchControls);

  const steps = {
    event: document.getElementById("find-event-step"),
    upload: document.getElementById("find-upload-step"),
    quality: qualityStep,
    processing: document.getElementById("find-processing-step"),
    results: document.getElementById("find-results-step"),
    error: document.getElementById("find-error-step"),
  };

  const progress = [...modal.querySelectorAll(".find-photos-progress span")];

  const eventsList = document.getElementById("find-events-list");

  const continueBtn = document.getElementById("find-event-continue");

  const accessCodeInput = document.getElementById("find-access-code-input");

  const accessCodeBtn = document.getElementById("find-access-code-btn");

  const accessCodeMessage = document.getElementById("find-access-code-message");

  const input = document.getElementById("face-photo-input");

  const uploadZone = document.getElementById("face-upload-zone");

  const faceSelectedContainer = document.getElementById(
    "face-selected-container",
  );

  const facePreviewGrid = document.getElementById("face-preview-grid");

  const faceSelectedCount = document.getElementById("face-selected-count");

  const faceClearBtn = document.getElementById("face-clear-btn");

  const faceAddMoreBtn = document.getElementById("face-add-more-btn");

  const validation = document.getElementById("face-validation");

  const scanBtn = document.getElementById("scan-photos-btn");

  const status = document.getElementById("scan-status");

  const statusDetail = document.getElementById("scan-status-detail");

  const errorTitle = document.getElementById("find-error-title");

  const errorMessage = document.getElementById("find-error-message");

  const selected = {
    event: null,
    files: [],
    results: [],
    allResults: [],
    searchableIndexEmpty: false,
    matchFilter: "all",
  };

  // Each filter reruns /api/match with the listed backend threshold. Limits
  // are applied after deterministic relevance ordering, never at random.
  const MATCH_FILTERS = {
    all: { label: "All Matches", threshold: 0.5, limit: 50, matchCount: 50, suppressDuplicates: false },
    best: { label: "Best Matches", threshold: 0.78, limit: 25, matchCount: 50, suppressDuplicates: true },
    high: { label: "High Confidence", threshold: 0.85, limit: 50, matchCount: 50, suppressDuplicates: true },
    balanced: { label: "Balanced", threshold: 0.65, limit: 35, matchCount: 50, suppressDuplicates: true },
    more: { label: "More Results", threshold: 0.5, limit: 100, matchCount: 100, suppressDuplicates: false },
  };

  let scanAbortController = null;
  let qualityAbortController = null;

  function showStep(name) {
    Object.entries(steps).forEach(([key, element]) => {
      element.classList.toggle("hidden", key !== name);
    });

    const active =
      name === "event"
        ? 0
        : name === "upload"
        ? 1
          : name === "quality" || name === "processing"
            ? 2
            : 3;

    progress.forEach((bar, index) => {
      bar.classList.toggle("active", index <= active);
    });
  }

  function closeFlow() {
    scanAbortController?.abort();
    qualityAbortController?.abort();

    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");

    window.PFOverlayLock.remove("findPhotos");
  }

  function setValidation(message) {
    if (!validation) return;

    validation.textContent = message || "";
    validation.classList.toggle("hidden", !message);
  }

  function setAccessCodeMessage(message) {
    if (!accessCodeMessage) return;

    accessCodeMessage.textContent = message || "";

    accessCodeMessage.classList.toggle("hidden", !message);
  }

  function resetUpload() {
    qualityAbortController?.abort();
    selected.files = [];

    if (input) {
      input.value = "";
    }

    renderFacePreviews();
    setValidation("");
  }

  function resetEventSelection() {
    selected.event = null;

    if (continueBtn) {
      continueBtn.disabled = true;
    }

    eventsList?.querySelectorAll(".find-event-option").forEach((item) => {
      item.classList.remove("selected");

      const check = item.querySelector(".find-event-check");

      if (check) {
        check.textContent = "○";
      }
    });
  }

  function normalizeEvents(payload) {
    if (Array.isArray(payload)) {
      return payload;
    }

    return payload?.events || payload?.data || [];
  }

  function normalizeResults(payload) {
    return (
      payload?.photos ||
      payload?.matches ||
      payload?.results ||
      payload?.data?.photos ||
      []
    );
  }

  async function loadEvents() {
    eventsList.innerHTML =
      '<div class="find-state-message">Loading available events…</div>';

    if (!api?.getEvents) {
      eventsList.innerHTML =
        '<div class="find-state-message">Event service is not configured.</div>';
      return;
    }

    try {
      const response = await api.getEvents();

      const events = normalizeEvents(response);

      if (!events.length) {
        eventsList.innerHTML =
          '<div class="find-state-message">No events are available yet.</div>';
        return;
      }

      eventsList.innerHTML = events
        .map((event) => {
          const id = event.id ?? event.eventId ?? "";

          const name = event.name ?? event.title ?? "Untitled event";

          const date = event.date ?? event.eventDate ?? event.created_at ?? "";

          // FIX: this previously rendered src="" on the <img>, which the
          // browser resolves as a request to the current page and always
          // fails — showing a broken-image icon for every single event,
          // even ones with no cover image at all. Use a real cover image
          // when the event has one, otherwise fall back to the inline
          // placeholder icon (never an empty src, never an invented URL).
          const thumbSrc = getEventThumbUrl(event) || EVENT_THUMB_FALLBACK;

          return `
              <button
                type="button"
                class="find-event-option"
                data-event-id="${escapeHtml(id)}"
              >
                <img
                  class="find-event-thumb"
                  src="${escapeHtml(thumbSrc)}"
                  alt=""
                  aria-hidden="true"
                >
                <span class="find-event-copy">
                  <strong>${escapeHtml(name)}</strong>
                  <small>${escapeHtml(date)}</small>
                </span>
                <span class="find-event-check">○</span>
              </button>
            `;
        })
        .join("");

      eventsList.querySelectorAll(".find-event-option").forEach((button) => {
        // If a real cover image URL was used above and it fails to load
        // (404, expired signed URL, etc.), fall back to the same inline
        // placeholder instead of leaving a broken-image icon on screen.
        const thumbImg = button.querySelector(".find-event-thumb");
        thumbImg?.addEventListener(
          "error",
          () => {
            thumbImg.onerror = null;
            thumbImg.src = EVENT_THUMB_FALLBACK;
          },
          { once: true },
        );

        button.addEventListener("click", () => {
          eventsList.querySelectorAll(".find-event-option").forEach((item) => {
            item.classList.remove("selected");

            const check = item.querySelector(".find-event-check");

            if (check) {
              check.textContent = "○";
            }
          });

          button.classList.add("selected");

          const check = button.querySelector(".find-event-check");

          if (check) {
            check.textContent = "●";
          }

          selected.event = button.dataset.eventId || null;

          continueBtn.disabled = !selected.event;
        });
      });
    } catch (error) {
      if (error?.status === 401) {
        closeFlow();

        document.getElementById("auth-modal")?.classList.remove("hidden");

        return;
      }

      eventsList.innerHTML =
        '<div class="find-state-message">Unable to load events. Please try again.</div>';
    }
  }

  async function redeemEventAccessCode() {
    if (!accessCodeInput || !accessCodeBtn) {
      return;
    }

    setAccessCodeMessage("");

    if (!localStorage.getItem("pf_token")) {
      closeFlow();

      const authModal = document.getElementById("auth-modal");

      if (authModal) {
        authModal.classList.remove("hidden");
      }

      return;
    }

    const code = accessCodeInput.value.trim().toUpperCase();

    if (!code || code.length < 4) {
      setAccessCodeMessage("Enter a valid event access code.");
      return;
    }

    accessCodeBtn.disabled = true;
    accessCodeBtn.textContent = "GETTING ACCESS...";

    try {
      const response = await api.redeemAccessCode(code);

      if (!response?.event?.id) {
        throw new Error("No event was returned.");
      }

      selected.event = response.event.id;
      accessCodeInput.value = "";
      closeFlow();
      if (window.PhotoFinderOpenWelcome) await window.PhotoFinderOpenWelcome(response.event);
    } catch (error) {
      if (error?.status === 401) {
        closeFlow();

        document.getElementById("auth-modal")?.classList.remove("hidden");

        return;
      }

      if (error?.status === 403) {
        setAccessCodeMessage("You are not allowed to access this event.");
        return;
      }

      setAccessCodeMessage(
        error?.message || "Invalid or unavailable event code.",
      );
    } finally {
      accessCodeBtn.disabled = false;
      accessCodeBtn.innerHTML = "GET EVENT ACCESS <span>→</span>";
    }
  }

  function openFlow() {
    const token = localStorage.getItem("pf_token");

    if (!token) {
      const authModal = document.getElementById("auth-modal");

      if (authModal) {
        authModal.classList.remove("hidden");
      }

      return;
    }

    modal.classList.remove("hidden");

    modal.setAttribute("aria-hidden", "false");

    window.PFOverlayLock.add("findPhotos", closeFlow);

    selected.event = null;
    selected.files = [];
    selected.results = [];
    selected.allResults = [];
    selected.searchableIndexEmpty = false;

    continueBtn.disabled = true;

    if (accessCodeInput) {
      accessCodeInput.value = "";
    }

    setAccessCodeMessage("");
    resetUpload();

    showStep("event");

    loadEvents();
  }
  window.PhotoFinderContinueFind = (eventId) => { openFlow(); if (!localStorage.getItem("pf_token")) return; selected.event = eventId; showStep("upload"); };

  async function continueToUpload() {
    if (!selected.event) {
      setAccessCodeMessage("Choose an event or enter an access code first.");
      return;
    }

    showStep("upload");
  }

  function formatFaceBytes(bytes) {
    if (bytes === 0) {
      return "0 B";
    }

    const k = 1024;

    const sizes = ["B", "KB", "MB", "GB"];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }

  const VALID_FACE_TYPES = ["image/jpeg", "image/png", "image/webp"];

  const MAX_FACE_SIZE = 10 * 1024 * 1024;

  function addFaceFiles(fileList) {
    const incoming = Array.from(fileList || []);

    if (!incoming.length) {
      return;
    }

    let rejectionMessage = "";

    const accepted = incoming.find((file) => {
      if (!VALID_FACE_TYPES.includes(file.type)) {
        rejectionMessage = "Please choose JPG, JPEG, PNG or WEBP images.";
        return false;
      }

      if (file.size > MAX_FACE_SIZE) {
        rejectionMessage = "One of your photos is over 10 MB.";
        return false;
      }

      return true;
    });

    setValidation(rejectionMessage);

    if (!accepted) {
      return;
    }

    // Quality is evaluated one image at a time, which also ensures the image
    // used by the matching flow is the one the person just approved.
    selected.files = [accepted];

    renderFacePreviews();
    checkSelectedFaceQuality(accepted);
  }

  function formatQualityValue(value, suffix = "") {
    return value === null || value === undefined || value === ""
      ? "Unavailable"
      : `${value}${suffix}`;
  }

  function renderFaceQuality(result) {
    const details = document.getElementById("face-quality-details");
    const loading = document.getElementById("face-quality-loading");
    const review = document.getElementById("face-quality-result");
    if (!details || !loading || !review) return;

    const dimensions = result?.image_width && result?.image_height
      ? `${result.image_width} × ${result.image_height} px`
      : "Unavailable";
    const largestArea = typeof result?.largest_face_area === "number"
      ? `${(result.largest_face_area * 100).toFixed(2)}%`
      : "Unavailable";

    details.innerHTML = [
      ["Faces detected", formatQualityValue(result?.face_count)],
      ["Brightness", formatQualityValue(result?.brightness)],
      ["Image dimensions", dimensions],
      ["Largest face area", largestArea],
    ].map(([label, value]) => `<div class="find-event-option"><span class="find-event-copy"><strong>${label}</strong><small>${value}</small></span></div>`).join("");
    loading.classList.add("hidden");
    review.classList.remove("hidden");
  }

  async function checkSelectedFaceQuality(file) {
    if (!api?.checkFaceQuality) {
      showError("API NOT CONFIGURED", "The face quality service is not configured.");
      return;
    }

    qualityAbortController?.abort();
    qualityAbortController = new AbortController();
    document.getElementById("face-quality-loading")?.classList.remove("hidden");
    document.getElementById("face-quality-result")?.classList.add("hidden");
    showStep("quality");

    try {
      const result = await api.checkFaceQuality(file, qualityAbortController.signal);
      if (qualityAbortController.signal.aborted || selected.files[0] !== file) return;
      renderFaceQuality(result);
    } catch (error) {
      if (error?.name === "AbortError") return;
      showError("FACE PHOTO CHECK FAILED", friendlyErrorMessage(error));
    }
  }

  function removeFaceFile(index) {
    selected.files.splice(index, 1);

    renderFacePreviews();
  }

  function renderFacePreviews() {
    if (!facePreviewGrid) {
      return;
    }

    facePreviewGrid.innerHTML = "";

    if (!selected.files.length) {
      faceSelectedContainer?.classList.add("hidden");

      scanBtn.disabled = true;

      return;
    }

    faceSelectedContainer?.classList.remove("hidden");

    faceSelectedCount.textContent = `${selected.files.length} photo${selected.files.length === 1 ? "" : "s"} selected`;

    scanBtn.disabled = false;

    selected.files.forEach((file, index) => {
      const card = document.createElement("div");

      card.className = "file-preview-item";

      card.innerHTML = `
          <div class="file-thumb-box" id="face-thumb-${index}"></div>
          <div
            class="file-name-truncate"
            title="${escapeHtml(file.name)}"
          >
            ${escapeHtml(file.name)}
          </div>
          <div class="file-preview-size">
            ${formatFaceBytes(file.size)}
          </div>
          <button
            type="button"
            class="file-remove-btn"
            data-index="${index}"
            aria-label="Remove ${escapeHtml(file.name)}"
          >
            ×
          </button>
        `;

      const reader = new FileReader();

      reader.onload = (event) => {
        const thumb = card.querySelector(`#face-thumb-${index}`);

        if (thumb) {
          thumb.innerHTML = `<img src="${event.target.result}" alt="">`;
        }
      };

      reader.readAsDataURL(file);

      card
        .querySelector(".file-remove-btn")
        .addEventListener("click", (event) => {
          event.stopPropagation();
          removeFaceFile(index);
        });

      facePreviewGrid.appendChild(card);
    });
  }

  function showError(title, message) {
    errorTitle.textContent = title;

    errorMessage.textContent = message;

    showStep("error");
  }

  function friendlyErrorMessage(error) {
    if (error?.name === "AbortError") {
      return "Search was cancelled.";
    }

    if (error?.status === 401) {
      return "Please login again.";
    }

    if (error?.status === 403) {
      return "You do not have access to this event.";
    }

    if (
      error?.status === 502 ||
      error?.status === 503 ||
      error?.status === 504
    ) {
      return "Photo search service is currently unavailable.";
    }

    const message = String(error?.message || "");

    if (message.toLowerCase().includes("face")) {
      return "Could not detect a clear face. Please try another photo.";
    }

    return message || "Unable to complete the search.";
  }

  function matchSimilarity(item) {
    const value = item?.similarity ?? item?.score;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  function duplicateKey(item) {
    const value = item?.duplicate_group_id ?? item?.duplicateGroupId ?? item?.duplicate_of ?? item?.duplicateOf ?? item?.duplicate_hash ?? item?.p_hash ?? item?.phash;
    return value === null || value === undefined || value === "" ? null : String(value);
  }

  function qualityValue(item) {
    const value = item?.quality?.score ?? item?.quality_score ?? item?.qualityScore;
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  }

  function diversityKey(item) {
    const value = item?.captured_at ?? item?.taken_at ?? item?.date ?? item?.album ?? item?.scene;
    return value ? String(value) : null;
  }

  function rankMatches(matches, filter) {
    const seenDuplicates = new Set();
    return [...(matches || [])]
      .filter((item) => {
        const similarity = matchSimilarity(item);
        if (similarity !== null && similarity < filter.threshold) return false;
        const key = duplicateKey(item);
        if (!filter.suppressDuplicates || !key) return true;
        if (seenDuplicates.has(key)) return false;
        seenDuplicates.add(key);
        return true;
      })
      .sort((left, right) => (matchSimilarity(right) ?? -Infinity) - (matchSimilarity(left) ?? -Infinity) || qualityValue(right) - qualityValue(left))
      .slice(0, filter.limit);
  }

  function bestMemories() {
    const candidates = rankMatches(selected.allResults, { threshold: 0.5, limit: 50, suppressDuplicates: true });
    const target = Math.min(25, Math.max(1, Math.ceil(candidates.length * 0.4)));
    const selectedBest = [];
    const usedDiversity = new Set();

    // First pass keeps one strongest result from each available real diversity
    // group; the second fills any remaining places by similarity/quality rank.
    for (const item of candidates) {
      const key = diversityKey(item);
      if (key && usedDiversity.has(key)) continue;
      selectedBest.push(item);
      if (key) usedDiversity.add(key);
      if (selectedBest.length === target) return selectedBest;
    }
    for (const item of candidates) {
      if (selectedBest.includes(item)) continue;
      selectedBest.push(item);
      if (selectedBest.length === target) break;
    }
    return selectedBest;
  }

  function updateMatchControls() {
    const filter = MATCH_FILTERS[selected.matchFilter] || MATCH_FILTERS.all;
    matchControls.querySelectorAll("[data-match-filter]").forEach((button) => {
      const active = button.dataset.matchFilter === selected.matchFilter;
      button.disabled = active;
      button.setAttribute("aria-pressed", String(active));
    });
    const best = bestMemories();
    const saveBest = document.getElementById("save-best-memories-btn");
    if (saveBest) {
      saveBest.disabled = best.length === 0;
      saveBest.textContent = best.length ? `SAVE BEST MEMORIES (${best.length})` : "SAVE BEST MEMORIES";
    }
    return filter;
  }

  function renderResults(payload) {
    selected.results = normalizeResults(payload);

    const grid = document.getElementById("matched-photo-grid");
    const empty = document.getElementById("find-results-empty");
    const title = document.getElementById("find-results-title");
    const count = document.getElementById("find-results-count");
    const filter = MATCH_FILTERS[selected.matchFilter] || MATCH_FILTERS.all;

    grid.innerHTML = "";
    if (selected.results.length) {
      title.textContent = "We found your photos.";
      count.textContent = `${selected.results.length} ${filter.label.toLowerCase()} at the actual ${filter.threshold} matching threshold.`;
      empty.classList.add("hidden");

      selected.results.forEach((item) => {
        const url = item.url || item.imageUrl || item.photoUrl;
        if (!url) return;
        const similarity = matchSimilarity(item);
        const confidence = similarity === null ? "Similarity unavailable" : `Similarity: ${String(similarity)}`;
        const button = document.createElement("button");
        button.type = "button";
        button.className = `matched-photo-card ${item.loved ? "is-loved" : ""}`;
        button.innerHTML = `<img src="${escapeHtml(url)}" alt="${escapeHtml(item.filename || item.name || "Matched event photo")}" loading="lazy"><span class="matched-confidence">${escapeHtml(confidence)}</span><span class="matched-loved-badge">${item.loved ? "♥ Loved" : "♡ Love"}</span>`;
        button.addEventListener("click", () => window.PhotoFinderLightbox?.open(selected.results, selected.results.indexOf(item), { id: selected.event }));
        button.querySelector(".matched-loved-badge").addEventListener("click", async (event) => {
          event.preventDefault(); event.stopPropagation();
          if (item._saving) return;
          item._saving = true;
          const previous = Boolean(item.loved); item.loved = !previous;
          button.classList.toggle("is-loved", item.loved);
          button.querySelector(".matched-loved-badge").textContent = item.loved ? "♥ Loved" : "♡ Love";
          try { await api.setPhotoFavorite(selected.event, item.id, item.loved); }
          catch (error) { item.loved = previous; button.classList.toggle("is-loved", previous); button.querySelector(".matched-loved-badge").textContent = previous ? "♥ Loved" : "♡ Love"; showToast(error?.message || "Could not save love."); }
          finally { item._saving = false; updateLovedSavePanel(); }
        });
        grid.appendChild(button);
      });
    } else {
      title.textContent = "No matching photos found.";
      count.textContent = "";
      empty.textContent = selected.searchableIndexEmpty
        ? "This event has no indexed face embeddings to search. Photos without detected faces cannot match. If these photos should contain faces, ask the event owner to re-index photos from the event gallery."
        : "We couldn't find your memories with this matching threshold. Try More Results or another clear face photo.";
      empty.classList.remove("hidden");
    }
    updateMatchControls();
    showStep("results");
    updateLovedSavePanel();
  }

  function updateLovedSavePanel() {
    const loved = selected.results.filter((item) => item.loved);
    document.getElementById("find-loved-count").textContent = `${loved.length} photo${loved.length === 1 ? "" : "s"} loved`;
    document.getElementById("save-loved-btn").disabled = loved.length === 0;
    const bulkButton = document.getElementById("find-love-all-btn");
    if (bulkButton) {
      const allLoved = selected.results.length > 0 && loved.length === selected.results.length;
      bulkButton.textContent = allLoved ? "UNLOVE ALL LOVED" : "♥ LOVE ALL";
      bulkButton.dataset.bulkUnlove = String(allLoved);
      bulkButton.disabled = selected.results.length === 0;
    }
  }

  document.getElementById("save-loved-btn")?.addEventListener("click", () => window.LovedCollectionComposer?.open(selected.results.filter((item) => item.loved)));
  document.getElementById("save-best-memories-btn")?.addEventListener("click", () => window.LovedCollectionComposer?.open(bestMemories()));
  document.getElementById("find-love-all-btn")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    if (!selected.results.length || !selected.event || button.disabled) return;
    const wasAllLoved = button.dataset.bulkUnlove === "true";
    const targets = wasAllLoved ? selected.results.filter((item) => item.loved) : selected.results;
    const previous = targets.map((item) => item.loved);
    button.disabled = true;
    targets.forEach((item) => { item.loved = !wasAllLoved; });
    renderResults({ photos: selected.results });
    button.disabled = true;
    button.textContent = wasAllLoved ? "SAVING…" : "SAVING…";
    try {
      if (wasAllLoved) await api.unloveSelected(selected.event, targets.map((item) => item.id));
      else await api.loveSelected(selected.event, targets.map((item) => item.id));
    } catch (error) {
      targets.forEach((item, index) => { item.loved = previous[index]; });
      showToast(error?.message || `Could not ${wasAllLoved ? "unlove" : "love"} photos.`);
    } finally { renderResults({ photos: selected.results }); }
  });

  async function scan(filterId = selected.matchFilter) {
    const resolvedFilterId = MATCH_FILTERS[filterId] ? filterId : "all";
    const filter = MATCH_FILTERS[resolvedFilterId];
    selected.matchFilter = resolvedFilterId;
    if (!selected.event) {
      showError("SELECT AN EVENT", "Choose an event before scanning.");
      return;
    }

    if (!selected.files.length) {
      showError(
        "ADD A FACE PHOTO",
        "Please upload at least one clear face photo.",
      );
      return;
    }

    if (!api?.findMyPhotos) {
      showError(
        "API NOT CONFIGURED",
        "The photo matching service is not configured.",
      );
      return;
    }

    scanAbortController?.abort();
    const controller = new AbortController();
    scanAbortController = controller;
    const searchEventId = selected.event;
    const searchFiles = [...selected.files];
    selected.searchableIndexEmpty = false;

    showStep("processing");

    statusDetail.textContent = "Your images stay attached to this search only.";

    const total = searchFiles.length;

    let flavorTimer = null;

    if (total > 1) {
      status.textContent = `Scanning photo 1 of ${total}…`;
    } else {
      const messages = [
        "Preparing your photo…",
        "Detecting your face…",
        "Creating your face signature…",
        "Searching event memories…",
        "Finding your moments…",
      ];

      let messageIndex = 0;

      status.textContent = messages[0];

      flavorTimer = setInterval(() => {
        messageIndex = Math.min(messageIndex + 1, messages.length - 1);

        status.textContent = messages[messageIndex];
      }, 1100);
    }

    const mergedMatches = new Map();

    function mergeMatches(list) {
      (list || []).forEach((item) => {
        const identity =
          item.id != null
            ? `id:${item.id}`
            : item.url || item.storage_path || item.imageUrl || item.photoUrl;

        if (!identity) {
          return;
        }

        const similarity =
          typeof item.similarity === "number"
            ? item.similarity
            : typeof item.score === "number"
              ? item.score
              : 0;

        const existing = mergedMatches.get(identity);

        if (!existing) {
          mergedMatches.set(identity, item);
          return;
        }

        const existingSimilarity =
          typeof existing.similarity === "number"
            ? existing.similarity
            : typeof existing.score === "number"
              ? existing.score
              : 0;

        if (similarity > existingSimilarity) {
          mergedMatches.set(identity, item);
        }
      });
    }

    let succeededCount = 0;
    let lastError = null;

    try {
      for (let index = 0; index < total; index++) {
        if (controller.signal.aborted || scanAbortController !== controller) {
          return;
        }

        if (total > 1) {
          status.textContent = `Scanning photo ${index + 1} of ${total}…`;
        }

        try {
          const result = await api.findMyPhotos(
            searchEventId,
            searchFiles[index],
            controller.signal,
            filter.threshold,
            filter.matchCount,
          );

          if (controller.signal.aborted || scanAbortController !== controller) return;
          mergeMatches(normalizeResults(result));
          selected.searchableIndexEmpty = result?.searchable_index_empty === true;

          succeededCount++;
        } catch (error) {
          if (error?.name === "AbortError") {
            return;
          }

          lastError = error;
        }
      }

      if (controller.signal.aborted || scanAbortController !== controller) {
        return;
      }

      if (succeededCount === 0 && lastError) {
        showError(
          "WE COULDN’T COMPLETE THE SEARCH",
          friendlyErrorMessage(lastError),
        );

        return;
      }

      selected.allResults = [...mergedMatches.values()];
      renderResults({
        photos: rankMatches(selected.allResults, filter),
      });
    } finally {
      if (flavorTimer) {
        clearInterval(flavorTimer);
      }
      if (scanAbortController === controller) scanAbortController = null;
    }
  }

  document
    .getElementById("nav-find-photos-btn")
    ?.addEventListener("click", openFlow);

  document
    .getElementById("climax-find-photos-btn")
    ?.addEventListener("click", openFlow);

  document
    .getElementById("footer-find-photos-btn")
    ?.addEventListener("click", (event) => {
      event.preventDefault();
      openFlow();
    });

  document
    .getElementById("hero-find-photos-btn")
    ?.addEventListener("click", openFlow);

  document
    .getElementById("find-photos-close")
    ?.addEventListener("click", closeFlow);

  document
    .getElementById("find-results-close-btn")
    ?.addEventListener("click", closeFlow);

  continueBtn?.addEventListener("click", continueToUpload);

  accessCodeBtn?.addEventListener("click", redeemEventAccessCode);

  accessCodeInput?.addEventListener("input", (event) => {
    event.target.value = formatEventAccessCode(event.target.value);

    setAccessCodeMessage("");
  });

  accessCodeInput?.addEventListener("paste", (event) => {
    const pastedText = event.clipboardData?.getData("text");
    if (typeof pastedText !== "string") return;
    event.preventDefault();
    accessCodeInput.value = pastedText;
    accessCodeInput.dispatchEvent(new Event("input", { bubbles: true }));
  });

  accessCodeInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      redeemEventAccessCode();
    }
  });

  document.getElementById("face-back-btn")?.addEventListener("click", () => {
    showStep("event");
  });

  document
    .getElementById("face-browse-btn")
    ?.addEventListener("click", (event) => {
      event.stopPropagation();
      input.click();
    });

  uploadZone?.addEventListener("click", () => input.click());

  uploadZone?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      input.click();
    }
  });

  uploadZone?.addEventListener("dragover", (event) => {
    event.preventDefault();
    uploadZone.classList.add("dragging");
  });

  uploadZone?.addEventListener("dragleave", () => {
    uploadZone.classList.remove("dragging");
  });

  uploadZone?.addEventListener("drop", (event) => {
    event.preventDefault();

    uploadZone.classList.remove("dragging");

    addFaceFiles(event.dataTransfer.files);
  });

  input?.addEventListener("change", () => {
    addFaceFiles(input.files);

    input.value = "";
  });

  faceAddMoreBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    input.click();
  });

  faceClearBtn?.addEventListener("click", () => {
    resetUpload();
  });

  scanBtn?.addEventListener("click", () => scan("all"));

  matchControls.querySelectorAll("[data-match-filter]").forEach((button) => {
    button.addEventListener("click", () => scan(button.dataset.matchFilter));
  });

  document.getElementById("face-quality-use")?.addEventListener("click", () => {
    // Do not re-read the input or create a replacement file: scan() receives
    // selected.files[0], the exact File instance quality just inspected.
    scan();
  });

  document.getElementById("face-quality-another")?.addEventListener("click", () => {
    resetUpload();
    showStep("upload");
    input?.click();
  });

  document.getElementById("find-again-btn")?.addEventListener("click", () => {
    resetUpload();
    showStep("upload");
  });

  document.getElementById("find-retry-btn")?.addEventListener("click", scan);

  document
    .getElementById("find-error-back-btn")
    ?.addEventListener("click", () => {
      showStep(selected.event ? "upload" : "event");
    });

  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeFlow();
    }
  });
})();
