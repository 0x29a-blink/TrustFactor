const VotingUtils = require('../utils/voting');
const logger = require('../utils/logger');

module.exports = {
    name: 'messageReactionRemove',
    async execute(reaction, user) {
        // Log reaction removal
        logger.user(`Reaction removed by ${user.tag} (${user.id})`, 'REACTION');
        logger.verbose(`Reaction removal details: ${reaction.emoji.name} on message ${reaction.message.id}`, 'REACTION');
        
        // Handle partial reactions
        if (reaction.partial) {
            try {
                await reaction.fetch();
                logger.verbose('Fetched partial reaction for removal', 'REACTION');
            } catch (error) {
                logger.errorWithStack('Something went wrong when fetching the reaction', error, 'REACTION');
                return;
            }
        }

        // Only handle thumbs up/down reactions
        if (reaction.emoji.name !== '👍' && reaction.emoji.name !== '👎') {
            logger.verbose(`Ignoring non-voting reaction removal: ${reaction.emoji.name}`, 'REACTION');
            return;
        }

        // Handle the vote retraction
        logger.vote(`Processing vote retraction: ${reaction.emoji.name}`, 'REACTION');
        await VotingUtils.handleReactionRemove(reaction, user);
    },
};
