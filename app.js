(function () {
  "use strict";

  // ---------- Data ----------
  const PLAYERS = window.PLAYERS || [];
  const BY_ID = new Map(PLAYERS.map((p) => [p.id, p]));
  const MAX_GUESSES = 10;
  const HINT_AT = { 1: 4, 2: 7 };
  const PHOTO_AT = 4;
  const RECENT_LIMIT = 80;

  const CLUBS = [
    { nameHe: "מכבי תל אביב", short: 'מכבי ת"א', prominence: 1.5, crest: "crests/566.png", color: "#FFE500" },
    { nameHe: "מכבי חיפה", short: "מכבי חיפה", prominence: 1.5, crest: "crests/562.png", color: "#1F9F3F" },
    { nameHe: "הפועל באר שבע", short: 'הפועל ב"ש', prominence: 1.3, crest: "crests/579.png", color: "#E2231A" },
    { nameHe: 'בית"ר ירושלים', short: 'בית"ר י-ם', prominence: 1.3, crest: "crests/559.png", color: "#FFD400", alias: "ביתר ירושלים" },
    { nameHe: "הפועל תל אביב", short: 'הפועל ת"א', prominence: 1.2, crest: "crests/567.png", color: "#E2231A" },
    { nameHe: "הפועל חיפה", short: "הפועל חיפה", prominence: 1, crest: "crests/575.png", color: "#E2231A" },
    { nameHe: "מכבי נתניה", short: "מכבי נתניה", prominence: 1, crest: "crests/560.png", color: "#FFD400" },
    { nameHe: "בני סכנין", short: "בני סכנין", prominence: 1, crest: "crests/561.png", color: "#1F9F3F" },
    { nameHe: "הפועל עירוני קריית שמונה", short: "קריית שמונה", prominence: 0.9, crest: "crests/563.png", color: "#1F9F3F" },
    { nameHe: "הפועל ירושלים", short: "הפועל י-ם", prominence: 0.9, crest: "crests/614.png", color: "#E2231A" },
    { nameHe: "הפועל פתח תקווה", short: 'הפועל פ"ת', prominence: 0.85, crest: "crests/571.png", color: "#1F5BAA" },
    { nameHe: "הפועל רמת גן", short: "הפועל ר״ג", prominence: 0.8, crest: "crests/574.png", color: "#E2231A" },
    { nameHe: "מכבי פתח תקווה", short: "מכבי פ״ת", prominence: 0.85, crest: "crests/564.png", color: "#1F5BAA" },
    { nameHe: "עירוני טבריה", short: "טבריה", prominence: 0.8, crest: "crests/606.png", color: "#1F5BAA" },
  ];
  const club = (name) => CLUBS.find((c) => c.nameHe === name || c.short === name || c.alias === name);
  const clubShort = (name) => (club(name) ? club(name).short : name.replace(/^(הפועל |מכבי )/, ""));

  // ---------- Storage ----------
  const K_GAME = "sardle-game";
  const K_STATS = "sardle-stats";
  const K_RECENT = "sardle-recent";
  const K_CB = "sardle-colorblind-mode";
  const load = (k, d) => {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : d;
    } catch (e) {
      return d;
    }
  };
  const save = (k, v) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch (e) {}
  };
  const EMPTY_STATS = { played: 0, won: 0, currentStreak: 0, bestStreak: 0, lastResult: null, lastGame: null, distribution: Array(10).fill(0) };

  let stats = { ...EMPTY_STATS, ...load(K_STATS, {}) };
  if (!Array.isArray(stats.distribution) || stats.distribution.length !== 10) stats.distribution = Array(10).fill(0);
  let colorblind = load(K_CB, false) === 1 || load(K_CB, false) === true;
  let game = load(K_GAME, null);
  if (!game || !BY_ID.has(game.secretId)) game = newGame(game ? game.no : 0);

  function pickSecret() {
    const recent = new Set(load(K_RECENT, []));
    const eligible = PLAYERS.filter((p) => p.age != null);
    let pool = eligible.filter((p) => !recent.has(p.id));
    if (pool.length < 10) pool = eligible.length ? eligible : PLAYERS;
    const w = pool.map((p) => {
      const c = club(p.club);
      return c ? c.prominence : 0.8;
    });
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) {
      r -= w[i];
      if (r <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  function newGame(prevNo) {
    const secret = pickSecret();
    const recent = load(K_RECENT, []);
    recent.push(secret.id);
    save(K_RECENT, recent.slice(-RECENT_LIMIT));
    const g = { no: (prevNo || 0) + 1, secretId: secret.id, guesses: [], hints: 0, photoRevealed: false, over: false, won: false, recorded: false };
    save(K_GAME, g);
    return g;
  }

  // ---------- Game logic ----------
  function compare(guessId) {
    const g = BY_ID.get(guessId);
    const s = BY_ID.get(game.secretId);
    const clubStatus = g.club === s.club ? "correct" : "absent";
    const posStatus = g.position === s.position ? "correct" : g.group && g.group === s.group ? "present" : "absent";
    let ageStatus = "absent";
    let ageHint = null;
    if (g.age != null && s.age != null) {
      const d = s.age - g.age;
      ageStatus = d === 0 ? "correct" : Math.abs(d) <= 2 ? "present" : "absent";
      ageHint = d === 0 ? "match" : d > 0 ? "older" : "younger";
    }
    return { player: g, isCorrect: g.id === s.id, club: clubStatus, position: posStatus, age: ageStatus, ageHint };
  }

  function clues() {
    const s = BY_ID.get(game.secretId);
    const parts = s.name.split(/\s+/).filter(Boolean);
    const c1 = { label: "אות ראשונה", value: parts[0][0] };
    const c2 =
      parts.length > 1
        ? { label: "אות ראשונה בשם המשפחה", value: parts[parts.length - 1][0] }
        : { label: "אורך השם", value: s.name.replace(/[^א-ת]/g, "").length + " אותיות" };
    return { c1: game.hints >= 1 ? c1 : null, c2: game.hints >= 2 ? c2 : null };
  }

  function recordResult() {
    if (game.recorded) return;
    game.recorded = true;
    const n = game.guesses.length;
    stats.played++;
    stats.lastResult = game.won ? "win" : "loss";
    stats.lastGame = game.no;
    if (game.won) {
      stats.won++;
      stats.currentStreak++;
      stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
      if (n >= 1 && n <= 10) stats.distribution[n - 1]++;
    } else {
      stats.currentStreak = 0;
    }
    save(K_STATS, stats);
    save(K_GAME, game);
  }

  function makeGuess(id) {
    if (game.over) return;
    if (game.guesses.includes(id)) return setMsg("כבר ניחשתם שחקן זה");
    setMsg(null);
    game.guesses.push(id);
    const r = compare(id);
    if (r.isCorrect) {
      game.over = true;
      game.won = true;
    } else if (game.guesses.length >= MAX_GUESSES) {
      game.over = true;
    }
    if (game.over) recordResult();
    save(K_GAME, game);
    renderAll(true);
    if (game.over) setTimeout(() => openModal("result"), 700);
  }

  function startNewGame() {
    if (!game.over && game.guesses.length > 0) {
      if (!confirm("לוותר על המשחק הנוכחי? זה ייחשב כהפסד.")) return;
      recordResult();
    }
    game = newGame(game.no);
    closeModal();
    setMsg(null);
    renderAll(false);
    const input = document.getElementById("search-input");
    if (input) input.focus();
  }

  // ---------- Helpers ----------
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const PALETTE = {
    correct: { rgb: [83, 141, 78], to: [59, 104, 56] },
    present: { rgb: [181, 159, 59], to: [136, 117, 37] },
  };
  const PALETTE_CB = {
    correct: { rgb: [37, 99, 235], to: [30, 64, 175] },
    present: { rgb: [194, 65, 12], to: [124, 45, 18] },
  };
  const MARK = { correct: "✓", present: "≈", absent: "✕" };
  const rgba = ([r, g, b], a) => `rgba(${r}, ${g}, ${b}, ${a})`;
  const pal = () => (colorblind ? PALETTE_CB : PALETTE);

  const ICON = {
    logo: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"></circle><path d="M12 7l-3 2 .7 4h4.6l.7-4-3-2z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"></path><path d="M9 9L6 7M15 9l3-2M9 13l-2 3M15 13l2 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"></path>',
    trophy: '<path d="M7 4h10v4a5 5 0 11-10 0V4z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"></path><path d="M5 6H3a3 3 0 003 3M19 6h2a3 3 0 01-3 3M9 21h6M12 14v5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>',
    info: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"></circle><path d="M12 11v5M12 8v.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>',
    search: '<circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8"></circle><path d="M20 20l-3.5-3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>',
    close: '<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>',
    bulb: '<path d="M9 18h6M10 21h4M8 14a5 5 0 116.9 4.6c-.6.4-.9 1-.9 1.4H10c0-.4-.3-1-.9-1.4A5 5 0 018 14z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path><path d="M12 6V4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>',
    share: '<path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path><path d="M12 3v13M8 7l4-4 4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path>',
    bars: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>',
    up: '<path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>',
    down: '<path d="M12 5v14M5 12l7 7 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>',
    refresh: '<path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>',
    GK: '<path d="M12 2L3 6v6c0 5 3.8 9.4 9 10 5.2-.6 9-5 9-10V6l-9-4z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"></path><path d="M8 11l2 2 6-6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path>',
    DEF: '<path d="M12 2L4 5v7c0 5 3.5 8.7 8 10 4.5-1.3 8-5 8-10V5l-8-3z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"></path><path d="M12 7v9M9 10l6 5M15 10l-6 5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"></path>',
    MID: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"></circle><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4" stroke="currentColor" stroke-width="1.2"></path>',
    FWD: '<path d="M5 4l5 6 4-3 6 6-3 7-7 1-6-6 1-7z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"></path><circle cx="15" cy="11" r="1.4" fill="currentColor"></circle>',
  };
  const svg = (name, cls) => `<svg viewBox="0 0 24 24" fill="none" class="${cls}" aria-hidden="true">${ICON[name] || ""}</svg>`;

  // ---------- Rendering ----------
  const app = document.getElementById("app");
  let message = null;

  function renderShell() {
    app.innerHTML = `
      <header class="mb-7 animate-fade-in">
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent via-accent to-accent-2 shadow-[0_4px_20px_-4px_rgba(91,141,239,0.7)]">
              ${svg("logo", "h-6 w-6 text-white drop-shadow")}
              <span aria-hidden="true" class="absolute inset-x-1 top-1 h-[40%] rounded-t-xl bg-gradient-to-b from-white/25 to-transparent"></span>
            </div>
            <div>
              <h1 class="text-[2.2rem] font-black leading-none tracking-tight text-gradient" dir="ltr">Sardle</h1>
              <span class="chip mt-1">ללא הגבלה ∞</span>
            </div>
          </div>
          <div class="flex items-center gap-2 pt-0.5">
            <button type="button" id="btn-stats" class="group relative flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-text-dim transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-text" title="הצג סטטיסטיקה"></button>
            <button type="button" id="btn-new-top" class="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-text-dim transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-text" aria-label="משחק חדש" title="משחק חדש">${svg("refresh", "h-4 w-4")}</button>
            <button type="button" id="btn-help" class="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-text-dim transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-text" aria-label="איך משחקים?" title="איך משחקים?">${svg("info", "h-4 w-4")}</button>
          </div>
        </div>
        <p class="mt-3 text-sm text-text-dim">נחשו את שחקן ליגת העל — כמה משחקים שבא לכם</p>
        <div id="status"></div>
        <div id="photo"></div>
      </header>
      <div class="sticky top-0 z-20 -mx-4 mb-4 border-b border-white/[0.06] bg-surface/85 px-4 pb-3 pt-2 backdrop-blur-md">
        <div class="flex items-start gap-2">
          <div id="search" class="relative w-full max-w-md">
            <div id="search-box" class="relative flex items-center rounded-2xl border bg-white/[0.04] backdrop-blur transition-all border-white/10 hover:border-white/20">
              ${svg("search", "absolute right-4 h-5 w-5 text-muted")}
              <input id="search-input" type="text" autocomplete="off" dir="rtl" placeholder="הקלידו שם שחקן או מועדון..." class="w-full rounded-2xl bg-transparent px-12 py-3.5 text-base outline-none ring-0 placeholder:text-muted/70 disabled:cursor-not-allowed disabled:opacity-60" />
              <button type="button" id="search-clear" class="absolute left-3 grid h-7 w-7 place-items-center rounded-full text-muted hover:bg-white/10 hover:text-white" aria-label="נקה" style="display:none">✕</button>
            </div>
            <div id="dropdown"></div>
          </div>
          <div id="hint-btn"></div>
        </div>
        <div id="clues"></div>
        <div id="msg"></div>
      </div>
      <div class="mb-2.5 grid grid-cols-4 gap-1.5 sm:gap-2">
        ${["שחקן", "מועדון", "עמדה", "גיל"].map((h) => `<div class="col-header">${h}</div>`).join("")}
      </div>
      <div id="rows" class="flex flex-col gap-2"></div>
      <div id="progress"></div>
      <div id="actions" class="mt-6 flex flex-col items-center gap-3"></div>
      <section class="glass mt-8 rounded-2xl px-4 py-5 text-sm leading-relaxed text-text-dim">
        <h2 class="text-base font-bold text-text">מה זה Sardle?</h2>
        <p class="mt-2">Sardle הוא משחק לחובבי כדורגל ישראלי, בהשראת וורדל, שבו אפשר לשחק כמה משחקים שרוצים ביום. בכל משחק נבחר שחקן מסתורי אקראי מסגלי <b class="text-text">ליגת העל</b>. בכל ניחוש המשחק מראה אם המועדון, העמדה והגיל תואמים, קרובים או לא קשורים לשחקן הסודי.</p>
        <h2 class="mt-4 text-base font-bold text-text">איך משחקים?</h2>
        <p class="mt-2">הקלידו שם של שחקן מליגת העל בתיבת החיפוש ובחרו אותו כניחוש. כשהמשחק נגמר (או בכל רגע) לחצו על ״משחק חדש״ כדי לקבל שחקן חדש.</p>
      </section>
      <footer class="mt-auto pt-8">
        <div class="glass rounded-2xl px-4 py-3.5">
          <p class="mb-2.5 text-center text-xs font-bold uppercase tracking-widest text-muted">מקרא</p>
          <div id="legend" class="flex flex-wrap items-center justify-center gap-4"></div>
          <p class="mt-3 text-center text-[11px] text-muted/70">${PLAYERS.length} שחקנים מסגלי ליגת העל עונת 2026-27</p>
        </div>
      </footer>`;

    document.getElementById("btn-stats").onclick = () => openModal("stats");
    document.getElementById("btn-help").onclick = () => openModal("help");
    document.getElementById("btn-new-top").onclick = startNewGame;
    setupSearch();
  }

  function renderAll(animateLast) {
    renderStatsButton();
    renderStatus();
    renderPhoto();
    renderHintButton();
    renderClues();
    renderMsg();
    renderRows(animateLast);
    renderProgress();
    renderActions();
    renderLegend();
    const input = document.getElementById("search-input");
    input.disabled = game.over;
    input.placeholder = game.over ? "לחצו על ״משחק חדש״ כדי להמשיך" : "הקלידו שם שחקן או מועדון...";
  }

  function renderStatsButton() {
    document.getElementById("btn-stats").innerHTML =
      svg("trophy", "h-4 w-4 text-accent-warm") +
      (stats.currentStreak > 0 ? `<span class="text-gradient-warm font-bold">${stats.currentStreak}</span>` : "");
  }

  function renderStatus() {
    const left = MAX_GUESSES - game.guesses.length;
    const txt = game.over ? (game.won ? "פתרתם! 🎉" : "נגמר המשחק") : `נותרו ${left} ניחושים`;
    document.getElementById("status").innerHTML = `
      <div class="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.035] px-4 py-2.5 text-xs">
        <div class="flex items-center gap-2 text-text-dim">
          <span class="inline-block h-1.5 w-1.5 rounded-full ${game.over ? "bg-muted" : "bg-success shadow-[0_0_8px_rgba(34,197,94,0.8)]"}"></span>
          <span>${txt}</span>
        </div>
        <span class="font-mono text-muted">משחק #${game.no}</span>
      </div>`;
  }

  function renderPhoto() {
    const el = document.getElementById("photo");
    const s = BY_ID.get(game.secretId);
    if (game.over || !s.photo) return void (el.innerHTML = "");
    if (!game.photoRevealed) {
      const unlockable = game.guesses.length >= PHOTO_AT;
      el.innerHTML = `<button type="button" id="btn-photo" ${unlockable ? "" : "disabled"} class="btn-ghost mt-4 w-full justify-center text-sm disabled:opacity-40">${unlockable ? "הצג תמונה מטושטשת" : `תמונה מטושטשת נפתחת אחרי ${PHOTO_AT} ניחושים`}</button>`;
      document.getElementById("btn-photo").onclick = () => {
        game.photoRevealed = true;
        save(K_GAME, game);
        renderPhoto();
      };
      return;
    }
    const n = game.guesses.length;
    const res = Math.min(40, 5 + Math.max(0, n - PHOTO_AT) * 3);
    el.innerHTML = `
      <div class="mt-4 flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.035] px-4 py-3">
        <canvas id="pixel" width="${res}" height="${res}" aria-hidden="true" class="h-16 w-16 shrink-0 rounded-xl object-cover ring-1 ring-white/15" style="image-rendering:pixelated"></canvas>
        <div class="text-xs leading-relaxed text-text-dim">
          <p class="font-semibold text-text">השחקן המסתורי</p>
          <p class="mt-0.5">התמונה מתחדדת ככל שמנחשים יותר</p>
        </div>
      </div>`;
    const img = new Image();
    img.onload = () => {
      const cv = document.getElementById("pixel");
      if (!cv) return;
      const ctx = cv.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      const side = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, res, res);
    };
    img.onerror = () => (el.innerHTML = "");
    img.src = s.photo;
  }

  function renderHintButton() {
    const r = game.hints >= 2 ? null : game.hints + 1;
    let note = null;
    let enabled = false;
    if (r === null) note = "כל הרמזים נחשפו";
    else {
      enabled = game.guesses.length >= HINT_AT[r] && !game.over;
      note = game.guesses.length >= HINT_AT[r] ? null : `נפתח אחרי ${HINT_AT[r]} ניחושים`;
    }
    const el = document.getElementById("hint-btn");
    el.innerHTML = `
      <button type="button" ${enabled ? "" : "disabled"} aria-label="${note ? "רמז — " + note : "רמז"}" class="btn-ghost shrink-0 flex-col !gap-0 py-1.5 text-sm leading-tight ${note ? "!px-3" : ""} ${enabled ? "" : "cursor-not-allowed opacity-40"}">
        <span class="flex items-center gap-1.5">${svg("bulb", "h-4 w-4")}רמז</span>
        ${note ? `<span class="max-w-[7.5rem] text-[10px] font-medium opacity-80">${note}</span>` : ""}
      </button>`;
    el.firstElementChild.onclick = () => {
      if (!enabled) return;
      game.hints = r;
      save(K_GAME, game);
      renderHintButton();
      renderClues();
    };
  }

  function renderClues() {
    const { c1, c2 } = clues();
    document.getElementById("clues").innerHTML =
      c1 || c2
        ? `<div class="mt-2 flex flex-wrap items-center justify-center gap-2">${[c1, c2]
            .filter(Boolean)
            .map((c) => `<span class="chip">${esc(c.label)}: ${esc(c.value)}</span>`)
            .join("")}</div>`
        : "";
  }

  function setMsg(m) {
    message = m;
    renderMsg();
  }
  function renderMsg() {
    document.getElementById("msg").innerHTML = message
      ? `<p class="animate-slide-down mt-2 text-center text-sm font-medium text-accent-warm">${esc(message)}</p>`
      : "";
  }

  function tile({ label, status, sub, group, ageHint, crest, photo, delay, animate }) {
    const p = status !== "absent" ? pal()[status] : null;
    const style = p
      ? `background-image:linear-gradient(to bottom right, ${rgba(p.rgb, 1)}, ${rgba(p.rgb, 1)}, ${rgba(p.to, 1)});border-color:${rgba(p.rgb, 0.25)};box-shadow:0 4px 24px -6px ${rgba(p.rgb, 0.7)}, inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -1px 0 rgba(0,0,0,0.15);`
      : "";
    return `
      <div style="animation-delay:${delay}ms;${style}" class="relative flex min-h-[70px] flex-col items-center justify-center overflow-hidden rounded-xl border px-2 py-2 text-center ${animate ? "animate-flip" : ""} ${p ? "text-white" : "bg-gradient-to-br from-white/[0.055] to-white/[0.02] border-white/[0.07] text-white/65 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"}">
        ${colorblind ? `<span aria-hidden="true" class="absolute left-1.5 top-1.5 z-10 grid h-[18px] w-[18px] place-items-center rounded-full text-[10px] font-bold leading-none ${p ? "bg-black/25" : "bg-white/10"}">${MARK[status]}</span>` : ""}
        ${status !== "absent" ? '<span aria-hidden="true" class="pointer-events-none absolute inset-x-0 top-0 h-[40%] rounded-t-xl bg-gradient-to-b from-white/[0.1] to-transparent"></span>' : ""}
        ${photo ? `<img src="${esc(photo)}" alt="" aria-hidden="true" class="relative z-10 mb-1 h-7 w-7 rounded-full object-cover ring-1 ring-white/25" onerror="this.remove()">` : ""}
        <span class="relative z-10 flex items-center gap-1 text-sm font-bold leading-tight tracking-wide">
          ${group ? svg(group, "h-3.5 w-3.5 opacity-85") : ""}
          ${ageHint === "older" ? svg("up", "h-3 w-3 opacity-90") : ""}
          ${ageHint === "younger" ? svg("down", "h-3 w-3 opacity-90") : ""}
          ${crest ? `<img src="${crest}" alt="" aria-hidden="true" class="h-4 w-4 shrink-0 object-contain drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">` : ""}
          <span>${esc(label)}</span>
        </span>
        ${sub ? `<span class="relative z-10 mt-0.5 text-[10px] font-medium opacity-70 tracking-wide">${sub}</span>` : ""}
      </div>`;
  }

  const AGE_SUB = { older: "↑ מבוגר יותר", younger: "↓ צעיר יותר", match: "🎯" };

  function renderRows(animateLast) {
    const rows = game.guesses.map((id, i) => {
      const r = compare(id);
      const p = r.player;
      const anim = animateLast && i === game.guesses.length - 1;
      const c = club(p.club);
      return `
        <div class="${anim ? "animate-row" : ""}">
          <div class="grid grid-cols-4 gap-1.5 sm:gap-2">
            ${tile({ label: p.name, status: r.isCorrect ? "correct" : "absent", photo: p.photo, delay: 0, animate: anim })}
            ${tile({ label: clubShort(p.club), status: r.club, crest: c && c.crest, delay: 100, animate: anim })}
            ${tile({ label: p.position, status: r.position, group: p.group, delay: 200, animate: anim })}
            ${tile({ label: p.age != null ? String(p.age) : "?", status: r.age, sub: r.ageHint ? AGE_SUB[r.ageHint] : "", ageHint: r.ageHint, delay: 300, animate: anim })}
          </div>
        </div>`;
    });
    const empty = Array.from({ length: Math.max(0, MAX_GUESSES - game.guesses.length) }, (_, t) =>
      `<div class="grid grid-cols-4 gap-1.5 sm:gap-2">${Array.from({ length: 4 }, () =>
        `<div class="flex min-h-[70px] items-center justify-center rounded-xl border border-white/[0.055] bg-white/[0.012]">${t === 0 && !game.over ? '<span class="h-1 w-1 rounded-full bg-white/10"></span>' : ""}</div>`
      ).join("")}</div>`
    );
    document.getElementById("rows").innerHTML = rows.join("") + empty.join("");
  }

  function renderProgress() {
    const el = document.getElementById("progress");
    const n = game.guesses.length;
    el.innerHTML =
      !game.over && n > 0
        ? `<div class="mt-3 h-1 w-full overflow-hidden rounded-full bg-white/[0.05]"><div class="h-full rounded-full bg-gradient-to-l from-accent to-accent-2 transition-[width] duration-700 ease-out shadow-[0_0_8px_rgba(91,141,239,0.5)]" style="width:${(n / MAX_GUESSES) * 100}%"></div></div>`
        : "";
  }

  function renderActions() {
    const n = game.guesses.length;
    const el = document.getElementById("actions");
    el.innerHTML = `
      ${n > 0 && !game.over ? `<p class="text-center text-xs text-muted">ניחושים: <span class="font-semibold text-text-dim">${n}</span><span class="text-white/20"> / </span>${MAX_GUESSES}</p>` : ""}
      ${game.over ? `<button type="button" id="btn-new" class="btn-primary">${svg("refresh", "h-4 w-4")}משחק חדש</button>` : ""}
      ${n > 0 ? `<div class="flex flex-wrap items-center justify-center gap-2">
        <button type="button" id="btn-share" class="btn-ghost text-sm">${svg("share", "h-4 w-4")}שיתוף תוצאה</button>
        ${game.over ? '<button type="button" id="btn-answer" class="btn-ghost text-sm">צפו בתשובה</button>' : ""}
      </div>` : ""}`;
    const b = (id, fn) => {
      const e = document.getElementById(id);
      if (e) e.onclick = fn;
    };
    b("btn-new", startNewGame);
    b("btn-answer", () => openModal("result"));
    b("btn-share", async () => {
      const r = await share();
      setMsg(r === "copied" ? "הועתק ללוח!" : r === "unavailable" ? "שיתוף לא זמין" : "שותף!");
    });
  }

  function legendDot(status) {
    const p = status !== "absent" ? pal()[status] : null;
    return `<span aria-hidden="true" class="grid h-3.5 w-3.5 place-items-center rounded-md text-[8px] font-bold leading-none text-white shadow-sm ${p ? "" : "bg-absent"}" ${p ? `style="background:rgb(${p.rgb.join(", ")})"` : ""}>${colorblind ? MARK[status] : ""}</span>`;
  }
  function renderLegend() {
    document.getElementById("legend").innerHTML = [
      ["correct", "התאמה מלאה"],
      ["present", "קרוב"],
      ["absent", "לא תואם"],
    ]
      .map(([s, l]) => `<span class="inline-flex items-center gap-2">${legendDot(s)}<span class="text-xs text-text-dim">${l}</span></span>`)
      .join("");
  }

  // ---------- Search ----------
  function setupSearch() {
    const input = document.getElementById("search-input");
    const clear = document.getElementById("search-clear");
    const box = document.getElementById("search-box");
    const dd = document.getElementById("dropdown");
    let results = [];
    let active = 0;
    let open = false;

    const norm = (s) => s.toLowerCase().replace(/[״"`'׳]/g, "").trim();

    function search(q) {
      const nq = norm(q);
      if (nq.length < 2) return [];
      const used = new Set(game.guesses);
      const nameHits = [];
      const clubHits = [];
      for (const p of PLAYERS) {
        if (used.has(p.id)) continue;
        const c = club(p.club);
        if (norm(p.name).includes(nq)) nameHits.push(p);
        else if (norm(p.club).includes(nq) || (c && (norm(c.short).includes(nq) || (c.alias && norm(c.alias).includes(nq))))) clubHits.push(p);
      }
      const byName = (a, b) => a.name.localeCompare(b.name, "he");
      const starts = (p) => (norm(p.name).startsWith(nq) || norm(p.name).includes(" " + nq) ? 0 : 1);
      nameHits.sort((a, b) => starts(a) - starts(b) || byName(a, b));
      clubHits.sort(byName);
      return nameHits.concat(clubHits).slice(0, 12);
    }

    function draw() {
      clear.style.display = input.value ? "" : "none";
      const show = open && results.length > 0;
      box.className =
        "relative flex items-center rounded-2xl border bg-white/[0.04] backdrop-blur transition-all " +
        (show ? "border-accent shadow-glow-accent" : "border-white/10 hover:border-white/20");
      if (show) {
        dd.innerHTML = `<ul class="absolute z-30 mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-white/[0.12] bg-surface-3 shadow-2xl animate-slide-down" role="listbox">${results
          .map((p, i) => {
            const c = club(p.club);
            const bg = c ? c.color + "26" : "rgba(255,255,255,0.08)";
            const border = c ? `1px solid ${c.color}55` : "1px solid rgba(255,255,255,0.08)";
            const avatar = p.photo
              ? `<img src="${esc(p.photo)}" alt="" aria-hidden="true" class="h-9 w-9 shrink-0 rounded-full object-cover" style="background:${bg};border:${border}">`
              : `<span aria-hidden="true" class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold" style="background:${bg};color:${c ? c.color : "#fff"};border:${border}">${esc((c ? c.short : p.club)[0] || "?")}</span>`;
            return `<li role="option" aria-selected="${i === active}"><button type="button" data-i="${i}" class="group flex w-full items-center gap-3 px-3 py-2.5 text-right transition-colors ${i === active ? "bg-white/10" : "hover:bg-white/5"}">
              ${avatar}
              <div class="min-w-0 flex-1"><p class="truncate font-semibold text-text">${esc(p.name)}</p><p class="truncate text-xs text-muted">${esc(clubShort(p.club))} · ${esc(p.position)}</p></div>
              <span aria-hidden="true" class="hidden h-1.5 w-1.5 rounded-full bg-muted/50 sm:block"></span>
            </button></li>`;
          })
          .join("")}</ul>`;
        dd.querySelectorAll("button[data-i]").forEach((btn) => {
          const i = +btn.dataset.i;
          btn.onmousedown = (e) => e.preventDefault();
          btn.onmouseenter = () => {
            if (active !== i) {
              active = i;
              highlight();
            }
          };
          btn.onclick = () => choose(results[i]);
        });
        const sel = dd.querySelector(`button[data-i="${active}"]`);
        if (sel) sel.scrollIntoView({ block: "nearest" });
      } else if (open && input.value.trim().length >= 2 && results.length === 0) {
        dd.innerHTML = `<div class="absolute z-30 mt-2 w-full rounded-2xl border border-white/[0.12] bg-surface-3 px-4 py-3 text-center text-sm text-muted shadow-2xl animate-slide-down">לא נמצאו שחקנים תואמים</div>`;
      } else dd.innerHTML = "";
    }

    function highlight() {
      dd.querySelectorAll("button[data-i]").forEach((btn) => {
        const on = +btn.dataset.i === active;
        btn.classList.toggle("bg-white/10", on);
        btn.classList.toggle("hover:bg-white/5", !on);
      });
    }

    function choose(p) {
      input.value = "";
      results = [];
      open = false;
      draw();
      makeGuess(p.id);
    }

    input.addEventListener("input", () => {
      results = search(input.value);
      active = 0;
      open = true;
      draw();
    });
    input.addEventListener("focus", () => {
      if (results.length) {
        open = true;
        draw();
      }
    });
    input.addEventListener("keydown", (e) => {
      if (!open || results.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        active = (active + 1) % results.length;
        draw();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        active = (active - 1 + results.length) % results.length;
        draw();
      } else if (e.key === "Enter") {
        e.preventDefault();
        choose(results[active]);
      } else if (e.key === "Escape") {
        open = false;
        draw();
      }
    });
    clear.onclick = () => {
      input.value = "";
      results = [];
      draw();
      input.focus();
    };
    document.addEventListener("mousedown", (e) => {
      if (!document.getElementById("search").contains(e.target)) {
        open = false;
        draw();
      }
    });
  }

  // ---------- Share ----------
  const emoji = (s) => (s === "correct" ? (colorblind ? "🟦" : "🟩") : s === "present" ? (colorblind ? "🟧" : "🟨") : "⬛");
  function verdict(won, n) {
    if (!won) return "לא פיצחתי הפעם 😅";
    if (n === 1) return "בול בניחוש הראשון! 🤯🔥";
    if (n <= 3) return `פיצחתי ב-${n} ניחושים! 🔥`;
    if (n <= 6) return `פיצחתי ב-${n} ניחושים 👏`;
    return `ברגע האחרון! ${n} ניחושים 😅`;
  }
  async function share() {
    const n = game.guesses.length;
    const lines = [`Sardle ⚽ משחק #${game.no}`, game.over ? verdict(game.won, n) : `${n}/${MAX_GUESSES} ניחושים עד כה`];
    if (stats.currentStreak > 1) lines.push(`רצף: ${stats.currentStreak} 🔥`);
    lines.push("");
    for (const id of game.guesses) {
      const r = compare(id);
      lines.push(emoji(r.club) + emoji(r.position) + emoji(r.age));
    }
    const text = lines.map((l) => (l ? "‏" + l : l)).join("\n");
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return "shared";
      }
    } catch (e) {
      if (e && e.name === "AbortError") return "shared";
    }
    try {
      await navigator.clipboard.writeText(text);
      return "copied";
    } catch (e) {
      return "unavailable";
    }
  }

  // ---------- Modals ----------
  const modalRoot = document.getElementById("modal-root");
  let modalKind = null;

  function onKey(e) {
    if (e.key === "Escape") closeModal();
  }
  function closeModal() {
    modalKind = null;
    modalRoot.innerHTML = "";
    document.getElementById("confetti-root").innerHTML = "";
    document.body.style.overflow = "";
    document.removeEventListener("keydown", onKey);
  }
  function openModal(kind) {
    modalKind = kind;
    const [title, body] =
      kind === "stats" ? ["הסטטיסטיקה שלי", statsBody()] : kind === "help" ? ["איך משחקים?", helpBody()] : [game.won ? "ניצחון! 🎉" : "נגמרו הניחושים", resultBody()];
    modalRoot.innerHTML = `
      <div class="fixed inset-0 z-50 flex items-end justify-center px-4 pb-4 sm:items-center sm:p-6 animate-fade-in" role="dialog" aria-modal="true" id="modal-bg">
        <div aria-hidden="true" class="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
        <div class="glass-strong animate-scale-in relative z-10 w-full max-w-md overflow-hidden rounded-3xl shadow-lg" id="modal-card">
          <div class="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <h2 class="text-lg font-bold text-text">${title}</h2>
            <button type="button" id="modal-close" class="grid h-8 w-8 place-items-center rounded-full text-muted transition-colors hover:bg-white/10 hover:text-text" aria-label="סגור">${svg("close", "h-4 w-4")}</button>
          </div>
          <div class="max-h-[70dvh] overflow-y-auto px-5 py-5">${body}</div>
        </div>
      </div>`;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    document.getElementById("modal-bg").onclick = closeModal;
    document.getElementById("modal-card").onclick = (e) => e.stopPropagation();
    document.getElementById("modal-close").onclick = closeModal;

    if (kind === "help") {
      document.getElementById("cb-toggle").onclick = () => {
        colorblind = !colorblind;
        save(K_CB, colorblind);
        renderAll(false);
        openModal("help");
      };
    }
    if (kind === "result") {
      document.getElementById("modal-new").onclick = startNewGame;
      const sb = document.getElementById("modal-share");
      sb.onclick = async () => {
        const r = await share();
        sb.lastChild.textContent = r === "copied" ? "הועתק ללוח! ✓" : r === "unavailable" ? "שיתוף לא זמין" : "שותף! 🎉";
        setTimeout(() => (sb.lastChild.textContent = "שתפו את התוצאה"), 2500);
      };
      if (game.won) confetti();
    }
  }

  function statCard(label, value, hl) {
    return `<div class="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-center"><div class="text-xl font-extrabold ${hl ? "text-gradient-warm" : "text-text"}">${value}</div><div class="mt-0.5 text-[10px] text-muted">${label}</div></div>`;
  }
  function statsBody() {
    const total = stats.distribution.reduce((a, b) => a + b, 0);
    const max = Math.max(1, ...stats.distribution);
    return `<div class="space-y-5">
      <div class="grid grid-cols-4 gap-2">
        ${statCard("שיחקו", stats.played)}
        ${statCard("אחוז זכייה", (stats.played ? Math.round((stats.won / stats.played) * 100) : 0) + "%")}
        ${statCard("רצף נוכחי", stats.currentStreak, true)}
        ${statCard("שיא רצף", stats.bestStreak)}
      </div>
      <div>
        <div class="mb-2 flex items-center gap-2 text-sm font-semibold text-text-dim">${svg("bars", "h-4 w-4")}<span>התפלגות ניחושים</span></div>
        <div class="space-y-1.5">${stats.distribution
          .map((v, i) => {
            const pct = total ? (v / total) * 100 : 0;
            const w = (v / max) * 100;
            return `<div class="flex items-center gap-2 text-xs">
              <span class="w-4 shrink-0 text-right text-muted">${i + 1}</span>
              <div class="relative h-6 flex-1 overflow-hidden rounded-md bg-white/[0.04]">
                <div class="h-full rounded-md transition-[width] duration-700 ease-out ${v > 0 ? "bg-gradient-to-l from-correct to-emerald-600" : "bg-white/5"}" style="width:${Math.max(w, v > 0 ? 6 : 0)}%"></div>
                ${v > 0 ? `<span class="absolute inset-y-0 left-2 flex items-center text-[10px] font-bold text-white">${v}</span>` : ""}
              </div>
              <span class="w-10 shrink-0 text-left text-[10px] text-muted">${Math.round(pct)}%</span>
            </div>`;
          })
          .join("")}</div>
      </div>
      ${stats.lastResult ? `<p class="text-center text-xs text-muted">משחק אחרון: ${stats.lastResult === "win" ? '<span class="font-semibold text-correct">ניצחון</span>' : '<span class="font-semibold text-danger">הפסד</span>'} · #${stats.lastGame}</p>` : ""}
    </div>`;
  }

  function helpRow(status, label, desc) {
    const p = status !== "absent" ? pal()[status] : null;
    return `<li class="flex items-start gap-3">
      <span class="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded ${p ? "" : "bg-absent"}" ${p ? `style="background:rgb(${p.rgb.join(", ")})"` : ""}>${label ? `<span class="text-[10px] font-bold text-white">${label[0]}</span>` : ""}</span>
      <p>${label ? `<span class="font-semibold text-text">${label} — </span>` : ""}${desc}</p>
    </li>`;
  }
  function helpBody() {
    return `<div class="space-y-4 text-sm text-text-dim">
      <div class="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
        <div><p class="font-semibold text-text">מצב נגיש לעיוורי צבעים</p><p class="mt-0.5 text-xs">פלטת כחול/כתום בניגודיות גבוהה + סימון על כל אריח</p></div>
        <button type="button" id="cb-toggle" role="switch" aria-checked="${colorblind}" aria-label="מצב נגיש לעיוורי צבעים" class="relative h-6 w-11 shrink-0 rounded-full transition-colors ${colorblind ? "bg-accent" : "bg-white/15"}">
          <span aria-hidden="true" class="absolute right-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${colorblind ? "-translate-x-5" : "translate-x-0"}"></span>
        </button>
      </div>
      <p>בכל משחק נבחר שחקן סודי אקראי מליגת העל. יש לכם <b class="text-text">10 ניחושים</b> כדי לזהות אותו לפי רמזים. אין הגבלה על מספר המשחקים — לחצו ״משחק חדש״ מתי שרוצים.</p>
      <div>
        <p class="mb-2 font-semibold text-text">הרמזים אחרי כל ניחוש:</p>
        <ul class="space-y-2">
          ${helpRow("correct", "מועדון", "אותו מועדון בדיוק")}
          ${helpRow("correct", "עמדה", "עמדה זהה בדיוק (למשל בלם↔בלם)")}
          ${helpRow("present", "עמדה", "עמדה קרובה מאותו איזור (למשל בלם↔מגן)")}
          ${helpRow("present", "גיל", "הפרש של עד 2 שנים מהשחקן המטרה")}
          ${helpRow("absent", "", "לא מתאים — חפשו קבוצה/עמדה/גיל אחרים")}
        </ul>
      </div>
      <div>
        <p class="mb-2 font-semibold text-text">חיצים בעמודת הגיל:</p>
        <p class="text-xs"><span class="font-bold text-text">↑</span> השחקן הסודי מבוגר יותר<br><span class="font-bold text-text">↓</span> השחקן הסודי צעיר יותר</p>
      </div>
      <div class="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-xs">
        <p class="font-semibold text-text">💡 רמזים נוספים</p>
        <p class="mt-1">אחרי 4 ניחושים: האות הראשונה בשם ותמונה מטושטשת. אחרי 7 ניחושים: האות הראשונה בשם המשפחה.</p>
      </div>
    </div>`;
  }

  function resultBody() {
    const s = BY_ID.get(game.secretId);
    const c = club(s.club);
    const n = game.guesses.length;
    return `<div class="space-y-5">
      <div class="text-center">
        <div class="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl ${game.won ? "bg-correct/20 shadow-glow-correct" : "bg-absent/40"}">${svg("trophy", "h-7 w-7 " + (game.won ? "text-correct" : "text-muted"))}</div>
        <h3 class="text-xl font-extrabold text-text">${game.won ? `פתרתם תוך ${n} ניחושים!` : "לא הצלחתם הפעם — נסו שחקן חדש"}</h3>
      </div>
      <div class="glass relative overflow-hidden rounded-2xl p-4">
        <span aria-hidden="true" class="absolute right-0 top-0 h-full w-1.5" style="background:${c ? c.color : "rgba(255,255,255,0.2)"}"></span>
        <div class="flex items-center gap-3">
          ${s.photo ? `<img src="${esc(s.photo)}" alt="${esc(s.name)}" class="h-16 w-16 shrink-0 rounded-2xl object-cover shadow-md" style="background:${c ? c.color + "22" : "rgba(255,255,255,0.06)"};border:${c ? `1px solid ${c.color}55` : "1px solid rgba(255,255,255,0.1)"}" onerror="this.remove()">` : ""}
          <div class="min-w-0">
            <p class="text-xs uppercase tracking-wider text-muted">השחקן המסתורי</p>
            <p class="mt-1 truncate text-2xl font-extrabold text-text">${esc(s.name)}</p>
            <p class="mt-1 text-sm text-text-dim">${esc(s.club)}${s.position ? " · " + esc(s.position) : ""}</p>
            ${s.age != null ? `<p class="mt-0.5 text-xs text-muted">גיל: ${s.age}</p>` : ""}
          </div>
        </div>
      </div>
      <button type="button" id="modal-new" class="btn-primary w-full">${svg("refresh", "h-4 w-4")}משחק חדש</button>
      <button type="button" id="modal-share" class="btn-ghost w-full">${svg("share", "h-4 w-4")}<span>שתפו את התוצאה</span></button>
    </div>`;
  }

  function confetti() {
    const colors = ["#538d4e", "#b59f3b", "#5b8def", "#8b5cf6", "#f59e0b", "#ef4444"];
    document.getElementById("confetti-root").innerHTML = `<div class="pointer-events-none fixed inset-0 z-40 overflow-hidden" aria-hidden="true">${Array.from(
      { length: 40 },
      (_, t) =>
        `<div class="absolute h-3 w-2" style="left:${(t / 40) * 100 + ((t % 3) - 1) * 2}%;top:-20px;background:${colors[t % colors.length]};border-radius:${t % 3 === 0 ? "50%" : "2px"};animation:confetti-fall ${1.6 + (t % 5) * 0.18}s ease-in forwards;animation-delay:${(t % 10) * 0.08}s"></div>`
    ).join("")}</div>`;
  }

  // ---------- Boot ----------
  if (!PLAYERS.length) {
    app.innerHTML = '<p class="p-8 text-center text-text-dim">לא נמצאו נתוני שחקנים (data/players.js).</p>';
    return;
  }
  renderShell();
  renderAll(false);
})();
