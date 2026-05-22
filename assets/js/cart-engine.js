document.addEventListener("DOMContentLoaded", () => {

  /* ================= CONFIG ================= */
  const CART_KEY = "novyra-cart";
  const THEME_KEY = "novyra-theme";

  const PAGE_MAP = {
    "social-media-management": "socialMedia",
    "content-creation": "contentCreation",
    "branding": "branding",
    "marketing-materials": "marketingMaterials"
  };

  /* ================= DETECT PAGE ================= */
  const path = window.location.pathname.replace(/\/$/, "");
  const pageSlug = path.split("/").pop();
  const PAGE_KEY = PAGE_MAP[pageSlug];

  if (!PAGE_KEY) {
    console.warn("Cart engine: unknown page slug:", pageSlug);
    return;
  }

  /* ================= CART STATE ================= */
  let cart = {
    socialMedia: { item: null, extras: [] },
    contentCreation: { item: null, extras: [] },
    branding: { item: null, extras: [] },
    marketingMaterials: { item: null, extras: [] }
  };

  /* ================= ELEMENTS ================= */
  const cartBtn = document.getElementById("cartBtn");
  const cartModal = document.getElementById("cartModal");
  const closeCart = document.getElementById("closeCart");
  const checkoutBtn = document.getElementById("checkoutBtn");
  const cartContent = document.getElementById("cartContent");
  const cartCount = document.getElementById("cartCount");

  const themeToggle = document.getElementById("themeToggle");
  const root = document.documentElement;

  /* ================= LOAD ================= */
  function loadCart() {
    try {
      const saved = localStorage.getItem(CART_KEY);
      if (!saved) return;

      const parsed = JSON.parse(saved);

      for (const key in cart) {
        cart[key] = parsed[key] ?? { item: null, extras: [] };
        cart[key].extras ??= [];
      }

    } catch (e) {
      console.warn("Cart load failed", e);
    }
  }

  /* ================= SAVE ================= */
  function saveCart() {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    updateCartCount();
  }

  /* ================= COUNT ================= */
  function updateCartCount() {
    let total = 0;

    for (const key in cart) {
      if (cart[key].item) total++;
      total += cart[key].extras.length;
    }

    if (cartCount) cartCount.textContent = total;
  }

  /* ================= UI SYNC ================= */
  function syncUI() {

    const data = cart[PAGE_KEY];

    document.querySelectorAll(".select-btn").forEach(btn => {
      const active = data.item?.name === btn.dataset.name;
      btn.classList.toggle("active-package", active);
    });

    document.querySelectorAll(".extra-btn").forEach(btn => {
      const exists = data.extras.find(e => e.name === btn.dataset.name);

      if (exists) {
        btn.classList.add("active");
        btn.textContent = "Added";
      } else {
        btn.classList.remove("active");
        btn.textContent = "Add Option";
      }
    });

    updateCartCount();
  }

  /* ================= RENDER CART ================= */
  function renderCart() {

    if (!cartContent) return;

    const labels = {
      socialMedia: "Social Media Management",
      contentCreation: "Content Creation",
      branding: "Branding",
      marketingMaterials: "Marketing Materials"
    };

    let html = "";
    let total = 0;

    for (const key in cart) {

      const section = cart[key];

      if (!section.item && section.extras.length === 0) continue;

      html += `<div class="mb-3"><strong>${labels[key]}</strong><br>`;

      if (section.item) {
        html += `${section.item.name} - R${section.item.price}<br>`;
        total += section.item.price;
      }

      section.extras.forEach(extra => {
        html += `• ${extra.name} - R${extra.price}<br>`;
        total += extra.price;
      });

      html += `</div>`;
    }

    html += `
      <div class="mt-4 pt-3 border-t border-white/20">
        <strong>Total: R${total}</strong>
      </div>
    `;

    cartContent.innerHTML = html;
  }

  /* ================= OPEN/CLOSE ================= */
  function openCart() {
    renderCart();
    cartModal.classList.remove("hidden");
    cartModal.classList.add("flex");
  }

  function closeCartModal() {
    cartModal.classList.add("hidden");
    cartModal.classList.remove("flex");
  }

  cartBtn?.addEventListener("click", openCart);
  closeCart?.addEventListener("click", closeCartModal);

  cartModal?.addEventListener("click", (e) => {
    if (e.target === cartModal) closeCartModal();
  });

  /* ================= SELECT PACKAGE ================= */
  document.addEventListener("click", (e) => {

    const btn = e.target.closest(".select-btn");
    if (!btn) return;

    const name = btn.dataset.name;
    const price = Number(btn.dataset.price);

    const current = cart[PAGE_KEY].item;

    cart[PAGE_KEY].item =
      current?.name === name ? null : { name, price };

    saveCart();
    syncUI();
  });

  /* ================= EXTRAS ================= */
  document.addEventListener("click", (e) => {

    const btn = e.target.closest(".extra-btn");
    if (!btn) return;

    const name = btn.dataset.name;
    const price = Number(btn.dataset.price);

    const extras = cart[PAGE_KEY].extras;
    const index = extras.findIndex(e => e.name === name);

    if (index > -1) extras.splice(index, 1);
    else extras.push({ name, price });

    saveCart();
    syncUI();
  });

  /* ================= CHECKOUT ================= */
  function checkoutCart() {

    const labels = {
      socialMedia: "Social Media Management",
      contentCreation: "Content Creation",
      branding: "Branding",
      marketingMaterials: "Marketing Materials"
    };

    let body = `Hey Novyra,%0D%0A%0D%0AI would like a quote:%0D%0A%0D%0A`;

    for (const key in cart) {
      const section = cart[key];

      if (!section.item) continue;

      body += `${labels[key]}:%0D%0A`;
      body += `${section.item.name} - R${section.item.price}%0D%0A`;

      section.extras.forEach(extra => {
        body += `- ${extra.name} - R${extra.price}%0D%0A`;
      });

      body += `%0D%0A`;
    }

    window.location.href =
      `mailto:sales@novyra.co.za?subject=Quote Request&body=${body}`;
  }

  checkoutBtn?.addEventListener("click", checkoutCart);

  /* ================= THEME ================= */
  function updateTheme() {
    const isDark = root.classList.contains("dark-mode");

    if (themeToggle) {
      themeToggle.dataset.mode = isDark ? "dark" : "light";
    }
  }

  if (localStorage.getItem(THEME_KEY) === "dark") {
    root.classList.add("dark-mode");
  }

  themeToggle?.addEventListener("click", () => {
    root.classList.toggle("dark-mode");

    localStorage.setItem(
      THEME_KEY,
      root.classList.contains("dark-mode") ? "dark" : "light"
    );

    updateTheme();
  });

  /* ================= INIT ================= */
  loadCart();
  syncUI();

  window.addEventListener("storage", (e) => {
    if (e.key === CART_KEY) {
      loadCart();
      syncUI();
    }
  });

});
