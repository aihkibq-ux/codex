/**
 * common.js - shared interaction logic
 */

const canvas = document.getElementById("particles-canvas");
const ctx = canvas ? canvas.getContext("2d", { alpha: true }) : null;
const cursorGlow = document.getElementById("cursorGlow");
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

let width = window.innerWidth;
let height = window.innerHeight;
let particleCount = window.innerWidth < 768 ? 120 : 350;
let particles = [];
let drawPool = [];
let rafId = null;
let resizeTimer = null;
let mouseAF = null;
let mouseX = 0;
let mouseY = 0;
let targetMouseX = 0;
let targetMouseY = 0;
let targetSpeedMultiplier = 1;
let speedMultiplier = 1;
let revealObserver = null;

const colors = [
  "rgba(0, 255, 255, 1)",
  "rgba(77, 159, 255, 0.9)",
  "rgba(224, 64, 251, 0.85)",
  "rgba(255, 64, 129, 0.8)",
  "rgba(255, 255, 255, 0.6)",
];
const bucketArrays = Object.create(null);
const bucketCounts = Object.create(null);

function readStoredList(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch (error) {
    return [];
  }
}

function writeStoredList(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    return false;
  }
}

window.SiteStore = {
  readList: readStoredList,
  writeList: writeStoredList,
  updateList(key, updater) {
    const next = updater(readStoredList(key).slice());
    writeStoredList(key, next);
    return next;
  },
};

function syncParticleBuffers() {
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

function resizeCanvas() {
  width = window.innerWidth;
  height = window.innerHeight;

  if (!ctx || !canvas) {
    return;
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function updateParticleCount() {
  const nextCount = window.innerWidth < 768 ? 120 : 350;
  if (nextCount === particleCount && drawPool.length) {
    return false;
  }

  particleCount = nextCount;
  syncParticleBuffers();
  return true;
}

class Particle {
  constructor() {
    this.spawn(false);
  }

  spawn(isRespawn) {
    this.x =
      (Math.random() - 0.5) * width * (isRespawn ? 1.5 : 2) + width / 2;
    this.y =
      (Math.random() - 0.5) * height * (isRespawn ? 1.5 : 2) + height / 2;
    this.z = isRespawn
      ? 2000 + Math.random() * 500
      : Math.random() * 2000 + 100;
    this.size = Math.random() * 1.5 + 0.5;
    this.color = colors[Math.floor(Math.random() * colors.length)];
    this.baseVz = Math.random() * -3 - 0.5;
    this.vx = (Math.random() - 0.5) * 0.5;
    this.vy = (Math.random() - 0.5) * 0.5;
    this.vz = this.baseVz;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.z += this.vz * speedMultiplier;

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

function initParticles() {
  particles = Array.from({ length: particleCount }, () => new Particle());
}

function shouldAnimateParticles() {
  return Boolean(ctx) && !document.hidden && !reducedMotionQuery.matches;
}

function stopParticles() {
  if (!rafId) {
    return;
  }

  cancelAnimationFrame(rafId);
  rafId = null;
}

function animateParticles() {
  if (!ctx || !shouldAnimateParticles()) {
    rafId = null;
    return;
  }

  ctx.clearRect(0, 0, width, height);
  mouseX += (targetMouseX - mouseX) * 0.05;
  mouseY += (targetMouseY - mouseY) * 0.05;
  speedMultiplier += (targetSpeedMultiplier - speedMultiplier) * 0.08;

  colors.forEach((color) => {
    bucketCounts[color] = 0;
  });

  for (let index = 0; index < particleCount; index += 1) {
    const particle = particles[index];
    particle.update();
    const drawData = particle.getDrawData(drawPool[index]);
    const color = drawData.color;
    bucketArrays[color][bucketCounts[color]] = drawData;
    bucketCounts[color] += 1;
  }

  for (let index = 0; index < colors.length; index += 1) {
    const color = colors[index];
    const count = bucketCounts[color];
    if (!count) {
      continue;
    }

    ctx.fillStyle = color;

    for (let bucketIndex = 0; bucketIndex < count; bucketIndex += 1) {
      const drawData = bucketArrays[color][bucketIndex];
      const size = drawData.pSize * 2;
      ctx.globalAlpha = drawData.opacity;
      ctx.fillRect(
        drawData.px - drawData.pSize,
        drawData.py - drawData.pSize,
        size,
        size,
      );
    }
  }

  ctx.globalAlpha = 1;
  rafId = requestAnimationFrame(animateParticles);
}

function startParticles() {
  if (!shouldAnimateParticles() || rafId) {
    return;
  }

  if (!drawPool.length) {
    syncParticleBuffers();
  }
  if (particles.length !== particleCount) {
    initParticles();
  }

  animateParticles();
}

function handleResize() {
  stopParticles();

  if (resizeTimer) {
    clearTimeout(resizeTimer);
  }

  resizeTimer = setTimeout(() => {
    resizeCanvas();
    updateParticleCount();
    initParticles();
    startParticles();
  }, 300);
}

function handleMotionPreferenceChange() {
  if (shouldAnimateParticles()) {
    startParticles();
    return;
  }

  stopParticles();
  if (ctx) {
    ctx.clearRect(0, 0, width, height);
  }
}

function handlePointerMove(event) {
  const clientX = event.clientX;
  const clientY = event.clientY;

  targetMouseX = (clientX - width / 2) * 2;
  targetMouseY = (clientY - height / 2) * 2;

  if (!cursorGlow || mouseAF) {
    return;
  }

  mouseAF = requestAnimationFrame(() => {
    cursorGlow.style.transform = `translate(${clientX - 200}px, ${clientY - 200}px)`;
    mouseAF = null;
  });
}

function setWarpSpeed(value) {
  targetSpeedMultiplier = value;
}

function initBlogCardReveal() {
  const blogCards = document.querySelectorAll(".blog-card:not(.visible)");
  if (!blogCards.length) {
    return;
  }

  if (!("IntersectionObserver" in window)) {
    blogCards.forEach((card) => card.classList.add("visible"));
    return;
  }

  if (!revealObserver) {
    revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          entry.target.classList.add("visible");
          revealObserver.unobserve(entry.target);
        });
      },
      { threshold: 0.1 },
    );
  }

  blogCards.forEach((card, index) => {
    card.style.transitionDelay = `${index * 80}ms`;
    revealObserver.observe(card);
  });
}

function shouldHandleInternalLink(link, event) {
  if (
    !link.href ||
    link.target === "_blank" ||
    link.hasAttribute("download") ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    event.button !== 0
  ) {
    return false;
  }

  const url = new URL(link.href, window.location.href);
  if (url.origin !== window.location.origin) {
    return false;
  }

  if (
    url.pathname === window.location.pathname &&
    url.search === window.location.search &&
    url.hash !== window.location.hash
  ) {
    return false;
  }

  return true;
}

function preloadBlogCard(link) {
  if (!link || link.dataset.preloaded || !window.NotionAPI?.getPost) {
    return;
  }

  const url = new URL(link.href, window.location.href);
  const id = url.searchParams.get("id");
  if (!id) {
    return;
  }

  link.dataset.preloaded = "true";
  window.NotionAPI.getPost(id).catch(() => {});
}

window.initBlogCardReveal = initBlogCardReveal;

resizeCanvas();
updateParticleCount();
initParticles();
startParticles();

window.addEventListener("resize", handleResize, { passive: true });
window.addEventListener("mousedown", () => setWarpSpeed(20), { passive: true });
window.addEventListener("mouseup", () => setWarpSpeed(1), { passive: true });
window.addEventListener("mouseleave", () => setWarpSpeed(1), { passive: true });
window.addEventListener("touchstart", () => setWarpSpeed(20), { passive: true });
window.addEventListener("touchend", () => setWarpSpeed(1), { passive: true });
document.addEventListener("visibilitychange", handleMotionPreferenceChange);
document.addEventListener("mousemove", handlePointerMove, { passive: true });
document.addEventListener("mousedown", (event) => {
  if (!event.target.closest(".post-content")) {
    window.getSelection()?.removeAllRanges();
  }
});

if (typeof reducedMotionQuery.addEventListener === "function") {
  reducedMotionQuery.addEventListener("change", handleMotionPreferenceChange);
} else if (typeof reducedMotionQuery.addListener === "function") {
  reducedMotionQuery.addListener(handleMotionPreferenceChange);
}

document.addEventListener("DOMContentLoaded", () => {
  document.body.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (!link || !shouldHandleInternalLink(link, event)) {
      return;
    }

    event.preventDefault();
    const wrapper = document.getElementById("pageWrapper");
    if (wrapper) {
      wrapper.classList.add("page-fade-out");
    } else {
      document.body.classList.add("page-fade-out");
    }

    window.setTimeout(() => {
      window.location.href = link.href;
    }, 200);
  });

  document.body.addEventListener("mouseover", (event) => {
    const card = event.target.closest("a.blog-card");
    if (card) {
      preloadBlogCard(card);
    }
  });

  document.body.addEventListener("focusin", (event) => {
    const card = event.target.closest("a.blog-card");
    if (card) {
      preloadBlogCard(card);
    }
  });
});

window.addEventListener("pageshow", () => {
  const wrapper = document.getElementById("pageWrapper");
  if (wrapper) {
    wrapper.classList.remove("page-fade-out");
  }
  document.body.classList.remove("page-fade-out");
  startParticles();
});
