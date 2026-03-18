/**
 * common.js - shared interaction logic
 */

const canvas = document.getElementById("particles-canvas");
const ctx = canvas ? canvas.getContext("2d") : null;
const cursorGlow = document.getElementById("cursorGlow");
const reducedMotionQuery =
  typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };

let width;
let height;
let particles = [];
let rafId = null;
let mouseX = 0;
let mouseY = 0;
let targetMouseX = 0;
let targetMouseY = 0;
let particleCount = window.innerWidth < 768 ? 120 : 350;
let speedMultiplier = 1;
let targetSpeedMultiplier = 1;
let mouseAF = null;
let resizeTimer = null;
let revealObserver = null;

const colors = [
  "rgba(0, 255, 255, 1)",
  "rgba(77, 159, 255, 0.9)",
  "rgba(224, 64, 251, 0.85)",
  "rgba(255, 64, 129, 0.8)",
  "rgba(255, 255, 255, 0.6)",
];

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
};

function resize() {
  width = window.innerWidth;
  height = window.innerHeight;
  if (!canvas) {
    return;
  }

  canvas.width = width;
  canvas.height = height;
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

  draw() {
    if (!ctx) {
      return;
    }

    const fov = 300;
    const perspective = fov / (fov + this.z);
    const px =
      (this.x - width / 2) * perspective +
      width / 2 +
      mouseX * (1000 / this.z) * 0.2;
    const py =
      (this.y - height / 2) * perspective +
      height / 2 +
      mouseY * (1000 / this.z) * 0.2;
    const pSize = this.size * perspective * 2;
    const opacity = Math.min(1, Math.max(0, 1 - this.z / 1500));

    ctx.fillStyle = this.color;
    ctx.globalAlpha = opacity;
    ctx.fillRect(px - pSize, py - pSize, pSize * 2, pSize * 2);
  }
}

function initParticles() {
  particles = [];
  for (let index = 0; index < particleCount; index += 1) {
    particles.push(new Particle());
  }
}

function stopParticles() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

function animateParticles() {
  if (!ctx || document.hidden) {
    rafId = null;
    return;
  }

  ctx.clearRect(0, 0, width, height);
  mouseX += (targetMouseX - mouseX) * 0.05;
  mouseY += (targetMouseY - mouseY) * 0.05;
  speedMultiplier += (targetSpeedMultiplier - speedMultiplier) * 0.08;

  for (let index = 0; index < particleCount; index += 1) {
    particles[index].update();
    particles[index].draw();
  }

  ctx.globalAlpha = 1;
  rafId = requestAnimationFrame(animateParticles);
}

function startParticles() {
  if (!ctx || rafId) {
    return;
  }

  animateParticles();
}

window.addEventListener(
  "resize",
  () => {
    stopParticles();
    if (resizeTimer) {
      clearTimeout(resizeTimer);
    }

    resizeTimer = setTimeout(() => {
      resize();
      const nextCount = window.innerWidth < 768 ? 120 : 350;
      if (nextCount !== particleCount) {
        particleCount = nextCount;
      }
      initParticles();
      startParticles();
    }, 300);
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
window.addEventListener(
  "touchstart",
  () => {
    targetSpeedMultiplier = 20;
  },
  { passive: true },
);
window.addEventListener(
  "touchend",
  () => {
    targetSpeedMultiplier = 1;
  },
  { passive: true },
);

resize();
initParticles();
startParticles();

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopParticles();
  } else if (ctx && !rafId) {
    startParticles();
  }
});

document.addEventListener(
  "mousemove",
  (event) => {
    const clientX = event.clientX;
    const clientY = event.clientY;

    targetMouseX = (clientX - width / 2) * 2;
    targetMouseY = (clientY - height / 2) * 2;

    if (mouseAF) {
      return;
    }

    mouseAF = requestAnimationFrame(() => {
      if (cursorGlow) {
        cursorGlow.style.transform =
          "translate(" + (clientX - 200) + "px, " + (clientY - 200) + "px)";
      }
      mouseAF = null;
    });
  },
  { passive: true },
);

function initBlogCardReveal() {
  const blogCards = document.querySelectorAll(".blog-card:not(.visible)");
  if (!blogCards.length) {
    return;
  }

  if (!("IntersectionObserver" in window)) {
    blogCards.forEach((card) => {
      card.classList.add("visible");
    });
    return;
  }

  if (!revealObserver) {
    revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 },
    );
  }

  blogCards.forEach((card, index) => {
    card.style.transitionDelay = index * 80 + "ms";
    revealObserver.observe(card);
  });
}

window.initBlogCardReveal = initBlogCardReveal;

document.addEventListener("mousedown", (event) => {
  if (!event.target.closest(".post-content")) {
    const selection = window.getSelection ? window.getSelection() : null;
    if (selection && typeof selection.removeAllRanges === "function") {
      selection.removeAllRanges();
    }
  }
});

document.addEventListener("DOMContentLoaded", () => {
  document.body.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (!link || !link.href) {
      return;
    }

    if (link.target === "_blank") {
      return;
    }

    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin) {
      return;
    }

    if (
      url.pathname === window.location.pathname &&
      url.search === window.location.search &&
      url.hash !== window.location.hash
    ) {
      return;
    }

    event.preventDefault();
    const wrapper = document.getElementById("pageWrapper");
    if (wrapper) {
      wrapper.classList.add("page-fade-out");
    } else {
      document.body.classList.add("page-fade-out");
    }

    setTimeout(() => {
      window.location.href = link.href;
    }, 200);
  });

  document.body.addEventListener("mouseover", (event) => {
    const card = event.target.closest("a.blog-card");
    if (
      !card ||
      card.dataset.preloaded ||
      !window.NotionAPI ||
      typeof NotionAPI.getPost !== "function"
    ) {
      return;
    }

    const url = new URL(card.href, window.location.href);
    const id = url.searchParams.get("id");
    if (!id) {
      return;
    }

    card.dataset.preloaded = "true";
    NotionAPI.getPost(id).catch(() => {});
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
