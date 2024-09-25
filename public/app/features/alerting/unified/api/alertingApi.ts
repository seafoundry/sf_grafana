import { BaseQueryFn, createApi, defaultSerializeQueryArgs } from '@reduxjs/toolkit/query/react';
import { omit } from 'lodash';
import { lastValueFrom } from 'rxjs';

import { AppEvents } from '@grafana/data';
import { BackendSrvRequest, getBackendSrv } from '@grafana/runtime';
import appEvents from 'app/core/app_events';

import { logMeasurement } from '../Analytics';

export type ExtendedBackendSrvRequest = BackendSrvRequest & {
  /**
   * Data to send with a request. Maps to the `data` property on a `BackendSrvRequest`
   *
   * This is done to allow us to more easily consume code-gen APIs that expect/send a `body` property
   * to endpoints.
   */
  body?: BackendSrvRequest['data'];
};

export type NotificationOptions = {
  /**
   * Custom success message to show after completion of the request.
   *
   * If a custom message is provided, any success message provided from the API response
   * will not be shown
   */
  successMessage?: string;
  /**
   * Custom error message to show if there's an error completing the request via backendSrv.
   *
   * If a custom message is provided, any error message from the API response
   * will not be shown
   */
  errorMessage?: string;
} & Pick<BackendSrvRequest, 'showSuccessAlert' | 'showErrorAlert'>;

// utility type for passing request options to endpoints
export type WithNotificationOptions<T> = T & {
  notificationOptions?: NotificationOptions;
};

// we'll use this type to prevent any consumer of the API from passing "showSuccessAlert" or "showErrorAlert" to the request options
export type BaseQueryFnArgs = WithNotificationOptions<
  Omit<ExtendedBackendSrvRequest, 'showSuccessAlert' | 'showErrorAlert'>
>;

export const backendSrvBaseQuery =
  (): BaseQueryFn<BaseQueryFnArgs> =>
  async ({ body, notificationOptions = {}, ...requestOptions }) => {
    const { errorMessage, showErrorAlert, successMessage, showSuccessAlert } = notificationOptions;

    try {
      const modifiedRequestOptions: BackendSrvRequest = {
        ...requestOptions,
        ...(body && { data: body }),
        ...(successMessage && { showSuccessAlert: false }),
        ...(errorMessage && { showErrorAlert: false }),
      };

      const requestStartTs = performance.now();

      const { data, ...meta } = await lastValueFrom(getBackendSrv().fetch(modifiedRequestOptions));

      logMeasurement(
        'backendSrvBaseQuery',
        {
          loadTimeMs: performance.now() - requestStartTs,
        },
        {
          url: requestOptions.url,
          method: requestOptions.method ?? 'GET',
          responseStatus: meta.statusText,
        }
      );

      if (successMessage && showSuccessAlert !== false) {
        appEvents.emit(AppEvents.alertSuccess, [successMessage]);
      }
      return { data, meta };
    } catch (error) {
      if (errorMessage && showErrorAlert !== false) {
        appEvents.emit(AppEvents.alertError, [errorMessage]);
      }
      return { error };
    }
  };

export const alertingApi = createApi({
  reducerPath: 'alertingApi',
  baseQuery: backendSrvBaseQuery(),
  // The `BasyQueryFn`` passes all args to `getBackendSrv().fetch()` and that includes configuration options for controlling
  // when to show a "toast".
  //
  // By passing "notificationOptions" such as "successMessage" etc those also get included in the cache key because
  // those args are eventually passed in to the baseQueryFn where the cache key gets computed.
  //
  // @TODO
  // Ideally we wouldn't pass any args in to the endpoint at all and toast message behaviour should be controlled
  // in the hooks or components that consume the RTKQ endpoints.
  serializeQueryArgs: (args) => defaultSerializeQueryArgs(omit(args, 'queryArgs.notificationOptions')),
  tagTypes: [
    'AlertingConfiguration',
    'AlertmanagerConfiguration',
    'AlertmanagerConnectionStatus',
    'AlertmanagerAlerts',
    'AlertmanagerSilences',
    'OnCallIntegrations',
    'DataSourceSettings',
    'GrafanaLabels',
    'CombinedAlertRule',
    'GrafanaRulerRule',
    'GrafanaSlo',
    'RuleGroup',
    'RuleNamespace',
    'ContactPoint',
    'ContactPointsStatus',
    'Receiver',
  ],
  endpoints: () => ({}),
});
