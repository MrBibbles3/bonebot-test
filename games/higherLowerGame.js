const higherLowerGames = new Map();
const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");
const User = require("../models/User");
const { createDeck, drawCard } = require("../games/deck");
const { makeHandImage } = require("../games/blackjackImages");
const { checkUnlocks } = require("../helpers/unlocks");


const CARD_VALUES = {
    A: 1,
    "2": 2,
    "3": 3,
    "4": 4,
    "5": 5,
    "6": 6,
    "7": 7,
    "8": 8,
    "9": 9,
    "10": 10,
    J: 11,
    Q: 12,
    K: 13
};

const MULTIPLIERS = [1, 1.2, 1.4, 1.6, 1.8, 2, 2.5, 3, 5, 6];

function createMainMenuRow(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`games_menu_${userId}`)
      .setLabel("Main Menu")
      .setEmoji("🎮")
      .setStyle(ButtonStyle.Primary)
  );
}

function getStreakTitle(streak) {
    if (streak >= 20) return "🍀 This is what grass looks like, you need it!\n" + "# 👑YOU UNLOCKED A SECRET UNIQUE CARD!👑";
    if (streak >= 19) return "✨ 2 more....";
    if (streak >= 18) return "🤓 3 more to go!!";
    if (streak >= 17) return "🌸 20 then I'll actually applaud you";
    if (streak >= 16) return "🪦 Nah fr if you get-";
    if (streak >= 15) return "⌚ Quit while you're ahead";
    if (streak >= 14) return "🤓 Like literally, it won't go up";
    if (streak >= 13) return "👹 There's no more multipliers";
    if (streak >= 12) return "😭 It's over gang";
    if (streak >= 11) return "🍒 Why are you still going?";
    if (streak >= 10) return "❓ Huh";
    if (streak >= 9) return "🌌 AHHHHHHHHHHHHHHHHHHHHHHHHHHHH 🌌";
    if (streak >= 8) return "🌌 AHHHHHHHHHHHHHH";
    if (streak >= 7) return "⚡ UNIVERSAL POWER";
    if (streak >= 6) return "💀 GI-NAMA-NA-NOURUS";
    if (streak >= 5) return "🔥 MEGA STREAK";
    if (streak >= 4) return "✨ BIGGER STREAK";
    if (streak >= 3) return "🎉 TRIPLE STREAK";

  return null;
}

function getStreakColor(streak) {
  if (streak >= 8) return 0xff00ff;
  if (streak >= 7) return 0xff3131;
  if (streak >= 6) return 0xf5c542;
  if (streak >= 5) return 0x9b59b6;
  if (streak >= 4) return 0x3498db;
  if (streak >= 3) return 0x57f287;

  return 0x5865f2;
}

function getCardValue(card) {
    return CARD_VALUES[card.rank];
}

function getMultiplier(streak) {
    return MULTIPLIERS[Math.min(streak, MULTIPLIERS.length - 1)];
}

async function startHigherLower(interaction, bet) {
  const userId = interaction.user.id;

  if (higherLowerGames.has(userId)) {
    higherLowerGames.delete(userId);
  }

  const deck = createDeck();
  const currentCard = drawCard(deck);

  higherLowerGames.set(userId, {
    userId,
    bet,
    deck,
    currentCard,
    streak: 0,
  });

  return sendHigherLowerMessage(interaction);
}

async function sendHigherLowerMessage(interaction, resultText = "") {
    const game = higherLowerGames.get(interaction.user.id);
    const user = await User.findOne({ userId: interaction.user.id });
    const bestStreak = user?.highlowBestStreak || 0;

    if (!game) {
        return interaction.reply({
            content: "💀 Higher or Lower game not found.",
            flags: 64
        });
    }
    const attachment = await makeHandImage([game.currentCard], "higherlower-card.png");
    const multiplier = getMultiplier(game.streak);
    const cashout = Math.floor(game.bet * multiplier);
    const streakTitle = getStreakTitle(game.streak);
    const streakColor = getStreakColor(game.streak);

    const embed = new EmbedBuilder()
        .setTitle("⬆️ Higher or Lower")
        .setDescription(
            `${resultText ? `${resultText}\n\n` : ""}` +
            `${streakTitle ? `# ${streakTitle}\n\n` : ""}` +
            `Bet: **${game.bet} <:BBones:1518220991938170910>**\n` +
            `Current Streak: **${game.streak}**\n` +
            `Best Streak: **${bestStreak}**\n` +
            `Multiplier: **${multiplier}x**\n` +
            `Cash Out Value: **${cashout} <:BBones:1518220991938170910>**\n\n` +
            `Will the next card be higher or lower?`
        )
        .setImage("attachment://higherlower-card.png")
        .setColor(streakColor);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
        .setCustomId(`highlow_higher_${game.userId}`)
        .setLabel("Higher")
        .setEmoji("⬆️")
        .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
        .setCustomId(`highlow_lower_${game.userId}`)
        .setLabel("Lower")
        .setEmoji("⬇️")
        .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
        .setCustomId(`highlow_cashout_${game.userId}`)
        .setLabel("Cash Out")
        .setEmoji("<:BBones:1518220991938170910>")
        .setStyle(ButtonStyle.Secondary)
    );

    return interaction.update({
        embeds: [embed],
        files: [attachment],
        components: [row]
    });

  
}

async function handleHigherLowerButton(interaction) {
  const parts = interaction.customId.split("_");
  const action = parts[1];
  const ownerId = parts[2];

  if (interaction.user.id !== ownerId) {
    return interaction.reply({
      content: "💀 This isn’t your Higher or Lower game!",
      flags: 64
    });
  }

  const game = higherLowerGames.get(ownerId);

  if (!game) {
    return interaction.reply({
      content: "💀 This Higher or Lower game has already ended.",
      flags: 64
    });
  }

  if (action === "cashout") {
    higherLowerGames.delete(ownerId);

    const user = await User.findOne({ userId: ownerId });

    const multiplier = getMultiplier(game.streak);
    const winnings = Math.floor(game.bet * multiplier);

    user.bones += winnings;

    if (!user.highlowBestStreak || game.streak > user.highlowBestStreak) {
        user.highlowBestStreak = game.streak;
    }

    if (game.streak >= 20 && !user.highLowReached20) {
        user.highLowReached20 = true;
    }

    await user.save();

    const unlockEmbeds = await checkUnlocks(user, interaction.user);

    const embed = new EmbedBuilder()
        .setTitle("⬆️ Higher or Lower - Cash Out")
        .setDescription(
        `You cashed out at **${multiplier}x**!\n\n` +
        `🔥 Streak: **${game.streak}**\n` +
        `🏆 Best Streak: **${user.highlowBestStreak || 0}**\n` +
        `💰 Winnings: **${winnings} <:BBones:1518220991938170910>**\n` +
        `<:BBones:1518220991938170910> New Balance: **${user.bones} <:BBones:1518220991938170910>**`
        )
        .setColor(0xf5c542);

    const embeds = [embed];
    embeds.push(...unlockEmbeds);

    return interaction.update({
        embeds,
        files: [],
        components: [createMainMenuRow(ownerId)]
    });
    }

  const nextCard = drawCard(game.deck);

  const currentValue = getCardValue(game.currentCard);
  const nextValue = getCardValue(nextCard);

  let correct = false;

  if (action === "higher") {
    correct = nextValue > currentValue;
  }

  if (action === "lower") {
    correct = nextValue < currentValue;
  }

  if (nextValue === currentValue) {
    correct = true;
  }

  game.currentCard = nextCard;

  if (!correct) {
    higherLowerGames.delete(ownerId);

    const attachment = await makeHandImage([nextCard], "higherlower-card.png");

    const embed = new EmbedBuilder()
      .setTitle("💀 Higher or Lower - Bust")
      .setDescription(
        `The next card was **${nextCard.rank} of ${nextCard.suit}**.\n\n` +
        `You guessed **${action}** and lost **${game.bet} <:BBones:1518220991938170910>**.`
      )
      .setImage("attachment://higherlower-card.png")
      .setColor(0xed4245);

    return interaction.update({
      embeds: [embed],
      files: [attachment],
      components: [createMainMenuRow(ownerId)]
    });
  }

  game.streak += 1;

  return sendHigherLowerMessage(
    interaction,
    `✅ The next card was **${nextCard.rank} of ${nextCard.suit}**. You guessed right!`
  );
}

module.exports = {
    startHigherLower,
    handleHigherLowerButton
};