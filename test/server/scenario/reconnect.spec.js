const Settings = require('../../../server/settings.js');
const logger = require('../../../server/log.js');
const PendingGame = require('../../../server/pendinggame.js');
const Lobby = require('../../../server/lobby.js');
const GameRouter = require('../../../server/gamerouter.js');
const GameServer = require('../../../server/gamenode/gameserver.js');
const { encodeScenario } = require('../../../server/scenario/payload.js');

const scenario = {
    title: 'Reconnect test',
    player1: { house: 'brobnar', amber: 2, inPlay: ['troll'] },
    goal: [{ type: 'amber', min: 5 }]
};

function makeUser(username = 'tester') {
    return Settings.getUserWithDefaultsSet({
        username,
        getDetails() {
            return { username, settings: this.settings, permissions: {}, blockList: [] };
        }
    });
}

function makeServer() {
    const server = {
        games: {},
        cardData: undefined,
        gameSocket: { send: vi.fn() },
        sendGameState: vi.fn(),
        gameWon: GameServer.prototype.gameWon
    };
    server.restartScenario = GameServer.prototype.restartScenario;

    return server;
}

describe('scenario games after reconnecting', function () {
    beforeEach(function () {
        vi.spyOn(logger, 'info').mockImplementation(() => {});
        vi.spyOn(logger, 'error').mockImplementation(() => {});

        const user = makeUser();
        const pendingGame = new PendingGame(user, { name: 'x', puzzle: true });
        pendingGame.newGame('socket-id', user, undefined, true);

        this.server = makeServer();
        GameServer.prototype.onStartScenario.call(
            this.server,
            pendingGame.getStartGameDetails(),
            scenario
        );
        this.game = this.server.games[pendingGame.id];
        this.firstSocket = { id: 'socket-1', send: vi.fn() };
        this.secondSocket = { id: 'socket-2', send: vi.fn() };
        this.game.getPlayerByName('tester').socket = this.firstSocket;
        this.game.jsonForUsers.tester = { stale: true };
        this.game.reconnect(this.secondSocket, 'tester');
    });

    it('restarts onto the reconnected socket and resets the diff baseline', function () {
        const oldPlayer = this.game.getPlayerByName('tester');

        GameServer.prototype.restartScenario.call(this.server, this.game);

        const newGame = this.server.games[this.game.id];
        const newPlayer = newGame.getPlayerByName('tester');
        expect(newGame).not.toBe(this.game);
        expect(newPlayer.socket).toBe(this.secondSocket);
        expect(newPlayer.id).toBe('socket-2');
        expect(oldPlayer.socket).toBeUndefined();
        expect(newGame.jsonForUsers.tester).toBeUndefined();
        expect(this.server.sendGameState).toHaveBeenCalledWith(newGame);
    });

    it('can be restarted repeatedly', function () {
        GameServer.prototype.restartScenario.call(this.server, this.game);
        const second = this.server.games[this.game.id];
        GameServer.prototype.restartScenario.call(this.server, second);

        const third = this.server.games[this.game.id];
        expect(third).not.toBe(second);
        expect(third.getPlayerByName('tester').socket).toBe(this.secondSocket);
        expect(third.getPlayerByName('tester').amber).toBe(2);
    });

    it('still shows the solved prompt when the goal is met', function () {
        const player = this.game.getPlayerByName('tester');
        player.amber = 5;
        this.game.checkGameState(true);
        this.game.continue();

        expect(this.game.winner).toBe(player);
        expect(player.socket).toBe(this.secondSocket);
        expect(player.currentPrompt().promptTitle).toBe('Puzzle Solved');
    });
});

describe('scenario games are hidden from the lobby', function () {
    it('never lists puzzle games, even for admins or anonymous users', function () {
        const owner = makeUser();
        const puzzle = new PendingGame(owner, { name: 'p', puzzle: true });
        const normal = new PendingGame(owner, { name: 'n' });
        const admin = { username: 'admin', permissions: { canManageGames: true } };

        expect(puzzle.isVisibleFor(owner)).toBe(false);
        expect(puzzle.isVisibleFor(admin)).toBe(false);
        expect(puzzle.isVisibleFor(undefined)).toBe(false);
        expect(normal.isVisibleFor(undefined)).toBe(true);
    });
});

describe('scenario launch from lobby to game node', function () {
    it('hands the scenario from the lobby, through the router, to a game that is ready to play', function () {
        vi.spyOn(logger, 'info').mockImplementation(() => {});
        vi.spyOn(logger, 'error').mockImplementation(() => {});

        const node = { identity: 'node1', numGames: 0 };
        const commands = [];
        const router = {
            getNextAvailableGameNode: () => node,
            sendCommand: (identity, command, arg) => commands.push({ identity, command, arg }),
            gameService: { create: vi.fn() }
        };
        router.startScenarioGame = GameRouter.prototype.startScenarioGame;
        const lobby = {
            games: {},
            findGameForUser: () => undefined,
            router,
            sendHandoff: vi.fn()
        };
        const socket = { id: 'socket-id', user: makeUser(), send: vi.fn(), joinChannel: vi.fn() };

        Lobby.prototype.onCreateScenarioGame.call(lobby, socket, encodeScenario(scenario));

        expect(socket.send).not.toHaveBeenCalled();
        expect(commands).toHaveLength(1);
        expect(commands[0]).toMatchObject({ identity: 'node1', command: 'STARTSCENARIO' });

        const server = makeServer();
        GameServer.prototype.onStartScenario.call(
            server,
            commands[0].arg.game,
            commands[0].arg.scenario
        );

        const game = Object.values(server.games)[0];
        expect(game.id).toBe(Object.keys(lobby.games)[0]);
        expect(game.activePlayer.name).toBe('tester');
        expect(game.activePlayer.amber).toBe(2);
        expect(server.gameSocket.send).not.toHaveBeenCalled();
        expect(router.gameService.create).not.toHaveBeenCalled();
    });
});
