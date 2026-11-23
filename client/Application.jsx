import React, { useEffect, useMemo, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { Constants } from './constants';
import ErrorBoundary from './Components/Site/ErrorBoundary';
import GameBoard from './Components/GameBoard/GameBoard.jsx';
import Header from './Components/Header';
import Scenario from './pages/Scenario';
import { useGetCardsQuery, useGetFactionsQuery } from './redux/api';
import { connectRequested } from './redux/socketActions';
import { lobbyActions } from './redux/slices/lobbySlice';

import Background from './assets/img/bgs/keyforge.png';
import BlankBg from './assets/img/bgs/blank.png';
import MassMutationBg from './assets/img/bgs/massmutation.png';

const Application = () => {
    const dispatch = useDispatch();
    const location = useLocation();
    const bgRef = useRef(null);

    const currentGame = useSelector((state) => state.lobby.currentGame);
    const user = useSelector((state) => state.account.user);

    const backgrounds = useMemo(() => {
        const values = { blank: BlankBg };

        for (let i = 0; i < Constants.Houses.length; ++i) {
            values[Constants.Houses[i]] = Constants.HouseBgPaths[Constants.Houses[i]];
        }

        values.massmutation = MassMutationBg;
        values.keyforge = Background;

        return values;
    }, []);

    useGetCardsQuery();
    useGetFactionsQuery();

    useEffect(() => {
        dispatch(connectRequested());

        const onFocusChange = (event) => {
            dispatch(
                event.type === 'blur' ? lobbyActions.windowBlur() : lobbyActions.windowFocus()
            );
        };

        window.addEventListener('focus', onFocusChange);
        window.addEventListener('blur', onFocusChange);

        return () => {
            window.removeEventListener('focus', onFocusChange);
            window.removeEventListener('blur', onFocusChange);
        };
    }, [dispatch]);

    const path = location?.pathname || '/';
    const gameBoardVisible = currentGame && currentGame.started && path === '/play';

    useEffect(() => {
        if (!bgRef.current) {
            return;
        }

        if (gameBoardVisible && user && user.settings) {
            const houseIndex = Constants.HousesNames.indexOf(user.settings.background);
            const background =
                houseIndex === -1 ? `${user.settings.background}` : Constants.Houses[houseIndex];

            bgRef.current.style.backgroundImage = `url('${backgrounds[background]}')`;
            return;
        }

        bgRef.current.style.backgroundImage = 'none';
    }, [backgrounds, gameBoardVisible, user]);

    return (
        <div className='bg' ref={bgRef}>
            <Header />
            <div className='wrapper'>
                <div className='mx-auto w-full pt-14 px-3 sm:px-4 lg:max-w-[92vw] lg:px-6 2xl:max-w-screen-2xl'>
                    <ErrorBoundary
                        errorPath={path}
                        message={"We're sorry - something's gone wrong."}
                    >
                        <Routes>
                            <Route path='/' element={<Scenario />} />
                            <Route
                                path='/play'
                                element={
                                    currentGame?.started ? (
                                        <GameBoard />
                                    ) : (
                                        <Navigate
                                            to={{ pathname: '/', search: location.search }}
                                            replace
                                        />
                                    )
                                }
                            />
                            <Route
                                path='*'
                                element={
                                    <Navigate
                                        to={{ pathname: '/', search: location.search }}
                                        replace
                                    />
                                }
                            />
                        </Routes>
                    </ErrorBoundary>
                </div>
            </div>
        </div>
    );
};

Application.displayName = 'Application';

export default Application;
