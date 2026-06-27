require('dotenv').config();

const mongoose = require('mongoose');
const cooldowns = new Map();
const {Client, REST, Routes, Partials, SlashCommandBuilder, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder, AllowedMentionsTypes } = require('discord.js');
const cards = require('./data/cards');
const rarities = require('./data/rarities');
const User = require('./models/User');
let currentShopMessages = [];
let shopEndTime = null;
let countdownInterval = null;
let shopHeaderMessage = null;
const BOT_VERSION = "2.09";
const IMAGE_COMMIT = "53d3b2c"; // replace with newest git log --oneline
const ALLOWED_CHANNELS = [
  '1471357861526241350',
  '1470496897721565419'
];
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const SHOP_CHANNEL_ID = process.env.SHOP_CHANNEL_ID;
const OFFLINE_IMAGES = false;
const {DM_REPLIES,RARE_DM_REPLIES} = require("./replies/dmReplies");
const fs = require("fs");
const path = require("path");
const UNIQUE_UNLOCKS = require("./data/uniqueUnlocks");
const { checkUnlocks } = require("./helpers/unlocks");


//Game Constants
const MAX_BIBBLES_TOKENS = 20;
const DAILY_TOKEN_AMOUNT = 10;
const BIBBLES_TOKEN_RECHARGE_MS = 5 * 60 * 60 * 1000; //5 hour beans
const COINFLIP_BETS = [50, 100, 200];
const GRAVEROBBERY_BETS = [50, 100, 200];
const {startBlackjack, handleBlackjackButton} = require("./games/blackjackGame");
const BLACKJACK_BETS = [50, 100, 200];
const HIGHLOW_BETS = [25, 50, 100];
const {startHigherLower, handleHigherLowerButton} = require("./games/higherLowerGame");
const {startBoneDig, handleBoneDigButton} = require("./games/boneDigGame");
const BONEDIG_BETS = [100, 200, 500];



const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages
  ],
  partials: [
    Partials.Channel
  ]
});

async function clearShopChannel(channel) {
  try {
    const messages = await channel.messages.fetch({ limit: 100 });

    if (messages.size > 0) {
      await channel.bulkDelete(messages, true);
    }

    console.log("Shop channel cleared.");
  } catch (err) {
    console.error("Failed to clear shop channel:", err);
  }
}


client.once('clientReady', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  try {
    const shopChannel = await client.channels.fetch(SHOP_CHANNEL_ID);

    // 🔥 Clear entire channel first
    await clearShopChannel(shopChannel);

    // Post fresh shop
    await postShop(shopChannel);

    // Update!
    await shopChannel.send(`Update ${BOT_VERSION} is live!`);


    // Rotate every 60 minutes (30 for testing)
    setInterval(async () => {
      await postShop(shopChannel);
    }, 30 * 60 * 1000);

  } catch (err) {
    console.error("Shop boot error:", err);
  }
});



console.log("Attempting MongoDB connection...");
//mongoose.connect('mongodb://127.0.0.1:27017/bonebot')
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('Mongo Error:', err.message));


//client.login('token');
client.login(process.env.TOKEN);


async function getOrCreateUser(userId) {
  let user = await User.findOne({ userId });

  if (!user) {
    user = new User({
      userId,
      bones: 500,          // 👈 Starting bonus
      inventory: [],
      dailyStreak: 0,
      cappedStreak: 0,
      dailyLastClaim: null,
      lastRefundAt: null
    });

    await user.save();
  }
  
  await applyDailyTokenGrant(user);

  return user;
}

//Enable Slash Commands
const commands = [
  new SlashCommandBuilder()
  .setName('inventory')
  .setDescription('View a card collection')
  .addUserOption(option =>
    option
      .setName('user')
      .setDescription('User to view')
      .setRequired(false)
  ),

  new SlashCommandBuilder()
  .setName("games")
  .setDescription("Play Bones Games using tokens!"),

  new SlashCommandBuilder()
  .setName('pings')
  .setDescription('Set your Shop Pings'),

  new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim your daily <:BBones:1518220991938170910> reward'),

  new SlashCommandBuilder()
    .setName("index")
    .setDescription("Check your BoneBot card index")

    .addIntegerOption(option =>
      option
        .setName("season")
        .setDescription("Season to check")
        .setRequired(true)
        .addChoices(
          { name: "Season 1", value: 1 },
          { name: "Season 2", value: 2 }
        )
    )

    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Whose index to view")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("View BoneBot leaderboards")
    .addStringOption(option =>
      option
        .setName("type")
        .setDescription("Which leaderboard to view")
        .setRequired(true)
        .addChoices(
          { name: "Bones Spent", value: "spent" },
          { name: "All Time Balance", value: "earned" },
          { name: "Daily Streak", value: "daily" },
          { name: "High Low Streak", value: "highlow" }
        )
    ),

  new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Check a Bone balance')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('User to view')
        .setRequired(false)
    )
].map(command => command.toJSON());


const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => { 
  try {
    console.log('Registering slash commands...');

    await rest.put(
      Routes.applicationGuildCommands(
        CLIENT_ID,  // CLIENT ID
        GUILD_ID   // SERVER/GUILD ID
      ),
      { body: commands }
    );

    console.log('Slash commands registered.');
  } catch (error) {
    console.error(error);
  }
})();


function buildPingsMessage(user, viewerId) {
  const pingEmbeds = [];
  const files = [];

  user.pingCards.forEach((cardId, index) => {
    const slotNumber = index + 1;
    const card = findCardById(cardId);

    const embed = new EmbedBuilder()
      .setColor(0x2B2D31)
      .setTitle(`📡 Ping Slot ${slotNumber}`);

    if (!card) {
      embed.setDescription("Not Set");
    } else {
      embed.setDescription(
        `**${card.name}**\n` +
        `SN: \`${card.season}\`\n` +
        `ID: \`${getCardId(card)}\``
      );

      if (OFFLINE_IMAGES) {
        const fileName = `ping_${slotNumber}_${card.id}.png`;

        const attachment = new AttachmentBuilder(getCardImagePath(card), {
          name: fileName
        });

        if (isCardGif(card)) {
          embed.setImage(`attachment://${fileName}`);
        } else {
          embed.setImage(`attachment://${fileName}`);
        }
        files.push(attachment);
      } else {
        if (isCardGif(card)) {
          embed.setImage(getCardImageUrl(card));
        } else {
          embed.setImage(getCardImageUrl(card));
        }
      }
    }

    pingEmbeds.push(embed);
  });

  const setRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`pingslot_0_${viewerId}`)
      .setLabel("Set Slot 1")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(`pingslot_1_${viewerId}`)
      .setLabel("Set Slot 2")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(`pingslot_2_${viewerId}`)
      .setLabel("Set Slot 3")
      .setStyle(ButtonStyle.Secondary)
  );

  const clearRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`clearping_0_${viewerId}`)
      .setLabel("Clear Slot 1")
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId(`clearping_1_${viewerId}`)
      .setLabel("Clear Slot 2")
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId(`clearping_2_${viewerId}`)
      .setLabel("Clear Slot 3")
      .setStyle(ButtonStyle.Danger)
  );

  return {
    embeds: pingEmbeds,
    files,
    components: [setRow, clearRow],
    flags: 64
  };
}

function getCardId(card) {
  return Number(card.season) === 1 ? card.id : `${card.season}${card.id}`;
}

function getCardImageUrl(card) {
  return `https://cdn.jsdelivr.net/gh/MrBibbles3/bonebot-test@${IMAGE_COMMIT}/images/S${card.season}/${getCardImageFileName(card)}?v=${BOT_VERSION}`;
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

function getCardImagePath(card) {
  return `./images/S${card.season}/${getCardImageFileName(card)}`;
}

function getCardImageUrl(card) {
  return `https://cdn.jsdelivr.net/gh/MrBibbles3/bonebot-test@${IMAGE_COMMIT}/images/S${card.season}/${getCardImageFileName(card)}?v=${BOT_VERSION}`;
}

function getInventorySortData(itemId) {
  const seasonMatch = itemId.match(/^(\d+)/);
  const season = seasonMatch ? parseInt(seasonMatch[1]) : 1;

  const numberMatch = itemId.match(/(\d+)$/);
  const number = numberMatch ? parseInt(numberMatch[1]) : 0;

  return { season, number };
}

function sortInventoryCards(a, b) {
  const aData = getInventorySortData(a.itemId);
  const bData = getInventorySortData(b.itemId);

  if (aData.season !== bData.season) {
    return aData.season - bData.season;
  }

  return aData.number - bData.number;
}

async function applyDailyTokenGrant(user) {
  const today = getBrisbaneToday();

  if (user.lastGlobalTokenDaily === today) {
    return user;
  }

  user.bibblesTokens = Math.min(
    MAX_BIBBLES_TOKENS,
    (user.bibblesTokens || 0) + DAILY_TOKEN_AMOUNT
  );

  user.lastGlobalTokenDaily = today;
  user.lastBibblesTokenRecharge = new Date();

  await user.save();
  return user;
}

async function rechargeBibblesTokens(user) {
  if (user.bibblesTokens === undefined || user.bibblesTokens === null) {
    user.bibblesTokens = MAX_BIBBLES_TOKENS;
  }

  if (!user.lastBibblesTokenRecharge) {
    user.lastBibblesTokenRecharge = new Date();
  }

  if (user.bibblesTokens >= MAX_BIBBLES_TOKENS) {
    user.lastBibblesTokenRecharge = new Date();
    await user.save();
    return user;
  }

  const now = Date.now();
  const lastRecharge = new Date(user.lastBibblesTokenRecharge).getTime();
  const elapsed = now - lastRecharge;

  const tokensToAdd = Math.floor(elapsed / BIBBLES_TOKEN_RECHARGE_MS);

  if (tokensToAdd > 0) {
    user.bibblesTokens = Math.min(MAX_BIBBLES_TOKENS, user.bibblesTokens + tokensToAdd);

    const leftoverMs = elapsed % BIBBLES_TOKEN_RECHARGE_MS;
    user.lastBibblesTokenRecharge = new Date(now - leftoverMs);

    await user.save();
  }

  return user;
}

function getNextTokenText(user) {
  if (user.bibblesTokens >= MAX_BIBBLES_TOKENS) {
    return "Full!";
  }

  const now = Date.now();
  const lastRecharge = new Date(user.lastBibblesTokenRecharge).getTime();
  const nextRecharge = lastRecharge + BIBBLES_TOKEN_RECHARGE_MS;
  const remaining = Math.max(0, nextRecharge - now);

  const hours = Math.floor(remaining / (60 * 60 * 1000));
  const minutes = Math.ceil((remaining % (60 * 60 * 1000)) / (60 * 1000));

  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

async function spendBibblesToken(user) {
  await rechargeBibblesTokens(user);

  if (user.bibblesTokens <= 0) {
    return false;
  }

  user.bibblesTokens -= 1;
  await user.save();

  return true;
}


async function startCoinFlip(interaction, bet) {
  const embed = new EmbedBuilder()
    .setTitle("<:BToken:1518219006392274995> Coin Flip")
    .setDescription(
      `Bet: **${bet} bones**\n\n` +
      "You get **3 flips**.\n" +
      "Choose Heads or Tails!"
    )
    .addFields(
      { name: "Flips Left", value: "3", inline: true },
      { name: "Wins", value: "0", inline: true }
    )
    .setColor(0xf5c542);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`coinflip_heads_${interaction.user.id}_3_0_${bet}`)
      .setLabel("Heads")
      .setEmoji("<:BHeads:1519545907920765028>")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(`coinflip_tails_${interaction.user.id}_3_0_${bet}`)
      .setLabel("Tails")
      .setEmoji("<:BTails:1519545923632631879>")
      .setStyle(ButtonStyle.Danger)
  );

  return interaction.update({
    embeds: [embed],
    components: [row]
  });
}

async function showCoinFlipBetMenu(interaction, user) {
  const embed = new EmbedBuilder()
    .setTitle("<:BToken:1518219006392274995> Coin Flip")
    .setDescription(
      "You used **1 Bibbles Token**.\n\n" +
      "Choose your bet:\n\n" +
      "Each game gives you **3 flips**.\n" +
      "Each correct flip pays back **1x your bet**.\n" +
      "Get all **3/3** for a bonus **+1x your bet**!"
    )
    .addFields(
      { name: "Your Bones", value: `${user.bones} <:BBones:1518220991938170910>`, inline: true }
    )
    .setColor(0xf5c542);

  const row = new ActionRowBuilder().addComponents(
    ...COINFLIP_BETS.map(bet =>
      new ButtonBuilder()
        .setCustomId(`coinflip_bet_${bet}_${interaction.user.id}`)
        .setLabel(`Bet ${bet}`)
        .setEmoji("<:BBones:1518220991938170910>")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(user.bones < bet)
    )
  );

  return interaction.reply({
    embeds: [embed],
    components: [row],
    flags: 64
  });
}

async function showGraveRobberyBetMenu(interaction, user) {
  const embed = new EmbedBuilder()
    .setTitle("⚰️ Grave Robbery")
    .setDescription(
      "You used **1 Bibbles Token**.\n\n" +
      "Choose your bet:\n\n" +
      "You get **3 graves**.\n" +
      "Each grave has either **treasure** or a **curse**."
    )
    .addFields(
      { name: "Your Bones", value: `${user.bones} <:BBones:1518220991938170910>`, inline: true }
    )
    .setColor(0x7b3f00);

const row = new ActionRowBuilder().addComponents(
    ...GRAVEROBBERY_BETS.map(bet =>
      new ButtonBuilder()
        .setCustomId(`graverobbery_bet_${bet}_${interaction.user.id}`)
        .setLabel(`Bet ${bet}`)
        .setEmoji("<:BBones:1518220991938170910>")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(user.bones < bet)
    )
  );

  return interaction.reply({
    embeds: [embed],
    components: [row],
    flags: 64
  });
}

async function startGraveRobbery(interaction, bet) {
  const embed = new EmbedBuilder()
    .setTitle("⚰️ Grave Robbery")
    .setDescription(
      `Bet: **${bet} bones**\n\n` +
      "Pick a grave.\n" +
      "You have **3 rounds**."
    )
    .addFields(
      { name: "Rounds Left", value: "3", inline: true },
      { name: "Treasures Found", value: "0", inline: true }
    )
    .setColor(0x7b3f00);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`graverobbery_pick_1_${interaction.user.id}_3_0_${bet}`)
      .setLabel("Grave 1")
      .setEmoji("⚰️")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(`graverobbery_pick_2_${interaction.user.id}_3_0_${bet}`)
      .setLabel("Grave 2")
      .setEmoji("⚰️")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(`graverobbery_pick_3_${interaction.user.id}_3_0_${bet}`)
      .setLabel("Grave 3")
      .setEmoji("⚰️")
      .setStyle(ButtonStyle.Secondary)
  );

  return interaction.update({
    embeds: [embed],
    components: [row]
  });
}


async function showBlackjackBetMenu(interaction, user) {
  const embed = new EmbedBuilder()
    .setTitle("🃏 Blackjack")
    .setDescription(
      "Choose your bet.\n\n" +
      "Can you get closer to **21** than the Dealer?\n"
    )
    .addFields({
      name: "Your Bones",
      value: `${user.bones} <:BBones:1518220991938170910>`
    })
    .setColor(0x2ecc71);

  const row = new ActionRowBuilder().addComponents(
    ...BLACKJACK_BETS.map(bet =>
      new ButtonBuilder()
        .setCustomId(`blackjack_bet_${bet}_${interaction.user.id}`)
        .setLabel(`Bet ${bet}`)
        .setEmoji("<:BBones:1518220991938170910>")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(user.bones < bet)
    )
  );

  return interaction.reply({
    embeds: [embed],
    components: [row],
    flags: 64
  });
}

async function showHigherLowerBetMenu(interaction, user) {
  const embed = new EmbedBuilder()
    .setTitle("⬆️ Higher or Lower")
    .setDescription(
      "Guess whether the next card will be higher or lower.\n\n" +
      "Cash out anytime.\n" +
      "One wrong guess loses everything."
    )
    .addFields(
    {
      name: "Your Bones",
      value: `${user.bones} <:BBones:1518220991938170910>`,
      inline: true
    },
    {
      name: "Best Streak",
      value: `${user.highlowBestStreak || 0}`,
      inline: true
    }
  )
    .setColor(0x5865f2);

  const row = new ActionRowBuilder().addComponents(
    ...HIGHLOW_BETS.map(bet =>
      new ButtonBuilder()
        .setCustomId(`highlow_bet_${bet}_${interaction.user.id}`)
        .setLabel(`Bet ${bet}`)
        .setEmoji("<:BBones:1518220991938170910>")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(user.bones < bet)
    )
  );

  return interaction.reply({
    embeds: [embed],
    components: [row],
    flags: 64
  });
}

async function showBoneDigBetMenu(interaction, user) {
  const embed = new EmbedBuilder()
    .setTitle("⛏️ Bone Dig")
    .setDescription(
      "Pick rocks and dig for treasure.\n\n" +
      "Find bones, treasure, or relics.\n" +
      "Hit a trap and lose everything.\n" +
      "Cash out anytime."
    )
    .addFields({
      name: "Your Bones",
      value: `${user.bones} <:BBones:1518220991938170910>`
    })
    .setColor(0xc27c2c);

  const row = new ActionRowBuilder().addComponents(
    ...BONEDIG_BETS.map(bet =>
      new ButtonBuilder()
        .setCustomId(`bonedig_bet_${bet}_${interaction.user.id}`)
        .setLabel(`Bet ${bet}`)
        .setEmoji("<:BBones:1518220991938170910>")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(user.bones < bet)
    )
  );

  return interaction.reply({
    embeds: [embed],
    components: [row],
    flags: 64
  });
}

async function showGamesMenu(interaction, user, useUpdate = false) {
  await rechargeBibblesTokens(user);

  const nextToken = getNextTokenText(user);

  const embed = new EmbedBuilder()
    .setTitle("🎮 Bibbles Games")
    .setDescription(
      `Welcome to the BoneBot arcade!\n\n` +
      `<:BToken:1518219006392274995> **Game Tokens:** ${user.bibblesTokens}/${MAX_BIBBLES_TOKENS}\n` +
      `⏳ **Next Token:** ${nextToken}\n\n` +
      `Choose a game below:`
    )
    .addFields(
      {
        name: "<:BToken:1518219006392274995> Coin Flip",
        value: "3 flips per token.",
        inline: true
      },
      {
        name: "⚰️ Grave Robbery",
        value: "Rob 3 graves per token.",
        inline: true
      },
      {
        name: "🃏 Blackjack",
        value: "1 hand per token.",
        inline: true
      },
      {
        name: "⬆️ Higher or Lower",
        value: "Climb the multiplier.",
        inline: true
      },
      {
        name: "⛏️ Bone Dig",
        value: "Dig, cash out, or perish.",
        inline: true
      }
    )
    .setColor(0xf5c542);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`game_coinflip_${interaction.user.id}`)
      .setLabel("Coin Flip")
      .setEmoji("<:BToken:1518219006392274995>")
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId(`game_graverobbery_${interaction.user.id}`)
      .setLabel("Grave Robbery")
      .setEmoji("⚰️")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(`game_blackjack_${interaction.user.id}`)
      .setLabel("Blackjack")
      .setEmoji("🃏")
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId(`game_higherlower_${interaction.user.id}`)
      .setLabel("Higher/Lower")
      .setEmoji("⬆️")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId(`game_bonedig_${interaction.user.id}`)
      .setLabel("Bone Dig")
      .setEmoji("⛏️")
      .setStyle(ButtonStyle.Success)
  );

  const payload = {
    embeds: [embed],
    components: [row]
  };

  if (useUpdate) {
    return interaction.update(payload);
  }

  return interaction.reply({
    ...payload,
    flags: 64
  });
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




async function buildLeaderboardPayload(interaction, type, page = 0) {
  const PAGE_SIZE = 10;

  let users = await User.find().lean();

  let title;
  let getValue;
  let statLabel;

  if (type === "spent") {
    title = "🛒 Leaderboard Bones Spent";
    statLabel = "bones spent";
    getValue = user => user.bonesSpentTotal || 0;
  } else if (type === "earned") {
    title = "📜 Leaderboard All Time Balance";
    statLabel = "bones earned";
    getValue = user => user.bonesEarnedTotal || 0;
  } else if (type === "daily") {
    title = "🔥 Leaderboard Daily Streak";
    statLabel = "day streak";
    getValue = user => user.dailyStreak || 0;
  } else {
    title = "⬆️ Leaderboard High Low Streak";
    statLabel = "best streak";
    getValue = user => user.highlowBestStreak || 0;
  }

  users = users
    .filter(user => getValue(user) > 0)
    .sort((a, b) => getValue(b) - getValue(a));

  const totalPages = Math.max(1, Math.ceil(users.length / PAGE_SIZE));
  page = Math.max(0, Math.min(page, totalPages - 1));

  const pageUsers = users.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const lines = await Promise.all(
    pageUsers.map(async (user, index) => {
      const rank = page * PAGE_SIZE + index + 1;

      const displayName = `<@${user.userId}>`;

      const place =
        rank === 1 ? "🥇" :
        rank === 2 ? "🥈" :
        rank === 3 ? "🥉" :
        `**${rank}.**`;

      return `${place} ${displayName} - **${getValue(user).toLocaleString()}** ${statLabel}`;
    })
  );

  const yourIndex = users.findIndex(user => user.userId === interaction.user.id);
  const yourPosition =
    yourIndex === -1 ? "Unranked" : `#${yourIndex + 1}`;

  const embed = new EmbedBuilder()
    .setTitle(`${title} (Page ${page + 1}/${totalPages})`)
    .setDescription(
      `${lines.join("\n") || "No leaderboard data yet."}\n\n` +
      `🏅 **Your Position:** **${yourPosition}**`
    )
    .setColor(0x5865f2);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`leaderboard_prev_${type}_${page}_${interaction.user.id}`)
      .setEmoji("◀️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),

    new ButtonBuilder()
      .setLabel(`Page ${page + 1}/${totalPages}`)
      .setStyle(ButtonStyle.Primary)
      .setCustomId("leaderboard_page")
      .setDisabled(true),

    new ButtonBuilder()
      .setCustomId(`leaderboard_next_${type}_${page}_${interaction.user.id}`)
      .setEmoji("▶️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1)
  );

  return {
    embeds: [embed],
    components: [row],
    AllowedMentions: { parse: []}
  };
}

function getCardImageFileName(card) {
  const seasonFolder = path.join(__dirname, "images", `S${card.season}`);

  const gifPath = path.join(seasonFolder, `${card.id}.gif`);
  const pngPath = path.join(seasonFolder, `${card.id}.png`);

  if (fs.existsSync(gifPath)) return `${card.id}.gif`;
  return `${card.id}.png`;
}

function isCardGif(card) {
  return getCardImageFileName(card).toLowerCase().endsWith(".gif");
}



function getSeasonIndexData(user, season) {
  const seasonCards = Object.values(cards)
    .flat()
    .filter(card => {
      if (Number(card.season) !== Number(season)) return false;

      // Exclude the Season 1 reward card
      if (season === 1 && getCardId(card) === UNIQUE_UNLOCKS.bibbles.cardId) {
        return false;
      }

      // Exclude the Season 2 reward card
      if (season === 2 && getCardId(card) === UNIQUE_UNLOCKS.appl.cardId) {
        return false;
      }

      return true;
    })
    .sort((a, b) =>
      getCardId(a).localeCompare(getCardId(b), undefined, { numeric: true })
    );

  const ownedCards = seasonCards.filter(card =>
    user.inventory.some(inv =>
      inv.itemId === getCardId(card) &&
      inv.quantity > 0
    )
  );

  return {
    seasonCards,
    ownedCards,
    ownedCount: ownedCards.length,
    totalCount: seasonCards.length,
    complete: ownedCards.length === seasonCards.length
  };
}

function getShopSeasonsForToday() {
  const day = new Date().getDay();
  // 0 = Sunday
  // 1 = Monday
  // 2 = Tuesday
  // 3 = Wednesday
  // 4 = Thursday
  // 5 = Friday
  // 6 = Saturday

  // Sunday, Monday, Tuesday = Season 2 only
  if ([0, 1, 2].includes(day)) {
    return [2];
  }

  // Wednesday, Thursday, Friday, Saturday = Both Seasons
  return [1, 2];
}

//Brisbane Time Function
function getBrisbaneToday() {
  return new Date (
    new Date().toLocaleString("en-US", { timeZone: "Australia/Brisbane"})
  ).toDateString();
}

async function notifyPingUsers(shopItems) {
  const shopCardIds = shopItems.map(card => getCardId(card));

  const usersWithPings = await User.find({
    pingCards: { $exists: true, $ne: [] }
  });

  for (const userData of usersWithPings) {
    if (!userData.pingCards || userData.pingCards.length === 0) continue;

    const matchedCardIds = userData.pingCards.filter(cardId =>
      cardId && shopCardIds.includes(cardId)
    );

    if (matchedCardIds.length === 0) continue;

    const matchedCards = shopItems.filter(card =>
      matchedCardIds.includes(getCardId(card))
    );

    try {
      const discordUser = await client.users.fetch(userData.userId);

      for (const card of matchedCards) {
        const pingEmbed = new EmbedBuilder()
          .setTitle("📡 Ping Alert!")
          .setDescription(
            `Your tracked card **${card.name}** is now available in the Bone Emporium! <:BBones:1518220991938170910>`
          )
          .setColor(rarities[card.rarity].color)
          .addFields(
            { name: "SN", value: `\`${card.season}\``, inline: true },
            { name: "Card ID", value: `\`${getCardId(card)}\``, inline: true },
            { name: "Rarity", value: card.rarity, inline: true }
          );

        const files = [];

        if (OFFLINE_IMAGES) {
          const fileName = `ping_${getCardId(card)}.png`;

          const attachment = new AttachmentBuilder(getCardImagePath(card), {
            name: fileName
          });

          pingEmbed.setImage(`attachment://${fileName}`);
          files.push(attachment);
        } else {
          pingEmbed.setImage(getCardImageUrl(card));
        }

        await discordUser.send({
          embeds: [pingEmbed],
          files
        });
      }

      console.log(`Ping DM sent to ${userData.userId}`);
    } catch (err) {
      console.error(`Could not DM user ${userData.userId}:`, err.message);
    }
  }
}


function getCardsForRarity(rarity) {
  if (rarity === 'SPECIAL') {
    return [
      ...(cards.UNIQUE || []),
      ...(cards.EVENT || [])
    ];
  }

  return cards[rarity] || [];
}

function getRarityDisplay(rarity) {
  if (rarity === 'SPECIAL') {
    return {
      name: 'Special',
      emoji: '🌸',
      color: 0xFFB6C1
    };
  }

  return rarities[rarity];
}



//Card Shop
function getRandomCard(rarityKey) {
  const pool = cards[rarityKey];

  if (!pool || pool.length === 0) return null;

  const card = pool[Math.floor(Math.random() * pool.length)];

  return {
    ...card,
    rarity: rarityKey
  };
}


//
// Shop Function
//
async function postShop(channel) {

  // Clear old countdown interval
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }

  // Delete previous shop messages
  for (const msg of currentShopMessages) {
    try {
      await msg.delete();
    } catch (err) {}
  }

  currentShopMessages = [];

  const shopItems = generateShop();

  await notifyPingUsers(shopItems);

  shopEndTime = Date.now() + (60 * 60 * 1000); // 60 minutes

  // Send header
  shopHeaderMessage = await channel.send("Loading shop...");

  currentShopMessages.push(shopHeaderMessage);

  // Send cards
  for (const card of shopItems) {

    const rarityData = rarities[card.rarity.toUpperCase()];

    const cardEmbed = new EmbedBuilder()
      .setColor(rarityData.color)
      .setTitle(card.name)
      .setDescription(
        `${rarityData.emoji} **${rarityData.name}** ${rarityData.emoji}\n\n` +
        `**Price:** \`${card.price}\`<:BBones:1518220991938170910>\n` +
        `**Season:** \`${card.season}\`\n` +
        `**Card ID:** \`${getCardId(card)}\``
      )
      .setFooter({ text: "Click Buy to purchase" });

    let files = [];

    if (OFFLINE_IMAGES) {
      const fileName = getCardImageFileName(card);
      const attachment = new AttachmentBuilder(getCardImagePath(card), {
        name: fileName
      });

      if (isCardGif(card)) {
        cardEmbed.setImage(`attachment://${fileName}`);
      } else {
        cardEmbed.setImage(`attachment://${fileName}`);
      }
      files.push(attachment);
    } else {
      if (isCardGif(card)) {
        cardEmbed.setImage(getCardImageUrl(card));
      } else {
        cardEmbed.setImage(getCardImageUrl(card));
      }
    }

      const ownRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`owncheck_${getCardId(card)}`)
          .setLabel("Do I own this?")
          .setEmoji("🔍")
          .setStyle(ButtonStyle.Primary)
      );

      const buyRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`buy_${getCardId(card)}_1`)
          .setLabel("Buy 1")
          .setEmoji("<:BBones:1518220991938170910>")
          .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
          .setCustomId(`buy_${getCardId(card)}_5`)
          .setLabel("Buy 5")
          .setEmoji("<:BBones:1518220991938170910>")
          .setStyle(ButtonStyle.Success)
      );
    const msg = await channel.send({
      embeds: [cardEmbed],
      components: [ownRow, buyRow],
      files
    });

    currentShopMessages.push(msg);
  }

  

  // Start countdown updater
  // Start countdown updater
  countdownInterval = setInterval(async () => {

  const timeLeft = shopEndTime - Date.now();

  if (timeLeft <= 0) {
    clearInterval(countdownInterval);
    countdownInterval = null;
    return;
  }

  const secondsTotal = Math.floor(timeLeft / 1000);
  const minutes = Math.floor(secondsTotal / 60);
  const seconds = secondsTotal % 60;

  const formatted = `${minutes}m ${seconds}s`;

  try {
    await shopHeaderMessage.edit(
      `# <:BBones:1518220991938170910> The Bone Emporium!\n🔥 Rotating Stock 🔥\n\n⏳ Refreshes in: **${formatted}**`
    );
  } catch (err) {}

  // 🔥 Switch to 1 second updates when 30 seconds remain
  if (timeLeft <= 30000 && countdownInterval) {

    clearInterval(countdownInterval);

    countdownInterval = setInterval(async () => {

      const finalTimeLeft = shopEndTime - Date.now();

      if (finalTimeLeft <= 0) {
        clearInterval(countdownInterval);
        countdownInterval = null;
        return;
      }

      const sec = Math.floor(finalTimeLeft / 1000);
      const m = Math.floor(sec / 60);
      const s = sec % 60;

      try {
        await shopHeaderMessage.edit(
          `# <:BBones:1518220991938170910> The Bone Emporium!\n🔥 Rotating Stock 🔥\n\n⏳ Refreshes in: **${m}m ${s}s**`
        );
      } catch (err) {}

    }, 1000);

  }

}, 10000); // Start with 10 second interval

}


function addRandomUniqueCard(shop, rarity, seasons) {
  const pool = cards[rarity].filter(card =>
    seasons.includes(Number(card.season)) &&
    !shop.some(existing => getCardId(existing) === getCardId(card))
  );

  if (pool.length === 0) return;

  const randomCard = pool[Math.floor(Math.random() * pool.length)];
  shop.push(randomCard);
}

function generateShop() {
  const shop = [];
  const shopSeasons = getShopSeasonsForToday();

  addRandomUniqueCard(shop, 'COMMON', shopSeasons);

  const thirdShop = Math.random() < 0.5 ? 'COMMON' : 'EPIC';
  addRandomUniqueCard(shop, thirdShop, shopSeasons);

  addRandomUniqueCard(shop, 'EPIC', shopSeasons);

  addRandomUniqueCard(shop, 'SECRET', shopSeasons);

  const roll = Math.random();

  let fifthShop;

  if (roll < 0.45) {
    fifthShop = 'SECRET';
  } else if (roll < 0.90) {
    fifthShop = 'NIGHTMARE';
  } else {
    fifthShop = 'APEX';
  }

  addRandomUniqueCard(shop, fifthShop, shopSeasons);

  if (Math.random() < 0.01) {
    addRandomUniqueCard(shop, 'UNIQUE', shopSeasons);
  }

  return shop;
}


function canUseRefund(user) {
  if (!user.lastRefundAt) return true;

  const today = getBrisbaneToday();

  const lastRefundDate = new Date(
    new Date(user.lastRefundAt).toLocaleString("en-US", { 
      timeZone: "Australia/Brisbane"
    })
  ).toDateString();

  return lastRefundDate !== today;
}









// Message commands and counter

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  

  if (message.channel.isDMBased()) {

    let reply;

    if (Math.random() < 0.01) {
      reply = RARE_DM_REPLIES[
        Math.floor(Math.random() * RARE_DM_REPLIES.length)
      ];
    } else {
      reply = DM_REPLIES[
        Math.floor(Math.random() * DM_REPLIES.length)
      ];
    }

    return message.reply(reply);
  }

  

  // ========================
  // RESET REFUND
  // ========================
  if (message.content.toLowerCase().startsWith('!resetrefund')) {

    if (!message.member.permissions.has('Administrator')) {
      return message.reply("You don't have permission.");
    }

    const target = message.mentions.users.first();

    if(!target) {
      return message.reply("Usage: !resetrefund @user 🤓");
    }

    const user = await getOrCreateUser(target.id);

    user.lastRefundAt = null;

    await user.save();

    return message.reply("<:BBones:1518220991938170910> Resetteded Yo Refund.");
  }

  
  // ========================
  // GIVE TOKENS
  // ========================
  if (message.content.startsWith("!givetokens")) {
    if (!message.member.permissions.has("Administrator")) return;

    const target = message.mentions.users.first();
    const amount = Number(message.content.split(" ")[2]);

    if (!target || !Number.isInteger(amount) || amount <= 0) {
      return message.reply("Usage: `!givetokens @user amount`");
    }

    const user = await getOrCreateUser(target.id);

    user.bibblesTokens = (user.bibblesTokens || 0) + amount;
    await user.save();

    return message.reply(
      `🎮 Gave **${amount} Bibbles Tokens** to ${target.username}. They now have **${user.bibblesTokens}** tokens.`
    );
  }

  // ========================
  // REMOVE TOKENS
  // ========================
  if (message.content.startsWith("!removetokens")) {
    if (!message.member.permissions.has("Administrator")) return;

    const target = message.mentions.users.first();
    const amount = Number(message.content.split(" ")[2]);

    if (!target || !Number.isInteger(amount) || amount <= 0) {
      return message.reply("Usage: `!removetokens @user amount`");
    }

    const user = await getOrCreateUser(target.id);

    user.bibblesTokens = Math.max(0, (user.bibblesTokens || 0) - amount);
    await user.save();

    return message.reply(
      `🎮 Removed **${amount} Bibbles Tokens** from ${target.username}. They now have **${user.bibblesTokens}** tokens.`
    );
  }


  // ========================
  // E RESET USER
  // ========================
  if (message.content.toLowerCase().startsWith('!eresetuser')) {

    if (!message.member.permissions.has('Administrator')) {
      return message.reply("You don't have permission.");
    }

    const target = message.mentions.users.first();

    if(!target) {
      return message.reply("Usage: !eresetuser @user 🤓");
    }

    const user = await getOrCreateUser(target.id);

      const resetEmbed = new EmbedBuilder()
      .setColor(0xE5C07B)
      .setTitle('<:BBones:1518220991938170910> Bone Balance <:BBones:1518220991938170910>')
      .setDescription(`${target}'s balance:`)
      .addFields(
        { name: 'Bones', value: `\`0\``, inline: true }
      )
      .setTimestamp();

      return message.reply({
        content: `Got it Boss! ${target} has been COMPLETELY WIPED 👹MWUHAHAHAHAHAH👹`,
        embeds: [resetEmbed]
      });
    
    
  }
  
  
  // ========================
  // USER INFO JSON
  // ========================
  if (message.content.toLowerCase().startsWith("!userinfojson")) {
    if (!message.member.permissions.has("Administrator")) {
      return message.reply("You don't have permission.");
    }

    const target =
      message.mentions.users.first() || message.author;

    const user = await User.findOne({
      userId: target.id
    });

    if (!user) {
      return message.reply("User not found.");
    }

    const json = JSON.stringify(
      user.toObject(),
      null,
      2
    );

    if (json.length > 1900) {
      const attachment = new AttachmentBuilder(
        Buffer.from(json, "utf8"),
        { name: `userinfo-${target.id}.json` }
      );

      return message.reply({
        content: `📄 User data for ${target.username}`,
        files: [attachment]
      });
    }

    return message.reply({
      content:
        "```json\n" +
        json +
        "\n```"
    });
  }


  // ========================
  // USER INFO 
  // ========================
  if (message.content.toLowerCase().startsWith("!userinfo")) {
    
    const target =
      message.mentions.users.first() || message.author;

    const user = await User.findOne({
      userId: target.id
    });

    if (!user) {
      return message.reply("User not found.");
    }

    const embed = new EmbedBuilder()
      .setTitle(`<:BBones:1518220991938170910> User Info: ${target.username}`)
      .setColor(0xf5c542)
      .setDescription(
        `**User ID:** ${user.userId}\n` +
        `**Bones:** ${user.bones}\n` +
        `**Bones Earned:** ${user.bonesEarnedTotal ?? "N/A"}\n` +
        `**Bones Spent:** ${user.bonesSpentTotal ?? "N/A"}\n` +
        `**Daily Streak:** ${user.dailyStreak ?? 0}\n` +
        `**Capped Streak:** ${user.cappedStreak ?? 0}\n` +
        `**Best HL Streak:** ${user.highlowBestStreak ?? 0}\n` +
        `**Bibbles Tokens:** ${user.bibblesTokens ?? 0}\n` +
        `**Inventory Slots:** ${user.inventory?.length ?? 0}\n` +
        `**Ping Cards:** ${(user.pingCards || []).filter(Boolean).length}/3`
      );

    return message.reply({
      embeds: [embed]
    });
  }


  // ========================
  // SETUP SPENT TOTALS ONCE
  // ========================
  if (message.content === "!migratecardspending") {
    if (!message.member.permissions.has("Administrator")) return;

    const allCards = Object.values(cards).flat();

    const users = await User.find();

    let updatedUsers = 0;
    let totalSet = 0;
    let missingCards = 0;

    for (const user of users) {
      let userCardValue = 0;

      for (const invItem of user.inventory || []) {
        const card = allCards.find(c =>
          getCardId(c) === invItem.itemId
        );

        if (!card) {
          missingCards++;
          console.log(
            `[MIGRATE CARD SPENDING] Missing card for itemId: ${invItem.itemId} user: ${user.userId}`
          );
          continue;
        }

        const quantity = invItem.quantity || 0;
        userCardValue += card.price * quantity;
      }

      user.bonesSpentTotal = userCardValue;
      user.bonesEarnedTotal = userCardValue;
      await user.save();

      updatedUsers++;
      totalSet += userCardValue;
    }

    return message.reply(
      `<:BBones:1518220991938170910> Card spending migration complete.\n` +
      `Updated users: \`${updatedUsers}\`\n` +
      `Total bonesSpentTotal set across users: \`${totalSet}\`\n` +
      `Missing card lookups: \`${missingCards}\``
    );
  }


  // ========================
  // SETUP UPDATED VALUES
  // ========================
  if (message.content === "!migrateUpdate") {
    if (!message.member.permissions.has("Administrator")) return;

    const users = await User.find();

    let updated = 0;

    for (const user of users) {
      let changed = false;

      // Daily streak cap migration
      const cappedValue = Math.min(user.dailyStreak || 0, 30);

      if (user.cappedStreak !== cappedValue) {
        user.cappedStreak = cappedValue;
        changed = true;
      }

      if (user.highlowBestStreak == null) {
        user.highlowBestStreak = 0;
        changed = true;
      }

      if (user.bonesEarnedTotal == null) {
        user.bonesEarnedTotal = user.bones || 0;
        changed = true;
      }

      if (user.bonesSpentTotal == null) {
        user.bonesSpentTotal = 0;
        changed = true;
      }

      if (user.pingCards == null) {
        user.pingCards = [null, null, null];
        changed = true;
      }

      if (changed) {
        await user.save();
        updated++;
      }
    }

    return message.reply(
      `<:BBones:1518220991938170910> Migration complete.\nUpdated ${updated} users.`
    );
  }

  // ========================
  // RESET DAILY
  // ========================
  if (message.content.toLowerCase().startsWith('!resetdaily')) {

    if (!message.member.permissions.has('Administrator')) {
      return message.reply("You don't have permission.");
    }

    const target = message.mentions.users.first();

    if(!target) {
      return message.reply("Usage: !resetdaily @user 🤓");
    }

    const user = await getOrCreateUser(target.id);

    user.dailyLastClaim = null;
    
    await user.save();

    return message.reply("⏱️ Resetteded Yo Daily.");
  }

  // ========================
  // WIPE USER COMMAND
  // ========================
  if (message.content.startsWith('!wipeuser')) {

    if (!message.member.permissions.has('Administrator')) {
      return message.reply("You don't have permission to use this command.");
    }

    const target = message.mentions.users.first();

    if (!target) {
      return message.reply("Usage: !wipeuser @user");
    }

    const user = await User.findOne({ userId: target.id });

    if (!user) {
      return message.reply("That user does not have an account.");
    }

    user.bones = 0;
    user.inventory = [];
    user.dailyStreak = 0;
    user.cappedStreak = 0;
    user.dailyLastClaim = null;

    await user.save();

    return message.channel.send(
      `💀 ${target.username}'s account has been wiped.\n` +
      `<:BBones:1518220991938170910>: 0\nInventory: Cleared\nStreak: Reset`
    );
  }


  // ========================
  // GIVE CARD COMMAND
  // ========================
  if (message.content.toLowerCase().startsWith("!giveall")) {
    if (!message.member.permissions.has("Administrator")) {
      return message.reply("You don't have permission.");
    }

    const args = message.content.split(/\s+/);

    const target = message.mentions.users.first();
    const rarity = args[2]?.toUpperCase();
    const season = Number(args[3]);

    if (!target || !rarity || !season) {
      return message.reply("Usage: `!giveall @user RARITY SEASON`");
    }

    if (!cards[rarity]) {
      return message.reply(`Invalid rarity: \`${rarity}\``);
    }

    let user = await User.findOne({ userId: target.id });

    if (!user) {
      user = new User({
        userId: target.id,
        bones: 0,
        inventory: []
      });
    }

    let added = 0;
    let alreadyOwned = 0;

    const cardsToGive = cards[rarity].filter(card =>
      Number(card.season) === season
    );

    for (const card of cardsToGive) {
      const fullCardId = getCardId(card);

      const existingCard = user.inventory.find(i =>
        i.itemId === fullCardId
      );

      if (existingCard) {
        alreadyOwned++;
        continue;
      }

      user.inventory.push({
        itemId: fullCardId,
        quantity: 1
      });

      added++;
    }

    await user.save();

    const unlockEmbeds = await checkUnlocks(user, target);

    return message.reply({
      content:
        `✅ Gave **${added}** ${rarity} Season ${season} cards to ${target}.\n` +
        `Already owned: **${alreadyOwned}**`,
      embeds: unlockEmbeds
    });
  }



  // ========================
  // GIVE CARD COMMAND
  // ========================
  if (message.content.startsWith('!givecard')) {

    if (!message.member.permissions.has('Administrator')) {
      return message.reply("You don't have permission to use this command.");
    }

    const args = message.content.split(' ');

    const target = message.mentions.users.first();
    const cardId = args[2];
    const amount = parseInt(args[3]) || 1;

    if (!target || !cardId || amount <= 0) {
      return message.reply("Usage: !givecard @user CARD_ID [amount]");
    }

    // Find card in your card pool
    
    console.log("Searching for:", cardId);

      const allCards = Object.values(cards).flat();

      console.log(
        allCards
          .filter(c => c.season === 2)
          .map(c => getCardId(c))
      );
    const card = findCardById(cardId);

    if (!card) {
      return message.reply("Invalid Card ID.");
    }

    let user = await User.findOne({ userId: target.id });

    if (!user) {
      user = new User({
        userId: target.id,
        bones: 0,
        inventory: []
      });
    }

    const fullCardId = getCardId(card);

    const existingCard = user.inventory.find(i => i.itemId === fullCardId);

    if (existingCard) {
      existingCard.quantity += amount;
    } else {
      user.inventory.push({
        itemId: fullCardId,
        quantity: amount
      });
    }

    await user.save();

    return message.channel.send(
      `Gave \`${amount}\`x **${card.name}** to ${target}.`
    );
  }


  // ========================
  // REMOVE CARD COMMAND
  // ========================
  if (message.content.startsWith('!removecard')) {

    if (!message.member.permissions.has('Administrator')) {
      return message.reply("You don't have permission to use this command.");
    }

    const args = message.content.split(' ');

    const target = message.mentions.users.first();
    const cardId = args[2];
    const amount = parseInt(args[3]) || 1;

    if (!target || !cardId || amount <= 0) {
      return message.reply("Usage: !removecard @user CARD_ID [amount]");
    }

    let user = await User.findOne({ userId: target.id });

    if (!user) {
      return message.reply("That user has no inventory.");
    }

    const existingCard = user.inventory.find(i => i.itemId === cardId);

    if (!existingCard) {
      return message.reply("That user does not own this card.");
    }

    existingCard.quantity -= amount;

    if (existingCard.quantity <= 0) {
      user.inventory = user.inventory.filter(i => i.itemId !== cardId);
    }

    await user.save();

    return message.channel.send(
      `Removed \`${amount}\`x card \`${cardId}\` from ${target}.`
    );
  }


  // ========================
  // Bones Command
  // ========================
  if (message.content.startsWith('!givebones')) {

    // Only allow admins
    if (!message.member.permissions.has('Administrator')) {
      return message.reply("You don't have permission to use this command.");
    }

    const args = message.content.split(' ');

    const target = message.mentions.users.first();
    const amount = parseInt(args[2]);

    if (!target || isNaN(amount) || amount <= 0) {
      return message.reply("Usage: !givebones @user <amount>");
    }

    let user = await User.findOne({ userId: target.id });

    if (!user) {
      user = new User({
        userId: target.id,
        bones: 0,
        inventory: []
      });
    }

    user.bones += amount;
    await user.save();

    return message.channel.send(
      `Added \`${amount}\` <:BBones:1518220991938170910> to ${target}.`
    );
  }


  // ========================
  // REMOVE BONES COMMAND
  // ========================
  if (message.content.startsWith('!removebones')) {

    // Admin only
    if (!message.member.permissions.has('Administrator')) {
      return message.reply("You don't have permission to use this command.");
    }

    const args = message.content.split(' ');

    const target = message.mentions.users.first();
    const amount = parseInt(args[2]);

    if (!target || isNaN(amount) || amount <= 0) {
      return message.reply("Usage: !removebones @user <amount>");
    }

    let user = await User.findOne({ userId: target.id });

    if (!user) {
      return message.reply("That user does not have an account yet.");
    }

    user.bones -= amount;

    if (user.bones < 0) {
      user.bones = 0;
    }

    await user.save();

    return message.channel.send(
      `Removed \`${amount}\` <:BBones:1518220991938170910> from ${target}.\nNew Balance: \`${user.bones}\``
    );
  }


  // ========================
  // Shop Command
  // ========================

  if (message.content.toLowerCase() === '!shop') {
    if (!message.member.permissions.has('Administrator')) {
      return message.reply("You don't have permission to use this command.");
    }

    await postShop(message.channel);
    return;
  }



  // ----------------------
  // BONES EARNING SYSTEM
  // ----------------------

  const now = Date.now();
  const cooldownAmount = 30 * 1000; // 30 seconds

  if (cooldowns.has(message.author.id)) {
    const expirationTime = cooldowns.get(message.author.id) + cooldownAmount;

    if (now < expirationTime) {
      return; // Still on cooldown, do nothing
    }
  }

  cooldowns.set(message.author.id, now);

  const user = await getOrCreateUser(message.author.id);

  const bonesEarned = Math.floor(Math.random() * 5) + 5;
  user.bones += bonesEarned;
  user.bonesEarnedTotal += bonesEarned; 

  await user.save();

  console.log(`${message.author.username} earned ${bonesEarned} <:BBones:1518220991938170910> and now has ${user.bones}`);
});




client.on('interactionCreate', async interaction => {

  if (
    interaction.isButton() &&
    interaction.customId.startsWith("games_menu_")
  ) {
    const ownerId = interaction.customId.split("_")[2];

    if (interaction.user.id !== ownerId) {
      return interaction.reply({
        content: "💀 This isn’t your games menu!",
        flags: 64
      });
    }

    const user = await getOrCreateUser(interaction.user.id);

    return showGamesMenu(interaction, user, true);
  }

  // Ignore other interaction types (optional but clean)
  if (
    !interaction.isChatInputCommand() &&
    !interaction.isButton() &&
    !interaction.isModalSubmit()
  ) return;

  // Only allow interactions in specific channels
  if (!ALLOWED_CHANNELS.includes(interaction.channelId)) {

    if (interaction.replied || interaction.deferred) {
      return;
    }

    return interaction.reply({
      content: "<:BBones:1518220991938170910> Use Bone Bot in the shop or commands channel.",
      flags: 64
    });
  }


    // ========================
    // BLACKJACK BET
    // ========================
    if (
      interaction.isButton() &&
      interaction.customId.startsWith("blackjack_bet_")
    ) {
      const parts = interaction.customId.split("_");

      const bet = Number(parts[2]);
      const ownerId = parts[3];

      if (interaction.user.id !== ownerId) {
        return interaction.reply({
          content: "💀 This isn't your blackjack game!",
          flags: 64
        });
      }

      const user = await getOrCreateUser(interaction.user.id);

      if (!BLACKJACK_BETS.includes(bet)) {
        return interaction.reply({
          content: "Invalid bet.",
          flags: 64
        });
      }

      if (user.bones < bet) {
        return interaction.reply({
          content: "Not enough bones.",
          flags: 64
        });
      }

      user.bones -= bet;
      await user.save();

      return startBlackjack(interaction, bet);
    }

    // =====================================================
    // DO I OWN THIS BUTTON
    // =====================================================
    if (interaction.isButton() && interaction.customId.startsWith("owncheck_")) {
      const cardId = interaction.customId.replace("owncheck_", "");

      const user = await getOrCreateUser(interaction.user.id);

      const invItem = user.inventory.find(item => item.itemId === cardId);

      if (!invItem) {
        return interaction.reply({
          content: `❌ You do **not** own \`${cardId}\` yet.`,
          flags: 64
        });
      }

      return interaction.reply({
        content: `✅ You own \`${cardId}\`! Quantity: **${invItem.quantity}**`,
        flags: 64
      });
    }
    // =====================================================
    // BIBBLES GAME BUTTONS
    // =====================================================
    if (interaction.isButton() && interaction.customId.startsWith("game_")) {
      console.log("Game button clicked:", interaction.customId);

      const parts = interaction.customId.split("_");
      const gameName = parts[1];
      const ownerId = parts[2];

      if (interaction.user.id !== ownerId) {
        return interaction.reply({
          content: "💀 This isn’t your game menu!",
          flags: 64
        });
      }

      const user = await getOrCreateUser(interaction.user.id);


      if (gameName === "coinflip") {
        return showCoinFlipBetMenu(interaction, user);
      }

      if (gameName === "graverobbery") {
        return showGraveRobberyBetMenu(interaction, user);
      }

      if (gameName === "blackjack") {
        return showBlackjackBetMenu(interaction, user);
      }

      if (gameName === "higherlower") {
        return showHigherLowerBetMenu(interaction, user);
      }

      if (gameName === "bonedig") {
        return showBoneDigBetMenu(interaction, user);
      }
    }

    if (
        interaction.isButton() &&
        interaction.customId.startsWith("blackjack_") &&
        !interaction.customId.startsWith("blackjack_bet_")
      ) {
        return handleBlackjackButton(interaction);
      }
    
    // =====================================================
    // HIGHLOW BET BUTTONS
    // =====================================================
    if (
      interaction.isButton() &&
      interaction.customId.startsWith("highlow_") &&
      !interaction.customId.startsWith("highlow_bet_")
    ) {
      return handleHigherLowerButton(interaction);
    }

    if (
      interaction.isButton() &&
      interaction.customId.startsWith("highlow_bet_")
    ) {
      const parts = interaction.customId.split("_");

      const bet = Number(parts[2]);
      const ownerId = parts[3];

      if (interaction.user.id !== ownerId) {
        return interaction.reply({
          content: "💀 This isn’t your Higher or Lower game!",
          flags: 64
        });
      }

      const user = await getOrCreateUser(interaction.user.id);

      if (!HIGHLOW_BETS.includes(bet)) {
        return interaction.reply({
          content: "💀 Invalid bet.",
          flags: 64
        });
      }

      if (user.bones < bet) {
        return interaction.reply({
          content: `💀 You don’t have enough bones to bet **${bet}**.`,
          flags: 64
        });
      }

      const paid = await spendBibblesToken(user);

      if (!paid) {
        return interaction.reply({
          content: "💀 You have no Bibbles Tokens left!",
          flags: 64
        });
      }
      
      user.bones -= bet;
      await user.save();

      try {
        return await startHigherLower(interaction, bet);
      } catch (err) {
        console.error("Higher/Lower start error:", err);

        if (!interaction.replied && !interaction.deferred) {
          return interaction.reply({
            content: "💀 Higher or Lower crashed while starting.",
            flags: 64
          });
        }
      }return startHigherLower(interaction, bet);
    }


    // =====================================================
    // GRAVE ROBBERY BET BUTTONS
    // =====================================================
    if (interaction.isButton() && interaction.customId.startsWith("graverobbery_bet_")) {
      const parts = interaction.customId.split("_");

      const bet = Number(parts[2]);
      const ownerId = parts[3];

      if (interaction.user.id !== ownerId) {
        return interaction.reply({
          content: "💀 This isn’t your Grave Robbery game!",
          flags: 64
        });
      }

      const user = await getOrCreateUser(interaction.user.id);

      if (!GRAVEROBBERY_BETS.includes(bet)) {
        return interaction.reply({
          content: "💀 Invalid bet.",
          flags: 64
        });
      }

      if (user.bones < bet) {
        return interaction.reply({
          content: `💀 You don’t have enough bones to bet **${bet}**.`,
          flags: 64
        });
      }

      const paid = await spendBibblesToken(user);

      if (!paid) {
        return interaction.reply({
          content: "💀 You have no Bibbles Tokens left!",
          flags: 64
        });
      }

      user.bones -= bet;
      await user.save();

      return startGraveRobbery(interaction, bet);
    }

    // =====================================================
    // GRAVE ROBBERY PICK BUTTONS
    // =====================================================
    if (interaction.isButton() && interaction.customId.startsWith("graverobbery_pick_")) {
      const parts = interaction.customId.split("_");

      const pickedGrave = parts[2];
      const ownerId = parts[3];
      let roundsLeft = Number(parts[4]);
      let wins = Number(parts[5]);
      const bet = Number(parts[6]);

      if (interaction.user.id !== ownerId) {
        return interaction.reply({
          content: "💀 This isn’t your Grave Robbery game!",
          flags: 64
        });
      }

      const foundTreasure = Math.random() < 0.6;

      roundsLeft -= 1;
      if (foundTreasure) wins += 1;

      const resultText = foundTreasure
        ? `💰 Grave ${pickedGrave} had **treasure**!`
        : `💀 Grave ${pickedGrave} was **cursed**!`;

      const embed = new EmbedBuilder()
        .setTitle("⚰️ Grave Robbery")
        .setDescription(resultText)
        .addFields(
          { name: "Bet", value: `${bet} bones`, inline: true },
          { name: "Rounds Left", value: String(roundsLeft), inline: true },
          { name: "Treasures Found", value: String(wins), inline: true }
        )
        .setColor(foundTreasure ? 0x57f287 : 0xed4245);

      if (roundsLeft <= 0) {
        const user = await getOrCreateUser(interaction.user.id);

        let winnings = 0;

        if (wins === 1) winnings = Math.floor(bet * 0.5);
        if (wins === 2) winnings = Math.floor(bet * 1.5);
        if (wins === 3) winnings = Math.floor(bet * 3);

        user.bones += winnings;
        user.bonesEarnedTotal += winnings; 
        await user.save();

        const profit = winnings - bet;

        embed.addFields({
          name: "Game Over",
          value:
            `You found treasure **${wins}/3** times!\n` +
            `💰 Winnings: **${winnings} bones**\n` +
            `📊 Profit: **${profit >= 0 ? "+" : ""}${profit} bones**\n` +
            `<:BBones:1518220991938170910> New Balance: **${user.bones} bones**<:BBones:1518220991938170910>`
        });

        return interaction.update({
          embeds: [embed],
          components: [createMainMenuRow(ownerId)]
        });
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`graverobbery_pick_1_${ownerId}_${roundsLeft}_${wins}_${bet}`)
          .setLabel("Grave 1")
          .setEmoji("⚰️")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId(`graverobbery_pick_2_${ownerId}_${roundsLeft}_${wins}_${bet}`)
          .setLabel("Grave 2")
          .setEmoji("⚰️")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId(`graverobbery_pick_3_${ownerId}_${roundsLeft}_${wins}_${bet}`)
          .setLabel("Grave 3")
          .setEmoji("⚰️")
          .setStyle(ButtonStyle.Secondary)
      );

      return interaction.update({
        embeds: [embed],
        components: [row]
      });
    }

    // =====================================================
    // BONE DIG BET BUTTONS
    // =====================================================
    if (
      interaction.isButton() &&
      interaction.customId.startsWith("bonedig_bet_")
    ) {
      const parts = interaction.customId.split("_");

      const bet = Number(parts[2]);
      const ownerId = parts[3];

      if (interaction.user.id !== ownerId) {
        return interaction.reply({
          content: "💀 This isn’t your Bone Dig game!",
          flags: 64
        });
      }

      const user = await getOrCreateUser(interaction.user.id);

      if (!BONEDIG_BETS.includes(bet)) {
        return interaction.reply({
          content: "💀 Invalid bet.",
          flags: 64
        });
      }

      if (user.bones < bet) {
        return interaction.reply({
          content: `💀 You don’t have enough bones to bet **${bet}**.`,
          flags: 64
        });
      }

      const paid = await spendBibblesToken(user);

      if (!paid) {
        return interaction.reply({
          content: "💀 You have no Bibbles Tokens left!",
          flags: 64
        });
      }

      user.bones -= bet;
      await user.save();

      return startBoneDig(interaction, bet);
    }

    if (
      interaction.isButton() &&
      interaction.customId.startsWith("bonedig_") &&
      !interaction.customId.startsWith("bonedig_bet_")
    ) {
      return handleBoneDigButton(interaction);
    }


    // =====================================================
    // COIN FLIP BET BUTTONS
    // =====================================================
    if (interaction.isButton() && interaction.customId.startsWith("coinflip_bet_")) {
      const parts = interaction.customId.split("_");

      const bet = Number(parts[2]);
      const ownerId = parts[3];

      if (interaction.user.id !== ownerId) {
        return interaction.reply({
          content: "💀 This isn’t your coin flip game!",
          flags: 64
        });
      }

      const user = await getOrCreateUser(interaction.user.id);

      if (!COINFLIP_BETS.includes(bet)) {
        return interaction.reply({
          content: "💀 Invalid bet.",
          flags: 64
        });
      }

      if (user.bones < bet) {
        return interaction.reply({
          content: `💀 You don’t have enough bones to bet **${bet}**.`,
          flags: 64
        });
      }

      const paid = await spendBibblesToken(user);

      if (!paid) {
        return interaction.reply({
          content: "💀 You have no Bibbles Tokens left!",
          flags: 64
        });
      }

      user.bones -= bet;
      await user.save();

      return startCoinFlip(interaction, bet);
    }

    // =====================================================
    // COIN FLIP HEADS / TAILS BUTTONS
    // =====================================================
    if (
      interaction.isButton() &&
      interaction.customId.startsWith("coinflip_") &&
      !interaction.customId.startsWith("coinflip_bet_")
    ) {
      const parts = interaction.customId.split("_");

      const choice = parts[1];
      const ownerId = parts[2];
      let flipsLeft = Number(parts[3]);
      let wins = Number(parts[4]);
      const bet = Number(parts[5]);

      if (interaction.user.id !== ownerId) {
        return interaction.reply({
          content: "💀 This isn’t your coin flip game!",
          flags: 64
        });
      }

      const result = Math.random() < 0.5 ? "heads" : "tails";
      const won = choice === result;

      flipsLeft -= 1;
      if (won) wins += 1;

      const resultText = won
        ? `✅ It landed on **${result}**! You guessed right!`
        : `❌ It landed on **${result}**! You guessed wrong!`;

      const embed = new EmbedBuilder()
        .setTitle("<:BToken:1518219006392274995> Coin Flip")
        .setDescription(resultText)
        .addFields(
          { name: "Bet", value: `${bet} bones`, inline: true },
          { name: "Flips Left", value: String(flipsLeft), inline: true },
          { name: "Wins", value: String(wins), inline: true }
        )
        .setColor(won ? 0x57f287 : 0xed4245);

      if (flipsLeft <= 0) {
        const user = await getOrCreateUser(interaction.user.id);

        let winnings = 0;
        
        if (wins === 0) winnings = Math.floor(bet * 0);
        if (wins === 1) winnings = Math.floor(bet * 0.5);
        if (wins === 2) winnings = Math.floor(bet * 2);
        if (wins === 3) winnings = Math.floor(bet * 3.5);

        user.bones += winnings;
        user.bonesEarnedTotal += winnings;

        let gameProgress = null;

        if (wins === 3) {
          user.coinFlipPerfectCount = (user.coinFlipPerfectCount || 0) + 1;
          gameProgress = Math.min(user.coinFlipPerfectCount, 10);
        }

        await user.save();

        const unlockEmbeds = await checkUnlocks(user, interaction.user);

        const profit = winnings - bet;

        let gameOverText =
          `You got **${wins}/3** correct!\n` +
          `💰 Winnings: **${winnings} bones**\n` +
          `📊 Profit: **${profit >= 0 ? "+" : ""}${profit} bones**\n` +
          `<:BBones:1518220991938170910> New Balance: **${user.bones} bones**<:BBones:1518220991938170910>`;

        if (gameProgress !== null) {
          gameOverText +=
            `\n\n🪙 **Unique Card Progress:** \`${gameProgress}/10\`${gameProgress === 10 ? " ✅" : ""}`;
        }

        embed.addFields({
          name: "Game Over",
          value: gameOverText
        });

        const embeds = [embed];
        embeds.push(...unlockEmbeds);

        return interaction.update({
          embeds,
          components: [createMainMenuRow(ownerId)]
        });
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`coinflip_heads_${ownerId}_${flipsLeft}_${wins}_${bet}`)
          .setLabel("Heads")
          .setEmoji("<:BHeads:1519545907920765028>")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId(`coinflip_tails_${ownerId}_${flipsLeft}_${wins}_${bet}`)
          .setLabel("Tails")
          .setEmoji("<:BTails:1519545923632631879>")
          .setStyle(ButtonStyle.Danger)
      );

      return interaction.update({
        embeds: [embed],
        components: [row]
      });
    }

    
  // =====================================================
  // PING MODAL SUBMIT
  // =====================================================
  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith('setping_')) {
      const parts = interaction.customId.split('_');

      const slotIndex = Number(parts[1]);
      const ownerId = parts[2];

      if (interaction.user.id !== ownerId) {
        return interaction.reply({
          content: "This ping modal is not yours.",
          flags: 64
        });
      }

      const cardIdInput = interaction.fields
        .getTextInputValue('card_id')
        .trim()
        .toLowerCase();

      const allCards = Object.values(cards).flat();

      const card = allCards.find(c =>
        getCardId(c).toLowerCase() === cardIdInput
      );

      if (!card) {
        return interaction.reply({
          content: `No card found with ID \`${cardIdInput}\`.`,
          flags: 64
        });
      }

      const blockedRarities = ['APEX', 'UNIQUE', 'EVENT'];

      if (blockedRarities.includes(card.rarity.toUpperCase())) {
        return interaction.reply({
          content: `📡 ${card.rarity} cards cannot be tracked.`,
          flags: 64
        });
      }

      const user = await getOrCreateUser(interaction.user.id);

      if (!user.pingCards || user.pingCards.length !== 3) {
        user.pingCards = [null, null, null];
      }

      user.pingCards[slotIndex] = getCardId(card);

      await user.save();

      const refreshed = buildPingsMessage(user, interaction.user.id);

      return interaction.reply(refreshed);
    }
  }

  // =====================================================
  // SLASH COMMANDS
  // =====================================================
  if (interaction.isChatInputCommand()) {

    if (interaction.commandName === "games") {
      const user = await getOrCreateUser(interaction.user.id);
      return showGamesMenu(interaction, user);
    }

    if (interaction.commandName === "index") {
      const season = interaction.options.getInteger("season");

      const targetUser = interaction.options.getUser("user") || interaction.user;

      const user = await getOrCreateUser(targetUser.id);

      const {
        seasonCards,
        ownedCount,
        totalCount,
        complete
      } = getSeasonIndexData(user, season);

      const missingCards = seasonCards.filter(card =>
        !user.inventory.some(inv =>
          inv.itemId === getCardId(card) &&
          inv.quantity > 0
        )
      );

      const percent = totalCount === 0
        ? 0
        : Math.floor((ownedCount / totalCount) * 100);

      const missingText = missingCards.length === 0
        ? "None! Index complete."
        : missingCards
            .slice(0, 20)
            .map(card => `❌ \`${getCardId(card)}\` ${card.name}`)
            .join("\n");

      const rewardText =
        season === 1
          ? `👑 Reward: **${findCardById(UNIQUE_UNLOCKS.bibbles.cardId)?.name || "Bibbles"}**`
          : `👑 Reward: **${findCardById(UNIQUE_UNLOCKS.appl.cardId)?.name || "Appl"}**`;

      const embed = new EmbedBuilder()
        .setTitle(`📚 ${targetUser.username}'s Season ${season} Index`)
        .setDescription(
          `Progress: **${ownedCount}/${totalCount}** cards\n` +
          `Completion: **${percent}%**\n` +
          `${complete ? "✅ **Complete!**" : "❌ **Incomplete**"}\n\n` +
          `${rewardText}\n\n` +
          `**Missing Cards:**\n${missingText}`
        )
        .setColor(complete ? 0x57f287 : 0xf5c542)
        .setFooter({
          text: missingCards.length > 20
            ? `Showing first 20 missing cards. Missing total: ${missingCards.length}`
            : `Missing total: ${missingCards.length}`
        });

      return interaction.reply({
        embeds: [embed],
        flags: 64
      });
    }



    if (interaction.commandName === 'daily') {

      const user = await getOrCreateUser(interaction.user.id);

      const now = new Date();
      // Convert both times to Brisbane date strings
      const brisbaneNow = new Date(
      now.toLocaleString("en-US", { timeZone: "Australia/Brisbane" })
      );
      const today = getBrisbaneToday();

      let lastClaimDate = null;

      if (user.dailyLastClaim) {
        lastClaimDate = new Date(
          new Date(user.dailyLastClaim).toLocaleString("en-US", { 
            timeZone: "Australia/Brisbane"
          })
        ).toDateString();
      }

      const nextMidnight = new Date(brisbaneNow);
      nextMidnight.setHours(24, 0, 0, 0);
      nextMidnight.setHours(nextMidnight.getHours() - 10); // shift 10 hours back
      const unixReset = Math.floor(nextMidnight.getTime() / 1000);

      // Already claimed today
      if (lastClaimDate === today) {
        return interaction.reply({
          content: `<:BBones:1518220991938170910> You've already claimed your daily reward!\nResets at <t:${unixReset}:t> (<t:${unixReset}:R>)`,
          flags: 64
        });
      }
      const maxStreak = 30;

      if (user.dailyLastClaim) {

        // Missed streak window
        const yesterday = new Date(brisbaneNow);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayString = yesterday.toDateString();

        if (lastClaimDate !== today && lastClaimDate !== yesterdayString) {
          user.dailyStreak = 0;
          user.cappedStreak = 0;
        }
      }

      if (!user.dailyStreak) user.dailyStreak = 0;
      if (!user.cappedStreak) user.cappedStreak = 0;

      if (user.cappedStreak < maxStreak) {
        user.cappedStreak += 1;
      }

      //Add one to perma streak
      user.dailyStreak += 1;

      const baseReward = Math.floor(Math.random() * 21) + 90; // 90–110
      const streakBonus = user.cappedStreak * 15;
      const totalReward = baseReward + streakBonus;

      user.bones += totalReward;
      user.bonesEarnedTotal += totalReward; 
      user.dailyLastClaim = now;

      await user.save();

      return interaction.reply({
        content:
          `<:BBones:1518220991938170910> **Daily Claimed!**\n\n` +
          `Base: \`${baseReward}\`\n` +
          `Streak Bonus: \`${streakBonus}\`\n` +
          `Total Earned: \`${totalReward}\`\n\n` +
          `🔥 Current Streak: ${user.dailyStreak}/30\n\n` +
          `💰 **New Balance:** \`${user.bones}\`<:BBones:1518220991938170910>`,
        flags: 64
      });
    }
    
    if (interaction.commandName === 'pings') {
      const user = await getOrCreateUser(interaction.user.id);

      if (!user.pingCards || user.pingCards.length !== 3) {
        user.pingCards = [null, null, null];
        await user.save();
      }

      const pingsMessage = buildPingsMessage(user, interaction.user.id);

      return interaction.reply(pingsMessage);
    }

    if (interaction.commandName === "leaderboard") {
      await interaction.deferReply();

      const type = interaction.options.getString("type");

      const payload = await buildLeaderboardPayload(interaction, type, 0);

      return interaction.editReply(payload);
    }

    if (interaction.commandName === 'balance') {

    const targetUser = interaction.options.getUser('user') || interaction.user;

    const user = await getOrCreateUser(targetUser.id);

    const balanceEmbed = new EmbedBuilder()
      .setColor(0xE5C07B)
      .setTitle('<:BBones:1518220991938170910> Bone Balance <:BBones:1518220991938170910>')
      .setDescription(`${targetUser}'s balance:`)
      .addFields(
        { name: 'Bones', value: `\`${user.bones}\``, inline: true }
      )
      .setTimestamp();

      return interaction.reply({
        embeds: [balanceEmbed],
        flags: 64
      });
    }



    if (interaction.commandName === 'inventory') {

      const targetUser = interaction.options.getUser('user') || interaction.user;//*********************** */

      const target = interaction.options.getUser('user') || interaction.user;

      const user = await getOrCreateUser(target.id);


      if (!user || user.inventory.length === 0) {
        const ownerUser = await client.users.fetch(target.id);

        return interaction.reply({
          content: `${ownerUser.username} doesn't own any cards yet.`,
          flags: 64
        });
      }


      const inventoryEmbed = new EmbedBuilder()
        .setColor(0x2B2D31)
        .setTitle(`📦 ${target.username}'s Card Collection`)
        .setDescription("Select an option below:")
        .setTimestamp();

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`inv_list_${target.id}_${interaction.user.id}`)
          .setLabel('List')
          .setEmoji('✅')
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId(`inv_COMMON_${target.id}_${interaction.user.id}`)
          .setEmoji('🟩')
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId(`inv_EPIC_${target.id}_${interaction.user.id}`)
          .setEmoji('🟪')
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId(`inv_SECRET_${target.id}_${interaction.user.id}`)
          .setEmoji('🟥')
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId(`inv_NIGHTMARE_${target.id}_${interaction.user.id}`)
          .setEmoji('⬛')
          .setStyle(ButtonStyle.Secondary)
      );

      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`inv_APEX_${target.id}_${interaction.user.id}`)
          .setEmoji('💠')
          .setStyle(ButtonStyle.Secondary),
        
        new ButtonBuilder()
          .setCustomId(`inv_SPECIAL_${target.id}_${interaction.user.id}`)
          .setEmoji('🌸')
          .setStyle(ButtonStyle.Secondary)
      );

      return interaction.reply({
        embeds: [inventoryEmbed],
        components: [row1, row2],
        flags: 64
      });
    }
  }

  // =====================================================
  // BUTTON INTERACTIONS
  // =====================================================
  if (interaction.isButton()) {
    
  // =====================================================
  // LEADERBOARD BUTTONS
  // =====================================================
    if (
      interaction.isButton() &&
      interaction.customId.startsWith("leaderboard_")
    ) {
      const parts = interaction.customId.split("_");

      const action = parts[1];

      if (action === "page") return;

      const type = parts[2];
      let page = Number(parts[3]);
      const ownerId = parts[4];

      if (interaction.user.id !== ownerId) {
        return interaction.reply({
          content: "💀 This leaderboard menu isn't yours!",
          flags: 64
        });
      }

      if (action === "prev") page--;
      if (action === "next") page++;

      const payload =
        await buildLeaderboardPayload(
          interaction,
          type,
          page
        );

      return interaction.update(payload);
    }


    // =====================================================
    // PING SLOT BUTTONS
    // =====================================================
    if (interaction.customId.startsWith('pingslot_')) {
      const parts = interaction.customId.split('_');

      const slotIndex = Number(parts[1]);
      const ownerId = parts[2];

      if (interaction.user.id !== ownerId) {
        return interaction.reply({
          content: "This ping menu is not yours.",
          flags: 64
        });
      }

      const modal = new ModalBuilder()
        .setCustomId(`setping_${slotIndex}_${ownerId}`)
        .setTitle(`Set Ping Slot ${slotIndex + 1}`);

      const cardInput = new TextInputBuilder()
        .setCustomId('card_id')
        .setLabel('Enter the Card ID')
        .setPlaceholder('Example: c1, e4, s12')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const row = new ActionRowBuilder().addComponents(cardInput);
      modal.addComponents(row);


      return interaction.showModal(modal);
    }

    if (interaction.customId.startsWith('clearping_')) {
      const parts = interaction.customId.split('_');

      const slotIndex = Number(parts[1]);
      const ownerId = parts[2];

      if (interaction.user.id !== ownerId) {
        return interaction.reply({
          content: "This ping menu is not yours.",
          flags: 64
        });
      }

      const user = await getOrCreateUser(interaction.user.id);

      if (!user.pingCards || user.pingCards.length !== 3) {
        user.pingCards = [null, null, null];
      }

      user.pingCards[slotIndex] = null;

      await user.save();

      const refreshed = buildPingsMessage(user, interaction.user.id);

      return interaction.update({
        embeds: refreshed.embeds,
        components: refreshed.components
      });
    }



    // =====================================================
    // REFUND BUTTON 
    // =====================================================
    if (interaction.customId.startsWith('refund_')) {
      const parts = interaction.customId.split('_');

      const buyerId = parts[1];
      const cardId = parts[2];
      const refundPrice = Number(parts[3]);

      if (interaction.user.id !== buyerId) {
        return interaction.reply({
          content: "👹This refund button is not for you.",
          flags: 64
        });
      }

      const user = await getOrCreateUser(interaction.user.id);

      if (!canUseRefund(user)) {
        return interaction.reply({
          content: "<:BBones:1518220991938170910> You've already used your daily refund bestie. Refund resets at same time as daily!",
          flags: 64
        });
      }

      const ownedCard = user.inventory.find(i => i.itemId === cardId);

      if (!ownedCard || ownedCard.quantity <= 0) {
        return interaction.reply({
          content: "<:BBones:1518220991938170910>You don't own this card anymore, so it can't be refunded.",
          flags: 64
        });
      }

      

      ownedCard.quantity -= 1;

      if (ownedCard.quantity <= 0) {
        user.inventory = user.inventory.filter(i => i.itemId !== cardId);
      }

      user.bones += refundPrice;
      user.bonesSpentTotal -= refundPrice;
      user.lastRefundAt = new Date();

      await user.save();

      return interaction.update({
        content: `Refunded! You received \`${refundPrice}\` <:BBones:1518220991938170910> back.`,
        embeds: [],
        components: []
      });   
      
      const blockedRarities = ['APEX', 'UNIQUE', 'EVENT'];

      if (blockedRarities.includes(card.rarity)) {
        return interaction.reply({
          content: `📡 ${card.rarity} cards cannot be tracked.`,
          flags: 64
        });
      }
    }




    if (interaction.customId.startsWith('inv_list_prev_') ||
    interaction.customId.startsWith('inv_list_next_')) {

      const parts = interaction.customId.split('_');

      const direction = parts[2];
      let currentPage = parseInt(parts[3]);
      const ownerId = parts[4];
      const viewerId = parts[5];

      if (interaction.user.id !== viewerId) {
        return interaction.reply({
          content: "This is not your inventory.",
          flags: 64
        });
      }

      const user = await User.findOne({ userId: ownerId });
      if (!user) return;

      const rarityOrder = ['COMMON', 'EPIC', 'SECRET', 'NIGHTMARE', 'APEX', 'UNIQUE', 'EVENT'];
      const allCards = Object.values(cards).flat();

      const sortedInventory = user.inventory
        .map(invItem => {
          const cardData = allCards.find(c => getCardId(c) === invItem.itemId);
          if (!cardData) return null;

          let rarityKey = null;
          for (const key of Object.keys(cards)) {
            if (cards[key].some(c => getCardId(c) === invItem.itemId)) {
              rarityKey = key;
              break;
            }
          }

          return {
            ...cardData,
            quantity: invItem.quantity,
            rarity: rarityKey
          };
        })
        .filter(Boolean)
        .sort((a, b) => {
          const rarityCompare =
            rarityOrder.indexOf(a.rarity) - rarityOrder.indexOf(b.rarity);

          if (rarityCompare !== 0) return rarityCompare;

          // Same rarity → sort by numeric ID
          const aData = getInventorySortData(getCardId(a));
          const bData = getInventorySortData(getCardId(b));

          if (aData.season !== bData.season) {
            return aData.season - bData.season;
          }

          return aData.number - bData.number;

          return aNum - bNum;
        });


      const perPage = 10;
      const totalPages = Math.max(1, Math.ceil(sortedInventory.length / perPage));

      if (direction === 'next') currentPage++;
      if (direction === 'prev') currentPage--;

      if (currentPage < 0) currentPage = totalPages - 1;
      if (currentPage >= totalPages) currentPage = 0;

      const start = currentPage * perPage;
      const end = start + perPage;
      const pageItems = sortedInventory.slice(start, end);

      const ownerUser = await client.users.fetch(ownerId);

      const embed = new EmbedBuilder()
        .setColor(0x2B2D31)
        .setTitle(`📜 ${ownerUser.username}'s Cards`)
        .setFooter({ text: `Page ${currentPage + 1} of ${totalPages}` });

      pageItems.forEach(card => {
        const rarityEmoji = rarities[card.rarity].emoji;
        embed.addFields({
          name: `${rarityEmoji} ${card.name}`,
          value: `SN: \`${card.season}\` • ID: \`${getCardId(card)}\` • Qty: \`${card.quantity}\``,
          inline: false
        });
      });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`inv_list_prev_${currentPage}_${ownerId}_${viewerId}`)
          .setLabel('◀')
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId(`inv_list_next_${currentPage}_${ownerId}_${viewerId}`)
          .setLabel('▶')
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId(`inv_menu_${ownerId}_${viewerId}`)
          .setLabel('Return')
          .setStyle(ButtonStyle.Danger)
      );

      return interaction.update({
        embeds: [embed],
        components: [row]
      });
    }


    // =============================
    // PAGINATION (ARROWS)
    // =============================
    if (interaction.customId.startsWith('inv_next_') || interaction.customId.startsWith('inv_prev_')) {

      const parts = interaction.customId.split('_');

      const direction = parts[1]; // next or prev
      const rarity = parts[2];
      const currentIndex = parseInt(parts[3]);
      const ownerId = parts[4];
      const viewerId = parts[5];


      if (interaction.user.id !== viewerId) {
        return interaction.reply({
          content: "This is not your inventory.",
          flags: 64
        });
      }
      const user = await User.findOne({ userId: ownerId });

      if (!user) {
        return interaction.reply({
          content: "No inventory found.",
          flags: 64
        });
      }

      const specialRarities = ["UNIQUE", "EVENT"];

      const ownedCards = user.inventory.filter(invItem => {
        if (rarity === "SPECIAL") {
          return specialRarities.some(specialRarity =>
            cards[specialRarity]?.some(c => getCardId(c) === invItem.itemId)
          );
        }

        return cards[rarity]?.some(c => getCardId(c) === invItem.itemId);
      });

      ownedCards.sort(sortInventoryCards);

      if (ownedCards.length === 0) {
        return interaction.reply({
          content: "No cards found.",
          flags: 64
        });
      }

      let newIndex = currentIndex;

      if (direction === 'next') {
        newIndex++;
        if (newIndex >= ownedCards.length) newIndex = 0; // loop
      }

      if (direction === 'prev') {
        newIndex--;
        if (newIndex < 0) newIndex = ownedCards.length - 1; // loop
      }

      const cardId = ownedCards[newIndex].itemId;
      const allCards = Object.values(cards).flat();
      const cardData = allCards.find(c => getCardId(c) === cardId);

      if (!cardData) {
        return interaction.reply({
          content: `Could not find card data for \`${cardId}\`.`,
          flags: 64
        });
      }

      const embed = new EmbedBuilder()
        .setColor(rarities[rarity].color)
        .setTitle(`${rarities[rarity].emoji} ${rarities[rarity].name} ${rarities[rarity].emoji}`)
        .setDescription(
          `**${cardData.name}**\n` +
          `SN: \`${cardData.season}\`\n` +
          `ID: \`${getCardId(cardData)}\`\n` +
          `Qty: \`${ownedCards[newIndex].quantity}\``
        )
        .setFooter({ text: `Page ${newIndex + 1} of ${ownedCards.length}` });

      let files = [];

      if (OFFLINE_IMAGES) {
        const fileName = getCardImageFileName(cardData);

        const attachment = new AttachmentBuilder(getCardImagePath(cardData), {
          name: fileName
        });

        embed.setImage(`attachment://${fileName}`);
        files.push(attachment);
      } else {
        embed.setImage(getCardImageUrl(cardData));
      }
      
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`inv_prev_${rarity}_${newIndex}_${ownerId}_${viewerId}`)
          .setLabel('◀')
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId(`inv_next_${rarity}_${newIndex}_${ownerId}_${viewerId}`)
          .setLabel('▶')
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId(`inv_menu_${ownerId}_${viewerId}`)
          .setLabel('Return')
          .setStyle(ButtonStyle.Danger)
      );

      return interaction.update({
        embeds: [embed],
        components: [row],
        files
      });
    }


    // =========================================
    // BUY BUTTONS
    // =========================================
    if (interaction.customId.startsWith('buy_')) {
      const parts = interaction.customId.split('_');

      const cardId = parts[1];
      const quantity = Number(parts[2] || 1);

      const card = findCardById(cardId);

      if (!card) {
        return interaction.reply({ content: "Card not found.", flags: 64 });
      }

      if (![1, 2, 5].includes(quantity)) {
        return interaction.reply({ content: "Invalid quantity.", flags: 64 });
      }

      const user = await getOrCreateUser(interaction.user.id);

      const totalPrice = card.price * quantity;

      if (user.bones < totalPrice) {
        return interaction.reply({
          content: `You don't have enough <:BBones:1518220991938170910>! You need **${totalPrice}**.`,
          flags: 64
        });
      }

      user.bones -= totalPrice;
      user.bonesSpentTotal += totalPrice;

      const fullCardId = getCardId(card);
      const existingCard = user.inventory.find(i => i.itemId === fullCardId);

      if (existingCard) {
        existingCard.quantity += quantity;
      } else {
        user.inventory.push({
          itemId: fullCardId,
          quantity
        });
      }

      await user.save();

      const unlockEmbeds = await checkUnlocks(user, interaction.user);

      const purchaseEmbed = new EmbedBuilder()
        .setColor(rarities[card.rarity.toUpperCase()].color)
        .setTitle("🛒 Purchase Successful!")
        .setDescription(
          `You bought **${quantity}x ${card.name}** for \`${totalPrice}\` <:BBones:1518220991938170910>.\n\n` +
          `<:BBones:1518220991938170910> **Remaining Balance:** \`${user.bones}\``
        )
        .setTimestamp();

      let files = [];

      if (OFFLINE_IMAGES) {
        const fileName = getCardImageFileName(card);

        const attachment = new AttachmentBuilder(
          getCardImagePath(card),
          { name: fileName }
        );

        purchaseEmbed.setImage(`attachment://${fileName}`);
        files.push(attachment);
      } else {
        purchaseEmbed.setImage(getCardImageUrl(card));
      }

      const refundRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`refund_${interaction.user.id}_${fullCardId}_${totalPrice}_${quantity}`)
          .setLabel('Refund')
          .setStyle(ButtonStyle.Danger)
      );

      const embeds = [purchaseEmbed];

      embeds.push(...unlockEmbeds);

      return interaction.reply({
        embeds,
        components: [refundRow],
        files,
        flags: 64
      });
    }

        


    // -----------------------------------------------------
    // INVENTORY BUTTONS
    // -----------------------------------------------------
    if (interaction.customId.startsWith('inv_')) {

      const parts = interaction.customId.split('_');

      const action = parts[1];      // list / COMMON / EPIC etc
      const ownerId = parts[2];
      const viewerId = parts[3];

      if (interaction.user.id !== viewerId) {
        return interaction.reply({
          content: "This is not your inventory.",
          flags: 64
        });
      }

      const user = await User.findOne({ userId: ownerId });

      if (!user) {
        return interaction.reply({ content: "No inventory found.", flags: 64 });
      }


      // LIST VIEW
      if (action === 'list') {

        const rarityOrder = ['COMMON', 'EPIC', 'SECRET', 'NIGHTMARE', 'APEX', 'UNIQUE', 'EVENT'];
        const allCards = Object.values(cards).flat();

        const sortedInventory = user.inventory
          .map(invItem => {
            const cardData = allCards.find(c => getCardId(c) === invItem.itemId);
            if (!cardData) return null;

            let rarityKey = null;
            for (const key of Object.keys(cards)) {
              if (cards[key].some(c => getCardId(c) === invItem.itemId)) {
                rarityKey = key;
                break;
              }
            }

            return {
              ...cardData,
              quantity: invItem.quantity,
              rarity: rarityKey
            };
          })
          .filter(Boolean)
          .sort((a, b) => {
            const rarityCompare =
              rarityOrder.indexOf(a.rarity) - rarityOrder.indexOf(b.rarity);

            if (rarityCompare !== 0) return rarityCompare;

            const aData = getInventorySortData(getCardId(a));
            const bData = getInventorySortData(getCardId(b));

            if (aData.season !== bData.season) {
              return aData.season - bData.season;
            }

            return aData.number - bData.number;
          });

        if (sortedInventory.length === 0) {
          return interaction.reply({ content: "Inventory empty.", flags: 64 });
        }

        const perPage = 10;
        const totalPages = Math.ceil(sortedInventory.length / perPage);
        const page = 0;

        const start = page * perPage;
        const end = start + perPage;
        const pageItems = sortedInventory.slice(start, end);

        const ownerUser = await client.users.fetch(ownerId);

        const listEmbed = new EmbedBuilder()
          .setColor(0x2B2D31)
          .setTitle(`📜 ${ownerUser.username}'s Cards`)
          .setFooter({ text: `Page ${page + 1} of ${totalPages}` });

        pageItems.forEach(card => {
          const rarityEmoji = rarities[card.rarity].emoji;
          listEmbed.addFields({
            name: `${rarityEmoji} ${card.name}`,
            value: `SN: \`${card.season}\` • ID: \`${getCardId(card)}\` • Qty: \`${card.quantity}\``,
            inline: false
          });
        });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`inv_list_prev_${page}_${ownerId}_${viewerId}`)
            .setLabel('◀')
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId(`inv_list_next_${page}_${ownerId}_${viewerId}`)
            .setLabel('▶')
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId(`inv_menu_${ownerId}_${viewerId}`)
            .setLabel('Return')
            .setStyle(ButtonStyle.Danger)
        );

        return interaction.update({
          embeds: [listEmbed],
          components: [row]
        });
      }


      // RARITY VIEW
      const rarityKeys = ['COMMON', 'EPIC', 'SECRET', 'NIGHTMARE', 'APEX', 'SPECIAL'];

      for (const rarity of rarityKeys) {
        if (action === rarity) {

          const specialRarities = ['UNIQUE', 'EVENT'];

          const ownedCards = user.inventory.filter(invItem => {
            if (rarity === 'SPECIAL') {
              return specialRarities.some(specialRarity =>
                cards[specialRarity]?.some(c => getCardId(c) === invItem.itemId)
              );
            }

            return cards[rarity]?.some(c => getCardId(c) === invItem.itemId);
          });

          ownedCards.sort(sortInventoryCards);


          if (ownedCards.length === 0) {

            const ownerUser = await client.users.fetch(ownerId);

            const emptyEmbed = new EmbedBuilder()
              .setColor(0x2B2D31)
              .setTitle(`📦 ${ownerUser.username}'s Card Collection`)
              .setDescription(
                `❌ ${ownerUser.username} doesn't own any ${rarities[rarity].name} cards.`
              )
              .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`inv_menu_${ownerId}_${viewerId}`)
                .setLabel('Return')
                .setStyle(ButtonStyle.Danger)
            );

            return interaction.update({
              embeds: [emptyEmbed],
              components: [row]
            });
          }


          const firstCardId = ownedCards[0].itemId;
          const allCards = Object.values(cards).flat();
          const cardData = allCards.find(c => getCardId(c) === firstCardId);

          const embed = new EmbedBuilder()
          .setColor(rarities[rarity].color)
          .setTitle(`${rarities[rarity].emoji} ${rarities[rarity].name} ${rarities[rarity].emoji}`)
          .setDescription(
            `**${cardData.name}**\n` +
            `SN: \`${cardData.season}\`\n` +
            `ID: \`${getCardId(cardData)}\`\n` +
            `Qty: \`${ownedCards[0].quantity}\``
          )
          .setFooter({ text: `Page 1 of ${ownedCards.length}` });

          let files = [];

          if (OFFLINE_IMAGES) {
            const fileName = getCardImageFileName(cardData);

            const attachment = new AttachmentBuilder(getCardImagePath(cardData), {
              name: fileName
            });

            embed.setImage(`attachment://${fileName}`);
            files.push(attachment);
          } else {
            embed.setImage(getCardImageUrl(cardData));
          }

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`inv_prev_${rarity}_0_${ownerId}_${viewerId}`)
              .setLabel('◀')
              .setStyle(ButtonStyle.Secondary),

            new ButtonBuilder()
              .setCustomId(`inv_next_${rarity}_0_${ownerId}_${viewerId}`)
              .setLabel('▶')
              .setStyle(ButtonStyle.Secondary),

            new ButtonBuilder()
              .setCustomId(`inv_menu_${ownerId}_${viewerId}`)
              .setLabel('Return')
              .setStyle(ButtonStyle.Danger)
          );

          return interaction.update({
            embeds: [embed],
            components: [row],
            files
          });
        }
      }


      // RETURN TO MENU
      if (action === 'menu') {
        const ownerUser = await client.users.fetch(ownerId);
        const inventoryEmbed = new EmbedBuilder()
          .setColor(0x2B2D31)
          .setTitle(`📦 ${ownerUser.username}'s Card Collection`)
          .setDescription("Select an option below:")
          .setTimestamp();

        const row1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`inv_list_${ownerId}_${viewerId}`)
            .setLabel('List')
            .setEmoji('✅')
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId(`inv_COMMON_${ownerId}_${viewerId}`)
            .setEmoji('🟩')
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId(`inv_EPIC_${ownerId}_${viewerId}`)
            .setEmoji('🟪')
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId(`inv_SECRET_${ownerId}_${viewerId}`)
            .setEmoji('🟥')
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId(`inv_NIGHTMARE_${ownerId}_${viewerId}`)
            .setEmoji('⬛')
            .setStyle(ButtonStyle.Secondary)
        );

        const row2 = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`inv_APEX_${ownerId}_${viewerId}`)
            .setEmoji('💠')
            .setStyle(ButtonStyle.Secondary),
          
          new ButtonBuilder()
            .setCustomId(`inv_SPECIAL_${ownerId}_${viewerId}`)
            .setEmoji('🌸')
            .setStyle(ButtonStyle.Secondary)
        );

        return interaction.update({
          embeds: [inventoryEmbed],
          components: [row1, row2],
          files: [],
          attatchments: []
        });
      }

    }
  }
});
