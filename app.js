const APP_VERSION = "1.0.0";

// Start backend init immediately — non-blocking, quiz works without it
if (typeof QuizAPI !== "undefined") QuizAPI.init();

// ─── Analytics & page-timing utilities ──────────────────────────────────────

let _firstScreenTracked = false;
let _activePageTimer    = null;

class PageTimer {
  constructor(pageKey) {
    this.pageKey   = pageKey;
    this.startTime = Date.now();
    this.scrolled  = false;
    this._fired    = false;
    this._onHide   = () => { if (document.visibilityState === "hidden") this._fire("tab_hidden"); };
    this._onUnload = () => this._fire("page_unload");
    this._onScroll = () => { this.scrolled = true; };
    document.addEventListener("visibilitychange", this._onHide);
    window.addEventListener("pagehide", this._onUnload);
    window.addEventListener("scroll", this._onScroll, { passive: true, once: true });
  }
  complete() { this._fire("completed"); }
  _fire(exitType) {
    if (this._fired) return;
    this._fired = true;
    document.removeEventListener("visibilitychange", this._onHide);
    window.removeEventListener("pagehide", this._onUnload);
    const elapsed = Math.round((Date.now() - this.startTime) / 1000);
    if (typeof QuizAPI !== "undefined") {
      QuizAPI.submit({ data: {
        [`${this.pageKey}_time_seconds`]: elapsed,
        [`${this.pageKey}_engaged`]:      elapsed >= 3 || this.scrolled,
        [`${this.pageKey}_scrolled`]:     this.scrolled,
        [`${this.pageKey}_exit`]:         exitType,
      }});
    }
  }
}

function startPageTimer(pageKey) {
  if (_activePageTimer) _activePageTimer.complete();
  _activePageTimer = new PageTimer(pageKey);
}

function trackFirstScreen() {
  if (_firstScreenTracked) return;
  _firstScreenTracked = true;
  window.NMS_FIRST_SCREEN_RENDERED = true;
  window.dispatchEvent(new Event("nms:tracking-ready"));
  if (typeof QuizAPI === "undefined") return;
  QuizAPI.submit({ data: {
    first_screen_rendered:    true,
    first_screen_rendered_at: new Date().toISOString(),
    first_screen_render_ms:   Math.round(performance.now()),
    device_type:              window.innerWidth < 768 ? "mobile" : "desktop",
  }});
}

function navigateToPaywall() {
  try { sessionStorage.setItem("nms_offer_plan_name", state.offer.selectedPlan); } catch(e) {}
  if (typeof QuizAPI !== "undefined") QuizAPI.trackStep("checkout-page");
  setTimeout(() => { window.location.href = "./paywall.html"; }, 80);
}

function normalizeOfferTheme(value) {
  const raw = String(value || "").trim().toLowerCase();
  const map = {
    a: "orange",
    orange: "orange",
    b: "blue",
    blue: "blue",
    c: "green",
    green: "green",
  };
  return map[raw] || "";
}

function getOfferThemeOverride() {
  return normalizeOfferTheme(new URLSearchParams(window.location.search).get("theme"));
}

function applyOfferTheme(theme) {
  document.body.classList.remove("is-theme-orange", "is-theme-green");
  if (theme === "orange") document.body.classList.add("is-theme-orange");
  if (theme === "green") document.body.classList.add("is-theme-green");
  return theme || "blue";
}

function syncAssignedOfferTheme() {
  const override = getOfferThemeOverride();
  if (override) return applyOfferTheme(override);
  const assigned = typeof QuizAPI !== "undefined" ? normalizeOfferTheme(QuizAPI.getAbVariant()) : "";
  return applyOfferTheme(assigned || "blue");
}

const introSteps = [
  {
    id: "gender",
    type: "gender",
    title: "How trauma shapes your relationships",
    body: "Discover your hidden patterns and break the toxic cycle",
    prompt: "Take the 3-minute quiz",
    noteHtml:
      'By clicking "Male" or "Female" you agree to the <a href="https://account.newmindstart.com/terms-of-service" target="_blank" rel="noopener noreferrer">Terms of Service</a>, <a href="https://account.newmindstart.com/privacy-policy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>, and <a href="https://account.newmindstart.com/cancellation-refund-policies" target="_blank" rel="noopener noreferrer">Cancellation and Refund Policies</a>',
    choices: [
      { value: "man", label: "Male", hint: "A person aged Male", image: "./assets/gender-man.avif" },
      { value: "woman", label: "Female", hint: "A person aged Female", image: "./assets/gender-woman.avif" }
    ]
  },
  {
    id: "age",
    type: "choice",
    title: "What's your age?",
    body: "We only use this information to personalize your plan",
    prompt: "Choose one age group.",
    note: "",
    choices: [
      { value: "18-24", label: "18-24", hint: "" },
      { value: "25-34", label: "25-34", hint: "" },
      { value: "35-44", label: "35-44", hint: "" },
      { value: "45-54", label: "45-54", hint: "" },
      { value: "55-64", label: "55-64", hint: "" },
      { value: "65+", label: "65+", hint: "" }
    ]
  },
  {
    id: "welcome",
    type: "welcome",
    title: "We're glad you're here.",
    body: [
      "This short check-in helps you understand the hidden patterns shaping your relationships.",
      "Take a moment to reflect and answer honestly — there are no right or wrong answers."
    ],
    cta: "Continue",
    note:
      "NewMindStart does not provide medical diagnoses. If you have mental health concerns, please consult a licensed healthcare professional.",
    image: "./assets/handshake.avif"
  }
];

const scaleLabels = [
  { value: 4, label: "Very true", hint: "This feels strongly familiar." },
  { value: 3, label: "Mostly true", hint: "This happens fairly often." },
  { value: 2, label: "Sometimes", hint: "This fits part of the time." },
  { value: 1, label: "Rarely true", hint: "This shows up only now and then." },
  { value: 0, label: "Not true", hint: "This does not really fit me." }
];

const questions = [
  // Scale questions 1–6
  { type: "scale", text: "I can often sense what someone else is feeling, even without them saying anything." },
  { type: "scale", text: "Other people often come to me for emotional support, even when I need it myself." },
  { type: "scale", text: "It is not easy for me to say 'no' without feeling guilty or anxious." },
  { type: "scale", text: "I often find myself adjusting my behavior to meet others' expectations." },
  { type: "scale", text: "I may feel selfish or guilty when I put my own needs first." },
  { type: "scale", text: "I feel emotionally drained after spending extended time with others." },

  // Listchoice – Often / Sometimes / Almost never (Q7–11)
  {
    type: "listchoice",
    text: "I feel responsible for how the people I care about feel.",
    options: [
      { value: 4, label: "Often", icon: "often" },
      { value: 2, label: "Sometimes", icon: "sometimes" },
      { value: 0, label: "Almost never", icon: "never" }
    ]
  },
  {
    type: "listchoice",
    text: "When someone upsets me, I pull back instead of saying how I feel.",
    options: [
      { value: 4, label: "Often", icon: "often" },
      { value: 2, label: "Sometimes", icon: "sometimes" },
      { value: 0, label: "Almost never", icon: "never" }
    ]
  },
  {
    type: "listchoice",
    text: "I replay conversations in my head and worry about how I came across.",
    options: [
      { value: 4, label: "Often", icon: "often" },
      { value: 2, label: "Sometimes", icon: "sometimes" },
      { value: 0, label: "Almost never", icon: "never" }
    ]
  },
  {
    type: "listchoice",
    text: "I avoid conflict even when I know I need to speak up.",
    options: [
      { value: 4, label: "Often", icon: "often" },
      { value: 2, label: "Sometimes", icon: "sometimes" },
      { value: 0, label: "Almost never", icon: "never" }
    ]
  },
  {
    type: "listchoice",
    text: "I fear that people I care about will eventually leave or lose interest in me.",
    options: [
      { value: 4, label: "Often", icon: "often" },
      { value: 2, label: "Sometimes", icon: "sometimes" },
      { value: 0, label: "Almost never", icon: "never" }
    ]
  },

  // Listchoice – 4-option reaction (Q12)
  {
    type: "listchoice",
    text: "When a relationship feels tense or uncertain, my first instinct is to…",
    options: [
      { value: 1, label: "Distract myself to avoid the discomfort", icon: "distract" },
      { value: 3, label: "Feel responsible and try to fix things", icon: "responsible" },
      { value: 4, label: "Get overwhelmed and emotionally shut down", icon: "overwhelmed" },
      { value: 0, label: "Stay calm and wait it out", icon: "calm" }
    ]
  },

  // Listchoice – Yes / I'm not sure / No (Q13–17)
  {
    type: "listchoice",
    text: "Have you doubted your own memory of hurtful events?",
    options: [
      { value: 4, label: "Yes", icon: "yes" },
      { value: 2, label: "I'm not sure", icon: "notSure" },
      { value: 0, label: "No", icon: "no" }
    ]
  },
  {
    type: "listchoice",
    text: "Have you ever made excuses for someone's mood or emotional wellbeing?",
    options: [
      { value: 4, label: "Yes", icon: "yes" },
      { value: 2, label: "I'm not sure", icon: "notSure" },
      { value: 0, label: "No", icon: "no" }
    ]
  },
  {
    type: "listchoice",
    text: "Have you ever lost touch with friends or quit hobbies because of a relationship?",
    options: [
      { value: 4, label: "Yes", icon: "yes" },
      { value: 2, label: "I'm not sure", icon: "notSure" },
      { value: 0, label: "No", icon: "no" }
    ]
  },
  {
    type: "listchoice",
    text: "Do you often criticize yourself?",
    options: [
      { value: 4, label: "Yes", icon: "yes" },
      { value: 2, label: "I'm not sure", icon: "notSure" },
      { value: 0, label: "No", icon: "no" }
    ]
  },
  {
    type: "listchoice",
    text: "Do you ever get the sense that something might be not right with you?",
    options: [
      { value: 4, label: "Yes", icon: "yes" },
      { value: 2, label: "I'm not sure", icon: "notSure" },
      { value: 0, label: "No", icon: "no" }
    ]
  },

  // Multiselect – childhood experiences (Q18)
  {
    type: "multiselect",
    text: "Which of these did you experience growing up?",
    prompt: "Select all that apply",
    options: [
      { value: "Happy and careless", label: "Happy and careless", icon: "101.svg" },
      { value: "Parental conflict or divorce", label: "Parental conflict or divorce", icon: "115.svg" },
      { value: "Unstable or unpredictable home environment", label: "Unstable or unpredictable home environment", icon: "118.svg" },
      { value: "Loss of a parent or caregiver", label: "Loss of a parent or caregiver", icon: "119.svg" },
      { value: "Verbal criticism or violence", label: "Verbal criticism or violence", icon: "127.svg" },
      { value: "Having to grow up too fast", label: "Having to grow up too fast", icon: "102.svg" },
      { value: "I don't remember much", label: "I don't remember much", icon: "129.svg", exclusive: true }
    ]
  },

  // Listchoice – Yes / I'm not sure / No (Q19–20)
  {
    type: "listchoice",
    text: "Did you take on grown-up responsibilities as a child?",
    options: [
      { value: 4, label: "Yes", icon: "yes" },
      { value: 2, label: "I'm not sure", icon: "notSure" },
      { value: 0, label: "No", icon: "no" }
    ]
  },
  {
    type: "listchoice",
    text: "Did you feel like you had to deserve a caregiver’s love and affection?",
    options: [
      { value: 4, label: "Yes", icon: "yes" },
      { value: 2, label: "I'm not sure", icon: "notSure" },
      { value: 0, label: "No", icon: "no" }
    ]
  },

  // Multiselect – relationship patterns (Q21)
  {
    type: "multiselect",
    text: "Which of these have shown up in your relationships?",
    prompt: "Select all that apply",
    options: [
      { value: "A relationship that felt toxic or damaging", label: "A relationship that felt toxic or damaging", icon: "103.svg" },
      { value: "A partner’s infidelity", label: "A partner’s infidelity", icon: "112.svg" },
      { value: "A divorce or separation", label: "A divorce or separation", icon: "116.svg" },
      { value: "A painful heartbreak", label: "A painful heartbreak", icon: "117.svg" },
      { value: "Ongoing family struggles in adulthood", label: "Ongoing family struggles in adulthood", icon: "130.svg" },
      { value: "None of these", label: "None of these", icon: "120.svg", exclusive: true }
    ]
  },

  // Multiselect – anxiety triggers (Q22)
  {
    type: "multiselect",
    text: "What tends to trigger the most anxiety in your relationships?",
    prompt: "Select all that apply",
    options: [
      { value: "Feeling pressure to live up to expectations", label: "Feeling pressure to live up to expectations", icon: "102.svg" },
      { value: "Being overlooked or ignored", label: "Being overlooked or ignored", icon: "115.svg" },
      { value: "Dealing with conflict or tense situations", label: "Dealing with conflict or tense situations", icon: "125.svg" },
      { value: "Feeling controlled or influenced", label: "Feeling controlled or influenced", icon: "124.svg" },
      { value: "Experiencing abandonment or rejection", label: "Experiencing abandonment or rejection", icon: "118.svg" },
      { value: "Facing criticism, whether direct or subtle", label: "Facing criticism, whether direct or subtle", icon: "123.svg" },
      { value: "None of these", label: "None of these", icon: "120.svg", exclusive: true }
    ]
  },

  // Listchoice – Very / Somewhat / Hardly (Q23)
  {
    type: "listchoice",
    text: "How sensitive are you to triggers in relationships?",
    options: [
      { value: 0, label: "Very", icon: "chart-1.svg" },
      { value: 2, label: "Somewhat", icon: "chart-2.svg" },
      { value: 4, label: "Hardly at all", icon: "chart-3.svg" }
    ]
  },

  // Multiselect – healing goals (Q24)
  {
    type: "multiselect",
    variant: "icon-variant",
    text: "What would you most like to heal or work on?",
    prompt: "Select all that apply",
    options: [
      { value: "Feel safe and calm", label: "Feel safe and calm", icon: "sense_security.svg" },
      { value: "Better understand myself", label: "Better understand myself", icon: "114.svg" },
      { value: "Feel worthy and enough", label: "Feel worthy and enough", icon: "104.svg" },
      { value: "Better manage my temper", label: "Better manage my temper", icon: "112.svg" },
      { value: "Put my needs first", label: "Put my needs first", icon: "111.svg" },
      { value: "Break my toxic loops", label: "Break my toxic loops", icon: "122.svg" }
    ],
    customPlaceholder: "Type your own goal..."
  },

  // Evidence screen
  {
    type: "evidence",
    title: "Built on evidence-based relationship psychology",
    body:
      "This reflection draws on established work in attachment theory, trauma recovery, and relational wellbeing from widely respected institutions.",
    sources: [
      { nameTop: "University", nameBottom: "Harvard" },
      { nameTop: "University of", nameBottom: "Oxford" },
      { nameTop: "University of", nameBottom: "Cambridge" }
    ],
    cta: "Continue"
  },

  // Multiselect – life areas with PNG icons (Q25)
  {
    type: "multiselect",
    variant: "icon-variant",
    text: "Which of these would make the most difference in your life?",
    prompt: "Select all that apply",
    options: [
      { value: "Become more resilient to stress", label: "Become more resilient to stress", icon: "107.svg" },
      { value: "Feel more emotionally balanced", label: "Feel more emotionally balanced", icon: "emotional_balance.svg"},
      { value: "Feel a stronger sense of safety", label: "Feel a stronger sense of safety", icon: "sense_security.svg" },
      { value: "Build trust in yourself and others", label: "Build trust in yourself and others", icon: "trust_inself_anothers.svg" },
      { value: "Change thought patterns", label: "Change thought patterns", icon: "thought_patterns.svg" },
      { value: "Healthy, fulfilling relationships", label: "Healthy, fulfilling relationships", icon: "117.svg" }
    ],
    customPlaceholder: "Type your answer here..."
  },

  // Listchoice – knowledge (Q26)
  {
    type: "listchoice",
    text: "How familiar are you with Cognitive Behavioral Therapy?",
    options: [
      { value: 4, label: "A lot — I've explored these topics", icon: "132.svg" },
      { value: 2, label: "Not that much", icon: "105.svg" },
      { value: 0, label: "This is new to me", icon: "106.svg" }
    ]
  },

  // Listchoice – therapist referral (Q27)
  {
    type: "listchoice",
    text: "Did a therapist recommend NewMindStart to you?",
    options: [
      { value: 4, label: "Yes", icon: "yes" },
      { value: 0, label: "No", icon: "no" }
    ]
  }
];

const outroSteps = [
  { type: "expert" },
  {
    id: "socialproof",
    type: "socialproof",
    titleHighlight: "Join over 745,000 people",
    subtitle: "Become a part of a growing worldwide community and break the cycle together!",
    cta: "Continue",
    image: "./assets/socialproof.png",
    map: "./assets/map.avif"
  },
  {
    type: "email"
  },
  {
    type: "name"
  },
  {
    type: "summary"
  },
  {
    type: "growthProjection"
  },
  {
    type: "planBuilder"
  },
  {
    type: "safetyChart"
  },
  {
    type: "scratchCard"
  },
  {
    type: "offer"
  }
];

const app = document.getElementById("app");
const progressBar = document.getElementById("progressBar");
const topBar = document.querySelector(".top-bar");
const pageShell = document.querySelector(".page-shell");
const progressWrap = document.querySelector(".progress-wrap");
const backButton = document.getElementById("backButton");
const headerStepCount = document.getElementById("headerStepCount");
const headerOfferUtility = document.getElementById("headerOfferUtility");
const headerCountdown = document.getElementById("headerCountdown");
const headerOfferButton = document.getElementById("headerOfferButton");
const logoLink = document.querySelector(".logo-wrap");
let planBuilderTimers = [];
let offerTimerInstance = null;
let offerTimerFallback = null;

const state = {
  stepIndex: 0,
  answers: {
    gender: null,
    age: null
  },
  contact: {
    email: "",
    firstName: ""
  },
  formErrors: {
    email: "",
    firstName: ""
  },
  questionScores: Array(questions.length).fill(null),
  multiAnswers: {},
  multiInputs: {},
  planBuilder: {
    stage: "goalsLoading",
    popupIndex: null
  },
  chartReadyStage: 0,
  scratchCard: {
    revealed: false,
    popupOpen: false
  },
  offer: {
    startedAt: null,
    expired: false,
    selectedPlan: "core"
  }
};

function clearPlanBuilderTimers() {
  planBuilderTimers.forEach((timerId) => window.clearTimeout(timerId));
  planBuilderTimers = [];
}

function clearOfferTimer() {
  if (offerTimerInstance && typeof offerTimerInstance.stop === "function") {
    offerTimerInstance.stop();
  }
  offerTimerInstance = null;

  if (offerTimerFallback) {
    window.clearInterval(offerTimerFallback);
    offerTimerFallback = null;
  }
}

function schedulePlanBuilder(delay, callback) {
  const timerId = window.setTimeout(callback, delay);
  planBuilderTimers.push(timerId);
}

function isCountedQuestion(question) {
  return question.type !== "evidence";
}

function getCountedQuestionTotal() {
  return questions.filter(isCountedQuestion).length;
}

function getQuestionOrdinal(index) {
  return questions.slice(0, index + 1).filter(isCountedQuestion).length;
}

const totalSteps = introSteps.length + questions.length + outroSteps.length;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getAssetUrl(path) {
  if (!path) {
    return "";
  }

  return new URL(path.replace(/^\.\//, ""), window.location.href).href;
}

function getProgress() {
  if (state.stepIndex >= introSteps.length && state.stepIndex < introSteps.length + questions.length) {
    const questionIndex = state.stepIndex - introSteps.length;
    const questionOrdinal = getQuestionOrdinal(questionIndex);
    return Math.round((questionOrdinal / getCountedQuestionTotal()) * 100);
  }

  if (
    state.stepIndex >= introSteps.length + questions.length &&
    state.stepIndex < totalSteps
  ) {
    return 100;
  }

  const completed = Math.min(state.stepIndex, totalSteps - 1);
  return Math.round((completed / (totalSteps - 1)) * 100);
}

function getCurrentOutroStep() {
  const questionIndex = state.stepIndex - introSteps.length;

  if (questionIndex < questions.length) {
    return null;
  }

  return outroSteps[questionIndex - questions.length] || null;
}

function updateProgress() {
  const progress = getProgress();
  progressBar.style.width = `${progress}%`;
  headerStepCount.textContent = "";

  if (state.stepIndex >= introSteps.length && state.stepIndex < introSteps.length + questions.length) {
    const questionIndex = state.stepIndex - introSteps.length;
    headerStepCount.textContent = `${getQuestionOrdinal(questionIndex)} / ${getCountedQuestionTotal()}`;
  } else if (state.stepIndex >= introSteps.length + questions.length && state.stepIndex < totalSteps) {
    headerStepCount.textContent = `${getCountedQuestionTotal()} / ${getCountedQuestionTotal()}`;
  }
}

function isOfferStepActive() {
  return getCurrentOutroStep()?.type === "offer";
}

function formatCountdownFromMs(milliseconds) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getOfferRemainingMs() {
  const duration = 8 * 60 * 1000 + 38 * 1000;

  if (state.offer.expired) return 0;

  if (!state.offer.startedAt) {
    return duration;
  }

  return Math.max(0, duration - (Date.now() - state.offer.startedAt));
}

function updateOfferHeaderTimerDisplay(milliseconds) {
  headerCountdown.textContent = formatCountdownFromMs(milliseconds);
}

function expireOfferDiscount() {
  if (state.offer.expired) {
    return;
  }

  state.offer.expired = true;
  clearOfferTimer();
  render();
}

function startOfferTimer() {
  clearOfferTimer();

  if (!isOfferStepActive()) {
    return;
  }

  const remainingMs = getOfferRemainingMs();
  updateOfferHeaderTimerDisplay(remainingMs);

  if (remainingMs <= 0) {
    expireOfferDiscount();
    return;
  }

  const remainingSeconds = Math.ceil(remainingMs / 1000);

  function syncInSectionCountdown(timeStr) {
    const [mins, secs] = timeStr.split(":");
    const els = document.querySelectorAll(".js-price-countdown-mins");
    const els2 = document.querySelectorAll(".js-price-countdown-secs");
    els.forEach((el) => { el.textContent = mins; });
    els2.forEach((el) => { el.textContent = secs; });
  }

  if (window.easytimer?.Timer) {
    offerTimerInstance = new window.easytimer.Timer();
    const syncTimerValue = () => {
      const values = offerTimerInstance.getTimeValues();
      const timeStr = values.toString(["minutes", "seconds"]);
      headerCountdown.textContent = timeStr;
      syncInSectionCountdown(timeStr);
    };

    offerTimerInstance.addEventListener("secondsUpdated", syncTimerValue);
    offerTimerInstance.addEventListener("targetAchieved", () => {
      expireOfferDiscount();
    });
    offerTimerInstance.start({
      countdown: true,
      precision: "seconds",
      startValues: { seconds: remainingSeconds }
    });
    syncTimerValue();
    return;
  }

  updateOfferHeaderTimerDisplay(remainingMs);
  offerTimerFallback = window.setInterval(() => {
    const nextMs = getOfferRemainingMs();
    updateOfferHeaderTimerDisplay(nextMs);
    syncInSectionCountdown(formatCountdownFromMs(nextMs));

    if (nextMs <= 0) {
      expireOfferDiscount();
    }
  }, 1000);
}

function renderChoiceStep(step) {
  if (typeof QuizAPI !== "undefined") QuizAPI.trackStep("age");
  startPageTimer("page2");

  const selectedValue = state.answers[step.id];

  app.innerHTML = `
    <div class="screen">
      <h2 class="screen-title">${escapeHtml(step.title)}</h2>
      <p class="screen-copy">${escapeHtml(step.body)}</p>
      <div class="choices-grid" role="list" aria-label="${escapeHtml(step.prompt)}">
        ${step.choices
          .map(
            (choice) => `
              <button
                class="option-button ${selectedValue === choice.value ? "selected" : ""}"
                type="button"
                data-choice="${escapeHtml(choice.value)}"
              >
                <span class="option-label">${escapeHtml(choice.label)}</span>
                ${choice.hint ? `<span class="option-hint">${escapeHtml(choice.hint)}</span>` : ""}
              </button>
            `
          )
          .join("")}
      </div>
      ${step.note ? `<p class="footer-note">${escapeHtml(step.note)}</p>` : ""}
    </div>
  `;

  app.querySelectorAll("[data-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      state.answers[step.id] = button.dataset.choice;
      state.stepIndex += 1;
      render();
    });
  });
}

function renderGenderStep(step) {
  if (typeof QuizAPI !== "undefined") QuizAPI.trackStep("gender");
  requestAnimationFrame(trackFirstScreen);
  startPageTimer("page1");

  const selectedValue = state.answers[step.id];

  app.innerHTML = `
    <div class="screen screen-gender">
      <div class="hero-badge" aria-hidden="true">
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.4"/><path d="M8 4.5V8l2.5 1.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
        <span>3-minute quiz</span>
      </div>
      <h1 class="hero-title">${escapeHtml(step.title)}</h1>
      <p class="hero-copy">${escapeHtml(step.body)}</p>
      <div class="gender-grid" role="list" aria-label="Choose your gender">
        ${step.choices
          .map(
            (choice) => `
              <button
                class="gender-card ${selectedValue === choice.value ? "selected" : ""}"
                type="button"
                data-choice="${escapeHtml(choice.value)}"
              >
                <div class="gender-card__media">
                  <img
                    class="gender-card__image"
                    src="${escapeHtml(getAssetUrl(choice.image))}"
                    alt="${escapeHtml(choice.hint)}"
                  />
                </div>
                <span class="gender-card__label">${escapeHtml(choice.label)}</span>
              </button>
            `
          )
          .join("")}
      </div>
      <p class="footer-note legal-note">${step.noteHtml || ""}</p>
    </div>
  `;

  app.querySelectorAll("[data-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      state.answers[step.id] = button.dataset.choice;
      state.stepIndex += 1;
      render();
    });
  });
}


function renderWelcomeStep(step) {
  if (typeof QuizAPI !== "undefined") QuizAPI.trackStep("welcome");
  startPageTimer("page3");

  app.innerHTML = `
    <div class="screen screen-welcome">
      <div class="welcome-body">
        <div class="welcome-figure">
          <img
            class="welcome-figure__image"
            src="${escapeHtml(getAssetUrl(step.image))}"
            alt="Supportive illustration"
          />
        </div>
        <h2 class="screen-title">${escapeHtml(step.title)}</h2>
        ${step.body.map((paragraph) => `<p class="welcome-copy">${escapeHtml(paragraph)}</p>`).join("")}
        ${step.note ? `<p class="footer-note welcome-note">${escapeHtml(step.note)}</p>` : ""}
      </div>
      <div class="welcome-cta">
        <button class="primary-button button-continue" id="continueWelcome" type="button">${escapeHtml(step.cta)}</button>
      </div>
    </div>
  `;

  document.getElementById("continueWelcome").addEventListener("click", () => {
    state.stepIndex += 1;
    render();
  });
}

function renderSocialProofStep(step) {
  if (typeof QuizAPI !== "undefined") QuizAPI.trackStep("social-proof");

  const tickerRows = [
    {
      dir: 'right',
      items: [
        { avatar: './assets/location01.avif', text: 'Feeling positive!' },
        { avatar: './assets/location02.avif', text: 'Thanks!' },
        { avatar: './assets/location03.avif', text: 'Very easy to follow' },
        { avatar: './assets/location04.avif', text: 'Great info!' },
        { avatar: './assets/location05.avif', text: 'So helpful' },
        { avatar: './assets/location06.avif', text: 'Mind-blowing' },
      ]
    },
    {
      dir: 'left',
      items: [
        { avatar: './assets/location07.avif', text: 'Love how easy this was' },
        { avatar: './assets/location08.avif', text: 'Eye opening' },
        { avatar: './assets/location09.avif', text: 'It helps' },
        { avatar: './assets/location10.avif', text: 'Already surprised' },
        { avatar: './assets/location11.avif', text: 'So far, so good' },
        { avatar: './assets/location01.avif', text: "I'm feeling hopeful" },
      ]
    },
    {
      dir: 'right',
      items: [
        { avatar: './assets/location02.avif', text: 'Very insightful' },
        { avatar: './assets/location03.avif', text: 'Life changing' },
        { avatar: './assets/location04.avif', text: 'Thank you!' },
        { avatar: './assets/location05.avif', text: 'It was useful' },
        { avatar: './assets/location06.avif', text: 'Amazing' },
        { avatar: './assets/location07.avif', text: 'Really works' },
      ]
    },
    {
      dir: 'left',
      items: [
        { avatar: './assets/location08.avif', text: 'Highly recommend' },
        { avatar: './assets/location09.avif', text: 'Changed my life' },
        { avatar: './assets/location10.avif', text: 'So glad I tried' },
        { avatar: './assets/location11.avif', text: 'Feeling better!' },
        { avatar: './assets/location01.avif', text: 'Absolutely love it' },
        { avatar: './assets/location02.avif', text: 'Eye opening' },
      ]
    }
  ];

  const renderTrack = (items) =>
    [...items, ...items].map(({ avatar, text }) =>
      `<div class="sp-ticker-item">` +
      `<img class="sp-ticker-avatar" src="${escapeHtml(getAssetUrl(avatar))}" alt="" aria-hidden="true">` +
      `<span class="sp-ticker-text">${escapeHtml(text)}</span>` +
      `</div>`
    ).join('');

  const tickerHTML = tickerRows.map(({ dir, items }) =>
    `<div class="sp-ticker-row">` +
    `<div class="sp-ticker-track sp-ticker-track--${dir}">` +
    renderTrack(items) +
    `</div></div>`
  ).join('');

  app.innerHTML = `
    <div class="screen screen-socialproof">
      <div class="sp-ticker-section" aria-hidden="true">
        ${tickerHTML}
      </div>
      <div class="socialproof-heading">
        <h2 class="socialproof-title">
          ${escapeHtml(step.titleHighlight)}
        </h2>
        <p class="socialproof-subtitle">${escapeHtml(step.subtitle)}</p>
      </div>
      <button class="primary-button socialproof-continue button-continue" id="continueSocialProof" type="button">
        ${escapeHtml(step.cta)}
      </button>
    </div>
  `;

  document.getElementById("continueSocialProof").addEventListener("click", () => {
    state.stepIndex += 1;
    render();
  });
}

function fluent(name) {
  return `<img src="https://api.iconify.design/fluent-emoji-flat/${name}.svg" class="fluent-emoji" alt="" aria-hidden="true" loading="lazy">`;
}

function renderOptionIcon(kind) {
  const icons = {
    check: `
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M29.5 8.1c.8.9.8 2.2-.1 3l-13.4 12.4-4.6 4.2-9-9.5c-.8-.9-.8-2.2.1-3l1.1-1.1c.9-.8 2.2-.8 3 .1l5 5.3L25.4 6.8c.9-.8 2.2-.8 3.1.1z"></path>
      </svg>
    `,
    arrows:       fluent("left-right-arrow"),
    no:           fluent("prohibited"),
    question:     fluent("red-question-mark"),
    phone:        fluent("mobile-phone"),
    coffee:       fluent("hot-beverage"),
    routine:      fluent("alarm-clock"),
    otherRoutine: fluent("clipboard"),
    hours0to2:    fluent("crescent-moon"),
    hours3to5:    fluent("last-quarter-moon-face"),
    hours6to8:    fluent("sun"),
    hours8plus:   fluent("sunrise"),
    clock5:       fluent("five-o-clock"),
    clock10:      fluent("ten-o-clock"),
    clock15:      fluent("three-o-clock"),
    clock20:      fluent("four-o-clock")
  };

  return icons[kind] || fluent("red-question-mark");
}

function renderAgreementIcon(position) {
  const map = {
    strongDisagree: "thumb_down_2.svg",
    disagree:       "thumb_down_1.svg",
    neutral:        "question_1.svg",
    agree:          "thumb_up_1.svg",
    strongAgree:    "thumb_up_2.svg"
  };
  const file = map[position] || "question_1.svg";
  return `<img src="./assets/${file}" width="36" height="36" alt="" aria-hidden="true">`;
}

function getMultiOptionValue(option) {
  return typeof option === "string" ? option : option.value;
}

function getMultiOptionLabel(option) {
  return typeof option === "string" ? option : option.label;
}

function getExclusiveMultiOptionValues(question) {
  return (question.options || [])
    .filter((option) => typeof option !== "string" && option.exclusive)
    .map((option) => option.value);
}

function renderMultiOptionIcon(kind) {
  if (!kind) return "";
  return `<img src="./assets/${kind}" width="32" height="32" alt="" aria-hidden="true">`;
}

function getMultiselectSubmission(index) {
  const selected = Array.isArray(state.multiAnswers[index]) ? [...state.multiAnswers[index]] : [];
  const custom = (state.multiInputs[index] || "").trim();

  if (custom) {
    selected.push(custom);
  }

  return selected;
}

function renderEvidenceStep(question) {
  app.innerHTML = `
    <div class="screen screen-evidence">
      <div class="evidence-stack" role="list" aria-label="Research sources">
        ${question.sources
          .map(
            (source) => `
              <article class="evidence-card" role="listitem">
                <h3 class="evidence-card__name">
                  <span class="evidence-card__brand-top">${escapeHtml(source.nameTop)}</span>
                  <span class="evidence-card__brand-bottom">${escapeHtml(source.nameBottom)}</span>
                </h3>
              </article>
            `
          )
          .join("")}
      </div>
      <h2 class="screen-title">${escapeHtml(question.title)}</h2>
      <p class="screen-copy evidence-copy">${escapeHtml(question.body)}</p>
      <button class="primary-button evidence-continue button-continue" id="continueEvidence" type="button">
        ${escapeHtml(question.cta)}
      </button>
    </div>
  `;

  document.getElementById("continueEvidence").addEventListener("click", () => {
    state.stepIndex += 1;
    render();
  });
}

function renderListChoiceIcon(kind) {
  const map = {
    often:       "111.svg",
    sometimes:   "105.svg",
    never:       "106.svg",
    yes:         "132.svg",
    notSure:     "105.svg",
    no:          "106.svg",
    distract:    "107.svg",
    responsible: "108.svg",
    overwhelmed: "109.svg",
    calm:        "110.svg",
    barHigh:     "chart-3.svg",
    barMid:      "chart-2.svg",
    barLow:      "chart-1.svg",
    aLot:        "111.svg",
    notMuch:     "112.svg",
    nothing:     "113.svg"
  };
  const file = map[kind] || (kind && kind.includes(".") ? kind : "105.svg");
  return `<img src="./assets/${file}" width="26" height="26" alt="" aria-hidden="true">`;
}

function renderListChoiceStep(index) {
  const score = state.questionScores[index];
  const question = questions[index];

  app.innerHTML = `
    <div class="screen screen-listchoice">
      <h2 class="question-title">${escapeHtml(question.text)}</h2>
      <div class="listchoice-list" role="list" aria-label="${escapeHtml(question.text)}">
        ${question.options
          .map(
            (option) => `
              <button
                class="listchoice-option ${score === option.value ? "selected" : ""}"
                type="button"
                data-score="${option.value}"
              >
                <span class="listchoice-option__icon">
                  ${renderListChoiceIcon(option.icon)}
                </span>
                <span class="listchoice-option__label">${escapeHtml(option.label)}</span>
                <span class="listchoice-option__radio ${score === option.value ? "is-selected" : ""}" aria-hidden="true"></span>
              </button>
            `
          )
          .join("")}
      </div>
    </div>
  `;

  app.querySelectorAll("[data-score]").forEach((button) => {
    button.addEventListener("click", () => {
      state.questionScores[index] = Number(button.dataset.score);
      button.classList.add("selected");
      const radio = button.querySelector(".listchoice-option__radio");
      if (radio) radio.classList.add("is-selected");
      setTimeout(() => {
        state.stepIndex += 1;
        render();
      }, 260);
    });
  });
}

function renderQuestionStep(index) {
  if (typeof QuizAPI !== "undefined") QuizAPI.trackStep(`question-${index + 1}`);

  const score = state.questionScores[index];
  const question = questions[index];

  if (question.type === "evidence") {
    renderEvidenceStep(question);
    return;
  }

  if (question.type === "listchoice") {
    renderListChoiceStep(index);
    return;
  }

  if (question.type === "multiselect") {
    const selected = Array.isArray(state.multiAnswers[index]) ? state.multiAnswers[index] : [];
    const customValue = state.multiInputs[index] || "";
    const selectedCount = getMultiselectSubmission(index).length;
    app.innerHTML = `
      <div class="screen screen-multiselect ${question.variant ? `screen-multiselect--${question.variant}` : ""}">
        <h2 class="question-title">${escapeHtml(question.text)}</h2>
        <p class="question-prompt question-prompt--center">${escapeHtml(question.prompt)}</p>
        <div class="multiselect-list" role="list" aria-label="${escapeHtml(question.text)}">
          ${question.options
            .map(
              (option) => `
                <button
                  class="multiselect-option ${selected.includes(getMultiOptionValue(option)) ? "selected" : ""}"
                  type="button"
                  data-option="${escapeHtml(getMultiOptionValue(option))}"
                  ${typeof option !== "string" && option.exclusive ? 'data-exclusive="true"' : ""}
                >
                  ${
                    typeof option === "string"
                      ? ""
                      : `<span class="multiselect-option__icon">${renderMultiOptionIcon(option.icon)}</span>`
                  }
                  <span class="multiselect-option__label">${escapeHtml(getMultiOptionLabel(option))}</span>
                  <span class="multiselect-option__check" aria-hidden="true">
                    <svg viewBox="0 0 16 16">
                      <path d="M11 5 7.13 11 5 8.47"></path>
                    </svg>
                  </span>
                </button>
              `
            )
            .join("")}
          ${
            question.customPlaceholder
              ? `
                <label class="multiselect-option multiselect-option--custom ${customValue.trim() ? "selected" : ""}">
                  <input
                    class="multiselect-option__input"
                    id="customMultiInput"
                    type="text"
                    placeholder="${escapeHtml(question.customPlaceholder)}"
                    value="${escapeHtml(customValue)}"
                  />
                  <span class="multiselect-option__check ${customValue.trim() ? "is-checked" : ""}" aria-hidden="true">
                    <svg viewBox="0 0 16 16">
                      <path d="M11 5 7.13 11 5 8.47"></path>
                    </svg>
                  </span>
                </label>
              `
              : ""
          }
        </div>
        <div class="multiselect-sticky-footer">
          <button
            class="primary-button multiselect-continue button-continue"
            id="continueMulti"
            type="button"
            ${selectedCount ? "" : "disabled"}
          >
            Continue
          </button>
        </div>
      </div>
    `;

    app.querySelectorAll("[data-option]").forEach((button) => {
      button.addEventListener("click", () => {
        const value = button.dataset.option;
        const current = Array.isArray(state.multiAnswers[index]) ? [...state.multiAnswers[index]] : [];
        const exclusiveValues = getExclusiveMultiOptionValues(question);
        const isExclusiveOption = button.dataset.exclusive === "true";
        const next = current.includes(value)
          ? current.filter((item) => item !== value)
          : isExclusiveOption
            ? [value]
            : [...current.filter((item) => !exclusiveValues.includes(item)), value];

        state.multiAnswers[index] = next;
        state.questionScores[index] = next.length ? 2 : null;
        render();
      });
    });

    if (question.customPlaceholder) {
      const customInput = document.getElementById("customMultiInput");
      customInput.addEventListener("input", (event) => {
        const nextValue = event.target.value;
        state.multiInputs[index] = nextValue;
        if (nextValue.trim()) {
          const exclusiveValues = getExclusiveMultiOptionValues(question);
          state.multiAnswers[index] = (state.multiAnswers[index] || []).filter(
            (item) => !exclusiveValues.includes(item)
          );
        }
        state.questionScores[index] = getMultiselectSubmission(index).length ? 2 : null;
        const continueButton = document.getElementById("continueMulti");
        continueButton.disabled = !getMultiselectSubmission(index).length;
        customInput.closest(".multiselect-option").classList.toggle("selected", Boolean(nextValue.trim()));
        customInput
          .closest(".multiselect-option")
          .querySelector(".multiselect-option__check")
          .classList.toggle("is-checked", Boolean(nextValue.trim()));
      });
    }

    document.getElementById("continueMulti").addEventListener("click", () => {
      const submission = getMultiselectSubmission(index);

      if (!submission.length) {
        return;
      }

      state.multiAnswers[index] = submission;
      state.questionScores[index] = 2;
      state.stepIndex += 1;
      render();
    });
    return;
  }

  if (
    question.type === "choice3icon" ||
    question.type === "choice4" ||
    question.type === "choice4text" ||
    question.type === "choice4icon"
  ) {
    const hasIcons = question.type !== "choice4text";
    app.innerHTML = `
      <div class="screen screen-choice4 ${hasIcons ? "screen-choice4--icon" : "screen-choice4--text"}">
        <h2 class="question-title">${escapeHtml(question.text)}</h2>
        ${question.prompt ? `<p class="question-prompt question-prompt--center">${escapeHtml(question.prompt)}</p>` : ""}
        <div class="answer-list" role="list" aria-label="${escapeHtml(question.text)}">
          ${question.options
            .map(
              (option) => `
                <button
                  class="answer-option ${hasIcons ? "answer-option--icon" : "answer-option--text"} ${score === option.value ? "selected" : ""}"
                  type="button"
                  data-score="${option.value}"
                >
                  <span class="answer-option__content ${hasIcons ? "" : "answer-option__content--center"}">
                    ${
                      hasIcons
                        ? `
                          <span class="answer-option__icon answer-option__icon--${escapeHtml(option.icon)}">
                            ${renderOptionIcon(option.icon)}
                          </span>
                        `
                        : ""
                    }
                    <span class="answer-option__label">${escapeHtml(option.label)}</span>
                  </span>
                </button>
              `
            )
            .join("")}
        </div>
      </div>
    `;

    app.querySelectorAll("[data-score]").forEach((button) => {
      button.addEventListener("click", () => {
        state.questionScores[index] = Number(button.dataset.score);
        state.stepIndex += 1;
        render();
      });
    });
    return;
  }

  const agreementIcons = [
    { key: "strongDisagree", size: "large", value: 0, aria: "Not true" },
    { key: "disagree", size: "small", value: 1, aria: "Rarely true" },
    { key: "neutral", size: "small", value: 2, aria: "Sometimes" },
    { key: "agree", size: "small", value: 3, aria: "Mostly true" },
    { key: "strongAgree", size: "large", value: 4, aria: "Very true" }
  ];

  app.innerHTML = `
    <div class="screen screen-agreement">
      <h2 class="question-title">${escapeHtml(question.text)}</h2>
      <p class="question-prompt question-prompt--center question-prompt--agreement">
        Do you agree with the following statement?
      </p>
      <div class="agreement-meter" aria-label="Agreement scale">
        <div class="agreement-meter__row" role="list" aria-label="${escapeHtml(question.text)}">
        ${agreementIcons
          .map(
            (option) => `
              <button
                class="agreement-button agreement-button--${option.size} ${score === option.value ? "selected" : ""}"
                type="button"
                data-score="${option.value}"
                aria-label="${escapeHtml(option.aria)}"
              >
                <span class="agreement-button__icon agreement-button__icon--${escapeHtml(option.key)}">
                  ${renderAgreementIcon(option.key)}
                </span>
              </button>
            `
          )
          .join("")}
        </div>
        <div class="agreement-meter__legend" aria-hidden="true">
          <span>Strongly disagree</span>
          <span>Strongly agree</span>
        </div>
      </div>
    </div>
  `;

  app.querySelectorAll("[data-score]").forEach((button) => {
    button.addEventListener("click", () => {
      state.questionScores[index] = Number(button.dataset.score);
      state.stepIndex += 1;
      render();
    });
  });
}

function averageScore(indices) {
  const values = indices
    .map((index) => state.questionScores[index])
    .filter((value) => typeof value === "number");

  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getResultData() {
  const scoredQuestions = questions.filter(isCountedQuestion);
  const answeredScores = state.questionScores.filter(
    (value, index) => isCountedQuestion(questions[index]) && value !== null
  );
  const total = answeredScores.reduce((sum, value) => sum + value, 0);
  const max = scoredQuestions.length * 4;
  const percentage = Math.round((total / max) * 100);

  let stage = "Mild patterns";
  let summary =
    "Your responses suggest some relationship patterns are present, but awareness is already a meaningful first step toward change.";
  let support =
    "Small, consistent shifts in how you relate to yourself and others can make a real difference over time.";

  if (percentage >= 40 && percentage < 70) {
    stage = "Significant patterns";
    summary =
      "Your answers suggest that past experiences may be shaping how you connect, trust, and feel safe in relationships in significant ways.";
    support =
      "These patterns are deeply understandable — and with the right support, they can change. A structured approach to healing attachment wounds tends to be most effective.";
  } else if (percentage >= 70) {
    stage = "Deep conditioning";
    summary =
      "Your responses suggest that early relational experiences may be deeply influencing how you show up in relationships today — affecting trust, boundaries, and emotional safety.";
    support =
      "What you are carrying deserves compassionate attention. You are not broken — these are learned patterns, and learned patterns can be unlearned with the right guidance.";
  }

  const topThemes = [
    {
      label: "Emotional sensitivity",
      score: averageScore([0, 1, 2, 3, 5])
    },
    {
      label: "Relationship anxiety",
      score: averageScore([6, 7, 8, 9, 10, 18, 19])
    },
    {
      label: "Childhood conditioning",
      score: averageScore([12, 13, 14, 15, 16])
    },
    {
      label: "Boundaries and trust",
      score: averageScore([4, 11, 17, 20, 21])
    }
  ]
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return {
    percentage,
    stage,
    summary,
    support,
    topThemes
  };
}

function renderExpertStep() {
  if (typeof QuizAPI !== "undefined") QuizAPI.trackStep("expert");

  app.innerHTML = `
    <div class="screen screen-expert">
      <div class="expert-hero-card">
        <div class="expert-hero-card__visual">
          <img
            class="expert-hero-card__image"
            src="${escapeHtml(getAssetUrl("./assets/scientificproof.avif"))}"
            alt="Scientific illustration"
          />
        </div>
      </div>

      <h2 class="screen-title expert-title">
        Our plans are designed in collaboration with <span class="expert-title__accent">licensed therapists</span>
      </h2>

      <p class="expert-copy">
        "We use science-backed methods to shape a plan that feels personal, practical, and aligned with what your answers show."
      </p>

      <button class="primary-button expert-continue button-continue" id="expertContinue" type="button">Continue</button>
    </div>
  `;

  document.getElementById("expertContinue").addEventListener("click", () => {
    state.stepIndex += 1;
    render();
  });
}

function renderCommunityStep(step) {
  if (typeof QuizAPI !== "undefined") QuizAPI.trackStep("community");

  app.innerHTML = `
    <div class="screen screen-community">
      <div class="community-figure" aria-hidden="true">
        <div class="community-map">
          <span class="community-pin community-pin--one"></span>
          <span class="community-pin community-pin--two"></span>
          <span class="community-pin community-pin--three"></span>
          <span class="community-pin community-pin--four"></span>
          <span class="community-pin community-pin--five"></span>
          <span class="community-pin community-pin--six"></span>
        </div>
      </div>

      <h2 class="screen-title community-title">${escapeHtml(step.title)}</h2>
      <p class="community-copy">${escapeHtml(step.body)}</p>

      <button class="primary-button community-continue button-continue" id="communityContinue" type="button">
        ${escapeHtml(step.cta)}
      </button>
    </div>
  `;

  document.getElementById("communityContinue").addEventListener("click", () => {
    state.stepIndex += 1;
    render();
  });
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function renderEmailStep() {
  if (typeof QuizAPI !== "undefined") QuizAPI.trackStep("email");

  const emailValue = state.contact.email;

  const error = state.formErrors.email;

  app.innerHTML = `
    <div class="screen screen-form">
      <h2 class="screen-title form-title">
        Enter your <span class="form-title__accent"> email </span>
      </h2>

      <div class="form-field-wrap">
        <input
          class="form-input ${error ? "form-input--error" : ""}"
          id="emailInput"
          type="email"
          inputmode="email"
          autocomplete="email"
          placeholder="Enter your email"
          value="${escapeHtml(emailValue)}"
        />
        ${error ? `<p class="form-error">${escapeHtml(error)}</p>` : ""}
      </div>

      <div class="form-note">
        <span class="form-note__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M17 10V7a5 5 0 0 0-10 0v3M8 10h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
        </span>
        <p class="form-note__text">
          We are committed to your privacy. By submitting, you agree that we may use this information to contact you about relevant content. For more information, check our
          <a class="form-note__link" href="https://account.newmindstart.com/privacy-policy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
        </p>
      </div>

      <button class="primary-button secondary form-continue button-continue" id="emailContinue" type="button">
        Continue
      </button>
    </div>
  `;

  const input = document.getElementById("emailInput");
  input.addEventListener("input", (event) => {
    state.contact.email = event.target.value;
    if (state.formErrors.email) {
      state.formErrors.email = "";
      input.classList.remove("form-input--error");
      const errorNode = document.querySelector(".form-error");
      if (errorNode) {
        errorNode.remove();
      }
    }
  });

  document.getElementById("emailContinue").addEventListener("click", () => {
    const email = state.contact.email.trim();
    if (!email || !isValidEmail(email)) {
      state.formErrors.email = "Please enter your email";
      render();
      return;
    }

    state.contact.email = email;
    state.formErrors.email = "";
    if (typeof QuizAPI !== "undefined") QuizAPI.submit({ email });
    state.stepIndex += 1;
    render();
  });
}

function renderNameStep() {
  if (typeof QuizAPI !== "undefined") QuizAPI.trackStep("first-name");

  const firstNameValue = state.contact.firstName;
  const error = state.formErrors.firstName;

  app.innerHTML = `
    <div class="screen screen-form screen-form--compact">
      <h2 class="screen-title form-title">
        Enter your <span class="form-title__accent">first name</span>
      </h2>

      <div class="form-field-wrap">
        <input
          class="form-input ${error ? "form-input--error" : ""}"
          id="firstNameInput"
          type="text"
          autocomplete="given-name"
          placeholder="Enter your name to get your plan"
          value="${escapeHtml(firstNameValue)}"
        />
        ${error ? `<p class="form-error">${escapeHtml(error)}</p>` : ""}
      </div>

      <div class="form-note">
        <span class="form-note__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M17 10V7a5 5 0 0 0-10 0v3M8 10h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
        </span>
        <p class="form-note__text">
          We are committed to your privacy. By submitting, you agree that we may use this information to contact you about relevant content. For more information, check our
          <a class="form-note__link" href="https://account.newmindstart.com/privacy-policy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
        </p>
      </div>

      <button class="primary-button secondary form-continue button-continue" id="firstNameContinue" type="button">
        Continue
      </button>
    </div>
  `;

  const input = document.getElementById("firstNameInput");
  input.addEventListener("input", (event) => {
    state.contact.firstName = event.target.value;
    if (state.formErrors.firstName) {
      state.formErrors.firstName = "";
      input.classList.remove("form-input--error");
      const errorNode = document.querySelector(".form-error");
      if (errorNode) {
        errorNode.remove();
      }
    }
  });

  document.getElementById("firstNameContinue").addEventListener("click", () => {
    state.contact.firstName = state.contact.firstName.trim();
    if (!state.contact.firstName) {
      state.formErrors.firstName = "Please enter your name";
      render();
      return;
    }

    state.formErrors.firstName = "";
    if (typeof QuizAPI !== "undefined") QuizAPI.submit({ data: { first_name: state.contact.firstName } });
    state.stepIndex += 1;
    render();
  });
}

function renderSummaryMetricIcon(kind) {
  const icons = {
    puzzle: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.2 3.5a2.4 2.4 0 0 1 4.8 0v1.1h2.3c1 0 1.7.8 1.7 1.7v2.2h1.1a2.4 2.4 0 1 1 0 4.8H18v2.3c0 1-.8 1.7-1.7 1.7H14V19a2.4 2.4 0 1 1-4.8 0v-1.1H6.9c-1 0-1.7-.8-1.7-1.7V14H4.1a2.4 2.4 0 1 1 0-4.8h1.1V6.9c0-1 .8-1.7 1.7-1.7h2.3V3.5Z"/></svg>`,
    heart: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"/></svg>`,
    bolt: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.2 2 6.8 13h4.1l-1.1 9L17.2 11h-4L13.2 2Z"/></svg>`,
    shield: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 4 5.5v5c0 4.8 3.6 9.1 8 10.5 4.4-1.4 8-5.7 8-10.5v-5L12 2Z"/></svg>`,
    info: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M10.3 3.5a2 2 0 0 1 3.4 0l8.8 15.2A2 2 0 0 1 20.8 22H3.2a2 2 0 0 1-1.7-3.3L10.3 3.5ZM10.8 9.5h2.4v5h-2.4ZM10.8 16.5h2.4v2.5h-2.4Z"/></svg>`
  };
  return icons[kind] || icons.puzzle;
}

function getSummaryProfileData(result) {
  const percentage = result.percentage;

  const levelBadge = percentage >= 70 ? "High" : "Medium";
  const level = percentage >= 70 ? "high" : "medium";
  const dotColor = percentage >= 70 ? "#b02018" : "#bf5510";
  const alertBody = percentage >= 70
    ? "Your answers point to deep patterns that may be shaping your relationships. You might often second-guess your feelings or hold back from saying what you really need, which can create quiet distance over time. These patterns are important to notice now, because they tend to repeat. The good news is that with a bit of awareness, they can shift toward more clarity and confidence in how you connect with others."
    : "This suggests you may be susceptible to recurring relationship patterns. You might tend to suppress your own needs or seek constant reassurance, often rooted in early experiences of emotional unavailability. Over time, this can erode self-trust and make it difficult to set boundaries — creating cycles of anxiety or over-giving in close relationships.";

  return {
    start: percentage >= 70 ? "7%" : "30%",
    end: percentage >= 70 ? "89%" : "63%",
    levelBadge,
    level,
    dotColor,
    alertBody,
    metrics: [
      { label: "Traumatic trait", value: percentage >= 60 ? "Heightened vigilance" : "Self-abandonment", icon: "puzzle" },
      { label: "Foundational wound", value: percentage >= 60 ? "Abandonment" : "Rejection", icon: "heart" },
      { label: "Trigger sensitivity", value: percentage >= 70 ? "High" : "Moderate", icon: "bolt" },
      { label: "Defense mechanism", value: percentage >= 60 ? "Surrender" : "Overcompensation", icon: "shield" }
    ]
  };
}

function renderSummaryStep() {
  if (typeof QuizAPI !== "undefined") QuizAPI.trackStep("nervous-system-profile");

  const result = getResultData();
  const summaryMeta = getSummaryProfileData(result);
  const heroImage = state.answers.gender === 'man'
    ? './assets/summaryprofile-man.avif'
    : './assets/summaryprofile-woman.avif';

  app.innerHTML = `
    <div class="screen screen-profile-summary">

      <div class="psum-hero psum-hero--${escapeHtml(summaryMeta.level)}${state.answers.gender === 'man' ? ' psum-hero--man' : ''}" style="--psum-marker:${escapeHtml(summaryMeta.end)};--psum-dot-color:${escapeHtml(summaryMeta.dotColor)}">
        <img class="psum-hero__image" src="${escapeHtml(getAssetUrl(heroImage))}" alt="Profile illustration" />
        <div class="psum-hero__topbar">
          <span class="psum-hero__level-label">Trauma Impact Level</span>
          <span class="psum-hero__level-badge">${escapeHtml(summaryMeta.levelBadge)}</span>
        </div>
        <h2 class="psum-hero__title">Summary of Your Profile</h2>
        <div class="psum-hero__chart" aria-hidden="true">
          <div class="psum-chart__wrapper">
            <div class="psum-chart__fill">
              <div class="psum-chart__circle">
                <div class="psum-chart__tooltip">
                  <span>Your level</span>
                  <svg class="psum-chart__pointer" width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M3.93 5.3C4.32 5.69 4.95 5.69 5.34 5.3L8.97 1.71C9.6 1.08 9.16 0 8.26 0H1C.11 0-.34 1.08.3 1.71L3.93 5.3Z" fill="currentColor"/></svg>
                </div>
              </div>
            </div>
            <div class="psum-chart__scale">
              <span>Low</span><span>Normal</span><span>Medium</span><span>High</span>
            </div>
          </div>
        </div>
      </div>

      <article class="psum-alert psum-alert--${escapeHtml(summaryMeta.level)}">
        <div class="psum-alert__icon">${renderSummaryMetricIcon("info")}</div>
        <p class="psum-alert__text">${escapeHtml(summaryMeta.alertBody)}</p>
      </article>

      <div class="psum-metrics">
        ${summaryMeta.metrics.map((m) => `
          <article class="psum-metric">
            <div class="psum-metric__icon">${renderSummaryMetricIcon(m.icon)}</div>
            <p class="psum-metric__label">${escapeHtml(m.label)}</p>
            <p class="psum-metric__value">${escapeHtml(m.value)}</p>
          </article>
        `).join("")}
      </div>

      <div class="psum-sticky-footer">
        <button class="primary-button profile-summary__continue button-continue" id="summaryContinue" type="button">
          Continue
        </button>
      </div>
    </div>
  `;

  document.getElementById("summaryContinue").addEventListener("click", () => {
    state.stepIndex += 1;
    render();
  });
}

function getProjectionMonths() {
  const now = new Date();
  const monthFormatter = new Intl.DateTimeFormat(undefined, { month: "long" });
  const eyebrowFormatter = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
  const future = new Date(now.getFullYear(), now.getMonth() + 2, 1);
  const eyebrowDate = new Date(now.getFullYear(), now.getMonth() + 3, 1);

  return {
    currentMonth: monthFormatter.format(now),
    futureMonth: monthFormatter.format(future),
    eyebrowLabel: eyebrowFormatter.format(eyebrowDate)
  };
}

function getProjectionAgeCopy(ageRange) {
  return ageRange || "your age group";
}

function getAudienceLabel() {
  if (state.answers.gender === "man") {
    return "men";
  }

  if (state.answers.gender === "woman") {
    return "women";
  }

  return "people";
}

function renderGrowthProjectionStep() {
  if (typeof QuizAPI !== "undefined") QuizAPI.trackStep("growth-projection");

  const { currentMonth, futureMonth, eyebrowLabel } = getProjectionMonths();
  const bars = [
    { modifier: "coral", height: "92%", delay: "0ms" },
    { modifier: "peach", height: "66%", delay: "90ms" },
    { modifier: "sand", height: "81%", delay: "180ms" },
    { modifier: "yellow", height: "57%", delay: "270ms" },
    { modifier: "green", height: "36%", delay: "360ms", goal: true },
    { modifier: "blue", height: "24%", delay: "450ms" }
  ];

  app.innerHTML = `
    <div class="screen screen-growth-projection">
      <section class="growth-projection__card">
        <p class="growth-projection__eyebrow">Projected change based on your results by ${escapeHtml(eyebrowLabel)}</p>

        <div class="growth-projection__chart" aria-hidden="true">
          <div class="growth-projection__bars">
            ${bars
              .map(
                (bar) => `
                  <div class="growth-projection__bar-group ${bar.goal ? "growth-projection__bar-group--goal" : ""}" style="--target-height:${escapeHtml(bar.height)}; --bar-delay:${escapeHtml(bar.delay)};">
                    ${bar.goal ? '<span class="growth-projection__goal-tip">Goal</span>' : ""}
                    <div class="growth-projection__track">
                      <span class="growth-projection__bar growth-projection__bar--${bar.modifier}"></span>
                    </div>
                  </div>
                `
              )
              .join("")}
          </div>

          <div class="growth-projection__months">
            <span class="growth-projection__month growth-projection__month--start">${escapeHtml(currentMonth)}</span>
            <span class="growth-projection__month growth-projection__month--end">${escapeHtml(futureMonth)}</span>
          </div>
        </div>
      </section>

      <h2 class="screen-title growth-projection__title">
        A plan designed to support your trauma recovery journey
      </h2>

      <p class="growth-projection__legal">
        The chart is a non-customized illustration, results may vary.
      </p>

      <button class="primary-button secondary form-continue growth-projection__continue button-continue" id="growthProjectionContinue" type="button">
        Continue
      </button>
    </div>
  `;

  document.getElementById("growthProjectionContinue").addEventListener("click", () => {
    state.stepIndex += 1;
    render();
  });
}

function getPlanBuilderConfig() {
  return {
    rows: [
      {
        key: "goals",
        label: "Setting goals",
        pauseAt: "66%",
        progressLabel: "66%",
        stage: "goalsLoading",
        popupIndex: 0,
        review: {
          title: "I finally understood why I kept repeating the same patterns",
          author: "Sarah J.",
          body:
            "I thought my relationships were just unlucky, but NewMindStart helped me see the patterns rooted in my childhood. That insight changed everything for me."
        }
      },
      {
        key: "growth",
        label: "Adapting growth areas",
        pauseAt: "76%",
        progressLabel: "76%",
        stage: "growthLoading",
        popupIndex: 1,
        review: {
          title: "I started setting boundaries without the guilt",
          author: "Maya L.",
          body:
            "Within the first two weeks I noticed I was responding differently in conflict. The tools felt simple but the shift in my relationships was real and lasting."
        }
      },
      {
        key: "content",
        label: "Picking content",
        pauseAt: "56%",
        progressLabel: "56%",
        stage: "contentLoading",
        popupIndex: 2,
        review: {
          title: "For the first time I feel like I understand myself",
          author: "Elena R.",
          body:
            "The plan gave me language for what I had been experiencing for years. Over time I started trusting myself more and attracting healthier connections."
        }
      }
    ],
    popups: [
      "Are you ready to explore your relationship patterns honestly?",
      "Are you familiar with attachment theory or trauma-informed approaches?",
      "Are you open to building new relational habits step by step?"
    ]
  };
}

function setPlanBuilderStage(stage, popupIndex = null) {
  state.planBuilder.stage = stage;
  state.planBuilder.popupIndex = popupIndex;
  render();
}

function animatePlanBuilderCounter(fromVal, toVal, duration) {
  const startTime = performance.now();
  function tick(now) {
    const el = document.querySelector(".plan-builder__item-value");
    if (!el) return;
    const t = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(fromVal + (toVal - fromVal) * eased) + "%";
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function injectPlanBuilderPopup(popupIndex) {
  const config = getPlanBuilderConfig();
  const popupStages = ["goalsPopup", "growthPopup", "contentPopup"];

  state.planBuilder.stage = popupStages[popupIndex];
  state.planBuilder.popupIndex = popupIndex;

  const screen = document.querySelector(".screen-plan-builder");
  if (!screen) return;

  const overlay = document.createElement("div");
  overlay.className = "plan-builder__overlay";
  overlay.innerHTML = `
    <div class="plan-builder__modal" role="dialog" aria-modal="true" aria-label="Plan question">
      <p class="plan-builder__modal-eyebrow">To move forward, specify</p>
      <p class="plan-builder__modal-question">${escapeHtml(config.popups[popupIndex])}</p>
      <div class="plan-builder__modal-actions">
        <button class="plan-builder__modal-button" type="button" data-plan-answer="no">No</button>
        <button class="plan-builder__modal-button" type="button" data-plan-answer="yes">Yes</button>
      </div>
    </div>
  `;
  screen.appendChild(overlay);

  const pauseValues = [66, 76, 56];
  const nextStages = ["growthLoading", "contentLoading", "complete"];

  overlay.querySelectorAll("[data-plan-answer]").forEach((btn) => {
    btn.addEventListener("click", () => {
      clearPlanBuilderTimers();
      overlay.remove();
      startPlanBuilderResume(pauseValues[popupIndex], nextStages[popupIndex]);
    });
  });
}

function startPlanBuilderResume(pauseAt, nextStage) {
  const RESUME_DURATION = 800;

  const fill = document.querySelector(
    ".plan-builder__progress-fill--goals, .plan-builder__progress-fill--growth, .plan-builder__progress-fill--content"
  );

  if (fill) {
    const track = fill.parentElement;
    const trackW = track ? track.getBoundingClientRect().width : 0;
    const fillW = fill.getBoundingClientRect().width;
    const actualPct = trackW > 0 ? (fillW / trackW) * 100 : pauseAt;

    fill.style.animation = "none";
    fill.style.width = actualPct + "%";
    fill.getBoundingClientRect();

    fill.style.transition = `width ${RESUME_DURATION}ms cubic-bezier(0.2, 0.9, 0.25, 1)`;
    fill.style.width = "100%";
    animatePlanBuilderCounter(pauseAt, 100, RESUME_DURATION);
  }

  schedulePlanBuilder(RESUME_DURATION, () => {
    const valueEl = document.querySelector(".plan-builder__item-value");
    if (valueEl) {
      const check = document.createElement("span");
      check.className = "plan-builder__item-check";
      check.innerHTML = renderPlanBuilderCheckIcon();
      valueEl.replaceWith(check);
    }
  });

  schedulePlanBuilder(RESUME_DURATION + 300, () => setPlanBuilderStage(nextStage));
}

function ensurePlanBuilderProgress(stage) {
  const LOAD_DURATION = 2200;
  if (stage === "goalsLoading") {
    animatePlanBuilderCounter(0, 66, LOAD_DURATION);
    schedulePlanBuilder(LOAD_DURATION, () => injectPlanBuilderPopup(0));
  } else if (stage === "growthLoading") {
    animatePlanBuilderCounter(0, 76, LOAD_DURATION);
    schedulePlanBuilder(LOAD_DURATION, () => injectPlanBuilderPopup(1));
  } else if (stage === "contentLoading") {
    animatePlanBuilderCounter(0, 56, LOAD_DURATION);
    schedulePlanBuilder(LOAD_DURATION, () => injectPlanBuilderPopup(2));
  }
}

function getPlanBuilderRowState(stage, rowIndex) {
  const allStages = [
    "goalsLoading", "goalsPopup",
    "growthLoading", "growthPopup",
    "contentLoading", "contentPopup",
    "complete"
  ];
  const rowStartIndex = [0, 2, 4];
  const keys = ["goals", "growth", "content"];
  const rowKey = keys[rowIndex];
  const stageIdx = allStages.indexOf(stage);
  const visible = stageIdx >= rowStartIndex[rowIndex];
  const loading = stage === `${rowKey}Loading` || stage === `${rowKey}Popup`;
  const complete = visible && !loading;
  return { visible, loading, complete };
}

function renderPlanBuilderCheckIcon() {
  return `
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4 10.5 8.5 15 16 6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path>
    </svg>
  `;
}

function renderPlanBuilderStep() {
  if (typeof QuizAPI !== "undefined") QuizAPI.trackStep("plan-builder");

  const config = getPlanBuilderConfig();
  const ageRange = getProjectionAgeCopy(state.answers.age);
  const audience = getAudienceLabel();
  const stage = state.planBuilder.stage;
  const popupIndex = state.planBuilder.popupIndex;
  const showContinue = stage === "complete";
  const stageToRowIndex = {
    goalsLoading: 0, goalsPopup: 0,
    growthLoading: 1, growthPopup: 1,
    contentLoading: 2, contentPopup: 2,
    complete: 2,
  };
  const activeReview = config.rows[stageToRowIndex[stage] ?? 2].review;

  app.innerHTML = `
    <div class="screen screen-plan-builder">
      <h2 class="screen-title plan-builder__title">
        Creating your Trauma Management Plan for ${escapeHtml(audience)} ${escapeHtml(ageRange)}
      </h2>

      <div class="plan-builder__list" role="list" aria-label="Plan building progress">
        ${config.rows
          .map((row, index) => {
            const rowState = getPlanBuilderRowState(stage, index);

            if (!rowState.visible) {
              return "";
            }

            if (rowState.complete) {
              return `
                <div class="plan-builder__item plan-builder__item--complete" role="listitem">
                  <div class="plan-builder__progress-track">
                    <span class="plan-builder__progress-fill"></span>
                    <span class="plan-builder__progress-overlay">
                      <p class="plan-builder__item-label">${escapeHtml(row.label)}</p>
                      <span class="plan-builder__item-check">${renderPlanBuilderCheckIcon()}</span>
                    </span>
                  </div>
                </div>
              `;
            }

            return `
              <div class="plan-builder__item plan-builder__item--loading" role="listitem">
                <div class="plan-builder__progress-track" aria-hidden="true">
                  <span class="plan-builder__progress-fill plan-builder__progress-fill--${escapeHtml(row.key)}"></span>
                  <span class="plan-builder__progress-overlay">
                    <p class="plan-builder__item-label">${escapeHtml(row.label)}</p>
                    <span class="plan-builder__item-value">${escapeHtml(row.progressLabel)}</span>
                  </span>
                </div>
              </div>
            `;
          })
          .join("")}
      </div>

      <article class="plan-builder__review">
        <div class="plan-builder__review-top">
          <div class="plan-builder__stars" aria-hidden="true">
            <span>★</span><span>★</span><span>★</span><span>★</span><span>★</span>
          </div>
          <p class="plan-builder__review-author">${escapeHtml(activeReview.author)}</p>
        </div>
        <h3 class="plan-builder__review-title">${escapeHtml(activeReview.title)}</h3>
        <p class="plan-builder__review-body">${escapeHtml(activeReview.body)}</p>
      </article>

      ${
        showContinue
          ? `
            <button class="primary-button secondary plan-builder__continue button-continue" id="planBuilderContinue" type="button">
              Continue
            </button>
          `
          : ""
      }
    </div>
  `;

  if (showContinue) {
    document.getElementById("planBuilderContinue").addEventListener("click", () => {
      state.chartReadyStage = 0;
      state.stepIndex += 1;
      render();
    });
  }

  ensurePlanBuilderProgress(stage);
}

function getDisplayName() {
  const firstName = (state.contact.firstName || "").trim();

  if (!firstName) {
    return "Your";
  }

  return firstName.charAt(0).toUpperCase() + firstName.slice(1);
}

function getPlanMonthLabel() {
  const now = new Date();
  return `${now.toLocaleString("en-US", { month: "short" })} ${now.getFullYear()}`;
}

function startSafetyChartAnimation() {
  const chart = app.querySelector(".screen-safety-chart");
  if (!chart || chart.dataset.animated === "true") {
    return;
  }

  chart.dataset.animated = "true";

  const curve = chart.querySelector(".safety-chart__curve");
  const arrowTip = chart.querySelector(".safety-chart__arrow-tip");
  const orangePoint = chart.querySelector(".safety-chart__point--orange");
  const yellowPoint = chart.querySelector(".safety-chart__point--yellow");
  const greenPoint = chart.querySelector(".safety-chart__point--green");
  const weekTwo = chart.querySelector(".safety-chart__week-label--two");
  const weekThree = chart.querySelector(".safety-chart__week-label--three");
  const weekFour = chart.querySelector(".safety-chart__week-label--four");
  const todayTooltip = chart.querySelector(".safety-chart__tooltip--today");
  const afterTooltip = chart.querySelector(".safety-chart__tooltip--after");
  const continueButton = chart.querySelector("#safetyChartContinue");

  schedulePlanBuilder(220, () => {
    todayTooltip?.classList.add("is-visible");
  });

  schedulePlanBuilder(360, () => {
    arrowTip?.classList.add("is-visible");
    const curvePath = document.getElementById("safety-chart-curve-path");
    if (!curvePath || !curve) return;
    const totalLength = curvePath.getTotalLength();
    curve.style.strokeDasharray = totalLength;
    curve.style.strokeDashoffset = totalLength;
    const ANIM_DURATION = 2100;
    const startTime = performance.now();
    function ease(t) { return 1 - Math.pow(1 - t, 4); }
    function tick(now) {
      const t = Math.min((now - startTime) / ANIM_DURATION, 1);
      const drawnLength = ease(t) * totalLength;
      curve.style.strokeDashoffset = totalLength - drawnLength;
      if (arrowTip) {
        const pt = curvePath.getPointAtLength(drawnLength);
        const ptPrev = curvePath.getPointAtLength(Math.max(0, drawnLength - 2));
        const angle = Math.atan2(pt.y - ptPrev.y, pt.x - ptPrev.x) * (180 / Math.PI);
        arrowTip.setAttribute("transform", `translate(${pt.x},${pt.y}) rotate(${angle})`);
      }
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });

  schedulePlanBuilder(980, () => {
    orangePoint?.classList.add("is-visible");
    weekTwo?.classList.add("is-visible");
  });

  schedulePlanBuilder(1700, () => {
    yellowPoint?.classList.add("is-visible");
    weekThree?.classList.add("is-visible");
  });

  schedulePlanBuilder(2460, () => {
    greenPoint?.classList.add("is-visible");
    weekFour?.classList.add("is-visible");
    afterTooltip?.classList.add("is-visible");
  });

  schedulePlanBuilder(2660, () => {
    state.chartReadyStage = 4;
    continueButton?.removeAttribute("hidden");
  });
}

function renderSafetyChartStep() {
  if (typeof QuizAPI !== "undefined") QuizAPI.trackStep("safety-chart");

  const stage = state.chartReadyStage;
  const ageRange = getProjectionAgeCopy(state.answers.age);
  const audience = getAudienceLabel();
  const displayName = getDisplayName();
  const showContinue = stage >= 4;

  app.innerHTML = `
    <div class="screen screen-safety-chart">
      <div class="safety-chart__plot">
        <p class="safety-chart__chart-label">Negative effects on your relationships</p>
        <svg class="safety-chart__svg" viewBox="0 0 520 300" aria-hidden="true">
          <defs>
            <linearGradient id="safety-chart-gradient" x1="58" y1="0" x2="468" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="#f18b76" stop-opacity="0.18"></stop>
              <stop offset="52%" stop-color="#edd779" stop-opacity="0.17"></stop>
              <stop offset="100%" stop-color="#8fcb68" stop-opacity="0.18"></stop>
            </linearGradient>
            <linearGradient id="safety-chart-line-gradient" x1="124" y1="24" x2="454" y2="204" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="#eb8754"></stop>
              <stop offset="60%" stop-color="#e9c53d"></stop>
              <stop offset="100%" stop-color="#74c348"></stop>
            </linearGradient>
            <path id="safety-chart-curve-path" d="M124 24 C156 24 184 32 214 59 C232 75 244 86 255 96 C292 132 322 170 352 187 C388 201 422 204 454 204"></path>
          </defs>

          <path
            class="safety-chart__area"
            d="M58 240 L58 24 L124 24 C156 24 184 32 214 59 C232 75 244 86 255 96 C292 132 322 170 352 187 C388 201 422 204 454 204 L454 240 Z"
          ></path>

          <line x1="58" y1="240" x2="480" y2="240" class="safety-chart__axis"></line>
          <line x1="58" y1="200" x2="480" y2="200" class="safety-chart__grid"></line>
          <line x1="58" y1="150" x2="480" y2="150" class="safety-chart__grid"></line>
          <line x1="58" y1="100" x2="480" y2="100" class="safety-chart__grid"></line>
          <line x1="58" y1="50" x2="480" y2="50" class="safety-chart__grid"></line>

          <line x1="124" y1="26" x2="124" y2="240" class="safety-chart__grid"></line>
          <line x1="255" y1="26" x2="255" y2="240" class="safety-chart__grid"></line>
          <line x1="352" y1="26" x2="352" y2="240" class="safety-chart__grid"></line>
          <line x1="454" y1="26" x2="454" y2="240" class="safety-chart__grid"></line>

          <path class="safety-chart__segment safety-chart__segment--base" d="M58 24 L124 24"></path>
          <use href="#safety-chart-curve-path" class="safety-chart__curve ${showContinue ? "is-animating is-complete" : ""}"></use>

          <circle cx="124" cy="240" r="6" class="safety-chart__tick-dot"></circle>
          <circle cx="255" cy="240" r="6" class="safety-chart__tick-dot"></circle>
          <circle cx="352" cy="240" r="6" class="safety-chart__tick-dot"></circle>
          <circle cx="454" cy="240" r="6" class="safety-chart__tick-dot"></circle>

          <circle cx="124" cy="24" r="14" class="safety-chart__point safety-chart__point--red"></circle>
          <circle cx="255" cy="96" r="14" class="safety-chart__point safety-chart__point--orange ${showContinue ? "is-visible" : ""}"></circle>
          <circle cx="352" cy="187" r="14" class="safety-chart__point safety-chart__point--yellow ${showContinue ? "is-visible" : ""}"></circle>
          <circle cx="454" cy="204" r="14" class="safety-chart__point safety-chart__point--green ${showContinue ? "is-visible" : ""}"></circle>

          <text x="124" y="262" class="safety-chart__week-label is-visible" text-anchor="middle">WEEK 1</text>
          <text x="255" y="262" class="safety-chart__week-label safety-chart__week-label--two ${showContinue ? "is-visible" : ""}" text-anchor="middle">WEEK 2</text>
          <text x="352" y="262" class="safety-chart__week-label safety-chart__week-label--three ${showContinue ? "is-visible" : ""}" text-anchor="middle">WEEK 3</text>
          <text x="454" y="262" class="safety-chart__week-label safety-chart__week-label--four ${showContinue ? "is-visible" : ""}" text-anchor="middle">WEEK 4</text>

          <g class="safety-chart__arrow-tip ${showContinue ? "is-visible" : ""}" aria-hidden="true"${showContinue ? ' transform="translate(454,204) rotate(0)"' : ''}>
            <path d="M0 0 L-18 -9 L-18 9 Z" fill="#74c348"></path>
          </g>
        </svg>

        <div class="safety-chart__tooltip safety-chart__tooltip--today ${showContinue ? "is-visible" : ""}">
          Today
        </div>
        <div class="safety-chart__tooltip safety-chart__tooltip--after ${showContinue ? "is-visible" : ""}">
          After using<br>NewMindStart
        </div>
      </div>

      <h2 class="screen-title safety-chart__title">
        <span class="safety-chart__title-name">${escapeHtml(displayName)},</span>
        Your personal <span class="safety-chart__title-accent">Trauma Management Plan</span> is ready.
      </h2>

      <p class="safety-chart__note">
        The chart is a non-customized illustration, results may vary.
      </p>

      <button class="primary-button secondary safety-chart__continue button-continue" id="safetyChartContinue" type="button" ${showContinue ? "" : "hidden"}>
        Continue
      </button>
    </div>
  `;

  document.getElementById("safetyChartContinue").addEventListener("click", () => {
    state.stepIndex += 1;
    render();
  });

  if (!showContinue) {
    startSafetyChartAnimation();
  }
}

function getScratchDiscountValue() {
  return 61;
}

function getPromoCode() {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const now = new Date();
  const raw = (state.answers.name || "User").replace(/\s+/g, "");
  const name = raw.charAt(0).toUpperCase() + raw.slice(1);
  return `${name}_${months[now.getMonth()]}${now.getFullYear()}`;
}

function fireScratchConfetti() {
  if (typeof confetti !== "function") return;

  const colors = ["#ffbf2f", "#39bdf0", "#8b5cf6", "#ff4e7a", "#7cf144", "#ff6b35"];
  const shared = { colors, shapes: ["square"], scalar: 1.1, gravity: 0.9, ticks: 350 };

  // Left party popper
  confetti({ ...shared, particleCount: 90, angle: 62, spread: 55, origin: { x: 0.08, y: 1 } });
  // Right party popper
  confetti({ ...shared, particleCount: 90, angle: 118, spread: 55, origin: { x: 0.92, y: 1 } });

  // Second wave
  setTimeout(() => {
    confetti({ ...shared, particleCount: 50, angle: 70, spread: 45, origin: { x: 0.18, y: 0.95 } });
    confetti({ ...shared, particleCount: 50, angle: 110, spread: 45, origin: { x: 0.82, y: 0.95 } });
  }, 220);
}

function unlockScratchCard() {
  if (state.scratchCard.revealed) {
    return;
  }

  state.scratchCard.revealed = true;
  state.scratchCard.popupOpen = true;
  render();
}

function getOfferOfferData() {
  const ageRange = getProjectionAgeCopy(state.answers.age);
  const audience = getAudienceLabel();
  const discount = getScratchDiscountValue();
  const expired = state.offer.expired;
  const plans = [
    {
      id: "trial",
      label: "7-day trial",
      originalPrice: expired ? null : "$17.77",
      currentPrice: expired ? "$17.77" : "$6.90",
      originalDailyPrice: expired ? null : "$2.53",
      dailyPrice: expired ? "$2.53" : "$0.98",
      selected: state.offer.selectedPlan === "trial",
      badge: ""
    },
    {
      id: "core",
      label: "4-week plan",
      originalPrice: expired ? null : "$38.95",
      currentPrice: expired ? "$38.95" : "$15.20",
      originalDailyPrice: expired ? null : "$1.29",
      dailyPrice: expired ? "$1.29" : "$0.50",
      selected: state.offer.selectedPlan === "core",
      badge: "Most popular"
    },
    {
      id: "extended",
      label: "12-week plan",
      originalPrice: expired ? null : "$94.85",
      currentPrice: expired ? "$94.85" : "$41.60",
      originalDailyPrice: expired ? null : "$1.05",
      dailyPrice: expired ? "$1.05" : "$0.46",
      selected: state.offer.selectedPlan === "extended",
      badge: ""
    }
  ];

  const selectedPlan = plans.find((plan) => plan.selected) || plans[1];
  const legalHtml = expired
    ? `By clicking "GET MY PLAN", you agree to automatic subscription renewal. ${selectedPlan.label.toUpperCase()} is billed at ${selectedPlan.currentPrice}. Cancel via email: hello@newmindstart.com.`
    : selectedPlan.id === "trial"
      ? 'By clicking "GET MY PLAN", you agree to a 1-week trial at <s>$17.77</s> $6.90, converting to a <s>$38.95</s> $15.20/month auto-renewing subscription if not canceled. Cancel via email: hello@newmindstart.com.'
      : selectedPlan.id === "core"
        ? 'By clicking "GET MY PLAN", you agree to automatic subscription renewal. First month is <s>$38.95</s> $15.20, then $38.95/month. Cancel via email: hello@newmindstart.com.'
        : 'By clicking "GET MY PLAN", you agree to automatic subscription renewal. First three months are <s>$94.85</s> $41.60, then $94.85 per three months. Cancel via email: hello@newmindstart.com.';

  return {
    ageRange,
    audience,
    discount,
    expired,
    plans,
    selectedPlan,
    legalHtml,
    goals: [
      "Understand your attachment style and patterns",
      "Set healthy boundaries without guilt",
      "Stop repeating painful relationship cycles",
      "Build genuine emotional security",
      "Trust yourself and others more fully",
      "Attract and maintain healthy, loving connections"
    ],
    risks: [
      "Trapped in the same painful patterns",
      "Constant anxiety about relationships",
      "Feeling emotionally unavailable or shut down",
      "Over-giving and feeling resentful",
      "Pushing people away before they can leave",
      "Never feeling truly safe or loved"
    ],
    wins: [
      "Feeling emotionally secure and grounded",
      "Healthy, loving relationships",
      "Boundaries that feel natural, not guilt-ridden",
      "Deeper intimacy and authentic connection",
      "Choosing partners who are good for you",
      "Peace with your past and your story"
    ],
    faqs: [
      {
        title: "What if I don't have enough willpower to stick to the plan?",
        body:
          "Our program builds momentum through structure, not willpower. Small, science-backed steps fit naturally into your routine so you stay consistent even on tough days — no motivation required."
      },
      {
        title: "What if I have too many distractions in my life?",
        body:
          "Life gets hectic — that's exactly why the plan is built to flex around you. Sessions take just 5–10 minutes and work around any schedule, so real progress doesn't stop when life gets busy."
      },
      {
        title: "What if I feel overwhelmed about starting this plan?",
        body:
          "You don't need to feel ready. The program starts small and builds gently, guiding you one step at a time. The only thing required is to begin."
      },
      {
        title: "What if I've tried tools before and they haven't worked for me?",
        body:
          "This plan is built around your specific patterns, not a generic template. People who've tried other approaches find that a personalised, adaptive program unlocks results that one-size-fits-all tools always miss."
      }
    ]
  };
}

function renderOfferReviewCards() {
  const starSvg = `<svg viewBox="0 0 20 20" fill="#f5a623" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.5L10 14.1 5.06 16.71 6 11.21l-4-3.9 5.53-.8z"/></svg>`;
  const reviews = [
    {
      photo: "https://randomuser.me/api/portraits/women/68.jpg",
      name: "Barbara M.",
      bold: "I finally feel like myself again after years of emotional numbness.",
      muted: "The program gently helped me process old wounds I'd been carrying for decades — I'm genuinely grateful."
    },
    {
      photo: "https://randomuser.me/api/portraits/men/71.jpg",
      name: "Robert K.",
      bold: "Three weeks in and my relationship with my wife is already shifting for the better.",
      muted: "I was skeptical at first, but the personalized approach made all the difference. Highly recommend."
    },
    {
      photo: "https://randomuser.me/api/portraits/men/46.jpg",
      name: "James T.",
      bold: "This gave me language and tools for things I didn't even know I was carrying.",
      muted: "The daily exercises are short but surprisingly powerful. I've recommended it to my whole family."
    }
  ];
  return reviews.map((r) => `
    <article class="offer-review-card">
      <div class="offer-review-card__photo-col">
        <img src="${escapeHtml(r.photo)}" alt="${escapeHtml(r.name)}" class="offer-review-card__photo" loading="lazy" />
      </div>
      <div class="offer-review-card__content">
        <p class="offer-review-card__body"><strong>${escapeHtml(r.bold)}</strong> <span class="offer-review-card__muted">${escapeHtml(r.muted)}</span></p>
        <div class="offer-review-card__footer">
          <div class="offer-review-card__stars" aria-label="5 out of 5 stars">${starSvg.repeat(5)}</div>
          <p class="offer-review-card__author">${escapeHtml(r.name)}</p>
        </div>
      </div>
    </article>
  `).join("");
}

function renderOfferPlanOptions(offer) {
  return offer.plans
    .map(
      (plan) => `
        <article class="offer-plan-option ${plan.selected ? "is-selected" : ""} ${plan.badge ? "has-badge" : ""}" data-offer-plan="${escapeHtml(plan.id)}">
          ${
            plan.badge
              ? `<div class="offer-plan-option__badge" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><path d="M12 2.8 14.8 8.5l6.2.9-4.5 4.4 1.1 6.2L12 17.1 6.4 20l1.1-6.2L3 9.4l6.2-.9L12 2.8Z"/></svg>
                  <span>${escapeHtml(plan.badge)}</span>
                </div>`
              : ""
          }
          <div class="offer-plan-option__main">
            <div class="offer-plan-option__copy">
              <div class="offer-plan-option__heading">
                <span class="offer-plan-option__radio ${plan.selected ? "is-selected" : ""}" aria-hidden="true"></span>
                <p class="offer-plan-option__label">${escapeHtml(plan.label)}</p>
              </div>
              <div class="offer-plan-option__price-line">
                ${plan.originalPrice ? `<span class="offer-plan-option__original">${escapeHtml(plan.originalPrice)}</span>` : ""}
                <span class="offer-plan-option__current">${escapeHtml(plan.currentPrice)}</span>
              </div>
            </div>
            <div class="offer-plan-option__price-right">
              ${plan.originalDailyPrice ? `<span class="offer-plan-option__daily-was">${escapeHtml(plan.originalDailyPrice)}</span>` : ""}
              <div class="offer-plan-option__daily-wrap">
                <div class="offer-plan-option__daily-arrow" aria-hidden="true"></div>
                <div class="offer-plan-option__daily-tag">
                  <span class="offer-plan-option__daily-currency">$</span>
                  <span class="offer-plan-option__daily-price">${escapeHtml(plan.dailyPrice.replace("$", "").split(".")[0])}</span>
                  <div class="offer-plan-option__daily-stack">
                    <span class="offer-plan-option__daily-decimal">${escapeHtml(plan.dailyPrice.split(".")[1] || "00")}</span>
                    <span class="offer-plan-option__daily-copy">per day</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </article>
      `
    )
    .join("");
}

function renderChecklistItems(items, positive = true, icons = null) {
  return items.map((item, i) => {
    const icon = icons ? icons[i % icons.length] : null;
    const iconHtml = icon
      ? `<img src="./assets/${icon}" class="offer-checklist__emoji" alt="" aria-hidden="true" />`
      : `<span class="offer-checklist__icon" aria-hidden="true">${positive ? "✓" : "×"}</span>`;
    return `<li class="offer-checklist__item ${positive ? "is-positive" : "is-negative"}">${iconHtml}<span>${escapeHtml(item)}</span></li>`;
  }).join("");
}

function openOfferUpsellOrNavigate(e) {
  if (e && e.preventDefault) e.preventDefault();

  const offer = getOfferOfferData();
  const showUpsell = !offer.expired;

  if (showUpsell && (state.offer.selectedPlan === "trial" || state.offer.selectedPlan === "core")) {
    if (typeof QuizAPI !== "undefined") QuizAPI.submit({ data: { upsell_shown: true, upsell_from_plan: state.offer.selectedPlan } });

    const extendedPlan = offer.plans.find((p) => p.id === "extended");
    const upsellOriginal = "$94.85";
    const upsellCurrent = extendedPlan.currentPrice;
    const upsellPct = 61;
    const upsellLegal = `By clicking "Claim special offer", you agree to automatic subscription renewal. First three months are ${upsellCurrent}, then $94.85 per three months. Cancel via email: hello@newmindstart.com.`;

    const overlay = document.createElement("div");
    overlay.className = "upsell-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Special offer");
    overlay.innerHTML = `
      <div class="upsell-modal">
        <p class="upsell-modal__eyebrow">Special offer</p>
        <h2 class="upsell-modal__title">Upgrade to 12-WEEK PLAN and save</h2>
        <div class="upsell-ticket">
          <div class="upsell-ticket__top">
            <div class="upsell-ticket__pct-row">
              <span class="upsell-ticket__pct">${upsellPct}</span><span class="upsell-ticket__pct-sym">%</span>
            </div>
            <span class="upsell-ticket__off">OFF</span>
          </div>
          <div class="upsell-ticket__mid" aria-hidden="true">
            <span class="upsell-ticket__notch"></span>
            <span class="upsell-ticket__dashes"></span>
            <span class="upsell-ticket__notch"></span>
          </div>
          <div class="upsell-ticket__bottom">
            <span class="upsell-ticket__was">${escapeHtml(upsellOriginal)}</span>
            <span class="upsell-ticket__now">${escapeHtml(upsellCurrent)}</span>
          </div>
        </div>
        <button class="primary-button upsell-modal__claim" type="button">Claim special offer</button>
        <button class="upsell-modal__decline" type="button">No, thanks</button>
        <hr class="upsell-modal__rule">
        <p class="upsell-modal__legal">${escapeHtml(upsellLegal)}</p>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector(".upsell-modal__claim").addEventListener("click", () => {
      state.offer.selectedPlan = "extended";
      if (typeof QuizAPI !== "undefined") QuizAPI.submit({ data: { upsell_accepted: true } });
      navigateToPaywall();
    });

    overlay.querySelector(".upsell-modal__decline").addEventListener("click", () => {
      overlay.remove();
      if (typeof QuizAPI !== "undefined") QuizAPI.submit({ data: { upsell_accepted: false } });
      navigateToPaywall();
    });
  } else {
    navigateToPaywall();
  }
}

function renderStatRingSvg(dashoffset) {
  const dots = [
    [69.68,7.62],[85.09,17.91],[95.38,33.32],[99,51.5],[95.38,69.68],
    [85.09,85.09],[69.68,95.38],[51.5,99],[33.32,95.38],[17.91,85.09],
    [7.62,69.68],[4,51.5],[7.62,33.32],[17.91,17.91],[33.32,7.62],[51.5,4]
  ].map(([cx,cy]) => `<circle cx="${cx}" cy="${cy}" r="4" fill="#d4d8e3" fill-opacity="1"/>`).join("");
  return `<svg width="103" height="103" viewBox="0 0 103 103" aria-hidden="true">${dots}<circle r="47.5" cx="51.5" cy="51.5" fill="transparent" stroke="#ff7233" stroke-width="8" stroke-linecap="round" stroke-dasharray="298.45" stroke-dashoffset="${dashoffset}" transform="rotate(-90 51.5 51.5)"/></svg>`;
}

function renderOfferStep() {
  const activeOfferTheme = syncAssignedOfferTheme();

  if (typeof QuizAPI !== "undefined") {
    QuizAPI.submit({ data: { step: "offer-page", offer_theme: activeOfferTheme } });
    QuizAPI.trackFB("InitiateCheckout");
  }

  const offer = getOfferOfferData();
  const displayName = getDisplayName();

  app.innerHTML = `
    <div class="screen screen-offer-offer">
      <section class="offer-comparison">
        <div class="offer-comparison__cards">
          <article class="offer-compare-card">
            <div class="offer-compare-card__hero">
              <img class="offer-state-card__image" src="${escapeHtml(getAssetUrl(state.answers.gender === 'man' ? './assets/man-before.avif' : './assets/woman-before.avif'))}" alt="Current state illustration" />
              <div class="offer-state-card__label">Now</div>
            </div>
            <div class="offer-state-card">
              <div class="offer-state-card__stats">
                <div class="offer-state-card__item">
                  <p class="offer-state-card__title">Recovery stage</p>
                  <p class="offer-state-card__value">Struggling</p>
                </div>
                <div class="offer-state-card__item">
                  <p class="offer-state-card__title">Stress resilience</p>
                  <p class="offer-state-card__value">Low</p>
                  <div class="offer-progress-line" aria-hidden="true">
                    <span class="is-active"></span><span></span><span></span>
                  </div>
                </div>
                <div class="offer-state-card__item">
                  <p class="offer-state-card__title">Emotional regulation</p>
                  <p class="offer-state-card__value">Weak</p>
                  <div class="offer-energy-slider" aria-hidden="true">
                    <span class="offer-energy-slider__fill" style="width:25%;"></span>
                    <span class="offer-energy-slider__thumb" style="left:25%;"></span>
                  </div>
                </div>
              </div>
            </div>
          </article>

          <article class="offer-compare-card">
            <div class="offer-compare-card__hero">
              <img class="offer-state-card__image" src="${escapeHtml(getAssetUrl(state.answers.gender === 'man' ? './assets/man-after.avif' : './assets/woman-after.avif'))}" alt="Desired future state illustration" />
              <div class="offer-state-card__label offer-state-card__label--goal">Your Goal</div>
            </div>
            <div class="offer-state-card">
              <div class="offer-state-card__stats">
                <div class="offer-state-card__item">
                  <p class="offer-state-card__title">Recovery stage</p>
                  <p class="offer-state-card__value">Fully healed</p>
                </div>
                <div class="offer-state-card__item">
                  <p class="offer-state-card__title">Stress resilience</p>
                  <p class="offer-state-card__value">High</p>
                  <div class="offer-progress-line" aria-hidden="true">
                    <span class="is-active"></span><span class="is-active"></span><span class="is-active"></span>
                  </div>
                </div>
                <div class="offer-state-card__item">
                  <p class="offer-state-card__title">Emotional regulation</p>
                  <p class="offer-state-card__value">Strong</p>
                  <div class="offer-energy-slider is-active" aria-hidden="true">
                    <span class="offer-energy-slider__fill" style="width:85%;"></span>
                    <span class="offer-energy-slider__thumb" style="left:85%;"></span>
                  </div>
                </div>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section class="offer-price-section" id="offerPlanAnchor">
        <h2 class="screen-title offer-price-section__title">
          Your personalized <span class="offer-price-section__title-accent">Trauma Management Plan</span> is ready!
        </h2>

        <div class="offer-result-chips">
          <article class="offer-result-chip">
            <img class="offer-result-chip__icon" src="./assets/emotional_balance.svg" alt="" aria-hidden="true">
            <div>
              <p class="offer-result-chip__label">Main struggle</p>
              <p class="offer-result-chip__value">Disconnection</p>
            </div>
          </article>
          <article class="offer-result-chip">
            <img class="offer-result-chip__icon" src="./assets/108.svg" alt="" aria-hidden="true">
            <div>
              <p class="offer-result-chip__label">Goal</p>
              <p class="offer-result-chip__value">Self-recovery</p>
            </div>
          </article>
        </div>

        ${!offer.expired ? `
        <div class="offer-promo-widget">
          <div class="offer-promo-widget__banner">
            <img class="offer-promo-widget__icon offer-promo-widget__icon--blue" src="${escapeHtml(getAssetUrl('./assets/tag_blue.webp'))}" alt="" aria-hidden="true" />
            <img class="offer-promo-widget__icon offer-promo-widget__icon--orange" src="${escapeHtml(getAssetUrl('./assets/tag_orange.webp'))}" alt="" aria-hidden="true" />
            <img class="offer-promo-widget__icon offer-promo-widget__icon--green" src="${escapeHtml(getAssetUrl('./assets/tag_green.webp'))}" alt="" aria-hidden="true" />
            <span class="offer-promo-widget__title">Your promo code applied!</span>
          </div>
          <div class="offer-promo-widget__body">
            <div class="offer-promo-widget__input">
              <span class="offer-promo-widget__check" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
              </span>
              <span class="offer-promo-widget__code-text">${escapeHtml(getPromoCode())}</span>
            </div>
            <div class="offer-promo-widget__timer">
              <div class="offer-promo-widget__timer-digits">
                <span class="offer-promo-widget__timer-unit">
                  <span class="js-price-countdown-mins">07</span>
                  <span class="offer-promo-widget__timer-label">min</span>
                </span>
                <span class="offer-promo-widget__timer-sep">:</span>
                <span class="offer-promo-widget__timer-unit">
                  <span class="js-price-countdown-secs">38</span>
                  <span class="offer-promo-widget__timer-label">sec</span>
                </span>
              </div>
            </div>
          </div>
        </div>` : ""}

        <div class="offer-plan-list">
          ${renderOfferPlanOptions(offer)}
        </div>

        <a class="primary-button offer-main-cta button-continue" href="./paywall.html">Get my plan</a>

        <p class="offer-legal">
          ${offer.legalHtml}
        </p>

        <div class="offer-trust-row">
          <img class="offer-payment-image" src="${escapeHtml(getAssetUrl("./assets/pay.png"))}" alt="Secure payment methods" />
        </div>
      </section>

      <section class="offer-goals">
        <h3 class="offer-section-title">Our goals</h3>
        <ul class="offer-checklist">
          ${renderChecklistItems(offer.goals, true)}
        </ul>
      </section>

      <section class="offer-featured">
        <h3 class="offer-section-title">Our program is based on methodology</h3>
        <div class="offer-featured__grid">
          <div class="offer-featured__card">
            <img class="offer-featured__logo-img" src="https://imagedelivery.net/yV7GQhi_zl7Pdn3EJrn61Q/ba3c08ff-6bb6-4b31-bf07-46f6aea24700/public" alt="Forbes" />
          </div>
          <div class="offer-featured__card">
            <img class="offer-featured__logo-img" src="https://imagedelivery.net/yV7GQhi_zl7Pdn3EJrn61Q/1f9f4537-9b01-4bf7-132b-d99da65f6500/public" alt="The New York Times" />
          </div>
          <div class="offer-featured__card">
            <img class="offer-featured__logo-img" src="https://imagedelivery.net/yV7GQhi_zl7Pdn3EJrn61Q/8c59a8f4-5e30-48c0-fc42-89bee7b95e00/public" alt="CNN Health" />
          </div>
          <div class="offer-featured__card">
            <img class="offer-featured__logo-img" src="https://imagedelivery.net/yV7GQhi_zl7Pdn3EJrn61Q/b2068a85-6bbf-49a1-3f4a-88807d466d00/public" alt="The Wall Street Journal" />
          </div>
          <div class="offer-featured__card">
            <img class="offer-featured__logo-img" src="https://imagedelivery.net/yV7GQhi_zl7Pdn3EJrn61Q/d4279bb3-5952-46e1-1773-9d83e8fa0f00/public" alt="Vox" />
          </div>
          <div class="offer-featured__card">
            <img class="offer-featured__logo-img" src="https://imagedelivery.net/yV7GQhi_zl7Pdn3EJrn61Q/4baf5780-b1aa-47d5-591c-b2c5766e2e00/public" alt="Top Techs" />
          </div>
        </div>
      </section>

      <section class="offer-faq">
        <div class="offer-faq__heading">
          <div class="offer-faq__heading-icon">
            <img src="${escapeHtml(getAssetUrl("./assets/116.svg"))}" width="44" height="44" alt="" aria-hidden="true" />
          </div>
          <h3 class="offer-section-title">People often ask</h3>
        </div>
        <div class="offer-faq__list">
          ${offer.faqs.map((faq, i) => `
            <div class="offer-faq__item" data-faq-index="${i}">
              <button class="offer-faq__toggle" type="button" aria-expanded="false" aria-controls="faq-panel-${i}">
                <h4 class="offer-faq__title">${escapeHtml(faq.title)}</h4>
                <span class="offer-faq__chevron" aria-hidden="true">
                  <svg viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M7.25 20.25H13.25C18.25 20.25 20.25 18.25 20.25 13.25V7.25C20.25 2.25 18.25 0.25 13.25 0.25H7.25C2.25 0.25 0.25 2.25 0.25 7.25V13.25C0.25 18.25 2.25 20.25 7.25 20.25Z" fill="#f0f2f5" stroke="#d0d5de" stroke-width="0.5"/>
                    <path d="M14.25 8.25L10.25 12.25L6.25 8.25" stroke="#1f2331" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </span>
              </button>
              <div class="offer-faq__panel" id="faq-panel-${i}" role="region" hidden>
                <p class="offer-faq__body">${escapeHtml(faq.body)}</p>
              </div>
            </div>
          `).join("")}
        </div>
      </section>

      <section class="offer-stats">
        <svg class="offer-stats__blob" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 390 680" fill="none" preserveAspectRatio="xMidYMid slice">
          <g filter="url(#blob-a)"><rect x="417" y="100" width="500" height="420" rx="180" transform="rotate(90 417 100)" fill="#ff4f00"/></g>
          <g opacity="0.55" filter="url(#blob-b)"><rect x="417" y="300" width="340" height="420" rx="170" transform="rotate(90 417 300)" fill="#ff7233"/></g>
          <defs>
            <filter id="blob-a" x="-200" y="-60" width="810" height="760"><feGaussianBlur stdDeviation="85"/></filter>
            <filter id="blob-b" x="-250" y="100" width="880" height="700"><feGaussianBlur stdDeviation="100"/></filter>
          </defs>
        </svg>
        <div class="offer-stats__icon" aria-hidden="true">
          <img src="./assets/earth-heart.svg" width="36" height="36" alt="" />
        </div>
        <h3 class="offer-section-title offer-section-title--light">People just like you achieved great results using our Trauma Management Plan</h3>
        <ul class="offer-stat-rows">
          <li class="offer-stat-row">
            <div class="offer-stat-row__ring">${renderStatRingSvg(50.74)}<div class="offer-stat-row__pct">83%</div></div>
            <div class="offer-stat-row__text">
              <span class="offer-stat-row__badge">Emotional security</span>
              <p class="offer-stat-row__desc">of users felt more <strong>emotionally secure</strong> after just 6 weeks</p>
            </div>
          </li>
          <li class="offer-stat-divider" aria-hidden="true"></li>
          <li class="offer-stat-row">
            <div class="offer-stat-row__ring">${renderStatRingSvg(68.64)}<div class="offer-stat-row__pct">77%</div></div>
            <div class="offer-stat-row__text">
              <span class="offer-stat-row__badge">Anxious-avoidant pattern</span>
              <p class="offer-stat-row__desc">started from the same <strong>anxious-avoidant pattern</strong> you described</p>
            </div>
          </li>
          <li class="offer-stat-divider" aria-hidden="true"></li>
          <li class="offer-stat-row">
            <div class="offer-stat-row__ring">${renderStatRingSvg(164.15)}<div class="offer-stat-row__pct">45%</div></div>
            <div class="offer-stat-row__text">
              <span class="offer-stat-row__badge">Foundational wound</span>
              <p class="offer-stat-row__desc">suffer from the same <strong>foundational wound</strong> as you</p>
            </div>
          </li>
        </ul>
      </section>



      <section class="offer-reviews">
        <div class="offer-reviews__heading">
          <div class="offer-reviews__icon-box" aria-hidden="true">
            <img src="${escapeHtml(getAssetUrl("./assets/116.svg"))}" width="44" height="44" alt="" aria-hidden="true" />
          </div>
          <h3 class="offer-section-title">Users love our plans</h3>
          <p class="offer-reviews__copy">Here's what people are saying about NewMindStart.</p>
        </div>
        <div class="offer-review-list">
          ${renderOfferReviewCards()}
        </div>
      </section>

      <section class="offer-price-section offer-price-section--repeat" id="offerPlanBottom">
        <h3 class="offer-section-title">Your personalized <span class="offer-section-title__accent">Trauma Management Plan</span> is ready!</h3>

        <div class="offer-result-chips">
          <article class="offer-result-chip">
            <img class="offer-result-chip__icon" src="./assets/emotional_balance.svg" alt="" aria-hidden="true">
            <div>
              <p class="offer-result-chip__label">Main struggle</p>
              <p class="offer-result-chip__value">Disconnection</p>
            </div>
          </article>
          <article class="offer-result-chip">
            <img class="offer-result-chip__icon" src="./assets/108.svg" alt="" aria-hidden="true">
            <div>
              <p class="offer-result-chip__label">Goal</p>
              <p class="offer-result-chip__value">Self-recovery</p>
            </div>
          </article>
        </div>

        ${!offer.expired ? `
        <div class="offer-promo-widget">
          <div class="offer-promo-widget__banner">
            <img class="offer-promo-widget__icon offer-promo-widget__icon--blue" src="${escapeHtml(getAssetUrl('./assets/tag_blue.webp'))}" alt="" aria-hidden="true" />
            <img class="offer-promo-widget__icon offer-promo-widget__icon--orange" src="${escapeHtml(getAssetUrl('./assets/tag_orange.webp'))}" alt="" aria-hidden="true" />
            <img class="offer-promo-widget__icon offer-promo-widget__icon--green" src="${escapeHtml(getAssetUrl('./assets/tag_green.webp'))}" alt="" aria-hidden="true" />
            <span class="offer-promo-widget__title">Your promo code applied!</span>
          </div>
          <div class="offer-promo-widget__body">
            <div class="offer-promo-widget__input">
              <span class="offer-promo-widget__check" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
              </span>
              <span class="offer-promo-widget__code-text">${escapeHtml(getPromoCode())}</span>
            </div>
            <div class="offer-promo-widget__timer">
              <div class="offer-promo-widget__timer-digits">
                <span class="offer-promo-widget__timer-unit">
                  <span class="js-price-countdown-mins">07</span>
                  <span class="offer-promo-widget__timer-label">min</span>
                </span>
                <span class="offer-promo-widget__timer-sep">:</span>
                <span class="offer-promo-widget__timer-unit">
                  <span class="js-price-countdown-secs">38</span>
                  <span class="offer-promo-widget__timer-label">sec</span>
                </span>
              </div>
            </div>
          </div>
        </div>` : ""}

        <div class="offer-plan-list">
          ${renderOfferPlanOptions(offer)}
        </div>
        <a class="primary-button offer-main-cta button-continue" href="./paywall.html">Get my plan</a>
        <p class="offer-legal">${offer.legalHtml}</p>
        <div class="offer-trust-row">
          <img class="offer-payment-image" src="${escapeHtml(getAssetUrl("./assets/pay.png"))}" alt="Secure payment methods" />
        </div>
      </section>

      <section class="offer-moneyback">
        <div class="offer-moneyback__title-row">
          <span class="offer-moneyback__shield" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40" fill="none">
              <defs>
                <linearGradient id="moneyback-shield-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#ff7233"/>
                  <stop offset="60%" stop-color="#e84800"/>
                  <stop offset="100%" stop-color="#cc3d00"/>
                </linearGradient>
              </defs>
              <path d="M20 3.33334C20.7067 3.33334 21.7059 3.77644 23.7041 4.66342C25.1696 5.31398 27.0042 6.02701 29.085 6.6185C32.1302 7.48416 33.6527 7.91737 34.3262 8.80893C34.9996 9.70054 35 11.067 35 13.8001V18.639C34.9999 28.014 26.5625 33.6389 22.3438 35.8656C21.3319 36.3996 20.8257 36.6664 20 36.6664C19.1743 36.6664 18.6681 36.3996 17.6562 35.8656C13.4374 33.6389 5.0001 28.014 5 18.639V13.8001C5 11.067 5.00034 9.70054 5.67383 8.80893C6.34738 7.91732 7.87044 7.48424 10.916 6.6185C12.9966 6.02702 14.8305 5.31393 16.2959 4.66342C18.294 3.77644 19.2933 3.33334 20 3.33334Z" fill="url(#moneyback-shield-grad)"/>
              <path d="M28.0137 14.5902C27.4493 14.0259 26.5341 14.0259 25.9697 14.5902L18.8164 21.7425L15.0703 17.9964C14.506 17.4322 13.5917 17.4322 13.0273 17.9964C12.4629 18.5608 12.4629 19.476 13.0273 20.0404L17.7725 24.7855C17.7798 24.7932 17.7864 24.8024 17.7939 24.8099C18.0764 25.0922 18.4473 25.232 18.8174 25.2318C18.9417 25.2307 19.0531 25.2156 19.1621 25.1888C19.2155 25.1757 19.2684 25.1602 19.3203 25.141C19.4204 25.1037 19.5179 25.0557 19.6094 24.9955C19.6904 24.9422 19.7686 24.8802 19.8398 24.8089C19.8424 24.8063 19.8441 24.8028 19.8467 24.8001L28.0137 16.6341C28.578 16.0698 28.5779 15.1546 28.0137 14.5902Z" fill="white"/>
            </svg>
          </span>
          <h3 class="offer-moneyback__title">30-day money-back guarantee</h3>
        </div>
        <div class="offer-moneyback__description">
          <p class="offer-moneyback__copy">Our plan is backed by a money-back guarantee. If you reach out within 30 days of purchase, we'll give you a full refund.</p>
        </div>
        <a class="offer-moneyback__link" href="https://account.newmindstart.com/cancellation-refund-policies" target="_blank" rel="noopener noreferrer">
          Learn more
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path fill="currentColor" d="M8.471 6.53a.75.75 0 1 1 1.061-1.061l5.998 6.002a.75.75 0 0 1 0 1.06L9.528 18.53a.75.75 0 1 1-1.06-1.06L13.94 12z"/></svg>
        </a>
      </section>

    </div>
  `;

  const faqList = app.querySelector(".offer-faq__list");
  app.querySelectorAll(".offer-faq__toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = btn.closest(".offer-faq__item");
      const panel = item.querySelector(".offer-faq__panel");
      const isOpen = btn.getAttribute("aria-expanded") === "true";
      if (!isOpen && faqList) {
        faqList.querySelectorAll(".offer-faq__item.is-open").forEach((openItem) => {
          openItem.classList.remove("is-open");
          openItem.querySelector(".offer-faq__toggle").setAttribute("aria-expanded", "false");
          openItem.querySelector(".offer-faq__panel").hidden = true;
        });
      }
      btn.setAttribute("aria-expanded", String(!isOpen));
      item.classList.toggle("is-open", !isOpen);
      panel.hidden = isOpen;
    });
  });

  // A/B/C theme switcher — inject once, survive re-renders
  if (!document.querySelector(".offer-theme-switcher")) {
    const currentTheme = document.body.classList.contains("is-theme-orange") ? "orange" : document.body.classList.contains("is-theme-green") ? "green" : "blue";
    const switcher = document.createElement("div");
    switcher.className = "offer-theme-switcher";
    switcher.innerHTML = `
      <span class="offer-theme-switcher__label">Version</span>
      <button class="offer-theme-switcher__btn${currentTheme === "blue" ? " is-active" : ""}" data-theme="blue" aria-pressed="${currentTheme === "blue"}">B&nbsp;Blue</button>
      <button class="offer-theme-switcher__btn${currentTheme === "orange" ? " is-active" : ""}" data-theme="orange" aria-pressed="${currentTheme === "orange"}">A&nbsp;Orange</button>
      <button class="offer-theme-switcher__btn${currentTheme === "green" ? " is-active" : ""}" data-theme="green" aria-pressed="${currentTheme === "green"}">C&nbsp;Green</button>
    `;
    document.body.appendChild(switcher);
    switcher.querySelectorAll(".offer-theme-switcher__btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const theme = btn.dataset.theme;
        applyOfferTheme(theme);
        switcher.querySelectorAll(".offer-theme-switcher__btn").forEach((b) => {
          const active = b.dataset.theme === theme;
          b.classList.toggle("is-active", active);
          b.setAttribute("aria-pressed", String(active));
        });
      });
    });
  }

  app.querySelectorAll("[data-offer-plan]").forEach((element) => {
    element.addEventListener("click", () => {
      const { offerPlan } = element.dataset;
      if (!offerPlan || offerPlan === state.offer.selectedPlan) {
        return;
      }

      state.offer.selectedPlan = offerPlan;
      if (typeof QuizAPI !== "undefined") QuizAPI.submit({ data: { plan_selected: offerPlan } });

      // Update plan cards and radios in-place — no re-render to avoid scroll-to-top
      app.querySelectorAll("[data-offer-plan]").forEach((el) => {
        const sel = el.dataset.offerPlan === offerPlan;
        el.classList.toggle("is-selected", sel);
        const radio = el.querySelector(".offer-plan-option__radio");
        if (radio) radio.classList.toggle("is-selected", sel);
      });

      // Update legal texts that depend on selected plan
      const offer = getOfferOfferData();
      app.querySelectorAll(".offer-legal").forEach((el) => {
        el.innerHTML = offer.legalHtml;
      });
    });
  });

  app.querySelectorAll(".offer-main-cta").forEach((cta) => {
    cta.addEventListener("click", openOfferUpsellOrNavigate);
  });
}

function setupScratchCanvas() {
  const canvas = document.getElementById("scratchCanvas");
  const card = document.getElementById("scratchCardSurface");

  if (!canvas || !card || state.scratchCard.revealed) {
    return;
  }

  const rect = card.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * ratio));
  canvas.height = Math.max(1, Math.round(rect.height * ratio));

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.scale(ratio, ratio);

  const width = rect.width;
  const height = rect.height;
  const radius = 24;

  const gradient = ctx.createRadialGradient(width * 0.55, height * 0.38, 0, width * 0.5, height * 0.5, Math.max(width, height) * 0.8);
  gradient.addColorStop(0, "#fde8c4");
  gradient.addColorStop(0.45, "#f8c888");
  gradient.addColorStop(1, "#eda860");
  ctx.fillStyle = gradient;

  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(width - radius, 0);
  ctx.quadraticCurveTo(width, 0, width, radius);
  ctx.lineTo(width, height - radius);
  ctx.quadraticCurveTo(width, height, width - radius, height);
  ctx.lineTo(radius, height);
  ctx.quadraticCurveTo(0, height, 0, height - radius);
  ctx.lineTo(0, radius);
  ctx.quadraticCurveTo(0, 0, radius, 0);
  ctx.closePath();
  ctx.fill();

  // Diagonal gleam — soft white streak from top-left to mid-right
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(width - radius, 0);
  ctx.quadraticCurveTo(width, 0, width, radius);
  ctx.lineTo(width, height - radius);
  ctx.quadraticCurveTo(width, height, width - radius, height);
  ctx.lineTo(radius, height);
  ctx.quadraticCurveTo(0, height, 0, height - radius);
  ctx.lineTo(0, radius);
  ctx.quadraticCurveTo(0, 0, radius, 0);
  ctx.closePath();
  ctx.clip();
  const gleam = ctx.createLinearGradient(width * 0.1, 0, width * 0.72, height * 0.9);
  gleam.addColorStop(0,    "rgba(255,255,255,0)");
  gleam.addColorStop(0.38, "rgba(255,255,255,0)");
  gleam.addColorStop(0.46, "rgba(255,255,255,0.18)");
  gleam.addColorStop(0.52, "rgba(255,255,255,0.32)");
  gleam.addColorStop(0.58, "rgba(255,255,255,0.18)");
  gleam.addColorStop(0.66, "rgba(255,255,255,0)");
  gleam.addColorStop(1,    "rgba(255,255,255,0)");
  ctx.fillStyle = gleam;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  ctx.fillStyle = "rgba(232, 120, 40, 0.88)";
  ctx.font = "600 17px Satoshi, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText("Scratch to reveal your...", width / 2, height - 20);

  let drawing = false;
  let scratchChecks = 0;

  function getPosition(event) {
    const bounds = canvas.getBoundingClientRect();
    return {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top
    };
  }

  function eraseAt(position) {
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(position.x, position.y, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function checkRevealProgress() {
    scratchChecks += 1;

    if (scratchChecks % 8 !== 0) {
      return;
    }

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let cleared = 0;

    for (let index = 3; index < imageData.length; index += 16) {
      if (imageData[index] < 40) {
        cleared += 1;
      }
    }

    const sampleCount = imageData.length / 16;
    if (sampleCount && cleared / sampleCount > 0.36) {
      unlockScratchCard();
    }
  }

  function handlePointerDown(event) {
    event.preventDefault();
    drawing = true;
    const hint = document.getElementById("scratchHint");
    if (hint) { hint.style.display = "none"; }
    const trail = canvas.parentElement && canvas.parentElement.querySelector(".scratch-card__trail");
    if (trail) { trail.style.display = "none"; }
    canvas.setPointerCapture(event.pointerId);
    eraseAt(getPosition(event));
    checkRevealProgress();
  }

  function handlePointerMove(event) {
    if (!drawing) {
      return;
    }

    event.preventDefault();
    eraseAt(getPosition(event));
    checkRevealProgress();
  }

  function handlePointerUp(event) {
    drawing = false;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    checkRevealProgress();
  }

  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerup", handlePointerUp);
  canvas.addEventListener("pointercancel", handlePointerUp);
  canvas.addEventListener("pointerleave", () => {
    drawing = false;
  });
}

function renderScratchCardStep() {
  if (typeof QuizAPI !== "undefined") QuizAPI.trackStep("scratch-card");

  const displayName = getDisplayName();
  const discount = getScratchDiscountValue();
  const showPopup = state.scratchCard.popupOpen;

  app.innerHTML = `
    <div class="screen screen-scratch-card">
      <div class="scratch-card__badge">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" aria-hidden="true"><path fill="#e84800" fill-rule="evenodd" d="M10.677 2.954c.655-1.272 2.49-1.272 3.146 0l2.206 4.288a.26.26 0 0 0 .185.134l4.797.756c1.422.224 1.99 1.95.972 2.961l-3.434 3.41a.25.25 0 0 0-.07.215l.756 4.758c.225 1.41-1.26 2.478-2.544 1.83l-4.326-2.183a.25.25 0 0 0-.23 0L7.81 21.306c-1.285.648-2.77-.42-2.545-1.83l.756-4.758a.25.25 0 0 0-.07-.216l-3.434-3.409c-1.017-1.01-.45-2.737.972-2.961l4.797-.756a.25.25 0 0 0 .185-.134z" clip-rule="evenodd"/></svg>
        Claim your gift
      </div>

      <h2 class="screen-title scratch-card__title">
        ${escapeHtml(displayName)}, Scratch &amp; Save on your <span class="scratch-card__title-accent">Trauma Management Plan</span>
      </h2>

      <p class="scratch-card__copy">A little boost, right when you need it.</p>

      <div class="scratch-card__surface-wrap">
        <div class="scratch-card__surface ${state.scratchCard.revealed ? "is-revealed" : ""}" id="scratchCardSurface">
          <div class="scratch-card__reward">
            <img class="scratch-card__reward-emoji" src="./assets/gift_3d.svg" alt="" aria-hidden="true" />
            <p class="scratch-card__reward-label">Your discount is</p>
            <p class="scratch-card__reward-value">${escapeHtml(String(discount))}%</p>
            <div class="scratch-card__reward-divider"></div>
            <p class="scratch-card__reward-copy">on your personal Trauma Management Plan</p>
          </div>
          ${
            state.scratchCard.revealed
              ? `
                <div class="scratch-card__celebration" aria-hidden="true">
                  <span class="scratch-card__emoji scratch-card__emoji--one">🎉</span>
                  <span class="scratch-card__emoji scratch-card__emoji--two">✨</span>
                  <span class="scratch-card__emoji scratch-card__emoji--three">🥳</span>
                  <span class="scratch-card__confetti scratch-card__confetti--one"></span>
                  <span class="scratch-card__confetti scratch-card__confetti--two"></span>
                  <span class="scratch-card__confetti scratch-card__confetti--three"></span>
                  <span class="scratch-card__confetti scratch-card__confetti--four"></span>
                  <span class="scratch-card__confetti scratch-card__confetti--five"></span>
                </div>
              `
              : `
                <canvas class="scratch-card__canvas" id="scratchCanvas"></canvas>
                <svg class="scratch-card__trail" viewBox="0 0 380 215" preserveAspectRatio="none" aria-hidden="true">
                  <path class="scratch-card__trail-path" d="M 190 45 C 280 45 280 110 190 110 C 100 110 100 170 190 170"/>
                </svg>
                <div class="scratch-card__hint" id="scratchHint" aria-hidden="true">
                  <svg viewBox="0 0 36 44" width="36" height="44" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M13 2.5C13 1.12 14.12 0 15.5 0S18 1.12 18 2.5V18.4C18.8 17.9 19.8 17.6 20.9 17.6C22.4 17.6 23.7 18.3 24.5 19.4C25.2 18.6 26.3 18.1 27.5 18.1C28.9 18.1 30.1 18.8 30.8 19.9C31.4 19.3 32.3 18.9 33.3 18.9C35.3 18.9 36 20.4 36 22V28C36 35.2 30.2 41 23 41H20C15.5 41 11.5 38.7 9 35.2L2.5 26C1.6 24.7 2 22.9 3.3 22L4 21.5C5.3 20.7 7 21 7.9 22.2L13 29V2.5Z" fill="white"/>
                  </svg>
                </div>
              `
          }
        </div>
      </div>

      ${
        showPopup
          ? `
            <div class="scratch-card__overlay">
              <div class="scratch-card__modal" role="dialog" aria-modal="true" aria-label="Discount unlocked">
                <p class="scratch-card__modal-badge">WooHoo!</p>
                <div class="scratch-card__modal-gift-wrap" aria-hidden="true">
                  <div class="scratch-card__modal-rays"></div>
                  <img src="./assets/gift_3d.svg" class="scratch-card__modal-gift-img" alt="" />
                </div>
                <p class="scratch-card__modal-copy">Your discount is</p>
                <p class="scratch-card__modal-value">${escapeHtml(String(discount))}% OFF</p>
                <button class="primary-button secondary scratch-card__continue button-continue" id="scratchCardContinue" type="button">
                  Continue
                </button>
                <hr class="scratch-card__modal-rule" />
                <p class="scratch-card__modal-note">Your promo code will be applied automatically at the next step.</p>
              </div>
            </div>
          `
          : ""
      }
    </div>
  `;

  setupScratchCanvas();

  if (showPopup) {
    document.getElementById("scratchCardContinue").addEventListener("click", () => {
      if (!state.offer.startedAt) {
        state.offer.startedAt = Date.now();
      }
      state.stepIndex += 1;
      render();
    });

    setTimeout(fireScratchConfetti, 80);
  }
}

function renderOutroStep(index) {
  const step = outroSteps[index];

  if (step.type === "expert") {
    renderExpertStep();
    return;
  }

  if (step.type === "socialproof") {
    renderSocialProofStep(step);
    return;
  }

  if (step.type === "community") {
    renderCommunityStep(step);
    return;
  }

  if (step.type === "email") {
    renderEmailStep();
    return;
  }

  if (step.type === "summary") {
    renderSummaryStep();
    return;
  }

  if (step.type === "growthProjection") {
    renderGrowthProjectionStep();
    return;
  }

  if (step.type === "planBuilder") {
    renderPlanBuilderStep();
    return;
  }

  if (step.type === "safetyChart") {
    renderSafetyChartStep();
    return;
  }

  if (step.type === "scratchCard") {
    renderScratchCardStep();
    return;
  }

  if (step.type === "offer") {
    renderOfferStep();
    return;
  }

  renderNameStep();
}

function updateChrome() {
  const isQuestionFlow =
    state.stepIndex >= introSteps.length &&
    state.stepIndex < introSteps.length + questions.length;
  const isPostQuizFlow =
    state.stepIndex >= introSteps.length + questions.length &&
    state.stepIndex < introSteps.length + questions.length + outroSteps.length;
  const isIntroFlow = state.stepIndex < introSteps.length;
  const isOfferFlow = isOfferStepActive();
  const currentQuestionIndex = state.stepIndex - introSteps.length;
  const currentQuestion =
    currentQuestionIndex >= 0 && currentQuestionIndex < questions.length ? questions[currentQuestionIndex] : null;
  const isEvidenceScreen = currentQuestion?.type === "evidence";
  const showQuestionCounter = isQuestionFlow && currentQuestion?.type !== "evidence";
  const showProgress = isQuestionFlow && currentQuestion?.type !== "evidence";

  progressWrap.classList.toggle("is-hidden", !showProgress);
  topBar.classList.remove("is-hidden");
  pageShell.classList.remove("page-shell--no-header");
  headerOfferUtility.hidden = true;
  headerOfferUtility.setAttribute("hidden", "");
  topBar.classList.toggle("top-bar--intro", isIntroFlow);
  topBar.classList.toggle("top-bar--quiz", isQuestionFlow);
  topBar.classList.toggle("top-bar--post", isPostQuizFlow);
  topBar.classList.toggle("top-bar--offer", isOfferFlow);
  topBar.classList.toggle("top-bar--offer-expired", isOfferFlow && state.offer.expired);
  document.body.classList.toggle("is-quiz-flow", isQuestionFlow);
  document.body.classList.toggle("is-evidence-screen", isEvidenceScreen);
  document.body.classList.toggle("is-offer-flow", isOfferFlow);
  document.body.classList.toggle("is-offer-expired", isOfferFlow && state.offer.expired);
  backButton.hidden = isOfferFlow || !(isQuestionFlow || isPostQuizFlow);
  backButton.disabled = state.stepIndex <= 0;
  headerStepCount.hidden = !showQuestionCounter;

  if (isOfferFlow) {
    headerStepCount.hidden = true;
    headerOfferUtility.hidden = false;
    headerOfferUtility.removeAttribute("hidden");
  }
}

function render() {
  clearPlanBuilderTimers();
  clearOfferTimer();
  window.scrollTo(0, 0);
  updateChrome();
  updateProgress();

  if (state.stepIndex < introSteps.length) {
    const step = introSteps[state.stepIndex];
    if (step.type === "gender") {
      renderGenderStep(step);
      return;
    }

    if (step.type === "choice") {
      renderChoiceStep(step);
      return;
    }

    if (step.type === "socialproof") {
      renderSocialProofStep(step);
      return;
    }

    renderWelcomeStep(step);
    return;
  }

  const questionIndex = state.stepIndex - introSteps.length;
  if (questionIndex < questions.length) {
    renderQuestionStep(questionIndex);
    return;
  }

  renderOutroStep(questionIndex - questions.length);

  if (isOfferStepActive()) {
    startOfferTimer();
  }
}

function resetQuiz() {
  clearPlanBuilderTimers();
  clearOfferTimer();
  state.stepIndex = 0;
  state.answers.gender = null;
  state.answers.age = null;
  state.contact.email = "";
  state.contact.firstName = "";
  state.formErrors.email = "";
  state.formErrors.firstName = "";
  state.questionScores = Array(questions.length).fill(null);
  state.multiAnswers = {};
  state.multiInputs = {};
  state.planBuilder.stage = "goalsLoading";
  state.planBuilder.popupIndex = null;
  state.chartReadyStage = 0;
  state.scratchCard.revealed = false;
  state.scratchCard.popupOpen = false;
  state.offer.startedAt = null;
  state.offer.expired = false;
  state.offer.selectedPlan = "core";
  render();
}

backButton.addEventListener("click", () => {
  if (state.stepIndex > 0) {
    state.stepIndex -= 1;
    render();
  }
});
logoLink.addEventListener("click", (event) => {
  event.preventDefault();
  resetQuiz();
});

headerOfferButton.addEventListener("click", () => {
  if (!isOfferStepActive()) return;
  const target = document.getElementById("offerPlanBottom");
  if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
});

// DEV: jump to a screen via ?dev=<type>  e.g. ?dev=expert
// For offer, add ?dev=offer&expired=true to preview the post-timer version.
// Theme: add ?theme=orange for Version A, ?theme=blue (or omit) for Version B.
(function () {
  const params = new URLSearchParams(location.search);
  const theme = getOfferThemeOverride();
  if (theme) applyOfferTheme(theme);
  const target = params.get("dev");
  if (!target) return;

  // Stub quiz answers so dynamic screens render with real-looking data
  if (!state.answers.gender) state.answers.gender = params.get("gender") || "woman";
  if (!state.answers.age) state.answers.age = "25-34";
  if (!state.contact.firstName) state.contact.firstName = params.get("name") || "Alex";

  if (target === "offer") {
    state.stepIndex = totalSteps - 1;
    state.offer.expired = ["1", "true", "yes"].includes((params.get("expired") || "").toLowerCase());
    state.offer.startedAt = state.offer.expired ? Date.now() - (9 * 60 * 1000) : null;
    return;
  }

  // Stub scores when previewing the summary screen so the correct level renders
  if (target === "summary") {
    const level = params.get("level") || "high";
    const scorePerQ = level === "high" ? 4 : level === "medium" ? 2 : 1;
    state.questionScores = questions.map((q) => isCountedQuestion(q) ? scorePerQ : null);
  }
  const introIdx = introSteps.findIndex((s) => s.type === target || s.id === target);
  if (introIdx !== -1) { state.stepIndex = introIdx; return; }
  const outroIdx = outroSteps.findIndex((s) => s.type === target);
  if (outroIdx !== -1) { state.stepIndex = introSteps.length + questions.length + outroIdx; return; }
  const evidenceIdx = questions.findIndex((q) => q.type === "evidence");
  if (target === "evidence" && evidenceIdx !== -1) {
    state.stepIndex = introSteps.length + evidenceIdx;
    return;
  }
  const qNum = parseInt(target, 10);
  if (!isNaN(qNum) && qNum >= 1) {
    let counted = 0;
    for (let i = 0; i < questions.length; i++) {
      if (isCountedQuestion(questions[i])) counted++;
      if (counted === qNum) { state.stepIndex = introSteps.length + i; break; }
    }
  }
})();

render();
