const { init, listen } = require('./server');

async function runServer() {
    const server = await init({ isDeveloping: process.env.NODE_ENV !== 'production' });

    await listen(server.httpServer, process.env.PORT || 4000);

    return server;
}

module.exports = runServer;
