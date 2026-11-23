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

    describe('codeFromSearch', function () {
        beforeEach(function () {
            // '>>>' encodes to 'Pj4+', so the standard alphabet contains a '+'.
            this.code = encodeScenario({ title: '>>>>>>>>>>>>', player1: {} }, { urlSafe: false });
            expect(this.code).toContain('+');
        });

        it('reads the code from the query string', function () {
            const urlSafe = encodeScenario({ title: 'Linked' }, { urlSafe: true });

            expect(this.client.codeFromSearch(`?code=${urlSafe}`)).toBe(urlSafe);
        });

        it('keeps a literal + that the query parser turned into a space', function () {
            expect(this.client.codeFromSearch(`?code=${this.code}`)).toBe(this.code);
        });

        it('reads a percent-encoded code', function () {
            const search = `?code=${encodeURIComponent(this.code)}&other=1`;

            expect(this.client.codeFromSearch(search)).toBe(this.code);
        });

        it('decodes what it reads', function () {
            const code = this.client.codeFromSearch(`?code=${this.code}`);

            expect(this.client.decodeScenarioCode(code).title).toBe('>>>>>>>>>>>>');
        });

        it('returns an empty string when there is no code', function () {
            expect(this.client.codeFromSearch('')).toBe('');
            expect(this.client.codeFromSearch('?other=1')).toBe('');
        });
    });

    describe('codeFromInput', function () {
        it('returns a plain code unchanged', function () {
            expect(this.client.codeFromInput('  abc_-123 ')).toBe('abc_-123');
        });

        it('extracts the code from a pasted puzzle link', function () {
            expect(this.client.codeFromInput('https://example.fly.dev/play?code=abc_-123')).toBe(
                'abc_-123'
            );
            expect(this.client.codeFromInput('https://example.fly.dev/?x=1&code=abc#top')).toBe(
                'abc'
            );
        });
    });
});
