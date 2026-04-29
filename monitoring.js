// monitoring.js — Sentry wrapper for Relationships Quiz
// Initialises only when qauth.json supplies a non-empty sentry_dsn.
// All methods are safe to call before Sentry loads — events queue and flush.

const NMSMonitoring = (() => {
  let _ready = false;
  const _queue = [];

  const BLOCKED_KEYS = /api[_-]?key|stripe|secret|dsn|token|password|card|cvv|cvc|authorization/i;

  function _sanitize(obj) {
    if (!obj || typeof obj !== "object") return obj;
    const result = {};
    Object.entries(obj).forEach(([k, v]) => {
      if (BLOCKED_KEYS.test(k)) return;
      if (typeof v === "string" && v.includes("@")) {
        result[k] = v.replace(/(.{2}).+(@.+)/, "$1***$2");
      } else {
        result[k] = v;
      }
    });
    return result;
  }

  function _safeRun(fn) {
    if (_ready) {
      try { fn(); } catch (e) { /* never block quiz flow */ }
    } else {
      _queue.push(fn);
    }
  }

  function _flush() {
    while (_queue.length) {
      try { _queue.shift()(); } catch (e) {}
    }
  }

  return {
    init(config) {
      if (!config || !config.sentry_dsn) return;
      const script = document.createElement("script");
      script.src = "https://browser.sentry-cdn.com/7.120.0/bundle.min.js";
      script.crossOrigin = "anonymous";
      script.onload = () => {
        try {
          Sentry.init({
            dsn: config.sentry_dsn,
            environment: config.sentry_environment || "production",
            release: config.sentry_release || "relationships@1.0.0",
            defaultIntegrations: false,
          });
          _ready = true;
          _flush();
          console.log("[NMSMonitoring] Sentry initialised:", config.sentry_environment);
        } catch (e) {}
      };
      document.head.appendChild(script);
    },

    captureException(error, context) {
      _safeRun(() => Sentry.captureException(error, { extra: _sanitize(context) }));
    },

    captureMessage(message, context) {
      _safeRun(() => Sentry.captureMessage(message, { extra: _sanitize(context) }));
    },

    addBreadcrumb(category, message, data) {
      _safeRun(() => Sentry.addBreadcrumb({ category, message, data: _sanitize(data) }));
    },

    setUserContext(data) {
      _safeRun(() => Sentry.setUser(_sanitize(data)));
    },

    setSessionContext(data) {
      _safeRun(() => Sentry.setContext("session", _sanitize(data)));
    },
  };
})();
