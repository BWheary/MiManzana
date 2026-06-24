(function (global) {
  const STORAGE_KEY = "mi-manzana-data";
  const PHOTOS_CACHE_KEY = "mi-manzana-photos";
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
  let localRevision = 0;

  function normalizeSlot(slot) {
    if (!slot?.id) return null;
    return {
      id: slot.id,
      order: slot.order || 0,
      playerId: slot.playerId || "",
      name: slot.name || "",
      jersey: slot.jersey || "",
      position: slot.position || "",
      zone: slot.zone || "middle",
      batterHand: slot.batterHand || "R",
      photo: slot.photo || "",
      notes: Array.isArray(slot.notes) ? slot.notes.slice(0, 2) : ["", ""],
      zoneOverride: !!slot.zoneOverride,
      selected: slot.selected !== false
    };
  }

  function mergeLineup(raw) {
    const slots = (raw?.slots || []).map(normalizeSlot).filter(Boolean);
    return { ...defaultLineup(), ...raw, cardOptions: { ...defaultCardOptions(), ...(raw?.cardOptions || {}) }, slots };
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

  function rosterPlayerIds(shared) {
    const ids = new Set();
    ["blue", "orange"].forEach((team) => {
      (shared.teams?.[team] || []).forEach((p) => {
        if (p?.id) ids.add(`${team}:${p.id}`);
      });
    });
    return ids;
  }

  function mergeRosterTeams(cloudRoster, localRoster) {
    const byId = new Map();
    (cloudRoster || []).forEach((p) => { if (p?.id) byId.set(p.id, { ...p }); });
    (localRoster || []).forEach((p) => {
      if (p?.id && !byId.has(p.id)) byId.set(p.id, { ...p });
    });
    return Array.from(byId.values());
  }

  function mergePhotosObjects(cloudPhotos, localPhotos, localShared) {
    const out = { blue: { ...(cloudPhotos?.blue || {}) }, orange: { ...(cloudPhotos?.orange || {}) } };
    ["blue", "orange"].forEach((team) => {
      (localShared?.teams?.[team] || []).forEach((player) => {
        const photo = localPhotos?.[team]?.[player.id];
        if (photo && !out[team][player.id]) out[team][player.id] = photo;
      });
    });
    return out;
  }

  function mergeSharedUnion(cloudShared, localShared, cloudPhotos, localPhotos) {
    const merged = {
      teams: {
        blue: mergeRosterTeams(cloudShared.teams.blue, localShared?.teams?.blue),
        orange: mergeRosterTeams(cloudShared.teams.orange, localShared?.teams?.orange)
      },
      lineups: {
        blue: cloudShared.lineups?.blue?.slots?.length
          ? cloudShared.lineups.blue
          : (localShared?.lineups?.blue || defaultLineup()),
        orange: cloudShared.lineups?.orange?.slots?.length
          ? cloudShared.lineups.orange
          : (localShared?.lineups?.orange || defaultLineup())
      }
    };
    const photos = mergePhotosObjects(cloudPhotos, localPhotos, localShared);
    return normalizeShared(merged, photos);
  }

  function localOnlyPlayerIds(remote, local) {
    const remoteIds = rosterPlayerIds({ teams: remote?.teams || {} });
    return [...rosterPlayerIds(local)].filter((id) => !remoteIds.has(id));
  }

  function sharedFromNormalizedForRemote(shared) {
    return {
      teams: {
        blue: stripRosterPhotos(shared.teams.blue),
        orange: stripRosterPhotos(shared.teams.orange)
      },
      lineups: {
        blue: slimLineup(shared.lineups.blue),
        orange: slimLineup(shared.lineups.orange)
      },
      revision: localRevision
    };
  }

  function photosFromShared(shared) {
    const photos = { blue: {}, orange: {} };
    ["blue", "orange"].forEach((team) => {
      (shared.teams[team] || []).forEach((player) => {
        if (player.photo) photos[team][player.id] = player.photo;
      });
    });
    return photos;
  }

  function rosterPlayerCount(shared) {
    return (shared.teams?.blue?.length || 0) + (shared.teams?.orange?.length || 0);
  }

  function readCachedSnapshot() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const { revision: rev, ...data } = parsed;
      let photos = loadPhotosFromCache();
      if (!photos) {
        photos = { blue: {}, orange: {} };
        ["blue", "orange"].forEach((team) => {
          (data.teams?.[team] || []).forEach((player) => {
            if (player?.photo) photos[team][player.id] = player.photo;
          });
        });
      }
      return { shared: normalizeShared(data, photos), photos, revision: rev || 0 };
    } catch {
      return null;
    }
  }

  function initPrefsOnly() {
    const prefs = loadPrefs();
    state = buildState(normalizeShared(defaultData()), prefs);
    localRevision = 0;
    return state;
  }

  function loadFromCacheFallback() {
    const prefs = loadPrefs();
    const shared = loadSharedFromCache();
    state = buildState(shared, prefs);
    return state;
  }

  function getSeedPayload(cached) {
    if (cached?.shared && rosterPlayerCount(cached.shared) > 0) {
      localRevision = cached.revision || 0;
      return {
        shared: sharedFromNormalizedForRemote(cached.shared),
        photos: photosFromShared(cached.shared)
      };
    }
    return { shared: extractSharedForRemote(), photos: extractPhotos() };
  }

  function hydrateSlotFromPlayer(slot, player) {
    if (!player) return;
    slot.playerId = player.id;
    slot.name = player.name;
    slot.jersey = player.jersey || "";
    slot.zone = global.MiManzana.Zones.getZone(player.zone || "middle").id;
    slot.batterHand = global.MiManzana.Zones.normalizeBatterHand(player.batterHand);
    slot.photo = player.photo || "";
    slot.notes = [...(player.notes || ["", ""])];
  }

  function hydrateLineupFromRoster(shared) {
    ["blue", "orange"].forEach((team) => {
      const roster = shared.teams[team] || [];
      const lineup = shared.lineups[team];
      if (!lineup?.slots) return;
      lineup.slots.forEach((slot) => {
        if (!slot.playerId) return;
        const player = roster.find((p) => p.id === slot.playerId);
        if (player) hydrateSlotFromPlayer(slot, player);
      });
    });
    return shared;
  }

  function mergePhotosIntoRoster(shared, photos) {
    if (!photos) return shared;
    ["blue", "orange"].forEach((team) => {
      const teamPhotos = photos[team] || {};
      (shared.teams[team] || []).forEach((player) => {
        if (teamPhotos[player.id]) player.photo = teamPhotos[player.id];
      });
    });
    return shared;
  }

  function extractPhotos() {
    const photos = { blue: {}, orange: {} };
    ["blue", "orange"].forEach((team) => {
      (getState().teams[team] || []).forEach((player) => {
        if (player.photo) photos[team][player.id] = player.photo;
      });
    });
    return photos;
  }

  function normalizeShared(parsed, photos) {
    let shared = {
      teams: { blue: parsed?.teams?.blue || [], orange: parsed?.teams?.orange || [] },
      lineups: {
        blue: mergeLineup(parsed?.lineups?.blue),
        orange: mergeLineup(parsed?.lineups?.orange)
      }
    };
    shared = mergePhotosIntoRoster(shared, photos);
    return hydrateLineupFromRoster(shared);
  }

  function buildState(shared, prefs) {
    return {
      ...defaultData(),
      ...prefs,
      teams: shared.teams,
      lineups: shared.lineups
    };
  }

  function extractSharedForCache() {
    const shared = extractShared();
    return {
      teams: {
        blue: stripRosterPhotos(shared.teams.blue),
        orange: stripRosterPhotos(shared.teams.orange)
      },
      lineups: {
        blue: slimLineup(shared.lineups.blue),
        orange: slimLineup(shared.lineups.orange)
      }
    };
  }

  function loadPhotosFromCache() {
    try {
      const raw = localStorage.getItem(PHOTOS_CACHE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function cacheShared() {
    const payload = { ...extractSharedForCache(), revision: localRevision };
    const photos = extractPhotos();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      if (Object.keys(photos.blue).length || Object.keys(photos.orange).length) {
        localStorage.setItem(PHOTOS_CACHE_KEY, JSON.stringify(photos));
      } else {
        localStorage.removeItem(PHOTOS_CACHE_KEY);
      }
    } catch (err) {
      console.warn("Cache save failed (likely storage quota); saving without photos.", err);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        localStorage.removeItem(PHOTOS_CACHE_KEY);
      } catch (err2) {
        console.error("Could not save local cache:", err2);
      }
    }
  }

  function loadSharedFromCache() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return normalizeShared(defaultData());
      const parsed = JSON.parse(raw);
      localRevision = parsed.revision || 0;
      const { revision: _rev, ...data } = parsed;
      let photos = loadPhotosFromCache();
      if (!photos) {
        photos = { blue: {}, orange: {} };
        ["blue", "orange"].forEach((team) => {
          (data.teams?.[team] || []).forEach((player) => {
            if (player?.photo) photos[team][player.id] = player.photo;
          });
        });
      }
      return normalizeShared(data, photos);
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

  function slimSlot(slot) {
    return {
      id: slot.id,
      order: slot.order,
      playerId: slot.playerId || "",
      zone: slot.zone || "middle",
      zoneOverride: !!slot.zoneOverride,
      selected: slot.selected !== false,
      batterHand: slot.batterHand || "R"
    };
  }

  function slimLineup(lineup) {
    return {
      ...lineup,
      slots: (lineup.slots || []).map(slimSlot)
    };
  }

  function stripRosterPhotos(roster) {
    return (roster || []).map((player) => ({ ...player, photo: "" }));
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
      teams: {
        blue: stripRosterPhotos(shared.teams.blue),
        orange: stripRosterPhotos(shared.teams.orange)
      },
      lineups: {
        blue: slimLineup(shared.lineups.blue),
        orange: slimLineup(shared.lineups.orange)
      },
      revision: localRevision
    };
  }

  function applyCloudFirstInit(remote, photos, cached) {
    applyingRemote = true;
    const prefs = loadPrefs();
    const cloudShared = normalizeShared(remote, photos);
    localRevision = remote.revision || 0;

    let finalShared = cloudShared;
    let needsPush = false;
    if (cached?.shared) {
      const extraIds = localOnlyPlayerIds(remote, cached.shared);
      if (extraIds.length > 0) {
        finalShared = mergeSharedUnion(cloudShared, cached.shared, photos, cached.photos);
        needsPush = true;
      }
    }

    state = buildState(finalShared, prefs);
    cacheShared();
    applyingRemote = false;
    if (needsPush) pushToFirebase();
    return true;
  }

  function applyRemoteShared(remote, photos) {
    if (!remote) return false;
    if (global.MiManzana.FirebaseSync?.shouldIgnoreRemote?.()) return false;

    const local = extractShared();
    const cloudShared = normalizeShared(remote, photos);
    const unsynced = localOnlyPlayerIds(remote, local);

    let finalShared = cloudShared;
    if (unsynced.length > 0) {
      finalShared = mergeSharedUnion(cloudShared, local, photos, photosFromShared(local));
    }

    const remoteRev = remote.revision || 0;
    if (remoteRev >= localRevision) localRevision = remoteRev;

    applyingRemote = true;
    const prefs = { activeTeam: getState().activeTeam, activeNav: getState().activeNav };
    state = buildState(finalShared, prefs);
    cacheShared();
    applyingRemote = false;

    if (unsynced.length > 0) pushToFirebase();
    return true;
  }

  function load() {
    return loadFromCacheFallback();
  }

  function sanitizeForFirestore(value) {
    if (value === undefined) return undefined;
    if (value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map(sanitizeForFirestore).filter((v) => v !== undefined);
    const out = {};
    Object.keys(value).forEach((key) => {
      const v = sanitizeForFirestore(value[key]);
      if (v !== undefined) out[key] = v;
    });
    return out;
  }

  function pushToFirebase() {
    pendingPush = false;
    if (!state || applyingRemote || !global.MiManzana.FirebaseSync?.isConfigured()) return;
    localRevision += 1;
    cacheShared();
    const payload = sanitizeForFirestore(extractSharedForRemote());
    const photos = sanitizeForFirestore(extractPhotos());
    global.MiManzana.FirebaseSync.pushShared(payload, photos).catch((err) => {
      localRevision = Math.max(0, localRevision - 1);
      cacheShared();
      console.error("Firebase save failed:", err);
      global.MiManzana?.App?.setSyncStatus?.("error");
      const msg = err?.code === "invalid-argument" || String(err?.message || "").includes("longer than")
        ? "Could not sync to cloud — data may be too large. Try removing some photos."
        : "Could not sync to cloud. Your changes are saved on this device only.";
      alert(msg);
    });
  }

  function save() {
    if (!state) return;
    cacheShared();
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

  function getState() { if (!state) initPrefsOnly(); return state; }
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
    return lineup.slots.find((s) => (s.name || "").trim()) || lineup.slots[0] || null;
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
    extractShared, extractSharedForRemote, applyRemoteShared, applyCloudFirstInit, pushToFirebase,
    initPrefsOnly, readCachedSnapshot, getSeedPayload, loadFromCacheFallback,
    syncLineupDatesToToday, runBatch, beginBatch, endBatch
  };
})(window);
