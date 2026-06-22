(function (global) {
  const STORAGE_KEY = "mi-manzana-data";
  const PREFS_KEY = "mi-manzana-prefs";

  function todayIso() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  function defaultCardOptions() { return { size: "3x5", notesLines: 2, showMessage: true, showNotes: true, showNumber: true }; }
  function defaultLineup() { return { slots: [], selectedSlotId: null, cardOptions: defaultCardOptions(), lineupDate: todayIso() }; }
  const NAV_ALIASES = {
    lineup: "home", "player-cards": "home", "print-cards": "home", settings: "home",
    "my-players": "team", reports: "game-reports",
  };
  function normalizeNav(nav) {
    if (!nav) return "home";
    return NAV_ALIASES[nav] || nav;
  }
  function defaultData() {
    return { teams: { blue: [], orange: [] }, lineups: { blue: defaultLineup(), orange: defaultLineup() }, activeTeam: "orange", activeNav: "home" };
  }
  let state = null;
  let applyingRemote = false;
  let batching = false;
  let pendingPush = false;

  function mergeLineup(raw) {
    return { ...defaultLineup(), ...raw, cardOptions: { ...defaultCardOptions(), ...(raw?.cardOptions || {}) }, slots: raw?.slots || [] };
  }

  function loadPrefs() {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (!raw) return { activeTeam: "orange", activeNav: "home" };
      const parsed = JSON.parse(raw);
      return {
        activeTeam: parsed.activeTeam === "blue" ? "blue" : "orange",
        activeNav: normalizeNav(parsed.activeNav)
      };
    } catch {
      return { activeTeam: "orange", activeNav: "home" };
    }
  }

  function savePrefs() {
    localStorage.setItem(PREFS_KEY, JSON.stringify({
      activeTeam: getState().activeTeam,
      activeNav: getState().activeNav
    }));
  }

  function hydrateLineupPhotos(shared) {
    ["blue", "orange"].forEach((team) => {
      const roster = shared.teams[team] || [];
      const lineup = shared.lineups[team];
      if (!lineup?.slots) return;
      lineup.slots.forEach((slot) => {
        if (!slot.playerId) return;
        const player = roster.find((p) => p.id === slot.playerId);
        if (player?.photo) slot.photo = player.photo;
      });
    });
    return shared;
  }

  function normalizeShared(parsed) {
    const shared = {
      teams: { blue: parsed?.teams?.blue || [], orange: parsed?.teams?.orange || [] },
      lineups: {
        blue: mergeLineup(parsed?.lineups?.blue),
        orange: mergeLineup(parsed?.lineups?.orange)
      }
    };
    return hydrateLineupPhotos(shared);
  }

  function buildState(shared, prefs) {
    return {
      ...defaultData(),
      ...prefs,
      teams: shared.teams,
      lineups: shared.lineups
    };
  }

  function cacheShared(shared) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shared));
  }

  function loadSharedFromCache() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return normalizeShared(defaultData());
      return normalizeShared(JSON.parse(raw));
    } catch {
      return normalizeShared(defaultData());
    }
  }

  function syncLineupDatesToToday() {
    const today = todayIso();
    let changed = false;
    ["blue", "orange"].forEach((team) => {
      const lineup = getState().lineups[team];
      if (lineup && lineup.lineupDate !== today) {
        lineup.lineupDate = today;
        changed = true;
      }
    });
    if (changed && !applyingRemote) save();
  }

  function stripLineupPhotos(lineup) {
    return {
      ...lineup,
      slots: (lineup.slots || []).map((slot) => ({ ...slot, photo: "" }))
    };
  }

  function extractShared() {
    const s = getState();
    return {
      teams: { blue: s.teams.blue || [], orange: s.teams.orange || [] },
      lineups: { blue: s.lineups.blue, orange: s.lineups.orange }
    };
  }

  function extractSharedForRemote() {
    const shared = extractShared();
    return {
      teams: shared.teams,
      lineups: {
        blue: stripLineupPhotos(shared.lineups.blue),
        orange: stripLineupPhotos(shared.lineups.orange)
      }
    };
  }

  function pushToFirebase() {
    pendingPush = false;
    if (!state || applyingRemote || !global.MiManzana.FirebaseSync?.isConfigured()) return;
    const payload = extractSharedForRemote();
    global.MiManzana.FirebaseSync.pushShared(payload).catch((err) => {
      console.error("Firebase save failed:", err);
      global.MiManzana?.App?.setSyncStatus?.("error");
      const msg = err?.code === "invalid-argument" || String(err?.message || "").includes("longer than")
        ? "Could not sync to cloud — data may be too large. Try removing some photos."
        : "Could not sync to cloud. Your changes are saved on this device only.";
      alert(msg);
    });
  }

  function applyRemoteShared(remote) {
    if (!remote) return false;
    if (global.MiManzana.FirebaseSync?.shouldIgnoreRemote?.()) return false;
    applyingRemote = true;
    const prefs = { activeTeam: getState().activeTeam, activeNav: getState().activeNav };
    const shared = normalizeShared(remote);
    state = buildState(shared, prefs);
    cacheShared(extractShared());
    applyingRemote = false;
    return true;
  }

  function load() {
    const prefs = loadPrefs();
    const shared = loadSharedFromCache();
    state = buildState(shared, prefs);
    return state;
  }

  function save() {
    if (!state) return;
    const shared = extractShared();
    cacheShared(shared);
    savePrefs();
    if (applyingRemote || !global.MiManzana.FirebaseSync?.isConfigured()) return;
    if (batching) {
      pendingPush = true;
      return;
    }
    pushToFirebase();
  }

  function beginBatch() {
    batching = true;
    pendingPush = false;
  }

  function endBatch() {
    batching = false;
    if (pendingPush) pushToFirebase();
  }

  function runBatch(fn) {
    beginBatch();
    try { fn(); } finally { endBatch(); }
  }

  function getState() { if (!state) load(); return state; }
  function getTeam() { return getState().activeTeam; }
  function setTeam(team) { getState().activeTeam = team; savePrefs(); }
  function getNav() { return normalizeNav(getState().activeNav); }
  function setNav(nav) { getState().activeNav = normalizeNav(nav); savePrefs(); }
  function getRoster(team) { return getState().teams[team] || []; }
  function setRoster(team, players) { getState().teams[team] = players; save(); }
  function getLineup(team) { return getState().lineups[team]; }
  function setLineup(team, lineup) { getState().lineups[team] = lineup; save(); }
  function findPlayer(team, id) { return getRoster(team).find((p) => p.id === id) || null; }
  function getSelectedSlot(team) {
    const lineup = getLineup(team);
    if (lineup.selectedSlotId) {
      const found = lineup.slots.find((s) => s.id === lineup.selectedSlotId);
      if (found) return found;
    }
    return lineup.slots.find((s) => s.name.trim()) || lineup.slots[0] || null;
  }
  function uuid() { return crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now() + "-" + Math.random().toString(36).slice(2, 9); }
  function exportData() {
    const blob = new Blob([JSON.stringify(getState(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "mi-manzana-" + new Date().toISOString().slice(0, 10) + ".json"; a.click();
    URL.revokeObjectURL(url);
  }
  function importData(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result);
          const prefs = {
            activeTeam: parsed.activeTeam === "blue" ? "blue" : "orange",
            activeNav: normalizeNav(parsed.activeNav || parsed.activeTab)
          };
          state = buildState(normalizeShared(parsed), prefs);
          save();
          resolve(state);
        } catch (e) { reject(e); }
      };
      reader.onerror = reject; reader.readAsText(file);
    });
  }

  global.MiManzana = global.MiManzana || {};
  global.MiManzana.Storage = {
    load, save, getState, getTeam, setTeam, getNav, setNav, getRoster, setRoster, getLineup, setLineup,
    getSelectedSlot, findPlayer, uuid, exportData, importData, defaultCardOptions, todayIso,
    extractShared, extractSharedForRemote, applyRemoteShared, syncLineupDatesToToday, runBatch, beginBatch, endBatch
  };
})(window);
