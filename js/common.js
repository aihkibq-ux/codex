/**
 * common.js
 * Shared UI effects: particles, cursor glow, card reveal.
 */

(() => {
  const canvas = document.getElementById("particles-canvas");
  const ctx = canvas ? canvas.getContext("2d") : null;
  const cursorGlow = document.getElementById("cursorGlow");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let width = window.innerWidth;
  let height = window.innerHeight;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let rafId = null;
  let resizeTimer = null;
  let mouseRaf = null;

  let mouseX = 0;
  let mouseY = 0;
  let targetMouseX = 0;
  let targetMouseY = 0;
  let speedMultiplier = 1;
  let targetSpeedMultiplier = 1;

  let particleCount = width < 768 ? 200 : 600;
  let particles = [];
  let drawPool = [];

  const colors = [
    "rgba(0, 255, 255, 1)",
    "rgba(77, 159, 255, 0.9)",
    "rgba(224, 64, 251, 0.85)",
    "rgba(255, 64, 129, 0.8)",
    "rgba(255, 255, 255, 0.6)",
  ];

  const bucketArrays = Object.fromEntries(colors.map((c) => [c, []]));
  const bucketCounts = Object.fromEntries(colors.map((c) => [c, 0]));

  class Particle {
    constructor() {
      this.spawn(false);
    }

    spawn(respawn) {
      this.x = (Math.random() - 0.5) * width * (respawn ? 1.5 : 2) + width / 2;
      this.y = (Math.random() - 0.5) * height * (respawn ? 1.5 : 2) + height / 2;
      this.z = respawn ? 2000 + Math.random() * 500 : Math.random() * 2000 + 100;
      this.size = Math.random() * 1.5 + 0.5;
      this.color = colors[Math.floor(Math.random() * colors.length)];
      this.baseVz = Math.random() * -3 - 0.5;
      this.vx = (Math.random() - 0.5) * 0.5;
      this.vy = (Math.random() - 0.5) * 0.5;
    }

    update() {
      this.x += this.vx;
      this.y += this.vy;
      this.z += this.baseVz * speedMultiplier;

      if (
        this.z < 1 ||
        this.x < -width ||
        this.x > width * 2 ||
        this.y < -height ||
        this.y > height * 2
      ) {
        this.spawn(true);
      }
    }

    getDrawData(out) {
      const fov = 300;
      const perspective = fov / (fov + this.z);
      const parallaxX = mouseX * (1000 / this.z) * 0.2;
      const parallaxY = mouseY * (1000 / this.z) * 0.2;
      out.px = (this.x - width / 2) * perspective + width / 2 + parallaxX;
      out.py = (this.y - height / 2) * perspective + height / 2 + parallaxY;
      out.pSize = this.size * perspective * 2;
      out.opacity = Math.min(1, Math.max(0, 1 - this.z / 1500));
      out.color = this.color;
      return out;
    }
  }

  function resetCanvasSize() {
    width = window.innerWidth;
    height = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);

    if (!canvas || !ctx) return;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function resetParticlePool() {
    particleCount = width < 768 ? 200 : 600;
    particles = Array.from({ length: particleCount }, () => new Particle());
    drawPool = Array.from({ length: particleCount }, () => ({
      px: 0,
      py: 0,
      pSize: 0,
      opacity: 0,
      color: "",
    }));

    colors.forEach((color) => {
      bucketArrays[color] = Array(particleCount);
      bucketCounts[color] = 0;
    });
  }

  function animateParticles() {
    if (!ctx || reducedMotion.matches) return;

    ctx.clearRect(0, 0, width, height);
    mouseX += (targetMouseX - mouseX) * 0.05;
    mouseY += (targetMouseY - mouseY) * 0.05;
    speedMultiplier += (targetSpeedMultiplier - speedMultiplier) * 0.08;

    colors.forEach((c) => {
      bucketCounts[c] = 0;
    });

    for (let i = 0; i < particleCount; i++) {
      particles[i].update();
      const draw = particles[i].getDrawData(drawPool[i]);
      const c = draw.color;
      bucketArrays[c][bucketCounts[c]++] = draw;
    }

    for (let i = 0; i < colors.length; i++) {
      const color = colors[i];
      const count = bucketCounts[color];
      if (count === 0) continue;
      ctx.fillStyle = color;

      for (let j = 0; j < count; j++) {
        const d = bucketArrays[color][j];
        ctx.globalAlpha = d.opacity;
        ctx.beginPath();
        ctx.arc(d.px, d.py, d.pSize, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.globalAlpha = 1;
    rafId = requestAnimationFrame(animateParticles);
  }

  function stopParticles() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function startParticles() {
    if (!ctx || reducedMotion.matches || rafId) return;
    animateParticles();
  }

  function onResize() {
    stopParticles();
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resetCanvasSize();
      resetParticlePool();
      startParticles();
    }, 300);
  }

  function onVisibilityChange() {
    if (document.hidden) {
      stopParticles();
    } else {
      startParticles();
    }
  }

  function onPointerMove(clientX, clientY) {
    targetMouseX = (clientX - width / 2) * 2;
    targetMouseY = (clientY - height / 2) * 2;

    if (mouseRaf) return;
    mouseRaf = requestAnimationFrame(() => {
      if (cursorGlow) {
        cursorGlow.style.transform = `translate(${clientX - 300}px, ${clientY - 300}px)`;
      }
      mouseRaf = null;
    });
  }

  window.addEventListener("resize", onResize, { passive: true });
  document.addEventListener("visibilitychange", onVisibilityChange);
  document.addEventListener("mousemove", (e) => onPointerMove(e.clientX, e.clientY), { passive: true });
  document.addEventListener(
    "touchmove",
    (e) => {
      const touch = e.touches && e.touches[0];
      if (touch) onPointerMove(touch.clientX, touch.clientY);
    },
    { passive: true },
  );

  window.addEventListener("mousedown", () => {
    targetSpeedMultiplier = 20;
  });
  window.addEventListener("mouseup", () => {
    targetSpeedMultiplier = 1;
  });
  window.addEventListener("mouseleave", () => {
    targetSpeedMultiplier = 1;
  });
  window.addEventListener("touchstart", () => {
    targetSpeedMultiplier = 20;
  });
  window.addEventListener("touchend", () => {
    targetSpeedMultiplier = 1;
  });

  if (reducedMotion.matches && canvas) {
    canvas.style.display = "none";
  } else {
    resetCanvasSize();
    resetParticlePool();
    startParticles();
  }

  if (typeof reducedMotion.addEventListener === "function") {
    reducedMotion.addEventListener("change", () => {
      if (reducedMotion.matches) {
        stopParticles();
        if (canvas) canvas.style.display = "none";
      } else {
        if (canvas) canvas.style.display = "";
        resetCanvasSize();
        resetParticlePool();
        startParticles();
      }
    });
  }

  function initBlogCardReveal() {
    const blogCards = document.querySelectorAll(".blog-card");
    if (blogCards.length === 0) return;

    if (!("IntersectionObserver" in window) || reducedMotion.matches) {
      blogCards.forEach((card) => card.classList.add("visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const card = entry.target;
          const siblings = [...card.parentElement.children];
          const idx = siblings.indexOf(card);
          setTimeout(() => card.classList.add("visible"), idx * 80);
          observer.unobserve(card);
        });
      },
      { threshold: 0.1 },
    );

    blogCards.forEach((card) => observer.observe(card));
  }

  document.addEventListener("mousedown", (e) => {
    if (!e.target.closest(".post-content")) {
      window.getSelection()?.removeAllRanges();
    }
  });

  window.initBlogCardReveal = initBlogCardReveal;
})();
