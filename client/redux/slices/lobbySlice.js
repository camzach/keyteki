import * as jsondiffpatch from 'jsondiffpatch';
import { createSlice } from '@reduxjs/toolkit';

const lobbySlice = createSlice({
    name: 'lobby',
    initialState: { windowBlurred: false },
    reducers: {
        connecting: (state) => {
            state.connecting = true;
            state.connected = false;
        },
        connected: (state) => {
            state.connecting = false;
            state.connected = true;
        },
        disconnected: (state) => {
            state.connecting = false;
            state.connected = false;
            state.rootState = undefined;
        },
        gameStateReceived: (state, action) => {
            state.currentGame = jsondiffpatch.clone(action.payload);
        },
        gameError: (state, action) => {
            state.gameError = action.payload;
        },
        clearGameError: (state) => {
            state.gameError = undefined;
        },
        clearGameState: (state) => {
            state.currentGame = undefined;
            state.rootState = undefined;
        },
        windowBlur: (state) => {
            state.windowBlurred = true;
        },
        windowFocus: (state) => {
            state.windowBlurred = false;
        },
        responseTimeReceived: (state, action) => {
            state.responseTime = action.payload;
        },
        setRootState: (state, action) => {
            state.rootState = action.payload;
        }
    }
});

export const lobbyActions = lobbySlice.actions;
export default lobbySlice.reducer;
