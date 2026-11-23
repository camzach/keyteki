const Settings = require('../../../server/settings.js');
const logger = require('../../../server/log.js');
const PendingGame = require('../../../server/pendinggame.js');
const Lobby = require('../../../server/lobby.js');
const GameServer = require('../../../server/gamenode/gameserver.js');
const GameRouter = require('../../../server/gamerouter.js');
const { encodeScenario } = require('../../../server/scenario/payload.js');

const scenario = {
    title: 'Server test',
    player1: { house: 'brobnar', inPlay: ['troll'], hand: ['anger'] }
};

function makeUser(username = 'tester') {
    const user = Settings.getUserWithDefaultsSet({
        username,
        getDetails() {
            return { username, settings: this.settings, permissions: {}, blockList: [] };
        }
    });

    return user;
}

describe('scenario game creation', function () {
    beforeEach(function () {
        vi.spyOn(logger, 'info').mockImplementation(() => {});
        vi.spyOn(logger, 'error').mockImplementation(() => {});
    });

    describe('Lobby.onCreateScenarioGame', function () {
        beforeEach(function () {
            this.node = { identity: 'node1' };
            this.lobby = {
                games: {},
                findGameForUser: vi.fn().mockReturnValue(undefined),
                router: { startScenarioGame: vi.fn().mockReturnValue(this.node) },
                sendHandoff: vi.fn()
            };
            this.socket = {
                id: 'socket-id',
                user: makeUser(),
                send: vi.fn(),
                joinChannel: vi.fn()
            };
        });

        it('starts a private puzzle game and hands the creator off to the node', function () {
            const code = encodeScenario(scenario);

            Lobby.prototype.onCreateScenarioGame.call(this.lobby, this.socket, code);

            const [game, sentScenario] = this.lobby.router.startScenarioGame.mock.calls[0];
            expect(game).toBeInstanceOf(PendingGame);
            expect(game.puzzle).toBe(true);
            expect(game.name).toBe('Server test');
            expect(game.isVisibleFor(this.socket.user)).toBe(false);
            expect(game.started).toBe(true);
            expect(game.node).toBe(this.node);
            expect(sentScenario.title).toBe('Server test');
            expect(this.lobby.games[game.id]).toBe(game);
            expect(this.lobby.sendHandoff).toHaveBeenCalledWith(this.socket, this.node, game.id);
        });

        it('reports an invalid code without creating a game', function () {
            Lobby.prototype.onCreateScenarioGame.call(this.lobby, this.socket, '!!!');

            expect(this.socket.send).toHaveBeenCalledWith('gameerror', expect.any(String));
            expect(this.lobby.router.startScenarioGame).not.toHaveBeenCalled();
            expect(this.lobby.games).toEqual({});
        });

        it('refuses when the user is already in a game', function () {
            this.lobby.findGameForUser.mockReturnValue({});

            Lobby.prototype.onCreateScenarioGame.call(
                this.lobby,
                this.socket,
                encodeScenario(scenario)
            );

            expect(this.socket.send).toHaveBeenCalledWith('gameerror', expect.any(String));
            expect(this.lobby.router.startScenarioGame).not.toHaveBeenCalled();
        });

        it('reports when no game node is available', function () {
            this.lobby.router.startScenarioGame.mockReturnValue(undefined);

            Lobby.prototype.onCreateScenarioGame.call(
                this.lobby,
                this.socket,
                encodeScenario(scenario)
            );

            expect(this.socket.send).toHaveBeenCalledWith(
                'gameerror',
                'No game nodes available. Try again later.'
            );
            expect(this.lobby.games).toEqual({});
            expect(this.lobby.sendHandoff).not.toHaveBeenCalled();
        });
    });

    describe('Lobby.onScenarioFailed', function () {
        it('drops the game and tells the creator', function () {
            const owner = makeUser();
            const socket = { send: vi.fn(), leaveChannel: vi.fn() };
            const game = new PendingGame(owner, { name: 'x', puzzle: true });
            const lobby = { games: { [game.id]: game }, socketsByName: { tester: socket } };

            Lobby.prototype.onScenarioFailed.call(lobby, game.id, 'boom');

            expect(lobby.games).toEqual({});
            expect(socket.send).toHaveBeenCalledWith('gameerror', 'Could not start scenario: boom');
        });
    });

    describe('GameRouter.startScenarioGame', function () {
        it('sends the game details and scenario to a node without touching the database', function () {
            const node = { identity: 'node1', numGames: 0 };
            const router = {
                getNextAvailableGameNode: () => node,
                sendCommand: vi.fn(),
                gameService: { create: vi.fn() }
            };
            const game = { getStartGameDetails: () => ({ id: 'g1' }) };

            const result = GameRouter.prototype.startScenarioGame.call(router, game, scenario);

            expect(result).toBe(node);
            expect(node.numGames).toBe(1);
            expect(router.sendCommand).toHaveBeenCalledWith('node1', 'STARTSCENARIO', {
                game: { id: 'g1' },
                scenario
            });
            expect(router.gameService.create).not.toHaveBeenCalled();
        });

        it('returns undefined when there is no node', function () {
            const router = { getNextAvailableGameNode: () => undefined, sendCommand: vi.fn() };

            expect(GameRouter.prototype.startScenarioGame.call(router, {}, scenario)).toBe(
                undefined
            );
            expect(router.sendCommand).not.toHaveBeenCalled();
        });
    });

    describe('GameServer', function () {
        beforeEach(function () {
            this.user = makeUser();
            this.pendingGame = new PendingGame(this.user, { name: 'x', puzzle: true });
            this.pendingGame.newGame('socket-id', this.user, undefined, true);
            this.details = this.pendingGame.getStartGameDetails();
            this.server = {
                games: {},
                cardData: undefined,
                gameSocket: { send: vi.fn() },
                sendGameState: vi.fn()
            };
        });

        it('onStartScenario builds a puzzle game from the scenario and registers it', function () {
            GameServer.prototype.onStartScenario.call(this.server, this.details, scenario);

            const game = this.server.games[this.pendingGame.id];
            expect(game).toBeDefined();
            expect(game.puzzle.title).toBe('Server test');
            expect(game.activePlayer.name).toBe('tester');
            expect(game.activePlayer.cardsInPlay.map((card) => card.id)).toEqual(['troll']);
            expect(this.server.gameSocket.send).not.toHaveBeenCalled();
        });

        it('onStartScenario reports failures back to the lobby', function () {
            GameServer.prototype.onStartScenario.call(this.server, this.details, {
                player1: { hand: ['no-such-card'] }
            });

            expect(this.server.games).toEqual({});
            expect(this.server.gameSocket.send).toHaveBeenCalledWith('SCENARIOFAILED', {
                gameId: this.pendingGame.id,
                error: expect.stringContaining('no-such-card')
            });
        });

        it('does not record puzzle games when they are won', function () {
            GameServer.prototype.gameWon.call(this.server, { puzzle: {} }, 'reason', {
                name: 'tester'
            });

            expect(this.server.gameSocket.send).not.toHaveBeenCalled();
        });

        it('closes puzzle games on rematch instead of recording a rematch', function () {
            const game = {
                id: 'g1',
                puzzle: {},
                getPlayersAndSpectators: () => ({})
            };
            this.server.games.g1 = game;

            GameServer.prototype.rematch.call(this.server, game);

            expect(this.server.games).toEqual({});
            expect(this.server.gameSocket.send).toHaveBeenCalledTimes(1);
            expect(this.server.gameSocket.send).toHaveBeenCalledWith('GAMECLOSED', { game: 'g1' });
        });
    });
});
