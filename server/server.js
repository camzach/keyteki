const fs = require('fs');
const http = require('http');
const path = require('path');

const express = require('express');
const { Server: SocketServer } = require('socket.io');

const logger = require('./log.js');
const Constants = require('./constants');
const PuzzleServer = require('./puzzleserver.js');
const { scenarioSchema } = require('./scenario/schema.js');

const ROOT = path.join(__dirname, '..');

/**
 * The client needs the card list (names, houses, ...) keyed by card id.
 */
function loadCards() {
    const { cardsByCode } = require('./scenario/runner.js');

    return cardsByCode;
}

async function init({ isDeveloping }) {
    const app = express();
    const httpServer = http.createServer(app);

    app.disable('x-powered-by');

    const io = new SocketServer(httpServer, { perMessageDeflate: false, pingTimeout: 15000 });
    const puzzleServer = new PuzzleServer(io);

    let cardsResponse;
    app.get('/api/cards', (req, res) => {
        cardsResponse = cardsResponse || { success: true, cards: loadCards() };
        res.send(cardsResponse);
    });

    app.get('/api/factions', (req, res) => {
        const factions = Constants.Houses.map((house, i) => {
            return { name: Constants.HousesNames[i], value: house };
        });
        res.send({ success: true, factions });
    });

    app.get('/scenario.schema.json', (req, res) => {
        res.set('Access-Control-Allow-Origin', '*');
        res.type('application/schema+json').send(scenarioSchema);
    });

    app.use(express.static(path.join(ROOT, 'public')));

    if (isDeveloping) {
        const { createViteMiddleware } = await import('./vite-dev.mjs');
        const { vite, templatePath } = await createViteMiddleware({ root: ROOT });

        app.use(vite.middlewares);

        app.get('*', async (req, res, next) => {
            try {
                const template = fs.readFileSync(templatePath, 'utf-8');
                const html = await vite.transformIndexHtml(req.originalUrl, template);
                res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
            } catch (err) {
                vite.ssrFixStacktrace(err);
                next(err);
            }
        });
    } else {
        app.use(express.static(path.join(ROOT, 'dist')));
        app.get('*', (req, res) => {
            res.sendFile(path.join(ROOT, 'dist', 'index.html'));
        });
    }

    app.use((err, req, res, next) => {
        logger.error(err);

        if (res.headersSent) {
            next(err);
            return;
        }

        res.status(500).send({ success: false });
    });

    return { app, httpServer, io, puzzleServer };
}

function listen(httpServer, port) {
    return new Promise((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(port, '0.0.0.0', () => {
            logger.info(`Listening on port ${port}. Open http://localhost:${port}/`);
            resolve();
        });
    });
}

module.exports = { init, listen };
