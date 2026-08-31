import type { QueryKey, UseMutationOptions, UseMutationResult, UseQueryOptions, UseQueryResult } from '@tanstack/react-query';
import type { Alert, AnalyticsReport, AppSettings, AppSettingsUpdate, AuthUser, BatchClaimInput, BatchClaimResult, CheckinFlat, CheckoutFlat, CleaningHistoryEntry, CleaningRequest, CleaningRequestInput, CleaningStatusUpdate, DashboardSummary, ErrorResponse, Flat, FlatUpdate, GetAnalyticsReportParams, GetDashboardSummaryParams, HealthStatus, ListCheckinsParams, ListCheckoutsParams, ListCleaningHistoryParams, ListCleaningRequestsParams, ListObservationsParams, ListPendingPeriodicTasksParams, LoginInput, MarkVacantBody, Observation, ObservationInput, ObservationResolveInput, PendingPeriodicTask, PeriodicTask, PeriodicTaskExecution, PeriodicTaskExecutionInput, PeriodicTaskInput, PeriodicTaskUpdate, SuccessResponse, SyncResult } from './api.schemas';
import { customFetch } from '../custom-fetch';
import type { ErrorType, BodyType } from '../custom-fetch';
type AwaitedInput<T> = PromiseLike<T> | T;
type Awaited<O> = O extends AwaitedInput<infer T> ? T : never;
type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];
export declare const getHealthCheckUrl: () => string;
/**
 * @summary Health check
 */
export declare const healthCheck: (options?: Parameters<typeof customFetch>[1]) => Promise<HealthStatus>;
export declare const getHealthCheckQueryKey: () => readonly ["/api/healthz"];
export declare const getHealthCheckQueryOptions: <TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData> & {
    queryKey: QueryKey;
};
export type HealthCheckQueryResult = NonNullable<Awaited<ReturnType<typeof healthCheck>>>;
export type HealthCheckQueryError = ErrorType<unknown>;
/**
 * @summary Health check
 */
export declare function useHealthCheck<TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getLoginUrl: () => string;
/**
 * @summary Login with username and numeric password
 */
export declare const login: (loginInput: LoginInput, options?: Parameters<typeof customFetch>[1]) => Promise<AuthUser>;
export declare const getLoginMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof login>>, TError, {
        data: BodyType<LoginInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof login>>, TError, {
    data: BodyType<LoginInput>;
}, TContext>;
export type LoginMutationResult = NonNullable<Awaited<ReturnType<typeof login>>>;
export type LoginMutationBody = BodyType<LoginInput>;
export type LoginMutationError = ErrorType<ErrorResponse>;
/**
* @summary Login with username and numeric password
*/
export declare const useLogin: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof login>>, TError, {
        data: BodyType<LoginInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof login>>, TError, {
    data: BodyType<LoginInput>;
}, TContext>;
export declare const getLogoutUrl: () => string;
/**
 * @summary Logout
 */
export declare const logout: (options?: Parameters<typeof customFetch>[1]) => Promise<SuccessResponse>;
export declare const getLogoutMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof logout>>, TError, void, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof logout>>, TError, void, TContext>;
export type LogoutMutationResult = NonNullable<Awaited<ReturnType<typeof logout>>>;
export type LogoutMutationError = ErrorType<unknown>;
/**
* @summary Logout
*/
export declare const useLogout: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof logout>>, TError, void, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof logout>>, TError, void, TContext>;
export declare const getGetMeUrl: () => string;
/**
 * @summary Get current authenticated user
 */
export declare const getMe: (options?: Parameters<typeof customFetch>[1]) => Promise<AuthUser>;
export declare const getGetMeQueryKey: () => readonly ["/api/auth/me"];
export declare const getGetMeQueryOptions: <TData = Awaited<ReturnType<typeof getMe>>, TError = ErrorType<ErrorResponse>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getMe>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getMe>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetMeQueryResult = NonNullable<Awaited<ReturnType<typeof getMe>>>;
export type GetMeQueryError = ErrorType<ErrorResponse>;
/**
 * @summary Get current authenticated user
 */
export declare function useGetMe<TData = Awaited<ReturnType<typeof getMe>>, TError = ErrorType<ErrorResponse>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getMe>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getListFlatsUrl: () => string;
/**
 * @summary List all flats
 */
export declare const listFlats: (options?: Parameters<typeof customFetch>[1]) => Promise<Flat[]>;
export declare const getListFlatsQueryKey: () => readonly ["/api/flats"];
export declare const getListFlatsQueryOptions: <TData = Awaited<ReturnType<typeof listFlats>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listFlats>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listFlats>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListFlatsQueryResult = NonNullable<Awaited<ReturnType<typeof listFlats>>>;
export type ListFlatsQueryError = ErrorType<unknown>;
/**
 * @summary List all flats
 */
export declare function useListFlats<TData = Awaited<ReturnType<typeof listFlats>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listFlats>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetFlatUrl: (id: number) => string;
/**
 * @summary Get a flat by ID
 */
export declare const getFlat: (id: number, options?: Parameters<typeof customFetch>[1]) => Promise<Flat>;
export declare const getGetFlatQueryKey: (id: number) => readonly [`/api/flats/${number}`];
export declare const getGetFlatQueryOptions: <TData = Awaited<ReturnType<typeof getFlat>>, TError = ErrorType<ErrorResponse>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getFlat>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getFlat>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetFlatQueryResult = NonNullable<Awaited<ReturnType<typeof getFlat>>>;
export type GetFlatQueryError = ErrorType<ErrorResponse>;
/**
 * @summary Get a flat by ID
 */
export declare function useGetFlat<TData = Awaited<ReturnType<typeof getFlat>>, TError = ErrorType<ErrorResponse>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getFlat>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getUpdateFlatUrl: (id: number) => string;
/**
 * @summary Update flat occupancy status
 */
export declare const updateFlat: (id: number, flatUpdate: FlatUpdate, options?: Parameters<typeof customFetch>[1]) => Promise<Flat>;
export declare const getUpdateFlatMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateFlat>>, TError, {
        id: number;
        data: BodyType<FlatUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateFlat>>, TError, {
    id: number;
    data: BodyType<FlatUpdate>;
}, TContext>;
export type UpdateFlatMutationResult = NonNullable<Awaited<ReturnType<typeof updateFlat>>>;
export type UpdateFlatMutationBody = BodyType<FlatUpdate>;
export type UpdateFlatMutationError = ErrorType<ErrorResponse>;
/**
* @summary Update flat occupancy status
*/
export declare const useUpdateFlat: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateFlat>>, TError, {
        id: number;
        data: BodyType<FlatUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateFlat>>, TError, {
    id: number;
    data: BodyType<FlatUpdate>;
}, TContext>;
export declare const getSyncReservationsUrl: () => string;
/**
 * @summary Sync reservations from OneDrive Excel (admin only)
 */
export declare const syncReservations: (options?: Parameters<typeof customFetch>[1]) => Promise<SyncResult>;
export declare const getSyncReservationsMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof syncReservations>>, TError, void, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof syncReservations>>, TError, void, TContext>;
export type SyncReservationsMutationResult = NonNullable<Awaited<ReturnType<typeof syncReservations>>>;
export type SyncReservationsMutationError = ErrorType<unknown>;
/**
* @summary Sync reservations from OneDrive Excel (admin only)
*/
export declare const useSyncReservations: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof syncReservations>>, TError, void, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof syncReservations>>, TError, void, TContext>;
export declare const getListCheckoutsUrl: (params?: ListCheckoutsParams) => string;
/**
 * @summary List flats with checkouts from a given date forward
 */
export declare const listCheckouts: (params?: ListCheckoutsParams, options?: Parameters<typeof customFetch>[1]) => Promise<CheckoutFlat[]>;
export declare const getListCheckoutsQueryKey: (params?: ListCheckoutsParams) => readonly ["/api/reservations/checkouts", ...ListCheckoutsParams[]];
export declare const getListCheckoutsQueryOptions: <TData = Awaited<ReturnType<typeof listCheckouts>>, TError = ErrorType<unknown>>(params?: ListCheckoutsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listCheckouts>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listCheckouts>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListCheckoutsQueryResult = NonNullable<Awaited<ReturnType<typeof listCheckouts>>>;
export type ListCheckoutsQueryError = ErrorType<unknown>;
/**
 * @summary List flats with checkouts from a given date forward
 */
export declare function useListCheckouts<TData = Awaited<ReturnType<typeof listCheckouts>>, TError = ErrorType<unknown>>(params?: ListCheckoutsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listCheckouts>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getListCheckinsUrl: (params?: ListCheckinsParams) => string;
/**
 * @summary List flats with check-ins on a given date
 */
export declare const listCheckins: (params?: ListCheckinsParams, options?: Parameters<typeof customFetch>[1]) => Promise<CheckinFlat[]>;
export declare const getListCheckinsQueryKey: (params?: ListCheckinsParams) => readonly ["/api/reservations/checkins", ...ListCheckinsParams[]];
export declare const getListCheckinsQueryOptions: <TData = Awaited<ReturnType<typeof listCheckins>>, TError = ErrorType<unknown>>(params?: ListCheckinsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listCheckins>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listCheckins>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListCheckinsQueryResult = NonNullable<Awaited<ReturnType<typeof listCheckins>>>;
export type ListCheckinsQueryError = ErrorType<unknown>;
/**
 * @summary List flats with check-ins on a given date
 */
export declare function useListCheckins<TData = Awaited<ReturnType<typeof listCheckins>>, TError = ErrorType<unknown>>(params?: ListCheckinsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listCheckins>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getListCleaningRequestsUrl: (params?: ListCleaningRequestsParams) => string;
/**
 * @summary List cleaning requests for a date
 */
export declare const listCleaningRequests: (params?: ListCleaningRequestsParams, options?: Parameters<typeof customFetch>[1]) => Promise<CleaningRequest[]>;
export declare const getListCleaningRequestsQueryKey: (params?: ListCleaningRequestsParams) => readonly ["/api/cleaning/requests", ...ListCleaningRequestsParams[]];
export declare const getListCleaningRequestsQueryOptions: <TData = Awaited<ReturnType<typeof listCleaningRequests>>, TError = ErrorType<unknown>>(params?: ListCleaningRequestsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listCleaningRequests>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listCleaningRequests>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListCleaningRequestsQueryResult = NonNullable<Awaited<ReturnType<typeof listCleaningRequests>>>;
export type ListCleaningRequestsQueryError = ErrorType<unknown>;
/**
 * @summary List cleaning requests for a date
 */
export declare function useListCleaningRequests<TData = Awaited<ReturnType<typeof listCleaningRequests>>, TError = ErrorType<unknown>>(params?: ListCleaningRequestsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listCleaningRequests>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getCreateCleaningRequestUrl: () => string;
/**
 * @summary Create a manual cleaning request (admin only)
 */
export declare const createCleaningRequest: (cleaningRequestInput: CleaningRequestInput, options?: Parameters<typeof customFetch>[1]) => Promise<CleaningRequest>;
export declare const getCreateCleaningRequestMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createCleaningRequest>>, TError, {
        data: BodyType<CleaningRequestInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createCleaningRequest>>, TError, {
    data: BodyType<CleaningRequestInput>;
}, TContext>;
export type CreateCleaningRequestMutationResult = NonNullable<Awaited<ReturnType<typeof createCleaningRequest>>>;
export type CreateCleaningRequestMutationBody = BodyType<CleaningRequestInput>;
export type CreateCleaningRequestMutationError = ErrorType<unknown>;
/**
* @summary Create a manual cleaning request (admin only)
*/
export declare const useCreateCleaningRequest: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createCleaningRequest>>, TError, {
        data: BodyType<CleaningRequestInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createCleaningRequest>>, TError, {
    data: BodyType<CleaningRequestInput>;
}, TContext>;
export declare const getUpdateCleaningStatusUrl: (requestId: number) => string;
/**
 * @summary Update cleaning status for a flat (5 states)
 */
export declare const updateCleaningStatus: (requestId: number, cleaningStatusUpdate: CleaningStatusUpdate, options?: Parameters<typeof customFetch>[1]) => Promise<CleaningRequest>;
export declare const getUpdateCleaningStatusMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateCleaningStatus>>, TError, {
        requestId: number;
        data: BodyType<CleaningStatusUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateCleaningStatus>>, TError, {
    requestId: number;
    data: BodyType<CleaningStatusUpdate>;
}, TContext>;
export type UpdateCleaningStatusMutationResult = NonNullable<Awaited<ReturnType<typeof updateCleaningStatus>>>;
export type UpdateCleaningStatusMutationBody = BodyType<CleaningStatusUpdate>;
export type UpdateCleaningStatusMutationError = ErrorType<ErrorResponse>;
/**
* @summary Update cleaning status for a flat (5 states)
*/
export declare const useUpdateCleaningStatus: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateCleaningStatus>>, TError, {
        requestId: number;
        data: BodyType<CleaningStatusUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateCleaningStatus>>, TError, {
    requestId: number;
    data: BodyType<CleaningStatusUpdate>;
}, TContext>;
export declare const getMarkVacantUrl: (requestId: number) => string;
/**
 * @summary Mark or unmark a flat as already vacant (room is empty early)
 */
export declare const markVacant: (requestId: number, markVacantBody: MarkVacantBody, options?: Parameters<typeof customFetch>[1]) => Promise<CleaningRequest>;
export declare const getMarkVacantMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof markVacant>>, TError, {
        requestId: number;
        data: BodyType<MarkVacantBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof markVacant>>, TError, {
    requestId: number;
    data: BodyType<MarkVacantBody>;
}, TContext>;
export type MarkVacantMutationResult = NonNullable<Awaited<ReturnType<typeof markVacant>>>;
export type MarkVacantMutationBody = BodyType<MarkVacantBody>;
export type MarkVacantMutationError = ErrorType<ErrorResponse>;
/**
* @summary Mark or unmark a flat as already vacant (room is empty early)
*/
export declare const useMarkVacant: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof markVacant>>, TError, {
        requestId: number;
        data: BodyType<MarkVacantBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof markVacant>>, TError, {
    requestId: number;
    data: BodyType<MarkVacantBody>;
}, TContext>;
export declare const getBatchClaimFlatsUrl: () => string;
/**
 * @summary Claim multiple flats at once (will_clean status)
 */
export declare const batchClaimFlats: (batchClaimInput: BatchClaimInput, options?: Parameters<typeof customFetch>[1]) => Promise<BatchClaimResult>;
export declare const getBatchClaimFlatsMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof batchClaimFlats>>, TError, {
        data: BodyType<BatchClaimInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof batchClaimFlats>>, TError, {
    data: BodyType<BatchClaimInput>;
}, TContext>;
export type BatchClaimFlatsMutationResult = NonNullable<Awaited<ReturnType<typeof batchClaimFlats>>>;
export type BatchClaimFlatsMutationBody = BodyType<BatchClaimInput>;
export type BatchClaimFlatsMutationError = ErrorType<unknown>;
/**
* @summary Claim multiple flats at once (will_clean status)
*/
export declare const useBatchClaimFlats: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof batchClaimFlats>>, TError, {
        data: BodyType<BatchClaimInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof batchClaimFlats>>, TError, {
    data: BodyType<BatchClaimInput>;
}, TContext>;
export declare const getListCleaningHistoryUrl: (params?: ListCleaningHistoryParams) => string;
/**
 * @summary List cleaning history with optional period filter
 */
export declare const listCleaningHistory: (params?: ListCleaningHistoryParams, options?: Parameters<typeof customFetch>[1]) => Promise<CleaningHistoryEntry[]>;
export declare const getListCleaningHistoryQueryKey: (params?: ListCleaningHistoryParams) => readonly ["/api/cleaning/history", ...ListCleaningHistoryParams[]];
export declare const getListCleaningHistoryQueryOptions: <TData = Awaited<ReturnType<typeof listCleaningHistory>>, TError = ErrorType<unknown>>(params?: ListCleaningHistoryParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listCleaningHistory>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listCleaningHistory>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListCleaningHistoryQueryResult = NonNullable<Awaited<ReturnType<typeof listCleaningHistory>>>;
export type ListCleaningHistoryQueryError = ErrorType<unknown>;
/**
 * @summary List cleaning history with optional period filter
 */
export declare function useListCleaningHistory<TData = Awaited<ReturnType<typeof listCleaningHistory>>, TError = ErrorType<unknown>>(params?: ListCleaningHistoryParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listCleaningHistory>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetDashboardSummaryUrl: (params?: GetDashboardSummaryParams) => string;
/**
 * @summary Get summary stats for a given date
 */
export declare const getDashboardSummary: (params?: GetDashboardSummaryParams, options?: Parameters<typeof customFetch>[1]) => Promise<DashboardSummary>;
export declare const getGetDashboardSummaryQueryKey: (params?: GetDashboardSummaryParams) => readonly ["/api/dashboard/summary", ...GetDashboardSummaryParams[]];
export declare const getGetDashboardSummaryQueryOptions: <TData = Awaited<ReturnType<typeof getDashboardSummary>>, TError = ErrorType<unknown>>(params?: GetDashboardSummaryParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDashboardSummary>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getDashboardSummary>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetDashboardSummaryQueryResult = NonNullable<Awaited<ReturnType<typeof getDashboardSummary>>>;
export type GetDashboardSummaryQueryError = ErrorType<unknown>;
/**
 * @summary Get summary stats for a given date
 */
export declare function useGetDashboardSummary<TData = Awaited<ReturnType<typeof getDashboardSummary>>, TError = ErrorType<unknown>>(params?: GetDashboardSummaryParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDashboardSummary>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetSettingsUrl: () => string;
/**
 * @summary Get app settings (admin only)
 */
export declare const getSettings: (options?: Parameters<typeof customFetch>[1]) => Promise<AppSettings>;
export declare const getGetSettingsQueryKey: () => readonly ["/api/settings"];
export declare const getGetSettingsQueryOptions: <TData = Awaited<ReturnType<typeof getSettings>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getSettings>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getSettings>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetSettingsQueryResult = NonNullable<Awaited<ReturnType<typeof getSettings>>>;
export type GetSettingsQueryError = ErrorType<unknown>;
/**
 * @summary Get app settings (admin only)
 */
export declare function useGetSettings<TData = Awaited<ReturnType<typeof getSettings>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getSettings>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getUpdateSettingsUrl: () => string;
/**
 * @summary Update app settings (admin only)
 */
export declare const updateSettings: (appSettingsUpdate: AppSettingsUpdate, options?: Parameters<typeof customFetch>[1]) => Promise<AppSettings>;
export declare const getUpdateSettingsMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateSettings>>, TError, {
        data: BodyType<AppSettingsUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateSettings>>, TError, {
    data: BodyType<AppSettingsUpdate>;
}, TContext>;
export type UpdateSettingsMutationResult = NonNullable<Awaited<ReturnType<typeof updateSettings>>>;
export type UpdateSettingsMutationBody = BodyType<AppSettingsUpdate>;
export type UpdateSettingsMutationError = ErrorType<unknown>;
/**
* @summary Update app settings (admin only)
*/
export declare const useUpdateSettings: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateSettings>>, TError, {
        data: BodyType<AppSettingsUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateSettings>>, TError, {
    data: BodyType<AppSettingsUpdate>;
}, TContext>;
export declare const getListPeriodicTasksUrl: () => string;
/**
 * @summary List all periodic tasks (admin only)
 */
export declare const listPeriodicTasks: (options?: Parameters<typeof customFetch>[1]) => Promise<PeriodicTask[]>;
export declare const getListPeriodicTasksQueryKey: () => readonly ["/api/periodic-tasks"];
export declare const getListPeriodicTasksQueryOptions: <TData = Awaited<ReturnType<typeof listPeriodicTasks>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listPeriodicTasks>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listPeriodicTasks>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListPeriodicTasksQueryResult = NonNullable<Awaited<ReturnType<typeof listPeriodicTasks>>>;
export type ListPeriodicTasksQueryError = ErrorType<unknown>;
/**
 * @summary List all periodic tasks (admin only)
 */
export declare function useListPeriodicTasks<TData = Awaited<ReturnType<typeof listPeriodicTasks>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listPeriodicTasks>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getCreatePeriodicTaskUrl: () => string;
/**
 * @summary Create a periodic task (admin only)
 */
export declare const createPeriodicTask: (periodicTaskInput: PeriodicTaskInput, options?: Parameters<typeof customFetch>[1]) => Promise<PeriodicTask>;
export declare const getCreatePeriodicTaskMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createPeriodicTask>>, TError, {
        data: BodyType<PeriodicTaskInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createPeriodicTask>>, TError, {
    data: BodyType<PeriodicTaskInput>;
}, TContext>;
export type CreatePeriodicTaskMutationResult = NonNullable<Awaited<ReturnType<typeof createPeriodicTask>>>;
export type CreatePeriodicTaskMutationBody = BodyType<PeriodicTaskInput>;
export type CreatePeriodicTaskMutationError = ErrorType<unknown>;
/**
* @summary Create a periodic task (admin only)
*/
export declare const useCreatePeriodicTask: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createPeriodicTask>>, TError, {
        data: BodyType<PeriodicTaskInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createPeriodicTask>>, TError, {
    data: BodyType<PeriodicTaskInput>;
}, TContext>;
export declare const getUpdatePeriodicTaskUrl: (id: number) => string;
/**
 * @summary Update a periodic task (admin only)
 */
export declare const updatePeriodicTask: (id: number, periodicTaskUpdate: PeriodicTaskUpdate, options?: Parameters<typeof customFetch>[1]) => Promise<PeriodicTask>;
export declare const getUpdatePeriodicTaskMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updatePeriodicTask>>, TError, {
        id: number;
        data: BodyType<PeriodicTaskUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updatePeriodicTask>>, TError, {
    id: number;
    data: BodyType<PeriodicTaskUpdate>;
}, TContext>;
export type UpdatePeriodicTaskMutationResult = NonNullable<Awaited<ReturnType<typeof updatePeriodicTask>>>;
export type UpdatePeriodicTaskMutationBody = BodyType<PeriodicTaskUpdate>;
export type UpdatePeriodicTaskMutationError = ErrorType<ErrorResponse>;
/**
* @summary Update a periodic task (admin only)
*/
export declare const useUpdatePeriodicTask: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updatePeriodicTask>>, TError, {
        id: number;
        data: BodyType<PeriodicTaskUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updatePeriodicTask>>, TError, {
    id: number;
    data: BodyType<PeriodicTaskUpdate>;
}, TContext>;
export declare const getDeletePeriodicTaskUrl: (id: number) => string;
/**
 * @summary Delete a periodic task (admin only)
 */
export declare const deletePeriodicTask: (id: number, options?: Parameters<typeof customFetch>[1]) => Promise<SuccessResponse>;
export declare const getDeletePeriodicTaskMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deletePeriodicTask>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deletePeriodicTask>>, TError, {
    id: number;
}, TContext>;
export type DeletePeriodicTaskMutationResult = NonNullable<Awaited<ReturnType<typeof deletePeriodicTask>>>;
export type DeletePeriodicTaskMutationError = ErrorType<unknown>;
/**
* @summary Delete a periodic task (admin only)
*/
export declare const useDeletePeriodicTask: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deletePeriodicTask>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deletePeriodicTask>>, TError, {
    id: number;
}, TContext>;
export declare const getListPendingPeriodicTasksUrl: (params?: ListPendingPeriodicTasksParams) => string;
/**
 * @summary List pending (due or overdue) periodic tasks, optionally filtered by flat
 */
export declare const listPendingPeriodicTasks: (params?: ListPendingPeriodicTasksParams, options?: Parameters<typeof customFetch>[1]) => Promise<PendingPeriodicTask[]>;
export declare const getListPendingPeriodicTasksQueryKey: (params?: ListPendingPeriodicTasksParams) => readonly ["/api/periodic-tasks/pending", ...ListPendingPeriodicTasksParams[]];
export declare const getListPendingPeriodicTasksQueryOptions: <TData = Awaited<ReturnType<typeof listPendingPeriodicTasks>>, TError = ErrorType<unknown>>(params?: ListPendingPeriodicTasksParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listPendingPeriodicTasks>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listPendingPeriodicTasks>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListPendingPeriodicTasksQueryResult = NonNullable<Awaited<ReturnType<typeof listPendingPeriodicTasks>>>;
export type ListPendingPeriodicTasksQueryError = ErrorType<unknown>;
/**
 * @summary List pending (due or overdue) periodic tasks, optionally filtered by flat
 */
export declare function useListPendingPeriodicTasks<TData = Awaited<ReturnType<typeof listPendingPeriodicTasks>>, TError = ErrorType<unknown>>(params?: ListPendingPeriodicTasksParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listPendingPeriodicTasks>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getExecutePeriodicTaskUrl: (id: number) => string;
/**
 * @summary Mark a periodic task as done for a specific flat
 */
export declare const executePeriodicTask: (id: number, periodicTaskExecutionInput: PeriodicTaskExecutionInput, options?: Parameters<typeof customFetch>[1]) => Promise<PeriodicTaskExecution>;
export declare const getExecutePeriodicTaskMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof executePeriodicTask>>, TError, {
        id: number;
        data: BodyType<PeriodicTaskExecutionInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof executePeriodicTask>>, TError, {
    id: number;
    data: BodyType<PeriodicTaskExecutionInput>;
}, TContext>;
export type ExecutePeriodicTaskMutationResult = NonNullable<Awaited<ReturnType<typeof executePeriodicTask>>>;
export type ExecutePeriodicTaskMutationBody = BodyType<PeriodicTaskExecutionInput>;
export type ExecutePeriodicTaskMutationError = ErrorType<unknown>;
/**
* @summary Mark a periodic task as done for a specific flat
*/
export declare const useExecutePeriodicTask: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof executePeriodicTask>>, TError, {
        id: number;
        data: BodyType<PeriodicTaskExecutionInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof executePeriodicTask>>, TError, {
    id: number;
    data: BodyType<PeriodicTaskExecutionInput>;
}, TContext>;
export declare const getListObservationsUrl: (params?: ListObservationsParams) => string;
/**
 * @summary List observations (admin sees all; camareira sees own flat observations)
 */
export declare const listObservations: (params?: ListObservationsParams, options?: Parameters<typeof customFetch>[1]) => Promise<Observation[]>;
export declare const getListObservationsQueryKey: (params?: ListObservationsParams) => readonly ["/api/observations", ...ListObservationsParams[]];
export declare const getListObservationsQueryOptions: <TData = Awaited<ReturnType<typeof listObservations>>, TError = ErrorType<unknown>>(params?: ListObservationsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listObservations>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listObservations>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListObservationsQueryResult = NonNullable<Awaited<ReturnType<typeof listObservations>>>;
export type ListObservationsQueryError = ErrorType<unknown>;
/**
 * @summary List observations (admin sees all; camareira sees own flat observations)
 */
export declare function useListObservations<TData = Awaited<ReturnType<typeof listObservations>>, TError = ErrorType<unknown>>(params?: ListObservationsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listObservations>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getCreateObservationUrl: () => string;
/**
 * @summary Create a flat observation
 */
export declare const createObservation: (observationInput: ObservationInput, options?: Parameters<typeof customFetch>[1]) => Promise<Observation>;
export declare const getCreateObservationMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createObservation>>, TError, {
        data: BodyType<ObservationInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createObservation>>, TError, {
    data: BodyType<ObservationInput>;
}, TContext>;
export type CreateObservationMutationResult = NonNullable<Awaited<ReturnType<typeof createObservation>>>;
export type CreateObservationMutationBody = BodyType<ObservationInput>;
export type CreateObservationMutationError = ErrorType<unknown>;
/**
* @summary Create a flat observation
*/
export declare const useCreateObservation: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createObservation>>, TError, {
        data: BodyType<ObservationInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createObservation>>, TError, {
    data: BodyType<ObservationInput>;
}, TContext>;
export declare const getResolveObservationUrl: (id: number) => string;
/**
 * @summary Mark an observation as resolved (admin only)
 */
export declare const resolveObservation: (id: number, observationResolveInput?: ObservationResolveInput, options?: Parameters<typeof customFetch>[1]) => Promise<Observation>;
export declare const getResolveObservationMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof resolveObservation>>, TError, {
        id: number;
        data?: BodyType<ObservationResolveInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof resolveObservation>>, TError, {
    id: number;
    data?: BodyType<ObservationResolveInput>;
}, TContext>;
export type ResolveObservationMutationResult = NonNullable<Awaited<ReturnType<typeof resolveObservation>>>;
export type ResolveObservationMutationBody = BodyType<ObservationResolveInput> | undefined;
export type ResolveObservationMutationError = ErrorType<unknown>;
/**
* @summary Mark an observation as resolved (admin only)
*/
export declare const useResolveObservation: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof resolveObservation>>, TError, {
        id: number;
        data?: BodyType<ObservationResolveInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof resolveObservation>>, TError, {
    id: number;
    data?: BodyType<ObservationResolveInput>;
}, TContext>;
export declare const getGetAnalyticsReportUrl: (params?: GetAnalyticsReportParams) => string;
/**
 * @summary Get analytics report for admin (admin only)
 */
export declare const getAnalyticsReport: (params?: GetAnalyticsReportParams, options?: Parameters<typeof customFetch>[1]) => Promise<AnalyticsReport>;
export declare const getGetAnalyticsReportQueryKey: (params?: GetAnalyticsReportParams) => readonly ["/api/analytics/report", ...GetAnalyticsReportParams[]];
export declare const getGetAnalyticsReportQueryOptions: <TData = Awaited<ReturnType<typeof getAnalyticsReport>>, TError = ErrorType<unknown>>(params?: GetAnalyticsReportParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getAnalyticsReport>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getAnalyticsReport>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetAnalyticsReportQueryResult = NonNullable<Awaited<ReturnType<typeof getAnalyticsReport>>>;
export type GetAnalyticsReportQueryError = ErrorType<unknown>;
/**
 * @summary Get analytics report for admin (admin only)
 */
export declare function useGetAnalyticsReport<TData = Awaited<ReturnType<typeof getAnalyticsReport>>, TError = ErrorType<unknown>>(params?: GetAnalyticsReportParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getAnalyticsReport>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetAlertsUrl: () => string;
/**
 * @summary Get in-app alerts for the current user
 */
export declare const getAlerts: (options?: Parameters<typeof customFetch>[1]) => Promise<Alert[]>;
export declare const getGetAlertsQueryKey: () => readonly ["/api/notifications/alerts"];
export declare const getGetAlertsQueryOptions: <TData = Awaited<ReturnType<typeof getAlerts>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getAlerts>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getAlerts>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetAlertsQueryResult = NonNullable<Awaited<ReturnType<typeof getAlerts>>>;
export type GetAlertsQueryError = ErrorType<unknown>;
/**
 * @summary Get in-app alerts for the current user
 */
export declare function useGetAlerts<TData = Awaited<ReturnType<typeof getAlerts>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getAlerts>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export {};
//# sourceMappingURL=api.d.ts.map