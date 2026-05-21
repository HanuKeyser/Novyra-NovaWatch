let cart = JSON.parse(localStorage.getItem("novyra-cart")) || [];

/* ================= SAVE CART ================= */
function saveCart() {
  localStorage.setItem("novyra-cart", JSON.stringify(cart));
  updateCartCount();
}

/* ================= CART COUNT ================= */
function updateCartCount() {
  const count = document.getElementById("cartCount");
  if (count) {
    count.textContent = cart.length;
  }
}

/* ================= ADD TO CART ================= */
function addToCart(name, price) {
  cart.push({ name, price });
  saveCart();
}

/* ================= REMOVE ITEM ================= */
function removeFromCart(index) {
  cart.splice(index, 1);
  saveCart();
  renderCart();
}

/* ================= CART BUTTONS ================= */
document.addEventListener("click", (e) => {
  if (e.target.classList.contains("select-btn")) {
    const name = e.target.dataset.name;
    const price = Number(e.target.dataset.price);

    addToCart(name, price);
  }

  if (e.target.classList.contains("remove-btn")) {
    const index = Number(e.target.dataset.index);
    removeFromCart(index);
  }
});

/* ================= CART PAGE RENDER ================= */
function renderCart() {
  const container = document.getElementById("cartItems");
  const totalEl = document.getElementById("cartTotal");

  if (!container) return;

  container.innerHTML = "";

  let total = 0;

  cart.forEach((item, index) => {
    total += item.price;

    container.innerHTML += `
      <div class="glass-card p-4 flex justify-between items-center mb-3">
        <div>
          <h4 class="font-semibold">${item.name}</h4>
          <p class="text-sm opacity-70">R${item.price}</p>
        </div>

        <button class="remove-btn text-red-400"
                data-index="${index}">
          Remove
        </button>
      </div>
    `;
  });

  if (totalEl) {
    totalEl.textContent = "R" + total;
  }
}

/* ================= INIT ================= */
updateCartCount();
renderCart();
