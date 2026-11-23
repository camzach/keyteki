// @ts-nocheck
/* eslint no-console:0 */

/*
 * Helpers for turning an existing puzzle spec or `setupTest` options into a
 * shareable scenario code.
 *
 *   node server/scenario/export.js path/to/foo.spec.js
 *   node server/scenario/export.js path/to/foo.spec.js#test name --standard
 */

const fs = require('fs');
const path = require('path');

const { encodeScenario, SCENARIO_VERSION, validateScenario } = require('./payload.js');

const SETUP_FIELDS = [
    'house',
    'houses',
    'amber',
    'chains',
    'keys',
    'token',
    'inPlay',
    'hand',
    'deck',
    'discard',
    'purged',
    'archives'
];

function cardId(card) {
    return card.id;
}

function snapshotInPlayCard(card, player) {
    if (card.isToken()) {
        throw new Error(`Cannot export token creature "${card.name}" in play`);
    }

    if (card.owner !== player) {
        throw new Error(`Cannot export "${card.name}": controlled by a player who does not own it`);
    }

    if (card.childCards.length > 0) {
        throw new Error(`Cannot export "${card.name}": cards placed under it are not supported`);
    }

    const { damage, ...tokens } = card.tokens;
    const entry = { card: cardId(card) };

    if (Object.keys(tokens).length > 0) {
        entry.tokens = { ...tokens };
    }
    if (damage) {
        entry.damage = damage;
    }
    if (card.exhausted) {
        entry.exhausted = true;
    }
    if (card.upgrades.length > 0) {
        entry.upgrades = card.upgrades.map(cardId);
    }

    return entry;
}

function snapshotPlayer(player, { includeHouse }) {
    const snapshot = {
        houses: [...player.houses],
        amber: player.amber,
        chains: player.chains,
        keys: { ...player.keys },
        inPlay: player.cardsInPlay.map((card) => snapshotInPlayCard(card, player)),
        hand: player.hand.map(cardId),
        deck: player.deck.map(cardId),
        discard: player.discard.map(cardId),
        purged: player.purged.map(cardId),
        archives: player.archives.map(cardId)
    };

    if (includeHouse && player.activeHouse) {
        snapshot.house = player.activeHouse;
    }

    if (player.tokenCard) {
        snapshot.token = cardId(player.tokenCard);
    }

    return snapshot;
}

/**
 * Snapshot a running game's board. The active player becomes `player1`.
 * Throws if the board uses state a scenario cannot represent.
 *
 * @param {import('../game/game')} game
 * @param {{ title?: string, author?: string, description?: string }} [meta]
 * @returns {object} a scenario object
 */
function scenarioFromGame(game, meta = {}) {
    const players = game.getPlayers();
    const first = game.activePlayer || players[0];
    const second = players.find((player) => player !== first);

    const scenario = {
        version: SCENARIO_VERSION,
        ...meta,
        player1: snapshotPlayer(first, { includeHouse: true }),
        player2: snapshotPlayer(second, { includeHouse: false })
    };

    return validateScenarioOrThrow(scenario);
}

/**
 * Convert `setupTest` options (as passed in a spec) to a scenario object.
 * Only the fields a scenario understands are kept.
 *
 * @param {object} options
 * @param {{ title?: string, author?: string, description?: string }} [meta]
 * @returns {object} a scenario object
 */
function scenarioFromSetupOptions(options, meta = {}) {
    const scenario = { version: SCENARIO_VERSION, ...meta };

    for (const key of ['player1', 'player2']) {
        scenario[key] = {};
        for (const field of SETUP_FIELDS) {
            if (options[key] && options[key][field] !== undefined) {
                scenario[key][field] = options[key][field];
            }
        }
    }

    return validateScenarioOrThrow(scenario);
}

function validateScenarioOrThrow(scenario) {
    const result = validateScenario(scenario);
    if (!result.valid) {
        throw new Error(`Invalid scenario: ${result.errors.join('; ')}`);
    }

    return result.scenario;
}

function metaFromSpecSource(specPath) {
    const source = fs.readFileSync(specPath, 'utf8');
    const meta = {};

    const title = source.match(/^\/\/ Puzzle:\s*(.+)$/m);
    const objective = source.match(/^\/\/ Objective:\s*(.+)$/m);

    meta.title = title ? title[1].trim() : path.basename(specPath).replace(/\.spec\.js$/, '');
    if (objective) {
        meta.description = objective[1].trim();
    }

    return meta;
}

/**
 * Run the `beforeEach` hooks of a spec test (without its body) and snapshot the
 * resulting board.
 *
 * @param {string} specPath - path/to/foo.spec.js[#test name]
 * @param {{ title?: string, author?: string, description?: string }} [meta] overrides
 * @returns {object} a scenario object
 */
function scenarioFromSpec(specPath, meta = {}) {
    // Loaded lazily: the runner pulls in the whole game engine.
    const { runScenario } = require('../devtools/scenario/runner.js');

    const rawPath = specPath.split('#')[0];
    const game = runScenario(specPath, {
        router: { gameWon() {}, handleError() {} },
        hooksOnly: true
    });

    return scenarioFromGame(game, { ...metaFromSpecSource(rawPath), ...meta });
}

/**
 * @param {string} specPath - path/to/foo.spec.js[#test name]
 * @param {{ title?: string, author?: string, description?: string }} [meta]
 * @param {{ urlSafe?: boolean }} [encodeOptions]
 * @returns {string} the base64 scenario code
 */
function exportSpec(specPath, meta = {}, encodeOptions = {}) {
    return encodeScenario(scenarioFromSpec(specPath, meta), encodeOptions);
}

function main(argv) {
    const args = argv.filter((arg) => !arg.startsWith('--'));
    const flags = argv.filter((arg) => arg.startsWith('--'));

    if (args.length === 0) {
        console.error('Usage: node server/scenario/export.js <spec.js[#test name]> [--standard]');
        return 1;
    }

    console.log(exportSpec(args.join(' '), {}, { urlSafe: !flags.includes('--standard') }));

    return 0;
}

module.exports = {
    exportSpec,
    main,
    scenarioFromGame,
    scenarioFromSetupOptions,
    scenarioFromSpec
};

if (require.main === module) {
    try {
        process.exitCode = main(process.argv.slice(2));
    } catch (err) {
        console.error(err.message);
        process.exitCode = 1;
    }
}
