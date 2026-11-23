const Settings = require('../../../server/settings.js');
const logger = require('../../../server/log.js');
const PendingGame = require('../../../server/pendinggame.js');
const GameServer = require('../../../server/gamenode/gameserver.js');
const {
    decodeScenario,
    encodeScenario,
    validateScenario
} = require('../../../server/scenario/payload.js');

const baseScenario = {
    title: 'Goal test',
    player1: { house: 'brobnar', amber: 2, inPlay: ['troll'] },
    player2: { inPlay: ['gub'] }
};

describe('scenario goal payload', function () {
    it('round-trips a goal through encoding', function () {
        const goal = [
            { type: 'keys', count: 2 },
            { type: 'amber', min: 6, max: 8, player: 2 },
            { type: 'card', card: 'troll', location: 'inPlay', not: true }
        ];

        const decoded = decodeScenario(encodeScenario({ ...baseScenario, goal }));

        expect(decoded.goal).toEqual([
            { type: 'keys', count: 2 },
            { type: 'amber', player: 2, min: 6, max: 8 },
            { type: 'card', card: 'troll', location: 'play area', not: true }
        ]);
    });

    it('accepts a single condition object', function () {
        const result = validateScenario({
            ...baseScenario,
            goal: { type: 'amber', min: 6 }
        });

        expect(result.valid).toBe(true);
        expect(result.scenario.goal).toEqual([{ type: 'amber', min: 6 }]);
    });

    it('omits the goal when none is given', function () {
        expect(validateScenario(baseScenario).scenario.goal).toBeUndefined();
    });

    const invalidGoals = [
        [[{ type: 'nope' }], 'goal[0].type'],
        [[{ type: 'keys', count: 4 }], 'goal[0].count'],
        [[{ type: 'keys', count: 1, extra: true }], 'goal[0].extra'],
        [[{ type: 'amber' }], 'needs a min and/or max'],
        [[{ type: 'amber', min: -1 }], 'goal[0].min'],
        [[{ type: 'card', card: 'troll', location: 'moon' }], 'goal[0].location'],
        [[{ type: 'card', location: 'hand' }], 'goal[0].card'],
        [[{ type: 'amber', min: 1, player: 3 }], 'goal[0].player'],
        [[], 'goal must have']
    ];

    for (const [goal, message] of invalidGoals) {
        it(`rejects invalid goal ${JSON.stringify(goal)}`, function () {
            const result = validateScenario({ ...baseScenario, goal });

            expect(result.valid).toBe(false);
            expect(result.errors.join('; ')).toContain(message);
        });
    }
});

describe('scenario goal in a game', function () {
    function start(context, goal) {
        const user = Settings.getUserWithDefaultsSet({
            username: 'tester',
            getDetails() {
                return {
                    username: 'tester',
                    settings: this.settings,
                    permissions: {},
                    blockList: []
                };
            }
        });
        const pendingGame = new PendingGame(user, { name: 'x', puzzle: true });
        pendingGame.newGame('socket-id', user, undefined, true);

        context.server = {
            games: {},
            cardData: undefined,
            gameSocket: { send: vi.fn() },
            sendGameState: vi.fn(),
            gameWon: GameServer.prototype.gameWon
        };
        GameServer.prototype.onStartScenario.call(
            context.server,
            pendingGame.getStartGameDetails(),
            validateScenario({ ...baseScenario, goal }).scenario
        );
        context.game = context.server.games[pendingGame.id];
        context.player = context.game.getPlayerByName('tester');
        context.opponent = context.game.getPlayerByName('Puzzle Opponent');
    }

    beforeEach(function () {
        vi.spyOn(logger, 'info').mockImplementation(() => {});
        vi.spyOn(logger, 'error').mockImplementation(() => {});
    });

    it('is solved by an amber goal, and forging a key does not solve it', function () {
        start(this, [{ type: 'amber', min: 8 }]);

        this.player.keys.red = true;
        this.game.checkGameState(true);
        expect(this.game.winner).toBeUndefined();

        this.player.amber = 8;
        this.game.checkGameState(true);
        expect(this.game.winner).toBe(this.player);
        expect(this.game.winReason).toBe('puzzle solved');
    });

    it('is solved by a card location goal for the opponent', function () {
        start(this, [{ type: 'card', card: 'gub', location: 'discard', player: 2 }]);
        this.game.checkGameState(true);
        expect(this.game.winner).toBeUndefined();

        this.opponent.moveCard(this.opponent.cardsInPlay[0], 'discard');
        this.game.checkGameState(true);

        expect(this.game.winner).toBe(this.player);
    });

    it('supports negated card conditions', function () {
        start(this, [{ type: 'card', card: 'Gub', location: 'play area', player: 2, not: true }]);
        expect(this.game.winner).toBeUndefined();

        this.opponent.moveCard(this.opponent.cardsInPlay[0], 'discard');
        this.game.checkGameState(true);

        expect(this.game.winner).toBe(this.player);
    });

    it('requires every condition to hold', function () {
        start(this, [
            { type: 'amber', min: 5 },
            { type: 'keys', count: 1 }
        ]);

        this.player.amber = 5;
        this.game.checkGameState(true);
        expect(this.game.winner).toBeUndefined();

        this.player.keys.red = true;
        this.game.checkGameState(true);
        expect(this.game.winner).toBe(this.player);
    });

    it('announces an explicit goal in the game log', function () {
        start(this, [{ type: 'amber', min: 8 }]);

        const messages = JSON.stringify(this.game.gameChat.messages);
        expect(messages).toContain('Goal: You have at least 8 amber');
    });
});

describe('scenario goal in the client preview', function () {
    it('summarizes the goal, with an empty list for the default goal', async function () {
        const client = await import('../../../client/scenario/payload.js');
        const summarize = (goal) =>
            client.summarizeScenario(
                client.decodeScenarioCode(encodeScenario({ ...baseScenario, goal }))
            );

        expect(summarize(undefined).goal).toEqual([]);
        expect(
            summarize([
                { type: 'amber', min: 6 },
                { type: 'card', card: 'gub', location: 'discard', player: 2 }
            ]).goal
        ).toEqual(['You have at least 6 amber', "gub is in the opponent's discard"]);
    });
});

describe('scenario goal announcement', function () {
    it('is skipped when the scenario has an objective description', function () {
        const goal = [{ type: 'amber', min: 8 }];
        const { buildScenarioGame } = require('../../../server/scenario/builder.js');
        const user = Settings.getUserWithDefaultsSet({
            username: 'tester',
            getDetails() {
                return {
                    username: 'tester',
                    settings: this.settings,
                    permissions: {},
                    blockList: []
                };
            }
        });
        const pendingGame = new PendingGame(user, { name: 'x', puzzle: true });
        pendingGame.newGame('socket-id', user, undefined, true);

        const game = buildScenarioGame(
            validateScenario({ ...baseScenario, description: 'Gain amber.', goal }).scenario,
            { router: {}, details: pendingGame.getStartGameDetails() }
        );

        const messages = JSON.stringify(game.gameChat.messages);
        expect(messages).toContain('Objective: Gain amber.');
        expect(messages).not.toContain('Goal:');
    });
});
