const logger = require('./log');
const EventEmitter = require('events');

class Socket extends EventEmitter {
    constructor(socket, user) {
        super();

        this.socket = socket;
        this.user = user;

        socket.on('error', this.onError.bind(this));
        socket.on('disconnect', this.onDisconnect.bind(this));
    }

    get id() {
        return this.socket.id;
    }

    registerEvent(event, callback) {
        this.socket.on(event, this.onSocketEvent.bind(this, callback));
    }

    joinChannel(channelName) {
        this.socket.join(channelName);
    }

    leaveChannel(channelName) {
        this.socket.leave(channelName);
    }

    send(message, ...args) {
        this.socket.emit(message, ...args);
    }

    disconnect() {
        this.socket.disconnect();
    }

    onSocketEvent(callback, ...args) {
        try {
            callback(this, ...args);
        } catch (err) {
            logger.error(err);
        }
    }

    onDisconnect(reason) {
        this.emit('disconnect', this, reason);
    }

    onError(err) {
        logger.info(`Socket.IO error: ${err}. Socket ID ${this.socket.id}`);
    }
}

module.exports = Socket;
