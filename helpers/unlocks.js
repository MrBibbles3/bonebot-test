const { EmbedBuilder } = require("discord.js");

const cards = require("../data/cards");
const UNIQUE_UNLOCKS = require("../data/uniqueUnlocks");

const IMAGE_COMMIT = "53d3b2c";
const BOT_VERSION = "2.0";

function getCardId(card) {
  return Number(card.season) === 1 ? card.id : `${card.season}${card.id}`;
}

function findCardById(cardId) {
  if (!cardId) return null;

  const wanted = cardId.toLowerCase();
  const allCards = Object.values(cards).flat();

  return allCards.find(card =>
    getCardId(card).toLowerCase() === wanted ||
    card.id.toLowerCase() === wanted
  );
}

function getCardImageUrl(card) {
  return `https://cdn.jsdelivr.net/gh/MrBibbles3/bonebot-test@${IMAGE_COMMIT}/images/S${card.season}/${card.id}.gif?v=${BOT_VERSION}`;
}


async function giveUniqueCard(user, cardId, reason) {
  const card = findCardById(cardId);

  if (!card) {
    console.log(`Unique card not found: ${cardId}`);
    return false;
  }

  const fullCardId = getCardId(card);
  const existingCard = user.inventory.find(i => i.itemId === fullCardId);

  if (existingCard) {
    return false;
  }

  user.inventory.push({
    itemId: fullCardId,
    quantity: 1
  });

  await user.save();

  console.log(`Unlocked ${fullCardId} for ${user.userId}: ${reason}`);
  return true;
}

async function checkUnlocks(user, discordUser = null) {
  const unlockEmbeds = [];

  const kevUnlock = await checkKevUnlock(user, discordUser);
  if (kevUnlock) unlockEmbeds.push(kevUnlock);

  const bibblesUnlock = await checkBibblesUnlock(user, discordUser);
  if (bibblesUnlock) unlockEmbeds.push(bibblesUnlock);

  const applUnlock = await checkApplUnlock(user, discordUser);
  if (applUnlock) unlockEmbeds.push(applUnlock);

  const sinnyUnlock = await checkSinnyUnlock(user, discordUser);
  if (sinnyUnlock) unlockEmbeds.push(sinnyUnlock);

  const fireUnlock = await checkFireUnlock(user, discordUser);
  if (fireUnlock) unlockEmbeds.push(fireUnlock);

  return unlockEmbeds;
}

async function checkKevUnlock(user, discordUser = null) {
  if ((user.bonesSpentTotal || 0) < 50000) return null;

  const unlocked = await giveUniqueCard(
    user,
    UNIQUE_UNLOCKS.kev.cardId,
    UNIQUE_UNLOCKS.kev.requirement
  );

  if (!unlocked) return null;

  const card = findCardById(UNIQUE_UNLOCKS.kev.cardId);

  const unlockEmbed = new EmbedBuilder()
    .setTitle("👑 Unique Card Unlocked! 👑")
    .setDescription(
      `You unlocked **${card.name}**!\n\n` +
      `Requirement: **${UNIQUE_UNLOCKS.kev.requirement}**`
    )
    .setImage(getCardImageUrl(card))
    .setColor(0xEFBF04);
    

  if (card) {
    unlockEmbed.addFields({
      name: "Card ID",
      value: `\`${getCardId(card)}\``,
      inline: true
    });
  }

  if (discordUser) {
    try {
      await discordUser.send({
        embeds: [unlockEmbed]
      });
    } catch (err) {
      console.log(`Could not DM unique unlock to ${user.userId}: ${err.message}`);
    }
  }

  return unlockEmbed;
}

async function checkBibblesUnlock(user, discordUser = null) {
  const season1Cards = Object.values(cards)
    .flat()
    .filter(card =>
      Number(card.season) === 1 &&
      card.rarity !== "UNIQUE"
    );

  const ownsAllSeason1 = season1Cards.every(card =>
    user.inventory.some(invItem =>
      invItem.itemId === getCardId(card) &&
      invItem.quantity > 0
    )
  );

  if (!ownsAllSeason1) return null;

  const unlocked = await giveUniqueCard(
    user,
    UNIQUE_UNLOCKS.bibbles.cardId,
    UNIQUE_UNLOCKS.bibbles.requirement
  );

  if (!unlocked) return null;

  const card = findCardById(UNIQUE_UNLOCKS.bibbles.cardId);

  const unlockEmbed = new EmbedBuilder()
    .setTitle("👑 Unique Card Unlocked! 👑")
    .setDescription(
      `You completed the **Season 1 Index**!\n\n` +
      `You unlocked **${card.name}**!`
    )
    .setColor(0xEFBF04)
    .setImage(getCardImageUrl(card))
    .addFields({
      name: "Card ID",
      value: `\`${getCardId(card)}\``,
      inline: true
    });

  if (discordUser) {
    try {
      await discordUser.send({ embeds: [unlockEmbed] });
    } catch (err) {
      console.log(`Could not DM Bibbles unlock to ${user.userId}: ${err.message}`);
    }
  }

  return unlockEmbed;
}

async function checkSinnyUnlock(user, discordUser = null) {
  if ((user.blackjack21Count || 0) < 2) return null;

  const unlocked = await giveUniqueCard(
    user,
    UNIQUE_UNLOCKS.sinny.cardId,
    UNIQUE_UNLOCKS.sinny.requirement
  );

  if (!unlocked) return null;

  const card = findCardById(UNIQUE_UNLOCKS.sinny.cardId);

  const unlockEmbed = new EmbedBuilder()
    .setTitle("👑 Unique Card Unlocked! 👑")
    .setDescription(
      `You unlocked **${card.name}**!\n\n` +
      `Requirement: **${UNIQUE_UNLOCKS.sinny.requirement}**`
    )
    .setColor(0xEFBF04)
    .setImage(getCardImageUrl(card))
    .addFields({
      name: "Card ID",
      value: `\`${getCardId(card)}\``,
      inline: true
    });

  if (discordUser) {
    try {
      await discordUser.send({ embeds: [unlockEmbed] });
    } catch (err) {
      console.log(`Could not DM Sinny unlock to ${user.userId}: ${err.message}`);
    }
  }

  return unlockEmbed;
}

async function checkApplUnlock(user, discordUser = null) {
  const rewardCardId = UNIQUE_UNLOCKS.appl.cardId; // "2U1"

  const season2Cards = Object.values(cards)
    .flat()
    .filter(card =>
      Number(card.season) === 2 &&
      getCardId(card) !== rewardCardId
    );

  const ownsAllSeason2 = season2Cards.every(card =>
    user.inventory.some(invItem =>
      invItem.itemId === getCardId(card) &&
      invItem.quantity > 0
    )
  );

  if (!ownsAllSeason2) return null;

  const unlocked = await giveUniqueCard(
    user,
    UNIQUE_UNLOCKS.appl.cardId,
    UNIQUE_UNLOCKS.appl.requirement
  );

  if (!unlocked) return null;

  const card = findCardById(UNIQUE_UNLOCKS.appl.cardId);

  const unlockEmbed = new EmbedBuilder()
    .setTitle("👑 Unique Card Unlocked! 👑")
    .setDescription(
      `You completed the **Season 2 Index**!\n\n` +
      `You unlocked **${card.name}**!`
    )
    .setColor(0xEFBF04)
    .setImage(getCardImageUrl(card))
    .addFields({
      name: "Card ID",
      value: `\`${getCardId(card)}\``,
      inline: true
    });

  if (discordUser) {
    try {
      await discordUser.send({ embeds: [unlockEmbed] });
    } catch (err) {
      console.log(`Could not DM Appl unlock to ${user.userId}: ${err.message}`);
    }
  }

  return unlockEmbed;
}

async function checkFireUnlock(user, discordUser = null) {
  if ((user.boneDigPerfectCount || 0) < 2) return null;//1111

  const unlocked = await giveUniqueCard(
    user,
    UNIQUE_UNLOCKS.fire.cardId,
    UNIQUE_UNLOCKS.fire.requirement
  );

  if (!unlocked) return null;

  const card = findCardById(UNIQUE_UNLOCKS.fire.cardId);

  const unlockEmbed = new EmbedBuilder()
    .setTitle("👑 Unique Card Unlocked! 👑")
    .setDescription(
      `You unlocked **${card.name}**!\n\n` +
      `Requirement: **${UNIQUE_UNLOCKS.fire.requirement}**`
    )
    .setColor(0xEFBF04)
    .setImage(getCardImageUrl(card))
    .addFields({
      name: "Card ID",
      value: `\`${getCardId(card)}\``,
      inline: true
    });

  if (discordUser) {
    try {
      await discordUser.send({
        embeds: [unlockEmbed]
      });
    } catch (err) {
      console.log(`Could not DM Fire unlock to ${user.userId}: ${err.message}`);
    }
  }

  return unlockEmbed;
}


module.exports = {
  checkUnlocks,
  checkKevUnlock,
  checkBibblesUnlock,
  checkApplUnlock,
  checkSinnyUnlock,
  checkFireUnlock,
  giveUniqueCard
};