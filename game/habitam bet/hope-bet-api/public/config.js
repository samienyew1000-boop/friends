(function () {
  const meta = document.querySelector('meta[name="habtam-bet-api"], meta[name="hope-bet-api"]');
  const fromMeta = (meta && meta.getAttribute("content") || "").trim();
  const host = window.location.hostname;
  const isLocal = host === "localhost" || host === "127.0.0.1";

  let storageApi = "";
  try {
    storageApi = (localStorage.getItem("habtam_bet_api_url") || localStorage.getItem("hope_bet_api_url") || "").trim();
  } catch (_) {}

  let apiUrl = "";
  if (storageApi) {
    apiUrl = storageApi;
  } else if (fromMeta && !fromMeta.includes("127.0.0.1") && !fromMeta.includes("localhost")) {
    apiUrl = fromMeta;
  } else if (isLocal) {
    apiUrl = fromMeta || "http://127.0.0.1:8787";
  } else {
    apiUrl = "https://multi-shop-games-2.onrender.com/api/games/sportsbook";
  }

  const appConfig = {
    API_URL: String(apiUrl || "").replace(/\/+$/, ""),
    CURRENCY: "ETB",
    TOKEN_KEY: "habtam-bet-token",
    USER_KEY: "habtam-bet-user",
    CASHOUT_LOCKED: false,
  };

  window.HABTAM_BET_CONFIG = appConfig;
  window.HOPE_BET_CONFIG = appConfig;
})();