(function (global) {
  const STORAGE_KEY = "mi-manzana-data";
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
  function mergeLineup(raw) {
    return { ...defaultLineup(), ...raw, cardOptions: { ...defaultCardOptions(), ...(raw?.cardOptions || {}) }, slots: raw?.slots || [] };
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
    if (changed) save();
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) { state = defaultData(); syncLineupDatesToToday(); return state; }
      const parsed = JSON.parse(raw);
      state = {
        ...defaultData(), ...parsed,
        activeNav: normalizeNav(parsed.activeNav || parsed.activeTab),
        teams: { blue: parsed.teams?.blue || [], orange: parsed.teams?.orange || [] },
        lineups: { blue: mergeLineup(parsed.lineups?.blue), orange: mergeLineup(parsed.lineups?.orange) }
      };
      syncLineupDatesToToday();
    } catch { state = defaultData(); }
    return state;
  }
  function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  function getState() { if (!state) load(); return state; }
  function getTeam() { return getState().activeTeam; }
  function setTeam(team) { getState().activeTeam = team; save(); }
  function getNav() { return normalizeNav(getState().activeNav); }
  function setNav(nav) { getState().activeNav = normalizeNav(nav); save(); }
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
          state = { ...defaultData(), ...parsed, teams: { blue: parsed.teams?.blue || [], orange: parsed.teams?.orange || [] }, lineups: { blue: mergeLineup(parsed.lineups?.blue), orange: mergeLineup(parsed.lineups?.orange) } };
          syncLineupDatesToToday();
          save(); resolve(state);
        } catch (e) { reject(e); }
      };
      reader.onerror = reject; reader.readAsText(file);
    });
  }
  global.MiManzana = global.MiManzana || {};
  global.MiManzana.Storage = { load, save, getState, getTeam, setTeam, getNav, setNav, getRoster, setRoster, getLineup, setLineup, getSelectedSlot, findPlayer, uuid, exportData, importData, defaultCardOptions, todayIso };
})(window);
