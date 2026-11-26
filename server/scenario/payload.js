/*
 * Scenario ("puzzle") payload format.
 *
 * A scenario payload is a JSON document describing a starting board state in
 * the same vocabulary as the `setupTest` helper used by the integration tests.
 * It is shipped around as compact JSON encoded with (URL-safe) base64.
 *
 *   {
 *     "version": 1,
 *     "title": "Keep the Sample",
 *     "author": "someone",
 *     "description": "Forge a key this turn without losing ...",
 *     "player1": {                       // the player who launches the scenario
 *       "house": "staralliance",         // house chosen for the first turn
 *       "houses": ["staralliance", "logos", "untamed"],
 *       "amber": 0,
 *       "chains": 0,
 *       "keys": { "red": false, "blue": false, "yellow": false },
 *       "token": "grumpus",
 *       "inPlay": [
 *         "kartanoo",
 *         { "card": "troll", "tokens": { "amber": 4, "ward": 1 }, "damage": 2,
 *           "exhausted": true, "upgrades": ["friendship"] },
 *         { "card": "cauldron", "under": ["refit"] }  // faceup cards under it, same owner
 *       ],
 *       "hand": ["encounter-suit"],
 *       "deck": ["animating-force"],     // the whole draw pile, top first (no filler added)
 *       "discard": [],                   // first entry is the top of the pile
 *       "purged": [],
 *       "archives": []
 *     },
 *     "player2": { ... },                // the (inactive) opponent
 *     "goal": [                         // optional, see ./goal.js (default: forge a key)
 *       { "type": "amber", "min": 6 }
 *     ],
 *     "actions": [                       // optional setup script
 *       { "player": 2, "action": "clickPrompt", "args": ["untamed"] },
 *       { "player": 2, "action": "moveCard", "args": [{ "card": "refit" }, "deck"] }
 *     ]
 *   }
 *
 * Cards are referenced by id (e.g. "sample-42-c") or exact card name.
 * A gigantic creature goes in "inPlay" as either half (e.g. "deusillus"); the
 * other half is composed with it automatically.
 */

const { compactGoal, validateGoal } = require('./goal.js');

const SCENARIO_VERSION = 1;

// Guards against absurd payloads; real puzzles are well under a few KB.
const MAX_ENCODED_LENGTH = 100000;
const MAX_CARDS_PER_ZONE = 60;
const MAX_ACTIONS = 200;
const MAX_ACTION_ARGS = 5;
const MAX_UPGRADES_PER_CARD = 10;
const MAX_UNDER_PER_CARD = 10;
const MAX_STRING_LENGTH = 100;
const MAX_TITLE_LENGTH = 120;
const MAX_AUTHOR_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 2000;

const ZONES = ['inPlay', 'hand', 'deck', 'discard', 'purged', 'archives'];
const KEY_COLORS = ['red', 'blue', 'yellow'];
const PLAYER_KEYS = ['player1', 'player2'];
const PLAYER_FIELDS = ['house', 'houses', 'amber', 'chains', 'keys', 'token', ...ZONES];
const TOP_LEVEL_FIELDS = [
    'version',
    'title',
    'author',
    'description',
    'goal',
    'actions',
    ...PLAYER_KEYS
];
const IN_PLAY_ENTRY_FIELDS = ['card', 'tokens', 'damage', 'exhausted', 'upgrades', 'under'];

// Only these PlayerInteractionWrapper methods may be scripted. This is an
// allow-list so a payload can never reach arbitrary methods on the wrapper.
const ALLOWED_ACTIONS = [
    'clickCard',
    'clickPrompt',
    'endTurn',
    'fightWith',
    'forgeKey',
    'moveCard',
    'play',
    'playCreature',
    'playUpgrade',
    'reap',
    'scrap',
    'useAction',
    'useOmni'
];

const BASE64_PATTERN = /^[A-Za-z0-9+/_-]*={0,2}$/;

function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isNonNegativeInteger(value, max) {
    return Number.isInteger(value) && value >= 0 && value <= max;
}

function isCardLabel(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= MAX_STRING_LENGTH;
}

function validateCardEntry(entry, zone, path, errors) {
    if (isCardLabel(entry)) {
        return;
    }

    if (zone !== 'inPlay' || !isPlainObject(entry)) {
        errors.push(`${path} must be a card id or name`);
        return;
    }

    for (const key of Object.keys(entry)) {
        if (!IN_PLAY_ENTRY_FIELDS.includes(key)) {
            errors.push(`${path}.${key} is not a recognised property`);
        }
    }

    if (!isCardLabel(entry.card)) {
        errors.push(`${path}.card must be a card id or name`);
    }

    if (entry.tokens !== undefined) {
        if (!isPlainObject(entry.tokens)) {
            errors.push(`${path}.tokens must be an object of token counts`);
        } else {
            for (const [type, count] of Object.entries(entry.tokens)) {
                if (!/^[a-z]+$/.test(type) || !Number.isInteger(count) || count < 1 || count > 99) {
                    errors.push(`${path}.tokens.${type} must be an integer between 1 and 99`);
                }
            }
        }
    }

    if (entry.damage !== undefined && !isNonNegativeInteger(entry.damage, 99)) {
        errors.push(`${path}.damage must be an integer between 0 and 99`);
    }

    if (entry.exhausted !== undefined && typeof entry.exhausted !== 'boolean') {
        errors.push(`${path}.exhausted must be a boolean`);
    }

    if (entry.upgrades !== undefined) {
        if (!Array.isArray(entry.upgrades) || entry.upgrades.length > MAX_UPGRADES_PER_CARD) {
            errors.push(
                `${path}.upgrades must be a list of at most ${MAX_UPGRADES_PER_CARD} cards`
            );
        } else {
            entry.upgrades.forEach((upgrade, index) => {
                if (!isCardLabel(upgrade)) {
                    errors.push(`${path}.upgrades[${index}] must be a card id or name`);
                }
            });
        }
    }

    if (entry.under !== undefined) {
        if (!Array.isArray(entry.under) || entry.under.length > MAX_UNDER_PER_CARD) {
            errors.push(`${path}.under must be a list of at most ${MAX_UNDER_PER_CARD} cards`);
        } else {
            entry.under.forEach((card, index) => {
                if (!isCardLabel(card)) {
                    errors.push(`${path}.under[${index}] must be a card id or name`);
                }
            });
        }
    }
}

function validatePlayer(player, key, errors) {
    if (!isPlainObject(player)) {
        errors.push(`${key} must be an object`);
        return;
    }

    for (const field of Object.keys(player)) {
        if (!PLAYER_FIELDS.includes(field)) {
            errors.push(`${key}.${field} is not a recognised property`);
        }
    }

    if (player.house !== undefined && !/^[a-z]+$/.test(player.house)) {
        errors.push(`${key}.house must be a lowercase house name`);
    }

    if (player.houses !== undefined) {
        if (
            !Array.isArray(player.houses) ||
            player.houses.length > 3 ||
            player.houses.some((house) => typeof house !== 'string' || !/^[a-z]+$/.test(house))
        ) {
            errors.push(`${key}.houses must be a list of at most 3 lowercase house names`);
        }
    }

    if (player.amber !== undefined && !isNonNegativeInteger(player.amber, 99)) {
        errors.push(`${key}.amber must be an integer between 0 and 99`);
    }

    if (player.chains !== undefined && !isNonNegativeInteger(player.chains, 24)) {
        errors.push(`${key}.chains must be an integer between 0 and 24`);
    }

    if (player.keys !== undefined) {
        if (!isPlainObject(player.keys)) {
            errors.push(`${key}.keys must be an object`);
        } else {
            for (const [color, forged] of Object.entries(player.keys)) {
                if (!KEY_COLORS.includes(color) || typeof forged !== 'boolean') {
                    errors.push(
                        `${key}.keys.${color} must be one of red/blue/yellow set to a boolean`
                    );
                }
            }
        }
    }

    if (player.token !== undefined && !isCardLabel(player.token)) {
        errors.push(`${key}.token must be a card id or name`);
    }

    for (const zone of ZONES) {
        const entries = player[zone];
        if (entries === undefined) {
            continue;
        }

        if (!Array.isArray(entries) || entries.length > MAX_CARDS_PER_ZONE) {
            errors.push(`${key}.${zone} must be a list of at most ${MAX_CARDS_PER_ZONE} cards`);
            continue;
        }

        entries.forEach((entry, index) =>
            validateCardEntry(entry, zone, `${key}.${zone}[${index}]`, errors)
        );
    }
}

function validateActionArg(arg, path, errors) {
    if (typeof arg === 'string') {
        if (arg.length > MAX_STRING_LENGTH) {
            errors.push(`${path} is too long`);
        }
    } else if (typeof arg === 'number' || typeof arg === 'boolean') {
        return;
    } else if (isPlainObject(arg)) {
        for (const key of Object.keys(arg)) {
            if (!['card', 'location'].includes(key)) {
                errors.push(`${path}.${key} is not a recognised property`);
            }
        }

        if (!isCardLabel(arg.card)) {
            errors.push(`${path}.card must be a card id or name`);
        }

        if (arg.location !== undefined && !isCardLabel(arg.location)) {
            errors.push(`${path}.location must be a location name`);
        }
    } else {
        errors.push(`${path} must be a string, number, boolean or card reference`);
    }
}

function validateActions(actions, errors) {
    if (!Array.isArray(actions) || actions.length > MAX_ACTIONS) {
        errors.push(`actions must be a list of at most ${MAX_ACTIONS} steps`);
        return;
    }

    actions.forEach((step, index) => {
        const path = `actions[${index}]`;

        if (!isPlainObject(step)) {
            errors.push(`${path} must be an object`);
            return;
        }

        for (const key of Object.keys(step)) {
            if (!['player', 'action', 'args'].includes(key)) {
                errors.push(`${path}.${key} is not a recognised property`);
            }
        }

        if (step.player !== 1 && step.player !== 2) {
            errors.push(`${path}.player must be 1 or 2`);
        }

        if (!ALLOWED_ACTIONS.includes(step.action)) {
            errors.push(`${path}.action must be one of ${ALLOWED_ACTIONS.join(', ')}`);
        }

        if (step.args !== undefined) {
            if (!Array.isArray(step.args) || step.args.length > MAX_ACTION_ARGS) {
                errors.push(`${path}.args must be a list of at most ${MAX_ACTION_ARGS} values`);
            } else {
                step.args.forEach((arg, argIndex) =>
                    validateActionArg(arg, `${path}.args[${argIndex}]`, errors)
                );
            }
        }
    });
}

/**
 * Validate a decoded scenario object.
 *
 * @param {unknown} input
 * @returns {{ valid: boolean, errors: string[], scenario?: object }} `scenario`
 * is a compacted copy of the input and is only present when valid.
 */
function validateScenario(input) {
    const errors = [];

    if (!isPlainObject(input)) {
        return { valid: false, errors: ['Scenario must be a JSON object'] };
    }

    for (const key of Object.keys(input)) {
        if (!TOP_LEVEL_FIELDS.includes(key)) {
            errors.push(`${key} is not a recognised property`);
        }
    }

    if (input.version !== undefined && input.version !== SCENARIO_VERSION) {
        errors.push(`Unsupported scenario version ${input.version}`);
    }

    const textLimits = [
        ['title', MAX_TITLE_LENGTH],
        ['author', MAX_AUTHOR_LENGTH],
        ['description', MAX_DESCRIPTION_LENGTH]
    ];
    for (const [field, limit] of textLimits) {
        if (input[field] !== undefined) {
            if (typeof input[field] !== 'string' || input[field].length > limit) {
                errors.push(`${field} must be text of at most ${limit} characters`);
            }
        }
    }

    for (const key of PLAYER_KEYS) {
        if (input[key] !== undefined) {
            validatePlayer(input[key], key, errors);
        }
    }

    if (input.goal !== undefined) {
        validateGoal(input.goal, errors);
    }

    if (input.actions !== undefined) {
        validateActions(input.actions, errors);
    }

    if (errors.length > 0) {
        return { valid: false, errors };
    }

    return { valid: true, errors, scenario: compactScenario(input) };
}

function compactPlayer(player = {}) {
    const compact = {};

    for (const field of ['house', 'token']) {
        if (player[field]) {
            compact[field] = player[field];
        }
    }

    if (player.houses && player.houses.length > 0) {
        compact.houses = [...player.houses];
    }

    for (const field of ['amber', 'chains']) {
        if (player[field]) {
            compact[field] = player[field];
        }
    }

    const keys = {};
    for (const color of KEY_COLORS) {
        if (player.keys && player.keys[color]) {
            keys[color] = true;
        }
    }
    if (Object.keys(keys).length > 0) {
        compact.keys = keys;
    }

    for (const zone of ZONES) {
        const entries = (player[zone] || []).map((entry) => {
            if (typeof entry === 'string') {
                return entry;
            }

            const compactEntry = { card: entry.card };
            if (entry.tokens && Object.keys(entry.tokens).length > 0) {
                compactEntry.tokens = { ...entry.tokens };
            }
            if (entry.damage) {
                compactEntry.damage = entry.damage;
            }
            if (entry.exhausted) {
                compactEntry.exhausted = true;
            }
            if (entry.upgrades && entry.upgrades.length > 0) {
                compactEntry.upgrades = [...entry.upgrades];
            }
            if (entry.under && entry.under.length > 0) {
                compactEntry.under = [...entry.under];
            }

            // Plain cards collapse back to their label to keep payloads small.
            return Object.keys(compactEntry).length === 1 ? compactEntry.card : compactEntry;
        });

        if (entries.length > 0) {
            compact[zone] = entries;
        }
    }

    return compact;
}

/**
 * Strip defaults and empty values so the encoded payload stays small.
 * Assumes the input already passed validation.
 */
function compactScenario(scenario) {
    const compact = { version: SCENARIO_VERSION };

    for (const field of ['title', 'author', 'description']) {
        if (scenario[field]) {
            compact[field] = scenario[field];
        }
    }

    for (const key of PLAYER_KEYS) {
        compact[key] = compactPlayer(scenario[key]);
    }

    if (scenario.goal !== undefined) {
        compact.goal = compactGoal(scenario.goal);
    }

    if (scenario.actions && scenario.actions.length > 0) {
        compact.actions = scenario.actions.map((step) => {
            const compactStep = { player: step.player, action: step.action };
            if (step.args && step.args.length > 0) {
                compactStep.args = [...step.args];
            }
            return compactStep;
        });
    }

    return compact;
}

/**
 * Encode a scenario object as base64 of its compact JSON.
 *
 * @param {object} scenario
 * @param {{ urlSafe?: boolean }} [options] `urlSafe` (default true) uses the
 * URL-safe alphabet without padding so the code can be dropped into a URL.
 * @returns {string}
 */
function encodeScenario(scenario, { urlSafe = true } = {}) {
    const result = validateScenario(scenario);
    if (!result.valid) {
        throw new Error(`Invalid scenario: ${result.errors.join('; ')}`);
    }

    const json = JSON.stringify(result.scenario);

    return Buffer.from(json, 'utf8').toString(urlSafe ? 'base64url' : 'base64');
}

/**
 * Decode a base64 / URL-safe base64 scenario code into a validated scenario.
 * Throws an Error describing the first problem found.
 *
 * @param {string} code
 * @returns {object} the validated, compacted scenario
 */
function decodeScenario(code) {
    if (typeof code !== 'string') {
        throw new Error('Scenario code must be a string');
    }

    const cleaned = code.replace(/\s+/g, '');
    if (cleaned.length === 0) {
        throw new Error('Scenario code is empty');
    }

    if (cleaned.length > MAX_ENCODED_LENGTH) {
        throw new Error('Scenario code is too large');
    }

    if (!BASE64_PATTERN.test(cleaned)) {
        throw new Error('Scenario code is not valid base64');
    }

    let parsed;
    try {
        const json = Buffer.from(cleaned.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(
            'utf8'
        );
        parsed = JSON.parse(json);
    } catch (err) {
        throw new Error('Scenario code does not contain valid JSON');
    }

    const result = validateScenario(parsed);
    if (!result.valid) {
        throw new Error(`Invalid scenario: ${result.errors.join('; ')}`);
    }

    return result.scenario;
}

module.exports = {
    ALLOWED_ACTIONS,
    SCENARIO_VERSION,
    compactScenario,
    decodeScenario,
    encodeScenario,
    validateScenario
};
