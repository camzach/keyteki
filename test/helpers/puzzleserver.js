const logger = require('../../server/log.js');
const PuzzleServer = require('../../server/puzzleserver.js');
const { userFromToken } = require('../../server/session.js');

const DEFAULT_TOKEN = 'tester-token-0123456789';

/**
 * A PuzzleServer that is not attached to a real socket.io server.
 */
function makePuzzleServer() {
    vi.spyOn(logger, 'info').mockImplementation(() => {});

    const server = new PuzzleServer({ use() {}, on() {} });
    clearInterval(server.sweeper);

    return server;
}

/**
 * A stand-in for the Socket wrapper, belonging to the user of `token`.
 */
function makeSocket(token = DEFAULT_TOKEN, id = `socket-${token}`) {
    return {
        id,
        user: userFromToken(token),
        send: vi.fn(),
        joinChannel: vi.fn(),
        leaveChannel: vi.fn()
    };
}

/**
 * Details for starting a game owned by `socket`'s user.
 */
function makeDetails(socket, id = 'game-1') {
    const { username } = socket.user;

    return {
        id,
        name: 'Puzzle',
        allowSpectators: false,
        owner: socket.user,
        players: { [username]: { id: socket.id, name: username, user: socket.user } }
    };
}

/**
 * Starts a scenario for a fresh socket and returns everything needed to poke at it.
 */
function startScenario(server, scenario, token) {
    const socket = makeSocket(token);
    const game = server.createScenarioGame(scenario, makeDetails(socket));
    const player = game.getPlayerByName(socket.user.username);

    return { socket, game, player };
}

module.exports = { makePuzzleServer, makeSocket, makeDetails, startScenario };
