// キャラクターシートとスタンプを canvas で組み立てる
import { renderCharacterSVG, svgToImage, normalizeSpec, templateLabel, VIEW_W, VIEW_H } from "./render.js";

export const FONT = '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Hiragino Sans", "Meiryo", sans-serif';

export async function ensureFont() {
  try {
    await Promise.all([document.fonts.load(`800 40px "M PLUS Rounded 1c"`, "あ"), document.fonts.load(`500 20px "M PLUS Rounded 1c"`, "あ")]);
  } catch {
    /* フォントが読めなくても代替フォントで続行 */
  }
}

async function drawChar(ctx, spec, opts, x, y, w, h) {
  // アスペクト比を保って (x,y,w,h) の中央に描く
  const scale = Math.min(w / VIEW_W, h / VIEW_H);
  const dw = VIEW_W * scale, dh = VIEW_H * scale;
  const svg = renderCharacterSVG(spec, { ...opts, width: Math.round(dw * 2), height: Math.round(dh * 2) });
  const img = await svgToImage(svg);
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// キャラクターシート
// ---------------------------------------------------------------------------
export const SHEET_VIEWS = [
  { label: "前", opts: { view: "front" } },
  { label: "横", opts: { view: "side" } },
  { label: "後ろ", opts: { view: "back" } },
];
export const SHEET_EXPRESSIONS = [
  { label: "喜", opts: { expr: "happy", deco: ["sparkles"] } },
  { label: "怒", opts: { expr: "angry", deco: ["anger"] } },
  { label: "哀", opts: { expr: "sad" } },
  { label: "楽", opts: { expr: "fun", deco: ["notes"] } },
];
export const SHEET_POSES = [
  { label: "手をふる", opts: { expr: "happy", pose: "wave" } },
  { label: "ジャンプ", opts: { expr: "fun", pose: "jump" } },
  { label: "おすわり", opts: { pose: "sit" } },
  { label: "ねむねむ", opts: { expr: "sleep", pose: "sleep", deco: ["zzz"] } },
];

export async function renderSheet(canvas, rawSpec, name) {
  await ensureFont();
  const spec = normalizeSpec(rawSpec);
  const W = 1600, H = 1420, M = 40, G = 20;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fffdf8";
  ctx.fillRect(0, 0, W, H);

  // タイトル
  ctx.fillStyle = "#5b4b45";
  ctx.font = `800 48px ${FONT}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(`${name || "うちの子"}  キャラクターシート`, M, 78);
  ctx.font = `500 22px ${FONT}`;
  ctx.fillStyle = "#9a8a80";
  ctx.fillText(`テンプレート：${templateLabel(spec.template)}`, M, 112);

  const cw = (W - M * 2 - G * 3) / 4;

  const cell = async (x, y, w, h, label, opts) => {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#efe2d2";
    ctx.lineWidth = 3;
    roundRect(ctx, x, y, w, h, 22);
    ctx.fill();
    ctx.stroke();
    await drawChar(ctx, spec, opts, x + 12, y + 10, w - 24, h - 58);
    ctx.fillStyle = "#5b4b45";
    ctx.font = `800 26px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(label, x + w / 2, y + h - 18);
    ctx.textAlign = "left";
  };

  const section = (y, text) => {
    ctx.fillStyle = "#e8a87c";
    roundRect(ctx, M, y - 26, 8, 32, 4);
    ctx.fill();
    ctx.fillStyle = "#5b4b45";
    ctx.font = `800 28px ${FONT}`;
    ctx.fillText(text, M + 20, y);
  };

  // 1段目: 三面図 + 情報
  let y = 170;
  section(y, "三面図");
  y += 22;
  const h1 = 400;
  for (let i = 0; i < 3; i++) await cell(M + i * (cw + G), y, cw, h1, SHEET_VIEWS[i].label, SHEET_VIEWS[i].opts);

  // 情報パネル
  const ix = M + 3 * (cw + G);
  ctx.fillStyle = "#fff6ea";
  roundRect(ctx, ix, y, cw, h1, 22);
  ctx.fill();
  ctx.fillStyle = "#5b4b45";
  ctx.font = `800 24px ${FONT}`;
  ctx.fillText("カラー", ix + 24, y + 46);
  const swatches = [
    ["からだ", spec.bodyColor],
    ["サブ", spec.accentColor],
  ];
  if (spec.pattern !== "none") swatches.push(["もよう", spec.patternColor]);
  if (spec.accessory !== "none") swatches.push(["こもの", spec.accessoryColor]);
  swatches.forEach(([lab, col], i) => {
    const sx = ix + 24 + i * 80;
    ctx.fillStyle = col;
    ctx.strokeStyle = "#5b4b45";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx + 26, y + 86, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#7a6a60";
    ctx.font = `500 16px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(lab, sx + 26, y + 130);
    ctx.textAlign = "left";
  });
  ctx.fillStyle = "#5b4b45";
  ctx.font = `800 24px ${FONT}`;
  ctx.fillText("とくちょう", ix + 24, y + 182);
  ctx.font = `500 20px ${FONT}`;
  let ty = y + 216;
  for (const f of spec.features.length ? spec.features : ["シンプル"]) {
    ty = wrapText(ctx, `・${f}`, ix + 24, ty, cw - 48, 28) + 6;
  }
  if (spec.personality) {
    ctx.font = `800 24px ${FONT}`;
    ctx.fillText("せいかく", ix + 24, ty + 22);
    ctx.font = `500 20px ${FONT}`;
    wrapText(ctx, spec.personality, ix + 24, ty + 54, cw - 48, 28, y + h1 - 16);
  }

  // 2段目: 表情
  y += h1 + 66;
  section(y, "表情（喜怒哀楽）");
  y += 22;
  const h2 = 330;
  for (let i = 0; i < 4; i++) await cell(M + i * (cw + G), y, cw, h2, SHEET_EXPRESSIONS[i].label, SHEET_EXPRESSIONS[i].opts);

  // 3段目: ポーズ
  y += h2 + 66;
  section(y, "ポーズ");
  y += 22;
  for (let i = 0; i < 4; i++) await cell(M + i * (cw + G), y, cw, h2, SHEET_POSES[i].label, SHEET_POSES[i].opts);
}

function wrapText(ctx, text, x, y, maxW, lh, maxY = Infinity) {
  let lineStr = "";
  for (const ch of text) {
    if (ctx.measureText(lineStr + ch).width > maxW && lineStr) {
      if (y > maxY) return y;
      ctx.fillText(lineStr, x, y);
      lineStr = ch;
      y += lh;
    } else lineStr += ch;
  }
  if (lineStr && y <= maxY) ctx.fillText(lineStr, x, y);
  return y + lh;
}

// ---------------------------------------------------------------------------
// スタンプ（LINE規定: 最大 370x320 / メイン 240x240 / タブ 96x74、透過PNG）
// ---------------------------------------------------------------------------
export const STAMPS = [
  { text: "おはよう", color: "#f39c12", opts: { expr: "happy", pose: "wave", deco: ["sun"] } },
  { text: "おやすみ", color: "#6c7ae0", opts: { expr: "sleep", pose: "sleep", deco: ["moon", "zzz"] } },
  { text: "ありがとう", color: "#ff6f91", opts: { expr: "happy", pose: "bow", deco: ["sparkles"] } },
  { text: "OK！", color: "#2fb37a", opts: { expr: "fun", pose: "banzai", deco: ["sparkles"] } },
  { text: "ごめんね", color: "#7f8c9d", opts: { expr: "sorry", pose: "bow", deco: ["sweat"] } },
  { text: "おつかれさま", color: "#c0814a", opts: { expr: "happy", pose: "cup", deco: ["steam"] } },
  { text: "よろしくね", color: "#e8743b", opts: { expr: "fun", pose: "wave", deco: ["notes"] } },
  { text: "だいすき", color: "#ff4f81", opts: { expr: "love", pose: "heart", deco: ["hearts"] } },
];

export async function renderStamp(canvas, rawSpec, stamp, W = 370, H = 320) {
  await ensureFont();
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, W, H);
  const pad = 10; // LINE推奨の余白
  const textH = stamp.text ? Math.round(H * 0.24) : 0;
  await drawChar(ctx, rawSpec, stamp.opts, pad, pad, W - pad * 2, H - pad * 2 - textH + 8);
  if (stamp.text) drawStampText(ctx, stamp.text, stamp.color, W / 2, H - pad - textH / 2 + 4, W - pad * 2 - 8, textH);
}

function drawStampText(ctx, text, color, cx, cy, maxW, maxH) {
  let size = Math.min(maxH * 0.9, 58);
  ctx.font = `800 ${size}px ${FONT}`;
  while (ctx.measureText(text).width > maxW - size * 0.3 && size > 14) {
    size -= 2;
    ctx.font = `800 ${size}px ${FONT}`;
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#5b4b45";
  ctx.lineWidth = size * 0.32;
  ctx.strokeText(text, cx, cy);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = size * 0.2;
  ctx.strokeText(text, cx, cy);
  ctx.fillStyle = color;
  ctx.fillText(text, cx, cy);
}

export async function renderMain(canvas, spec) {
  // メイン画像: 文字なし・ハッピー顔
  await renderStamp(canvas, spec, { text: "", opts: { expr: "happy", deco: ["sparkles"] } }, 240, 240);
}

export async function renderTab(canvas, spec) {
  // タブ画像: 顔のアップ
  canvas.width = 96;
  canvas.height = 74;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 96, 74);
  const svg = renderCharacterSVG(spec, { expr: "happy", width: 400, height: 440 });
  const img = await svgToImage(svg);
  // 頭部分（viewBox 上部）を切り出して描画
  const sx = (20 / VIEW_W) * img.width, sy = (0 / VIEW_H) * img.height;
  const sw = (160 / VIEW_W) * img.width, sh = (160 / VIEW_H) * img.height;
  const scale = Math.min(92 / sw, 72 / sh);
  ctx.drawImage(img, sx, sy, sw, sh, (96 - sw * scale) / 2, (74 - sh * scale) / 2, sw * scale, sh * scale);
}
