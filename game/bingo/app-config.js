// Africa Bingo API Configuration
// Authoritative backend URL for multi-device sync
(function () {
  "use strict";
  const params = new URLSearchParams(window.location.search);
  const apiParam = params.get("api");

  // Determine authoritative backend URL
  const isEthioDeploy = window.location.origin && window.location.origin.includes("ethiodeploy.com");
  const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  const isBingoPath = window.location.pathname.startsWith("/bingo");

  let DEFAULT_BACKEND_URL = "https://africa-bingo.ethiodeploy.com";
  if (isEthioDeploy) {
    DEFAULT_BACKEND_URL = window.location.origin;
  } else if (isLocal) {
    DEFAULT_BACKEND_URL = isBingoPath ? (window.location.origin + "/bingo") : (window.location.origin || "http://localhost:3000");
  }

  if (apiParam) {
    try {
      localStorage.setItem("lb_api_url", apiParam.replace(/\/+$/, ""));
    } catch (e) {}
    window.LUCKY_BINGO_API_URL = apiParam;
  } else {
    try {
      const stored = localStorage.getItem("lb_api_url");
      if (!stored || stored.includes(":3005") || stored.includes("trycloudflare.com") || stored.includes("lucky-bingo")) {
        localStorage.setItem("lb_api_url", DEFAULT_BACKEND_URL);
      }
    } catch (e) {}
    let activeUrl = localStorage.getItem("lb_api_url") || DEFAULT_BACKEND_URL;
    if (activeUrl.includes(":3005") || activeUrl.includes("trycloudflare.com") || activeUrl.includes("lucky-bingo")) {
      activeUrl = DEFAULT_BACKEND_URL;
      try {
        localStorage.setItem("lb_api_url", DEFAULT_BACKEND_URL);
      } catch (e) {}
    }
    window.LUCKY_BINGO_API_URL = activeUrl;
  }
})();
