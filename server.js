// ウチのペットLINEスタンプメーカー - ローカルサーバー
// APIキーをブラウザに出さないよう、Claude API 呼び出しはこのサーバーで行う。
//   ANTHROPIC_API_KEY=sk-... npm start  →  http://localhost:3000
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const PUBLIC_DIR = path.join(here, "public");
const JSZIP_PATH = require.resolve("jszip/dist/jszip.min.js");
const PORT = Number(process.env.PORT || 3000);
const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
const MAX_BODY = 25 * 1024 * 1024;

// ---------------------------------------------------------------------------
// キャラクター仕様のスキーマ（フロントの render.js と対応）
// ---------------------------------------------------------------------------
const TEMPLATES = [
  "maru", // まるみみ
  "neko", // ねこみみ
  "usagi", // うさみみ
  "manju", // まんじゅう
  "fuwa", // ふわみみ
  "moko", // もこもこ
  "tategami", // たてがみ
  "zukin", // ずきん
  "hoshi", // ほし
  "kuma", // くま
];

const hex = (desc) => z.string().describe(`${desc}。#RRGGBB 形式`);

const CharacterSpec = z.object({
  template: z.enum(TEMPLATES).describe("顔テンプレートID"),
  templateReason: z.string().describe("そのテンプレートを選んだ理由（日本語・1文）"),
  bodyColor: hex("顔と体のベース色（いちばん面積の大きい毛色）"),
  accentColor: hex("耳・たてがみ・ずきん等のサブ色"),
  pattern: z
    .enum(["none", "cap", "eyepatch", "spots", "muzzle", "stripes"])
    .describe("模様。none=無地, cap=頭の上だけ色が違う, eyepatch=片目のまわりにブチ, spots=ブチ模様, muzzle=口まわりが白っぽい, stripes=しま模様"),
  patternColor: hex("模様の色"),
  eyeStyle: z.enum(["dot", "round", "sparkle"]).describe("目の形。dot=小さい点, round=つぶらな丸, sparkle=キラキラ"),
  noseStyle: z.enum(["none", "dot", "triangle"]).describe("鼻"),
  noseColor: hex("鼻の色"),
  tail: z.enum(["none", "short", "long", "fluffy", "curly"]).describe("しっぽ（横・後ろ姿で描画）"),
  accessory: z.enum(["none", "collar", "ribbon", "scarf"]).describe("写真で身につけている物。なければ none"),
  accessoryColor: hex("アクセサリーの色"),
  features: z.array(z.string()).describe("キャラに反映した特徴（日本語・短く・最大3つ）"),
  personality: z.string().describe("写真から想像した性格のひとこと（日本語）"),
});

const SYSTEM_PROMPT = `あなたはペットの写真から、ゆるくてシンプルな「まんまる顔」のマスコットキャラを設計するデザイナーです。
出力はキャラクター仕様のJSONだけです。描画はプログラムが行うため、あなたは以下を決めます。

## 顔テンプレート（必ず1つ選ぶ）
- maru: まるみみ。小さな丸い耳。ハムスター・ねずみ・短毛の子・迷ったとき
- neko: ねこみみ。三角の耳。猫全般、立ち耳の犬（柴など）
- usagi: うさみみ。長い耳。うさぎ、耳の長い犬
- manju: まんじゅう。耳なしのおまんじゅう形。耳がほぼ見えない子、鳥、ハリネズミ、小動物
- fuwa: ふわみみ。ふわっと外向きの耳。チワワ・パピヨン・ポメ・モモンガ系
- moko: もこもこ。もこもこの輪郭。プードル・ビション・ヒツジ系、長いたれ耳の犬
- tategami: たてがみ。顔のまわりにたてがみ。長毛の猫・犬、ライオンカット
- zukin: ずきん。頭からほっぺまでサブ色のずきんをかぶったような形。顔の外周の色が違う子、フェレット、カメ
- hoshi: ほし。星形。キラキラした子、どうしても当てはまらない子の遊び枠（めったに選ばない）
- kuma: くま。丸く大きめの耳とマズル。トイプードルのテディベアカット、くまっぽい子

## ルール
- なるべくシンプルに。模様は1種類まで、アクセサリーは写真で実際に身につけているときだけ。
- 色は写真の実際の毛色を、パステル寄りにやさしく調整した色にする。真っ黒の子は濃いグレー(#4a4a52 など)にする。
- 白い子の bodyColor は #ffffff ではなく少しだけ色味のある白（#fffdf8 など）。
- features には「茶色の頭」「片目のブチ」など、反映した見た目の特徴を短く書く。
- 修正指示が来たら、前回の仕様をベースに指示に沿って変更する。「顔が違う」「テンプレートを変えて」系の指示なら必ず前回と違う template を選ぶ。`;

// ---------------------------------------------------------------------------
// Claude 呼び出し
// ---------------------------------------------------------------------------
let client = null;
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

async function analyze({ images, name, previous, instruction }) {
  if (!Array.isArray(images) || images.length < 1 || images.length > 3) {
    throw httpError(400, "画像は1〜3枚添付してください。");
  }
  const content = [];
  images.forEach((img, i) => {
    if (!img || typeof img.data !== "string" || !/^image\/(jpeg|png|webp|gif)$/.test(img.media_type)) {
      throw httpError(400, "画像の形式が正しくありません。");
    }
    content.push({ type: "text", text: `写真${i + 1}:` });
    content.push({ type: "image", source: { type: "base64", media_type: img.media_type, data: img.data } });
  });

  let text = `ペットの名前は「${String(name || "").slice(0, 30)}」です。上の写真から、この子のキャラクター仕様を作ってください。`;
  if (previous) {
    text += `\n\n## 前回の仕様\n${JSON.stringify(previous, null, 2)}`;
    text += `\n\n## 修正の指示\n${String(instruction || "もう少し特徴を捉えて").slice(0, 500)}`;
    text += `\n\n前回の仕様をベースに、指示に沿って修正した仕様を出してください。`;
  }
  content.push({ type: "text", text });

  const response = await getClient().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content }],
    output_config: { effort: "medium", format: betaZodOutputFormat(CharacterSpec) },
  });

  if (response.stop_reason === "refusal") {
    throw httpError(422, "この画像ではキャラクターを作れませんでした。別の写真で試してください。");
  }
  if (response.stop_reason === "max_tokens" || !response.parsed_output) {
    throw httpError(502, "AIの応答を読み取れませんでした。もう一度お試しください。");
  }
  return response.parsed_output;
}

// ---------------------------------------------------------------------------
// HTTP サーバー
// ---------------------------------------------------------------------------
function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(httpError(413, "画像が大きすぎます。"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(httpError(400, "リクエストが不正です。"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

async function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  let filePath;
  if (url.pathname === "/vendor/jszip.min.js") filePath = JSZIP_PATH;
  else {
    const rel = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
    filePath = path.join(PUBLIC_DIR, rel);
    if (!filePath.startsWith(PUBLIC_DIR + path.sep)) return sendJson(res, 403, { error: "forbidden" });
  }
  try {
    const data = await fs.readFile(filePath);
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/api/status") {
      return sendJson(res, 200, { hasKey: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN), model: MODEL });
    }
    if (req.method === "POST" && req.url === "/api/analyze") {
      const body = await readJson(req);
      const spec = await analyze(body);
      return sendJson(res, 200, { spec });
    }
    if (req.method === "GET") return serveStatic(req, res);
    sendJson(res, 405, { error: "method not allowed" });
  } catch (err) {
    let status = err.status || 500;
    let message = err.message || "エラーが発生しました。";
    if (err instanceof Anthropic.AuthenticationError) message = "APIキーが無効です。ANTHROPIC_API_KEY を確認してください。";
    else if (err instanceof Anthropic.RateLimitError) message = "混み合っています。少し待ってから再度お試しください。";
    else if (err instanceof Anthropic.APIError) message = `Claude API エラー: ${err.message}`;
    else if (/api key|apiKey|authentication/i.test(String(err.message))) {
      status = 500;
      message = "APIキーが設定されていません。ANTHROPIC_API_KEY を設定してサーバーを再起動してください。";
    }
    console.error(err);
    sendJson(res, status, { error: message });
  }
});

server.listen(PORT, () => {
  console.log(`🐾 ペットLINEスタンプメーカー: http://localhost:${PORT}`);
});
