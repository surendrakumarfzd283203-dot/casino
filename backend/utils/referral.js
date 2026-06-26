const User = require("../models/User");
const Transaction = require("../models/Transaction");

async function checkReferralReward(userId, depositAmount) {
    try {
        const user = await User.findById(userId);
        if (!user || !user.referred_by || user.referral_rewarded) return;

        const referrer = await User.findById(user.referred_by);
        if (!referrer) return;

        // Condition: success only when user adds 100
        if (depositAmount >= 100) {
            const reward = 50;
            referrer.coins += reward;
            await referrer.save();

            user.referral_rewarded = true;
            await user.save();

            await new Transaction({
                user_id: referrer._id,
                amount: reward,
                type: 'referral',
                details: `Referral success reward for user ${user.name}`
            }).save();
            return true;
        }
    } catch (error) {
        console.error("Error in checkReferralReward:", error);
    }
    return false;
}

module.exports = { checkReferralReward };
