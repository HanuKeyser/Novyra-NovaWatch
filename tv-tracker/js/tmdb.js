/* =====================================================================
   TMDB API layer
   ===================================================================== */
const TMDB_KEY = "c8dc4239290060d91afd45c40d8182b7";
const TMDB_BASE = "https://api.themoviedb.org/3";
const IMG_BASE = "https://image.tmdb.org/t/p/";

const TMDB = {
  poster(path, size = "w342") {
    return path ? `${IMG_BASE}${size}${path}` : null;
  },
  backdrop(path, size = "w780") {
    return path ? `${IMG_BASE}${size}${path}` : null;
  },
  async _get(path, params = {}) {
    const url = new URL(`${TMDB_BASE}${path}`);
    url.searchParams.set("api_key", TMDB_KEY);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
    });
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`TMDB ${res.status} on ${path}`);
    return res.json();
  },

  trending(mediaType = "all", window = "day") {
    return this._get(`/trending/${mediaType}/${window}`);
  },
  popularMovies(page = 1) {
    return this._get("/movie/popular", { page });
  },
  popularTV(page = 1) {
    return this._get("/tv/popular", { page });
  },
  topRatedMovies(page = 1) {
    return this._get("/movie/top_rated", { page });
  },
  topRatedTV(page = 1) {
    return this._get("/tv/top_rated", { page });
  },
  upcomingMovies(page = 1) {
    return this._get("/movie/upcoming", { page });
  },
  airingTodayTV(page = 1) {
    return this._get("/tv/airing_today", { page });
  },
  onTheAirTV(page = 1) {
    return this._get("/tv/on_the_air", { page });
  },
  search(query, page = 1) {
    return this._get("/search/multi", { query, page, include_adult: false });
  },
  movieDetails(id) {
    return this._get(`/movie/${id}`, { append_to_response: "credits,videos" });
  },
  tvDetails(id) {
    return this._get(`/tv/${id}`, { append_to_response: "credits,videos" });
  }
};
