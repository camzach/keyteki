const {
    decodeScenario,
    encodeScenario,
    validateScenario
} = require('../../../server/scenario/payload.js');

const scenario = {
    title: 'Keep the Sample',
    author: 'someone',
    description: 'Forge a key this turn.',
    player1: {
        house: 'brobnar',
        houses: ['brobnar', 'untamed', 'sanctum'],
        amber: 4,
        keys: { red: true },
        inPlay: [
            'keyfrog',
            { card: 'troll', tokens: { amber: 2 }, damage: 1, upgrades: ['friendship'] }
        ],
        hand: ['anger'],
        deck: ['bumpsy'],
        discard: ['ancient-bear'],
        purged: ['gub'],
        archives: ['dextre']
    },
    player2: { inPlay: ['gub'] },
    actions: [{ player: 2, action: 'clickPrompt', args: ['untamed'] }]
};

describe('scenario payload', function () {
    describe('encodeScenario / decodeScenario', function () {
        it('round trips through URL-safe base64 by default', function () {
            const code = encodeScenario(scenario);

            expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
            expect(decodeScenario(code)).toEqual({ version: 1, ...scenario });
        });

        it('round trips through standard base64', function () {
            const code = encodeScenario(scenario, { urlSafe: false });

            expect(decodeScenario(code)).toEqual({ version: 1, ...scenario });
        });

        it('accepts padding, surrounding whitespace and line breaks', function () {
            const code = encodeScenario(scenario, { urlSafe: false });
            const wrapped = `  ${code.slice(0, 20)}\n${code.slice(20)}  `;

            expect(decodeScenario(wrapped)).toEqual(decodeScenario(code));
        });

        it('accepts unpadded standard base64', function () {
            const code = encodeScenario(scenario, { urlSafe: false }).replace(/=+$/, '');

            expect(decodeScenario(code).title).toBe(scenario.title);
        });

        it('produces compact JSON without empty defaults', function () {
            const code = encodeScenario({ player1: { amber: 0, hand: [], keys: {} }, player2: {} });
            const json = Buffer.from(code, 'base64url').toString('utf8');

            expect(json).toBe('{"version":1,"player1":{},"player2":{}}');
        });

        it('collapses plain in play entries to their card label', function () {
            const compact = validateScenario({
                player1: { inPlay: [{ card: 'troll' }, { card: 'gub', damage: 0 }] }
            }).scenario;

            expect(compact.player1.inPlay).toEqual(['troll', 'gub']);
        });
    });

    describe('invalid payloads', function () {
        const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

        it('rejects non-strings and empty codes', function () {
            expect(() => decodeScenario(undefined)).toThrow('must be a string');
            expect(() => decodeScenario('   ')).toThrow('empty');
        });

        it('rejects text that is not base64', function () {
            expect(() => decodeScenario('not base64!')).toThrow('not valid base64');
        });

        it('rejects base64 that is not JSON', function () {
            const code = Buffer.from('hello world').toString('base64');

            expect(() => decodeScenario(code)).toThrow('valid JSON');
        });

        it('rejects oversized codes', function () {
            expect(() => decodeScenario('A'.repeat(100001))).toThrow('too large');
        });

        it('rejects unknown properties', function () {
            expect(() => decodeScenario(encode({ player1: { mana: 3 } }))).toThrow(
                'player1.mana is not a recognised property'
            );
            expect(() => decodeScenario(encode({ extra: true }))).toThrow(
                'extra is not a recognised property'
            );
        });

        it('rejects unsupported versions', function () {
            expect(() => decodeScenario(encode({ version: 2 }))).toThrow('Unsupported');
        });

        it('rejects bad field types and ranges', function () {
            expect(validateScenario({ player1: { amber: -1 } }).valid).toBe(false);
            expect(validateScenario({ player1: { houses: ['a', 'b', 'c', 'd'] } }).valid).toBe(
                false
            );
            expect(validateScenario({ player1: { hand: [3] } }).valid).toBe(false);
            expect(validateScenario({ player1: { hand: [{ card: 'troll' }] } }).valid).toBe(false);
            expect(validateScenario({ player1: { keys: { green: true } } }).valid).toBe(false);
            expect(
                validateScenario({ player1: { inPlay: [{ card: 'troll', damage: 'a' }] } }).valid
            ).toBe(false);
            expect(validateScenario({ title: 'x'.repeat(500) }).valid).toBe(false);
            expect(validateScenario([]).valid).toBe(false);
        });

        it('rejects actions that are not on the allow list', function () {
            const result = validateScenario({
                actions: [{ player: 1, action: 'constructor', args: [] }]
            });

            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('actions[0].action must be one of');
        });

        it('rejects malformed action steps', function () {
            expect(
                validateScenario({ actions: [{ player: 3, action: 'clickPrompt' }] }).valid
            ).toBe(false);
            expect(
                validateScenario({ actions: [{ player: 1, action: 'clickPrompt', args: [[]] }] })
                    .valid
            ).toBe(false);
        });

        it('refuses to encode an invalid scenario', function () {
            expect(() => encodeScenario({ player1: { amber: 'lots' } })).toThrow(
                'Invalid scenario'
            );
        });
    });
});
