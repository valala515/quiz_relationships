// api.js — Relationships Quiz backend client
// Manages session identity, A/B variant, UTM capture, and all backend submissions.
// The quiz works fully without a backend — every network call degrades silently.

const QuizAPI = (() => {
  // ─── Storage keys ────────────────────────────────────────────────────────────

  const STORAGE_UID_KEY        = "nms_quiz_uid";
  const STORAGE_DATA_KEY       = "nms_quiz_session";
  const STORAGE_AB_KEY         = "nms_quiz_ab_variant";
  const STORAGE_AB_SOURCE_KEY  = "nms_quiz_ab_variant_source";
  const STORAGE_AB_EXP_KEY     = "nms_quiz_ab_experiment_id";

  // ─── Private state ───────────────────────────────────────────────────────────

  let _config         = null;
  let _configPromise  = null;
  let _initPromise    = null;
  let _memUID         = null;   // fallback when sessionStorage blocked (some in-app browsers)
  let _memSession     = {};
  let _memAbVariant   = "A";
  let _memAbSource    = "missing";
  let _memAbExpId     = "";
  let _plans          = { special_offer: [], regular_offer: [], discount_offer: [] };

  // ─── UUID ────────────────────────────────────────────────────────────────────

  function _generateUUID() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  // ─── Session storage (with in-memory fallback) ───────────────────────────────

  function _storageGet(key) {
    try { return sessionStorage.getItem(key); } catch { return null; }
  }

  function _storageSet(key, value) {
    try { sessionStorage.setItem(key, value); return true; } catch { return false; }
  }

  function _storageRemove(key) {
    try { sessionStorage.removeItem(key); } catch {}
  }

  function _getUID() {
    const stored = _storageGet(STORAGE_UID_KEY);
    if (stored) { _memUID = stored; return stored; }
    const uid = _memUID || _generateUUID();
    _memUID = uid;
    _storageSet(STORAGE_UID_KEY, uid);
    console.log("[QuizAPI] New session UID:", uid);
    return uid;
  }

  function _getCurrentUID() {
    return _storageGet(STORAGE_UID_KEY) || _memUID || _getUID();
  }

  // Initialise UID as soon as the module loads
  _getUID();

  // ─── A/B variant ─────────────────────────────────────────────────────────────

  function _setVariant(variant, source, experimentId) {
    _memAbVariant = variant;
    _memAbSource  = source;
    _memAbExpId   = experimentId || "";
    _storageSet(STORAGE_AB_KEY,        variant);
    _storageSet(STORAGE_AB_SOURCE_KEY, source);
    _storageSet(STORAGE_AB_EXP_KEY,    _memAbExpId);
    console.log("[QuizAPI] A/B variant set:", variant, "source:", source);
  }

  function getAbVariant()   { return _storageGet(STORAGE_AB_KEY)        || _memAbVariant; }
  function getAbSource()    { return _storageGet(STORAGE_AB_SOURCE_KEY) || _memAbSource; }
  function getAbExpId()     { return _storageGet(STORAGE_AB_EXP_KEY)    || _memAbExpId; }

  function _normalizeOfferThemeVariant(value) {
    const raw = String(value || "").trim().toLowerCase();
    const map = {
      a: "A",
      orange: "A",
      b: "B",
      blue: "B",
      c: "C",
      green: "C",
    };
    return map[raw] || null;
  }

  // ─── URL variant override (QA) ───────────────────────────────────────────────

  function _applyUrlVariantOverride(experimentName) {
    const urlOverride = new URLSearchParams(window.location.search).get("variant");
    if (!urlOverride) return false;
    const v = _normalizeOfferThemeVariant(urlOverride);
    if (!v) return false;
    _setVariant(v, "url_override", experimentName);
    console.log("[QuizAPI] Variant overridden via URL:", v);
    return true;
  }

  // ─── Statsig A/B init ────────────────────────────────────────────────────────

  async function _loadScript(src, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("script_timeout")), timeoutMs);
      const s = document.createElement("script");
      s.src = src;
      s.onload  = () => { clearTimeout(timer); resolve(); };
      s.onerror = () => { clearTimeout(timer); reject(new Error("script_load_error")); };
      document.head.appendChild(s);
    });
  }

  async function _initAbTest(statsigConfig) {
    const sg = statsigConfig;

    // QA URL override takes priority over everything
    if (_applyUrlVariantOverride(sg ? sg.experiment_name : "")) return;

    // No Statsig config or placeholder key → default to A (only variant for now)
    if (!sg || !sg.enabled || !sg.client_key || sg.client_key.startsWith("client-REPLACE")) {
      _setVariant("A", "disabled", sg ? sg.experiment_name : "");
      return;
    }

    try {
      await _loadScript(sg.sdk_url, sg.timeout_ms || 1200);

      const client = new StatsigClient(
        sg.client_key,
        { userID: _getCurrentUID() },
        { environment: { tier: sg.environment || "production" } }
      );
      await client.initializeAsync();

      const raw = client.getExperiment(sg.experiment_name).get(sg.variant_parameter, null);
      const variant = _normalizeOfferThemeVariant(raw);

      if (variant) {
        _setVariant(variant, "statsig", sg.experiment_name);
      } else {
        // No active experiment yet — default to A (orange offer page)
        _setVariant("A", "missing", sg.experiment_name);
      }
    } catch (err) {
      // Statsig unavailable — fail safe to A
      _setVariant("A", "missing", sg.experiment_name);
      NMSMonitoring && NMSMonitoring.captureMessage("statsig_init_failed", { error: err.message });
      console.warn("[QuizAPI] Statsig init failed, defaulting to variant A:", err.message);
    }
  }

  // ─── UTM params ──────────────────────────────────────────────────────────────

  function _getUTMParams() {
    const params = new URLSearchParams(window.location.search);
    const utms = {};
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach((key) => {
      const val = params.get(key);
      if (val !== null) utms[key] = val;
    });
    return utms;
  }

  // ─── Facebook Pixel ──────────────────────────────────────────────────────────

  function _afterTrackingReady(callback) {
    if (window.NMS_TRACKERS_READY || window.NMS_FIRST_SCREEN_RENDERED) {
      setTimeout(callback, 0);
      return;
    }
    window.addEventListener("nms:tracking-ready", () => setTimeout(callback, 0), { once: true });
  }

  function _loadFacebookPixel(pixelId) {
    /* eslint-disable */
    !function(f,b,e,v,n,t,s){
      if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version="2.0";n.queue=[];
      t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)
    }(window,document,"script","https://connect.facebook.net/en_US/fbevents.js");
    /* eslint-enable */
    window.fbq("init", String(pixelId));
    window.fbq("track", "PageView");
    console.log("[QuizAPI] Facebook pixel initialised:", pixelId);
  }

  function _initFacebookPixel(pixelId) {
    _afterTrackingReady(() => _loadFacebookPixel(pixelId));
  }

  function trackFB(event, data) {
    if (typeof window.fbq !== "function") return;
    const pixel = _config && _config._fbPixelId;
    if (pixel) {
      window.fbq("trackSingle", pixel, event, data || {});
    } else {
      window.fbq("track", event, data || {});
    }
    console.log("[QuizAPI] FB pixel event:", event, data || {});
  }

  // ─── Network ─────────────────────────────────────────────────────────────────

  async function _fetchWithRetry(url, options, attempt) {
    const RETRY_DELAYS = [1000, 3000, 5000];
    attempt = attempt || 0;
    try {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response;
    } catch (err) {
      if (attempt < RETRY_DELAYS.length) {
        await new Promise((res) => setTimeout(res, RETRY_DELAYS[attempt]));
        return _fetchWithRetry(url, options, attempt + 1);
      }
      throw err;
    }
  }

  // ─── Local session cache ─────────────────────────────────────────────────────

  function _getSession() {
    const raw = _storageGet(STORAGE_DATA_KEY);
    if (!raw) return _memSession;
    try { return JSON.parse(raw); } catch { return _memSession; }
  }

  function _mergeSession(payload) {
    const session = _getSession();
    if (payload.email) session.email = payload.email;
    if (payload.data && typeof payload.data === "object") {
      session.data = Object.assign(session.data || {}, payload.data);
    }
    _memSession = session;
    _storageSet(STORAGE_DATA_KEY, JSON.stringify(session));
    return session;
  }

  function getSession() { return _getSession(); }

  // ─── Config loader ───────────────────────────────────────────────────────────

  async function _ensureConfig() {
    if (_config) return _config;
    if (_configPromise) return _configPromise;

    _configPromise = fetch("./qauth.json")
      .then((r) => r.json())
      .then((cfg) => {
        _config = cfg;
        console.log("[QuizAPI] Config loaded:", cfg.slug);
        return cfg;
      })
      .catch((err) => {
        _configPromise = null;
        throw err;
      });

    return _configPromise;
  }

  // ─── Init ────────────────────────────────────────────────────────────────────

  async function _doInit() {
    // 1. Load local qauth.json (needed before any submission)
    await _ensureConfig();

    // 2. Init Sentry monitoring
    if (typeof NMSMonitoring !== "undefined") {
      NMSMonitoring.init(_config);
    }

    // 3. Fetch backend config (pixels + subscription plans)
    let backendData = null;
    try {
      const res = await _fetchWithRetry(_config.endpoint, {
        headers: { "X-API-KEY": _config.api_key },
      });
      const json = await res.json();
      backendData = json.data || json;

      const sp = backendData.subscription_plans || {};
      _plans = {
        special_offer:  Array.isArray(sp.special_offer)  ? sp.special_offer  : [],
        regular_offer:  Array.isArray(sp.regular_offer)  ? sp.regular_offer  : [],
        discount_offer: Array.isArray(sp.discount_offer) ? sp.discount_offer : [],
      };
      console.log("[QuizAPI] Subscription plans loaded:", _plans);

      const fbPixel = (backendData.pixels || []).find((p) => p.type === "facebook");
      if (fbPixel && fbPixel.pixel) {
        _config._fbPixelId = fbPixel.pixel;
        _initFacebookPixel(fbPixel.pixel);
      } else {
        console.warn("[QuizAPI] No Facebook pixel in backend config.");
      }
    } catch (err) {
      console.warn("[QuizAPI] Backend config fetch failed (quiz continues):", err.message);
      NMSMonitoring && NMSMonitoring.captureMessage("api_config_failed", { error: err.message });
    }

    // 4. A/B variant (Statsig or fallback to A)
    await _initAbTest(_config.statsig);

    // 5. Send UTMs immediately if present
    const utms = _getUTMParams();
    if (Object.keys(utms).length > 0) {
      _mergeSession({ data: utms });
      try {
        await _sendSubmission({ data: utms });
        console.log("[QuizAPI] UTM params sent:", utms);
      } catch (err) {
        console.warn("[QuizAPI] UTM send failed:", err.message);
      }
    }
  }

  function init() {
    if (!_initPromise) {
      _initPromise = _doInit()
        .then(() => console.log("[QuizAPI] Init complete — variant:", getAbVariant(), "source:", getAbSource()))
        .catch((err) => console.error("[QuizAPI] Init failed:", err));
    }
    return _initPromise;
  }

  // ─── Submit ──────────────────────────────────────────────────────────────────

  async function _sendSubmission(payload) {
    await _ensureConfig();
    const body = Object.assign(
      {
        submission_uid: _getCurrentUID(),
        ab_variant:     getAbVariant(),
        variant_source: getAbSource(),
        experiment_id:  getAbExpId(),
      },
      payload
    );
    console.log("[QuizAPI] POST submission:", JSON.stringify(body));
    const res = await _fetchWithRetry(_config.endpoint + "/submission", {
      method:   "POST",
      headers:  { "X-API-KEY": _config.api_key, "Content-Type": "application/json" },
      keepalive: true,
      body:     JSON.stringify(body),
    });
    const text = await res.text();
    console.log("[QuizAPI] Submission response:", text);
  }

  async function submit(payload) {
    try {
      await _ensureConfig();
    } catch (err) {
      console.warn("[QuizAPI] Submission skipped — config unavailable:", err.message);
      return;
    }
    if (!_config || !_getCurrentUID()) return;

    _mergeSession(payload);

    try {
      await _sendSubmission(payload);
    } catch (err) {
      console.warn("[QuizAPI] Submission failed (saved locally):", err.message);
      NMSMonitoring && NMSMonitoring.captureMessage("submission_failed", { error: err.message });
    }
  }

  // Convenience wrapper — emits a step event
  function trackStep(step) {
    submit({ data: { step } });
  }

  // ─── Payment Intent ──────────────────────────────────────────────────────────

  async function createPaymentIntent(subscriptionPlanId) {
    if (_initPromise) await _initPromise;
    if (!_config) throw new Error("QuizAPI not initialised");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(_config.payment_intent_url, {
        method:  "POST",
        headers: { "X-API-KEY": _config.api_key, "Content-Type": "application/json" },
        body: JSON.stringify({
          submission_uid:        _getCurrentUID(),
          subscription_plan_id:  subscriptionPlanId,
          payment_method:        "stripe",
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error("payment_intent_http_" + res.status);

      const json = await res.json();
      const secret = (json.data && json.data.client_secret) || json.client_secret || json.clientSecret;
      if (!secret) throw new Error("no_client_secret_in_response");
      console.log("[QuizAPI] Payment intent created.");
      return secret;
    } catch (err) {
      clearTimeout(timer);
      NMSMonitoring && NMSMonitoring.captureException(err, { step: "create_payment_intent" });
      throw err;
    }
  }

  // Legacy redirect-based checkout (kept for compatibility, not used in active flow)
  async function checkout(subscriptionPlanId) {
    if (_initPromise) await _initPromise;
    if (!_config) throw new Error("QuizAPI not initialised");
    const body = { submission_uid: _getCurrentUID(), subscription_plan_id: subscriptionPlanId };
    const res = await _fetchWithRetry(_config.endpoint + "/checkout", {
      method:  "POST",
      headers: { "X-API-KEY": _config.api_key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!json.data || !json.data.payment_url) throw new Error("No payment_url in response");
    return json.data.payment_url;
  }

  // ─── Reset (dev / testing) ───────────────────────────────────────────────────

  function reset() {
    [STORAGE_UID_KEY, STORAGE_DATA_KEY, STORAGE_AB_KEY, STORAGE_AB_SOURCE_KEY, STORAGE_AB_EXP_KEY]
      .forEach(_storageRemove);
    _memUID = null;
    _memSession = {};
    _memAbVariant = "A";
    _memAbSource  = "missing";
    _memAbExpId   = "";
    console.log("[QuizAPI] Session cleared.");
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  return {
    init,
    submit,
    trackStep,
    trackFB,
    createPaymentIntent,
    checkout,
    reset,
    getSession,
    getPlans: () => _plans,
    getUID:         _getCurrentUID,
    getAbVariant,
    getAbSource,
    getAbExpId,
    getSlug:            () => _config ? _config.slug            : null,
    getApiKey:          () => _config ? _config.api_key         : null,
    getStripePk:        () => _config ? _config.stripe_pk       : null,
    getPaymentIntentUrl:() => _config ? _config.payment_intent_url : null,
    getSuccessUrl:      () => _config ? _config.success_url     : null,
    isInitialised:      () => !!_config,
  };
})();
