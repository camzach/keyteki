/* global Promise, beforeAll, afterAll */
const logger = require('../../../server/log.js');
const { init } = require('../../../server/server.js');
const { ALLOWED_ACTIONS } = require('../../../server/scenario/payload.js');

describe('scenario JSON schema', function () {
    const ctx = {};

    beforeAll(async function () {
        vi.spyOn(logger, 'info').mockImplementation(() => {});
        vi.spyOn(logger, 'error').mockImplementation(() => {});

        ctx.server = await init({ isDeveloping: false });
        await new Promise((resolve) => ctx.server.httpServer.listen(0, '127.0.0.1', resolve));
        ctx.url = `http://127.0.0.1:${ctx.server.httpServer.address().port}`;
    });

    afterAll(async function () {
        ctx.server.io.close();
        clearInterval(ctx.server.puzzleServer.sweeper);
        await new Promise((resolve) => ctx.server.httpServer.close(resolve));
    });

    it('is served as JSON schema with open CORS', async function () {
        const response = await fetch(`${ctx.url}/scenario.schema.json`);

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toContain('application/schema+json');
        expect(response.headers.get('access-control-allow-origin')).toBe('*');

        const schema = await response.json();
        expect(schema.$schema).toBeTruthy();
        expect(schema.type).toBe('object');
        expect(JSON.stringify(schema)).toContain(JSON.stringify(ALLOWED_ACTIONS));
    });
});
