const Card = require('../../Card.js');

class ReassemblingAutomaton extends Card {
    // Destroyed: If you have any other creatures in play, instead of destroying Reassembling Automaton, fully heal it, exhaust it, and move it to a flank.
    setupCardAbilities() {
        this.destroyed({
            condition: (context) => context.player.creaturesInPlay.length > 1,
            effect: 'fully heal it, exhaust it, and move it to a flank',
            handler: (context) => {
                context.event.replacementHandler = (leavesPlayEvent) => {
                    const card = leavesPlayEvent.card;
                    card.removeToken('damage');
                    card.exhausted = true;
                    context.game.actions.moveToFlank().resolve(card, context);
                };
            }
        });
    }
}

ReassemblingAutomaton.id = 'reassembling-automaton';

module.exports = ReassemblingAutomaton;
