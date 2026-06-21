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
