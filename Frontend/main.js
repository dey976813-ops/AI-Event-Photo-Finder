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
  function apply() {
    const locked = openOverlays.size > 0;
    document.documentElement.style.overflow = locked ? "hidden" : "";
    document.body.style.overflow = locked ? "hidden" : "";
  }
  return {
    add(name) {
      openOverlays.add(name);
      apply();
    },
    remove(name) {
      openOverlays.delete(name);
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
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvasWidth = window.innerWidth * dpr;
    canvasHeight = window.innerHeight * dpr;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    renderFrame(currentFrame, true);
  }

  window.addEventListener("resize", handleResize, { passive: true });
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
  const API_ORIGIN =
    (window.PhotoFinderApi && window.PhotoFinderApi.API_BASE_URL) ||
    "http://localhost:5000";

  let currentUser = null;
  let authToken = localStorage.getItem("pf_token") || null;
  const eventMediaCache = new Map();
  const eventMediaRequests = new Map();
  const knownAccessCodes = new Map();

  const navAuthBtn = document.getElementById("nav-auth-btn");
  const navDashboardBtn = document.getElementById("nav-dashboard-btn");
  const navLogoutBtn = document.getElementById("nav-logout-btn");
  const navBrand = document.getElementById("nav-brand");

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
  // anywhere in this file. `navLogoutBtn?.addEventListener("click", logout)`
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
      const res = await fetch(`${API_ORIGIN}/api/auth/me`, {
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
    window.PFOverlayLock.remove("basicModal");
  }

  function openModal(modalEl) {
    if (!modalEl) return;
    closeAllModals();
    modalEl.classList.remove("hidden");
    window.PFOverlayLock.add("basicModal");
  }

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
      await openEventGallery(data.event);

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

  // Demo code shortcut click in modal
  document.getElementById("demo-code-pill")?.addEventListener("click", () => {
    modalCodeInput.value = "PX7K-29QM";
    const msg = document.getElementById("code-feedback");
    const submitBtn = document.getElementById("modal-code-submit");
    handleCodeVerification("PX7K-29QM", msg, submitBtn);
  });

  // Demo code shortcut click in inline section / Copy Button
  const copyPillBtn = document.getElementById("inline-copy-demo-btn");
  const copyPillText = document.getElementById("copy-pill-text");
  const copyPillIcon = document.getElementById("copy-pill-icon");

  copyPillBtn?.addEventListener("click", () => {
    navigator.clipboard.writeText("PX7K-29QM");
    if (copyPillBtn && copyPillText && copyPillIcon) {
      copyPillBtn.classList.add("copied");
      copyPillIcon.textContent = "✓";
      copyPillText.textContent = "COPIED";
      setTimeout(() => {
        copyPillBtn.classList.remove("copied");
        copyPillIcon.textContent = "📋";
        copyPillText.textContent = "COPY CODE";
      }, 2000);
    }
    if (inlineCodeInput) {
      inlineCodeInput.value = "PX7K-29QM";
      const msg = document.getElementById("inline-code-msg");
      const submitBtn = document.getElementById("inline-code-submit");
      handleCodeVerification("PX7K-29QM", msg, submitBtn);
    }
  });

  // ==================== TYPEWRITER SEARCH SIMULATION ====================
  const searchQueries = [
    "A photo of us at the beach.",
    "Sunset in Paris.",
    "My dog sleeping on the couch.",
    "Everyone wearing black.",
  ];
  let currentQueryIdx = 0;
  let currentCharIdx = 0;
  let isDeleting = false;
  const typewriterEl = document.getElementById("typewriter-text");

  function typeSearchLoop() {
    if (!typewriterEl) return;
    const fullQuery = searchQueries[currentQueryIdx];

    if (isDeleting) {
      currentCharIdx--;
      typewriterEl.textContent = fullQuery.substring(0, currentCharIdx);
    } else {
      currentCharIdx++;
      typewriterEl.textContent = fullQuery.substring(0, currentCharIdx);
    }

    let typeSpeed = isDeleting ? 35 : 70;

    if (!isDeleting && currentCharIdx === fullQuery.length) {
      typeSpeed = 2200; // Pause at full query
      isDeleting = true;
    } else if (isDeleting && currentCharIdx === 0) {
      isDeleting = false;
      currentQueryIdx = (currentQueryIdx + 1) % searchQueries.length;
      typeSpeed = 500;
    }

    setTimeout(typeSearchLoop, typeSpeed);
  }

  typeSearchLoop();

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
      title: "Uncompressed Road Trips & Scenic Flights",
      desc: "Share breathtaking 4K travel clips and high-res RAW photos with travel companions without WhatsApp compression or social media ads.",
      stat1: "✈️ 100% Original Resolution",
      stat2: "🔒 Direct Code PX7K-29QM",
    },
    weddings: {
      badge: "CEREMONIES & CELEBRATIONS",
      title: "Collect Every Angle From Every Guest",
      desc: "Place stylish QR cards on reception tables. Guests enter one code to upload their spontaneous phone memories and view the official album.",
      stat1: "💍 Zero App Download",
      stat2: "✨ Instant Unified Gallery",
    },
    events: {
      badge: "FESTIVALS & CONFERENCES",
      title: "Live Event Photo Hubs",
      desc: "Instant media distribution for brand activations, concerts, and galas with rapid sub-second access.",
      stat1: "🎉 Real-Time Ingestion",
      stat2: "⚡ Lossless 4K Streaming",
    },
    family: {
      badge: "HERITAGE & GENERATIONS",
      title: "Preserve Milestones In High Definition",
      desc: "Safe from algorithmic feeds and public advertising. A quiet, private haven for family memories.",
      stat1: "🛡️ Private by Design",
      stat2: "📸 Full Exif Metadata",
    },
    creators: {
      badge: "PROFESSIONAL PROOFING",
      title: "Deliver Sleek Client Proofing Galleries",
      desc: "Impress photography clients with a branded private viewing portal and seamless one-click downloads.",
      stat1: "💎 Fast Lossless Delivery",
      stat2: "🚀 Zero Compression Loss",
    },
  };

  const storyTabs = document.querySelectorAll(".story-tab");
  const storyBadgeEl = document.getElementById("story-badge");
  const storyTitleEl = document.getElementById("story-title");
  const storyDescEl = document.getElementById("story-desc");

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
    .querySelectorAll('.nav-menu a, .footer-links a[href^="#"]')
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
        const res = await fetch(`${API_ORIGIN}/api/auth/login`, {
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
        const res = await fetch(`${API_ORIGIN}/api/auth/signup`, {
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
    window.PFOverlayLock.add("dashboard");
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
      if (cover && media[0]?.url) cover.src = media[0].url;
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
      name: collection.name,
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
        name: collection.name,
        accessCode: collection.accessCode,
        photosCount: summary.photos,
        videosCount: summary.videos,
        media,
      });
    } catch (error) {
      console.warn("Failed to load event photos:", error);
      openGallery({
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

  function openGallery(collection) {
    currentGalleryMedia = collection.media || [];
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
              <span class="gallery-item-name">${item.filename}</span>
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
              <span class="gallery-item-name">${item.filename}</span>
            </div>
          `;
        }

        el.addEventListener("click", () => openLightbox(index));
        grid.appendChild(el);
      });
    }

    galleryView.classList.remove("hidden");
    window.PFOverlayLock.add("gallery");
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

  function openLightbox(index) {
    if (!currentGalleryMedia || currentGalleryMedia.length === 0) return;
    activeLightboxIndex = Math.max(
      0,
      Math.min(currentGalleryMedia.length - 1, index),
    );
    renderLightboxItem();
    lightbox.classList.remove("hidden");
  }

  function closeLightbox() {
    lightbox.classList.add("hidden");
    const vid = lightboxContent.querySelector("video");
    if (vid) vid.pause();
    lightboxContent.innerHTML = "";
  }

  function renderLightboxItem() {
    const item = currentGalleryMedia[activeLightboxIndex];
    if (!item) return;

    lightboxCounter.textContent = `${activeLightboxIndex + 1} / ${currentGalleryMedia.length}`;
    lightboxDownloadBtn.href = item.url;
    lightboxDownloadBtn.setAttribute("download", item.filename);

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
    if (activeLightboxIndex < currentGalleryMedia.length - 1) {
      activeLightboxIndex++;
      renderLightboxItem();
    } else {
      activeLightboxIndex = 0;
      renderLightboxItem();
    }
  }

  function prevLightboxItem() {
    if (activeLightboxIndex > 0) {
      activeLightboxIndex--;
      renderLightboxItem();
    } else {
      activeLightboxIndex = currentGalleryMedia.length - 1;
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

  lightbox?.addEventListener("click", (e) => {
    if (e.target === lightbox) closeLightbox();
  });

  window.addEventListener("keydown", (e) => {
    if (!lightbox.classList.contains("hidden")) {
      if (e.key === "ArrowRight") nextLightboxItem();
      if (e.key === "ArrowLeft") prevLightboxItem();
    }
  });
})();

// ==================== FIND MY PHOTOS FLOW ====================
(() => {
  const modal = document.getElementById("find-photos-modal");
  if (!modal) return;

  const api = window.PhotoFinderApi;

  const steps = {
    event: document.getElementById("find-event-step"),
    upload: document.getElementById("find-upload-step"),
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
  };

  let scanAbortController = null;

  function showStep(name) {
    Object.entries(steps).forEach(([key, element]) => {
      element.classList.toggle("hidden", key !== name);
    });

    const active =
      name === "event"
        ? 0
        : name === "upload"
          ? 1
          : name === "processing"
            ? 2
            : 3;

    progress.forEach((bar, index) => {
      bar.classList.toggle("active", index <= active);
    });
  }

  function closeFlow() {
    scanAbortController?.abort();

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

      setAccessCodeMessage("Access granted.");

      await loadEvents();

      const selectedButton = eventsList.querySelector(
        `[data-event-id="${CSS.escape(String(selected.event))}"]`,
      );

      if (selectedButton) {
        selectedButton.click();
      }

      setTimeout(() => {
        showStep("upload");
      }, 250);
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

    window.PFOverlayLock.add("findPhotos");

    selected.event = null;
    selected.files = [];
    selected.results = [];

    continueBtn.disabled = true;

    if (accessCodeInput) {
      accessCodeInput.value = "";
    }

    setAccessCodeMessage("");
    resetUpload();

    showStep("event");

    loadEvents();
  }

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

    incoming.forEach((file) => {
      if (!VALID_FACE_TYPES.includes(file.type)) {
        rejectionMessage = "Please choose JPG, JPEG, PNG or WEBP images.";
        return;
      }

      if (file.size > MAX_FACE_SIZE) {
        rejectionMessage = "One of your photos is over 10 MB.";
        return;
      }

      selected.files.push(file);
    });

    setValidation(rejectionMessage);

    renderFacePreviews();
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

  function renderResults(payload) {
    selected.results = normalizeResults(payload);

    const grid = document.getElementById("matched-photo-grid");

    const empty = document.getElementById("find-results-empty");

    const title = document.getElementById("find-results-title");

    const count = document.getElementById("find-results-count");

    grid.innerHTML = "";

    if (selected.results.length) {
      title.textContent = "We found your photos.";

      count.textContent = `${selected.results.length} memories matched to this event.`;

      empty.classList.add("hidden");

      selected.results.forEach((item) => {
        const url = item.url || item.imageUrl || item.photoUrl;

        if (!url) {
          return;
        }

        const button = document.createElement("button");

        button.type = "button";

        button.innerHTML = `
            <img
              src="${escapeHtml(url)}"
              alt="${escapeHtml(
                item.filename || item.name || "Matched event photo",
              )}"
              loading="lazy"
            >
          `;

        button.addEventListener("click", () => {
          window.open(url, "_blank", "noopener");
        });

        grid.appendChild(button);
      });
    } else {
      title.textContent = "No matching photos found.";

      count.textContent = "";

      empty.textContent =
        "We couldn't find your memories in this event. Try another clear face photo.";

      empty.classList.remove("hidden");
    }

    showStep("results");
  }

  async function scan() {
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

    showStep("processing");

    statusDetail.textContent = "Your images stay attached to this search only.";

    scanAbortController = new AbortController();

    const total = selected.files.length;

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
        if (scanAbortController.signal.aborted) {
          return;
        }

        if (total > 1) {
          status.textContent = `Scanning photo ${index + 1} of ${total}…`;
        }

        try {
          const result = await api.findMyPhotos(
            selected.event,
            selected.files[index],
            scanAbortController.signal,
          );

          mergeMatches(normalizeResults(result));

          succeededCount++;
        } catch (error) {
          if (error?.name === "AbortError") {
            return;
          }

          lastError = error;
        }
      }

      if (scanAbortController.signal.aborted) {
        return;
      }

      if (succeededCount === 0 && lastError) {
        showError(
          "WE COULDN’T COMPLETE THE SEARCH",
          friendlyErrorMessage(lastError),
        );

        return;
      }

      renderResults({
        photos: [...mergedMatches.values()],
      });
    } finally {
      if (flavorTimer) {
        clearInterval(flavorTimer);
      }
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

  scanBtn?.addEventListener("click", scan);

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
