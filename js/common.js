/**
 * common.js - shared interactions
 * Particles, cursor glow, card reveal, Swup init
 */

(function () {
  const existing = window.__commonState;
  if (existing && typeof existing.refresh === "function") {
    existing.refresh();
    return;
  }

  const state = {
    canvas: null,
    ctx: null,
    width: 0,
    height: 0,
    particles: [],
    rafId: null,
    mouseX: 0,
    mouseY: 0,
    targetMouseX: 0,
    targetMouseY: 0,
    particleCount: window.innerWidth < 768 ? 200 : 600,
    colors: [
      "rgba(0, 255, 255, 1)",
      "rgba(77, 159, 255, 0.9)",
      "rgba(224, 64, 251, 0.85)",
      "rgba(255, 64, 129, 0.8)",
      "rgba(255, 255, 255, 0.6)",
    ],
    drawPool: [],
    bucketKeys: [],
    bucketArrays: {},
    bucketCounts: {},
    speedMultiplier: 1,
    targetSpeedMultiplier: 1,
    resizeTimer: null,
    cursorGlow: null,
    mouseAF: null,
  };

  function bindElements() {
    const newCanvas = document.getElementById("particles-canvas");
    const canvasChanged = newCanvas !== state.canvas;
    state.canvas = newCanvas;
    state.ctx = state.canvas ? state.canvas.getContext("2d") : null;
    state.cursorGlow = document.getElementById("cursorGlow");
    return canvasChanged;
  }

  function resize() {
    state.width = window.innerWidth;
    state.height = window.innerHeight;
    if (state.canvas) {
      state.canvas.width = state.width;
      state.canvas.height = state.height;
    }
  }

  class Particle {
    constructor() {
      this.spawn(false);
    }

    spawn(isRespawn) {
      this.x =
        (Math.random() - 0.5) * state.width * (isRespawn ? 1.5 : 2) +
        state.width / 2;
      this.y =
        (Math.random() - 0.5) * state.height * (isRespawn ? 1.5 : 2) +
        state.height / 2;
      this.z = isRespawn
        ? 2000 + Math.random() * 500
        : Math.random() * 2000 + 100;
      this.size = Math.random() * 1.5 + 0.5;
      this.color =
        state.colors[Math.floor(Math.random() * state.colors.length)];
      this.baseVz = Math.random() * -3 - 0.5;
      this.vx = (Math.random() - 0.5) * 0.5;
      this.vy = (Math.random() - 0.5) * 0.5;
      this.vz = this.baseVz;
    }

    update() {
      this.x += this.vx;
      this.y += this.vy;
      this.z += this.vz * state.speedMultiplier;
      if (
        this.z < 1 ||
        this.x < -state.width ||
        this.x > state.width * 2 ||
        this.y < -state.height ||
        this.y > state.height * 2
      ) {
        this.spawn(true);
      }
    }

    getDrawData(out) {
      const fov = 300;
      const perspective = fov / (fov + this.z);
      const parallaxX = state.mouseX * (1000 / this.z) * 0.2;
      const parallaxY = state.mouseY * (1000 / this.z) * 0.2;
      out.px =
        (this.x - state.width / 2) * perspective +
        state.width / 2 +
        parallaxX;
      out.py =
        (this.y - state.height / 2) * perspective +
        state.height / 2 +
        parallaxY;
      out.pSize = this.size * perspective * 2;
      out.opacity = Math.min(1, Math.max(0, 1 - this.z / 1500));
      out.color = this.color;
      return out;
    }
  }

  function rebuildDrawPools() {
    state.drawPool = Array.from({ length: state.particleCount }, () => ({
      px: 0,
      py: 0,
      pSize: 0,
      opacity: 0,
      color: "",
    }));

    state.bucketKeys = state.colors.slice();
    state.bucketArrays = {};
    state.bucketCounts = {};
    state.bucketKeys.forEach((c) => {
      state.bucketArrays[c] = Array(state.particleCount);
      state.bucketCounts[c] = 0;
    });
  }

  function initParticles() {
    state.particles = [];
    for (let i = 0; i < state.particleCount; i++) {
      state.particles.push(new Particle());
    }
  }

  function animateParticles() {
    if (!state.ctx || !state.canvas) {
      state.rafId = null;
      return;
    }
    state.ctx.clearRect(0, 0, state.width, state.height);
    state.mouseX += (state.targetMouseX - state.mouseX) * 0.05;
    state.mouseY += (state.targetMouseY - state.mouseY) * 0.05;
    state.speedMultiplier +=
      (state.targetSpeedMultiplier - state.speedMultiplier) * 0.08;

    state.bucketKeys.forEach((c) => (state.bucketCounts[c] = 0));

    for (let i = 0; i < state.particleCount; i++) {
      state.particles[i].update();
      const d = state.particles[i].getDrawData(state.drawPool[i]);
      const c = d.color;
      state.bucketArrays[c][state.bucketCounts[c]++] = d;
    }

    for (let i = 0; i < state.bucketKeys.length; i++) {
      const color = state.bucketKeys[i];
      const count = state.bucketCounts[color];
      if (count === 0) continue;

      state.ctx.fillStyle = color;

      for (let j = 0; j < count; j++) {
        const d = state.bucketArrays[color][j];
        state.ctx.globalAlpha = d.opacity;
        state.ctx.beginPath();
        state.ctx.arc(d.px, d.py, d.pSize, 0, Math.PI * 2);
        state.ctx.fill();
      }
    }
    state.ctx.globalAlpha = 1;
    state.rafId = requestAnimationFrame(animateParticles);
  }

  function startParticles() {
    if (state.rafId || !state.ctx) return;
    state.rafId = requestAnimationFrame(animateParticles);
  }

  function stopParticles() {
    if (!state.rafId) return;
    cancelAnimationFrame(state.rafId);
    state.rafId = null;
  }

  function updateParticleCount() {
    const newCount = window.innerWidth < 768 ? 200 : 600;
    if (newCount === state.particleCount) return;
    state.particleCount = newCount;
    rebuildDrawPools();
  }

  state.refresh = function refresh() {
    const canvasChanged = bindElements();
    if (!state.canvas || !state.ctx) {
      stopParticles();
      return;
    }
    resize();
    if (canvasChanged) {
      updateParticleCount();
      initParticles();
    }
    if (!state.rafId) startParticles();
  };

  rebuildDrawPools();
  bindElements();
  resize();
  initParticles();
  startParticles();

  window.addEventListener("resize", () => {
    if (state.rafId) {
      cancelAnimationFrame(state.rafId);
      state.rafId = null;
    }
    if (state.resizeTimer) clearTimeout(state.resizeTimer);
    state.resizeTimer = setTimeout(() => {
      resize();
      updateParticleCount();
      initParticles();
      startParticles();
    }, 300);
  });

  window.addEventListener("mousedown", () => (state.targetSpeedMultiplier = 20));
  window.addEventListener("mouseup", () => (state.targetSpeedMultiplier = 1));
  window.addEventListener("mouseleave", () => (state.targetSpeedMultiplier = 1));
  window.addEventListener("touchstart", () => (state.targetSpeedMultiplier = 20));
  window.addEventListener("touchend", () => (state.targetSpeedMultiplier = 1));

  document.addEventListener("mousemove", (e) => {
    const clientX = e.clientX;
    const clientY = e.clientY;

    state.targetMouseX = (clientX - state.width / 2) * 2;
    state.targetMouseY = (clientY - state.height / 2) * 2;

    if (state.mouseAF) return;
    state.mouseAF = requestAnimationFrame(() => {
      if (state.cursorGlow) {
        state.cursorGlow.style.transform = `translate(${clientX - 300}px, ${clientY - 300}px)`;
      }
      state.mouseAF = null;
    });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopParticles();
    else startParticles();
  });

  function initBlogCardReveal() {
    const blogCards = document.querySelectorAll(".blog-card");
    if (blogCards.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const card = entry.target;
            const siblings = [...card.parentElement.children];
            const i = siblings.indexOf(card);
            setTimeout(() => card.classList.add("visible"), i * 80);
            observer.unobserve(card);
          }
        });
      },
      { threshold: 0.1 },
    );
    blogCards.forEach((el) => observer.observe(el));
  }

  window.initBlogCardReveal = initBlogCardReveal;

  document.addEventListener("mousedown", (e) => {
    if (!e.target.closest(".post-content")) {
      window.getSelection()?.removeAllRanges();
    }
  });

  if (
    typeof Swup !== "undefined" &&
    typeof SwupScriptsPlugin !== "undefined" &&
    !window.__swupInitialized
  ) {
    window.swup = new Swup({
      animationSelector: '[class*="transition-"]',
      containers: ["#swup"],
      plugins: [
        new SwupScriptsPlugin({
          head: true,
          body: true,
        }),
      ],
    });
    window.__swupInitialized = true;

    window.swup.hooks.on("page:view", () => {
      if (typeof window.initBlogCardReveal === "function") {
        window.initBlogCardReveal();
      }
      if (window.__commonState && typeof window.__commonState.refresh === "function") {
        window.__commonState.refresh();
      }
    });
  }

  window.__commonState = state;
})();
