(function (global) {
  const { getZone, renderZoneSvg } = global.MiManzana.Zones;

  function escapeHtml(str) {
    return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function buildMiniPreviewCard(slot, forPrint) {
    const name = escapeHtml(slot.name || "Player");
    const photo = slot.photo || "";
    const photoHtml = photo
      ? `<div class="mini-card-photo"><img src="${photo}" alt=""/></div>`
      : `<div class="mini-card-photo mini-card-photo-fallback" aria-hidden="true"></div>`;
    const zoneSize = forPrint ? [60, 68] : [52, 58];
    return `<article class="mini-card" data-slot-id="${slot.id}">
      <div class="mini-card-identity">
        ${photoHtml}
        <header class="card-header">
          <span class="card-order">${slot.order}</span>
          <span class="card-name">${name.toUpperCase()}</span>
        </header>
      </div>
      <div class="card-zone">${renderZoneSvg(slot.zone, zoneSize[0], zoneSize[1], slot.batterHand)}</div>
    </article>`;
  }

  function buildCardHtml(slot, options, mini) {
    const name = escapeHtml(slot.name || "Player");
    const jersey = slot.jersey && options.showNumber !== false ? "#" + escapeHtml(slot.jersey) : "";
    const pos = slot.position ? escapeHtml(slot.position) : "";
    const notesLines = options.notesLines || 2;
    const notes = (slot.notes || []).slice(0, notesLines);
    const notesHtml = options.showNotes !== false
      ? notes.filter(Boolean).map((n) => `<li>${escapeHtml(n)}</li>`).join("") : "";
    const notesBlock = notesHtml ? `<ul class="card-notes-list">${notesHtml}</ul>` : "";
    const footerHtml = options.showMessage !== false
      ? `<p class="card-footer-msg">IF HE BEATS ME IN MY APPLE, HE BEAT ME.</p>` : "";
    const zoneSize = mini ? [76, 84] : [140, 160];
    const cardClass = mini ? "player-card mini-card" : "player-card";
    const sizeClass = "card-size-" + (options.size || "3x5");

    return `<article class="${cardClass} ${sizeClass}" data-slot-id="${slot.id}">
      ${mini ? "" : `<label class="card-select-label no-print"><input type="checkbox" class="card-select" data-slot-id="${slot.id}" ${slot.selected !== false ? "checked" : ""}/> Print</label>`}
      <header class="card-header">
        <span class="card-order">${slot.order}</span>
        <span class="card-name">${name.toUpperCase()}</span>
        ${jersey ? `<span class="card-jersey">${jersey}</span>` : ""}
        ${pos ? `<span class="card-pos">${pos}</span>` : ""}
      </header>
      <div class="card-zone">${renderZoneSvg(slot.zone, zoneSize[0], zoneSize[1], slot.batterHand)}</div>
      ${mini ? "" : `<div class="card-notes"><p class="card-notes-title"><span class="target-icon">&#x25CE;</span> WHEN I AM AT MY BEST...</p>${notesBlock}</div>${footerHtml}`}
    </article>`;
  }

  function renderPrintColumn(slots, options) {
    const ordered = slots.slice().sort((a, b) => a.order - b.order);
    const filled = ordered.filter((s) => s.name.trim());
    const cards = ordered.map((s) => (s.name.trim()
      ? buildMiniPreviewCard(s)
      : `<div class="mini-card mini-card-empty" aria-hidden="true"></div>`)).join("");
    return `<div class="preview-grid-wrap">
        <div class="mini-card-grid preview-card-grid" id="mini-card-grid">${cards}</div>
        ${filled.length ? "" : `<p class="preview-grid-empty-msg">Add players to preview cards.</p>`}
      </div>
      <div class="preview-panel-actions">
        <button type="button" class="btn btn-navy btn-block" id="btn-print-cards">Print Lineup Card</button>
      </div>`;
  }

  function renderPrintSheet(slots) {
    const ordered = slots.slice().sort((a, b) => a.order - b.order);
    const filled = ordered.filter((s) => s.name.trim());
    if (!filled.length) return "";
    const cards = ordered.map((s) => (s.name.trim()
      ? buildMiniPreviewCard(s, true)
      : `<div class="mini-card mini-card-empty" aria-hidden="true"></div>`)).join("");
    return `<article class="lineup-print-sheet">
      <div class="lineup-print-grid preview-card-grid">${cards}</div>
    </article>`;
  }

  global.MiManzana = global.MiManzana || {};
  global.MiManzana.Cards = { buildCardHtml, buildMiniPreviewCard, renderPrintColumn, renderPrintSheet, escapeHtml };
})(window);
