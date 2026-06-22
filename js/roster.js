(function (global) {
  const Storage = global.MiManzana.Storage;
  const Zones = global.MiManzana.Zones;

  let rosterFormPhoto = "";

  function sortRosterByName(roster) {
    return roster.slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }

  function escape(s) { return global.MiManzana.Cards.escapeHtml(s); }

  function renderTeamPlayerCard(player) {
    const zone = Zones.getZone(player.zone);
    const hand = Zones.normalizeBatterHand(player.batterHand);
    const handLabel = Zones.batterHandLabel(hand);
    const photoHtml = player.photo
      ? `<div class="team-player-photo"><img src="${player.photo}" alt=""/></div>`
      : "";
    const topClass = player.photo ? "team-player-card-top has-photo" : "team-player-card-top";
    return `<article class="team-player-card" data-id="${player.id}">
      <div class="${topClass}">
        ${photoHtml}
        <header class="team-player-card-header">
          <span class="team-player-name">${escape(player.name)}</span>
          <span class="team-player-meta"><span class="team-player-pref">${escape(zone.shortLabel)}</span><span class="team-player-hand">${handLabel}</span></span>
        </header>
      </div>
      <div class="team-player-zone">${Zones.renderZoneSvg(player.zone, 100, 110, hand)}</div>
      <div class="team-player-actions">
        <button type="button" class="btn-icon btn-edit-roster" data-id="${player.id}" aria-label="Edit player">&#9998;</button>
        <button type="button" class="btn-icon btn-delete-roster" data-id="${player.id}" aria-label="Remove player">&#10005;</button>
      </div>
    </article>`;
  }

  function renderRosterGrid() {
    const team = Storage.getTeam();
    const roster = sortRosterByName(Storage.getRoster(team));
    return roster.length
      ? roster.map((p) => renderTeamPlayerCard(p)).join("")
      : `<p class="empty-msg team-roster-empty">No players yet. Open Player Pool below to add your first player.</p>`;
  }

  function refreshRosterGrid() {
    const grid = document.getElementById("team-roster-grid");
    if (!grid) return false;
    grid.innerHTML = renderRosterGrid();
    return true;
  }

  function renderRosterPanel() {
    const team = Storage.getTeam();
    const teamLabel = team === "blue" ? "Team Blue" : "Team Orange";
    const grid = renderRosterGrid();

    return `<div class="roster-page">
      <header class="panel-top team-page-header">
        <h1 class="page-title team-page-title">TEAM PAGE</h1>
        <span class="team-pill">${teamLabel}</span>
        <div class="panel-top-actions">
          <button type="button" class="btn btn-navy btn-sm" id="btn-export-roster">Export</button>
          <label class="btn btn-outline btn-sm btn-file">Import<input type="file" id="import-roster-file" accept=".json" hidden/></label>
        </div>
      </header>
      <div class="panel-body roster-page-body">
        <div class="team-roster-grid" id="team-roster-grid">${grid}</div>
      </div>
      <details class="player-pool-panel" id="player-pool-panel">
        <summary class="player-pool-tab">Player Pool</summary>
        <div class="player-pool-content">
          <p class="player-pool-intro">Add a player to the <strong>${teamLabel}</strong> roster.</p>
          <div class="roster-form player-pool-form" id="roster-form">
            <input type="hidden" id="roster-edit-id" value=""/>
            <span id="roster-form-title" class="visually-hidden">Add Player</span>
            <div class="player-pool-form-grid">
              <div class="player-pool-form-row player-pool-form-row-identity">
                <label class="pool-field pool-field-name">Name<input type="text" id="roster-name" placeholder="J. Martinez"/></label>
                <div class="pool-field pool-field-photo">
                  <span class="pool-field-label">Photo</span>
                  <div class="pool-photo-wrap">
                    <div class="pool-photo-preview is-empty" id="roster-photo-preview">No photo</div>
                    <div class="pool-photo-actions">
                      <label class="btn btn-outline btn-sm pool-photo-btn">Choose<input type="file" id="roster-photo-file" accept="image/*" hidden/></label>
                      <button type="button" class="btn btn-outline btn-sm pool-photo-remove" id="btn-remove-roster-photo" hidden>Remove</button>
                    </div>
                  </div>
                </div>
              </div>
              <div class="player-pool-form-row player-pool-form-row-details">
                <label class="pool-field pool-field-zone">Preference<select id="roster-zone">${Zones.zoneOptionsHtml("middle")}</select></label>
                <div class="pool-field pool-field-hand">
                  <span class="pool-field-label">Bats</span>
                  <div class="hand-toggle" id="roster-hand-toggle" role="group" aria-label="Batter handedness">
                    <button type="button" class="hand-btn" data-hand="L">L</button>
                    <button type="button" class="hand-btn active" data-hand="R">R</button>
                    <button type="button" class="hand-btn" data-hand="S">S</button>
                  </div>
                </div>
                <div class="pool-field pool-field-team" id="roster-transfer-field" hidden>
                  <span class="pool-field-label">Team</span>
                  <div class="team-transfer-toggle" id="roster-team-toggle" role="group" aria-label="Transfer player to team">
                    <button type="button" class="team-transfer-btn" data-team="blue">Blue</button>
                    <button type="button" class="team-transfer-btn" data-team="orange">Orange</button>
                  </div>
                </div>
                <div class="zone-preview-thumb pool-zone-preview" id="roster-zone-preview">${Zones.renderZoneSvg("middle", 64, 72)}</div>
                <div class="form-actions pool-form-actions">
                  <button type="button" class="btn btn-navy" id="btn-save-roster">Add to ${teamLabel}</button>
                  <button type="button" class="btn btn-outline btn-sm" id="btn-cancel-roster" hidden>Cancel</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </details>
    </div>`;
  }

  function getSelectedHand() {
    return Zones.normalizeBatterHand(document.querySelector("#roster-hand-toggle .hand-btn.active")?.dataset.hand);
  }

  function setSelectedHand(hand) {
    const value = Zones.normalizeBatterHand(hand);
    document.querySelectorAll("#roster-hand-toggle .hand-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.hand === value);
    });
  }

  function updateTeamTransferField() {
    const field = document.getElementById("roster-transfer-field");
    const editId = document.getElementById("roster-edit-id")?.value;
    const team = Storage.getTeam();
    if (!field) return;
    if (!editId) {
      field.hidden = true;
      return;
    }
    field.hidden = false;
    document.querySelectorAll("#roster-team-toggle .team-transfer-btn").forEach((btn) => {
      const isActive = btn.dataset.team === team;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-pressed", isActive);
    });
  }

  function updatePoolZonePreview() {
    const zoneEl = document.getElementById("roster-zone");
    const preview = document.getElementById("roster-zone-preview");
    if (!zoneEl || !preview) return;
    preview.innerHTML = Zones.renderZoneSvg(zoneEl.value, 64, 72, getSelectedHand());
  }

  function updatePhotoPreview() {
    const preview = document.getElementById("roster-photo-preview");
    const removeBtn = document.getElementById("btn-remove-roster-photo");
    if (!preview) return;
    if (rosterFormPhoto) {
      preview.classList.remove("is-empty");
      preview.innerHTML = `<img src="${rosterFormPhoto}" alt="Player photo preview"/>`;
      if (removeBtn) removeBtn.hidden = false;
    } else {
      preview.classList.add("is-empty");
      preview.textContent = "No photo";
      if (removeBtn) removeBtn.hidden = true;
    }
  }

  function processPhotoFile(file) {
    if (!file || !file.type.startsWith("image/")) {
      alert("Please choose an image file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 200;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        rosterFormPhoto = canvas.toDataURL("image/jpeg", 0.85);
        updatePhotoPreview();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function savePlayerFromForm() {
    const team = Storage.getTeam();
    const roster = Storage.getRoster(team);
    const editId = document.getElementById("roster-edit-id").value;
    const name = document.getElementById("roster-name").value.trim();
    const zone = document.getElementById("roster-zone").value;
    const batterHand = getSelectedHand();
    const photo = rosterFormPhoto || "";
    if (!name) { alert("Player name is required."); return; }
    if (editId) {
      const idx = roster.findIndex((p) => p.id === editId);
      if (idx >= 0) roster[idx] = { ...roster[idx], name, zone, batterHand, photo };
    } else {
      roster.push({ id: Storage.uuid(), name, jersey: "", position: "", zone, batterHand, photo, notes: [] });
    }
    Storage.setRoster(team, roster);
    const savedId = editId || roster[roster.length - 1]?.id;
    if (savedId) global.MiManzana.Lineup.syncRosterPlayerToLineup(team, savedId);
    resetRosterForm();
    closePlayerPool();
    global.MiManzana.App.refresh();
  }

  function openPlayerPool() {
    const panel = document.getElementById("player-pool-panel");
    if (panel) panel.open = true;
  }

  function closePlayerPool() {
    const panel = document.getElementById("player-pool-panel");
    if (panel) panel.open = false;
  }

  function resetRosterForm() {
    const team = Storage.getTeam();
    const teamLabel = team === "blue" ? "Team Blue" : "Team Orange";
    ["roster-edit-id", "roster-name"].forEach((id) => {
      const el = document.getElementById(id); if (el) el.value = "";
    });
    document.getElementById("roster-zone").value = "middle";
    setSelectedHand("R");
    rosterFormPhoto = "";
    document.getElementById("roster-photo-file").value = "";
    document.getElementById("roster-form-title").textContent = "Add Player";
    document.getElementById("btn-save-roster").textContent = `Add to ${teamLabel}`;
    document.getElementById("btn-cancel-roster").hidden = true;
    updateTeamTransferField();
    updatePoolZonePreview();
    updatePhotoPreview();
  }

  function editPlayer(id) {
    const team = Storage.getTeam();
    const teamLabel = team === "blue" ? "Team Blue" : "Team Orange";
    const p = Storage.findPlayer(team, id);
    if (!p) return;
    openPlayerPool();
    document.getElementById("roster-edit-id").value = p.id;
    document.getElementById("roster-name").value = p.name;
    document.getElementById("roster-zone").value = Zones.getZone(p.zone).id;
    setSelectedHand(p.batterHand || "R");
    rosterFormPhoto = p.photo || "";
    document.getElementById("roster-photo-file").value = "";
    document.getElementById("roster-form-title").textContent = "Edit Player";
    document.getElementById("btn-save-roster").textContent = `Save to ${teamLabel}`;
    document.getElementById("btn-cancel-roster").hidden = false;
    updateTeamTransferField();
    updatePoolZonePreview();
    updatePhotoPreview();
    document.getElementById("player-pool-panel")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function clearPlayerFromLineup(team, playerId) {
    const lineup = Storage.getLineup(team);
    let changed = false;
    lineup.slots.forEach((slot) => {
      if (slot.playerId !== playerId) return;
      slot.playerId = "";
      slot.name = "";
      slot.jersey = "";
      slot.zone = "middle";
      slot.batterHand = "R";
      slot.photo = "";
      slot.notes = ["", ""];
      slot.zoneOverride = false;
      changed = true;
    });
    if (changed) Storage.setLineup(team, lineup);
  }

  function transferPlayer(id, targetTeam) {
    const fromTeam = Storage.getTeam();
    if (fromTeam === targetTeam) return;
    const roster = Storage.getRoster(fromTeam);
    const player = roster.find((p) => p.id === id);
    if (!player) return;
    const destRoster = Storage.getRoster(targetTeam);
    Storage.setRoster(fromTeam, roster.filter((p) => p.id !== id));
    destRoster.push({ ...player });
    Storage.setRoster(targetTeam, destRoster);
    clearPlayerFromLineup(fromTeam, id);
    resetRosterForm();
    closePlayerPool();
    global.MiManzana.App.refresh();
  }

  function deletePlayer(id) {
    if (!confirm("Remove this player from the roster?")) return;
    const team = Storage.getTeam();
    Storage.setRoster(team, Storage.getRoster(team).filter((p) => p.id !== id));
    global.MiManzana.App.refresh();
  }

  function bindEvents() {
    document.getElementById("btn-save-roster")?.addEventListener("click", savePlayerFromForm);
    document.getElementById("btn-cancel-roster")?.addEventListener("click", resetRosterForm);
    document.getElementById("roster-zone")?.addEventListener("change", () => updatePoolZonePreview());
    document.getElementById("roster-hand-toggle")?.addEventListener("click", (e) => {
      const btn = e.target.closest(".hand-btn");
      if (!btn) return;
      setSelectedHand(btn.dataset.hand);
      updatePoolZonePreview();
    });
    document.getElementById("roster-photo-file")?.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) processPhotoFile(file);
      e.target.value = "";
    });
    document.getElementById("btn-remove-roster-photo")?.addEventListener("click", () => {
      rosterFormPhoto = "";
      updatePhotoPreview();
    });
    document.getElementById("btn-export-roster")?.addEventListener("click", () => Storage.exportData());
    document.getElementById("import-roster-file")?.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      Storage.importData(file).then(() => global.MiManzana.App.refresh()).catch(() => alert("Could not import file."));
      e.target.value = "";
    });
    document.getElementById("roster-form")?.addEventListener("click", (e) => {
      const transferBtn = e.target.closest(".team-transfer-btn");
      if (!transferBtn || transferBtn.classList.contains("active")) return;
      const editId = document.getElementById("roster-edit-id")?.value;
      if (!editId) return;
      transferPlayer(editId, transferBtn.dataset.team);
    });
    document.getElementById("team-roster-grid")?.addEventListener("click", (e) => {
      const editBtn = e.target.closest(".btn-edit-roster");
      const delBtn = e.target.closest(".btn-delete-roster");
      if (editBtn) editPlayer(editBtn.dataset.id);
      if (delBtn) deletePlayer(delBtn.dataset.id);
    });
  }

  global.MiManzana = global.MiManzana || {};
  global.MiManzana.Roster = { renderRosterPanel, renderTeamPlayerCard, bindEvents, resetRosterForm, sortRosterByName, refreshRosterGrid };
})(window);

