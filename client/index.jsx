import 'core-js/stable';
import 'regenerator-runtime/runtime';
import './styles/tailwind.css';

import React from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { Toast } from '@heroui/react';
import configureStore from './configureStore.rtk';
import { DndProvider } from 'react-dnd';
import { TouchBackend } from 'react-dnd-touch-backend';

import Application from './Application';
import ErrorBoundary from './Components/Site/ErrorBoundary';

import './i18n';

const isProd = import.meta.env.PROD;
let ApplicationComponent = Application;
let root;
let store;

const THEME_STORAGE_KEY = 'puzzle-theme';

const applyTheme = (theme) => {
    const resolvedTheme = theme === 'light' ? 'light' : 'dark';
    document.documentElement.classList.remove('light');
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add(resolvedTheme);
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    window.localStorage.setItem(THEME_STORAGE_KEY, resolvedTheme);
};

const initializeTheme = () => {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);

    if (storedTheme === 'light' || storedTheme === 'dark') {
        applyTheme(storedTheme);
        return;
    }

    const prefersDark =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(prefersDark ? 'dark' : 'light');
};

const registerThemeHelpers = () => {
    window.setAppTheme = (theme) => applyTheme(theme);
    window.toggleAppTheme = () => {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
        applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
    };
};

const render = async () => {
    initializeTheme();
    registerThemeHelpers();
    if (!store) {
        store = configureStore();
    }
    const App = ApplicationComponent;
    if (!root) {
        const container = document.getElementById('component');
        root = createRoot(container);
    }

    const content = isProd ? (
        <ErrorBoundary
            message={
                "We're sorry, a critical error has occured in the client and we're unable to show you anything. Please try refreshing your browser."
            }
        >
            <App />
        </ErrorBoundary>
    ) : (
        <App />
    );

    root.render(
        <Provider store={store}>
            <BrowserRouter>
                <DndProvider backend={TouchBackend} options={{ enableMouseEvents: true }}>
                    <div className='body'>
                        <Toast.Provider placement='top end' />
                        {content}
                    </div>
                </DndProvider>
            </BrowserRouter>
        </Provider>
    );
};

if (!isProd && import.meta.hot) {
    import.meta.hot.accept('./Application', (mod) => {
        ApplicationComponent = mod.default;
        setTimeout(render);
    });
}

render();
