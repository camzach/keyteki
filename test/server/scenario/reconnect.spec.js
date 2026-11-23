const logger = require('../../../server/log.js');
const { makePuzzleServer, startScenario } = require('../../helpers/puzzleserver.js');

const scenario = {
    title: 'Reconnect test',
    player1: { house: 'brobnar', amber: 2, inPlay: ['troll'] },
    goal: [{ type: 'amber', min: 5 }]
};

describe('scenario games after reconnecting', function () {
    beforeEach(function () {
        vi.spyOn(logger, 'error').mockImplementation(() => {});

        this.server = makePuzzleServer();
        vi.spyOn(this.server, 'sendGameState').mockImplementation(() => {});

        const { game, player, socket } = startScenario(this.server, scenario);
        this.game = game;
        this.name = player.name;
        this.firstSocket = socket;
        this.secondSocket = { id: 'socket-2', send: vi.fn() };
        player.socket = this.firstSocket;
        this.game.jsonForUsers[this.name] = { stale: true };
        this.game.reconnect(this.secondSocket, this.name);
    });

    it('restarts onto the reconnected socket and resets the diff baseline', function () {
        const oldPlayer = this.game.getPlayerByName(this.name);

        this.server.restartScenario(this.game);

        const newGame = this.server.games[this.game.id];
        const newPlayer = newGame.getPlayerByName(this.name);
        expect(newGame).not.toBe(this.game);
        expect(newPlayer.socket).toBe(this.secondSocket);
        expect(newPlayer.id).toBe('socket-2');
        expect(oldPlayer.socket).toBeUndefined();
        expect(newGame.jsonForUsers[this.name]).toBeUndefined();
        expect(this.server.sendGameState).toHaveBeenCalledWith(newGame);
    });

    it('can be restarted repeatedly', function () {
        this.server.restartScenario(this.game);
        const second = this.server.games[this.game.id];
        this.server.restartScenario(second);

        const third = this.server.games[this.game.id];
        expect(third).not.toBe(second);
        expect(third.getPlayerByName(this.name).socket).toBe(this.secondSocket);
        expect(third.getPlayerByName(this.name).amber).toBe(2);
    });

    it('still shows the solved prompt when the goal is met', function () {
        const player = this.game.getPlayerByName(this.name);
        player.amber = 5;
        this.game.checkGameState(true);
        this.game.continue();

        expect(this.game.winner).toBe(player);
        expect(player.socket).toBe(this.secondSocket);
        expect(player.currentPrompt().promptTitle).toBe('Puzzle Solved');
    });
});
