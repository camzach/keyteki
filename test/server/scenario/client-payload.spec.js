const { encodeScenario } = require('../../../server/scenario/payload.js');

describe('client scenario payload module', function () {
    beforeEach(async function () {
        this.client = await import('../../../client/scenario/payload.js');
        this.scenario = {
            title: 'Preview me',
            author: 'someone',
            description: 'Win.',
            player1: {
                house: 'brobnar',
                houses: ['brobnar', 'untamed', 'sanctum'],
                amber: 4,
                keys: { red: true },
                inPlay: ['keyfrog', { card: 'troll', tokens: { ward: 1 }, damage: 2 }],
                hand: ['anger'],
                deck: ['bumpsy']
            },
            player2: { inPlay: ['gub'] },
            actions: [{ player: 1, action: 'endTurn' }]
        };
    });

    it('decodes codes produced by the server encoder in both alphabets', function () {
        const expected = { version: 1, ...this.scenario };

        expect(this.client.decodeScenarioCode(encodeScenario(this.scenario))).toEqual(expected);
        expect(
            this.client.decodeScenarioCode(encodeScenario(this.scenario, { urlSafe: false }))
        ).toEqual(expected);
    });

    it('handles non-ASCII text and surrounding whitespace', function () {
        const code = encodeScenario({ ...this.scenario, title: 'Café ☕' });

        expect(this.client.decodeScenarioCode(`\n ${code} \n`).title).toBe('Café ☕');
    });

    it('rejects invalid codes with a readable message', function () {
        expect(() => this.client.decodeScenarioCode('')).toThrow('empty');
        expect(() => this.client.decodeScenarioCode('not base64!')).toThrow('not valid base64');
        expect(() => this.client.decodeScenarioCode(btoa('nope'))).toThrow('valid JSON');
        expect(() => this.client.decodeScenarioCode(btoa('[1]'))).toThrow('JSON object');
        expect(() => this.client.decodeScenarioCode(btoa('{"player1":{"hand":"x"}}'))).toThrow(
            'player1.hand must be a list'
        );
    });

    it('summarises the setup for the preview', function () {
        const summary = this.client.summarizeScenario(
            this.client.decodeScenarioCode(encodeScenario(this.scenario))
        );

        expect(summary).toMatchObject({
            title: 'Preview me',
            author: 'someone',
            description: 'Win.',
            actionCount: 1
        });
        expect(summary.player1).toMatchObject({
            house: 'brobnar',
            amber: 4,
            keys: ['red'],
            hand: ['anger'],
            deckCount: 1
        });
        expect(summary.player1.inPlay).toEqual([
            { card: 'keyfrog', details: [] },
            { card: 'troll', details: ['1 ward', '2 damage'] }
        ]);
        expect(summary.player2.inPlay).toEqual([{ card: 'gub', details: [] }]);
    });
});
