/*
 * Client-side counterpart of server/scenario/payload.js: decodes a base64 /
 * URL-safe base64 scenario code, performs a light structural check and builds
 * a summary for the preview. The server remains the authority and fully
 * validates the code again when the scenario is launched.
 */

const MAX_ENCODED_LENGTH = 100000;
const BASE64_PATTERN = /^[A-Za-z0-9+/_-]*={0,2}$/;
const PLAYER_KEYS = ['player1', 'player2'];
const ZONES = ['inPlay', 'hand', 'deck', 'discard', 'purged', 'archives'];

const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

/**
 * @param {string} code
 * @returns {object} the parsed scenario
 * @throws {Error} when the code is not a scenario
 */
export function decodeScenarioCode(code) {
    const cleaned = (code || '').replace(/\s+/g, '');

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
        const standard = cleaned.replace(/-/g, '+').replace(/_/g, '/');
        const padded = standard + '='.repeat((4 - (standard.length % 4)) % 4);
        const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
        parsed = JSON.parse(new TextDecoder().decode(bytes));
    } catch (err) {
        throw new Error('Scenario code does not contain valid JSON');
    }

    if (!isObject(parsed)) {
        throw new Error('Scenario must be a JSON object');
    }

    for (const key of PLAYER_KEYS) {
        const player = parsed[key];

        if (player !== undefined && !isObject(player)) {
            throw new Error(`${key} must be an object`);
        }

        for (const zone of ZONES) {
            if (player && player[zone] !== undefined && !Array.isArray(player[zone])) {
                throw new Error(`${key}.${zone} must be a list of cards`);
            }
        }
    }

    return parsed;
}

const cardLabel = (entry) => (typeof entry === 'string' ? entry : entry?.card);

function summarizePlayer(player = {}) {
    const inPlay = (player.inPlay || []).map((entry) => {
        const details = [];

        if (isObject(entry)) {
            for (const [type, count] of Object.entries(entry.tokens || {})) {
                details.push(`${count} ${type}`);
            }
            if (entry.damage) {
                details.push(`${entry.damage} damage`);
            }
            if (entry.exhausted) {
                details.push('exhausted');
            }
            if (entry.upgrades?.length) {
                details.push(`upgrades: ${entry.upgrades.join(', ')}`);
            }
        }

        return { card: cardLabel(entry), details };
    });

    return {
        house: player.house,
        houses: player.houses || [],
        amber: player.amber || 0,
        chains: player.chains || 0,
        keys: Object.keys(player.keys || {}).filter((color) => player.keys[color]),
        inPlay,
        hand: (player.hand || []).map(cardLabel),
        deckCount: (player.deck || []).length,
        discardCount: (player.discard || []).length,
        purgedCount: (player.purged || []).length,
        archivesCount: (player.archives || []).length
    };
}

function describeCondition(condition) {
    if (!isObject(condition)) {
        return 'Unknown condition';
    }

    const opponent = condition.player === 2;
    const who = opponent ? 'Opponent has' : 'You have';

    switch (condition.type) {
        case 'keys':
            return `${who} ${condition.count}+ forged key(s)`;
        case 'amber': {
            const bounds = [];
            if (condition.min !== undefined) {
                bounds.push(`at least ${condition.min}`);
            }
            if (condition.max !== undefined) {
                bounds.push(`at most ${condition.max}`);
            }

            return `${who} ${bounds.join(' and ')} amber`;
        }
        case 'card':
            return `${condition.card} ${condition.not ? 'is not' : 'is'} in ${
                opponent ? "the opponent's" : 'your'
            } ${condition.location === 'inPlay' ? 'play area' : condition.location}`;
        default:
            return 'Unknown condition';
    }
}

/**
 * @param {object} scenario - the result of decodeScenarioCode
 */
export function summarizeScenario(scenario) {
    return {
        title: scenario.title,
        author: scenario.author,
        description: scenario.description,
        goal: [].concat(scenario.goal || []).map(describeCondition),
        actionCount: (scenario.actions || []).length,
        player1: summarizePlayer(scenario.player1),
        player2: summarizePlayer(scenario.player2)
    };
}
