const logger = require('../../../server/log.js');
const { encodeScenario } = require('../../../server/scenario/payload.js');
const { makePuzzleServer, makeSocket, startScenario } = require('../../helpers/puzzleserver.js');

const scenario = {
    title: 'Server test',
    player1: { house: 'brobnar', inPlay: ['troll'], hand: ['anger'] }
};

describe('PuzzleServer', function () {
    beforeEach(function () {
        vi.spyOn(logger, 'error').mockImplementation(() => {});

        this.server = makePuzzleServer();
        this.socket = makeSocket();
        this.name = this.socket.user.username;
    });

    describe('onCreateScenarioGame', function () {
        it('starts a puzzle game for the user and connects them to it', function () {
            this.server.onCreateScenarioGame(this.socket, encodeScenario(scenario));

            const game = Object.values(this.server.games)[0];
            expect(game).toBeDefined();
            expect(game.puzzle.title).toBe('Server test');
            expect(game.name).toBe('Server test');
            expect(game.activePlayer.name).toBe(this.name);
            expect(game.activePlayer.cardsInPlay.map((card) => card.id)).toEqual(['troll']);
            expect(game.getPlayerByName(this.name).socket).toBe(this.socket);
            expect(this.socket.joinChannel).toHaveBeenCalledWith(game.id);
            expect(this.socket.send).toHaveBeenCalledWith('gamestate', expect.any(Object));
            expect(this.socket.send).not.toHaveBeenCalledWith('gameerror', expect.anything());
        });

        it('does not need an opponent, accounts or any other setup', function () {
            this.server.onCreateScenarioGame(this.socket, encodeScenario(scenario));

            const game = Object.values(this.server.games)[0];
            expect(Object.keys(game.getPlayers())).toHaveLength(2);
            expect(game.started).toBe(true);
        });

        it('reports an invalid code without creating a game', function () {
            this.server.onCreateScenarioGame(this.socket, '!!!');

            expect(this.socket.send).toHaveBeenCalledWith('gameerror', expect.any(String));
            expect(this.server.games).toEqual({});
        });

        it('reports a scenario that cannot be built without leaving a game behind', function () {
            const code = encodeScenario({ player1: { hand: ['no-such-card'] } });

            this.server.onCreateScenarioGame(this.socket, code);

            expect(this.socket.send).toHaveBeenCalledWith(
                'gameerror',
                expect.stringContaining('no-such-card')
            );
            expect(this.server.games).toEqual({});
        });

        it('replaces the previous puzzle of the same user', function () {
            this.server.onCreateScenarioGame(this.socket, encodeScenario(scenario));
            const first = Object.values(this.server.games)[0];

            this.server.onCreateScenarioGame(this.socket, encodeScenario(scenario));

            expect(this.server.games[first.id]).toBeUndefined();
            expect(Object.keys(this.server.games)).toHaveLength(1);
            expect(this.socket.send).toHaveBeenCalledWith('cleargamestate');
        });

        it('keeps puzzles of different users apart', function () {
            const other = makeSocket('other-token-0123456789');

            this.server.onCreateScenarioGame(this.socket, encodeScenario(scenario));
            this.server.onCreateScenarioGame(other, encodeScenario(scenario));

            expect(Object.keys(this.server.games)).toHaveLength(2);
            expect(this.server.findGameForUser(this.name)).not.toBe(
                this.server.findGameForUser(other.user.username)
            );
        });
    });

    describe('onGameMessage', function () {
        beforeEach(function () {
            this.server.onCreateScenarioGame(this.socket, encodeScenario(scenario));
            this.game = this.server.findGameForUser(this.name);
        });

        it('runs allowed game commands for the user and sends the new state', function () {
            vi.spyOn(this.game, 'chat');
            this.socket.send.mockClear();

            this.server.onGameMessage(this.socket, 'chat', 'hello');

            expect(this.game.chat).toHaveBeenCalledWith(this.name, 'hello');
            expect(this.socket.send).toHaveBeenCalledWith('gamestate', expect.any(Object));
        });

        it('ignores commands that are not on the allow list', function () {
            for (const command of ['getState', 'leave', 'constructor', 'toString', 'missing']) {
                const method = this.game[command];
                const spy = typeof method === 'function' ? vi.spyOn(this.game, command) : undefined;

                this.server.onGameMessage(this.socket, command);

                if (spy) {
                    expect(spy).not.toHaveBeenCalled();
                }
            }

            expect(this.server.games[this.game.id]).toBe(this.game);
        });

        it('does nothing for a user without a game', function () {
            const other = makeSocket('other-token-0123456789');

            this.server.onGameMessage(other, 'chat', 'hello');

            expect(other.send).not.toHaveBeenCalled();
        });

        it('closes the game when the user leaves', function () {
            this.server.onGameMessage(this.socket, 'leavegame');

            expect(this.server.games).toEqual({});
            expect(this.socket.send).toHaveBeenCalledWith('cleargamestate');
            expect(this.socket.leaveChannel).toHaveBeenCalledWith(this.game.id);
        });
    });

    describe('game lifecycle', function () {
        it('does not record results when a puzzle is won', function () {
            const { game, player } = startScenario(this.server, scenario);

            expect(() => this.server.gameWon(game, 'puzzle solved', player)).not.toThrow();
        });

        it('closes the game on rematch instead of starting another', function () {
            this.server.onCreateScenarioGame(this.socket, encodeScenario(scenario));
            const game = this.server.findGameForUser(this.name);

            this.server.rematch(game);

            expect(this.server.games).toEqual({});
            expect(this.socket.send).toHaveBeenCalledWith('cleargamestate');
        });

        it('sweeps games that nobody is connected to any more', function () {
            this.server.onCreateScenarioGame(this.socket, encodeScenario(scenario));
            const game = this.server.findGameForUser(this.name);
            vi.spyOn(game, 'isEmpty').mockReturnValue(true);

            this.server.clearStaleAndFinishedGames();

            expect(this.server.games).toEqual({});
        });

        it('keeps games that are still in use', function () {
            this.server.onCreateScenarioGame(this.socket, encodeScenario(scenario));

            this.server.clearStaleAndFinishedGames();

            expect(Object.keys(this.server.games)).toHaveLength(1);
        });

        it('sweeps games that were finished a long time ago', function () {
            this.server.onCreateScenarioGame(this.socket, encodeScenario(scenario));
            const game = this.server.findGameForUser(this.name);
            game.finishedAt = Date.now() - 60 * 60 * 1000;

            this.server.clearStaleAndFinishedGames();

            expect(this.server.games).toEqual({});
        });
    });

    describe('connection handling', function () {
        function ioSocket(token, id = 'io-1') {
            const handlers = {};

            return {
                id,
                handshake: { auth: { token } },
                request: {},
                handlers,
                on: (event, handler) => (handlers[event] = handler),
                emit: vi.fn(),
                join: vi.fn(),
                leave: vi.fn()
            };
        }

        it('rejects a handshake without a valid token', function () {
            const next = vi.fn();

            this.server.handshake(ioSocket('short'), next);
            this.server.handshake(ioSocket(undefined), next);

            expect(next).toHaveBeenCalledTimes(2);
            for (const [error] of next.mock.calls) {
                expect(error).toBeInstanceOf(Error);
            }
        });

        it('accepts a valid token and tells the client who it is', function () {
            const next = vi.fn();
            const socket = ioSocket('valid-token-0123456789');

            this.server.handshake(socket, next);
            this.server.onConnection(socket);

            expect(next).toHaveBeenCalledWith();
            expect(socket.emit).toHaveBeenCalledWith('session', {
                user: expect.objectContaining({ username: socket.request.user.username })
            });
        });

        it('puts a returning user straight back into their puzzle', function () {
            const first = ioSocket('valid-token-0123456789', 'io-1');
            this.server.handshake(first, () => {});
            this.server.onConnection(first);
            first.handlers.createscenariogame(encodeScenario(scenario));
            first.handlers.disconnect('transport close');

            const game = this.server.findGameForUser(first.request.user.username);
            expect(game.getPlayerByName(first.request.user.username).disconnectedAt).toBeDefined();

            const second = ioSocket('valid-token-0123456789', 'io-2');
            this.server.handshake(second, () => {});
            this.server.onConnection(second);

            const player = game.getPlayerByName(second.request.user.username);
            expect(player.disconnectedAt).toBeUndefined();
            expect(player.socket.id).toBe('io-2');
            expect(second.emit).toHaveBeenCalledWith('gamestate', expect.any(Object));
        });
    });
});
