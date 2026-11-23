import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';

import rootReducer from './redux/reducers';
import { socketMiddleware } from './redux/middleware/socket-middleware';
import { api } from './redux/api';

export default function configureStoreRTK(initialState) {
    const store = configureStore({
        reducer: rootReducer,
        middleware: (getDefaultMiddleware) =>
            getDefaultMiddleware({
                serializableCheck: false,
                immutableCheck: false
            }).concat(socketMiddleware, api.middleware),
        preloadedState: initialState,
        devTools: !import.meta.env.PROD
    });
    setupListeners(store.dispatch);
    return store;
}
