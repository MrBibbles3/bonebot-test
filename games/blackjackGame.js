const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const { createDeck, drawCard, getHandValue } = require("./deck");
const { makeHandImage } = require("./blackjackImages");
const User = require("../models/User");
const games = new Map();
const { checkUnlocks } = require("../helpers/unlocks");


function createMainMenuRow(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`games_menu_${userId}`)
      .setLabel("Main Menu")
      .setEmoji("🎮")
      .setStyle(ButtonStyle.Primary)
  );
}


async function startBlackjack(interaction, bet) {
  const userId = interaction.user.id;
  bet = Number(bet);

  if (!bet || bet <= 0) {
    return interaction.reply({
      content: "💀 Invalid blackjack bet.",
      flags: 64
    });
  }

  if (games.has(userId)) {
    games.delete(userId);
  }

  const deck = createDeck();

  const game = {
    userId,
    bet,
    deck,
    playerHand: [drawCard(deck), drawCard(deck)],
    dealerHand: [drawCard(deck), drawCard(deck)],
    finished: false,
  };

  games.set(userId, game);

  return sendBlackjackMessage(interaction, game, true);
}

async function sendBlackjackMessage(interaction, game, firstReply = false) {
  const playerValue = getHandValue(game.playerHand);
  const dealerShown = game.dealerHand[0];

  

  const dealerAttachment = await makeHandImage([dealerShown], "dealer-hand.png");
  const playerAttachment = await makeHandImage(game.playerHand, "player-hand.png");

  const embed = new EmbedBuilder()
    .setTitle("🃏 Blackjack")
    .setDescription(
      `**Dealer shows:** ${dealerShown.rank} ${dealerShown.suit}\n` +
      `**Your hand:** ${playerValue}\n\n` +
      `Hit or stand?`
    )
    .setThumbnail("attachment://dealer-hand.png")
    .setImage("attachment://player-hand.png");

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`blackjack_hit_${game.userId}`)
      .setLabel("Hit")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId(`blackjack_stand_${game.userId}`)
      .setLabel("Stand")
      .setStyle(ButtonStyle.Secondary)
  );

  const payload = {
    embeds: [embed],
    files: [dealerAttachment, playerAttachment],
    components: [buttons],
    flags: 64
  };

  if (firstReply) {
    return interaction.reply(payload);
  }

  return interaction.update(payload);
}

async function handleBlackjackButton(interaction) {
  const [prefix, action, ownerId] = interaction.customId.split("_");

  if (interaction.user.id !== ownerId) {
    return interaction.reply({
      content: "This isn't your blackjack game, card gremlin.",
      flags: 64
    });
  }

  const game = games.get(ownerId);

  if (!game) {
    return interaction.reply({
      content: "That blackjack game has already ended.",
      flags: 64
    });
  }

  if (action === "hit") {
    game.playerHand.push(drawCard(game.deck));

    const value = getHandValue(game.playerHand);

    if (value > 21) {
      games.delete(ownerId);

      const attachment = await makeHandImage(game.playerHand, "player-hand.png");

      const embed = new EmbedBuilder()
        .setTitle("💀 Blackjack - Bust!")
        .setDescription(
          `You drew too many cards and busted.\n\n` +
          `**Your hand:** ${value}\n` +
          `**Lost:** ${game.bet} <:BBones:1518220991938170910>`
        )
        .setImage("attachment://player-hand.png");

      return interaction.update({
        embeds: [embed],
        files: [attachment],
        components: [createMainMenuRow(ownerId)]
      });
    }

    return sendBlackjackMessage(interaction, game, false);
  }

  if (action === "stand") {
    while (getHandValue(game.dealerHand) < 17) {
      game.dealerHand.push(drawCard(game.deck));
    }

    const playerValue = getHandValue(game.playerHand);
    const dealerValue = getHandValue(game.dealerHand);

    const user = await User.findOne({ userId: ownerId });

    let winnings = 0;
    let result;

    if (dealerValue > 21 || playerValue > dealerValue) {
      if (playerValue === 21) {
        winnings = game.bet * 3;

        user.blackjack21Count = (user.blackjack21Count || 0) + 1;
        const blackjackProgress = Math.min(user.blackjack21Count, 10);

        if (blackjackProgress === 10) {
          result =
            `🎉 **21!** You won **${winnings} <:BBones:1518220991938170910>**!\n\n` +
            `🃏 **Unique Card Progress:** \`10/10\` ✅`;
        } else {
          result =
            `🎉 **21!** You won **${winnings} <:BBones:1518220991938170910>**!\n\n` +
            `🃏 **Unique Card Progress:** \`${blackjackProgress}/10\``;
        }
      } else {
        winnings = game.bet * 2;
        result = `🎉 You win **${winnings} <:BBones:1518220991938170910>**!`;
      }
    } else if (playerValue < dealerValue) {
      winnings = 0;
      result = `💀 You lose **${game.bet} <:BBones:1518220991938170910>**.`;
    } else {
      winnings = game.bet;
      result = `🤝 Push! Your **${game.bet} <:BBones:1518220991938170910>** bet was returned.`;
    }

    user.bones += winnings;
    await user.save();
    
    const unlockEmbeds = await checkUnlocks(user, interaction.user);

    games.delete(ownerId);

    const dealerAttachment = await makeHandImage(game.dealerHand, "dealer-hand.png");
    const playerAttachment = await makeHandImage(game.playerHand, "player-hand.png");

    const embed = new EmbedBuilder()
      .setTitle("🃏 Blackjack - Result")
      .setDescription(
        `**Your hand:** ${playerValue}\n` +
        `**Dealer hand:** ${dealerValue}\n\n` +
        result
      )
      .setThumbnail("attachment://dealer-hand.png")
      .setImage("attachment://player-hand.png")

    const embeds = [embed];

    embeds.push(...unlockEmbeds);

    return interaction.update({
      embeds,
      files: [dealerAttachment, playerAttachment],
      components: [createMainMenuRow(ownerId)],
    });
  }
}

module.exports = {
  startBlackjack,
  handleBlackjackButton,
};