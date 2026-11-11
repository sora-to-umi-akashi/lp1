import { TEMPLATES, normalizeSpec, templateLabel } from "./render.js";
import { renderSheet, renderStamp, renderMain, renderTab, STAMPS } from "./compose.js";

const $ = (id) => document.getElementById(id);
const state = {
  images: [], // { media_type, data, url }
  name: "",
  spec: null,
  stamps: STAMPS.map((s) => ({ ...s })),
};

// ---------------------------------------------------------------------------
// 共通 UI
// ---------------------------------------------------------------------------
function showStep(n) {
  for (const i of [1, 2, 3]) $(`step${i}`).hidden = i !== n;
  document.querySelectorAll(".steps li").forEach((li) => li.classList.toggle("active", Number(li.dataset.step) === n));
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function loading(on, text = "生成中…") {
  $("loading").hidden = !on;
  $("loadingText").textContent = text;
}
let toastTimer;
function toast(msg) {
  $("toast").textContent = msg;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("toast").hidden = true), 4000);
}

// ---------------------------------------------------------------------------
// STEP 1: 写真と名前
// ---------------------------------------------------------------------------
async function resizeImage(file, max = 1024) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("画像を読み込めませんでした（HEIC は JPEG に変換してください）"));
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const dataUrl = c.toDataURL("image/jpeg", 0.85);
    return { media_type: "image/jpeg", data: dataUrl.split(",")[1], url: dataUrl };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function addFiles(fileList) {
  const files = [...fileList].filter((f) => f.type.startsWith("image/"));
  for (const f of files) {
    if (state.images.length >= 3) {
      toast("写真は3枚までです");
      break;
    }
    try {
      state.images.push(await resizeImage(f));
    } catch (e) {
      toast(e.message);
    }
  }
  renderThumbs();
}

function renderThumbs() {
  const box = $("thumbs");
  box.innerHTML = "";
  state.images.forEach((img, i) => {
    const d = document.createElement("div");
    d.className = "thumb";
    d.innerHTML = `<img alt="写真${i + 1}" /><button aria-label="削除">✕</button>`;
    d.querySelector("img").src = img.url;
    d.querySelector("button").onclick = () => {
      state.images.splice(i, 1);
      renderThumbs();
    };
    box.appendChild(d);
  });
  updateGenerateButton();
}

function updateGenerateButton() {
  $("btnGenerate").disabled = !(state.images.length >= 1 && $("petName").value.trim());
}

$("files").addEventListener("change", (e) => {
  addFiles(e.target.files);
  e.target.value = "";
});
const drop = $("drop");
drop.addEventListener("dragover", (e) => {
  e.preventDefault();
  drop.classList.add("over");
});
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  drop.classList.remove("over");
  addFiles(e.dataTransfer.files);
});
$("petName").addEventListener("input", updateGenerateButton);

async function callAnalyze(extra = {}) {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      images: state.images.map(({ media_type, data }) => ({ media_type, data })),
      name: state.name,
      ...extra,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `エラー (${res.status})`);
  return json.spec;
}

$("btnGenerate").addEventListener("click", async () => {
  state.name = $("petName").value.trim();
  loading(true, "AIがうちの子の特徴を観察中…");
  try {
    state.spec = await callAnalyze();
    await showSheet();
  } catch (e) {
    toast(e.message);
  } finally {
    loading(false);
  }
});

// API キーなしのお試し
$("btnDemo").addEventListener("click", async () => {
  state.name = $("petName").value.trim() || "うちの子";
  const r = (a) => a[Math.floor(Math.random() * a.length)];
  const palette = ["#fffaf2", "#f6e3c6", "#e8c39e", "#d9a679", "#c9c4c0", "#5a5560", "#fbe9d0"];
  state.spec = {
    template: r(TEMPLATES).id,
    templateReason: "お試しモードのためランダムに選びました。",
    bodyColor: r(palette),
    accentColor: r(palette),
    pattern: r(["none", "cap", "eyepatch", "spots", "muzzle", "stripes"]),
    patternColor: r(["#b8865b", "#7a5a48", "#fffdf8", "#e0b07a"]),
    eyeStyle: r(["dot", "round", "sparkle"]),
    noseStyle: r(["none", "dot", "triangle"]),
    noseColor: "#3b302c",
    tail: r(["none", "short", "long", "fluffy", "curly"]),
    accessory: r(["none", "collar", "ribbon", "scarf"]),
    accessoryColor: r(["#e85d75", "#4aa3df", "#f6c945"]),
    features: ["お試しキャラ"],
    personality: "マイペース",
  };
  await showSheet();
});

fetch("/api/status")
  .then((r) => r.json())
  .then((s) => ($("keyHint").hidden = s.hasKey))
  .catch(() => ($("keyHint").hidden = false));

// ---------------------------------------------------------------------------
// STEP 2: キャラクターシート
// ---------------------------------------------------------------------------
const sel = $("templateSelect");
TEMPLATES.forEach((t) => sel.add(new Option(t.label, t.id)));

async function showSheet() {
  const spec = normalizeSpec(state.spec);
  state.spec = { ...state.spec, template: spec.template };
  sel.value = spec.template;
  $("reason").textContent = `テンプレート「${templateLabel(spec.template)}」${spec.templateReason ? "：" + spec.templateReason : ""}`;
  showStep(2);
  await renderSheet($("sheet"), state.spec, state.name);
}

sel.addEventListener("change", async () => {
  state.spec = { ...state.spec, template: sel.value, templateReason: "手動で変更しました。" };
  await showSheet();
});

$("chips").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (b) b.classList.toggle("on");
});

$("btnRegen").addEventListener("click", async () => {
  if (!state.images.length) return toast("お試しモードでは再生成できません。写真を追加してください。");
  const picked = [...document.querySelectorAll("#chips button.on")].map((b) => b.dataset.text);
  const free = $("instruction").value.trim();
  const instruction = [...picked, free].filter(Boolean).join("。");
  if (!instruction) return toast("修正したい内容をえらぶか、入力してください");
  loading(true, "指示にあわせて描き直し中…");
  try {
    state.spec = await callAnalyze({ previous: state.spec, instruction });
    document.querySelectorAll("#chips button.on").forEach((b) => b.classList.remove("on"));
    $("instruction").value = "";
    await showSheet();
  } catch (e) {
    toast(e.message);
  } finally {
    loading(false);
  }
});

$("btnSaveSheet").addEventListener("click", () => downloadCanvas($("sheet"), `${state.name || "pet"}_sheet.png`));
$("back1").addEventListener("click", () => showStep(1));

// ---------------------------------------------------------------------------
// STEP 3: スタンプ
// ---------------------------------------------------------------------------
async function showStamps() {
  showStep(3);
  const box = $("stamps");
  box.innerHTML = "";
  for (const st of state.stamps) {
    const wrap = document.createElement("div");
    wrap.className = "stamp";
    const canvas = document.createElement("canvas");
    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = 12;
    input.value = st.text;
    let t;
    input.addEventListener("input", () => {
      st.text = input.value;
      clearTimeout(t);
      t = setTimeout(() => renderStamp(canvas, state.spec, st), 200);
    });
    wrap.append(canvas, input);
    box.appendChild(wrap);
    st.canvas = canvas;
    await renderStamp(canvas, state.spec, st);
  }
  await renderMain($("mainImg"), state.spec);
  await renderTab($("tabImg"), state.spec);
}

$("btnStamps").addEventListener("click", async () => {
  loading(true, "スタンプを作成中…");
  try {
    await showStamps();
  } finally {
    loading(false);
  }
});
$("back2").addEventListener("click", () => showStep(2));

const toBlob = (c) => new Promise((res) => c.toBlob(res, "image/png"));

function downloadBlob(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
async function downloadCanvas(canvas, filename) {
  downloadBlob(await toBlob(canvas), filename);
}

$("btnZip").addEventListener("click", async () => {
  if (!window.JSZip) return toast("ZIPライブラリを読み込めませんでした");
  loading(true, "ZIPを作成中…");
  try {
    const zip = new window.JSZip();
    for (let i = 0; i < state.stamps.length; i++) {
      zip.file(`${String(i + 1).padStart(2, "0")}.png`, await toBlob(state.stamps[i].canvas));
    }
    zip.file("main.png", await toBlob($("mainImg")));
    zip.file("tab.png", await toBlob($("tabImg")));
    zip.file("character_sheet.png", await toBlob($("sheet")));
    downloadBlob(await zip.generateAsync({ type: "blob" }), `${state.name || "pet"}_stamps.zip`);
  } catch (e) {
    toast(e.message);
  } finally {
    loading(false);
  }
});
