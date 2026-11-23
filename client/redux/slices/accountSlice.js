import { createSlice } from '@reduxjs/toolkit';

const accountSlice = createSlice({
    name: 'account',
    initialState: {},
    reducers: {
        setUser: (state, action) => {
            state.user = action.payload;
        }
    }
});

export const accountActions = accountSlice.actions;
export default accountSlice.reducer;
