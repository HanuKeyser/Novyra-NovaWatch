/* Novyra site script: menu, footer year, hero light field, sparkle bursts. */
(function () {
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Every page opens at the top, including when coming back to it */
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  function toTop() { if (!location.hash) window.scrollTo(0, 0); }
  toTop();
  window.addEventListener("pageshow", toTop);

  /* Mobile menu */
  var btn = document.querySelector(".menu-btn");
  var nav = document.getElementById("site-nav");
  if (btn && nav) {
    var setMenu = function (open) {
      nav.classList.toggle("open", open);
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      btn.textContent = open ? "Close" : "Menu";
    };
    btn.addEventListener("click", function () { setMenu(!nav.classList.contains("open")); });
    /* While the menu is open, keep keyboard focus inside it; Escape closes it */
    document.addEventListener("keydown", function (e) {
      if (!nav.classList.contains("open")) return;
      if (e.key === "Escape") { setMenu(false); btn.focus(); return; }
      if (e.key !== "Tab") return;
      var links = nav.querySelectorAll("a"), first = btn, last = links[links.length - 1];
      if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    });
    /* Close the menu if the screen gets wide enough to show the full nav */
    window.addEventListener("resize", function () { if (getComputedStyle(btn).display === "none") setMenu(false); });
  }

  /* Back to top: a round button above the WhatsApp button, shown once the page has been scrolled */
  var wa = document.querySelector(".wa-float");
  if (wa) {
    var up = document.createElement("button");
    up.type = "button"; up.className = "to-top"; up.setAttribute("aria-label", "Back to top"); up.tabIndex = -1;
    up.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
    wa.parentNode.insertBefore(up, wa);
    var showUp = function () {
      var on = window.scrollY > Math.max(400, window.innerHeight * 0.6);
      up.classList.toggle("show", on); up.tabIndex = on ? 0 : -1;
    };
    showUp(); window.addEventListener("scroll", showUp, { passive: true });
    up.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
      var first = document.querySelector(".skip, .site-head a"); if (first) first.focus({ preventScroll: true });
    });
  }

  /* News feed: each post shows from its posting date and time (South African time), newest first */
  var feed = document.querySelector(".news-feed");
  if (feed) {
    var now = Date.now(), shown = 0;
    feed.querySelectorAll(".news-post[data-release]").forEach(function (post) {
      var at = Date.parse(post.getAttribute("data-release"));
      if (!isNaN(at) && at <= now) { post.hidden = false; shown++; } else post.remove();
    });
    if (shown) feed.hidden = false;
  }

  /* Footer year */
  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });

  /* Hero light field: drifting stars and light streaks that lean toward the pointer */
  var canvas = document.querySelector("[data-lightfield]");
  if (canvas && canvas.getContext) {
    var ctx = canvas.getContext("2d");
    var w = 0, h = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    var stars = [], streaks = [], mx = 0.7, my = 0.3;

    function size() {
      var r = canvas.getBoundingClientRect();
      w = r.width; h = r.height;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      stars = [];
      var n = Math.round((w * h) / 9000);
      for (var i = 0; i < n; i++) stars.push({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.2 + 0.2, t: Math.random() * 6 });
      streaks = [];
      for (var j = 0; j < 26; j++) streaks.push({ o: j / 26, s: 0.4 + Math.random() * 0.8, a: 0.15 + Math.random() * 0.45 });
    }

    function draw(time) {
      ctx.clearRect(0, 0, w, h);
      var t = (time || 0) / 1000;
      /* glow behind the headline */
      var g = ctx.createRadialGradient(w * mx, h * my, 0, w * mx, h * my, Math.max(w, h) * 0.6);
      g.addColorStop(0, "rgba(74,134,247,0.32)");
      g.addColorStop(0.45, "rgba(29,58,138,0.12)");
      g.addColorStop(1, "rgba(7,8,14,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      /* stars */
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t * 1.3 + s.t);
        ctx.fillStyle = "#dbe6ff";
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      }
      /* streaks: arcs sweeping from bottom-left toward the light */
      ctx.lineCap = "round";
      for (var j = 0; j < streaks.length; j++) {
        var k = streaks[j];
        var y0 = h * (0.55 + k.o * 0.6);
        var phase = (t * 0.06 * k.s + k.o) % 1;
        ctx.globalAlpha = k.a * (0.6 + 0.4 * Math.sin(t + j));
        var grad = ctx.createLinearGradient(0, y0, w, h * my);
        grad.addColorStop(0, "rgba(74,134,247,0)");
        grad.addColorStop(Math.max(0.01, phase), "rgba(147,197,253,0.9)");
        grad.addColorStop(Math.min(0.99, phase + 0.12), "rgba(74,134,247,0)");
        ctx.strokeStyle = grad; ctx.lineWidth = 1 + k.s;
        ctx.beginPath();
        ctx.moveTo(-40, y0);
        ctx.quadraticCurveTo(w * 0.45, y0 - h * 0.1, w * mx + 40, h * my + (j - 13) * 2.4);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (!reduce) requestAnimationFrame(draw);
    }

    size();
    window.addEventListener("resize", function () { size(); if (reduce) draw(0); });
    canvas.parentElement.addEventListener("pointermove", function (e) {
      var r = canvas.getBoundingClientRect();
      mx += ((e.clientX - r.left) / r.width * 0.5 + 0.45 - mx) * 0.08;
      my += ((e.clientY - r.top) / r.height * 0.5 + 0.1 - my) * 0.08;
    });
    reduce ? draw(0) : requestAnimationFrame(draw);
  }

  /* Sparkle burst on button clicks */
  if (!reduce) {
    document.addEventListener("click", function (e) {
      var target = e.target.closest(".btn, .pkg button");
      if (!target) return;
      for (var i = 0; i < 7; i++) {
        var s = document.createElement("span");
        s.className = "spark";
        var a = (Math.PI * 2 * i) / 7, d = 30 + Math.random() * 30;
        s.style.cssText = "position:fixed;z-index:80;pointer-events:none;width:12px;height:12px;left:" + (e.clientX - 6) + "px;top:" + (e.clientY - 6) + "px;transition:transform .6s cubic-bezier(.2,.7,.3,1),opacity .6s ease";
        document.body.appendChild(s);
        (function (el, dx, dy) {
          requestAnimationFrame(function () {
            el.style.transform = "translate(" + dx + "px," + dy + "px) rotate(90deg) scale(.4)";
            el.style.opacity = "0";
          });
          setTimeout(function () { el.remove(); }, 650);
        })(s, Math.cos(a) * d, Math.sin(a) * d);
      }
    });
  }
})();

/* Fit display headings: if the longest word is wider than the heading's space, scale that heading down until it fits */
(function () {
  var SEL = "h1, h2, h3, .equation";
  function avail(el) {
    var cs = getComputedStyle(el), w = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var p = el.parentElement;
    if (p) { var ps = getComputedStyle(p); w = Math.min(w, p.clientWidth - parseFloat(ps.paddingLeft) - parseFloat(ps.paddingRight)); }
    return w;
  }
  function fit() {
    var els = document.querySelectorAll(SEL);
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.style.fontSize) el.style.fontSize = "";
      var cs = getComputedStyle(el);
      if (cs.fontFamily.indexOf("Syne") < 0 || cs.display === "none") continue;
      var words = [];
      for (var k = 0; k < el.childNodes.length; k++) {
        var n = el.childNodes[k];
        if (n.nodeType === 1 && getComputedStyle(n).whiteSpace === "nowrap") words.push(n.textContent);
        else words = words.concat((n.textContent || "").split(/\s+/));
      }
      words = words.filter(function (w) { return w && w.trim(); });
      if (!words.length) continue;
      var probe = document.createElement("span");
      probe.setAttribute("aria-hidden", "true");
      probe.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap;left:0;top:0;pointer-events:none";
      el.appendChild(probe);
      var max = 0;
      for (var j = 0; j < words.length; j++) { probe.textContent = words[j]; max = Math.max(max, probe.offsetWidth + 1); }
      el.removeChild(probe);
      var a = avail(el);
      if (a > 0 && max > a) el.style.fontSize = (Math.floor(parseFloat(cs.fontSize) * a / max * 0.97 * 10) / 10) + "px";
    }
  }
  var raf = 0;
  function queue() { cancelAnimationFrame(raf); raf = requestAnimationFrame(fit); }
  fit();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
  window.addEventListener("load", fit);
  window.addEventListener("resize", queue);
  window.addEventListener("orientationchange", queue);
})();
