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

  const LABELS = {
    socialMedia: "Social Media Management",
    contentCreation: "Content Creation",
    branding: "Branding",
    marketingMaterials: "Marketing Materials"
  };

  /* ================= PAGE DETECTION ================= */
  const cleanPath = window.location.pathname.split("?")[0];
  const pageSlug = cleanPath.split("/").filter(Boolean).pop()?.replace(".html", "");
  const PAGE_KEY = PAGE_MAP[pageSlug] || null;

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

  const root = document.documentElement;
  const themeToggle = document.getElementById("themeToggle");

  /* ================= LOAD ================= */
  function loadCart() {
    try {
      const saved = localStorage.getItem(CART_KEY);
      if (!saved) return;

      const parsed = JSON.parse(saved);

      for (const key in cart) {
        cart[key] = {
          item: parsed[key]?.item ?? null,
          extras: Array.isArray(parsed[key]?.extras) ? parsed[key].extras : []
        };
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

    const data = PAGE_KEY ? cart[PAGE_KEY] : null;
    if (!data) return;

    document.querySelectorAll(".select-btn").forEach(btn => {
      const active = data.item?.name === btn.dataset.name;
      btn.classList.toggle("active-package", active);
    });

    document.querySelectorAll(".extra-btn").forEach(btn => {
      const exists = data.extras.find(e => e.name === btn.dataset.name);

      btn.classList.toggle("active", !!exists);
      btn.textContent = exists ? "Added" : "Add Option";
    });

    updateCartCount();
  }

  /* ================= RENDER CART ================= */
  function renderCart() {

    if (!cartContent) return;

    let html = "";
    let total = 0;

    for (const key in cart) {

      const section = cart[key];
      if (!section.item && section.extras.length === 0) continue;

      html += `<div class="mb-3"><strong>${LABELS[key]}</strong><br>`;

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

    if (!html) html = `<div>Your cart is empty</div>`;

    html += `
      <div class="mt-4 pt-3 border-t border-white/20">
        <strong>Total: R${total}</strong>
      </div>
    `;

    cartContent.innerHTML = html;
  }

  /* ================= CART OPEN/CLOSE ================= */
  function openCart() {
    renderCart();
    cartModal?.classList.remove("hidden");
    cartModal?.classList.add("flex");
  }

  function closeCartModal() {
    cartModal?.classList.add("hidden");
    cartModal?.classList.remove("flex");
  }

  cartBtn?.addEventListener("click", openCart);
  closeCart?.addEventListener("click", closeCartModal);

  cartModal?.addEventListener("click", (e) => {
    if (e.target === cartModal) closeCartModal();
  });

  /* ================= PACKAGE SELECT ================= */
  document.addEventListener("click", (e) => {

    const btn = e.target.closest(".select-btn");
    if (!btn || !PAGE_KEY) return;

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
    if (!btn || !PAGE_KEY) return;

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

    let body = `Hey Novyra,%0D%0A%0D%0AI would like a quote:%0D%0A%0D%0A`;
    let hasItems = false;

    for (const key in cart) {

      const section = cart[key];
      if (!section.item) continue;

      hasItems = true;

      body += `${LABELS[key]}:%0D%0A`;
      body += `${section.item.name} - R${section.item.price}%0D%0A`;

      section.extras.forEach(extra => {
        body += `- ${extra.name} - R${extra.price}%0D%0A`;
      });

      body += `%0D%0A`;
    }

    if (!hasItems) {
      alert("Please select a package first.");
      return;
    }

    window.location.href =
      `mailto:sales@novyra.co.za?subject=Quote Request&body=${body}`;
  }

  checkoutBtn?.addEventListener("click", checkoutCart);

  /* ================= THEME ================= */
  if (localStorage.getItem(THEME_KEY) === "dark") {
    root.classList.add("dark-mode");
  }

  themeToggle?.addEventListener("click", () => {
    root.classList.toggle("dark-mode");

    localStorage.setItem(
      THEME_KEY,
      root.classList.contains("dark-mode") ? "dark" : "light"
    );
  });

  /* ================= INIT ================= */
  loadCart();
  syncUI();
  updateCartCount();

  window.addEventListener("storage", (e) => {
    if (e.key === CART_KEY) {
      loadCart();
      syncUI();
    }
  });

});
