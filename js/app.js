(function (global) {
  const Storage = global.MiManzana.Storage;
  const Lineup = global.MiManzana.Lineup;
  const Roster = global.MiManzana.Roster;
  const Cards = global.MiManzana.Cards;
  const FirebaseSync = global.MiManzana.FirebaseSync;

  let bootstrapped = false;

  function renderGameReports() {
    const team = Storage.getTeam();
    const teamLabel = team === "blue" ? "Team Blue" : "Team Orange";
    return `<div class="roster-page">
      <header class="panel-top"><h1 class="page-title">GAME REPORTS</h1><span class="team-pill">${teamLabel}</span></header>
      <div class="panel-body roster-page-body"><p class="empty-msg">Game reports coming soon.</p></div>
    </div>`;
  }

  function setActiveNav(nav) {
    Storage.setNav(nav);
    document.querySelectorAll(".sidebar-nav-item:not(.disabled)").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.nav === nav);
    });
    render();
  }

  function syncTeamToggle() {
    const team = Storage.getTeam();
    document.body.dataset.team = team;
    document.querySelectorAll(".team-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.team === team);
    });
  }

  function setSyncStatus(status) {
    const el = document.getElementById("sync-status");
    if (!el) return;
    el.dataset.status = status;
    const labels = {
      loading: "Connecting…",
      live: "Live sync",
      local: "Local only",
      error: "Sync error"
    };
    el.textContent = labels[status] || status;
  }

  function render() {
    syncTeamToggle();
    const nav = Storage.getNav();
    const team = Storage.getTeam();
    const main = document.getElementById("main-content");
    document.body.dataset.cardSize = Storage.getLineup(team).cardOptions.size || "3x5";

    if (nav === "team") {
      main.innerHTML = Roster.renderRosterPanel();
      Roster.bindEvents();
      main.className = "app-main roster-view";
    } else if (nav === "game-reports") {
      main.innerHTML = renderGameReports();
      main.className = "app-main reports-view";
    } else {
      main.className = "app-main dashboard-view";
      main.innerHTML = Lineup.renderDashboard();
      Lineup.bindEvents();
    }
  }

  function refreshDashboard() { render(); }

  function updatePreviewOnly() {
    const team = Storage.getTeam();
    const lineup = Storage.getLineup(team);
    const col = document.getElementById("preview-col");
    if (col) col.innerHTML = Cards.renderPrintColumn(lineup.slots, lineup.cardOptions);
    const tbody = document.getElementById("lineup-body");
    if (tbody) {
      const selectedId = lineup.selectedSlotId;
      tbody.querySelectorAll(".lineup-row").forEach((row) => {
        row.classList.toggle("active", row.dataset.slotId === selectedId);
        const slot = lineup.slots.find((s) => s.id === row.dataset.slotId);
        if (!slot) return;
        const zone = global.MiManzana.Zones.getZone(slot.zone);
        const select = row.querySelector(".lineup-player-select");
        if (select) select.value = slot.playerId || "";
        row.querySelector(".manzana-cell").innerHTML = global.MiManzana.Zones.renderZoneIcon(slot.zone, 22, slot.batterHand) + `<span>${zone.shortLabel}</span>`;
      });
    }
    const editor = document.getElementById("editor-col");
    if (editor && lineup.selectedSlotId) {
      const slot = lineup.slots.find((s) => s.id === lineup.selectedSlotId);
      editor.innerHTML = global.MiManzana.Lineup.renderEditor(slot, team);
    }
  }

  function printCards() {
    Lineup.persistFromEditor();
    const team = Storage.getTeam();
    const lineup = Storage.getLineup(team);
    const filled = lineup.slots.filter((s) => s.name.trim());
    if (!filled.length) {
      alert("Add players to the lineup before printing.");
      return;
    }
    const container = document.getElementById("print-container");
    container.innerHTML = Cards.renderPrintSheet(lineup.slots);
    document.body.classList.add("printing");
    window.print();
    setTimeout(() => { document.body.classList.remove("printing"); container.innerHTML = ""; }, 500);
  }

  function refreshCurrentView() {
    ["blue", "orange"].forEach((t) => Lineup.ensureLineupForTeam(t, { persist: false }));
    const nav = Storage.getNav();
    if (nav === "team") {
      if (!Roster.refreshRosterGrid()) render();
      return;
    }
    if (nav === "home") {
      if (!Lineup.refreshLineupView()) render();
    }
  }

  function handleRemoteUpdate(shared, photos) {
    if (!Storage.applyRemoteShared(shared, photos)) return;
    if (!bootstrapped) return;
    refreshCurrentView();
  }

  function bootstrapApp(info) {
    bootstrapped = true;
    ["blue", "orange"].forEach((t) => Lineup.ensureLineupForTeam(t));
    Storage.syncLineupDatesToToday();
    document.querySelectorAll(".sidebar-nav-item:not(.disabled)").forEach((btn) => {
      btn.addEventListener("click", () => setActiveNav(btn.dataset.nav));
    });
    document.getElementById("team-toggle")?.addEventListener("click", (e) => {
      const btn = e.target.closest(".team-btn");
      if (!btn) return;
      Storage.setTeam(btn.dataset.team);
      render();
    });
    window.addEventListener("beforeprint", () => document.body.classList.add("printing"));
    window.addEventListener("afterprint", () => document.body.classList.remove("printing"));
    setActiveNav(Storage.getNav() || "home");
    if (info.mode === "firebase" && !info.error) setSyncStatus("live");
    else if (info.error) setSyncStatus("error");
    else setSyncStatus("local");
  }

  function init() {
    setSyncStatus("loading");
    Storage.load();
    FirebaseSync.init(
      (info) => bootstrapApp(info),
      (shared, photos) => handleRemoteUpdate(shared, photos)
    );
  }

  global.MiManzana = global.MiManzana || {};
  global.MiManzana.App = { init, render, refresh: render, refreshDashboard, updatePreviewOnly, refreshCurrentView, printCards, setSyncStatus };
  document.addEventListener("DOMContentLoaded", init);
})(window);
