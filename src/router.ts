import Router from '@koa/router';
import { z } from 'zod';
import { fromZodError } from 'zod-validation-error';
import zodToJsonSchema from 'zod-to-json-schema';
import compose = require('koa-compose');
import { IntrospectionConfig } from './koa';
import { EndpointImplementation, implementRoute } from './koa-utils';
import { IntrospectionResponse, OneSchemaDefinition } from './types';

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

  route<
    Route extends RoughRoute,
    Name extends string,
    Endpoint extends RouterEndpointDefinition<Name>,
  >(
    endpoint: Endpoint & { route: Route },
  ): OneSchemaRouter<Schema & { [route in Route]: Endpoint }, R> {
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
}

const convertRouterSchemaToJSONSchemaStyle = <Schema extends ZodSchema>(
  schema: Schema,
): OneSchemaDefinition => {
  const oneSchema: OneSchemaDefinition = { Endpoints: {} };

  for (const [endpoint, definition] of Object.entries(schema)) {
    oneSchema.Endpoints[endpoint] = {
      Name: definition.name,
      Description: definition.description,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      Request: zodToJsonSchema(definition.request) as any,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      Response: zodToJsonSchema(definition.response) as any,
    };
  }

  return oneSchema;
};
