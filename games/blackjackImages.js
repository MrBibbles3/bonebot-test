const path = require("path");
const sharp = require("sharp");
const { AttachmentBuilder } = require("discord.js");

const CARD_DIR = path.join(__dirname, "..", "card-pngs");

async function makeHandImage(cards, outputName = "hand.png") {
  const cardWidth = 120;
  const cardHeight = 70;
  const gap = 8;

  const width = cards.length * cardWidth + (cards.length - 1) * gap;
  const height = cardHeight;

  const composites = cards.map((card, index) => ({
    input: path.join(CARD_DIR, `${card.rank}_${card.suit}.png`),
    left: index * (cardWidth + gap),
    top: 0,
  }));

  const buffer = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();

  return new AttachmentBuilder(buffer, { name: outputName });
}

module.exports = {
  makeHandImage,
};