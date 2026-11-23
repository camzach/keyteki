import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

export const api = createApi({
    reducerPath: 'rtkApi',
    baseQuery: fetchBaseQuery({
        baseUrl: '/api',
        validateStatus: (response, result) => response.status === 200 && result?.success !== false
    }),
    endpoints: (builder) => ({
        getCards: builder.query({
            query: () => '/cards'
        }),
        getFactions: builder.query({
            query: () => '/factions'
        })
    })
});

export const { useGetCardsQuery, useGetFactionsQuery } = api;
