// Relationships Quiz analytics dashboard.
// Internal URL: analytics.html?access=nms-relationships-analytics-2026

const ACCESS_TOKEN = "nms-relationships-analytics-2026";

(function guardAnalyticsAccess() {
  const given = new URLSearchParams(window.location.search).get("access");
  if (given !== ACCESS_TOKEN) {
    document.documentElement.innerHTML = "";
    window.location.replace("./index.html");
  }
})();

const Analytics = (() => {
  const PER_PAGE = 50;
  const API_PER_PAGE = 9999;
  const API_MAX_PAGES = 100;
  const QUESTION_STEP_COUNT = 28;
  const FIRST_SCREEN_METRIC_START_AT = "2026-04-29T00:00:00Z";
  const FIRST_SCREEN_METRIC_START_TS = Date.parse(FIRST_SCREEN_METRIC_START_AT);
  const FIRST_SCREEN_METRIC_START_LABEL = "29 Apr 2026";
  const AB_EXPERIMENT_START_AT = "2026-04-29T00:00:00Z";
  const AB_EXPERIMENT_START_TS = Date.parse(AB_EXPERIMENT_START_AT);
  const AB_DECISION_TARGET_PER_VARIANT = 2325;
  const AB_DIRECTIONAL_DAYS = 14;
  const CAMPAIGN_TOP_N = 10;
  const CAMPAIGN_PERFORMANCE_LIMIT = 12;
  const CAMPAIGN_MIN_SESSIONS = 20;
  const CAMPAIGN_NONE_LABEL = "No UTM Campaign";
  const CAMPAIGN_OTHER_LABEL = "Other";
  const CAMPAIGN_COLORS = [
    "#f97316", "#0ea5e9", "#14b8a6", "#84cc16", "#ef4444",
    "#eab308", "#ec4899", "#6366f1", "#22c55e", "#06b6d4"
  ];

  const VARIANTS = [
    // { key: "orange", code: "A", label: "Orange", aliases: ["a", "orange"] }, // A/B paused
    // { key: "blue",   code: "B", label: "Blue",   aliases: ["b", "blue"]   }, // A/B paused
    { key: "green",  code: "C", label: "Green",  aliases: ["c", "green"]  },
  ];

  const STEPS_ORDER = [
    "gender",
    "age",
    "welcome",
    ...Array.from({ length: QUESTION_STEP_COUNT }, (_, i) => `question-${i + 1}`),
    "expert",
    "social-proof",
    "email",
    "first-name",
    "nervous-system-profile",
    "growth-projection",
    "plan-builder",
    "safety-chart",
    "scratch-card",
    "offer-page",
    "checkout-page",
  ];

  const FUNNEL = [
    { label: "Started", test: () => true },
    { label: "Reached Q5", test: s => _hasStep(s, "question-5") },
    { label: "Reached Q10", test: s => _hasStep(s, "question-10") },
    { label: "Email form", test: s => _hasStep(s, "email") },
    { label: "Email captured", test: s => _hasEmailCaptured(s) },
    { label: "Offer Page", test: s => _hasReachedOfferPage(s) },
    { label: "Checkout Page", test: s => _hasReachedCheckoutPage(s) },
    { label: "Paid", test: s => _isPaid(s) },
  ];

  const AB_FUNNEL = [
    { label: "Reached Q5", test: s => _hasStep(s, "question-5") },
    { label: "Reached Q10", test: s => _hasStep(s, "question-10") },
    { label: "Email form", test: s => _hasStep(s, "email") },
    { label: "Email captured", test: s => _hasEmailCaptured(s) },
    { label: "Offer Page", test: s => _hasReachedOfferPage(s) },
    { label: "Checkout Page", test: s => _hasReachedCheckoutPage(s) },
    { label: "Paid", test: s => _isPaid(s) },
  ];

  const KEY_STEPS = new Set(["email", "first-name", "offer-page", "checkout-page"]);

  const EXCLUDE_PATTERNS = [
    /valeria/i,
    /valera/i,
    /newmindstart/i,
    /ivashkina\.vv/i,
    /ivaskina\.vv/i,
    /olegshov\.art/i,
    /^rassolnyininza(\+[^@]*)?@/i,
    /^assolnyininza(\+[^@]*)?@/i,
    /^123@/i,
    /^1234@/i,
    /^pukur@/i,
    /^test(\+[^@]*)?@/i,
  ];

  let _sessions = [];
  let _filtered = [];
  let _page = 1;
  let _openUid = null;
  let _sortKey = "created_at";
  let _sortDir = -1;
  let _campaignSortKey = "secondScreenRate";
  let _campaignSortDir = -1;
  let _searchTimer = null;
  let _abExperimentName = "relationships_offer_theme_test";

  function _field(session, key) {
    if (!session) return undefined;
    if (Object.prototype.hasOwnProperty.call(session, key)) return session[key];
    if (session.data && typeof session.data === "object" && Object.prototype.hasOwnProperty.call(session.data, key)) {
      return session.data[key];
    }
    return undefined;
  }

  function _stepName(step) {
    if (!step) return "";
    return step.step || step.name || step.id || "";
  }

  function _hasStep(session, step) {
    return Array.isArray(session.steps) && session.steps.some(item => _stepName(item) === step);
  }

  function _isTruthyMetric(value) {
    return value === true || value === 1 || value === "1" || String(value).toLowerCase() === "true";
  }

  function _numberField(session, key) {
    const value = _field(session, key);
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function _createdTs(session) {
    const ts = Date.parse(session && session.created_at);
    return Number.isFinite(ts) ? ts : 0;
  }

  function _isPaid(session) {
    const paymentStatus = String(_field(session, "payment_status") || "").toLowerCase();
    return String(session.status || "").toLowerCase() === "paid" || paymentStatus === "success" || paymentStatus === "paid";
  }

  function _hasReachedCheckoutPage(session) {
    return _hasStep(session, "checkout-page");
  }

  function _hasReachedOfferPage(session) {
    const status = String(session.status || "").toLowerCase();
    return _isPaid(session) || _hasReachedCheckoutPage(session) || status === "checkout" || status === "paid" || _hasStep(session, "offer-page");
  }

  function _hasEmailCaptured(session) {
    const status = String(session.status || "").toLowerCase();
    return Boolean(_field(session, "email") || session.email)
      || _hasReachedOfferPage(session)
      || _isPaid(session)
      || ["email", "checkout", "paid"].includes(status)
      || _hasStep(session, "first-name");
  }

  function _derivedStatus(session) {
    if (_isPaid(session)) return "paid";
    if (_hasReachedCheckoutPage(session)) return "checkout-page";
    if (_hasReachedOfferPage(session)) return "offer-page";
    if (_hasEmailCaptured(session)) return "email";
    return "started";
  }

  function _hasFirstScreenRendered(session) {
    return _isTruthyMetric(_field(session, "first_screen_rendered"));
  }

  function _isFirstScreenMetricTracked(session) {
    const ts = _createdTs(session);
    return ts && ts >= FIRST_SCREEN_METRIC_START_TS;
  }

  function _pctNumber(n, total) {
    return total ? n / total : 0;
  }

  function _pct(n, total) {
    if (!total) return "-";
    const pct = (n / total) * 100;
    return pct < 1 && pct > 0 ? pct.toFixed(1) + "%" : Math.round(pct) + "%";
  }

  function _pp(rate) {
    const value = rate * 100;
    const fixed = Math.abs(value) < 1 && value !== 0 ? value.toFixed(1) : Math.round(value);
    return `${fixed}pp`;
  }

  function _fmtSec(seconds) {
    if (seconds === null || seconds === undefined) return "-";
    return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
  }

  function _fmtDate(iso) {
    if (!iso) return "-";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })
      + " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }

  function _fmtDateShort(iso) {
    if (!iso) return "-";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  }

  function _escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function _setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function _hashString(value) {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  }

  function _campaignColor(label) {
    if (label === CAMPAIGN_OTHER_LABEL) return "#94a3b8";
    if (label === CAMPAIGN_NONE_LABEL) return "#64748b";
    return CAMPAIGN_COLORS[_hashString(label) % CAMPAIGN_COLORS.length];
  }

  function _sessionKey(session) {
    return session && (session.uid || session.submission_uid || session.id) || null;
  }

  function _lastStep(session) {
    if (_field(session, "last_step")) return _field(session, "last_step");
    const steps = Array.isArray(session.steps) ? session.steps : [];
    return steps.length ? _stepName(steps[steps.length - 1]) : "";
  }

  function _normalizeSession(session) {
    const steps = Array.isArray(session.steps)
      ? session.steps.slice().sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
      : [];
    return {
      ...session,
      uid: session.uid || session.submission_uid || session.id,
      steps,
    };
  }

  function _extractSessions(json) {
    const sessions = json && (json.sessions || (json.data && json.data.sessions));
    return Array.isArray(sessions) ? sessions : null;
  }

  function _extractTotal(json) {
    const raw = json && (json.total ?? (json.data && json.data.total) ?? (json.meta && json.meta.total));
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  function _setLoadingStatus(page) {
    _setText("lastUpdated", page > 1 ? `Loading sessions... page ${page}` : "Loading sessions...");
  }

  async function _fetchAllSessions(config) {
    const all = [];
    const seen = new Set();
    let backendTotal = null;

    for (let page = 1; page <= API_MAX_PAGES; page++) {
      _setLoadingStatus(page);
      const url = `${config.endpoint}/analytics/sessions?per-page=${API_PER_PAGE}&page=${page}`;
      const res = await fetch(url, { headers: { "X-API-KEY": config.api_key } });
      if (!res.ok) throw new Error("HTTP " + res.status);

      const json = await res.json();
      const sessions = _extractSessions(json);
      if (!sessions) throw new Error("Missing sessions array");

      const total = _extractTotal(json);
      if (total !== null) backendTotal = total;

      let added = 0;
      sessions.forEach((session, index) => {
        const key = _sessionKey(session) || `page:${page}:index:${index}`;
        if (seen.has(key)) return;
        seen.add(key);
        all.push(_normalizeSession(session));
        added += 1;
      });

      if (!added) break;
      if (sessions.length < API_PER_PAGE) break;
      if (backendTotal !== null && all.length >= backendTotal) break;
    }

    return all;
  }

  function _variantKey(session) {
    const raw = String(_field(session, "ab_variant") || "").trim().toLowerCase();
    if (!raw || raw === "null" || raw === "undefined") return "";
    const match = VARIANTS.find(variant => variant.aliases.includes(raw));
    return match ? match.key : raw;
  }

  function _variantMeta(key) {
    return VARIANTS.find(variant => variant.key === key) || null;
  }

  function _variantLabel(session) {
    const key = typeof session === "string" ? session : _variantKey(session);
    const meta = _variantMeta(key);
    return meta ? meta.label : (key ? key : "-");
  }

  function _variantBadge(session) {
    const key = _variantKey(session);
    const meta = _variantMeta(key);
    if (!meta) return `<span class="an-variant an-variant--unknown">-</span>`;
    return `<span class="an-variant an-variant--${meta.key}">${meta.label}</span>`;
  }

  function _variantSource(session) {
    return String(_field(session, "variant_source") || "").toLowerCase();
  }

  function _experimentId(session) {
    return String(_field(session, "experiment_id") || "");
  }

  function _isInAbWindow(session) {
    return _createdTs(session) >= AB_EXPERIMENT_START_TS;
  }

  function _isDecisionSession(session) {
    return _isInAbWindow(session)
      && _experimentId(session) === _abExperimentName
      && _variantSource(session) === "statsig"
      && Boolean(_variantMeta(_variantKey(session)));
  }

  function _statusBadge(status) {
    const labels = {
      started: "Started",
      email: "Email",
      "offer-page": "Offer Page",
      checkout: "Offer Page",
      "checkout-page": "Checkout Page",
      paid: "Paid",
    };
    const cls = status === "checkout" ? "offer-page" : status;
    return `<span class="an-badge an-badge--${_escapeHtml(cls)}">${_escapeHtml(labels[status] || status || "Started")}</span>`;
  }

  function _sortArrow(key) {
    if (_sortKey !== key) return "";
    return _sortDir === -1 ? " desc" : " asc";
  }

  function _campaignSortArrow(key) {
    if (_campaignSortKey !== key) return "";
    return _campaignSortDir === -1 ? " desc" : " asc";
  }

  function _humanStepLabel(step) {
    if (!step) return "-";
    if (/^question-\d+$/.test(step)) {
      if (step === "question-25") return "Evidence screen";
      return step.replace("question-", "Q");
    }
    const labels = {
      gender: "Gender",
      age: "Age",
      welcome: "Welcome",
      expert: "Expert",
      "social-proof": "Social proof",
      community: "Community",
      evidence: "Evidence",
      email: "Email",
      "first-name": "First name",
      "nervous-system-profile": "Profile summary",
      "growth-projection": "Growth projection",
      "plan-builder": "Plan builder",
      "safety-chart": "Safety chart",
      "scratch-card": "Scratch card",
      "offer-page": "Offer Page",
      "checkout-page": "Checkout Page",
    };
    return labels[step] || step;
  }

  function _isTestSession(session) {
    const hasCurly = value => typeof value === "string" && value.includes("{{");
    const email = String(_field(session, "email") || "");
    const firstName = String(_field(session, "first_name") || "");
    if (hasCurly(email) || hasCurly(firstName)) return true;
    if (!email) return false;
    return EXCLUDE_PATTERNS.some(pattern => pattern.test(email));
  }

  function _matchesUtmSearch(session, query) {
    return ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]
      .some(key => String(_field(session, key) || "").toLowerCase().includes(query));
  }

  function _renderStats(data) {
    const total = data.length;
    const tracked = data.filter(_isFirstScreenMetricTracked);
    const trackedTotal = tracked.length;
    const firstScreen = tracked.filter(_hasFirstScreenRendered).length;
    const loadLoss = Math.max(trackedTotal - firstScreen, 0);
    const emails = data.filter(_hasEmailCaptured).length;
    const offer = data.filter(_hasReachedOfferPage).length;
    const checkout = data.filter(_hasReachedCheckoutPage).length;
    const paid = data.filter(_isPaid).length;
    const trackedWindow = `tracked since ${FIRST_SCREEN_METRIC_START_LABEL}`;
    const noTracked = `No data yet. Tracking starts ${FIRST_SCREEN_METRIC_START_LABEL}`;

    _setText("statTotal", total.toLocaleString());
    _setText("statEmail", emails.toLocaleString());
    _setText("statEmailSub", `${_pct(emails, total)} of sessions`);
    _setText("statOffer", offer.toLocaleString());
    _setText("statOfferSub", `${_pct(offer, total)} of sessions`);
    _setText("statCheckout", checkout.toLocaleString());
    _setText("statCheckoutSub", `${_pct(checkout, total)} of sessions`);
    _setText("statPaid", paid.toLocaleString());
    _setText("statPaidSub", `${_pct(paid, total)} of sessions`);
    _setText("statFirstScreen", firstScreen.toLocaleString());
    _setText("statFirstScreenSub", trackedTotal ? `${_pct(firstScreen, trackedTotal)} of tracked sessions` : noTracked);
    _setText("statFirstScreenWindow", trackedTotal ? trackedWindow : "");
    _setText("statLoadLoss", loadLoss.toLocaleString());
    _setText("statLoadLossSub", trackedTotal ? `${_pct(loadLoss, trackedTotal)} of tracked sessions` : noTracked);
    _setText("statLoadLossWindow", trackedTotal ? trackedWindow : "");
  }

  function _variantGroups(data) {
    const decision = data.filter(_isDecisionSession);
    return Object.fromEntries(VARIANTS.map(variant => [
      variant.key,
      decision.filter(session => _variantKey(session) === variant.key),
    ]));
  }

  function _renderAB(data) {
    const windowed = data.filter(_isInAbWindow);
    const decision = windowed.filter(_isDecisionSession);
    const groups = _variantGroups(data);
    const counts = VARIANTS.map(variant => groups[variant.key].length);
    const min = counts.length ? Math.min(...counts) : 0;
    const max = counts.length ? Math.max(...counts) : 0;
    const missing = windowed.filter(session => !_variantKey(session) || ["", "missing", "disabled"].includes(_variantSource(session))).length;
    const other = windowed.filter(session => _variantKey(session) && !_isDecisionSession(session)).length;
    const days = Math.max(1, Math.ceil((Date.now() - AB_EXPERIMENT_START_TS) / 86400000));
    const balance = max ? Math.round((min / max) * 100) : 0;

    let status = "too small";
    let statusClass = "an-ab-status--warn";
    if (!decision.length && other) {
      status = "source risk";
      statusClass = "an-ab-status--risk";
    } else if (min >= AB_DECISION_TARGET_PER_VARIANT && days >= AB_DIRECTIONAL_DAYS) {
      status = "directional";
      statusClass = "an-ab-status--ok";
    } else if (min >= 100) {
      status = "health-check";
      statusClass = "an-ab-status--warn";
    }

    _setText("abExperimentName", _abExperimentName);
    _setText("abExperimentStart", `Start ${AB_EXPERIMENT_START_AT.slice(0, 10)}`);
    // _setText("abOrangeSessions", groups.orange.length.toLocaleString()); // A/B paused
    // _setText("abBlueSessions",  groups.blue.length.toLocaleString());   // A/B paused
    _setText("abGreenSessions", groups.green.length.toLocaleString());
    const statusEl = document.getElementById("abHealthStatus");
    if (statusEl) {
      statusEl.textContent = status;
      statusEl.className = `an-ab-status ${statusClass}`;
    }
    _setText("abHealthSub", `${decision.length.toLocaleString()} decision rows; ${missing.toLocaleString()} missing/disabled; ${other.toLocaleString()} QA/other; ${balance}% split balance.`);

    const summaryBody = document.getElementById("abSummaryBody");
    if (summaryBody) {
      summaryBody.innerHTML = VARIANTS.map(variant => {
        const rows = groups[variant.key];
        const total = rows.length;
        const email = rows.filter(_hasEmailCaptured).length;
        const offer = rows.filter(_hasReachedOfferPage).length;
        const checkout = rows.filter(_hasReachedCheckoutPage).length;
        const paid = rows.filter(_isPaid).length;
        return `
          <tr>
            <td>${_variantBadge({ ab_variant: variant.key })}</td>
            <td>${total.toLocaleString()}</td>
            <td>${_pct(email, total)}</td>
            <td>${_pct(offer, total)}</td>
            <td>${_pct(checkout, total)}</td>
            <td>${_pct(paid, total)}</td>
          </tr>`;
      }).join("");
    }

    const funnelBody = document.getElementById("abFunnelBody");
    if (funnelBody) {
      funnelBody.innerHTML = AB_FUNNEL.map(metric => {
        const rates = VARIANTS.map(variant => {
          const rows = groups[variant.key];
          const n = rows.filter(metric.test).length;
          return { variant, n, rate: _pctNumber(n, rows.length), total: rows.length };
        });
        const sorted = rates.slice().sort((a, b) => b.rate - a.rate);
        const delta = sorted[0].rate - sorted[sorted.length - 1].rate;
        const deltaClass = delta > 0 ? "an-delta--up" : "";
        return `
          <tr>
            <td>${_escapeHtml(metric.label)}</td>
            ${rates.map(item => `<td>${_pct(item.n, item.total)}</td>`).join("")}
            <td class="${deltaClass}">${delta ? `${_escapeHtml(sorted[0].variant.label)} +${_pp(delta)}` : "-"}</td>
          </tr>`;
      }).join("");
    }
  }

  function _renderFunnel(data) {
    const el = document.getElementById("funnelRows");
    if (!el) return;
    if (!data.length) {
      el.innerHTML = `<div class="an-state" style="padding:18px">No sessions match your filters.</div>`;
      return;
    }

    const counts = FUNNEL.map(metric => data.filter(metric.test).length);
    const base = counts[0] || 1;
    el.innerHTML = counts.map((count, index) => {
      const width = Math.round((count / base) * 100);
      return `
        <div class="an-funnel__row">
          <span class="an-funnel__label">${_escapeHtml(FUNNEL[index].label)}</span>
          <div class="an-funnel__bar-track">
            <div class="an-funnel__bar ${index >= 5 ? "an-funnel__bar--late" : ""}" style="width:${width}%"></div>
          </div>
          <span class="an-funnel__n">${count.toLocaleString()}</span>
          <span class="an-funnel__pct">${_pct(count, base)}</span>
        </div>`;
    }).join("");
  }

  function _renderPageTiming(data) {
    const pages = [
      { key: "page1", nextStep: "age" },
      { key: "page2", nextStep: "welcome" },
      { key: "page3", nextStep: "question-1" },
    ];

    pages.forEach(page => {
      const withData = data.filter(session => _numberField(session, `${page.key}_time_seconds`) !== null);
      const n = withData.length;
      const totalSeconds = withData.reduce((sum, session) => sum + _numberField(session, `${page.key}_time_seconds`), 0);
      const avgSeconds = n ? Math.round(totalSeconds / n) : null;
      const engaged = withData.filter(session => _isTruthyMetric(_field(session, `${page.key}_engaged`))).length;
      const completed = withData.filter(session => _field(session, `${page.key}_exit`) === "completed" || _hasStep(session, page.nextStep)).length;
      const dropoff = Math.max(n - completed, 0);

      _setText(`pt-${page.key}-n`, n ? `${n.toLocaleString()} with data` : "No data yet");
      _setText(`pt-${page.key}-avg`, _fmtSec(avgSeconds));
      _setText(`pt-${page.key}-eng`, n ? _pct(engaged, n) : "-");
      _setText(`pt-${page.key}-comp`, n ? _pct(completed, n) : "-");
      _setText(`pt-${page.key}-drop`, n ? dropoff.toLocaleString() : "-");
    });

    const reached = data.filter(_hasReachedOfferPage);
    const reachedN = reached.length;
    const checkoutN = reached.filter(_hasReachedCheckoutPage).length;
    const paidN = reached.filter(_isPaid).length;
    _setText("pt-offer-n", reachedN ? reachedN.toLocaleString() : "No data yet");
    _setText("pt-offer-checkout", reachedN ? checkoutN.toLocaleString() : "-");
    _setText("pt-offer-paid", reachedN ? paidN.toLocaleString() : "-");
    _setText("pt-offer-rate", reachedN ? _pct(paidN, reachedN) : "-");
    _setText("pt-offer-drop", reachedN ? Math.max(reachedN - paidN, 0).toLocaleString() : "-");
  }

  function _renderStepTiming(data) {
    const el = document.getElementById("stepTimingBody");
    if (!el) return;

    const rows = [];
    for (let i = 0; i < STEPS_ORDER.length - 1; i++) {
      const step = STEPS_ORDER[i];
      const nextStep = STEPS_ORDER[i + 1];
      const samples = [];

      data.forEach(session => {
        if (!Array.isArray(session.steps)) return;
        const current = session.steps.find(item => _stepName(item) === step);
        const next = session.steps.find(item => _stepName(item) === nextStep);
        if (!current || !next) return;
        const ms = Date.parse(next.created_at) - Date.parse(current.created_at);
        if (Number.isFinite(ms) && ms >= 0 && ms < 600000) samples.push(ms);
      });

      const avgMs = samples.length ? samples.reduce((sum, ms) => sum + ms, 0) / samples.length : null;
      rows.push({ step, avgSec: avgMs === null ? null : Math.round(avgMs / 1000), n: samples.length });
    }

    const maxAvg = Math.max(...rows.map(row => row.avgSec || 0), 1);
    el.innerHTML = rows.map(row => {
      const width = row.avgSec ? Math.round((row.avgSec / maxAvg) * 100) : 0;
      return `
        <div class="an-stept__row">
          <span class="an-stept__label">${_escapeHtml(_humanStepLabel(row.step))}</span>
          <div class="an-stept__bar-track">
            <div class="an-stept__bar" style="width:${width}%"></div>
          </div>
          <span class="an-stept__avg">${_fmtSec(row.avgSec)}</span>
          <span class="an-stept__n">${row.n ? row.n.toLocaleString() : "-"}</span>
        </div>`;
    }).join("");
  }

  function _campaignStats(data) {
    const map = new Map();
    data.forEach(session => {
      const label = _field(session, "utm_campaign") || CAMPAIGN_NONE_LABEL;
      const current = map.get(label) || {
        label,
        sessions: 0,
        secondScreen: 0,
        offer: 0,
        checkout: 0,
        paid: 0,
      };
      current.sessions += 1;
      if (_hasStep(session, "age")) current.secondScreen += 1;
      if (_hasReachedOfferPage(session)) current.offer += 1;
      if (_hasReachedCheckoutPage(session)) current.checkout += 1;
      if (_isPaid(session)) current.paid += 1;
      map.set(label, current);
    });
    return [...map.values()];
  }

  function _topCampaignSlices(stats, key) {
    const ranked = stats
      .map(item => ({ label: item.label, count: item[key] }))
      .filter(item => item.count > 0)
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    const top = ranked.slice(0, CAMPAIGN_TOP_N);
    const otherCount = ranked.slice(CAMPAIGN_TOP_N).reduce((sum, item) => sum + item.count, 0);
    if (otherCount) top.push({ label: CAMPAIGN_OTHER_LABEL, count: otherCount });
    return top;
  }

  function _campaignMetricRate(item, key) {
    return item.sessions ? item[key] / item.sessions : 0;
  }

  function _fmtCampaignRate(rate) {
    if (!rate) return "0%";
    const pct = rate * 100;
    if (pct < 0.1) return "<0.1%";
    return pct < 1 ? pct.toFixed(1) + "%" : Math.round(pct) + "%";
  }

  function _campaignSortValue(item, key) {
    switch (key) {
      case "label": return item.label.toLowerCase();
      case "sessions": return item.sessions;
      case "secondScreen": return item.secondScreen;
      case "secondScreenRate": return _campaignMetricRate(item, "secondScreen");
      case "offer": return item.offer;
      case "offerRate": return _campaignMetricRate(item, "offer");
      case "checkout": return item.checkout;
      case "checkoutRate": return _campaignMetricRate(item, "checkout");
      case "paid": return item.paid;
      case "paidRate": return _campaignMetricRate(item, "paid");
      default: return 0;
    }
  }

  function _compareCampaignRows(a, b) {
    const va = _campaignSortValue(a, _campaignSortKey);
    const vb = _campaignSortValue(b, _campaignSortKey);
    let diff = 0;
    if (typeof va === "string" || typeof vb === "string") {
      diff = String(va).localeCompare(String(vb));
    } else {
      diff = va - vb;
    }
    if (diff) return diff * _campaignSortDir;
    return b.sessions - a.sessions || a.label.localeCompare(b.label);
  }

  function _bindDonutHover(chartEl) {
    const clear = () => chartEl.querySelectorAll(".is-active").forEach(node => node.classList.remove("is-active"));
    const activate = index => {
      clear();
      chartEl.querySelectorAll(`[data-slice-index="${index}"]`).forEach(node => node.classList.add("is-active"));
    };
    chartEl.querySelectorAll("[data-slice-index]").forEach(node => {
      const index = node.getAttribute("data-slice-index");
      node.addEventListener("mouseenter", () => activate(index));
      node.addEventListener("focus", () => activate(index));
      node.addEventListener("mouseleave", clear);
      node.addEventListener("blur", clear);
    });
  }

  function _renderDonutChart(chartId, totalId, stats, key, totalLabel, emptyText) {
    const el = document.getElementById(chartId);
    if (!el) return;

    const total = stats.reduce((sum, item) => sum + item[key], 0);
    _setText(totalId, total ? `${total.toLocaleString()} ${totalLabel}` : "-");
    const slices = _topCampaignSlices(stats, key);
    if (!total || !slices.length) {
      el.innerHTML = `<div class="an-campaign-empty">${_escapeHtml(emptyText)}</div>`;
      return;
    }

    const radius = 42;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;
    const sliceSvg = slices.map((slice, index) => {
      const dash = (slice.count / total) * circumference;
      const circle = `
        <circle class="an-donut__slice"
          data-slice-index="${index}"
          tabindex="0"
          aria-label="${_escapeHtml(slice.label)}: ${slice.count.toLocaleString()} ${_escapeHtml(totalLabel)}"
          cx="60" cy="60" r="${radius}"
          stroke="${_campaignColor(slice.label)}"
          stroke-dasharray="${dash} ${circumference - dash}"
          stroke-dashoffset="${-offset}"
          transform="rotate(-90 60 60)"></circle>`;
      offset += dash;
      return circle;
    }).join("");

    const legend = slices.map((slice, index) => {
      const pct = Math.round((slice.count / total) * 100);
      return `
        <div class="an-donut-legend__row" data-slice-index="${index}" tabindex="0" title="${_escapeHtml(slice.label)}">
          <span class="an-donut-legend__swatch" style="background:${_campaignColor(slice.label)}"></span>
          <span class="an-donut-legend__label">${_escapeHtml(slice.label)}</span>
          <span class="an-donut-legend__value">${slice.count.toLocaleString()} - ${pct}%</span>
        </div>`;
    }).join("");

    el.innerHTML = `
      <svg viewBox="0 0 120 120" role="img" aria-label="${_escapeHtml(totalLabel)} by UTM campaign">
        <circle class="an-donut__track" cx="60" cy="60" r="${radius}"></circle>
        ${sliceSvg}
        <text class="an-donut__total" x="60" y="58">${total.toLocaleString()}</text>
        <text class="an-donut__label" x="60" y="72">${_escapeHtml(totalLabel)}</text>
      </svg>
      <div class="an-donut-legend">${legend}</div>`;
    _bindDonutHover(el);
  }

  function _renderCampaignPerformance(stats) {
    const el = document.getElementById("campaignPerformanceBody");
    if (!el) return;

    const campaigns = stats.filter(item => item.sessions > 0);
    if (!campaigns.length) {
      _setText("campaignPerformanceNote", "No campaigns match your current filters.");
      el.innerHTML = `<div class="an-campaign-empty">No campaign data to rank.</div>`;
      return;
    }

    const reliable = campaigns.filter(item => item.sessions >= CAMPAIGN_MIN_SESSIONS);
    const source = reliable.length ? reliable : campaigns;
    const rows = source.slice().sort(_compareCampaignRows).slice(0, CAMPAIGN_PERFORMANCE_LIMIT);
    _setText(
      "campaignPerformanceNote",
      reliable.length
        ? `Reliable ranking: ${reliable.length.toLocaleString()} campaigns with ${CAMPAIGN_MIN_SESSIONS}+ sessions.`
        : `Need ${CAMPAIGN_MIN_SESSIONS}+ sessions per campaign for reliable ranking. Showing highest-volume campaigns for now.`
    );

    el.innerHTML = `
      <div class="an-campaign-table-scroll">
        <table class="an-campaign-table">
          <thead>
            <tr>
              <th data-campaign-sort="label">Campaign${_campaignSortArrow("label")}</th>
              <th data-campaign-sort="sessions">Sessions${_campaignSortArrow("sessions")}</th>
              <th data-campaign-sort="secondScreen">Second screen${_campaignSortArrow("secondScreen")}</th>
              <th data-campaign-sort="secondScreenRate">Second rate${_campaignSortArrow("secondScreenRate")}</th>
              <th data-campaign-sort="offer">Offer Page${_campaignSortArrow("offer")}</th>
              <th data-campaign-sort="offerRate">Offer rate${_campaignSortArrow("offerRate")}</th>
              <th data-campaign-sort="checkout">Checkout Page${_campaignSortArrow("checkout")}</th>
              <th data-campaign-sort="checkoutRate">Checkout rate${_campaignSortArrow("checkoutRate")}</th>
              <th data-campaign-sort="paid">Paid${_campaignSortArrow("paid")}</th>
              <th data-campaign-sort="paidRate">Paid rate${_campaignSortArrow("paidRate")}</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(item => {
              const lowVolume = item.sessions < CAMPAIGN_MIN_SESSIONS
                ? `<span class="an-campaign-table__tag">Low volume</span>`
                : "";
              return `
                <tr>
                  <td>
                    <div class="an-campaign-table__campaign" title="${_escapeHtml(item.label)}">
                      <span class="an-campaign-table__swatch" style="background:${_campaignColor(item.label)}"></span>
                      <span class="an-campaign-table__name">${_escapeHtml(item.label)}</span>
                      ${lowVolume}
                    </div>
                  </td>
                  <td class="an-campaign-table__num">${item.sessions.toLocaleString()}</td>
                  <td class="an-campaign-table__num">${item.secondScreen.toLocaleString()}</td>
                  <td class="an-campaign-table__num an-campaign-table__rate">${_fmtCampaignRate(_campaignMetricRate(item, "secondScreen"))}</td>
                  <td class="an-campaign-table__num">${item.offer.toLocaleString()}</td>
                  <td class="an-campaign-table__num an-campaign-table__rate">${_fmtCampaignRate(_campaignMetricRate(item, "offer"))}</td>
                  <td class="an-campaign-table__num">${item.checkout.toLocaleString()}</td>
                  <td class="an-campaign-table__num an-campaign-table__rate">${_fmtCampaignRate(_campaignMetricRate(item, "checkout"))}</td>
                  <td class="an-campaign-table__num">${item.paid.toLocaleString()}</td>
                  <td class="an-campaign-table__num an-campaign-table__rate">${_fmtCampaignRate(_campaignMetricRate(item, "paid"))}</td>
                </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>`;

    el.querySelectorAll("th[data-campaign-sort]").forEach(th => {
      th.addEventListener("click", () => {
        const key = th.dataset.campaignSort;
        if (_campaignSortKey === key) {
          _campaignSortDir *= -1;
        } else {
          _campaignSortKey = key;
          _campaignSortDir = key === "label" ? 1 : -1;
        }
        _renderCampaignPerformance(stats);
      });
    });
  }

  function _renderCampaignInsights(data) {
    const stats = _campaignStats(data);
    _renderDonutChart("campaignTrafficChart", "campaignTrafficTotal", stats, "sessions", "sessions", "No sessions match your filters.");
    _renderDonutChart("campaignSecondScreenChart", "campaignSecondScreenTotal", stats, "secondScreen", "reached", "No second-screen sessions match your filters.");
    _renderCampaignPerformance(stats);
  }

  function _buildJourneyRow(session) {
    const seen = new Set();
    const steps = (session.steps || []).filter(step => {
      const name = _stepName(step);
      if (!name || seen.has(name)) return false;
      seen.add(name);
      return true;
    });
    const pills = steps.map((step, index) => {
      const name = _stepName(step);
      const isKey = KEY_STEPS.has(name);
      const isPaid = _isPaid(session) && name === "offer-page";
      const cls = isPaid ? "an-step-pill--paid" : isKey ? "an-step-pill--key" : "";
      const pill = `<span class="an-step-pill ${cls}" title="${_escapeHtml(_fmtDate(step.created_at))}">${_escapeHtml(_humanStepLabel(name))}</span>`;
      if (index === steps.length - 1) return pill;
      const ms = Date.parse(steps[index + 1].created_at) - Date.parse(step.created_at);
      const time = Number.isFinite(ms) && ms > 0 && ms < 600000
        ? `<span class="an-step-time">${ms >= 60000 ? Math.floor(ms / 60000) + "m" : Math.round(ms / 1000) + "s"}</span>`
        : "";
      return pill + time;
    }).join("");
    return `
      <tr class="an-journey-row">
        <td colspan="7">
          <div class="an-journey">
            <div class="an-journey__label">Journey - ${steps.length} steps</div>
            <div class="an-journey__steps">${pills || "<span class=\"an-null\">No steps returned</span>"}</div>
          </div>
        </td>
      </tr>`;
  }

  function _sortValue(session, key) {
    if (key === "created_at") return _createdTs(session);
    if (key === "ab_variant") return _variantLabel(session).toLowerCase();
    if (key === "status") return _derivedStatus(session);
    if (key === "last_step") return _lastStep(session);
    return String(_field(session, key) || "").toLowerCase();
  }

  function _renderTable(data) {
    const body = document.getElementById("tableBody");
    const count = document.getElementById("tableCount");
    const total = data.length;
    if (!body || !count) return;

    count.textContent = `${total.toLocaleString()} session${total === 1 ? "" : "s"}`;
    if (!total) {
      body.innerHTML = `<div class="an-state">No sessions match your filters.</div>`;
      const pagination = document.getElementById("pagination");
      if (pagination) pagination.innerHTML = "";
      return;
    }

    const start = (_page - 1) * PER_PAGE;
    const slice = data.slice(start, start + PER_PAGE);
    const rows = slice.map(session => {
      const uid = session.uid;
      const open = uid === _openUid;
      const status = _derivedStatus(session);
      const email = _field(session, "email") || "";
      const firstName = _field(session, "first_name") || "";
      const utmSource = _field(session, "utm_source") || "";
      return `
        <tr class="${open ? "is-open" : ""}" data-uid="${_escapeHtml(uid)}">
          <td class="an-table__date">${_escapeHtml(_fmtDateShort(session.created_at))}</td>
          <td>${email ? `<span class="an-table__email">${_escapeHtml(email)}</span>` : `<span class="an-null">-</span>`}</td>
          <td>${firstName ? _escapeHtml(firstName) : `<span class="an-null">-</span>`}</td>
          <td>${_variantBadge(session)}</td>
          <td class="an-table__meta">${utmSource ? _escapeHtml(utmSource) : "-"}</td>
          <td class="an-table__mono">${_escapeHtml(_humanStepLabel(_lastStep(session)))}</td>
          <td>${_statusBadge(status)}</td>
        </tr>
        ${open ? _buildJourneyRow(session) : ""}`;
    }).join("");

    body.innerHTML = `
      <table class="an-table">
        <thead>
          <tr>
            <th data-sort="created_at">Date${_sortArrow("created_at")}</th>
            <th data-sort="email">Email${_sortArrow("email")}</th>
            <th data-sort="first_name">Name${_sortArrow("first_name")}</th>
            <th data-sort="ab_variant">Variant${_sortArrow("ab_variant")}</th>
            <th data-sort="utm_source">UTM Source${_sortArrow("utm_source")}</th>
            <th data-sort="last_step">Last Step${_sortArrow("last_step")}</th>
            <th data-sort="status">Status${_sortArrow("status")}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;

    body.querySelectorAll("tbody tr[data-uid]").forEach(row => {
      row.addEventListener("click", () => {
        _openUid = _openUid === row.dataset.uid ? null : row.dataset.uid;
        _renderTable(_filtered);
      });
    });

    body.querySelectorAll("th[data-sort]").forEach(th => {
      th.addEventListener("click", () => {
        const key = th.dataset.sort;
        if (_sortKey === key) {
          _sortDir *= -1;
        } else {
          _sortKey = key;
          _sortDir = key === "created_at" ? -1 : 1;
        }
        _applyFilters();
      });
    });

    _renderPagination(total);
  }

  function _renderPagination(total) {
    const el = document.getElementById("pagination");
    if (!el) return;
    const totalPages = Math.ceil(total / PER_PAGE);
    if (totalPages <= 1) {
      el.innerHTML = "";
      return;
    }

    const buttons = [];
    buttons.push(`<button class="an-pg-btn" onclick="Analytics.goPage(${_page - 1})" ${_page === 1 ? "disabled" : ""}>Prev</button>`);
    let prevWasDot = false;
    for (let i = 1; i <= totalPages; i++) {
      const near = i === 1 || i === totalPages || Math.abs(i - _page) <= 1;
      if (near) {
        prevWasDot = false;
        buttons.push(`<button class="an-pg-btn ${i === _page ? "is-active" : ""}" onclick="Analytics.goPage(${i})">${i}</button>`);
      } else if (!prevWasDot) {
        prevWasDot = true;
        buttons.push(`<span class="an-pg-dots">...</span>`);
      }
    }
    buttons.push(`<button class="an-pg-btn" onclick="Analytics.goPage(${_page + 1})" ${_page === totalPages ? "disabled" : ""}>Next</button>`);
    el.innerHTML = buttons.join("");
  }

  function _populateUtmOptions() {
    function appendOptions(selectId, values) {
      const select = document.getElementById(selectId);
      if (!select) return;
      values.forEach(value => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
      });
    }

    const sources = [...new Set(_sessions.map(session => _field(session, "utm_source")).filter(Boolean))].sort();
    const mediums = [...new Set(_sessions.map(session => _field(session, "utm_medium")).filter(Boolean))].sort();
    const campaigns = [...new Set(_sessions.map(session => _field(session, "utm_campaign")).filter(Boolean))].sort();
    appendOptions("filterUtmSource", sources);
    appendOptions("filterUtmMedium", mediums);
    appendOptions("filterUtmCampaign", campaigns);
  }

  function _applyFilters() {
    const from = document.getElementById("filterFrom").value;
    const to = document.getElementById("filterTo").value;
    const variant = document.getElementById("filterVariant").value;
    const utmSource = document.getElementById("filterUtmSource").value;
    const utmMedium = document.getElementById("filterUtmMedium").value;
    const utmCampaign = document.getElementById("filterUtmCampaign").value;
    const utmSearch = document.getElementById("filterUtmSearch").value.trim().toLowerCase();
    const status = document.getElementById("filterStatus").value;
    const step = document.getElementById("filterStep").value;
    const search = document.getElementById("filterSearch").value.trim().toLowerCase();

    let result = _sessions.slice();
    if (from) result = result.filter(session => _createdTs(session) >= Date.parse(from + "T00:00:00"));
    if (to) result = result.filter(session => _createdTs(session) <= Date.parse(to + "T23:59:59"));
    if (variant) result = result.filter(session => _isDecisionSession(session) && _variantKey(session) === variant);
    if (utmSource) result = result.filter(session => _field(session, "utm_source") === utmSource);
    if (utmMedium) result = result.filter(session => _field(session, "utm_medium") === utmMedium);
    if (utmCampaign) result = result.filter(session => _field(session, "utm_campaign") === utmCampaign);
    if (utmSearch) result = result.filter(session => _matchesUtmSearch(session, utmSearch));
    if (status === "paid") result = result.filter(_isPaid);
    else if (status === "checkout-page") result = result.filter(_hasReachedCheckoutPage);
    else if (status === "checkout") result = result.filter(_hasReachedOfferPage);
    else if (status === "email") result = result.filter(_hasEmailCaptured);
    else if (status === "started") result = result.filter(session => _derivedStatus(session) === "started");
    if (step === "paid") result = result.filter(_isPaid);
    else if (step) result = result.filter(session => _hasStep(session, step));
    if (search) {
      result = result.filter(session => {
        const email = String(_field(session, "email") || "").toLowerCase();
        const firstName = String(_field(session, "first_name") || "").toLowerCase();
        return email.includes(search) || firstName.includes(search);
      });
    }

    result.sort((a, b) => {
      const va = _sortValue(a, _sortKey);
      const vb = _sortValue(b, _sortKey);
      if (va < vb) return -_sortDir;
      if (va > vb) return _sortDir;
      return _createdTs(b) - _createdTs(a);
    });

    _filtered = result;
    _page = 1;
    _renderStats(_filtered);
    _renderAB(_filtered);
    _renderFunnel(_filtered);
    _renderPageTiming(_filtered);
    _renderStepTiming(_filtered);
    _renderCampaignInsights(_filtered);
    _renderTable(_filtered);
  }

  function goPage(page) {
    const pages = Math.ceil(_filtered.length / PER_PAGE);
    if (page < 1 || page > pages) return;
    _page = page;
    _renderTable(_filtered);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetFilters() {
    [
      "filterFrom",
      "filterTo",
      "filterVariant",
      "filterUtmSource",
      "filterUtmMedium",
      "filterUtmCampaign",
      "filterUtmSearch",
      "filterStatus",
      "filterStep",
      "filterSearch",
    ].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    _applyFilters();
  }

  function exportCSV() {
    const headers = [
      "Date",
      "Email",
      "Name",
      "Variant",
      "Variant Source",
      "Experiment",
      "UTM Source",
      "UTM Medium",
      "UTM Campaign",
      "Last Step",
      "Steps Count",
      "Status",
    ];
    const rowData = _filtered.map(session => [
      session.created_at || "",
      _field(session, "email") || "",
      _field(session, "first_name") || "",
      _variantLabel(session),
      _field(session, "variant_source") || "",
      _field(session, "experiment_id") || "",
      _field(session, "utm_source") || "",
      _field(session, "utm_medium") || "",
      _field(session, "utm_campaign") || "",
      _lastStep(session) || "",
      (session.steps || []).length,
      _derivedStatus(session),
    ]);
    const csv = [headers, ...rowData]
      .map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relationships-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function _mockSessions(count) {
    const sources = ["facebook", "instagram", "google", "tiktok", "organic", null, null];
    const campaigns = ["relationships-us", "trauma-recovery", "offer-theme-test", "retarget-7d", null];
    const mediums = ["cpc", "paid-social", "organic", "email"];
    const names = ["Alex", "Sam", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Drew", "Avery", "Quinn"];
    const dayMs = 86400000;
    const now = Math.max(Date.now(), AB_EXPERIMENT_START_TS + 7 * dayMs);

    function randomItem(items) {
      return items[Math.floor(Math.random() * items.length)];
    }

    function uid() {
      return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, char => {
        const r = (Math.random() * 16) | 0;
        return (char === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });
    }

    function pageTiming(pageIndex, lastIdx, firstScreenRendered) {
      if (!firstScreenRendered) return {};
      const reached = lastIdx >= pageIndex;
      const completed = lastIdx > pageIndex;
      if (!reached) return {};
      const key = "page" + (pageIndex + 1);
      const seconds = completed ? 4 + Math.floor(Math.random() * 12) : 4 + Math.floor(Math.random() * 45);
      return {
        [`${key}_time_seconds`]: seconds,
        [`${key}_engaged`]: Math.random() < (completed ? 0.9 : 0.65),
        [`${key}_scrolled`]: Math.random() < (completed ? 0.55 : 0.35),
        [`${key}_exit`]: completed ? "completed" : (Math.random() < 0.55 ? "tab_hidden" : "page_unload"),
      };
    }

    return Array.from({ length: count }, (_, index) => {
      const createdAtTs = AB_EXPERIMENT_START_TS + Math.random() * Math.max(now - AB_EXPERIMENT_START_TS, dayMs);
      const createdAt = new Date(createdAtTs);
      const variant = randomItem(VARIANTS);
      const variantSource = Math.random() < 0.88 ? "statsig" : (Math.random() < 0.5 ? "url_override" : "missing");
      const firstScreenRendered = Math.random() >= 0.07;
      const roll = Math.random();
      let lastIdx;
      if (!firstScreenRendered) lastIdx = -1;
      else if (roll < 0.08) lastIdx = 0;
      else if (roll < 0.15) lastIdx = 1 + Math.floor(Math.random() * 2);
      else if (roll < 0.46) lastIdx = 3 + Math.floor(Math.random() * 25);
      else if (roll < 0.58) lastIdx = STEPS_ORDER.indexOf("email");
      else if (roll < 0.72) lastIdx = STEPS_ORDER.indexOf("first-name");
      else if (roll < 0.86) lastIdx = STEPS_ORDER.indexOf("scratch-card");
      else if (roll < 0.96) lastIdx = STEPS_ORDER.indexOf("offer-page");
      else lastIdx = STEPS_ORDER.indexOf("checkout-page");

      const paid = firstScreenRendered && roll >= 0.985;
      if (paid) lastIdx = STEPS_ORDER.indexOf("checkout-page");
      const steps = STEPS_ORDER.slice(0, lastIdx + 1).map((step, stepIndex) => ({
        step,
        created_at: new Date(createdAt.getTime() + stepIndex * (9000 + Math.random() * 11000)).toISOString(),
      }));
      const emailCaptured = lastIdx >= STEPS_ORDER.indexOf("first-name");
      const reachedOffer = lastIdx >= STEPS_ORDER.indexOf("offer-page");
      let status = "started";
      if (paid) status = "paid";
      else if (reachedOffer) status = "checkout";
      else if (emailCaptured) status = "email";
      const utmSource = randomItem(sources);

      return {
        uid: uid(),
        submission_uid: uid(),
        created_at: createdAt.toISOString(),
        email: emailCaptured ? `relationship${index + 1}@example.com` : null,
        first_name: emailCaptured ? randomItem(names) : null,
        ab_variant: variant.code,
        variant_source: variantSource,
        experiment_id: _abExperimentName,
        utm_source: utmSource,
        utm_medium: utmSource ? randomItem(mediums) : null,
        utm_campaign: utmSource ? randomItem(campaigns) : null,
        last_step: lastIdx >= 0 ? STEPS_ORDER[lastIdx] : null,
        status,
        payment_status: paid ? "success" : reachedOffer && Math.random() < 0.16 ? "attempted" : null,
        plan_selected: reachedOffer ? randomItem(["trial", "core", "extended"]) : null,
        first_screen_rendered: firstScreenRendered,
        first_screen_rendered_at: firstScreenRendered ? new Date(createdAt.getTime() + 700 + Math.random() * 4500).toISOString() : null,
        first_screen_render_ms: firstScreenRendered ? 700 + Math.floor(Math.random() * 4500) : null,
        device_type: Math.random() < 0.72 ? "mobile" : "desktop",
        steps,
        ...pageTiming(0, lastIdx, firstScreenRendered),
        ...pageTiming(1, lastIdx, firstScreenRendered),
        ...pageTiming(2, lastIdx, firstScreenRendered),
      };
    }).sort((a, b) => _createdTs(b) - _createdTs(a));
  }

  function _installFilterListeners() {
    [
      "filterFrom",
      "filterTo",
      "filterVariant",
      "filterUtmSource",
      "filterUtmMedium",
      "filterUtmCampaign",
      "filterStatus",
      "filterStep",
    ].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("change", _applyFilters);
    });

    ["filterSearch", "filterUtmSearch"].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("input", () => {
        clearTimeout(_searchTimer);
        _searchTimer = setTimeout(_applyFilters, 280);
      });
    });
  }

  function _installHelpPopover() {
    const button = document.getElementById("abHelpButton");
    const popover = document.getElementById("abHelpPopover");
    if (!button || !popover) return;
    button.addEventListener("click", () => {
      const open = popover.hidden;
      popover.hidden = !open;
      button.setAttribute("aria-expanded", String(open));
    });
    document.addEventListener("click", event => {
      if (popover.hidden) return;
      if (button.contains(event.target) || popover.contains(event.target)) return;
      popover.hidden = true;
      button.setAttribute("aria-expanded", "false");
    });
  }

  async function _init() {
    let config = null;
    try {
      config = await fetch("./qauth.json").then(response => {
        if (!response.ok) throw new Error("qauth_http_" + response.status);
        return response.json();
      });
      if (config && config.statsig && config.statsig.experiment_name) {
        _abExperimentName = config.statsig.experiment_name;
      }
    } catch (err) {
      console.warn("[Analytics] Could not load qauth.json:", err.message);
    }

    let data = null;
    let isMock = false;
    if (config) {
      try {
        data = await _fetchAllSessions(config);
      } catch (err) {
        console.warn("[Analytics] API unavailable, using mock data:", err.message);
      }
    }

    if (!data) {
      isMock = true;
      data = _mockSessions(420);
      const banner = document.getElementById("mockBanner");
      if (banner) banner.hidden = false;
    }

    _sessions = data.map(_normalizeSession).filter(session => !_isTestSession(session));
    _populateUtmOptions();
    _installFilterListeners();
    _installHelpPopover();

    _setText(
      "lastUpdated",
      `${isMock ? "Preview" : "Updated"} ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} - ${_sessions.length.toLocaleString()} loaded`
    );
    _applyFilters();
  }

  _init();

  return { goPage, resetFilters, exportCSV };
})();
