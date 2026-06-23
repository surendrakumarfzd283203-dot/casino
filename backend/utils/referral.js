const User = require("../models/User");
const Transaction = require("../models/Transaction");

async function checkReferralReward(userId) {
    try {
        const user = await User.findById(userId);
        if (!user || !user.referred_by || user.referral_rewarded || !user.referral_played) return;

        const referrer = await User.findById(user.referred_by);
        if (!referrer) return;

        let reward = 0;
        let commission = 0;
        let details = "";

        if (user.total_deposited >= 1000) {
            reward = 100;
            commission = Math.floor(user.total_deposited * 0.05);
            details = `Referral Reward for ${user.name} (1000+ Dep & Play)`;
        } else if (user.total_deposited >= 100) {
            reward = 50;
            details = `Referral Reward for ${user.name} (100+ Dep & Play)`;
        }

        if (reward > 0) {
            referrer.coins += (reward + commission);
            await referrer.save();
            user.referral_rewarded = true;
            await user.save();
            await new Transaction({
                user_id: referrer._id,
                amount: reward + commission,
                type: 'referral',
                details: details
            }).save();
            return true;
        }
    } catch (error) {
        console.error("Error in checkReferralReward:", error);
    }
    return false;
}

module.exports = { checkReferralReward };
