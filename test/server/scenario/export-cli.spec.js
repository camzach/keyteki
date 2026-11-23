/* global afterAll */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const logger = require('../../../server/log.js');
const { decodeScenario } = require('../../../server/scenario/payload.js');
const { main, scenarioFromGame } = require('../../../server/scenario/export.js');

const EXAMPLE_SPEC_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'example-spec-'));
const EXAMPLE_SPEC = path.join(EXAMPLE_SPEC_DIR, 'Example.spec.js');

fs.writeFileSync(
    EXAMPLE_SPEC,
    [
        '// Puzzle: Example Puzzle',
        '// Objective: Forge a key this turn.',
        "describe('Example', function () {",
        '    beforeEach(function () {',
        "        this.setupTest({ player1: { house: 'brobnar', amber: 6, inPlay: ['troll'] } });",
        '    });',
        "    it('exports the board', function () {});",
        '});'
    ].join('\n')
);

afterAll(function () {
    fs.rmSync(EXAMPLE_SPEC_DIR, { recursive: true, force: true });
});

function fakePlayer(overrides = {}) {
    return {
        houses: ['brobnar', 'untamed', 'sanctum'],
        amber: 0,
        chains: 0,
        keys: { red: false, blue: false, yellow: false },
        cardsInPlay: [],
        hand: [],
        deck: [],
        discard: [],
        purged: [],
        archives: [],
        ...overrides
    };
}

function fakeCard(player, overrides = {}) {
    return {
        id: 'troll',
        name: 'Troll',
        owner: player,
        isToken: () => false,
        childCards: [],
        tokens: {},
        upgrades: [],
        exhausted: false,
        ...overrides
    };
}

function exportFake(player1, player2 = fakePlayer()) {
    return scenarioFromGame({ getPlayers: () => [player1, player2], activePlayer: player1 });
}

describe('scenario export CLI', function () {
    beforeEach(function () {
        vi.spyOn(logger, 'info').mockImplementation(() => {});
        this.log = vi.spyOn(console, 'log').mockImplementation(() => {});
        this.error = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(function () {
        this.log.mockRestore();
        this.error.mockRestore();
    });

    it('prints a URL-safe code for a spec', function () {
        expect(main([EXAMPLE_SPEC])).toBe(0);

        const code = this.log.mock.calls[0][0];
        expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(decodeScenario(code).title).toBe('Example Puzzle');
    });

    it('prints standard base64 with --standard', function () {
        expect(main([EXAMPLE_SPEC, '--standard'])).toBe(0);

        const code = this.log.mock.calls[0][0];
        expect(decodeScenario(code).title).toBe('Example Puzzle');
        expect(code).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    });

    it('prints usage and fails without a spec', function () {
        expect(main(['--standard'])).toBe(1);

        expect(this.error).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
        expect(this.log).not.toHaveBeenCalled();
    });
});

describe('scenarioFromGame snapshots', function () {
    it('captures exhaustion, upgrades, damage, tokens and the token card', function () {
        const player = fakePlayer({ activeHouse: 'brobnar', tokenCard: { id: 'grumpus' } });
        const upgrade = { id: 'friendship' };
        player.cardsInPlay.push(
            fakeCard(player, {
                exhausted: true,
                upgrades: [upgrade],
                tokens: { damage: 2, ward: 1 }
            })
        );

        const scenario = exportFake(player);

        expect(scenario.player1).toMatchObject({
            house: 'brobnar',
            token: 'grumpus',
            inPlay: [
                {
                    card: 'troll',
                    exhausted: true,
                    damage: 2,
                    tokens: { ward: 1 },
                    upgrades: ['friendship']
                }
            ]
        });
    });

    it('refuses token creatures in play', function () {
        const player = fakePlayer();
        player.cardsInPlay.push(fakeCard(player, { name: 'Grumpus', isToken: () => true }));

        expect(() => exportFake(player)).toThrow('Cannot export token creature "Grumpus"');
    });

    it('refuses cards controlled by a player who does not own them', function () {
        const player = fakePlayer();
        player.cardsInPlay.push(fakeCard(fakePlayer()));

        expect(() => exportFake(player)).toThrow('controlled by a player who does not own it');
    });
});
