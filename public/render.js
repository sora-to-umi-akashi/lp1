// キャラクター描画（SVG）
// AI が決めた仕様（spec）から、10種類の顔テンプレートを使ってキャラクターを描く。
// 座標系: viewBox "0 -10 200 220"。頭の中心はおよそ (100, 95)、顔パーツの基準は (100, 100)。

export const TEMPLATES = [
  { id: "maru", label: "まるみみ" },
  { id: "neko", label: "ねこみみ" },
  { id: "usagi", label: "うさみみ" },
  { id: "manju", label: "まんじゅう" },
  { id: "fuwa", label: "ふわみみ" },
  { id: "moko", label: "もこもこ" },
  { id: "tategami", label: "たてがみ" },
  { id: "zukin", label: "ずきん" },
  { id: "hoshi", label: "ほし" },
  { id: "kuma", label: "くま" },
];

export const VIEW_W = 200;
export const VIEW_H = 220;

const OUTLINE = "#5b4b45";
const INK = "#3b302c";
const SW = 3; // 輪郭線の太さ

let uid = 0;

// ---------------------------------------------------------------------------
// 色ユーティリティ
// ---------------------------------------------------------------------------
function normHex(c, fallback) {
  if (typeof c !== "string") return fallback;
  let s = c.trim();
  if (/^#[0-9a-f]{3}$/i.test(s)) s = "#" + s.slice(1).split("").map((x) => x + x).join("");
  return /^#[0-9a-f]{6}$/i.test(s) ? s.toLowerCase() : fallback;
}
function toRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function toHex([r, g, b]) {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}
export function mix(a, b, t) {
  const A = toRgb(a), B = toRgb(b);
  return toHex(A.map((v, i) => v + (B[i] - v) * t));
}

// 仕様の欠けや不正値を補う
export function normalizeSpec(spec = {}) {
  const ids = TEMPLATES.map((t) => t.id);
  const pick = (v, list, d) => (list.includes(v) ? v : d);
  const body = normHex(spec.bodyColor, "#fffaf2");
  return {
    template: pick(spec.template, ids, "maru"),
    templateReason: spec.templateReason || "",
    bodyColor: body,
    accentColor: normHex(spec.accentColor, mix(body, "#8a6a55", 0.35)),
    pattern: pick(spec.pattern, ["none", "cap", "eyepatch", "spots", "muzzle", "stripes"], "none"),
    patternColor: normHex(spec.patternColor, mix(body, "#8a6a55", 0.5)),
    eyeStyle: pick(spec.eyeStyle, ["dot", "round", "sparkle"], "round"),
    noseStyle: pick(spec.noseStyle, ["none", "dot", "triangle"], "dot"),
    noseColor: normHex(spec.noseColor, INK),
    tail: pick(spec.tail, ["none", "short", "long", "fluffy", "curly"], "short"),
    accessory: pick(spec.accessory, ["none", "collar", "ribbon", "scarf"], "none"),
    accessoryColor: normHex(spec.accessoryColor, "#e85d75"),
    features: Array.isArray(spec.features) ? spec.features.slice(0, 3) : [],
    personality: spec.personality || "",
  };
}

// ---------------------------------------------------------------------------
// 形のヘルパー
// ---------------------------------------------------------------------------
const MOCHI = "M 42 100 C 42 62, 70 46, 100 46 C 130 46, 158 62, 158 100 C 158 128, 132 140, 100 140 C 68 140, 42 128, 42 100 Z";
const MANJU = "M 36 106 C 36 66, 66 50, 100 50 C 134 50, 164 66, 164 106 C 164 132, 134 141, 100 141 C 66 141, 36 132, 36 106 Z";

// もこもこ（ホタテ型）の輪郭
function scallop(cx, cy, rx, ry, n, bump) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    const ma = ((i + 0.5) / n) * Math.PI * 2 - Math.PI / 2;
    const cxp = cx + (rx + bump) * Math.cos(ma);
    const cyp = cy + (ry + bump) * Math.sin(ma);
    d += ` Q ${cxp.toFixed(1)} ${cyp.toFixed(1)} ${q[0].toFixed(1)} ${q[1].toFixed(1)}`;
  }
  return d + " Z";
}

function star(cx, cy, ro, ri) {
  let d = "";
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? ri : ro;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    d += (i ? " L " : "M ") + (cx + r * Math.cos(a)).toFixed(1) + " " + (cy + r * Math.sin(a)).toFixed(1);
  }
  return d + " Z";
}

function heart(cx, cy, s, fill, stroke = "none") {
  return `<path transform="translate(${cx} ${cy}) scale(${s})" d="M 0 6 C -10 -2, -9 -11, -3.5 -11 C -1 -11, 0 -9, 0 -7.5 C 0 -9, 1 -11, 3.5 -11 C 9 -11, 10 -2, 0 6 Z" fill="${fill}" stroke="${stroke}" stroke-width="${stroke === "none" ? 0 : 1.5 / s}" stroke-linejoin="round"/>`;
}

function sparkle(cx, cy, s, fill) {
  return `<path transform="translate(${cx} ${cy}) scale(${s})" d="M 0 -10 Q 1.5 -1.5 10 0 Q 1.5 1.5 0 10 Q -1.5 1.5 -10 0 Q -1.5 -1.5 0 -10 Z" fill="${fill}"/>`;
}

const line = (d, w = SW, c = OUTLINE) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const shape = (d, fill, extra = "") => `<path d="${d}" fill="${fill}" stroke="${OUTLINE}" stroke-width="${SW}" stroke-linejoin="round" ${extra}/>`;
const ell = (cx, cy, rx, ry, fill, extra = "") => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${OUTLINE}" stroke-width="${SW}" ${extra}/>`;

// ---------------------------------------------------------------------------
// テンプレート定義
//  back: 頭の後ろに描くもの（耳など）
//  head: 頭の形（パターンのクリップにも使う）
//  front: 頭の上に描くもの
//  face: 顔パーツの位置 {cx, cy, s}
// ---------------------------------------------------------------------------
function templateParts(s, view) {
  const B = s.bodyColor, A = s.accentColor;
  const inner = mix(B, "#f6a9b8", 0.55);
  const sideShift = view === "side" ? -10 : 0;
  const ears = (left, right) => `<g transform="translate(${sideShift} 0)">${left}${view === "side" ? "" : right}</g>`;
  const mirror = (svg) => `<g transform="translate(200 0) scale(-1 1)">${svg}</g>`;

  switch (s.template) {
    case "neko": {
      const ear = shape("M 50 84 Q 46 44 58 34 Q 70 38 92 54 Z", B) + `<path d="M 58 70 Q 57 50 62 44 Q 70 48 80 56 Z" fill="${inner}"/>`;
      return { back: ears(ear, mirror(ear)), head: MOCHI, face: { cx: 100, cy: 100, s: 1 } };
    }
    case "usagi": {
      const ear = ell(80, 26, 13, 36, B, 'transform="rotate(-8 80 26)"') + `<ellipse cx="80" cy="30" rx="6" ry="24" fill="${inner}" transform="rotate(-8 80 30)"/>`;
      return { back: ears(ear, mirror(ear)), head: MOCHI, face: { cx: 100, cy: 100, s: 1 } };
    }
    case "manju": {
      // 上にこんがり焼き色（accentColor）
      return {
        back: "",
        head: MANJU,
        cap: `<path d="M 20 30 H 180 V 76 Q 160 84 140 76 Q 120 86 100 78 Q 80 86 60 76 Q 40 84 20 76 Z" fill="${A}"/>`,
        face: { cx: 100, cy: 104, s: 1 },
      };
    }
    case "fuwa": {
      const ear =
        shape("M 62 68 C 34 66, 18 36, 34 28 C 48 22, 72 44, 80 58 Z", B) +
        `<path d="M 60 60 C 44 56, 34 40, 40 35 C 48 32, 62 46, 68 54 Z" fill="${mix(A, "#ffffff", 0.35)}"/>`;
      const tuft = line("M 44 104 L 36 100 M 44 112 L 35 113", 2.5);
      return { back: ears(ear, mirror(ear)), head: MOCHI, front: view === "back" ? "" : tuft + mirror(tuft), face: { cx: 100, cy: 100, s: 1 } };
    }
    case "moko": {
      const side = `<ellipse cx="38" cy="98" rx="9" ry="13" fill="${A}" stroke="${OUTLINE}" stroke-width="${SW}"/>`;
      return {
        back: view === "side" ? side : side + mirror(side),
        head: scallop(100, 95, 58, 46, 16, 9),
        face: { cx: 100, cy: 102, s: 0.95 },
      };
    }
    case "tategami": {
      const ear = ell(66, 52, 11, 11, B);
      return {
        back: shape(scallop(100, 96, 74, 62, 14, 12), A) + ears(ear, mirror(ear)),
        head: MOCHI,
        face: { cx: 100, cy: 100, s: 0.95 },
      };
    }
    case "zukin": {
      const nub = ell(78, 42, 7, 7, A);
      return {
        back: ears(nub, mirror(nub)),
        head: MOCHI,
        // ずきん部分は head の上にクリップして描く
        cap:
          view === "back"
            ? `<rect x="0" y="0" width="200" height="160" fill="${A}"/>`
            : `<path d="M 20 20 H 180 V 150 H 154 C 154 112, 136 84, 100 84 C 64 84, 46 112, 46 150 H 20 Z" fill="${A}"/>`,
        capLine: view === "back" ? "" : line("M 50 132 C 46 106, 64 86, 100 86 C 136 86, 154 106, 150 132", 2.5),
        face: { cx: 100, cy: 108, s: 0.88 },
      };
    }
    case "hoshi": {
      const d = star(100, 98, 70, 36);
      return {
        back: "",
        head: d,
        // 角を丸くするため太い線で縁取り
        headExtra: `<path d="${d}" fill="${OUTLINE}" stroke="${OUTLINE}" stroke-width="20" stroke-linejoin="round"/><path d="${d}" fill="${B}" stroke="${B}" stroke-width="14" stroke-linejoin="round"/>`,
        noOutline: true,
        face: { cx: 100, cy: 104, s: 0.78 },
      };
    }
    case "kuma": {
      const ear = ell(60, 58, 17, 17, B) + `<circle cx="60" cy="58" r="8.5" fill="${mix(B, A, 0.6)}"/>`;
      return {
        back: ears(ear, mirror(ear)),
        head: MOCHI,
        muzzle: true,
        face: { cx: 100, cy: 100, s: 1 },
      };
    }
    case "maru":
    default: {
      const ear = ell(62, 58, 13, 13, B);
      return { back: ears(ear, mirror(ear)), head: MOCHI, face: { cx: 100, cy: 100, s: 1 } };
    }
  }
}

// ---------------------------------------------------------------------------
// 顔パーツ（基準座標: 中心 100,100）
// ---------------------------------------------------------------------------
function eye(x, y, style, expr) {
  switch (expr) {
    case "happy":
      return line(`M ${x - 6} ${y + 2} Q ${x} ${y - 7} ${x + 6} ${y + 2}`, 3, INK);
    case "sleep":
      return line(`M ${x - 6} ${y} Q ${x} ${y + 5} ${x + 6} ${y}`, 3, INK);
    case "sorry":
      return x < 100
        ? line(`M ${x - 5} ${y - 5} L ${x + 4} ${y} L ${x - 5} ${y + 5}`, 3, INK)
        : line(`M ${x + 5} ${y - 5} L ${x - 4} ${y} L ${x + 5} ${y + 5}`, 3, INK);
    case "love":
      return heart(x, y + 1, 0.85, "#ff5c8a");
    case "fun":
      return `<ellipse cx="${x}" cy="${y}" rx="5.8" ry="7" fill="${INK}"/>` + sparkle(x + 1.6, y - 2.2, 0.32, "#fff") + `<circle cx="${x - 2}" cy="${y + 2.6}" r="1.1" fill="#fff"/>`;
  }
  if (style === "dot") return `<ellipse cx="${x}" cy="${y}" rx="3.4" ry="4" fill="${INK}"/>`;
  if (style === "sparkle")
    return `<ellipse cx="${x}" cy="${y}" rx="5.6" ry="6.8" fill="${INK}"/><circle cx="${x + 1.8}" cy="${y - 2.4}" r="2" fill="#fff"/><circle cx="${x - 2}" cy="${y + 2.6}" r="1" fill="#fff"/>`;
  return `<ellipse cx="${x}" cy="${y}" rx="4.8" ry="6" fill="${INK}"/><circle cx="${x + 1.6}" cy="${y - 2.2}" r="1.8" fill="#fff"/>`;
}

function cheek(x, y) {
  return (
    `<ellipse cx="${x}" cy="${y}" rx="9" ry="5.5" fill="#f8b4c2" opacity="0.85"/>` +
    line(`M ${x - 5} ${y + 2} L ${x - 3} ${y - 2} M ${x - 1} ${y + 2} L ${x + 1} ${y - 2} M ${x + 3} ${y + 2} L ${x + 5} ${y - 2}`, 1.3, "#e58599")
  );
}

function mouth(x, y, expr) {
  switch (expr) {
    case "happy":
    case "fun":
    case "love":
      return `<path d="M ${x - 6} ${y} Q ${x} ${y + 11} ${x + 6} ${y} Z" fill="#c7485c" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><path d="M ${x - 3} ${y + 4.5} Q ${x} ${y + 2} ${x + 3} ${y + 4.5} Q ${x} ${y + 8} ${x - 3} ${y + 4.5} Z" fill="#f38ba0"/>`;
    case "sad":
    case "sorry":
      return line(`M ${x - 5} ${y + 4} Q ${x} ${y - 1} ${x + 5} ${y + 4}`, 2.2, INK);
    case "angry":
      return line(`M ${x - 6} ${y + 3} L ${x - 3} ${y} L ${x} ${y + 3} L ${x + 3} ${y} L ${x + 6} ${y + 3}`, 2.2, INK);
    case "sleep":
      return `<ellipse cx="${x}" cy="${y + 2}" rx="2.2" ry="2.6" fill="none" stroke="${INK}" stroke-width="1.8"/>`;
    default:
      return line(`M ${x - 6} ${y} Q ${x - 3} ${y + 4} ${x} ${y} Q ${x + 3} ${y + 4} ${x + 6} ${y}`, 2.2, INK);
  }
}

function nose(x, y, s) {
  if (s.noseStyle === "triangle") return `<path d="M ${x - 4} ${y - 2} L ${x + 4} ${y - 2} L ${x} ${y + 2} Z" fill="${s.noseColor}" stroke="${s.noseColor}" stroke-width="1.5" stroke-linejoin="round"/>`;
  if (s.noseStyle === "dot") return `<ellipse cx="${x}" cy="${y}" rx="2.6" ry="2" fill="${s.noseColor}"/>`;
  return "";
}

function face(s, view, expr, parts) {
  const { cx, cy, s: sc } = parts.face;
  let out = "";
  if (parts.muzzle) {
    const mx = view === "side" ? 128 : 100;
    out += `<ellipse cx="${mx}" cy="109" rx="18" ry="13" fill="${mix(s.bodyColor, "#ffffff", 0.55)}" stroke="${OUTLINE}" stroke-width="2"/>`;
  }
  const eyes = view === "side" ? [128] : [80, 120];
  const mx = view === "side" ? 140 : 100;

  if (expr === "angry") {
    out += eyes.map((x) => line(x < 100 ? `M ${x - 8} ${86} L ${x + 6} ${90}` : `M ${x + 8} ${86} L ${x - 6} ${90}`, 2.6, INK)).join("");
  } else if (expr === "sad" || expr === "sorry") {
    out += eyes.map((x) => line(x < 100 ? `M ${x - 7} ${89} L ${x + 6} ${85}` : `M ${x + 7} ${89} L ${x - 6} ${85}`, 2.4, INK)).join("");
  }
  out += eyes.map((x) => eye(x, 96, s.eyeStyle, expr)).join("");
  if (view === "side") out += cheek(130, 111);
  else out += cheek(66, 110) + cheek(134, 110);
  out += nose(mx, 104, s);
  out += mouth(mx, 108, expr);
  if (expr === "sad") {
    out += eyes.map((x) => `<path d="M ${x + 2} 103 Q ${x + 6} 110 ${x + 2} 113 Q ${x - 2} 110 ${x + 2} 103 Z" fill="#8fd3ff" stroke="#5aaee0" stroke-width="1"/>`).join("");
  }
  return `<g transform="translate(${cx - 100 * sc} ${cy - 100 * sc}) scale(${sc})">${out}</g>`;
}

// ---------------------------------------------------------------------------
// 模様
// ---------------------------------------------------------------------------
function patternSvg(s, view) {
  const c = s.patternColor;
  switch (s.pattern) {
    case "cap":
      return view === "back"
        ? `<rect x="0" y="0" width="200" height="118" fill="${c}"/>`
        : `<path d="M 20 20 H 180 V 78 Q 140 70 100 88 Q 60 70 20 78 Z" fill="${c}"/>`;
    case "eyepatch":
      if (view === "back") return "";
      return view === "side" ? `<ellipse cx="128" cy="94" rx="17" ry="15" fill="${c}"/>` : `<ellipse cx="121" cy="94" rx="19" ry="17" fill="${c}"/>`;
    case "spots":
      return `<circle cx="58" cy="72" r="13" fill="${c}"/><circle cx="146" cy="122" r="11" fill="${c}"/><circle cx="132" cy="56" r="8" fill="${c}"/>`;
    case "muzzle":
      if (view === "back") return "";
      return view === "side" ? `<ellipse cx="136" cy="116" rx="26" ry="18" fill="${c}"/>` : `<ellipse cx="100" cy="118" rx="32" ry="20" fill="${c}"/>`;
    case "stripes":
      return `<path d="M 90 48 L 92 64 M 100 46 L 100 66 M 110 48 L 108 64" stroke="${c}" stroke-width="5" stroke-linecap="round" fill="none"/>`;
    default:
      return "";
  }
}

// ---------------------------------------------------------------------------
// 体・しっぽ・アクセサリー
// ---------------------------------------------------------------------------
function tailSvg(s, x, y, dir) {
  const c = s.pattern === "cap" || s.pattern === "stripes" || s.template === "tategami" ? s.accentColor : s.bodyColor;
  const f = (d) => `<g transform="translate(${x} ${y}) scale(${dir} 1)">${d}</g>`;
  switch (s.tail) {
    case "short":
      return f(ell(0, 0, 9, 8, c));
    case "long":
      return f(shape("M 0 6 C -22 6, -30 -18, -24 -34 C -22 -40, -14 -38, -16 -32 C -20 -18, -14 -4, 2 -6 Z", c));
    case "fluffy":
      return f(shape("M 4 6 C -26 14, -40 -16, -28 -36 C -18 -50, -4 -36, -12 -26 C -18 -14, -8 -4, 4 -8 Z", c));
    case "curly":
      return f(line("M 0 0 C -18 0, -22 -20, -10 -22 C 0 -24, 2 -12, -8 -12", 7, OUTLINE) + line("M 0 0 C -18 0, -22 -20, -10 -22 C 0 -24, 2 -12, -8 -12", 3.5, c));
    default:
      return "";
  }
}

function arm(x, y, rot, s) {
  return ell(x, y, 8.5, 12.5, s.bodyColor, `transform="rotate(${rot} ${x} ${y})"`);
}

function accessorySvg(s, view) {
  const c = s.accessoryColor;
  switch (s.accessory) {
    case "collar":
      return (
        shape("M 70 139 Q 100 152 130 139 L 131 146 Q 100 160 69 146 Z", c) +
        (view === "back" ? "" : `<circle cx="${view === "side" ? 122 : 100}" cy="156" r="5.5" fill="#f6c945" stroke="${OUTLINE}" stroke-width="2"/>`)
      );
    case "scarf":
      return (
        shape("M 66 136 Q 100 154 134 136 L 136 148 Q 100 166 64 148 Z", c) +
        (view === "back" ? "" : shape(`M ${view === "side" ? 112 : 116} 150 L ${view === "side" ? 108 : 112} 176 L ${view === "side" ? 122 : 126} 174 L ${view === "side" ? 124 : 128} 150 Z`, c))
      );
    default:
      return "";
  }
}

function ribbonSvg(s) {
  if (s.accessory !== "ribbon") return "";
  const c = s.accessoryColor;
  return `<g transform="translate(136 56) rotate(18)">${shape("M 0 0 L -16 -9 L -16 9 Z", c)}${shape("M 0 0 L 16 -9 L 16 9 Z", c)}${ell(0, 0, 4.5, 4.5, c)}</g>`;
}

// ---------------------------------------------------------------------------
// デコ（表情・スタンプ用の効果）
// ---------------------------------------------------------------------------
const DECO = {
  anger: () => `<g transform="translate(150 50)" stroke="#e8414f" stroke-width="3.2" stroke-linecap="round" fill="none"><path d="M -9 -3 Q -3 -3 -3 -9 M 3 -9 Q 3 -3 9 -3 M 9 3 Q 3 3 3 9 M -3 9 Q -3 3 -9 3"/></g>`,
  sweat: () => `<path d="M 156 66 Q 166 82 160 88 Q 150 92 150 82 Q 151 74 156 66 Z" fill="#9ad8ff" stroke="#5aaee0" stroke-width="1.5"/>`,
  notes: () => `<text x="150" y="52" font-size="22" font-family="sans-serif" fill="#ff9f43" font-weight="bold">♪</text><text x="30" y="62" font-size="18" font-family="sans-serif" fill="#7bc8f6" font-weight="bold">♫</text>`,
  zzz: () => `<g font-family="sans-serif" font-weight="bold" fill="#7d8ce8"><text x="146" y="58" font-size="16">Z</text><text x="160" y="42" font-size="20">Z</text><text x="176" y="24" font-size="24">Z</text></g>`,
  hearts: () => heart(34, 54, 1.1, "#ff7a9c") + heart(166, 40, 1.4, "#ff5c8a") + heart(176, 78, 0.8, "#ffa3bb"),
  sparkles: () => sparkle(30, 46, 1, "#ffd23f") + sparkle(170, 40, 1.3, "#ffd23f") + sparkle(178, 86, 0.7, "#ffe680"),
  sun: () => `<g transform="translate(172 22)"><circle r="13" fill="#ffc93c" stroke="#f39c12" stroke-width="2"/>${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<line x1="0" y1="-18" x2="0" y2="-24" stroke="#f39c12" stroke-width="3" stroke-linecap="round" transform="rotate(${a})"/>`).join("")}</g>`,
  moon: () => `<path d="M 34 10 A 16 16 0 1 0 50 34 A 12 12 0 1 1 34 10 Z" fill="#ffe27a" stroke="#e8b730" stroke-width="2"/>` + sparkle(60, 14, 0.5, "#ffe27a"),
  motion: () => line("M 170 122 Q 178 112 176 102 M 180 128 Q 190 116 186 104", 2.5, "#b8a99a"),
  bounce: () => line("M 72 202 L 128 202 M 82 208 L 118 208", 2.5, "#c9bcae"),
  question: () => `<text x="150" y="56" font-size="26" font-family="sans-serif" fill="#7f8c9d" font-weight="bold">?</text>`,
  steam: () => line("M 150 150 q 4 -6 0 -12 q -4 -6 0 -12 M 160 150 q 4 -6 0 -12 q -4 -6 0 -12", 2.2, "#c9bcae"),
};

// ---------------------------------------------------------------------------
// メイン: キャラクターSVG
// opts.view: front | side | back
// opts.expr: normal | happy | angry | sad | fun | sleep | love | sorry
// opts.pose: stand | wave | banzai | jump | sit | sleep | heart | bow | cup
// opts.deco: DECO のキー配列
// ---------------------------------------------------------------------------
export function renderCharacterSVG(rawSpec, opts = {}) {
  const s = normalizeSpec(rawSpec);
  const view = opts.view || "front";
  const expr = opts.expr || "normal";
  const pose = opts.pose || "stand";
  const deco = opts.deco || [];
  const id = `c${++uid}`;
  const parts = templateParts(s, view);

  // 体の位置
  const bodyY = pose === "sit" ? 166 : 162;
  const bodyRx = view === "side" ? 36 : 34;
  let tailBehind = "";
  let tailFront = "";
  if (view === "side") tailBehind = tailSvg(s, 70, 172, 1);
  else if (view === "back") tailFront = tailSvg(s, 100, 178, 1);
  else if (s.tail === "long" || s.tail === "fluffy" || s.tail === "curly") tailBehind = tailSvg(s, 128, 176, -1);

  // 腕
  let armsFront = "";
  if (view === "side") {
    armsFront = pose === "wave" || pose === "banzai" || pose === "jump" ? arm(112, 132, -150, s) : arm(112, 162, -15, s);
  } else {
    switch (pose) {
      case "wave":
        armsFront = arm(68, 162, 20, s) + arm(156, 134, -135, s);
        break;
      case "banzai":
      case "jump":
        armsFront = arm(44, 134, 135, s) + arm(156, 134, -135, s);
        break;
      case "heart":
      case "bow":
      case "cup":
        armsFront = arm(86, 158, -30, s) + arm(114, 158, 30, s);
        break;
      case "sleep":
        armsFront = arm(76, 164, 50, s) + arm(124, 164, -50, s);
        break;
      default:
        armsFront = arm(68, 162, 20, s) + arm(132, 162, -20, s);
    }
  }

  const feet =
    pose === "sit"
      ? ell(80, 188, 12, 8, s.bodyColor) + ell(120, 188, 12, 8, s.bodyColor)
      : view === "side"
        ? ell(88, 186, 10, 6.5, s.bodyColor) + ell(118, 186, 10, 6.5, s.bodyColor)
        : ell(84, 186, 10, 6.5, s.bodyColor) + ell(116, 186, 10, 6.5, s.bodyColor);

  // 頭
  const headFill = parts.noOutline ? `<path d="${parts.head}" fill="${s.bodyColor}"/>` : shape(parts.head, s.bodyColor);
  const clipped = (parts.cap || "") + patternSvg(s, view);
  const headOutlineOnTop = parts.noOutline ? "" : `<path d="${parts.head}" fill="none" stroke="${OUTLINE}" stroke-width="${SW}" stroke-linejoin="round"/>`;
  const headGroup =
    (parts.back || "") +
    (parts.headExtra || "") +
    headFill +
    (clipped ? `<g clip-path="url(#${id}h)">${clipped}</g>` : "") +
    headOutlineOnTop +
    (parts.capLine || "") +
    (parts.front || "") +
    (view === "back" ? "" : face(s, view, expr, parts)) +
    ribbonSvg(s);

  const headTilt = pose === "bow" ? -12 : pose === "sleep" ? 10 : pose === "heart" ? -6 : 0;
  const lift = pose === "jump" ? -14 : 0;

  const extra = [];
  if (pose === "heart") extra.push(heart(100, 162, 1.6, "#ff5c8a", OUTLINE));
  if (pose === "cup") extra.push(`<g transform="translate(100 160)">${shape("M -11 -8 H 11 V 4 Q 11 11 0 11 Q -11 11 -11 4 Z", "#ffffff")}${line("M 11 -4 Q 18 -4 17 2 Q 16 6 11 5", 2.5)}<rect x="-11" y="-8" width="22" height="5" fill="#9fd88a"/></g>`);
  if (pose === "jump") deco.push("bounce");
  if (pose === "wave" && view !== "side") extra.push(DECO.motion());

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -10 ${VIEW_W} ${VIEW_H}" width="${opts.width || VIEW_W}" height="${opts.height || VIEW_H}">` +
    `<defs><clipPath id="${id}h"><path d="${parts.head}"/></clipPath></defs>` +
    `<g transform="translate(0 ${lift})">` +
    tailBehind +
    ell(100, bodyY, bodyRx, 26, s.bodyColor) +
    (view === "back" && s.pattern === "spots" ? `<circle cx="112" cy="160" r="8" fill="${s.patternColor}"/>` : "") +
    feet +
    tailFront +
    accessorySvg(s, view) +
    `<g transform="rotate(${headTilt} 100 140)">${headGroup}</g>` +
    armsFront +
    extra.join("") +
    `</g>` +
    deco.map((k) => (DECO[k] ? DECO[k]() : "")).join("") +
    `</svg>`;
  return svg;
}

// SVG文字列 → Image
export function svgToImage(svg) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
}

export function templateLabel(id) {
  return (TEMPLATES.find((t) => t.id === id) || TEMPLATES[0]).label;
}
