const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const outputDir = path.join(__dirname, "card-pngs");
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

const suits = [
  { name: "spades", symbol: "♠", color: "#001d5a" },
  { name: "clubs", symbol: "♣", color: "#001d5a" },
  { name: "hearts", symbol: "♥", color: "#e40056" },
  { name: "diamonds", symbol: "♦", color: "#e40056" },
];

async function generateCards() {
  for (const rank of ranks) {
    for (const suit of suits) {
      const isTen = rank === "10";

      const svg = `
<svg width="120" height="70" viewBox="0 0 120 70" xmlns="http://www.w3.org/2000/svg">
  <rect
    x="2"
    y="2"
    width="116"
    height="66"
    rx="14"
    ry="14"
    fill="white"
    stroke="#dddddd"
    stroke-width="3"
  />

  <text
    x="${isTen ? 42 : 46}"
    y="45"
    text-anchor="middle"
    font-family="Arial, sans-serif"
    font-size="${isTen ? 36 : 42}"
    font-weight="800"
    fill="${suit.color}"
  >${rank}</text>

  <text
    x="${isTen ? 78 : 73}"
    y="43"
    text-anchor="middle"
    font-family="Arial, sans-serif"
    font-size="30"
    font-weight="800"
    fill="${suit.color}"
  >${suit.symbol}</text>
</svg>`.trim();

      await sharp(Buffer.from(svg))
        .png()
        .toFile(path.join(outputDir, `${rank}_${suit.name}.png`));
    }
  }

  console.log("Generated 52 PNG card icons!");
}

generateCards();