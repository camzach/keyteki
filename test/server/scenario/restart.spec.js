const logger = require('../../../server/log.js');
const { makePuzzleServer, startScenario } = require('../../helpers/puzzleserver.js');

const scenario = {
    title: 'Restart test',
    player1: { house: 'brobnar', amber: 2, inPlay: ['troll'], hand: ['anger'] }
};

describe('scenario /restart', function () {
    beforeEach(function () {
        vi.spyOn(logger, 'error').mockImplementation(() => {});

        this.server = makePuzzleServer();
        vi.spyOn(this.server, 'sendGameState').mockImplementation(() => {});

        ({
            game: this.game,
            player: this.player,
            socket: this.socket
        } = startScenario(this.server, scenario));
        this.name = this.player.name;
        this.player.socket = this.socket;
        this.player.lobbyId = 'lobby-1';
        this.game.jsonForUsers[this.name] = { baseline: true };
    });

    it('rebuilds the board with the same id and moves the socket across', function () {
        // Mutate the board so a reset is observable.
        this.player.amber = 5;
        this.player.cardsInPlay[0].tokens.damage = 3;

        this.server.restartScenario(this.game);

        const newGame = this.server.games[this.game.id];
        expect(newGame).not.toBe(this.game);
        expect(newGame.puzzle.title).toBe('Restart test');

        const newPlayer = newGame.getPlayerByName(this.name);
        expect(newPlayer.amber).toBe(2);
        expect(newPlayer.cardsInPlay[0].tokens.damage).toBeUndefined();
        expect(newPlayer.socket).toBe(this.socket);
        expect(newPlayer.lobbyId).toBe('lobby-1');
        expect(newGame.jsonForUsers[this.name]).toEqual({ baseline: true });
        expect(this.player.socket).toBeUndefined();
        expect(this.server.sendGameState).toHaveBeenCalledWith(newGame);
    });

    it('keeps the old game when the rebuild fails', function () {
        this.game.puzzleScenario = { player1: { hand: ['no-such-card'] } };

        this.server.restartScenario(this.game);

        expect(this.server.games[this.game.id]).toBe(this.game);
        expect(this.player.socket).toBe(this.socket);
        expect(this.server.sendGameState).not.toHaveBeenCalled();
    });

    it('is triggered by the /restart chat command without manual mode', function () {
        vi.spyOn(this.server, 'restartScenario').mockImplementation(() => {});
        expect(this.game.manualMode).toBeFalsy();

        this.game.chat(this.name, '/restart');

        expect(this.server.restartScenario).toHaveBeenCalledWith(this.game);
    });

    it('is not a command in games that are not puzzles', function () {
        vi.spyOn(this.server, 'restartScenario').mockImplementation(() => {});
        this.game.puzzle = undefined;

        this.game.chat(this.name, '/restart');

        expect(this.server.restartScenario).not.toHaveBeenCalled();
    });
});
