const { validateScenario } = require('../../../server/scenario/payload.js');

const base = { player1: { house: 'brobnar' } };

function errorsFor(changes) {
    const result = validateScenario({ ...base, ...changes });

    expect(result.valid).toBe(false);

    return result.errors.join('; ');
}

describe('scenario payload validation errors', function () {
    const cases = [
        ['not an object', 'Scenario must be a JSON object', null, true],
        ['an unsupported version', 'Unsupported scenario version 2', { version: 2 }],
        ['an unknown top-level property', 'bogus is not a recognised property', { bogus: 1 }],
        ['a non-text title', 'title must be text', { title: 5 }],
        ['a player that is not an object', 'player1 must be an object', { player1: 'x' }],
        [
            'an unknown player property',
            'player1.bogus is not a recognised property',
            { player1: { bogus: 1 } }
        ],
        ['an invalid house', 'player1.house', { player1: { house: 'Bro bnar' } }],
        ['too many houses', 'player1.houses', { player1: { houses: ['a', 'b', 'c', 'd'] } }],
        ['negative amber', 'player1.amber', { player1: { amber: -1 } }],
        ['too many chains', 'player1.chains', { player1: { chains: 25 } }],
        ['keys that are not an object', 'player1.keys must be an object', { player1: { keys: 1 } }],
        ['an unknown key color', 'player1.keys.green', { player1: { keys: { green: true } } }],
        ['a non-boolean key', 'player1.keys.red', { player1: { keys: { red: 1 } } }],
        ['an empty token card', 'player1.token', { player1: { token: '' } }],
        ['a zone that is not a list', 'player1.hand must be a list', { player1: { hand: 'x' } }],
        [
            'a hand entry that is an object',
            'player1.hand[0]',
            { player1: { hand: [{ card: 'x' }] } }
        ],
        [
            'an in-play entry without a card',
            'player1.inPlay[0].card',
            { player1: { inPlay: [{}] } }
        ],
        [
            'an unknown in-play property',
            'player1.inPlay[0].bogus',
            { player1: { inPlay: [{ card: 'troll', bogus: 1 }] } }
        ],
        [
            'tokens that are not an object',
            'player1.inPlay[0].tokens must be an object',
            { player1: { inPlay: [{ card: 'troll', tokens: 3 }] } }
        ],
        [
            'an invalid token count',
            'player1.inPlay[0].tokens.ward',
            { player1: { inPlay: [{ card: 'troll', tokens: { ward: 0 } }] } }
        ],
        [
            'invalid damage',
            'player1.inPlay[0].damage',
            { player1: { inPlay: [{ card: 'troll', damage: -1 }] } }
        ],
        [
            'a non-boolean exhausted',
            'player1.inPlay[0].exhausted',
            { player1: { inPlay: [{ card: 'troll', exhausted: 'yes' }] } }
        ],
        [
            'upgrades that are not a list',
            'player1.inPlay[0].upgrades must be a list',
            { player1: { inPlay: [{ card: 'troll', upgrades: 'x' }] } }
        ],
        [
            'an invalid upgrade',
            'player1.inPlay[0].upgrades[0]',
            { player1: { inPlay: [{ card: 'troll', upgrades: [3] }] } }
        ],
        [
            'under that is not a list',
            'player1.inPlay[0].under must be a list',
            { player1: { inPlay: [{ card: 'cauldron', under: 'x' }] } }
        ],
        [
            'an invalid under card',
            'player1.inPlay[0].under[0]',
            { player1: { inPlay: [{ card: 'cauldron', under: [3] }] } }
        ],
        ['actions that are not a list', 'actions must be a list', { actions: 'x' }],
        ['an action that is not an object', 'actions[0] must be an object', { actions: ['x'] }],
        [
            'an unknown action property',
            'actions[0].bogus',
            { actions: [{ player: 1, action: 'endTurn', bogus: 1 }] }
        ],
        [
            'an invalid action player',
            'actions[0].player must be 1 or 2',
            { actions: [{ player: 3, action: 'endTurn' }] }
        ],
        [
            'a disallowed action',
            'actions[0].action must be one of',
            { actions: [{ player: 1, action: 'eval' }] }
        ],
        [
            'action args that are not a list',
            'actions[0].args must be a list',
            { actions: [{ player: 1, action: 'endTurn', args: 'x' }] }
        ],
        [
            'too many action args',
            'actions[0].args must be a list',
            { actions: [{ player: 1, action: 'clickPrompt', args: [1, 2, 3, 4, 5, 6] }] }
        ],
        [
            'an overlong string arg',
            'actions[0].args[0] is too long',
            { actions: [{ player: 1, action: 'clickPrompt', args: ['x'.repeat(101)] }] }
        ],
        [
            'an arg that is null',
            'actions[0].args[0] must be a string, number, boolean or card reference',
            { actions: [{ player: 1, action: 'clickPrompt', args: [null] }] }
        ],
        [
            'a card reference with an unknown property',
            'actions[0].args[0].bogus',
            { actions: [{ player: 1, action: 'clickCard', args: [{ card: 'troll', bogus: 1 }] }] }
        ],
        [
            'a card reference without a card',
            'actions[0].args[0].card',
            { actions: [{ player: 1, action: 'clickCard', args: [{}] }] }
        ],
        [
            'a card reference with an invalid location',
            'actions[0].args[0].location',
            { actions: [{ player: 1, action: 'clickCard', args: [{ card: 'a', location: '' }] }] }
        ]
    ];

    for (const [name, message, changes, replaceAll] of cases) {
        it(`rejects ${name}`, function () {
            if (replaceAll) {
                expect(validateScenario(changes)).toEqual({
                    valid: false,
                    errors: [message]
                });
            } else {
                expect(errorsFor(changes)).toContain(message);
            }
        });
    }
});
