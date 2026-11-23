import { createAction } from '@reduxjs/toolkit';

export const connectRequested = createAction('socket/connectRequested');
export const sendMessage = createAction('socket/sendMessage', (message, ...args) => ({
    payload: { message, args }
}));
export const gameSendMessage = createAction('game/sendMessage', (message, ...args) => ({
    payload: { message, args }
}));
export const leaveGameRequested = createAction('game/leaveRequested');
