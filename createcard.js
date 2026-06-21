const generateImage = require("./generatePlaceholder");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const FILE_PATH = path.join(__dirname, "data", "cards.js");

const rarityPrefixes = {
  COMMON: "C",
  EPIC: "E",
  SECRET: "S",
  NIGHTMARE: "N",
  APEX: "A"
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

function escapeString(text) {
  return text.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function loadCards() {
  delete require.cache[require.resolve(FILE_PATH)];
  return require(FILE_PATH);
}

async function main() {
  const seasonInput = await ask("Season number: ");
  const season = Number(seasonInput);

  if (!Number.isInteger(season) || season <= 0) {
    console.log("❌ Invalid season.");
    rl.close();
    return;
  }

  console.log(`\n✅ Adding cards to Season ${season}.`);
  console.log("Type STOP as the card name when you're finished.\n");

  while (true) {
    const name = await ask("Card Name: ");

    if (["stop", "exit", "done", "q"].includes(name.trim().toLowerCase())) {
      console.log("👋 Finished creating cards.");
      rl.close();
      return;
    }

    let rarity = await ask("Rarity (COMMON, EPIC, SECRET, NIGHTMARE, APEX): ");
    const priceInput = await ask("Price: ");

    rarity = rarity.trim().toUpperCase();
    const price = Number(priceInput);

    if (!rarityPrefixes[rarity]) {
      console.log("❌ Invalid rarity. Try this card again.\n");
      continue;
    }

    if (!Number.isInteger(price) || price <= 0) {
      console.log("❌ Invalid price. Try this card again.\n");
      continue;
    }

    const cards = loadCards();
    const prefix = rarityPrefixes[rarity];
    const rarityCards = cards[rarity] || [];

    let highest = 0;

    for (const card of rarityCards) {
      if (Number(card.season) !== season) continue;
      if (!String(card.id).startsWith(prefix)) continue;

      const num = Number(String(card.id).slice(prefix.length));
      if (num > highest) highest = num;
    }

    const newId = `${prefix}${highest + 1}`;

    const newCardBlock = `
        {
            season: ${season},
            id: '${newId}',
            name: '${escapeString(name)}',
            price: ${price},
            rarity: '${rarity}'
        }`;

    const fileContent = fs.readFileSync(FILE_PATH, "utf8");

    const arrayRegex = new RegExp(`(["']?${rarity}["']?\\s*:\\s*\\[)([\\s\\S]*?)(\\n\\s*\\])`);

    if (!arrayRegex.test(fileContent)) {
      console.log(`❌ Could not find ${rarity}: [] in data/cards.js`);
      continue;
    }

    const updatedContent = fileContent.replace(arrayRegex, (match, start, body, end) => {
      const hasCards = body.trim().length > 0;
      return `${start}${body}${hasCards ? "," : ""}${newCardBlock}${end}`;
    });

    fs.writeFileSync(FILE_PATH, updatedContent);

    console.log("\n✅ Card created!");
    console.log(`Season: ${season}`);
    console.log(`ID: ${newId}`);
    console.log(`Name: ${name}`);
    console.log(`Rarity: ${rarity}`);
    console.log(`Price: ${price}`);

    const seasonFolder = path.join(__dirname, "images", `S${season}`);
    const seasonImagePath = path.join(seasonFolder, `${newId}.png`);
    const oldImagePath = path.join(__dirname, "images", `${newId}.png`);

    fs.mkdirSync(seasonFolder, { recursive: true });

    if (!fs.existsSync(seasonImagePath)) {
      await generateImage(newId, name, rarity.toLowerCase());

      if (fs.existsSync(oldImagePath)) {
        fs.renameSync(oldImagePath, seasonImagePath);
      }
    }

    console.log(`🖼️ Image path: images/S${season}/${newId}.png\n`);
  }
}

main();