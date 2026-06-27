const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        unique: true
    },

    bones: {
        type: Number,
        default: 0
    },

    dailyLastClaim: {
        type: Date,
        default: null
    },

    dailyStreak: {
        type: Number,
        default: 0
    },

    cappedStreak: {
        type: Number,
        default: 0
    },

    lastRefundAt: {
        type: Date,
        default: null
    },

    pingCards: {
        type: [String],
        default: [null, null, null]
    },

    bibblesTokens: {
        type: Number,
        default: 5
    },

    lastBibblesTokenRecharge: {
        type: Date,
        default: Date.now
    },

    highlowBestStreak: {
        type: Number,
        default: 0
    },

    bonesEarnedTotal: {
        type: Number,
        default: 0
    },

    bonesSpentTotal: {
        type: Number,
        default: 0
    },

    blackjack21Count: {
        type: Number,
        default: 0
    },

    boneDigPerfectCount: {
        type: Number,
        default: 0
    },

    coinFlipPerfectCount: {
        type: Number,
        default: 0
    },
    
    uniqueUnlocks: {
        kevSpend: { type: Boolean, default: false },
        season1Index: { type: Boolean, default: false },
        blackjack21s: { type: Number, default: 0 },
        boneDigClears: { type: Number, default: 0 },
        coinFlipPerfects: { type: Number, default: 0 },
        season2Index: { type: Boolean, default: false },
        highLowMaxStreaks: { type: Number, default: 0 }
    },

    inventory: [
    {
        itemId: String,
        quantity: {
            type: Number,
            default: 1
        }
    }
    ]
});

module.exports = mongoose.model('User', userSchema);
