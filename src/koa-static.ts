import Router from '@koa/router';
import { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { z } from 'zod';
import zodToJsonSchema from 'zod-to-json-schema';
import { IntrospectionConfig } from './koa';
import {
  EndpointImplementation,
  implementRoute,
  PathParamsOf,
} from './koa-utils';
import { IntrospectionResponse, OneSchemaDefinition } from './types';

export type EndpointDefinition<Name> = {
  name: Name;
  description?: string;
  request: z.ZodType<any, any, any>;
  response: z.ZodType<any, any, any>;
};

type Method = 'GET' | 'DELETE' | 'PUT' | 'POST' | 'PATCH';
type RoughRoute = `${Method} ${string}`;

type ZodSchema = {
  [route: string]: EndpointDefinition<string>;
};

export type NamedClient<Schema extends ZodSchema> = {
  [Route in keyof Schema as Schema[Route]['name']]: (
    request: z.infer<Schema[Route]['request']> & PathParamsOf<Route>,
    config?: AxiosRequestConfig,
  ) => Promise<AxiosResponse<z.infer<Schema[Route]['response']>>>;
};

export type RequestClient<Schema extends ZodSchema> = {
  request<Route extends keyof Schema>(
    route: Route,
    request: z.infer<Schema[Route]['request']> & PathParamsOf<Route>,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<z.infer<Schema[Route]['response']>>>;
};

export type ClientOf<Router> = Router extends OneSchemaRouter<infer Schema, any>
  ? RequestClient<Schema> & NamedClient<Schema>
  : never;

export type OneSchemaRouterConfig<R extends Router<any, any>> = {
  using: R;
  introspection: IntrospectionConfig | undefined;
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
          schema: convertToJSONSchemaBased(this.schema),
          serviceVersion: introspection.serviceVersion,
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

  expose<
    Route extends RoughRoute,
    Name extends string,
    Endpoint extends EndpointDefinition<Name>,
  >(
    endpoint: Endpoint & { route: Route },
    implementation: EndpointImplementation<
      Route,
      z.infer<Schema[Route]['request']>,
      z.infer<Schema[Route]['response']>,
      R
    >,
  ): OneSchemaRouter<Schema & { [route in Route]: Endpoint }, R> {
    // @ts-expect-error
    this.schema[endpoint.route] = endpoint;

    implementRoute(
      endpoint.route,
      this.router,
      (ctx, data) => {
        const res = endpoint.request.safeParse(data);
        if (!res.success) {
          return ctx.throw(
            400,
            `The request did not conform to the required schema: ${res.error.format()}`,
          );
        }
        return res.data;
      },
      implementation,
    );

    return this as any;
  }

  middleware(): [Router.Middleware, Router.Middleware] {
    return [this.router.routes(), this.router.allowedMethods()];
  }

  client(instance: AxiosInstance): ClientOf<this> {
    return {} as any;
  }
}

const convertToJSONSchemaBased = <Schema extends ZodSchema>(
  schema: Schema,
): OneSchemaDefinition => {
  const oneSchema: OneSchemaDefinition = { Endpoints: {} };

  for (const [endpoint, definition] of Object.entries(schema)) {
    oneSchema.Endpoints[endpoint] = {
      Name: definition.name,
      Description: definition.description,
      Request: zodToJsonSchema(definition.request) as any,
      Response: zodToJsonSchema(definition.response) as any,
    };
  }

  return oneSchema;
};
