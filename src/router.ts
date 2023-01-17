import Router from '@koa/router';
import { z } from 'zod';
import { fromZodError } from 'zod-validation-error';
import zodToJsonSchema from 'zod-to-json-schema';
import compose = require('koa-compose');
import { IntrospectionConfig } from './koa';
import {
  EndpointImplementation,
  implementRoute,
  PathParamsOf,
} from './koa-utils';
import { IntrospectionResponse, OneSchemaDefinition } from './types';
import { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';

export type RouterEndpointDefinition<Name> = {
  name: Name;
  description?: string;
  request: z.ZodType<any, any, any>;
  response: z.ZodType<any, any, any>;
};

type Method = 'GET' | 'DELETE' | 'PUT' | 'POST' | 'PATCH';
type RoughRoute = `${Method} ${string}`;

type ZodSchema = {
  [route: string]: RouterEndpointDefinition<string>;
};

export type OneSchemaRouterConfig<R extends Router<any, any>> = {
  using: R;
  introspection: IntrospectionConfig | undefined;
};

export type NamedClient<Schema extends ZodSchema> = {
  [Route in keyof Schema as Schema[Route]['name']]: (
    request: z.infer<Schema[Route]['request']> & PathParamsOf<Route>,
    config?: AxiosRequestConfig,
  ) => Promise<AxiosResponse<z.infer<Schema[Route]['response']>>>;
};

export class OneSchemaRouter<
  Schema extends ZodSchema,
  R extends Router<any, any>,
> {
  private router: R;

  private constructor(
    private schema: Schema,
    { introspection, using: router }: OneSchemaRouterConfig<R>,
  ) {
    this.router = router;
    if (introspection) {
      router.get(introspection.route, (ctx, next) => {
        const response: IntrospectionResponse = {
          serviceVersion: introspection.serviceVersion,
          schema: convertRouterSchemaToJSONSchemaStyle(this.schema),
        };

        ctx.body = response;
        ctx.status = 200;
        return next();
      });
    }
  }

  static create<R extends Router<any, any>>(
    config: OneSchemaRouterConfig<R>,
  ): OneSchemaRouter<{}, R> {
    return new OneSchemaRouter({}, config);
  }

  declare<
    Route extends RoughRoute,
    Name extends string,
    Endpoint extends RouterEndpointDefinition<Name>,
  >(
    endpoint: Endpoint & { route: Route },
  ): OneSchemaRouter<Schema & { [route in Route]: Endpoint }, R> {
    const currentNames = Object.entries(this.schema).map(
      ([, endpoint]) => endpoint.name,
    );

    if (currentNames.includes(endpoint.name)) {
      throw new Error(
        `Multiple endpoints were declared with the same name "${endpoint.name}". Each endpoint must have a unique name.`,
      );
    }

    // @ts-expect-error
    this.schema[endpoint.route] = endpoint;

    return this as any;
  }

  implement<Route extends keyof Schema & string>(
    route: Route,
    implementation: EndpointImplementation<
      Route,
      z.infer<Schema[Route]['request']>,
      z.infer<Schema[Route]['response']>,
      R
    >,
  ) {
    const endpoint = this.schema[route];

    implementRoute(
      route,
      this.router,
      (ctx, data) => {
        const res = endpoint.request.safeParse(data);
        if (!res.success) {
          const friendlyError = fromZodError(res.error, {
            prefix: 'The request input did not conform to the required schema',
          });
          return ctx.throw(400, friendlyError.message);
        }
        return res.data;
      },
      implementation,
    );

    return this;
  }

  middleware(): Router.Middleware {
    return compose([this.router.routes(), this.router.allowedMethods()]);
  }

  /**
   * Creates a user-friendly client for the router, using the provided Axios instance.
   */
  client(axios: AxiosInstance): NamedClient<Schema> {
    // Getting correct dynamic typing on this is quite complicated. For now, not worth it.
    const client = {} as any;

    const substituteParams = (path: string, payload: Record<string, any>) =>
      Object.entries(payload).reduce(
        (path, [name, value]) =>
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          path.replace(':' + name, encodeURIComponent(value)),
        path,
      );

    const removePathParams = (path: string, payload: Record<string, any>) =>
      Object.entries(payload)
        .filter(([, value]) => value !== undefined)
        .reduce(
          (accum, [name, value]) =>
            path.includes(':' + name) ? accum : { ...accum, [name]: value },
          {},
        );

    for (const [route, endpoint] of Object.entries(this.schema)) {
      const [method, path] = route.split(' ') as [Method, string];
      client[endpoint.name] = (payload: any, config?: AxiosRequestConfig) => {
        return axios.request({
          method,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          url: substituteParams(path, payload),
          ...(['GET', 'DELETE'].includes(method)
            ? // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
              { params: removePathParams(path, payload) }
            : // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
              { data: removePathParams(path, payload) }),
          ...config,
        });
      };
    }

    return client;
  }
}

const convertRouterSchemaToJSONSchemaStyle = <Schema extends ZodSchema>(
  schema: Schema,
): OneSchemaDefinition => {
  const oneSchema: OneSchemaDefinition = { Endpoints: {} };

  for (const [endpoint, definition] of Object.entries(schema)) {
    oneSchema.Endpoints[endpoint] = {
      Name: definition.name,
      Description: definition.description,
      // The JSONSchema types are very slightly different between packages. We just
      // trust that the interop will work fine, and use "as any" here.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      Request: zodToJsonSchema(definition.request) as any,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      Response: zodToJsonSchema(definition.response) as any,
    };
  }

  return oneSchema;
};
