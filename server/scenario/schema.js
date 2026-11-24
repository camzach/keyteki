/*
 * JSON Schema (draft 2020-12) for scenario payloads, served at
 * /scenario.schema.json. The validator in ./payload.js is the source of truth;
 * this describes the same shape for authors and editors.
 */

const { LOCATIONS } = require('./goal.js');
const { ALLOWED_ACTIONS, SCENARIO_VERSION } = require('./payload.js');

const cardLabel = { type: 'string', minLength: 1, maxLength: 100 };
const house = { type: 'string', pattern: '^[a-z]+$' };
const player = { enum: [1, 2] };
const cardList = {
    type: 'array',
    maxItems: 60,
    items: { $ref: '#/$defs/cardLabel' }
};
const cardLabels = (description) => ({
    description,
    type: 'array',
    maxItems: 10,
    items: { $ref: '#/$defs/cardLabel' }
});

const scenarioSchema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'Brainforge puzzle scenario',
    description:
        'A puzzle starting position. Cards are card ids (e.g. "sample-42-c") or exact card names. ' +
        'A scenario code is this JSON as URL-safe base64.',
    type: 'object',
    additionalProperties: false,
    properties: {
        version: { const: SCENARIO_VERSION },
        title: { type: 'string', maxLength: 120 },
        author: { type: 'string', maxLength: 80 },
        description: { type: 'string', maxLength: 2000 },
        player1: {
            description: 'The player who launches the puzzle.',
            $ref: '#/$defs/player'
        },
        player2: {
            description: 'The inactive opponent.',
            $ref: '#/$defs/player'
        },
        goal: {
            description:
                'Conditions that must all hold once the game has settled. Defaults to forging a key beyond those already forged.',
            oneOf: [
                { $ref: '#/$defs/condition' },
                {
                    type: 'array',
                    minItems: 1,
                    maxItems: 10,
                    items: { $ref: '#/$defs/condition' }
                }
            ]
        },
        actions: {
            description: 'An optional setup script, run before the puzzle starts.',
            type: 'array',
            maxItems: 200,
            items: { $ref: '#/$defs/action' }
        }
    },
    $defs: {
        cardLabel,
        cardList,
        house,
        player: {
            type: 'object',
            additionalProperties: false,
            properties: {
                house: {
                    ...house,
                    description: 'The house chosen for the first turn.'
                },
                houses: {
                    type: 'array',
                    maxItems: 3,
                    items: { $ref: '#/$defs/house' }
                },
                amber: { type: 'integer', minimum: 0, maximum: 99 },
                chains: { type: 'integer', minimum: 0, maximum: 24 },
                keys: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        red: { type: 'boolean' },
                        blue: { type: 'boolean' },
                        yellow: { type: 'boolean' }
                    }
                },
                token: {
                    ...cardLabel,
                    description: 'The token creature card.'
                },
                inPlay: {
                    type: 'array',
                    maxItems: 60,
                    items: {
                        oneOf: [{ $ref: '#/$defs/cardLabel' }, { $ref: '#/$defs/inPlayCard' }]
                    }
                },
                hand: cardList,
                deck: {
                    ...cardList,
                    description: 'The whole draw pile, top card first. Nothing is added.'
                },
                discard: { ...cardList, description: 'Top of the pile first.' },
                purged: cardList,
                archives: cardList
            }
        },
        inPlayCard: {
            type: 'object',
            additionalProperties: false,
            required: ['card'],
            properties: {
                card: { $ref: '#/$defs/cardLabel' },
                tokens: {
                    description: 'Absolute counts; they replace printed values such as armor.',
                    type: 'object',
                    propertyNames: { pattern: '^[a-z]+$' },
                    additionalProperties: {
                        type: 'integer',
                        minimum: 1,
                        maximum: 99
                    }
                },
                damage: { type: 'integer', minimum: 0, maximum: 99 },
                exhausted: { type: 'boolean' },
                upgrades: cardLabels('Upgrades attached to this card.'),
                under: cardLabels('Faceup cards under this card, owned by the same player.')
            }
        },
        condition: {
            oneOf: [
                {
                    type: 'object',
                    additionalProperties: false,
                    required: ['type', 'count'],
                    properties: {
                        type: { const: 'keys' },
                        player,
                        count: { type: 'integer', minimum: 0, maximum: 3 }
                    }
                },
                {
                    type: 'object',
                    additionalProperties: false,
                    required: ['type'],
                    anyOf: [{ required: ['min'] }, { required: ['max'] }],
                    properties: {
                        type: { const: 'amber' },
                        player,
                        min: { type: 'integer', minimum: 0, maximum: 99 },
                        max: { type: 'integer', minimum: 0, maximum: 99 }
                    }
                },
                {
                    type: 'object',
                    additionalProperties: false,
                    required: ['type', 'card', 'location'],
                    properties: {
                        type: { const: 'card' },
                        player,
                        card: { $ref: '#/$defs/cardLabel' },
                        location: { enum: [...LOCATIONS, 'inPlay'] },
                        not: { type: 'boolean' }
                    }
                }
            ]
        },
        actionArg: {
            oneOf: [
                { type: 'string', maxLength: 100 },
                { type: 'number' },
                { type: 'boolean' },
                {
                    type: 'object',
                    additionalProperties: false,
                    required: ['card'],
                    properties: {
                        card: { $ref: '#/$defs/cardLabel' },
                        location: { $ref: '#/$defs/cardLabel' }
                    }
                }
            ]
        },
        action: {
            type: 'object',
            additionalProperties: false,
            required: ['player', 'action'],
            properties: {
                player,
                action: { enum: ALLOWED_ACTIONS },
                args: {
                    type: 'array',
                    maxItems: 5,
                    items: { $ref: '#/$defs/actionArg' }
                }
            }
        }
    }
};

module.exports = { scenarioSchema };
