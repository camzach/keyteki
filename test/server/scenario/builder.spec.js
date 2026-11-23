const Settings = require('../../../server/settings.js');
const logger = require('../../../server/log.js');
const PlayerInteractionWrapper = require('../../helpers/playerinteractionwrapper.js');
const { decodeScenario, encodeScenario } = require('../../../server/scenario/payload.js');
const { OPPONENT_NAME, buildScenarioGame } = require('../../../server/scenario/builder.js');

function makeDetails(username = 'tester') {
    const user = Settings.getUserWithDefaultsSet({ username });

    return {
        id: 'scenario-test-game',
        name: 'Scenario test',
        owner: user,
        players: { [username]: { id: 'socket-id', name: username, user } }
    };
}

function build(scenario) {
    return buildScenarioGame(decodeScenario(encodeScenario(scenario)), {
        router: { gameWon: vi.fn(), handleError: vi.fn() },
        details: makeDetails()
    });
}

describe('buildScenarioGame', function () {
    beforeEach(function () {
        vi.spyOn(logger, 'info').mockImplementation(() => {});
    });

    describe('with a full payload', function () {
        beforeEach(function () {
            this.game = build({
                title: 'Test puzzle',
                author: 'someone',
                description: 'Do the thing.',
                player1: {
                    house: 'untamed',
                    houses: ['brobnar', 'untamed', 'sanctum'],
                    amber: 3,
                    keys: { red: true },
                    inPlay: [
                        'keyfrog',
                        {
                            card: 'troll',
                            tokens: { amber: 2, ward: 1 },
                            damage: 2,
                            exhausted: true,
                            upgrades: ['friendship']
                        }
                    ],
                    hand: ['anger'],
                    deck: ['bumpsy', 'ancient-bear'],
                    discard: ['champion-anaphiel', 'dew-faerie'],
                    purged: ['commander-remiel']
                },
                player2: { amber: 1, inPlay: ['drecker'] },
                actions: [{ player: 1, action: 'moveCard', args: [{ card: 'anger' }, 'discard'] }]
            });
            this.player = this.game.getPlayerByName('tester');
            this.opponent = this.game.getPlayerByName(OPPONENT_NAME);
            this.troll = this.player.cardsInPlay.find((card) => card.id === 'troll');
        });

        it('makes the creator the active player, ready to act', function () {
            const wrapper = new PlayerInteractionWrapper(this.game, this.player);

            expect(this.game.started).toBe(true);
            expect(this.game.activePlayer).toBe(this.player);
            expect(this.player.activeHouse).toBe('untamed');
            expect(wrapper).isReadyToTakeAction();
        });

        it('sets amber, keys and houses', function () {
            expect(this.player.amber).toBe(3);
            expect(this.player.keys).toEqual({ red: true, blue: false, yellow: false });
            expect(this.player.houses).toEqual(['brobnar', 'untamed', 'sanctum']);
            expect(this.opponent.amber).toBe(1);
        });

        it('places cards in play with tokens, damage, exhaustion and upgrades', function () {
            expect(this.player.cardsInPlay.map((card) => card.id)).toEqual(['keyfrog', 'troll']);
            expect(this.troll.tokens.amber).toBe(2);
            expect(this.troll.tokens.ward).toBe(1);
            expect(this.troll.damage).toBe(2);
            expect(this.troll.exhausted).toBe(true);
            expect(this.troll.upgrades.map((card) => card.id)).toEqual(['friendship']);
            expect(this.troll.upgrades[0].parent).toBe(this.troll);
            expect(this.opponent.cardsInPlay.map((card) => card.id)).toEqual(['drecker']);
        });

        it('fills the other zones and orders the top of the deck', function () {
            expect(this.player.deck.slice(0, 2).map((card) => card.id)).toEqual([
                'bumpsy',
                'ancient-bear'
            ]);
            expect(this.player.discard.map((card) => card.id)).toEqual([
                'anger',
                'champion-anaphiel',
                'dew-faerie'
            ]);
            expect(this.player.purged.map((card) => card.id)).toEqual(['commander-remiel']);
            expect(this.player.hand).toHaveLength(0);
        });

        it('runs the scripted setup actions', function () {
            expect(this.player.discard[0].id).toBe('anger');
        });

        it('marks the game as a puzzle with an inert opponent', function () {
            expect(this.game.puzzle).toEqual({
                title: 'Test puzzle',
                author: 'someone',
                description: 'Do the thing.'
            });
            expect(this.game.getSaveState().puzzle).toBe(true);
            expect(this.opponent.socket).toBeUndefined();
            expect(this.opponent.disconnectedAt).toEqual(new Date(0));
        });

        it('replaces the chat log with the puzzle introduction', function () {
            const text = JSON.stringify(this.game.gameChat.messages);

            expect(text).toContain('Puzzle: Test puzzle');
            expect(text).toContain('Author: someone');
            expect(text).toContain('Objective: Do the thing.');
            expect(this.game.gameChat.messages).toHaveLength(3);
        });

        it('produces a serialisable game state', function () {
            expect(() => JSON.stringify(this.game.getState('tester'))).not.toThrow();
        });

        it('lets the player act on the board', function () {
            const wrapper = new PlayerInteractionWrapper(this.game, this.player);

            wrapper.reap(this.player.cardsInPlay.find((card) => card.id === 'keyfrog'));

            expect(this.player.amber).toBe(4);
        });
    });

    it('does not apply setup-only state to the creator afterwards', function () {
        const game = build({ player1: { house: 'brobnar', inPlay: ['troll'] } });

        expect(game.getPlayerByName('tester').optionSettings.orderForcedAbilities).toBe(false);
    });

    it('reports unknown cards', function () {
        expect(() => build({ player1: { hand: ['no-such-card'] } })).toThrow(
            'Unable to find any card matching no-such-card'
        );
    });

    it('wraps scripted action failures with the step number', function () {
        expect(() =>
            build({
                player1: { house: 'brobnar', inPlay: ['troll'] },
                actions: [{ player: 1, action: 'clickPrompt', args: ['No such button'] }]
            })
        ).toThrow(/Setup action 1 \(clickPrompt\) failed/);
    });

    it('requires the creator to be one of the players', function () {
        const details = makeDetails();
        details.players = {};

        expect(() =>
            buildScenarioGame(decodeScenario(encodeScenario({})), { router: {}, details })
        ).toThrow('creator is not part of the game');
    });
});
