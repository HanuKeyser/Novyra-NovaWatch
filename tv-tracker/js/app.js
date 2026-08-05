/* =====================================================================
   NOVAWATCH — app.js
   Handles: auth, tab routing, Firestore-backed library, TMDB rendering,
   search, discover, upcoming, profile, detail modal, and background
   metadata refresh so library items stay current with TMDB.
   ===================================================================== */

(() => {
  "use strict";

  /* ---------------- State ---------------- */
  let currentUser = null;
  let library = new Map();      // key `${mediaType}_${id}` -> library doc
  let unsubscribeLibrary = null;
  let activeView = "tv";
  let activeStatusFilter = { tv: "all", movie: "all" };
  let activeDiscoverTab = "trending";
  let searchDebounce = null;
  let modalContext = null;      // { id, mediaType, details }
  let isGuest = false;
  let metaSyncInFlight = false;

  // How long a library item's cached TMDB metadata (poster, title,
  // episode counts, air dates) is trusted before it's refetched in the
  // background. Kept short enough that a new season shows up promptly,
  // long enough to stay well clear of TMDB rate limits.
  const META_REFRESH_MS = 6 * 60 * 60 * 1000; // 6 hours
  const META_SYNC_GAP_MS = 200; // spacing between background TMDB calls

  const STATUS_LABELS = {
    watching: "Watching",
    planned: "Plan to Watch",
    completed: "Completed",
    dropped: "Dropped"
  };
  const STATUS_ORDER = ["watching", "planned", "completed", "dropped"];

  /* ---------------- Helpers ---------------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove("show"), 2400);
  }

  function libKey(mediaType, id) {
    return `${mediaType}_${id}`;
  }

  function yearOf(dateStr) {
    return dateStr ? dateStr.slice(0, 4) : "—";
  }

  function initials(nameOrEmail) {
    if (!nameOrEmail) return "?";
    const parts = nameOrEmail.replace(/@.*/, "").split(/[\s._]+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /* ---------------- Auth screen wiring ---------------- */
  let authMode = "signin";

  function setAuthMode(mode) {
    authMode = mode;
    $$(".tswitch-btn").forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
    $("#name-field").hidden = mode !== "signup";
    $("#auth-submit .btn-label").textContent = mode === "signup" ? "Create Account" : "Sign In";
    $("#password").setAttribute("autocomplete", mode === "signup" ? "new-password" : "current-password");
    hideAuthError();
  }

  function showAuthError(message) {
    const el = $("#auth-error");
    el.textContent = message;
    el.hidden = false;
  }
  function hideAuthError() {
    $("#auth-error").hidden = true;
  }

  function friendlyAuthError(err) {
    const map = {
      "auth/invalid-email": "That email address doesn't look right.",
      "auth/user-not-found": "No account found with that email.",
      "auth/wrong-password": "Incorrect password. Try again.",
      "auth/invalid-credential": "Email or password is incorrect.",
      "auth/email-already-in-use": "An account already exists with that email.",
      "auth/weak-password": "Password should be at least 6 characters.",
      "auth/popup-closed-by-user": "Sign-in was cancelled.",
      "auth/network-request-failed": "Network error — check your connection."
    };
    return map[err.code] || err.message || "Something went wrong. Please try again.";
  }

  $("#auth-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    hideAuthError();
    const email = $("#email").value.trim();
    const password = $("#password").value;
    const submitBtn = $("#auth-submit");
    const label = submitBtn.querySelector(".btn-label");
    const spinner = submitBtn.querySelector(".btn-spinner");
    submitBtn.disabled = true;
    spinner.hidden = false;
    label.style.opacity = "0.6";
    try {
      if (authMode === "signup") {
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        const name = $("#displayName").value.trim();
        if (name) await cred.user.updateProfile({ displayName: name });
      } else {
        await auth.signInWithEmailAndPassword(email, password);
      }
    } catch (err) {
      showAuthError(friendlyAuthError(err));
    } finally {
      submitBtn.disabled = false;
      spinner.hidden = true;
      label.style.opacity = "1";
    }
  });

  $$(".tswitch-btn").forEach(btn => {
    btn.addEventListener("click", () => setAuthMode(btn.dataset.mode));
  });

  $("#google-signin").addEventListener("click", async () => {
    hideAuthError();
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
      await auth.signInWithPopup(provider);
    } catch (err) {
      showAuthError(friendlyAuthError(err));
    }
  });

  $("#guest-signin").addEventListener("click", async () => {
    hideAuthError();
    try {
      isGuest = true;
      await auth.signInAnonymously();
    } catch (err) {
      isGuest = false;
      showAuthError("Guest sign-in isn't enabled for this project yet.");
    }
  });

  $("#sign-out-btn").addEventListener("click", () => auth.signOut());

  /* ---------------- Auth state -> shell ---------------- */
  let authResolved = false;

  function hideLoadingScreen() {
    const el = $("#loading-screen");
    if (!el || el.hidden) return;
    el.classList.add("fade-out");
    setTimeout(() => { el.hidden = true; }, 550);
  }

  // Safety net: if auth genuinely can't resolve (misconfigured project,
  // offline, etc.) don't leave people staring at a spinner forever.
  setTimeout(() => {
    if (!authResolved) {
      authResolved = true;
      $("#login-screen").hidden = false;
      hideLoadingScreen();
    }
  }, 8000);

  auth.onAuthStateChanged(user => {
    currentUser = user;
    if (unsubscribeLibrary) { unsubscribeLibrary(); unsubscribeLibrary = null; }

    if (user) {
      $("#login-screen").hidden = true;
      $("#app").hidden = false;
      hydrateProfile(user);
      attachLibraryListener(user.uid);
      switchView(activeView);
    } else {
      isGuest = false;
      library = new Map();
      $("#app").hidden = true;
      $("#login-screen").hidden = false;
    }

    if (!authResolved) {
      authResolved = true;
      hideLoadingScreen();
    }
  });

  // Whenever the tab becomes visible again (e.g. the user switched back
  // after a while), give the library a chance to pick up anything new
  // from TMDB without requiring the person to reopen every title.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && currentUser) {
      syncStaleLibraryItems();
    }
  });

  function hydrateProfile(user) {
    const displayName = user.isAnonymous ? "Guest" : (user.displayName || user.email || "Watcher");
    const email = user.isAnonymous ? "Browsing locally on this device" : (user.email || "");
    const initial = initials(user.isAnonymous ? "Guest" : (user.displayName || user.email));
    $("#avatar-initial").textContent = initial;
    $("#profile-avatar").textContent = initial;
    $("#profile-name").textContent = displayName;
    $("#profile-email").textContent = email;
  }

  /* ---------------- Firestore library sync ---------------- */
  function attachLibraryListener(uid) {
    unsubscribeLibrary = db.collection("users").doc(uid).collection("library")
      .onSnapshot(snap => {
        library = new Map();
        snap.forEach(doc => library.set(doc.id, doc.data()));
        renderCurrentView();
        renderProfileStats();
        syncStaleLibraryItems(); // fire-and-forget: refresh anything past due
      }, err => {
        console.error("library listener error", err);
      });
  }

  async function upsertLibraryItem(item) {
    if (!currentUser) return;
    const key = libKey(item.mediaType, item.id);
    const ref = db.collection("users").doc(currentUser.uid).collection("library").doc(key);
    const existing = library.get(key) || {};
    const payload = {
      id: item.id,
      mediaType: item.mediaType,
      title: item.title,
      posterPath: item.posterPath || null,
      releaseDate: item.releaseDate || null,
      status: item.status ?? existing.status ?? "planned",
      rating: item.rating !== undefined ? item.rating : (existing.rating ?? 0),
      watchedEpisodes: item.watchedEpisodes !== undefined ? item.watchedEpisodes : (existing.watchedEpisodes ?? 0),
      totalEpisodes: item.totalEpisodes !== undefined ? item.totalEpisodes : (existing.totalEpisodes ?? null),
      metaSyncedAt: item.metaSyncedAt !== undefined ? item.metaSyncedAt : (existing.metaSyncedAt ?? null),
      addedAt: existing.addedAt || firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    await ref.set(payload, { merge: true });
    library.set(key, payload);
  }

  async function removeLibraryItem(mediaType, id) {
    if (!currentUser) return;
    const key = libKey(mediaType, id);
    await db.collection("users").doc(currentUser.uid).collection("library").doc(key).delete();
    library.delete(key);
  }

  /* ---------------- TMDB metadata auto-refresh ----------------
     Library items store a snapshot of TMDB data (title, poster, air
     dates, episode counts) at the time they were added or last opened.
     These helpers keep that snapshot current automatically, even for
     items nobody has revisited, so a new season, a changed poster, or
     an updated air date shows up without the user re-adding anything. */

  function metaFromDetails(mediaType, details) {
    return {
      title: mediaType === "tv" ? details.name : details.title,
      posterPath: details.poster_path || null,
      releaseDate: mediaType === "tv" ? details.first_air_date : details.release_date,
      totalEpisodes: mediaType === "tv" ? (details.number_of_episodes || null) : null
    };
  }

  // Writes fresh TMDB metadata onto an existing library entry, preserving
  // the user's own status/rating/progress — except that a show marked
  // Completed is reopened to Watching if TMDB now shows more episodes
  // than the user has logged (i.e. a new season just landed).
  // Returns the title if it was reopened this way, otherwise null.
  async function refreshLibraryItemMetadata(key, mediaType, id, details) {
    const entry = library.get(key);
    if (!entry) return null;
    const meta = metaFromDetails(mediaType, details);
    let status = entry.status;
    let reopened = false;
    if (mediaType === "tv" && entry.status === "completed" && meta.totalEpisodes
        && (entry.watchedEpisodes || 0) < meta.totalEpisodes) {
      status = "watching";
      reopened = true;
    }
    await upsertLibraryItem({
      id, mediaType,
      title: meta.title, posterPath: meta.posterPath, releaseDate: meta.releaseDate,
      totalEpisodes: meta.totalEpisodes, status, metaSyncedAt: Date.now()
    });
    return reopened ? meta.title : null;
  }

  // Sweeps the library for entries whose cached metadata has aged past
  // META_REFRESH_MS and refetches them from TMDB, one at a time with a
  // small gap between calls. Safe to call often — it's a no-op unless
  // something is actually stale, and re-entrant calls are ignored while
  // a sweep is already running.
  async function syncStaleLibraryItems() {
    if (!currentUser || metaSyncInFlight) return;
    const now = Date.now();
    const stale = Array.from(library.entries())
      .filter(([, item]) => !item.metaSyncedAt || (now - item.metaSyncedAt) > META_REFRESH_MS);
    if (!stale.length) return;

    metaSyncInFlight = true;
    const reopenedTitles = [];
    try {
      for (const [key, item] of stale) {
        // Library may have changed (item removed) mid-sweep — re-check.
        if (!library.has(key)) continue;
        try {
          const details = item.mediaType === "tv"
            ? await TMDB.tvDetails(item.id)
            : await TMDB.movieDetails(item.id);
          const reopenedTitle = await refreshLibraryItemMetadata(key, item.mediaType, item.id, details);
          if (reopenedTitle) reopenedTitles.push(reopenedTitle);
        } catch (err) {
          // A single title failing (removed from TMDB, network hiccup)
          // shouldn't stop the rest of the sweep.
          console.warn("Metadata sync failed for", item.mediaType, item.id, err);
        }
        await sleep(META_SYNC_GAP_MS);
      }
    } finally {
      metaSyncInFlight = false;
    }

    if (reopenedTitles.length === 1) {
      toast(`New episodes available for ${reopenedTitles[0]}`);
    } else if (reopenedTitles.length > 1) {
      toast(`New episodes available for ${reopenedTitles.length} shows`);
    }
  }

  /* ---------------- Tab navigation ---------------- */
  const VIEW_ORDER = ["tv", "movie", "upcoming", "discover", "profile"];

  function switchView(view) {
    activeView = view;
    $("#view-search").hidden = true;
    VIEW_ORDER.forEach(v => { $(`#view-${v}`).hidden = v !== view; });

    $$(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.view === view));
    const idx = VIEW_ORDER.indexOf(view);
    const indicator = $(".tab-indicator");
    indicator.style.transform = `translateX(${idx * 100}%)`;

    renderCurrentView();
    syncStaleLibraryItems(); // no-op unless something's actually stale
  }

  $$(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      $("#search-input").value = "";
      $("#search-clear").hidden = true;
      switchView(btn.dataset.view);
    });
  });
  $("#open-profile").addEventListener("click", () => switchView("profile"));

  function renderCurrentView() {
    if (!$("#view-search").hidden) { return; }
    if (activeView === "tv") renderLibraryView("tv");
    else if (activeView === "movie") renderLibraryView("movie");
    else if (activeView === "upcoming") renderUpcoming();
    else if (activeView === "discover") renderDiscover();
    else if (activeView === "profile") renderProfileStats();
  }

  /* ---------------- Poster card builder ---------------- */
  function posterCard({ id, mediaType, title, posterPath, date, libEntry }) {
    const card = document.createElement("div");
    card.className = "poster-card";
    const img = posterPath
      ? `<img src="${TMDB.poster(posterPath)}" alt="${escapeHtml(title)}" loading="lazy" />`
      : `<div class="poster-fallback">${escapeHtml(title)}</div>`;

    let badge = "";
    if (libEntry) {
      badge = `<span class="poster-badge status-${libEntry.status}">${STATUS_LABELS[libEntry.status]}</span>`;
    }
    let ratingBadge = "";
    if (libEntry && libEntry.rating) {
      ratingBadge = `<span class="poster-rating">★ ${libEntry.rating}</span>`;
    }

    card.innerHTML = `
      ${img}
      ${badge}
      ${ratingBadge}
      <div class="poster-meta">
        <p class="t">${escapeHtml(title)}</p>
        <p class="s">${yearOf(date)} · ${mediaType === "tv" ? "TV" : "Movie"}</p>
      </div>
    `;
    card.addEventListener("click", () => openDetail(id, mediaType));
    return card;
  }

  function escapeHtml(str = "") {
    return str.replace(/[&<>"']/g, s => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[s]));
  }

  /* ---------------- TV / Movie library views ---------------- */
  const STATUS_FILTERS = ["all", "watching", "planned", "completed", "dropped"];

  function renderLibraryView(mediaType) {
    const items = Array.from(library.values()).filter(i => i.mediaType === mediaType);
    const railId = mediaType === "tv" ? "#tv-status-rail" : "#movie-status-rail";
    const listsId = mediaType === "tv" ? "#tv-lists" : "#movie-lists";
    const emptyId = mediaType === "tv" ? "#tv-empty" : "#movie-empty";

    const rail = $(railId);
    rail.innerHTML = "";
    STATUS_FILTERS.forEach(status => {
      const count = status === "all" ? items.length : items.filter(i => i.status === status).length;
      const pill = document.createElement("button");
      pill.className = "status-pill" + (activeStatusFilter[mediaType] === status ? " active" : "");
      pill.innerHTML = `${status === "all" ? "All" : STATUS_LABELS[status]}<span class="count">${count}</span>`;
      pill.addEventListener("click", () => {
        activeStatusFilter[mediaType] = status;
        renderLibraryView(mediaType);
      });
      rail.appendChild(pill);
    });

    const listsEl = $(listsId);
    listsEl.innerHTML = "";
    const filter = activeStatusFilter[mediaType];
    const filtered = filter === "all" ? items : items.filter(i => i.status === filter);

    $(emptyId).hidden = items.length > 0;

    if (filter === "all" && items.length > 0) {
      STATUS_ORDER.forEach(status => {
        const group = items.filter(i => i.status === status);
        if (!group.length) return;
        const section = document.createElement("div");
        section.className = "list-group";
        section.innerHTML = `<h3>${STATUS_LABELS[status]}</h3>`;
        const grid = document.createElement("div");
        grid.className = "poster-grid";
        group.forEach(i => grid.appendChild(posterCard({
          id: i.id, mediaType: i.mediaType, title: i.title, posterPath: i.posterPath, date: i.releaseDate, libEntry: i
        })));
        section.appendChild(grid);
        listsEl.appendChild(section);
      });
    } else if (filtered.length) {
      const grid = document.createElement("div");
      grid.className = "poster-grid";
      filtered.forEach(i => grid.appendChild(posterCard({
        id: i.id, mediaType: i.mediaType, title: i.title, posterPath: i.posterPath, date: i.releaseDate, libEntry: i
      })));
      listsEl.appendChild(grid);
    }
  }

  /* ---------------- Upcoming view ---------------- */
  async function renderUpcoming() {
    const mineGrid = $("#upcoming-mine");
    const mine = Array.from(library.values())
      .filter(i => i.status === "planned" && i.releaseDate)
      .sort((a, b) => (a.releaseDate || "").localeCompare(b.releaseDate || ""));
    mineGrid.innerHTML = "";
    if (!mine.length) {
      mineGrid.innerHTML = `<p class="view-sub" style="grid-column:1/-1;">Nothing queued yet — add something with "Plan to Watch".</p>`;
    } else {
      mine.forEach(i => mineGrid.appendChild(posterCard({
        id: i.id, mediaType: i.mediaType, title: i.title, posterPath: i.posterPath, date: i.releaseDate, libEntry: i
      })));
    }

    const movieGrid = $("#upcoming-movies");
    const tvGrid = $("#upcoming-tv");
    movieGrid.innerHTML = `<div class="loader"></div>`;
    tvGrid.innerHTML = `<div class="loader"></div>`;
    try {
      const [movies, tv] = await Promise.all([TMDB.upcomingMovies(), TMDB.airingTodayTV()]);
      movieGrid.innerHTML = "";
      (movies.results || []).slice(0, 12).forEach(m => movieGrid.appendChild(posterCard({
        id: m.id, mediaType: "movie", title: m.title, posterPath: m.poster_path, date: m.release_date,
        libEntry: library.get(libKey("movie", m.id))
      })));
      tvGrid.innerHTML = "";
      (tv.results || []).slice(0, 12).forEach(t => tvGrid.appendChild(posterCard({
        id: t.id, mediaType: "tv", title: t.name, posterPath: t.poster_path, date: t.first_air_date,
        libEntry: library.get(libKey("tv", t.id))
      })));
    } catch (err) {
      movieGrid.innerHTML = `<p class="view-sub">Couldn't reach TMDB right now.</p>`;
      tvGrid.innerHTML = "";
      console.error(err);
    }
  }

  /* ---------------- Discover view ---------------- */
  $$(".chip").forEach(chip => {
    chip.addEventListener("click", () => {
      $$(".chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      activeDiscoverTab = chip.dataset.genre;
      renderDiscover();
    });
  });

  async function renderDiscover() {
    const grid = $("#discover-grid");
    grid.innerHTML = `<div class="loader"></div>`;
    try {
      let results = [];
      let mediaHint = null;
      switch (activeDiscoverTab) {
        case "trending": {
          const data = await TMDB.trending("all", "day");
          results = data.results || [];
          break;
        }
        case "popular-movie": {
          const data = await TMDB.popularMovies();
          results = data.results || []; mediaHint = "movie"; break;
        }
        case "popular-tv": {
          const data = await TMDB.popularTV();
          results = data.results || []; mediaHint = "tv"; break;
        }
        case "top-movie": {
          const data = await TMDB.topRatedMovies();
          results = data.results || []; mediaHint = "movie"; break;
        }
        case "top-tv": {
          const data = await TMDB.topRatedTV();
          results = data.results || []; mediaHint = "tv"; break;
        }
      }
      grid.innerHTML = "";
      results
        .filter(r => mediaHint || r.media_type === "movie" || r.media_type === "tv")
        .forEach(r => {
          const mediaType = mediaHint || r.media_type;
          const title = mediaType === "tv" ? r.name : r.title;
          const date = mediaType === "tv" ? r.first_air_date : r.release_date;
          grid.appendChild(posterCard({
            id: r.id, mediaType, title, posterPath: r.poster_path, date,
            libEntry: library.get(libKey(mediaType, r.id))
          }));
        });
      if (!grid.children.length) grid.innerHTML = `<p class="view-sub">No results.</p>`;

      // Try to render the ad unit once content is in place.
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
    } catch (err) {
      grid.innerHTML = `<p class="view-sub">Couldn't reach TMDB right now.</p>`;
      console.error(err);
    }
  }

  /* ---------------- Search ---------------- */
  const searchInput = $("#search-input");
  searchInput.addEventListener("input", () => {
    const q = searchInput.value.trim();
    $("#search-clear").hidden = !q;
    clearTimeout(searchDebounce);
    if (!q) {
      $("#view-search").hidden = true;
      renderCurrentView();
      return;
    }
    searchDebounce = setTimeout(() => runSearch(q), 350);
  });
  $("#search-clear").addEventListener("click", () => {
    searchInput.value = "";
    $("#search-clear").hidden = true;
    $("#view-search").hidden = true;
    renderCurrentView();
  });

  async function runSearch(query) {
    VIEW_ORDER.forEach(v => { $(`#view-${v}`).hidden = true; });
    const searchView = $("#view-search");
    searchView.hidden = false;
    $("#search-meta").textContent = `Searching for "${query}"…`;
    const grid = $("#search-results");
    grid.innerHTML = `<div class="loader"></div>`;
    try {
      const data = await TMDB.search(query);
      const results = (data.results || []).filter(r => r.media_type === "movie" || r.media_type === "tv");
      $("#search-meta").textContent = results.length
        ? `${results.length} result${results.length === 1 ? "" : "s"} for "${query}"`
        : `No results for "${query}"`;
      grid.innerHTML = "";
      results.forEach(r => {
        const mediaType = r.media_type;
        const title = mediaType === "tv" ? r.name : r.title;
        const date = mediaType === "tv" ? r.first_air_date : r.release_date;
        grid.appendChild(posterCard({
          id: r.id, mediaType, title, posterPath: r.poster_path, date,
          libEntry: library.get(libKey(mediaType, r.id))
        }));
      });
    } catch (err) {
      $("#search-meta").textContent = "Couldn't reach TMDB right now.";
      grid.innerHTML = "";
      console.error(err);
    }
  }

  /* ---------------- Profile stats ---------------- */
  function renderProfileStats() {
    if (activeView !== "profile") return;
    const items = Array.from(library.values());
    const watching = items.filter(i => i.status === "watching").length;
    const completed = items.filter(i => i.status === "completed").length;
    const planned = items.filter(i => i.status === "planned").length;
    const stats = [
      { n: items.length, l: "Tracked" },
      { n: watching, l: "Watching" },
      { n: completed, l: "Completed" },
      { n: planned, l: "Planned" },
      { n: items.filter(i => i.mediaType === "movie").length, l: "Movies" },
      { n: items.filter(i => i.mediaType === "tv").length, l: "TV Shows" }
    ];
    $("#profile-stats").innerHTML = stats.map(s => `
      <div class="stat-box"><div class="n">${s.n}</div><div class="l">${s.l}</div></div>
    `).join("");
  }

  /* ---------------- Detail modal ---------------- */
  const backdrop = $("#modal-backdrop");
  const modalBody = $("#modal-body");

  async function openDetail(id, mediaType) {
    backdrop.hidden = false;
    document.body.style.overflow = "hidden";
    modalBody.innerHTML = `<div class="loader"></div>`;
    try {
      const details = mediaType === "tv" ? await TMDB.tvDetails(id) : await TMDB.movieDetails(id);
      modalContext = { id, mediaType, details };
      renderModal();

      // The user is looking at this title right now — sync its library
      // entry (if any) to these freshly-fetched details immediately,
      // rather than waiting for the next background sweep.
      const key = libKey(mediaType, id);
      if (library.has(key)) {
        refreshLibraryItemMetadata(key, mediaType, id, details).then(reopenedTitle => {
          if (reopenedTitle) toast(`New episodes available for ${reopenedTitle}`);
        }).catch(err => console.warn("Metadata refresh failed", err));
      }
    } catch (err) {
      modalBody.innerHTML = `<p class="view-sub" style="padding:30px;">Couldn't load details right now.</p>`;
      console.error(err);
    }
  }

  function closeDetail() {
    backdrop.hidden = true;
    document.body.style.overflow = "";
    modalContext = null;
  }
  $("#modal-close").addEventListener("click", closeDetail);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeDetail(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !backdrop.hidden) closeDetail(); });

  function renderModal() {
    const { id, mediaType, details } = modalContext;
    const title = mediaType === "tv" ? details.name : details.title;
    const date = mediaType === "tv" ? details.first_air_date : details.release_date;
    const runtime = mediaType === "tv"
      ? (details.number_of_seasons ? `${details.number_of_seasons} season${details.number_of_seasons > 1 ? "s" : ""}` : "")
      : (details.runtime ? `${details.runtime} min` : "");
    const genres = (details.genres || []).map(g => g.name).slice(0, 3).join(" · ");
    const backdropUrl = TMDB.backdrop(details.backdrop_path || details.poster_path);

    const key = libKey(mediaType, id);
    const entry = library.get(key);
    const totalEpisodes = mediaType === "tv" ? (details.number_of_episodes || null) : null;

    const cast = ((details.credits && details.credits.cast) || []).slice(0, 10);

    modalBody.innerHTML = `
      <div class="detail-hero">${backdropUrl ? `<img src="${backdropUrl}" alt="" />` : ""}</div>
      <div class="detail-info">
        <h2>${escapeHtml(title)}</h2>
        <div class="detail-meta">
          <span>${yearOf(date)}</span>
          ${runtime ? `<span>· ${runtime}</span>` : ""}
          ${genres ? `<span>· ${escapeHtml(genres)}</span>` : ""}
          ${details.vote_average ? `<span>· ★ ${details.vote_average.toFixed(1)} TMDB</span>` : ""}
        </div>
        <p class="detail-overview">${escapeHtml(details.overview || "No synopsis available.")}</p>

        <div class="status-select-row" id="status-select-row"></div>

        <div class="rating-row">
          <span class="view-sub" style="margin:0;">Your rating</span>
          <div class="stars" id="star-row"></div>
        </div>

        ${mediaType === "tv" ? `
        <div class="episode-tracker">
          <h4>Episode Progress</h4>
          <div class="ep-controls">
            <button class="ep-btn" id="ep-minus">−</button>
            <div class="ep-progress">
              <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--ink-dim);">
                <span id="ep-count-label">0 / ${totalEpisodes || "?"}</span>
              </div>
              <div class="ep-progress-bar"><div class="ep-progress-fill" id="ep-fill" style="width:0%"></div></div>
            </div>
            <button class="ep-btn" id="ep-plus">+</button>
          </div>
        </div>` : ""}

        ${cast.length ? `
        <h4 style="font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:var(--ink-dim);margin:0 0 10px;">Cast</h4>
        <div class="cast-row">
          ${cast.map(c => `
            <div class="cast-chip">
              ${c.profile_path ? `<img src="${TMDB.poster(c.profile_path, "w185")}" alt="${escapeHtml(c.name)}" />` : `<div class="poster-fallback" style="width:76px;height:76px;border-radius:50%;">${escapeHtml(c.name.split(" ").map(n=>n[0]).slice(0,2).join(""))}</div>`}
              <div class="cn">${escapeHtml(c.name)}</div>
            </div>
          `).join("")}
        </div>` : ""}

        ${entry ? `<div class="remove-row"><button class="remove-btn" id="remove-item">Remove from Library</button></div>` : ""}
      </div>
    `;

    // Status pills
    const statusRow = $("#status-select-row");
    STATUS_ORDER.forEach(status => {
      const btn = document.createElement("button");
      btn.className = `status-opt sel-${status}` + (entry && entry.status === status ? " active" : "");
      btn.textContent = STATUS_LABELS[status];
      btn.addEventListener("click", async () => {
        await upsertLibraryItem({
          id, mediaType, title, posterPath: details.poster_path, releaseDate: date,
          status, totalEpisodes, metaSyncedAt: Date.now()
        });
        toast(`Added to ${STATUS_LABELS[status]}`);
        renderModal();
      });
      statusRow.appendChild(btn);
    });

    // Stars
    const starRow = $("#star-row");
    const currentRating = entry ? entry.rating || 0 : 0;
    for (let i = 1; i <= 5; i++) {
      const btn = document.createElement("button");
      btn.className = "star-btn" + (i <= currentRating ? " filled" : "");
      btn.textContent = "★";
      btn.addEventListener("click", async () => {
        const newRating = currentRating === i ? 0 : i; // tap same star again to clear
        await upsertLibraryItem({
          id, mediaType, title, posterPath: details.poster_path, releaseDate: date,
          rating: newRating, status: (entry && entry.status) || "planned", totalEpisodes, metaSyncedAt: Date.now()
        });
        renderModal();
      });
      starRow.appendChild(btn);
    }

    // Episode tracker
    if (mediaType === "tv") {
      let watched = entry ? (entry.watchedEpisodes || 0) : 0;
      const cap = totalEpisodes || 9999;
      const updateEpUI = () => {
        $("#ep-count-label").textContent = `${watched} / ${totalEpisodes || "?"}`;
        $("#ep-fill").style.width = totalEpisodes ? `${Math.min(100, (watched / totalEpisodes) * 100)}%` : "0%";
      };
      updateEpUI();
      $("#ep-minus").addEventListener("click", async () => {
        watched = Math.max(0, watched - 1);
        updateEpUI();
        await upsertLibraryItem({
          id, mediaType, title, posterPath: details.poster_path, releaseDate: date,
          watchedEpisodes: watched, status: (entry && entry.status) || "watching", totalEpisodes, metaSyncedAt: Date.now()
        });
      });
      $("#ep-plus").addEventListener("click", async () => {
        watched = Math.min(cap, watched + 1);
        updateEpUI();
        const autoStatus = totalEpisodes && watched >= totalEpisodes ? "completed" : ((entry && entry.status) || "watching");
        await upsertLibraryItem({
          id, mediaType, title, posterPath: details.poster_path, releaseDate: date,
          watchedEpisodes: watched, status: autoStatus, totalEpisodes, metaSyncedAt: Date.now()
        });
        if (autoStatus === "completed") toast("Marked as completed 🎬");
      });
    }

    const removeBtn = $("#remove-item");
    if (removeBtn) {
      removeBtn.addEventListener("click", async () => {
        await removeLibraryItem(mediaType, id);
        toast("Removed from library");
        closeDetail();
      });
    }
  }

  /* ---------------- Init ---------------- */
  setAuthMode("signin");
  switchView("tv");
})();
