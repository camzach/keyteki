const { makePuzzleServer, startScenario } = require('../../helpers/puzzleserver.js');

const scenario = {
    title: 'Win test',
    player1: { house: 'brobnar', amber: 6, keys: { red: true }, inPlay: ['troll'] }
};

describe('scenario win condition', function () {
    beforeEach(function () {
        this.server = makePuzzleServer();
        ({ game: this.game, player: this.player } = startScenario(this.server, scenario));
    });

    it('is not won at the start, even with a key already forged', function () {
        expect(this.game.winner).toBeUndefined();
    });

    it('is won when the creator forges a key, showing a congratulations prompt', function () {
        this.player.keys.blue = true;
        this.game.checkGameState(true);
        this.game.continue();

        expect(this.game.winner).toBe(this.player);
        expect(this.game.winReason).toBe('puzzle solved');

        const prompt = this.player.currentPrompt();
        expect(prompt.promptTitle).toBe('Puzzle Solved');
        expect(prompt.menuTitle).toContain('Congrats!');
    });

    it('can be dismissed with Continue Playing without opponent agreement', function () {
        this.player.keys.blue = true;
        this.game.checkGameState(true);
        this.game.continue();

        this.game.menuButton(
            this.player.name,
            'continue',
            this.player.currentPrompt().buttons[0].uuid
        );
        this.game.continue();

        expect(this.player.currentPrompt().promptTitle).not.toBe('Puzzle Solved');
        expect(this.game.winner).toBe(this.player);
    });

    it('still uses the normal winner prompt in regular games', function () {
        this.game.puzzle = undefined;
        this.player.keys.blue = true;
        this.player.keys.yellow = true;
        this.game.checkGameState(true);
        this.game.continue();

        expect(this.player.currentPrompt().promptTitle).toBe('Game Won');
    });
});
