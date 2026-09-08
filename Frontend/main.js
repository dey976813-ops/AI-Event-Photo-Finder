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
    document.documentElement.style.overflow = locked ? 'hidden' : '';
    document.body.style.overflow = locked ? 'hidden' : '';
  }
  return {
    add(name) { openOverlays.add(name); apply(); },
    remove(name) { openOverlays.delete(name); apply(); },
  };
})();

(() => {
  // ==================== 1. CANVAS SCROLL SEQUENCE ====================
  const TOTAL_FRAMES = 300;
  const canvas = document.getElementById('sequence-canvas');
  const ctx = canvas.getContext('2d', { alpha: false });

  const images = new Array(TOTAL_FRAMES);
  const loaded = new Array(TOTAL_FRAMES).fill(false);

  let currentFrame = 0;
  let targetFrame = 0;
  let lastDrawnFrame = -1;
  let dpr = 1;
  let canvasWidth = 0;
  let canvasHeight = 0;

  function getFrameSrc(index) {
    const frameNum = String(index + 1).padStart(3, '0');
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
    ctx.imageSmoothingQuality = 'high';
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
    const clampedIndex = Math.max(0, Math.min(TOTAL_FRAMES - 1, Math.round(index)));
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

  window.addEventListener('resize', handleResize, { passive: true });
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

      if ('decode' in img) {
        img.decode()
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
  if (typeof Lenis !== 'undefined') {
    lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      smoothWheel: false,
      wheelMultiplier: 1.0,
      smoothTouch: false,
      touchMultiplier: 1.5,
    });
  }

  // Storytelling section fade effects based on scroll progress
  const progressBar = document.getElementById('scroll-progress-bar');
  const secHero = document.getElementById('section-hero');
  const secIntro = document.getElementById('section-intro');
  const secHow = document.getElementById('section-how');
  const secUploadDemo = document.getElementById('section-upload-demo');
  const secCode = document.getElementById('section-code');
  const secSearch = document.getElementById('section-search');
  const secEditorial = document.getElementById('section-editorial');
  const secUseCases = document.getElementById('section-use-cases');
  const secPrivacy = document.getElementById('section-privacy');
  const secUpload = document.getElementById('section-upload');

  function calcSectionFade(p, startIn, peakIn, peakOut, endOut) {
    if (p < startIn || p > endOut) return 0;
    if (p < peakIn) return (p - startIn) / Math.max(0.001, (peakIn - startIn));
    if (p <= peakOut) return 1;
    return 1 - (p - peakOut) / Math.max(0.001, (endOut - peakOut));
  }

  function applySectionState(el, opacity, translateY = 0) {
    if (!el) return;
    const clampedOpacity = Math.max(0, Math.min(1, opacity));
    el.style.opacity = clampedOpacity;
    el.style.pointerEvents = clampedOpacity > 0.15 ? 'auto' : 'none';
    el.style.transform = `translateY(${translateY}px)`;
    if (clampedOpacity > 0.25) {
      el.classList.add('active-visible');
    } else {
      el.classList.remove('active-visible');
    }
  }

  function updateScroll() {
    const scrollContainer = document.documentElement;
    const maxScroll = scrollContainer.scrollHeight - window.innerHeight;
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const progress = maxScroll > 0 ? Math.max(0, Math.min(1, scrollY / maxScroll)) : 0;
    targetFrame = progress * (TOTAL_FRAMES - 1);

    // Update top progress bar
    if (progressBar) {
      progressBar.style.width = `${progress * 100}%`;
    }

    // Section 1: Hero (0.0 -> 0.10)
    const heroOpacity = progress < 0.10 ? (1 - (progress / 0.08)) : 0;
    applySectionState(secHero, heroOpacity, -(progress * 120));

    // Section 2: Intro & 3 Editorial Words (0.07 -> 0.19)
    const introOpacity = calcSectionFade(progress, 0.06, 0.11, 0.16, 0.20);
    applySectionState(secIntro, introOpacity, (1 - introOpacity) * 24);

    // Section 3: How It Works (0.17 -> 0.29)
    const howOpacity = calcSectionFade(progress, 0.16, 0.21, 0.26, 0.30);
    applySectionState(secHow, howOpacity, (1 - howOpacity) * 24);

    // Section 4: Floating Upload UI Demo (0.27 -> 0.39)
    const uploadDemoOpacity = calcSectionFade(progress, 0.26, 0.31, 0.36, 0.40);
    applySectionState(secUploadDemo, uploadDemoOpacity, (1 - uploadDemoOpacity) * 24);

    // Section 5: Access Code Section (0.37 -> 0.50)
    const codeOpacity = calcSectionFade(progress, 0.36, 0.42, 0.47, 0.51);
    applySectionState(secCode, codeOpacity, (1 - codeOpacity) * 24);

    // Section 6: Smart Search (0.48 -> 0.61)
    const searchOpacity = calcSectionFade(progress, 0.47, 0.53, 0.58, 0.62);
    applySectionState(secSearch, searchOpacity, (1 - searchOpacity) * 24);

    // Section 7: Editorial Feature List (0.59 -> 0.72)
    const editorialOpacity = calcSectionFade(progress, 0.58, 0.64, 0.69, 0.73);
    applySectionState(secEditorial, editorialOpacity, (1 - editorialOpacity) * 24);

    // Section 8: Use Cases & Stories (0.70 -> 0.83)
    const casesOpacity = calcSectionFade(progress, 0.69, 0.75, 0.80, 0.84);
    applySectionState(secUseCases, casesOpacity, (1 - casesOpacity) * 24);

    // Section 9: Privacy & Security (0.81 -> 0.93)
    const privacyOpacity = calcSectionFade(progress, 0.80, 0.85, 0.90, 0.94);
    applySectionState(secPrivacy, privacyOpacity, (1 - privacyOpacity) * 24);

    // Section 10: Eiffel Tower Climax Upload (0.90 -> 1.0)
    const uploadOpacity = progress > 0.89 ? Math.min(1, (progress - 0.89) / 0.08) : 0;
    applySectionState(secUpload, uploadOpacity, (1 - uploadOpacity) * 24);
  }

  window.addEventListener('scroll', updateScroll, { passive: true });
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
  let currentUser = null;
  let authToken = localStorage.getItem('pf_token') || null;

  const navAuthBtn = document.getElementById('nav-auth-btn');
  const navDashboardBtn = document.getElementById('nav-dashboard-btn');
  const navLogoutBtn = document.getElementById('nav-logout-btn');
  const navBrand = document.getElementById('nav-brand');

  function updateAuthUI() {
    if (authToken && currentUser) {
      navAuthBtn.classList.add('hidden');
      navDashboardBtn.classList.remove('hidden');
      navLogoutBtn.classList.remove('hidden');
      const userGreeting = document.getElementById('dashboard-user-name');
      if (userGreeting) userGreeting.textContent = `Welcome, ${currentUser.name}`;
    } else {
      navAuthBtn.classList.remove('hidden');
      navDashboardBtn.classList.add('hidden');
      navLogoutBtn.classList.add('hidden');
    }
  }

  async function checkAuthStatus() {
    if (!authToken) {
      updateAuthUI();
      return;
    }
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        currentUser = data.user;
      } else {
        authToken = null;
        currentUser = null;
        localStorage.removeItem('pf_token');
      }
    } catch (e) {
      console.warn('Auth check error:', e);
    }
    updateAuthUI();
  }

  checkAuthStatus();

  function logout() {
    authToken = null;
    currentUser = null;
    localStorage.removeItem('pf_token');
    updateAuthUI();
    closeAllModals();
    document.getElementById('dashboard-view').classList.add('hidden');
    showToast('Logged out successfully');
  }

  // ==================== 3. TOAST NOTIFICATIONS ====================
  const toastContainer = document.getElementById('toast-container');
  function showToast(message, duration = 3000) {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // ==================== 4. MODAL MANAGEMENT ====================
  const codeModal = document.getElementById('code-modal');
  const authModal = document.getElementById('auth-modal');
  const uploadModal = document.getElementById('upload-modal');
  const successModal = document.getElementById('success-modal');
  const dashboardView = document.getElementById('dashboard-view');
  const galleryView = document.getElementById('gallery-view');
  const lightbox = document.getElementById('lightbox');

  function closeAllModals() {
    codeModal.classList.add('hidden');
    authModal.classList.add('hidden');
    uploadModal.classList.add('hidden');
    successModal.classList.add('hidden');
    window.PFOverlayLock.remove('basicModal');
  }

  function openModal(modalEl) {
    closeAllModals();
    modalEl.classList.remove('hidden');
    window.PFOverlayLock.add('basicModal');
  }

  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeAllModals();
    });
  });

  document.getElementById('code-modal-close')?.addEventListener('click', closeAllModals);
  document.getElementById('auth-modal-close')?.addEventListener('click', closeAllModals);
  document.getElementById('upload-modal-close')?.addEventListener('click', closeAllModals);
  document.getElementById('upload-cancel-btn')?.addEventListener('click', closeAllModals);

  // Esc key closes modals
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!lightbox.classList.contains('hidden')) {
        closeLightbox();
      } else {
        closeAllModals();
      }
    }
  });

  // ==================== 5. CODE FORMATTING & VERIFICATION ====================
  function formatAccessCode(inputEl) {
    inputEl.addEventListener('input', (e) => {
      let val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (val.length > 4) {
        val = `${val.slice(0, 4)}-${val.slice(4, 8)}`;
      }
      e.target.value = val;
    });
  }

  const inlineCodeInput = document.getElementById('inline-code-input');
  const modalCodeInput = document.getElementById('modal-code-input');
  if (inlineCodeInput) formatAccessCode(inlineCodeInput);
  if (modalCodeInput) formatAccessCode(modalCodeInput);

  async function handleCodeVerification(code, feedbackEl, submitBtn) {
    if (!code || code.trim().length < 4) {
      if (feedbackEl) {
        feedbackEl.classList.remove('hidden');
        feedbackEl.innerHTML = `<h4>CODE NOT FOUND</h4><p>Check the code and try again.</p>`;
      }
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'VERIFYING...';
    }

    try {
      const res = await fetch('/api/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });

      const data = await res.json();

      if (res.ok && data.status === 'valid') {
        closeAllModals();
        openGallery(data.collection);
      } else {
        if (feedbackEl) {
          feedbackEl.classList.remove('hidden');
          const title = data.message || 'CODE NOT FOUND';
          const sub = data.sub || 'Check the code and try again.';
          feedbackEl.innerHTML = `<h4>${title}</h4><p>${sub}</p>`;
        }
      }
    } catch (err) {
      if (feedbackEl) {
        feedbackEl.classList.remove('hidden');
        feedbackEl.innerHTML = `<h4>CONNECTION ERROR</h4><p>Please check your connection and try again.</p>`;
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `VIEW MEMORIES <span>→</span>`;
      }
    }
  }

  // Inline form submit
  document.getElementById('inline-code-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = inlineCodeInput.value.trim();
    const msg = document.getElementById('inline-code-msg');
    const submitBtn = document.getElementById('inline-code-submit');
    handleCodeVerification(code, msg, submitBtn);
  });

  // Modal form submit
  document.getElementById('modal-code-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = modalCodeInput.value.trim();
    const msg = document.getElementById('code-feedback');
    const submitBtn = document.getElementById('modal-code-submit');
    handleCodeVerification(code, msg, submitBtn);
  });

  // Demo code shortcut click in modal
  document.getElementById('demo-code-pill')?.addEventListener('click', () => {
    modalCodeInput.value = 'PX7K-29QM';
    const msg = document.getElementById('code-feedback');
    const submitBtn = document.getElementById('modal-code-submit');
    handleCodeVerification('PX7K-29QM', msg, submitBtn);
  });

  // Demo code shortcut click in inline section / Copy Button
  const copyPillBtn = document.getElementById('inline-copy-demo-btn');
  const copyPillText = document.getElementById('copy-pill-text');
  const copyPillIcon = document.getElementById('copy-pill-icon');

  copyPillBtn?.addEventListener('click', () => {
    navigator.clipboard.writeText('PX7K-29QM');
    if (copyPillBtn && copyPillText && copyPillIcon) {
      copyPillBtn.classList.add('copied');
      copyPillIcon.textContent = '✓';
      copyPillText.textContent = 'COPIED';
      setTimeout(() => {
        copyPillBtn.classList.remove('copied');
        copyPillIcon.textContent = '📋';
        copyPillText.textContent = 'COPY CODE';
      }, 2000);
    }
    if (inlineCodeInput) {
      inlineCodeInput.value = 'PX7K-29QM';
      const msg = document.getElementById('inline-code-msg');
      const submitBtn = document.getElementById('inline-code-submit');
      handleCodeVerification('PX7K-29QM', msg, submitBtn);
    }
  });

  // ==================== TYPEWRITER SEARCH SIMULATION ====================
  const searchQueries = [
    "A photo of us at the beach.",
    "Sunset in Paris.",
    "My dog sleeping on the couch.",
    "Everyone wearing black."
  ];
  let currentQueryIdx = 0;
  let currentCharIdx = 0;
  let isDeleting = false;
  const typewriterEl = document.getElementById('typewriter-text');

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
  const pillarItems = document.querySelectorAll('.pillar-item');
  pillarItems.forEach((item) => {
    item.addEventListener('mouseenter', () => {
      pillarItems.forEach(p => p.classList.remove('active'));
      item.classList.add('active');
    });
    item.addEventListener('click', () => {
      pillarItems.forEach(p => p.classList.remove('active'));
      item.classList.add('active');
    });
  });

  // ==================== STORY TABS SWITCHER ====================
  const storyData = {
    travel: {
      badge: "EXPEDITION & EXPLORATION",
      title: "Uncompressed Road Trips & Scenic Flights",
      desc: "Share breathtaking 4K travel clips and high-res RAW photos with travel companions without WhatsApp compression or social media ads.",
      stat1: "✈️ 100% Original Resolution",
      stat2: "🔒 Direct Code PX7K-29QM"
    },
    weddings: {
      badge: "CEREMONIES & CELEBRATIONS",
      title: "Collect Every Angle From Every Guest",
      desc: "Place stylish QR cards on reception tables. Guests enter one code to upload their spontaneous phone memories and view the official album.",
      stat1: "💍 Zero App Download",
      stat2: "✨ Instant Unified Gallery"
    },
    events: {
      badge: "FESTIVALS & CONFERENCES",
      title: "Live Event Photo Hubs",
      desc: "Instant media distribution for brand activations, concerts, and galas with rapid sub-second access.",
      stat1: "🎉 Real-Time Ingestion",
      stat2: "⚡ Lossless 4K Streaming"
    },
    family: {
      badge: "HERITAGE & GENERATIONS",
      title: "Preserve Milestones In High Definition",
      desc: "Safe from algorithmic feeds and public advertising. A quiet, private haven for family memories.",
      stat1: "🛡️ Private by Design",
      stat2: "📸 Full Exif Metadata"
    },
    creators: {
      badge: "PROFESSIONAL PROOFING",
      title: "Deliver Sleek Client Proofing Galleries",
      desc: "Impress photography clients with a branded private viewing portal and seamless one-click downloads.",
      stat1: "💎 Fast Lossless Delivery",
      stat2: "🚀 Zero Compression Loss"
    }
  };

  const storyTabs = document.querySelectorAll('.story-tab');
  const storyBadgeEl = document.getElementById('story-badge');
  const storyTitleEl = document.getElementById('story-title');
  const storyDescEl = document.getElementById('story-desc');

  storyTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      storyTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
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
  document.getElementById('nav-enter-code-btn')?.addEventListener('click', () => {
    document.getElementById('code-feedback')?.classList.add('hidden');
    if (modalCodeInput) modalCodeInput.value = '';
    openModal(codeModal);
    setTimeout(() => modalCodeInput?.focus(), 150);
  });

  document.getElementById('hero-enter-code-btn')?.addEventListener('click', () => {
    document.getElementById('code-feedback')?.classList.add('hidden');
    if (modalCodeInput) modalCodeInput.value = '';
    openModal(codeModal);
    setTimeout(() => modalCodeInput?.focus(), 150);
  });

  document.getElementById('climax-code-btn')?.addEventListener('click', () => {
    document.getElementById('code-feedback')?.classList.add('hidden');
    if (modalCodeInput) modalCodeInput.value = '';
    openModal(codeModal);
    setTimeout(() => modalCodeInput?.focus(), 150);
  });

  document.getElementById('footer-code-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('code-feedback')?.classList.add('hidden');
    if (modalCodeInput) modalCodeInput.value = '';
    openModal(codeModal);
    setTimeout(() => modalCodeInput?.focus(), 150);
  });

  document.getElementById('hero-upload-btn')?.addEventListener('click', () => {
    if (authToken && currentUser) {
      openDashboard();
      openCreateModal();
    } else {
      openModal(authModal);
    }
  });

  document.getElementById('how-upload-cta')?.addEventListener('click', () => {
    if (authToken && currentUser) {
      openDashboard();
      openCreateModal();
    } else {
      openModal(authModal);
    }
  });

  document.getElementById('climax-upload-btn')?.addEventListener('click', () => {
    if (authToken && currentUser) {
      openDashboard();
      openCreateModal();
    } else {
      openModal(authModal);
    }
  });

  document.getElementById('footer-login-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (authToken && currentUser) {
      openDashboard();
    } else {
      openModal(authModal);
    }
  });

  navAuthBtn?.addEventListener('click', () => openModal(authModal));
  navDashboardBtn?.addEventListener('click', () => openDashboard());
  navLogoutBtn?.addEventListener('click', logout);
  document.getElementById('dashboard-logout-btn')?.addEventListener('click', logout);

  document.getElementById('dashboard-back-home-btn')?.addEventListener('click', () => {
    dashboardView.classList.add('hidden');
    window.PFOverlayLock.remove('dashboard');
  });

  navBrand?.addEventListener('click', () => {
    dashboardView.classList.add('hidden');
    galleryView.classList.add('hidden');
    window.PFOverlayLock.remove('dashboard');
    window.PFOverlayLock.remove('gallery');
    closeAllModals();
    if (lenis) {
      lenis.scrollTo(0);
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  // Smooth scroll for nav anchor links
  document.querySelectorAll('.nav-menu a, .footer-links a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const targetId = link.getAttribute('href');
      if (targetId && targetId.startsWith('#')) {
        e.preventDefault();
        const targetEl = document.querySelector(targetId);
        if (targetEl) {
          if (lenis) {
            lenis.scrollTo(targetEl, { offset: -60 });
          } else {
            targetEl.scrollIntoView({ behavior: 'smooth' });
          }
        }
      }
    });
  });

  // ==================== 7. AUTH TABS & SUBMISSION ====================
  const tabLoginBtn = document.getElementById('tab-login-btn');
  const tabSignupBtn = document.getElementById('tab-signup-btn');
  const loginPanel = document.getElementById('login-panel');
  const signupPanel = document.getElementById('signup-panel');
  const authErrorMsg = document.getElementById('auth-error-msg');

  function showLoginTab() {
    tabLoginBtn.classList.add('active');
    tabSignupBtn.classList.remove('active');
    loginPanel.classList.remove('hidden');
    signupPanel.classList.add('hidden');
    authErrorMsg.classList.add('hidden');
  }

  function showSignupTab() {
    tabSignupBtn.classList.add('active');
    tabLoginBtn.classList.remove('active');
    signupPanel.classList.remove('hidden');
    loginPanel.classList.add('hidden');
    authErrorMsg.classList.add('hidden');
  }

  tabLoginBtn?.addEventListener('click', showLoginTab);
  tabSignupBtn?.addEventListener('click', showSignupTab);
  document.getElementById('switch-to-signup')?.addEventListener('click', (e) => {
    e.preventDefault();
    showSignupTab();
  });
  document.getElementById('switch-to-login')?.addEventListener('click', (e) => {
    e.preventDefault();
    showLoginTab();
  });

  // Quick Demo Login
  document.getElementById('demo-login-fill')?.addEventListener('click', () => {
    document.getElementById('login-email').value = 'alex@photofinder.io';
    document.getElementById('login-password').value = 'demo123';
    document.getElementById('login-form').dispatchEvent(new Event('submit'));
  });

  // Login Submit
  document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    authErrorMsg.classList.add('hidden');
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const submitBtn = document.getElementById('login-submit-btn');

    submitBtn.disabled = true;
    submitBtn.textContent = 'LOGGING IN...';

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (res.ok) {
        authToken = data.token;
        currentUser = data.user;
        localStorage.setItem('pf_token', authToken);
        updateAuthUI();
        closeAllModals();
        openDashboard();
        showToast(`Welcome back, ${currentUser.name}`);
      } else {
        authErrorMsg.textContent = data.error || 'Invalid email or password';
        authErrorMsg.classList.remove('hidden');
      }
    } catch (err) {
      authErrorMsg.textContent = 'Connection error, please try again';
      authErrorMsg.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'LOGIN';
    }
  });

  // Sign Up Submit
  document.getElementById('signup-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    authErrorMsg.classList.add('hidden');
    const name = document.getElementById('signup-name').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const confirmPassword = document.getElementById('signup-confirm-password').value;
    const submitBtn = document.getElementById('signup-submit-btn');

    if (password !== confirmPassword) {
      authErrorMsg.textContent = 'Passwords do not match';
      authErrorMsg.classList.remove('hidden');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'CREATING ACCOUNT...';

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, confirmPassword })
      });
      const data = await res.json();
      if (res.ok) {
        authToken = data.token;
        currentUser = data.user;
        localStorage.setItem('pf_token', authToken);
        updateAuthUI();
        closeAllModals();
        openDashboard();
        showToast(`Account created! Welcome, ${currentUser.name}`);
      } else {
        authErrorMsg.textContent = data.error || 'Failed to create account';
        authErrorMsg.classList.remove('hidden');
      }
    } catch (err) {
      authErrorMsg.textContent = 'Connection error, please try again';
      authErrorMsg.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'CREATE ACCOUNT';
    }
  });

  // ==================== 8. UPLOADER DASHBOARD ====================
  const collectionsGrid = document.getElementById('collections-grid');
  const collectionsBadge = document.getElementById('collections-badge');
  const collectionsEmpty = document.getElementById('collections-empty');

  async function openDashboard() {
    if (!authToken) {
      openModal(authModal);
      return;
    }
    dashboardView.classList.remove('hidden');
    window.PFOverlayLock.add('dashboard');
    await loadCollections();
  }

  async function loadCollections() {
    if (!authToken) return;
    try {
      const res = await fetch('/api/collections', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        renderCollections(data.collections || []);
      }
    } catch (err) {
      console.error('Error fetching collections:', err);
    }
  }

  function renderCollections(cols) {
    if (!collectionsGrid) return;
    collectionsGrid.innerHTML = '';
    collectionsBadge.textContent = `${cols.length} collection${cols.length === 1 ? '' : 's'}`;

    if (cols.length === 0) {
      collectionsEmpty.classList.remove('hidden');
      return;
    }

    collectionsEmpty.classList.add('hidden');

    cols.forEach(col => {
      const card = document.createElement('div');
      card.className = 'collection-card';

      const coverHtml = col.coverUrl
        ? `<div class="card-cover"><img src="${col.coverUrl}" alt="${col.name}" loading="lazy" /></div>`
        : `<div class="card-cover"><div class="card-cover-fallback">📷</div></div>`;

      const photosText = `${col.photosCount} photo${col.photosCount === 1 ? '' : 's'}`;
      const videosText = `${col.videosCount} video${col.videosCount === 1 ? '' : 's'}`;
      const rawDate = col.date || col.createdAt || col.created_at || '';
      const parsedDate = rawDate ? new Date(rawDate) : null;
      const dateText = parsedDate && !isNaN(parsedDate) ? parsedDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : rawDate;
      const statsLine = dateText ? `${photosText} · ${videosText} · ${dateText}` : `${photosText} · ${videosText}`;

      // NOTE: the old access-code / "GET CODE" block that used to live here has been
      // removed — it belonged to the legacy code-share flow and isn't part of the
      // current Find My Photos MVP. `col.accessCode` is still used internally below
      // to open the gallery view; it's just no longer shown as a user-facing feature.
      card.innerHTML = `
        ${coverHtml}
        <div class="card-content">
          <h3 class="card-title">${col.name}</h3>
          <div class="card-stats">${statsLine}</div>
          <div class="card-actions">
            <button class="primary-button view-btn" data-code="${col.accessCode}">VIEW</button>
            <button class="delete-col-btn" data-id="${col.id}" title="Delete collection">🗑</button>
          </div>
        </div>
      `;

      // Event handlers
      card.querySelector('.view-btn').addEventListener('click', () => {
        handleCodeVerification(col.accessCode);
      });

      card.querySelector('.delete-col-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(`Delete "${col.name}"? This action cannot be undone.`)) {
          await deleteCollection(col.id);
        }
      });

      collectionsGrid.appendChild(card);
    });
  }

  async function deleteCollection(id) {
    try {
      const res = await fetch(`/api/collections/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        showToast('Collection deleted');
        await loadCollections();
      } else {
        showToast('Failed to delete collection');
      }
    } catch (e) {
      showToast('Error deleting collection');
    }
  }

  // ==================== 9. DRAG AND DROP & MEDIA UPLOAD ====================
  let selectedFiles = [];
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const selectedFilesContainer = document.getElementById('selected-files-container');
  const filesPreviewGrid = document.getElementById('files-preview-grid');
  const selectedCount = document.getElementById('selected-count');
  const uploadProgressContainer = document.getElementById('upload-progress-container');
  const uploadProgressFill = document.getElementById('upload-progress-fill');
  const uploadProgressLabel = document.getElementById('upload-progress-label');
  const uploadSubmitBtn = document.getElementById('upload-submit-btn');

  function openCreateModal() {
    selectedFiles = [];
    document.getElementById('upload-col-name').value = '';
    renderSelectedFiles();
    uploadProgressContainer.classList.add('hidden');
    uploadProgressFill.style.width = '0%';
    openModal(uploadModal);
  }

  document.getElementById('dash-create-btn')?.addEventListener('click', openCreateModal);
  document.getElementById('empty-create-btn')?.addEventListener('click', openCreateModal);

  document.getElementById('browse-files-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  dropZone?.addEventListener('click', () => fileInput.click());

  dropZone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone?.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });

  dropZone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  });

  fileInput?.addEventListener('change', () => {
    if (fileInput.files) {
      addFiles(Array.from(fileInput.files));
      fileInput.value = '';
    }
  });

  document.getElementById('clear-files-btn')?.addEventListener('click', () => {
    selectedFiles = [];
    renderSelectedFiles();
  });

  function addFiles(newFiles) {
    const validExts = ['.jpg', '.jpeg', '.png', '.webp', '.mp4', '.mov', '.webm'];
    newFiles.forEach(file => {
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      if (validExts.includes(ext)) {
        selectedFiles.push(file);
      }
    });
    renderSelectedFiles();
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function renderSelectedFiles() {
    if (!filesPreviewGrid) return;
    filesPreviewGrid.innerHTML = '';

    if (selectedFiles.length === 0) {
      selectedFilesContainer.classList.add('hidden');
      if (uploadSubmitBtn) uploadSubmitBtn.disabled = true;
      return;
    }

    selectedFilesContainer.classList.remove('hidden');
    selectedCount.textContent = `${selectedFiles.length} file${selectedFiles.length === 1 ? '' : 's'} selected`;
    if (uploadSubmitBtn) uploadSubmitBtn.disabled = false;

    selectedFiles.forEach((file, index) => {
      const card = document.createElement('div');
      // NOTE: these class names must match the .file-preview-item / .file-thumb-box /
      // .file-name-truncate rules in style.css — a prior mismatch here (file-preview-card /
      // file-preview-thumb / file-preview-name) meant every preview card rendered completely
      // unstyled, so newly added photos had no visible size or layout and appeared broken.
      card.className = 'file-preview-item';

      const isVideo = file.type.startsWith('video/') || file.name.endsWith('.mov') || file.name.endsWith('.mp4') || file.name.endsWith('.webm');
      let thumbContent = isVideo ? '<span class="video-badge">▶</span>' : '';

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
          if (thumbEl) thumbEl.innerHTML = `<img src="${e.target.result}" alt="" />`;
        };
        reader.readAsDataURL(file);
      }

      card.querySelector('.file-remove-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        selectedFiles.splice(index, 1);
        renderSelectedFiles();
      });

      filesPreviewGrid.appendChild(card);
    });
  }

  // Submit Upload
  uploadSubmitBtn?.addEventListener('click', () => {
    if (selectedFiles.length === 0) {
      showToast('Please select at least one photo or video');
      return;
    }

    const colName = document.getElementById('upload-col-name').value.trim() || 'Paris Trip — 2026';
    const formData = new FormData();
    formData.append('name', colName);
    selectedFiles.forEach(file => formData.append('files', file));

    uploadProgressContainer.classList.remove('hidden');
    uploadSubmitBtn.disabled = true;

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/collections');
    xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        uploadProgressFill.style.width = `${percent}%`;
        uploadProgressLabel.textContent = `Uploading media... ${percent}%`;
      }
    };

    xhr.onload = () => {
      uploadSubmitBtn.disabled = false;
      if (xhr.status === 201) {
        const data = JSON.parse(xhr.responseText);
        closeAllModals();
        showSuccessModal(data.collection.accessCode, data.collection);
        loadCollections();
      } else {
        showToast('Upload failed: ' + xhr.statusText);
      }
    };

    xhr.onerror = () => {
      uploadSubmitBtn.disabled = false;
      showToast('Network error during upload');
    };

    xhr.send(formData);
  });

  // Success Modal Handling
  let lastCreatedCollection = null;
  function showSuccessModal(code, collection) {
    lastCreatedCollection = collection;
    document.getElementById('generated-code-value').textContent = code;
    openModal(successModal);
  }

  document.getElementById('copy-code-btn')?.addEventListener('click', () => {
    const code = document.getElementById('generated-code-value').textContent;
    navigator.clipboard.writeText(code);
    document.getElementById('copy-text').textContent = 'COPIED!';
    showToast(`Access code copied: ${code}`);
    setTimeout(() => {
      document.getElementById('copy-text').textContent = 'COPY CODE';
    }, 2000);
  });

  document.getElementById('success-done-btn')?.addEventListener('click', () => {
    closeAllModals();
    openDashboard();
  });

  document.getElementById('success-view-btn')?.addEventListener('click', () => {
    closeAllModals();
    const code = document.getElementById('generated-code-value').textContent;
    handleCodeVerification(code);
  });

  // ==================== 10. PRIVATE COLLECTION GALLERY ====================
  let currentGalleryMedia = [];

  function openGallery(collection) {
    currentGalleryMedia = collection.media || [];
    document.getElementById('gallery-title').textContent = collection.name;
    const photos = collection.photosCount || 0;
    const videos = collection.videosCount || 0;
    document.getElementById('gallery-stats').textContent = `${photos} photo${photos === 1 ? '' : 's'} · ${videos} video${videos === 1 ? '' : 's'}`;
    document.getElementById('gallery-code-text').textContent = collection.accessCode;

    const grid = document.getElementById('gallery-grid');
    const empty = document.getElementById('gallery-empty');
    grid.innerHTML = '';

    if (currentGalleryMedia.length === 0) {
      empty.classList.remove('hidden');
    } else {
      empty.classList.add('hidden');

      currentGalleryMedia.forEach((item, index) => {
        const el = document.createElement('div');
        el.className = 'gallery-item';

        if (item.type === 'video') {
          el.innerHTML = `
            <video src="${item.url}" preload="metadata" muted playsinline></video>
            <div class="item-badge">▶ VIDEO</div>
            <div class="gallery-item-overlay">
              <span class="gallery-item-name">${item.filename}</span>
            </div>
          `;
          // Play preview on hover
          const vid = el.querySelector('video');
          el.addEventListener('mouseenter', () => vid.play().catch(() => {}));
          el.addEventListener('mouseleave', () => { vid.pause(); vid.currentTime = 0; });
        } else {
          el.innerHTML = `
            <img src="${item.url}" alt="${item.filename}" loading="lazy" />
            <div class="gallery-item-overlay">
              <span class="gallery-item-name">${item.filename}</span>
            </div>
          `;
        }

        el.addEventListener('click', () => openLightbox(index));
        grid.appendChild(el);
      });
    }

    galleryView.classList.remove('hidden');
    window.PFOverlayLock.add('gallery');
  }

  document.getElementById('gallery-back-btn')?.addEventListener('click', () => {
    galleryView.classList.add('hidden');
    window.PFOverlayLock.remove('gallery');
  });

  document.getElementById('gallery-code-badge')?.addEventListener('click', () => {
    const code = document.getElementById('gallery-code-text').textContent;
    navigator.clipboard.writeText(code);
    showToast(`Code copied: ${code}`);
  });

  // ==================== 11. MEDIA VIEWER / LIGHTBOX ====================
  let activeLightboxIndex = 0;
  const lightboxContent = document.getElementById('lightbox-content');
  const lightboxCounter = document.getElementById('lightbox-counter');
  const lightboxDownloadBtn = document.getElementById('lightbox-download-btn');

  function openLightbox(index) {
    if (!currentGalleryMedia || currentGalleryMedia.length === 0) return;
    activeLightboxIndex = Math.max(0, Math.min(currentGalleryMedia.length - 1, index));
    renderLightboxItem();
    lightbox.classList.remove('hidden');
  }

  function closeLightbox() {
    lightbox.classList.add('hidden');
    const vid = lightboxContent.querySelector('video');
    if (vid) vid.pause();
    lightboxContent.innerHTML = '';
  }

  function renderLightboxItem() {
    const item = currentGalleryMedia[activeLightboxIndex];
    if (!item) return;

    lightboxCounter.textContent = `${activeLightboxIndex + 1} / ${currentGalleryMedia.length}`;
    lightboxDownloadBtn.href = item.url;
    lightboxDownloadBtn.setAttribute('download', item.filename);

    if (item.type === 'video') {
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

  document.getElementById('lightbox-close-btn')?.addEventListener('click', closeLightbox);
  document.getElementById('lightbox-next-btn')?.addEventListener('click', nextLightboxItem);
  document.getElementById('lightbox-prev-btn')?.addEventListener('click', prevLightboxItem);

  lightbox?.addEventListener('click', (e) => {
    if (e.target === lightbox) closeLightbox();
  });

  window.addEventListener('keydown', (e) => {
    if (!lightbox.classList.contains('hidden')) {
      if (e.key === 'ArrowRight') nextLightboxItem();
      if (e.key === 'ArrowLeft') prevLightboxItem();
    }
  });

})();


// ==================== FIND MY PHOTOS FLOW ====================
(() => {
  const modal = document.getElementById('find-photos-modal');
  if (!modal) return;
  const api = window.PhotoFinderApi;
  const steps = {
    event: document.getElementById('find-event-step'), upload: document.getElementById('find-upload-step'),
    processing: document.getElementById('find-processing-step'), results: document.getElementById('find-results-step'), error: document.getElementById('find-error-step')
  };
  const progress = [...modal.querySelectorAll('.find-photos-progress span')];
  const eventsList = document.getElementById('find-events-list');
  const continueBtn = document.getElementById('find-event-continue');
  const input = document.getElementById('face-photo-input');
  const uploadZone = document.getElementById('face-upload-zone');
  const faceSelectedContainer = document.getElementById('face-selected-container');
  const facePreviewGrid = document.getElementById('face-preview-grid');
  const faceSelectedCount = document.getElementById('face-selected-count');
  const faceClearBtn = document.getElementById('face-clear-btn');
  const faceAddMoreBtn = document.getElementById('face-add-more-btn');
  const validation = document.getElementById('face-validation');
  const scanBtn = document.getElementById('scan-photos-btn');
  const status = document.getElementById('scan-status');
  const statusDetail = document.getElementById('scan-status-detail');
  const errorTitle = document.getElementById('find-error-title');
  const errorMessage = document.getElementById('find-error-message');
  const selected = { event: null, files: [], results: [] };
  let scanAbortController;

  function showStep(name) {
    Object.entries(steps).forEach(([key, el]) => el.classList.toggle('hidden', key !== name));
    const active = name === 'event' ? 0 : name === 'upload' ? 1 : name === 'processing' ? 2 : 3;
    progress.forEach((bar, index) => bar.classList.toggle('active', index <= active));
  }
  function openFlow() {
    modal.classList.remove('hidden'); modal.setAttribute('aria-hidden', 'false'); window.PFOverlayLock.add('findPhotos');
    selected.event = null; selected.files = []; selected.results = []; continueBtn.disabled = true; resetUpload(); showStep('event'); loadEvents();
  }
  function closeFlow() { modal.classList.add('hidden'); modal.setAttribute('aria-hidden', 'true'); window.PFOverlayLock.remove('findPhotos'); scanAbortController?.abort(); }
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeFlow(); });
  function setValidation(message) { validation.textContent = message || ''; validation.classList.toggle('hidden', !message); }
  // Resets the whole face-photo selection: clears our own File[] state, re-renders
  // the (now empty) preview grid, and clears the <input>'s value so a file the
  // user removes can be re-selected later (browsers otherwise ignore re-selecting
  // the same path without the value being cleared first).
  function resetUpload() { selected.files = []; input.value = ''; renderFacePreviews(); setValidation(''); }
  function normalizeEvents(payload) { return Array.isArray(payload) ? payload : (payload?.events || payload?.data || []); }
  function loadEvents() {
    eventsList.innerHTML = '<div class="find-state-message">Loading available events…</div>';
    if (!api?.getEvents) { eventsList.innerHTML = '<div class="find-state-message">Event service is not configured yet.</div>'; return; }
    api.getEvents().then(events => {
      const list = normalizeEvents(events);
      if (!list.length) { eventsList.innerHTML = '<div class="find-state-message">No events are available yet.</div>'; return; }
      eventsList.innerHTML = list.map((event, index) => `<button type="button" class="find-event-option" data-event-id="${escapeHtml(event.id ?? event.eventId ?? '')}"><img class="find-event-thumb" src="${escapeHtml(event.thumbnailUrl ?? event.thumbnail ?? '')}" alt="" onerror="this.style.visibility='hidden'"><span class="find-event-copy"><strong>${escapeHtml(event.name ?? event.title ?? 'Untitled event')}</strong><small>${escapeHtml(event.date ?? event.eventDate ?? '')}</small></span><span class="find-event-check">${index === -1 ? '' : '○'}</span></button>`).join('');
      eventsList.querySelectorAll('.find-event-option').forEach(button => button.addEventListener('click', () => {
        eventsList.querySelectorAll('.find-event-option').forEach(item => item.classList.remove('selected'));
        button.classList.add('selected'); button.querySelector('.find-event-check').textContent = '●'; selected.event = button.dataset.eventId; continueBtn.disabled = !selected.event;
      }));
    }).catch(() => { eventsList.innerHTML = '<div class="find-state-message">Unable to load events. Please try again when the backend is available.</div>'; });
  }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char])); }
  const VALID_FACE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const MAX_FACE_SIZE = 10 * 1024 * 1024;
  function formatFaceBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024; const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
  // Adds newly chosen/dropped files to selected.files (does not replace the
  // existing selection), skipping anything invalid and surfacing a single
  // validation message for the batch. Re-selecting the browser's file input
  // itself resets `input.value` right after this runs (see the change
  // listener below), so a removed file can always be picked again.
  function addFaceFiles(fileList) {
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;
    let rejectionMessage = '';
    incoming.forEach(file => {
      if (!VALID_FACE_TYPES.includes(file.type)) { rejectionMessage = 'Please choose JPG, JPEG, PNG or WEBP images.'; return; }
      if (file.size > MAX_FACE_SIZE) { rejectionMessage = 'One of your photos is over 10 MB. Please choose smaller files.'; return; }
      selected.files.push(file);
    });
    setValidation(rejectionMessage);
    renderFacePreviews();
  }
  function removeFaceFile(index) {
    selected.files.splice(index, 1);
    renderFacePreviews();
  }
  // Renders one thumbnail card per selected face photo, reusing the same
  // file-preview-item / file-thumb-box / file-name-truncate / file-remove-btn
  // classes as the event-photo uploader elsewhere on the site, so multi-photo
  // selection looks and behaves consistently across the app.
  function renderFacePreviews() {
    facePreviewGrid.innerHTML = '';
    if (!selected.files.length) {
      faceSelectedContainer.classList.add('hidden');
      scanBtn.disabled = true;
      return;
    }
    faceSelectedContainer.classList.remove('hidden');
    faceSelectedCount.textContent = `${selected.files.length} photo${selected.files.length === 1 ? '' : 's'} selected`;
    scanBtn.disabled = false;
    selected.files.forEach((file, index) => {
      const card = document.createElement('div');
      card.className = 'file-preview-item';
      card.innerHTML = `
        <div class="file-thumb-box" id="face-thumb-${index}"></div>
        <div class="file-name-truncate" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</div>
        <div class="file-preview-size">${formatFaceBytes(file.size)}</div>
        <button type="button" class="file-remove-btn" data-index="${index}" aria-label="Remove ${escapeHtml(file.name)}">×</button>
      `;
      const reader = new FileReader();
      reader.onload = (e) => {
        const thumbEl = card.querySelector(`#face-thumb-${index}`);
        if (thumbEl) thumbEl.innerHTML = `<img src="${e.target.result}" alt="" />`;
      };
      reader.readAsDataURL(file);
      card.querySelector('.file-remove-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        removeFaceFile(index);
      });
      facePreviewGrid.appendChild(card);
    });
  }
  function showError(title, message) { errorTitle.textContent = title; errorMessage.textContent = message; showStep('error'); }
  function friendlyErrorMessage(error) {
    if (error?.name === 'TypeError') return 'Connection failed. Please try again.';
    const status = error?.status;
    if (status === 503 || status === 502 || status === 504) return 'Photo search service is currently unavailable. Please try again.';
    const lower = String(error?.message || '').toLowerCase();
    if (lower.includes('face')) return "Couldn't detect a clear face. Please upload another photo.";
    if (!status) return 'Connection failed. Please try again.';
    return error?.message || 'Please try again.';
  }
  function normalizeResults(payload) { return payload?.photos || payload?.matches || payload?.results || payload?.data?.photos || []; }
  function renderResults(payload) {
    selected.results = normalizeResults(payload); const grid = document.getElementById('matched-photo-grid'); const empty = document.getElementById('find-results-empty');
    grid.innerHTML = ''; document.getElementById('find-results-count').textContent = selected.results.length ? `${selected.results.length} memories matched to this search.` : '';
    if (!selected.results.length) { empty.textContent = "We couldn't find your memories yet. Try uploading a clearer face photo or another photo."; empty.classList.remove('hidden'); document.getElementById('find-results-title').textContent = 'No matching photos found.'; } else { empty.classList.add('hidden'); document.getElementById('find-results-title').textContent = 'We found your photos.'; selected.results.forEach(item => { const url = item.url || item.imageUrl || item.photoUrl; if (!url) return; const button = document.createElement('button'); button.type = 'button'; button.innerHTML = `<img src="${escapeHtml(url)}" alt="${escapeHtml(item.filename || item.name || 'Matched event photo')}" loading="lazy">`; button.addEventListener('click', () => window.open(url, '_blank', 'noopener')); grid.appendChild(button); }); }
    showStep('results');
  }
  function scan() {
    if (!selected.event) return showError('SELECT AN EVENT', 'Choose an event before scanning.');
    if (!selected.files.length) return showError('ADD A FACE PHOTO', 'Please upload at least one clear face photo before scanning.');
    if (!api?.findMyPhotos) return showError('API NOT CONFIGURED', 'The photo matching service has not been configured yet.');
    showStep('processing');
    statusDetail.textContent = 'Your images stay attached to this search only.';
    scanAbortController = new AbortController();
    const total = selected.files.length;

    // With a single selfie there's no per-photo counter to show, so keep the
    // original cinematic rotating status line for that case. With multiple
    // selfies, the real "Scanning photo X of N…" progress is more useful and
    // replaces it.
    let flavorTimer = null;
    if (total > 1) {
      status.textContent = `Scanning photo 1 of ${total}…`;
    } else {
      const flavorPhrases = ['Preparing your photo…', 'Detecting your face…', 'Creating your face signature…', 'Searching event memories…', 'Finding your moments…'];
      let flavorIndex = 0;
      status.textContent = flavorPhrases[0];
      flavorTimer = setInterval(() => { flavorIndex = Math.min(flavorIndex + 1, flavorPhrases.length - 1); status.textContent = flavorPhrases[flavorIndex]; }, 1100);
    }

    // Merge matches from every selfie into one map, deduplicated by photo id
    // (falling back to url/storage_path when no id is present) and keeping
    // whichever pass returned the higher similarity score for that photo.
    const mergedMatches = new Map();
    function mergeMatches(list) {
      (list || []).forEach(item => {
        const urlKey = item.url || item.imageUrl || item.photoUrl || item.storage_path || item.storagePath || '';
        const key = item.id != null ? `id:${item.id}` : (urlKey ? `url:${urlKey}` : null);
        if (!key) return;
        const similarity = typeof item.similarity === 'number' ? item.similarity : (typeof item.score === 'number' ? item.score : 0);
        const existing = mergedMatches.get(key);
        if (!existing) { mergedMatches.set(key, item); return; }
        const existingSimilarity = typeof existing.similarity === 'number' ? existing.similarity : (typeof existing.score === 'number' ? existing.score : 0);
        if (similarity > existingSimilarity) mergedMatches.set(key, item);
      });
    }

    let succeededCount = 0;
    let lastError = null;

    async function runSequential() {
      try {
        for (let i = 0; i < total; i++) {
          if (scanAbortController.signal.aborted) return;
          if (total > 1) status.textContent = `Scanning photo ${i + 1} of ${total}…`;
          try {
            const payload = await api.findMyPhotos(selected.event, selected.files[i], scanAbortController.signal);
            mergeMatches(normalizeResults(payload));
            succeededCount++;
          } catch (error) {
            if (error.name === 'AbortError') return;
            // Keep going — a single failed selfie shouldn't stop the rest from
            // being searched. We only surface an error if NONE of them worked.
            lastError = error;
          }
        }
        if (scanAbortController.signal.aborted) return;
        if (total > 1) status.textContent = 'Finding your memories…';
        if (succeededCount === 0 && lastError) {
          showError('WE COULDN’T COMPLETE THE SEARCH', friendlyErrorMessage(lastError));
          return;
        }
        renderResults({ photos: [...mergedMatches.values()] });
      } finally {
        if (flavorTimer) clearInterval(flavorTimer);
      }
    }

    runSequential();
  }
  document.getElementById('nav-find-photos-btn')?.addEventListener('click', openFlow); document.getElementById('climax-find-photos-btn')?.addEventListener('click', openFlow); document.getElementById('footer-find-photos-btn')?.addEventListener('click', e => { e.preventDefault(); openFlow(); }); document.getElementById('hero-find-photos-btn')?.addEventListener('click', openFlow); document.getElementById('find-photos-close')?.addEventListener('click', closeFlow); document.getElementById('find-results-close-btn')?.addEventListener('click', closeFlow); document.getElementById('find-event-continue')?.addEventListener('click', () => showStep('upload')); document.getElementById('face-back-btn')?.addEventListener('click', () => showStep('event')); document.getElementById('face-browse-btn')?.addEventListener('click', e => { e.stopPropagation(); input.click(); }); uploadZone?.addEventListener('click', () => input.click()); uploadZone?.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') input.click(); }); uploadZone?.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('dragging'); }); uploadZone?.addEventListener('dragleave', () => uploadZone.classList.remove('dragging')); uploadZone?.addEventListener('drop', e => { e.preventDefault(); uploadZone.classList.remove('dragging'); addFaceFiles(e.dataTransfer.files); }); input?.addEventListener('change', () => { addFaceFiles(input.files); input.value = ''; }); faceAddMoreBtn?.addEventListener('click', e => { e.stopPropagation(); input.click(); }); faceClearBtn?.addEventListener('click', () => { selected.files = []; input.value = ''; renderFacePreviews(); }); scanBtn?.addEventListener('click', scan); document.getElementById('find-again-btn')?.addEventListener('click', () => { resetUpload(); showStep('upload'); }); document.getElementById('find-retry-btn')?.addEventListener('click', scan); document.getElementById('find-error-back-btn')?.addEventListener('click', () => showStep(selected.event ? 'upload' : 'event')); modal.addEventListener('click', e => { if (e.target === modal) closeFlow(); });
})();