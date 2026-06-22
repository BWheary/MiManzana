(function (global) {
  const MANZANA_STROKE = "#ea580c";
  const MANZANA_FILL = "#fff7ed";
  const PREF_OPACITY = 0.2;
  const MANZANA_SCALE = 0.66;
  const MANZANA_SCALE_PEQUENA = 0.54;
  const PREF_RADIUS_RATIO = 7 / 24;
  const PREF_SHIFT_RATIO = 7 / 48;

  const ZONES = {
    middle: { id: "middle", label: "Manzana Middle", shortLabel: "Middle", color: "#dc2626", pref: null },
    middle_pequena: { id: "middle_pequena", label: "Manzana (Pequena)", shortLabel: "Pequena", color: "#b91c1c", pref: null },
    arriba: { id: "arriba", label: "Preference: Arriba", shortLabel: "Arriba", color: "#16a34a", pref: "up" },
    abajo: { id: "abajo", label: "Preference: Abajo", shortLabel: "Abajo", color: "#2563eb", pref: "down" },
    aldentro: { id: "aldentro", label: "Preference: Aldentro", shortLabel: "Aldentro", color: "#9333ea", pref: "right" },
    afuera: { id: "afuera", label: "Preference: Afuera", shortLabel: "Afuera", color: "#dc2626", pref: "left" }
  };

  const ZONE_ORDER = ["middle", "arriba", "abajo", "aldentro", "afuera", "middle_pequena"];
  const PICKER_ZONE_ORDER = ["arriba", "abajo", "aldentro", "afuera", "middle_pequena"];

  const APPLE = {
    viewW: 24,
    viewH: 24,
    path: "M14.875,6.612l.05-.05a3.229,3.229,0,0,0,.95-2.58.976.976,0,0,0-.9-.9,3.229,3.229,0,0,0-2.58.95,3.279,3.279,0,0,0-.85,1.46,4.661,4.661,0,0,0-2.69-1.75.5.5,0,1,0-.22.98,3.664,3.664,0,0,1,2.59,2.2,5.577,5.577,0,0,0-1.9-.32,5.847,5.847,0,0,0-5.84,5.84c0,2.98,2.41,8.49,5.84,8.49a5.821,5.821,0,0,0,2.4-.52.683.683,0,0,1,.56,0,5.73,5.73,0,0,0,2.38.52c3.44,0,5.85-5.51,5.85-8.49A5.838,5.838,0,0,0,14.875,6.612Zm-1.77-1.87a2.3,2.3,0,0,1,1.78-.68c0,.06.01.12.01.17a2.326,2.326,0,0,1-.67,1.63,2.359,2.359,0,0,1-1.79.66A2.247,2.247,0,0,1,13.105,4.742Zm1.56,15.19a4.787,4.787,0,0,1-1.97-.43,1.718,1.718,0,0,0-.69-.15,1.649,1.649,0,0,0-.69.15,4.879,4.879,0,0,1-1.99.43c-2.58,0-4.84-4.67-4.84-7.49a4.855,4.855,0,0,1,6.83-4.42,1.56,1.56,0,0,0,.67.15h.02a1.683,1.683,0,0,0,.69-.15,4.777,4.777,0,0,1,1.97-.42,4.852,4.852,0,0,1,4.85,4.84C19.515,15.262,17.245,19.932,14.665,19.932Z",
  };

  function getZone(id) {
    if (id === "middle_Peque\u00f1a" || id === "middle_pequena") return ZONES.middle_pequena;
    return ZONES[id] || ZONES.middle;
  }

  function getAllZones() { return ZONE_ORDER.map((id) => ZONES[id]); }

  function manzanaScaleFactor(zoneId) {
    return getZone(zoneId).id === "middle_pequena" ? MANZANA_SCALE_PEQUENA : MANZANA_SCALE;
  }

  function manzanaTransform(w, h, zoneId) {
    const scale = (Math.min(w, h) * manzanaScaleFactor(zoneId)) / APPLE.viewH;
    const tx = (w - APPLE.viewW * scale) / 2;
    const ty = (h - APPLE.viewH * scale) / 2;
    return `translate(${tx},${ty}) scale(${scale})`;
  }

  function normalizeBatterHand(hand) {
    if (hand === "L" || hand === "S") return hand;
    return "R";
  }

  function batterHandLabel(hand) {
    const h = normalizeBatterHand(hand);
    if (h === "L") return "LHB";
    if (h === "S") return "SHB";
    return "RHB";
  }

  /** Horizontal go-zone placement from the catcher's view (hitter-facing). */
  function effectivePrefDir(zone, batterHand) {
    if (!zone.pref) return null;
    const hand = normalizeBatterHand(batterHand);
    if (zone.id === "aldentro" || zone.id === "afuera") {
      const inside = hand === "L" ? "right" : "left";
      const outside = hand === "L" ? "left" : "right";
      return zone.id === "aldentro" ? inside : outside;
    }
    return zone.pref;
  }

  function preferenceGeometry(w, h, dir) {
    const mx = w / 2;
    const my = h / 2;
    const r = Math.min(w, h) * PREF_RADIUS_RATIO;
    const shift = Math.min(w, h) * PREF_SHIFT_RATIO;
    switch (dir) {
      case "up": return { cx: mx, cy: my - shift, rx: r, ry: r };
      case "down": return { cx: mx, cy: my + shift, rx: r, ry: r };
      case "right": return { cx: mx + shift, cy: my, rx: r, ry: r };
      case "left": return { cx: mx - shift, cy: my, rx: r, ry: r };
      default: return null;
    }
  }

  function renderPreference(zone, w, h, opacity, batterHand) {
    const dir = effectivePrefDir(zone, batterHand);
    if (!dir) return "";
    const geom = preferenceGeometry(w, h, dir);
    if (!geom) return "";
    const fillOpacity = opacity != null ? opacity : PREF_OPACITY;
    return `<ellipse cx="${geom.cx}" cy="${geom.cy}" rx="${geom.rx}" ry="${geom.ry}" fill="${zone.color}" fill-opacity="${fillOpacity}" class="zone-preference"/>`;
  }

  function renderManzanaApple(w, h, zoneId) {
    return `<g class="zone-manzana-group" transform="${manzanaTransform(w, h, zoneId)}">
      <path d="${APPLE.path}" class="zone-manzana-path"/>
    </g>`;
  }

  function renderZoneSvg(zoneId, width, height, batterHand) {
    const zone = getZone(zoneId);
    const w = width || 120;
    const h = height || 140;
    const gridLines = [];
    for (let i = 1; i < 3; i++) {
      const x = (w / 3) * i;
      const y = (h / 3) * i;
      gridLines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${h}" class="zone-grid-line"/>`);
      gridLines.push(`<line x1="0" y1="${y}" x2="${w}" y2="${y}" class="zone-grid-line"/>`);
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" class="zone-svg" role="img" aria-label="Strike zone with Manzana and ${zone.shortLabel} preference">
      <rect x="1" y="1" width="${w - 2}" height="${h - 2}" class="zone-border" rx="2"/>
      ${gridLines.join("")}
      ${renderPreference(zone, w, h, null, batterHand)}
      ${renderManzanaApple(w, h, zoneId)}
    </svg>`;
  }

  function renderZoneIcon(zoneId, size, batterHand) {
    const zone = getZone(zoneId);
    const s = size || 20;
    const w = s;
    const h = Math.round(s * 1.15);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${s}" height="${h}" class="zone-icon">
      ${renderPreference(zone, w, h, 0.35, batterHand)}
      <g transform="${manzanaTransform(w, h, zoneId)}">
        <path d="${APPLE.path}" class="zone-manzana-path"/>
      </g>
    </svg>`;
  }

  function renderZonePicker(selectedId, batterHand) {
    return PICKER_ZONE_ORDER.map((id) => {
      const z = ZONES[id];
      const active = getZone(selectedId).id === z.id ? " active" : "";
      return `<button type="button" class="zone-pick-btn${active}" data-zone="${z.id}" title="${z.label}">${renderZoneIcon(z.id, 36, batterHand)}<span>${z.shortLabel}</span></button>`;
    }).join("");
  }

  function zoneOptionsHtml(selectedId) {
    return ZONE_ORDER.map((id) => {
      const z = ZONES[id];
      return `<option value="${z.id}"${getZone(selectedId).id === z.id ? " selected" : ""}>${z.label}</option>`;
    }).join("");
  }

  global.MiManzana = global.MiManzana || {};
  global.MiManzana.Zones = {
    ZONES, ZONE_ORDER, PICKER_ZONE_ORDER, getZone, getAllZones, normalizeBatterHand, batterHandLabel, effectivePrefDir,
    renderZoneSvg, renderZoneIcon, renderZonePicker, zoneOptionsHtml,
    MANZANA_STROKE, MANZANA_FILL, MANZANA_SCALE, MANZANA_SCALE_PEQUENA,
    PREF_RADIUS_RATIO, PREF_SHIFT_RATIO,
  };
})(window);
