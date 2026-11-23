import { combineReducers } from 'redux';
import account from '../slices/accountSlice';
import cards from '../slices/cardsSlice';
import lobby from '../slices/lobbySlice';
import { api as rtkApi } from '../api';

const rootReducer = combineReducers({
    account,
    cards,
    lobby,
    [rtkApi.reducerPath]: rtkApi.reducer
});

export default rootReducer;
