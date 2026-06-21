const fs = require('fs');
const readline = require('readline');

const FILE_PATH = './data/cards.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function main() {

  const cardId = (await ask('Enter Card ID to delete (e.g. C3): ')).toUpperCase();

  // Load actual JS object
  delete require.cache[require.resolve(FILE_PATH)];
  const cardsData = require(FILE_PATH);

  let found = false;

  // Loop through rarities
  for (const rarity of Object.keys(cardsData)) {
    const originalLength = cardsData[rarity].length;

    cardsData[rarity] = cardsData[rarity].filter(card => card.id !== cardId);

    if (cardsData[rarity].length !== originalLength) {
      found = true;
    }
  }

  if (!found) {
    console.log('❌ Card not found.');
    rl.close();
    return;
  }

  // Rebuild clean JS file content
  const newFileContent =
`module.exports = ${JSON.stringify(cardsData, null, 2)};`;

  fs.writeFileSync(FILE_PATH, newFileContent);

  console.log(`\n💀 Card ${cardId} deleted successfully.`);

  rl.close();
}

main();
