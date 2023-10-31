import Router from '@koa/router';
import { z } from 'zod';
import {
  ContextOfEndpoint,
  EndpointImplementation,
  OneSchemaRouterMiddleware,
} from './koa-utils';
import {
  NamedClient,
  OneSchemaRouter,
  OneSchemaRouterConfig,
  RouterEndpointDefinition,
  ZodSchema,
} from './router';
import { AxiosInstance } from 'axios';

type MethodMap = {
  get: 'GET';
  post: 'POST';
  put: 'PUT';
  patch: 'PATCH';
  delete: 'DELETE';
};

export type OneSchemaCompatRouter<
  Schema extends ZodSchema,
  R extends Router,
> = {
  [Method in keyof MethodMap]: <
    Path extends string,
    Name extends string,
    Endpoint extends RouterEndpointDefinition<Name>,
  >(
    path: Path,
    meta: Endpoint,
    ...middlewares: [
      ...OneSchemaRouterMiddleware<
        ContextOfEndpoint<
          `${MethodMap[Method]} ${Path}`,
          z.output<Endpoint['request']>,
          R
        >
      >[],
      EndpointImplementation<
        `${MethodMap[Method]} ${Path}`,
        z.output<Endpoint['request']>,
        z.infer<Endpoint['response']>,
        R
      >,
    ]
  ) => OneSchemaCompatRouter<
    Schema & {
      [Route in `${MethodMap[Method]} ${Path}`]: Endpoint;
    },
    R
  >;
} & {
  client: (instance: AxiosInstance) => NamedClient<Schema>;
  middleware: () => Router.Middleware;
};

export const createCompatRouter = <R extends Router<any, any>>(
  config: OneSchemaRouterConfig<R>,
): OneSchemaCompatRouter<{}, R> => {
  const _router = OneSchemaRouter.create(config);

  const compatRouter: any = {
    middleware: () => _router.middleware(),
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    client: (instance: any) => _router.client(instance),
  };
  for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
    compatRouter[method] = (
      path: string,
      endpoint: any,
      ...middlewares: any[]
    ) => {
      const route = `${method.toUpperCase()} ${path}`;
      _router
        .declare({ ...endpoint, route })
        // @ts-expect-error
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        .implement(route, ...middlewares);

      return compatRouter;
    };
  }
  return compatRouter;
};
