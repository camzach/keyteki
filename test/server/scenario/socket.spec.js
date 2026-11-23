const fs = require('node:fs');
const os = require('node:os');
/* global Promise, beforeAll, afterAll */
const path = require('path');
const { io: connect } = require('socket.io-client');

const logger = require('../../../server/log.js');
const { init } = require('../../../server/server.js');
const { exportSpec } = require('../../../server/scenario/export.js');

const EXAMPLE_SPEC_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'example-spec-'));
const EXAMPLE_SPEC = path.join(EXAMPLE_SPEC_DIR, 'Example.spec.js');

fs.writeFileSync(
    EXAMPLE_SPEC,
    [
        '// Puzzle: Example Puzzle',
        '// Objective: Forge a key this turn.',
        "describe('Example', function () {",
        '    beforeEach(function () {',
        "        this.setupTest({ player1: { house: 'brobnar', amber: 6, inPlay: ['troll'] } });",
        '    });',
        "    it('exports the board', function () {});",
        '});'
    ].join('\n')
);

afterAll(function () {
    fs.rmSync(EXAMPLE_SPEC_DIR, { recursive: true, force: true });
});

function once(socket, event) {
    return new Promise((resolve) => socket.once(event, resolve));
}

describe('puzzle server over real sockets', function () {
    const ctx = { clients: [] };

    beforeAll(async function () {
        vi.spyOn(logger, 'info').mockImplementation(() => {});
        vi.spyOn(logger, 'error').mockImplementation(() => {});

        ctx.server = await init({ isDeveloping: false });
        await new Promise((resolve) => ctx.server.httpServer.listen(0, '127.0.0.1', resolve));
        ctx.url = `http://127.0.0.1:${ctx.server.httpServer.address().port}`;
    });

    afterAll(async function () {
        ctx.clients.forEach((client) => client.close());
        ctx.server.io.close();
        clearInterval(ctx.server.puzzleServer.sweeper);
        await new Promise((resolve) => ctx.server.httpServer.close(resolve));
    });

    function client(token) {
        const socket = connect(ctx.url, { auth: { token }, forceNew: true, reconnection: false });
        ctx.clients.push(socket);

        return socket;
    }

    it('rejects a client without a valid token', async function () {
        const socket = client('short');
        const error = await once(socket, 'connect_error');

        expect(error.message).toBe('Invalid session token');
    });

    it('serves the card list the board needs', async function () {
        const response = await fetch(`${ctx.url}/api/cards`);
        const body = await response.json();

        expect(body.success).toBe(true);
        expect(body.cards.troll.name).toBe('Troll');
    });

    it('loads an exported spec into a playable game', async function () {
        const socket = client('integration-token-0123456789');
        const { user } = await once(socket, 'session');
        expect(user.username).toMatch(/^Guest-[0-9a-f]{6}$/);

        const stateReceived = once(socket, 'gamestate');
        socket.emit('createscenariogame', exportSpec(EXAMPLE_SPEC));
        const state = await stateReceived;

        expect(state.started).toBe(true);
        expect(state.winner).toBeUndefined();
        expect(state.players[user.username].cardPiles.cardsInPlay.length).toBeGreaterThan(0);
    });

    it('reconnects a returning token to its puzzle', async function () {
        const token = 'reconnect-token-0123456789';
        const first = client(token);
        await once(first, 'session');
        const created = once(first, 'gamestate');
        first.emit('createscenariogame', exportSpec(EXAMPLE_SPEC));
        await created;
        first.close();

        const second = client(token);
        const state = await once(second, 'gamestate');

        expect(state.started).toBe(true);
    });

    it('reports an invalid scenario code', async function () {
        const socket = client('bad-code-token-0123456789');
        await once(socket, 'session');

        socket.emit('createscenariogame', 'not a scenario');

        expect(await once(socket, 'gameerror')).toEqual(expect.any(String));
    });
});
