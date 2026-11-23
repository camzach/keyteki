const Settings = require('../../../server/settings.js');
const logger = require('../../../server/log.js');
const PendingGame = require('../../../server/pendinggame.js');
const GameServer = require('../../../server/gamenode/gameserver.js');

const scenario = {
    title: 'Restart test',
    player1: { house: 'brobnar', amber: 2, inPlay: ['troll'], hand: ['anger'] }
};

function makeUser(username = 'tester') {
    return Settings.getUserWithDefaultsSet({
        username,
        getDetails() {
            return { username, settings: this.settings, permissions: {}, blockList: [] };
        }
    });
}

describe('scenario /restart', function () {
    beforeEach(function () {
        vi.spyOn(logger, 'info').mockImplementation(() => {});
        vi.spyOn(logger, 'error').mockImplementation(() => {});

        const user = makeUser();
        const pendingGame = new PendingGame(user, { name: 'x', puzzle: true });
        pendingGame.newGame('socket-id', user, undefined, true);

        this.server = {
            games: {},
            cardData: undefined,
            gameSocket: { send: vi.fn() },
            sendGameState: vi.fn()
        };
        this.server.restartScenario = GameServer.prototype.restartScenario;

        GameServer.prototype.onStartScenario.call(
            this.server,
            pendingGame.getStartGameDetails(),
            scenario
        );
        this.game = this.server.games[pendingGame.id];
        this.socket = { id: 'socket-id', send: vi.fn() };
        this.player = this.game.getPlayerByName('tester');
        this.player.socket = this.socket;
        this.player.lobbyId = 'lobby-1';
        this.game.jsonForUsers.tester = { baseline: true };
    });

    it('rebuilds the board with the same id and moves the socket across', function () {
        // Mutate the board so a reset is observable.
        this.player.amber = 5;
        this.player.cardsInPlay[0].tokens.damage = 3;

        GameServer.prototype.restartScenario.call(this.server, this.game);

        const newGame = this.server.games[this.game.id];
        expect(newGame).not.toBe(this.game);
        expect(newGame.puzzle.title).toBe('Restart test');

        const newPlayer = newGame.getPlayerByName('tester');
        expect(newPlayer.amber).toBe(2);
        expect(newPlayer.cardsInPlay[0].tokens.damage).toBeUndefined();
        expect(newPlayer.socket).toBe(this.socket);
        expect(newPlayer.lobbyId).toBe('lobby-1');
        expect(newGame.jsonForUsers.tester).toEqual({ baseline: true });
        expect(this.player.socket).toBeUndefined();
        expect(this.server.sendGameState).toHaveBeenCalledWith(newGame);
    });

    it('keeps the old game when the rebuild fails', function () {
        this.game.puzzleScenario = { player1: { hand: ['no-such-card'] } };

        GameServer.prototype.restartScenario.call(this.server, this.game);

        expect(this.server.games[this.game.id]).toBe(this.game);
        expect(this.player.socket).toBe(this.socket);
        expect(this.server.sendGameState).not.toHaveBeenCalled();
    });

    it('is triggered by the /restart chat command without manual mode', function () {
        this.server.restartScenario = vi.fn();
        this.game.router = this.server;
        expect(this.game.manualMode).toBeFalsy();

        this.game.chat('tester', '/restart');

        expect(this.server.restartScenario).toHaveBeenCalledWith(this.game);
    });

    it('is not a command in games that are not puzzles', function () {
        this.server.restartScenario = vi.fn();
        this.game.router = this.server;
        this.game.puzzle = undefined;

        this.game.chat('tester', '/restart');

        expect(this.server.restartScenario).not.toHaveBeenCalled();
    });
});
