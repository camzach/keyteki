const logger = require('../../../server/log.js');
const { scenarioFromSetupOptions } = require('../../../server/scenario/export.js');

describe('scenario export', function () {
    beforeEach(function () {
        vi.spyOn(logger, 'info').mockImplementation(() => {});
    });

    describe('scenarioFromSetupOptions', function () {
        it('keeps only the fields a scenario understands', function () {
            const scenario = scenarioFromSetupOptions(
                {
                    phase: 'main',
                    player1: { name: 'bob', house: 'brobnar', amber: 2, inPlay: ['troll'] },
                    player2: { hand: ['gub'] }
                },
                { title: 'From options' }
            );

            expect(scenario).toEqual({
                version: 1,
                title: 'From options',
                player1: { house: 'brobnar', amber: 2, inPlay: ['troll'] },
                player2: { hand: ['gub'] }
            });
        });
    });
});
