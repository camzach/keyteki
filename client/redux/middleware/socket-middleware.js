import { io } from 'socket.io-client';
import * as jsondiffpatch from 'jsondiffpatch';

import { accountActions } from '../slices/accountSlice';
import { lobbyActions } from '../slices/lobbySlice';
import {
    connectRequested,
    gameSendMessage,
    leaveGameRequested,
    sendMessage
} from '../socketActions';
import { getSessionToken } from '../../session';

let socket;
const patcher = jsondiffpatch.create({
    objectHash: (obj, index) => {
        return obj.uuid || obj.name || obj.id || obj._id || '$$index:' + index;
    }
});

export const socketMiddleware = (store) => (next) => (action) => {
    const result = next(action);

    if (connectRequested.match(action)) {
        if (socket) {
            return result;
        }

        socket = io(window.location.origin, {
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: Infinity,
            auth: { token: getSessionToken() }
        });

        store.dispatch(lobbyActions.connecting());

        socket.on('pong', (responseTime) => {
            store.dispatch(lobbyActions.responseTimeReceived(responseTime));
        });

        socket.on('connect', () => {
            store.dispatch(lobbyActions.connected());
        });

        socket.on('disconnect', () => {
            store.dispatch(lobbyActions.disconnected());
        });

        socket.on('session', ({ user }) => {
            store.dispatch(accountActions.setUser(user));
        });

        socket.on('gameerror', (error) => {
            store.dispatch(lobbyActions.gameError(error));
        });

        socket.on('gamestate', (diff) => {
            const { rootState } = store.getState().lobby;
            const gameState = rootState
                ? patcher.patch(jsondiffpatch.clone(rootState), diff)
                : diff;

            store.dispatch(lobbyActions.setRootState(gameState));
            store.dispatch(lobbyActions.gameStateReceived(gameState));
        });

        socket.on('cleargamestate', () => {
            store.dispatch(lobbyActions.clearGameState());
        });
    }

    if (sendMessage.match(action) && socket) {
        const { message, args } = action.payload;
        socket.emit(message, ...args);
    }

    if (gameSendMessage.match(action) && socket) {
        const { message, args } = action.payload;
        socket.emit('game', message, ...args);
    }

    if (leaveGameRequested.match(action)) {
        if (socket) {
            socket.emit('game', 'leavegame');
        }
        store.dispatch(lobbyActions.clearGameState());
    }

    return result;
};
