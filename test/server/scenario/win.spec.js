const Settings = require('../../../server/settings.js');
const logger = require('../../../server/log.js');
const PendingGame = require('../../../server/pendinggame.js');
const GameServer = require('../../../server/gamenode/gameserver.js');

const scenario = {
    title: 'Win test',
    player1: { house: 'brobnar', amber: 6, keys: { red: true }, inPlay: ['troll'] }
};

describe('scenario win condition', function () {
    beforeEach(function () {
        vi.spyOn(logger, 'info').mockImplementation(() => {});
        vi.spyOn(logger, 'error').mockImplementation(() => {});

        const user = Settings.getUserWithDefaultsSet({
            username: 'tester',
            getDetails() {
                return {
                    username: 'tester',
                    settings: this.settings,
                    permissions: {},
                    blockList: []
                };
            }
        });
        const pendingGame = new PendingGame(user, { name: 'x', puzzle: true });
        pendingGame.newGame('socket-id', user, undefined, true);

        this.server = {
            games: {},
            cardData: undefined,
            gameSocket: { send: vi.fn() },
            sendGameState: vi.fn()
        };
        this.server.gameWon = GameServer.prototype.gameWon;
        GameServer.prototype.onStartScenario.call(
            this.server,
            pendingGame.getStartGameDetails(),
            scenario
        );
        this.game = this.server.games[pendingGame.id];
        this.player = this.game.getPlayerByName('tester');
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
        expect(this.server.gameSocket.send).not.toHaveBeenCalled();
    });

    it('can be dismissed with Continue Playing without opponent agreement', function () {
        this.player.keys.blue = true;
        this.game.checkGameState(true);
        this.game.continue();

        this.game.menuButton('tester', 'continue', this.player.currentPrompt().buttons[0].uuid);
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
