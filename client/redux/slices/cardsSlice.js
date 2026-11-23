import { createSlice } from '@reduxjs/toolkit';

import { api } from '../api';

const cardsSlice = createSlice({
    name: 'cards',
    initialState: { cards: {}, factions: {} },
    reducers: {},
    extraReducers: (builder) => {
        builder
            .addMatcher(api.endpoints.getCards.matchFulfilled, (state, action) => {
                state.cards = action.payload.cards;
            })
            .addMatcher(api.endpoints.getFactions.matchFulfilled, (state, action) => {
                const factions = {};
                for (const faction of action.payload.factions) {
                    factions[faction.value] = faction;
                }
                state.factions = factions;
            });
    }
});

export default cardsSlice.reducer;
