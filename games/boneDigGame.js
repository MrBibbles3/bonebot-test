const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const User = require("../models/User");
const { checkUnlocks } = require("../helpers/unlocks");

const boneDigGames = new Map();

const TILE_EMOJIS = {
  hidden: "🪨",
  trap: "🪬",
  curse: "🕸️",
  bones: "<:BBones:1518220991938170910>",
  treasure: "💎",
  relic: "✨"
};

const TILE_REWARDS = {
  curse: -0.5,
  bones: 0.5,
  treasure: 0.75,
  relic: 1
};

function getSafeTileCount(game) {
  return game.board.filter(tile => tile !== "trap" && tile !== "curse").length;
}

function createMainMenuRow(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`games_menu_${userId}`)
      .setLabel("Main Menu")
      .setEmoji("🎮")
      .setStyle(ButtonStyle.Primary)
  );
}

function shuffleArray(array) {
  return array.sort(() => Math.random() - 0.5);
}

function createBoard() {
  return shuffleArray([
    "trap",      // instant lose
    "curse",     // -ve bones
    "curse",     // -ve bones
    "bones",
    "bones",
    "treasure",
    "treasure",
    "relic",
    "relic"
  ]);
}

function getTileReward(tile, bet) {
  const multiplier = TILE_REWARDS[tile] || 0;
  return Math.floor(bet * multiplier);
}

function getBoardText(game, revealAll = false) {
  let text = "";

  for (let i = 0; i < 9; i++) {
    const isRevealed = game.revealed.includes(i);

    if (isRevealed || revealAll) {
      text += TILE_EMOJIS[game.board[i]];
    } else {
      text += TILE_EMOJIS.hidden;
    }

    if ((i + 1) % 3 === 0) {
      text += "\n";
    } else {
      text += " ";
    }
  }

  return text;
}

function createTileButton(game, index, revealAll = false) {
  const isRevealed = game.revealed.includes(index);
  const tile = game.board[index];

  const label = String(index + 1);

  let emoji = TILE_EMOJIS.hidden;
  let style = ButtonStyle.Secondary;
  let disabled = isRevealed || revealAll;

  if (isRevealed || revealAll) {
    emoji = TILE_EMOJIS[tile];

    if (tile === "trap") style = ButtonStyle.Danger;
    if (tile === "bones") style = ButtonStyle.Primary;
    if (tile === "treasure") style = ButtonStyle.Success;
    if (tile === "relic") style = ButtonStyle.Success;
  }

  return new ButtonBuilder()
    .setCustomId(`bonedig_tile_${index}_${game.userId}`)
    .setLabel(label)
    .setEmoji(emoji)
    .setStyle(style)
    .setDisabled(disabled);
}

function createBoneDigRows(game, revealAll = false, disableCashout = false) {
  const row1 = new ActionRowBuilder().addComponents(
    createTileButton(game, 0, revealAll),
    createTileButton(game, 1, revealAll),
    createTileButton(game, 2, revealAll)
  );

  const row2 = new ActionRowBuilder().addComponents(
    createTileButton(game, 3, revealAll),
    createTileButton(game, 4, revealAll),
    createTileButton(game, 5, revealAll)
  );

  const row3 = new ActionRowBuilder().addComponents(
    createTileButton(game, 6, revealAll),
    createTileButton(game, 7, revealAll),
    createTileButton(game, 8, revealAll)
  );

  const row4 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`bonedig_cashout_${game.userId}`)
      .setLabel("Cash Out")
      .setEmoji("💰")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disableCashout || game.winnings <= 0)
  );

  return [row1, row2, row3, row4];
}

async function startBoneDig(interaction, bet) {
  const userId = interaction.user.id;

  if (boneDigGames.has(userId)) {
    return interaction.reply({
      content: "⛏️ You already have a Bone Dig game running!",
      flags: 64
    });
  }

  const game = {
    userId,
    bet,
    board: createBoard(),
    revealed: [],
    winnings: 0
  };

  boneDigGames.set(userId, game);

  return sendBoneDigMessage(interaction, game);
}

async function sendBoneDigMessage(interaction, game, resultText = "") {
  const embed = new EmbedBuilder()
    .setTitle("⛏️ Bone Dig")
    .setDescription(
      `${resultText ? `${resultText}\n\n` : ""}` +
      `${getBoardText(game)}\n` +
      `Bet: **${game.bet} <:BBones:1518220991938170910>**\n` +
      `Current Loot: **${game.winnings} <:BBones:1518220991938170910>**\n\n` +
      `Pick a rock to dig, or cash out.`
    )
    .setColor(0xc27c2c);

  return interaction.update({
    embeds: [embed],
    components: createBoneDigRows(game)
  });
}

async function handleBoneDigButton(interaction) {
  const parts = interaction.customId.split("_");
  const action = parts[1];

  if (action === "tile") {
    const index = Number(parts[2]);
    const ownerId = parts[3];

    if (interaction.user.id !== ownerId) {
      return interaction.reply({
        content: "💀 This isn’t your Bone Dig game!",
        flags: 64
      });
    }

    const game = boneDigGames.get(ownerId);

    if (!game) {
      return interaction.reply({
        content: "💀 This Bone Dig game has already ended.",
        flags: 64
      });
    }

    if (game.revealed.includes(index)) {
      return interaction.reply({
        content: "🪨 You already dug that spot!",
        flags: 64
      });
    }

    const tile = game.board[index];
    game.revealed.push(index);

    if (tile === "trap") {
      boneDigGames.delete(ownerId);

      const embed = new EmbedBuilder()
        .setTitle("💀 Bone Dig - Cave In!")
        .setDescription(
          `You dug up a trap and lost everything!\n\n` +
          `${getBoardText(game, true)}\n` +
          `Bet Lost: **${game.bet} <:BBones:1518220991938170910>**`
        )
        .setColor(0xed4245);

      return interaction.update({
        embeds: [embed],
        components: [createMainMenuRow(ownerId)]
      });
    }

    const reward = getTileReward(tile, game.bet);
    game.winnings += reward;

    if (game.winnings < 0) {
        game.winnings = 0;
    }

    const resultText =
    reward < 0
        ? `${TILE_EMOJIS[tile]} Curse! You lost **${Math.abs(reward)} <:BBones:1518220991938170910>** from your loot.`
        : `${TILE_EMOJIS[tile]} You found **${reward} <:BBones:1518220991938170910>**!`;

    const safeRevealed = game.revealed.filter(index => {
        const tile = game.board[index];
        return tile !== "trap" && tile !== "curse";
    }).length;

    if (safeRevealed >= getSafeTileCount(game)) {
      boneDigGames.delete(ownerId);

      const user = await User.findOne({ userId: ownerId });

      user.bones += game.winnings;

      user.boneDigPerfectCount = (user.boneDigPerfectCount || 0) + 1;
      const fireProgress = Math.min(user.boneDigPerfectCount, 10);

      await user.save();

      const unlockEmbeds = await checkUnlocks(user, interaction.user);

      const embed = new EmbedBuilder()
        .setTitle("⛏️ Bone Dig - Cleared!")
        .setDescription(
          `You cleared the whole dig site!\n\n` +
          `${getBoardText(game, true)}\n` +
          `💰 Winnings: **${game.winnings} <:BBones:1518220991938170910>**\n` +
          `<:BBones:1518220991938170910> New Balance: **${user.bones} <:BBones:1518220991938170910>**\n\n` +
          `🔥 **Unique Card Progress:** \`${fireProgress}/10\`${fireProgress === 10 ? " ✅" : ""}`
        )
        .setColor(0x57f287);

      const embeds = [embed];
      embeds.push(...unlockEmbeds);

      return interaction.update({
        embeds,
        components: [createMainMenuRow(ownerId)]
      });
    }

    return sendBoneDigMessage(interaction, game, resultText);
  }

  if (action === "cashout") {
    const ownerId = parts[2];

    if (interaction.user.id !== ownerId) {
      return interaction.reply({
        content: "💀 This isn’t your Bone Dig game!",
        flags: 64
      });
    }

    const game = boneDigGames.get(ownerId);

    if (!game) {
      return interaction.reply({
        content: "💀 This Bone Dig game has already ended.",
        flags: 64
      });
    }

    boneDigGames.delete(ownerId);

    const user = await User.findOne({ userId: ownerId });
    user.bones += game.winnings;
    await user.save();

    const embed = new EmbedBuilder()
      .setTitle("💰 Bone Dig - Cashed Out")
      .setDescription(
        `You escaped with your loot!\n\n` +
        `${getBoardText(game, true)}\n` +
        `💰 Winnings: **${game.winnings} <:BBones:1518220991938170910>**\n` +
        `<:BBones:1518220991938170910> New Balance: **${user.bones} <:BBones:1518220991938170910>**`
      )
      .setColor(0xf5c542);

    return interaction.update({
      embeds: [embed],
      components: [createMainMenuRow(ownerId)]
    });
  }
}

module.exports = {
  startBoneDig,
  handleBoneDigButton
};