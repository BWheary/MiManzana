(function (global) {
  const Storage = global.MiManzana.Storage;
  const Zones = global.MiManzana.Zones;
  const Cards = global.MiManzana.Cards;

  function createEmptySlot(order) {
    return { id: Storage.uuid(), order, playerId: "", name: "", jersey: "", position: "", zone: "middle", batterHand: "R", photo: "", notes: ["", ""], selected: true };
  }

  function applyPlayerToSlot(slot, player) {
    slot.playerId = player.id;
    slot.name = player.name;
    slot.jersey = player.jersey || "";
    slot.zone = Zones.getZone(player.zone || "middle").id;
    slot.batterHand = Zones.normalizeBatterHand(player.batterHand);
    slot.photo = player.photo || "";
    slot.notes = [...(player.notes || ["", ""])];
    slot.zoneOverride = false;
  }

  function createSlotFromPlayer(player, order) {
    const slot = createEmptySlot(order);
    applyPlayerToSlot(slot, player);
    return slot;
  }

  function syncAllLinkedSlotsFromRoster(team, options = {}) {
    const persist = options.persist !== false;
    const lineup = Storage.getLineup(team);
    const roster = Storage.getRoster(team);
    lineup.slots.forEach((slot) => {
      if (!slot.playerId || slot.zoneOverride) return;
      const player = roster.find((p) => p.id === slot.playerId);
      if (player) applyPlayerToSlot(slot, player);
    });
    if (persist) Storage.setLineup(team, lineup);
  }

  function syncRosterPlayerToLineup(team, playerId) {
    const player = Storage.findPlayer(team, playerId);
    if (!player) return;
    const lineup = Storage.getLineup(team);
    let changed = false;
    lineup.slots.forEach((slot) => {
      if (slot.playerId === playerId) {
        applyPlayerToSlot(slot, player);
        changed = true;
      }
    });
    if (changed) Storage.setLineup(team, lineup);
  }

  function ensureLineupForTeam(team, options = {}) {
    const persist = options.persist !== false;
    const lineup = Storage.getLineup(team);
    const roster = Storage.getRoster(team);
    const today = Storage.todayIso();
    if (!lineup.lineupDate) lineup.lineupDate = today;
    if (!lineup.slots.length) {
      lineup.slots = Array.from({ length: 9 }, (_, i) => {
        const player = roster[i];
        return player ? createSlotFromPlayer(player, i + 1) : createEmptySlot(i + 1);
      });
    } else {
      while (lineup.slots.length < 9) {
        const i = lineup.slots.length;
        const player = roster[i];
        lineup.slots.push(player ? createSlotFromPlayer(player, i + 1) : createEmptySlot(i + 1));
      }
      if (lineup.slots.length > 9) lineup.slots = lineup.slots.slice(0, 9);
      lineup.slots.forEach((slot, i) => { slot.order = i + 1; });
    }
    if (lineup.slots.length) syncAllLinkedSlotsFromRoster(team, { persist });
    if (!lineup.selectedSlotId && lineup.slots.length) lineup.selectedSlotId = lineup.slots[0].id;
    if (persist) Storage.setLineup(team, lineup);
    return lineup;
  }

  function renderPlayerSelect(slot, roster, slots) {
    const esc = Cards.escapeHtml;
    const usedIds = new Set(slots.filter((s) => s.id !== slot.id && s.playerId).map((s) => s.playerId));
    const opts = roster.map((p) => {
      const selected = p.id === slot.playerId ? " selected" : "";
      const disabled = usedIds.has(p.id) && p.id !== slot.playerId ? " disabled" : "";
      const jersey = p.jersey ? ` #${esc(p.jersey)}` : "";
      return `<option value="${p.id}"${selected}${disabled}>${esc(p.name)}${jersey}</option>`;
    }).join("");
    return `<select class="lineup-player-select" data-slot-id="${slot.id}" aria-label="Select player for order ${slot.order}"><option value="">— Select —</option>${opts}</select>`;
  }

  function renderLineupRowsHtml() {
    const team = Storage.getTeam();
    const lineup = Storage.getLineup(team);
    const slots = lineup.slots;
    const roster = Storage.getRoster(team);
    const selectedId = lineup.selectedSlotId || "";
    return slots.map((slot) => {
      const zone = Zones.getZone(slot.zone);
      const isActive = slot.id === selectedId ? " active" : "";
      return `<tr class="lineup-row${isActive}" data-slot-id="${slot.id}">
        <td><span class="order-badge">${slot.order}</span></td>
        <td class="player-name-cell">${renderPlayerSelect(slot, roster, slots)}</td>
        <td class="manzana-cell">${Zones.renderZoneIcon(slot.zone, 22, slot.batterHand)}<span>${zone.shortLabel}</span></td>
      </tr>`;
    }).join("");
  }

  function refreshLineupView() {
    const tbody = document.getElementById("lineup-body");
    if (!tbody) return false;
    const team = Storage.getTeam();
    const lineup = Storage.getLineup(team);
    tbody.innerHTML = renderLineupRowsHtml();
    const editor = document.getElementById("editor-col");
    if (editor) {
      const selected = Storage.getSelectedSlot(team);
      editor.innerHTML = renderEditor(selected, team);
    }
    const preview = document.getElementById("preview-col");
    if (preview) preview.innerHTML = Cards.renderPrintColumn(lineup.slots, lineup.cardOptions);
    return true;
  }

  function renderDashboard() {
    const team = Storage.getTeam();
    const lineup = ensureLineupForTeam(team);
    const slots = lineup.slots;
    const selected = Storage.getSelectedSlot(team);
    const date = lineup.lineupDate || Storage.todayIso();
    const rows = renderLineupRowsHtml();

    return `<div class="dashboard">
      <section class="dash-panel lineup-panel">
        <header class="lineup-panel-header">
          <h1 class="lineup-title">Today's Lineup</h1>
          <div class="lineup-toolbar">
            <input type="date" class="date-input" id="lineup-date" value="${date}"/>
          </div>
        </header>
        <div class="panel-body">
          <table class="daily-lineup-table">
            <thead><tr><th>Order</th><th>Player</th><th>Preference</th></tr></thead>
            <tbody id="lineup-body">${rows}</tbody>
          </table>
          <div class="lineup-footer-actions">
            <button type="button" class="btn btn-navy" id="btn-save-lineup">&#10003; Save Lineup</button>
            <button type="button" class="btn btn-outline" id="btn-clear-lineup">&#10005; Clear Lineup</button>
          </div>
        </div>
      </section>
      <section class="dash-panel editor-panel" id="editor-col">
        ${renderEditor(selected, team)}
      </section>
      <div class="preview-panel-col">
        <section class="dash-panel preview-panel" id="preview-col">
          ${Cards.renderPrintColumn(slots, lineup.cardOptions)}
        </section>
      </div>
    </div>`;
  }

  function renderEditor(slot, team) {
    if (!slot) {
      return `<p class="empty-msg">Select a player from the lineup.</p>`;
    }
    const esc = Cards.escapeHtml;
    const zone = Zones.getZone(slot.zone);
    const handLabel = Zones.batterHandLabel(slot.batterHand);
    const photo = slot.photo || (slot.playerId ? Storage.findPlayer(team, slot.playerId)?.photo : "") || "";
    const headerClass = photo ? "editor-player-header has-photo" : "editor-player-header";
    const photoHtml = photo ? `<div class="editor-player-photo"><img src="${photo}" alt=""/></div>` : "";
    return `<div class="editor-body">
        <div class="${headerClass}">
          ${photoHtml}
          <div class="editor-player-info">
            <p class="editor-player-title">${esc(slot.name || "Player")}${slot.jersey ? " #" + esc(slot.jersey) : ""}</p>
            <p class="editor-player-meta"><span class="editor-player-pref">${esc(zone.shortLabel)}</span><span class="editor-player-hand">${handLabel}</span></p>
          </div>
        </div>
        <div class="editor-zone-stage">
          <div class="editor-zone-wrap">${Zones.renderZoneSvg(slot.zone, 200, 220, slot.batterHand)}</div>
        </div>
        <div class="zone-picker" id="zone-picker">${Zones.renderZonePicker(slot.zone, slot.batterHand)}</div>
      </div>`;
  }

  function readEditorIntoSlot(slotId) {
    const team = Storage.getTeam();
    const lineup = Storage.getLineup(team);
    if (!lineup.slots.find((s) => s.id === slotId)) return;
    lineup.selectedSlotId = slotId;
    Storage.setLineup(team, lineup);
  }

  function readCardOptions() {
    const team = Storage.getTeam();
    const lineup = Storage.getLineup(team);
    const opts = lineup.cardOptions;
    return {
      ...opts,
      size: "3x5",
      showNotes: false,
      showNumber: false,
      showMessage: opts.showMessage !== false,
      notesLines: 2
    };
  }

  function persistFromEditor() {
    const team = Storage.getTeam();
    const lineup = Storage.getLineup(team);
    const slotId = lineup.selectedSlotId;
    if (slotId) readEditorIntoSlot(slotId);
    lineup.cardOptions = readCardOptions();
    if (document.getElementById("lineup-date")) lineup.lineupDate = document.getElementById("lineup-date").value;
    Storage.setLineup(team, lineup);
  }

  function selectSlot(slotId) {
    const team = Storage.getTeam();
    const lineup = Storage.getLineup(team);
    lineup.selectedSlotId = slotId;
    Storage.setLineup(team, lineup);
    global.MiManzana.App.refreshDashboard();
  }

  function fillSlotFromRoster(slotId, playerId) {
    const team = Storage.getTeam();
    const lineup = Storage.getLineup(team);
    const slot = lineup.slots.find((s) => s.id === slotId);
    if (!slot) return;
    if (!playerId) {
      slot.playerId = "";
      slot.name = "";
      slot.jersey = "";
      slot.zone = "middle";
      slot.batterHand = "R";
      slot.photo = "";
      slot.notes = ["", ""];
      slot.zoneOverride = false;
    } else {
      const player = Storage.findPlayer(team, playerId);
      if (!player) return;
      applyPlayerToSlot(slot, player);
    }
    lineup.selectedSlotId = slotId;
    Storage.setLineup(team, lineup);
    global.MiManzana.App.refreshDashboard();
  }

  function setZone(zoneId) {
    const team = Storage.getTeam();
    const lineup = Storage.getLineup(team);
    const slot = lineup.slots.find((s) => s.id === lineup.selectedSlotId);
    if (!slot) return;
    slot.zone = Zones.getZone(zoneId).id;
    slot.zoneOverride = true;
    Storage.setLineup(team, lineup);
    global.MiManzana.App.refreshDashboard();
  }

  function bindEvents() {
    document.getElementById("lineup-body")?.addEventListener("click", (e) => {
      if (e.target.closest(".lineup-player-select")) return;
      const row = e.target.closest(".lineup-row");
      if (row) selectSlot(row.dataset.slotId);
    });
    document.getElementById("lineup-body")?.addEventListener("change", (e) => {
      const sel = e.target.closest(".lineup-player-select");
      if (!sel) return;
      e.stopPropagation();
      fillSlotFromRoster(sel.dataset.slotId, sel.value);
    });
    document.getElementById("btn-clear-lineup")?.addEventListener("click", () => {
      if (!confirm("Clear today's lineup?")) return;
      const team = Storage.getTeam();
      const lineup = Storage.getLineup(team);
      lineup.slots = Array.from({ length: 9 }, (_, i) => createEmptySlot(i + 1));
      lineup.selectedSlotId = lineup.slots[0].id;
      Storage.setLineup(team, lineup);
      global.MiManzana.App.refreshDashboard();
    });
    document.getElementById("btn-save-lineup")?.addEventListener("click", () => {
      persistFromEditor();
      global.MiManzana.App.refreshDashboard();
    });
    document.getElementById("editor-col")?.addEventListener("click", (e) => {
      const btn = e.target.closest(".zone-pick-btn");
      if (btn) setZone(btn.dataset.zone);
    });
    document.getElementById("lineup-date")?.addEventListener("change", () => persistFromEditor());
    document.getElementById("preview-col")?.addEventListener("click", (e) => {
      if (e.target.closest("#btn-print-cards")) global.MiManzana.App.printCards();
    });
  }

  global.MiManzana = global.MiManzana || {};
  global.MiManzana.Lineup = {
    renderDashboard, renderEditor, bindEvents, createEmptySlot, ensureLineupForTeam,
    persistFromEditor, readCardOptions, applyPlayerToSlot, syncRosterPlayerToLineup, syncAllLinkedSlotsFromRoster,
    refreshLineupView
  };
})(window);



