/*
 * Scenario goals: the conditions that solve a puzzle.
 *
 * `goal` is a list of conditions (a single object is accepted too) that must
 * all hold at the same time. It is checked every time the game state changes,
 * from the point of view of player 1 (the creator) unless `player` says otherwise.
 *
 *   "goal": [
 *     { "type": "keys", "count": 1 },                     // forged keys >= count
 *     { "type": "amber", "min": 6, "max": 8 },            // amber within bounds
 *     { "type": "card", "card": "troll", "location": "discard", "player": 2 },
 *     { "type": "card", "card": "gub", "location": "play area", "not": true }
 *   ]
 *
 * Without a goal, a puzzle is solved by forging a key beyond those forged at
 * the start.
 */

const MAX_CONDITIONS = 10;
const MAX_STRING_LENGTH = 100;
const CONDITION_TYPES = ['keys', 'amber', 'card'];
const LOCATIONS = ['play area', 'hand', 'deck', 'discard', 'purged', 'archives'];
const CONDITION_FIELDS = {
    keys: ['type', 'player', 'count'],
    amber: ['type', 'player', 'min', 'max'],
    card: ['type', 'player', 'card', 'location', 'not']
};

const isPlainObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const isCount = (value, max) => Number.isInteger(value) && value >= 0 && value <= max;

function normaliseLocation(location) {
    return location === 'inPlay' ? 'play area' : location;
}

function validateCondition(condition, path, errors) {
    if (!isPlainObject(condition) || !CONDITION_TYPES.includes(condition.type)) {
        errors.push(`${path}.type must be one of ${CONDITION_TYPES.join(', ')}`);
        return;
    }

    for (const key of Object.keys(condition)) {
        if (!CONDITION_FIELDS[condition.type].includes(key)) {
            errors.push(`${path}.${key} is not a recognised property`);
        }
    }

    if (condition.player !== undefined && condition.player !== 1 && condition.player !== 2) {
        errors.push(`${path}.player must be 1 or 2`);
    }

    if (condition.type === 'keys' && !isCount(condition.count, 3)) {
        errors.push(`${path}.count must be an integer between 0 and 3`);
    }

    if (condition.type === 'amber') {
        if (condition.min === undefined && condition.max === undefined) {
            errors.push(`${path} needs a min and/or max`);
        }
        for (const bound of ['min', 'max']) {
            if (condition[bound] !== undefined && !isCount(condition[bound], 99)) {
                errors.push(`${path}.${bound} must be an integer between 0 and 99`);
            }
        }
    }

    if (condition.type === 'card') {
        if (
            typeof condition.card !== 'string' ||
            condition.card.length === 0 ||
            condition.card.length > MAX_STRING_LENGTH
        ) {
            errors.push(`${path}.card must be a card id or name`);
        }
        if (!LOCATIONS.includes(normaliseLocation(condition.location))) {
            errors.push(`${path}.location must be one of ${LOCATIONS.join(', ')}`);
        }
        if (condition.not !== undefined && typeof condition.not !== 'boolean') {
            errors.push(`${path}.not must be a boolean`);
        }
    }
}

function validateGoal(goal, errors) {
    const conditions = Array.isArray(goal) ? goal : [goal];

    if (conditions.length === 0 || conditions.length > MAX_CONDITIONS) {
        errors.push(`goal must have between 1 and ${MAX_CONDITIONS} conditions`);
        return;
    }

    conditions.forEach((condition, index) =>
        validateCondition(condition, `goal[${index}]`, errors)
    );
}

/** Returns the goal as a compact list of conditions. Assumes it passed validation. */
function compactGoal(goal) {
    return (Array.isArray(goal) ? goal : [goal]).map((condition) => {
        const compact = { type: condition.type };

        if (condition.player === 2) {
            compact.player = 2;
        }

        if (condition.type === 'keys') {
            compact.count = condition.count;
        } else if (condition.type === 'amber') {
            for (const bound of ['min', 'max']) {
                if (condition[bound] !== undefined) {
                    compact[bound] = condition[bound];
                }
            }
        } else {
            compact.card = condition.card;
            compact.location = normaliseLocation(condition.location);
            if (condition.not) {
                compact.not = true;
            }
        }

        return compact;
    });
}

function cardMatches(card, label) {
    const wanted = label.toLowerCase();

    return card.id === wanted || (card.name || '').toLowerCase() === wanted;
}

function cardsAt(player, location) {
    return location === 'play area' ? player.cardsInPlay : player[location];
}

function isConditionMet(condition, players) {
    const player = players[(condition.player || 1) - 1];
    if (!player) {
        return false;
    }

    switch (condition.type) {
        case 'keys':
            return player.getForgedKeys() >= condition.count;
        case 'amber':
            return (
                (condition.min === undefined || player.amber >= condition.min) &&
                (condition.max === undefined || player.amber <= condition.max)
            );
        default: {
            const found = cardsAt(player, condition.location).some((card) =>
                cardMatches(card, condition.card)
            );

            return condition.not ? !found : found;
        }
    }
}

/**
 * @param {import('../game/game')} game
 * @param {{ playerNames: string[], conditions: object[] }} goal - playerNames[0] is the creator
 */
function isGoalMet(game, goal) {
    const players = goal.playerNames.map((name) => game.getPlayerByName(name));

    return goal.conditions.every((condition) => isConditionMet(condition, players));
}

function describeCondition(condition) {
    const who = condition.player === 2 ? 'Opponent' : 'You';

    switch (condition.type) {
        case 'keys':
            return `${who} ${who === 'You' ? 'have' : 'has'} ${condition.count}+ forged key(s)`;
        case 'amber': {
            const bounds = [];
            if (condition.min !== undefined) {
                bounds.push(`at least ${condition.min}`);
            }
            if (condition.max !== undefined) {
                bounds.push(`at most ${condition.max}`);
            }

            return `${who} ${who === 'You' ? 'have' : 'has'} ${bounds.join(' and ')} amber`;
        }
        default:
            return `${condition.card} ${condition.not ? 'is not' : 'is'} in ${
                condition.player === 2 ? "the opponent's" : 'your'
            } ${condition.location}`;
    }
}

module.exports = {
    compactGoal,
    describeCondition,
    isGoalMet,
    normaliseLocation,
    validateGoal
};
