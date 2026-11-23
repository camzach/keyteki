const { randomUUID } = require('node:crypto');

const jsondiffpatch = require('jsondiffpatch');

const logger = require('./log');
const Socket = require('./socket');
const { userFromToken } = require('./session');
const { decodeScenario } = require('./scenario/payload.js');
const { detectBinary } = require('./util');

// Finished puzzles are closed after this long, abandoned ones after the
// reconnect window used by Game#isEmpty.
const FINISHED_GAME_TIMEOUT = 20 * 60 * 1000;
const SWEEP_INTERVAL = 30 * 1000;

// The only game methods a client may invoke by name.
const GAME_COMMANDS = new Set([
    'cardClicked',
    'changeActiveHouse',
    'changeStat',
    'chat',
    'clickProphecy',
    'clickTide',
    'drop',
    'forcePass',
    'menuButton',
    'menuItemClick',
    'modifyKey',
    'shuffleDeck',
    'toggleManualMode',
    'toggleOptionSetting'
]);

/**
 * Hosts puzzle games on a socket.io server. Players are anonymous: the client
 * generates a random token which identifies the session.
 */
class PuzzleServer {
    /**
     * @param {import("socket.io").Server} io
     */
    constructor(io) {
        this.games = {};
        this.io = io;

        io.use(this.handshake.bind(this));
        io.on('connection', this.onConnection.bind(this));

        this.sweeper = setInterval(() => this.clearStaleAndFinishedGames(), SWEEP_INTERVAL);
        this.sweeper.unref();
    }

    /**
     * Builds a puzzle game from a scenario and registers it.
     */
    createScenarioGame(scenario, details) {
        // Loaded lazily: the builder pulls in the test helpers and card data.
        const { buildScenarioGame } = require('./scenario/builder.js');
        const game = buildScenarioGame(scenario, { router: this, details });

        game.on('onTimeExpired', () => {
            this.sendGameState(game);
        });
        this.games[game.id] = game;

        return game;
    }

    handshake(ioSocket, next) {
        const user = userFromToken(ioSocket.handshake.auth && ioSocket.handshake.auth.token);
        if (!user) {
            next(new Error('Invalid session token'));
            return;
        }

        ioSocket.request.user = user;
        next();
    }

    /**
     * @param {import("socket.io").Socket} ioSocket
     */
    onConnection(ioSocket) {
        const socket = new Socket(ioSocket, ioSocket.request.user);

        socket.send('session', { user: socket.user });
        socket.registerEvent('createscenariogame', this.onCreateScenarioGame.bind(this));
        socket.registerEvent('game', this.onGameMessage.bind(this));
        socket.on('disconnect', this.onSocketDisconnected.bind(this));

        const game = this.findGameForUser(socket.user.username);
        if (game) {
            this.attachSocket(game, socket);
        }
    }

    /**
     * Connects (or reconnects) a socket to the player it belongs to in a game.
     */
    attachSocket(game, socket) {
        const player = game.playersAndSpectators[socket.user.username];
        if (!player) {
            return;
        }

        player.lobbyId = player.id;
        player.id = socket.id;
        player.connectionSucceeded = true;

        if (player.disconnectedAt) {
            logger.info(`user '${socket.user.username}' reconnected to game`);
            game.reconnect(socket, player.name);
        }

        socket.joinChannel(game.id);

        player.socket = socket;
        game.jsonForUsers[player.name] = undefined;

        this.sendGameState(game);
    }

    /**
     * Starts a puzzle for the socket's user from a base64 scenario code.
     *
     * @param {Socket} socket
     * @param {string} code
     */
    onCreateScenarioGame(socket, code) {
        let scenario;
        try {
            scenario = decodeScenario(code);
        } catch (err) {
            socket.send('gameerror', err.message);
            return;
        }

        // A user only ever plays one puzzle at a time.
        const previous = this.findGameForUser(socket.user.username);
        if (previous) {
            this.closeGame(previous);
        }

        const details = {
            id: randomUUID(),
            name: scenario.title || 'Puzzle',
            allowSpectators: false,
            owner: socket.user,
            players: {
                [socket.user.username]: {
                    id: socket.id,
                    name: socket.user.username,
                    user: socket.user
                }
            }
        };

        let game;
        try {
            game = this.createScenarioGame(scenario, details);
        } catch (err) {
            logger.error(`Failed to start scenario game ${details.id}`, err);
            socket.send('gameerror', `Could not start scenario: ${err.message}`);
            return;
        }

        this.attachSocket(game, socket);
    }

    /**
     * Rebuilds a puzzle game from its original scenario (the `/restart` chat
     * command), keeping the game id and moving the connected sockets across.
     *
     * @param {import("./game/game")} oldGame
     */
    restartScenario(oldGame) {
        let newGame;
        try {
            newGame = this.createScenarioGame(oldGame.puzzleScenario, oldGame.puzzleDetails);
        } catch (err) {
            logger.error(`Failed to restart scenario game ${oldGame.id}`, err);
            oldGame.addAlert('danger', `Could not restart the scenario: ${err.message}`);
            return;
        }

        for (const oldPlayer of Object.values(oldGame.getPlayersAndSpectators())) {
            const newPlayer = newGame.playersAndSpectators[oldPlayer.name];
            if (!oldPlayer.socket || !newPlayer) {
                continue;
            }

            newPlayer.lobbyId = oldPlayer.lobbyId;
            newPlayer.id = oldPlayer.socket.id;
            newPlayer.connectionSucceeded = true;
            newPlayer.socket = oldPlayer.socket;
            // Keep the diff baseline so the client patches its current state.
            newGame.jsonForUsers[newPlayer.name] = oldGame.jsonForUsers[oldPlayer.name];

            // Stop the old game from sending state to the moved socket.
            oldPlayer.socket = undefined;
        }

        newGame.addAlert('warning', 'Scenario restarted');
        this.sendGameState(newGame);
    }

    /**
     * @param {string} username
     */
    findGameForUser(username) {
        return Object.values(this.games).find((game) => {
            const player = game.playersAndSpectators[username];

            return !!player && !player.left;
        });
    }

    /**
     * @param {import("./game/game")} game
     */
    sendGameState(game) {
        for (const player of Object.values(game.getPlayersAndSpectators())) {
            if (player.left || player.disconnectedAt || !player.socket) {
                continue;
            }

            const state = game.getState(player.name);
            let stateToSend = state;

            if (game.jsonForUsers[player.name]) {
                stateToSend = jsondiffpatch.diff(game.jsonForUsers[player.name], state);
            }

            player.socket.send('gamestate', stateToSend);

            game.jsonForUsers[player.name] = jsondiffpatch.clone(state);
        }
    }

    /**
     * @param {import("./game/game")} game
     * @param {Error} e
     */
    handleError(game, e) {
        if (game.errorHandling) {
            logger.error('Error during error handling, suppressing to avoid loop:', e);
            return;
        }

        game.errorHandling = true;

        try {
            logger.error(e);

            if (e.message.includes('Maximum call stack')) {
                try {
                    logger.error(JSON.stringify(detectBinary(game.getState())));
                } catch (diagnosticError) {
                    logger.error('Failed to collect diagnostic data:', diagnosticError);
                }
            }

            game.addMessage(
                'A Server error has occurred processing your game state, apologies. Your game may now be in an inconsistent state, or you may be able to continue. The error has been logged.'
            );
        } catch (messageError) {
            logger.error('Failed to add error message to game:', messageError);
        } finally {
            game.errorHandling = false;
        }
    }

    /**
     * @param {import("./game/game")} game
     * @param {() => void} func
     */
    runAndCatchErrors(game, func) {
        try {
            func();
        } catch (e) {
            this.handleError(game, e);

            try {
                this.sendGameState(game);
            } catch (sendError) {
                logger.error('Failed to send game state after error:', sendError);
            }
        }
    }

    /**
     * Puzzle results are never recorded.
     */
    gameWon() {}

    /**
     * A rematch makes no sense for a puzzle: close the game (use /restart).
     *
     * @param {import("./game/game")} game
     */
    rematch(game) {
        this.detachPlayers(game);
        delete this.games[game.id];
    }

    rematchWithNewDecks(game) {
        this.rematch(game);
    }

    detachPlayers(game) {
        for (const player of Object.values(game.getPlayersAndSpectators())) {
            if (player.left || player.disconnectedAt || !player.socket) {
                continue;
            }

            player.socket.send('cleargamestate');
            player.socket.leaveChannel(game.id);
            player.left = true;
        }
    }

    /**
     * @param {import("./game/game")} game
     */
    closeGame(game) {
        for (const player of Object.values(game.getPlayersAndSpectators())) {
            if (player.socket) {
                player.socket.send('cleargamestate');
                player.socket.leaveChannel(game.id);
                player.socket = undefined;
            }
        }

        delete this.games[game.id];
    }

    clearStaleAndFinishedGames() {
        for (const game of Object.values(this.games)) {
            const finished =
                game.finishedAt && Date.now() - game.finishedAt > FINISHED_GAME_TIMEOUT;

            if (finished || game.isEmpty()) {
                logger.info(`closed game ${game.id}`);
                this.closeGame(game);
            }
        }
    }

    onSocketDisconnected(socket, reason) {
        const game = this.findGameForUser(socket.user.username);
        if (!game) {
            return;
        }

        const player = game.playersAndSpectators[socket.user.username];
        if (player.id !== socket.id) {
            return;
        }

        logger.info(`user '${socket.user.username}' disconnected from a game: ${reason}`);
        game.disconnect(socket.user.username);
        this.sendGameState(game);
    }

    onLeaveGame(socket) {
        const game = this.findGameForUser(socket.user.username);
        if (!game) {
            return;
        }

        game.leave(socket.user.username);
        socket.send('cleargamestate');
        socket.leaveChannel(game.id);

        delete this.games[game.id];
    }

    onGameMessage(socket, command, ...args) {
        const game = this.findGameForUser(socket.user.username);
        if (!game) {
            return;
        }

        if (command === 'leavegame') {
            this.onLeaveGame(socket);
            return;
        }

        if (!GAME_COMMANDS.has(command) || !(game[command] instanceof Function)) {
            return;
        }

        this.runAndCatchErrors(game, () => {
            game.notePlayerEvent(socket.user.username);

            game[command](socket.user.username, ...args);

            game.continue();

            this.sendGameState(game);
        });
    }
}

module.exports = PuzzleServer;
