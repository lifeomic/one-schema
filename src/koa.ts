import { JSONSchema4 } from 'json-schema';
import type { ExtendableContext, ParameterizedContext } from 'koa';
import type Router from '@koa/router';
import type { EndpointsOf, IntrospectionResponse, OneSchema } from './types';

/**
 * We use this type to very cleanly remove these fields from the Koa context, so
 * that we can replace the fields with our strict types from the generated schema.
 *
 * - `request.body`
 * - `request.query`
 *
 * This is primarily important for `request.body` -- the others are included in the
 * same why for simplicity.
 *
 * Why it's important for `request.body`: most popular Koa body parser middlewares use a
 * global `declare` statement to mark the `body` field as being present on the request.
 *
 * Most of these libraries declare the field as `body: any`. With this type declaration,
 * it becomes impossible to augment the type, since any more stringent types are just
 * "collapsed" into the `any` type, resulting in a final type of `any`.
 *
 * By explicitly removing the fields from the context, then re-adding them, we can be
 * sure they are typed correctly.
 */
type ExtendableContextWithRequestFieldsRemoved =
  // Omit request entirely
  Omit<ExtendableContext, 'request'> & {
    // Re-add request, but without the "body" or "query" fields.
    request: Omit<ExtendableContext['request'], 'body' | 'query'>;
  };

type StateOfRouter<RouterType> = RouterType extends Router<infer State, any>
  ? State
  : never;

type ContextOfRouter<RouterType> = RouterType extends Router<any, infer Context>
  ? Context
  : never;

export type ImplementationOf<
  Schema extends OneSchema<any>,
  RouterType extends Router<any, any>,
> = {
  [Name in keyof EndpointsOf<Schema>]: (
    // prettier-ignore
    context:
      // 1. Start with a context that has request.body and request.query removed.
      // This context also importantly does _not_ have the `params` property included,
      // since it comes from a core `koa` type, rather than from `@koa/router`.
      & ExtendableContextWithRequestFieldsRemoved
      // 2. Now, we add the generated + well-typed `params`, `request.body`, and
      // `request.query` properties.
      & {
          params: EndpointsOf<Schema>[Name]['PathParams'];
          request: Name extends `${'GET' | 'DELETE'} ${string}`
            ? { query: EndpointsOf<Schema>[Name]['Request'] }
            : { body: EndpointsOf<Schema>[Name]['Request'] };
        }
      // 3. Now, add the `state` property and merge in the arbitrary custom context, to
      // essentially mimic the behavior of koa's `ParameterizedContext`.
      //
      // Why not just use ParameterizedContext: When we tried to use ParameterizedContext
      // directly, it was incompatible with Omit (omitting a single property resulted in
      // a fully empty object).
      & { state: StateOfRouter<RouterType>; }
      & ContextOfRouter<RouterType>,
  ) =>
    | EndpointsOf<Schema>[Name]['Response']
    | Promise<EndpointsOf<Schema>[Name]['Response']>;
};

export type IntrospectionConfig = {
  /**
   * A route at which to serve the introspection request on the implementing
   * Router object.
   *
   * A GET method will be supported on this route, and will return introspection data.
   */
  route: string;
  /**
   * The current version of the service, served as part of introspection.
   */
  serviceVersion: string;
};

/**
 * An implementation configuration for an API.
 */
export type ImplementationConfig<
  Schema extends OneSchema<any>,
  RouterType extends Router<any, any>,
> = {
  /**
   * The implementation of the API.
   */
  implementation: ImplementationOf<Schema, RouterType>;

  /**
   * The router to use for implementing the API.
   */
  on: RouterType;

  /**
   * A function for parsing the correct data from the provided `data`,
   * such that the parsed data matches the request `schema` for the `endpoint`.
   *
   * If the `data` does not conform to the schema, this function
   * should `throw`.
   *
   * @param ctx The current context.
   * @param params.endpoint The endpoint being requested.
   * @param params.schema The request JSON Schema.
   * @param params.data The payload to validate.
   *
   * @returns A validated payload.
   */
  parse: <Endpoint extends keyof EndpointsOf<Schema>>(
    ctx: ParameterizedContext<
      StateOfRouter<RouterType>,
      ContextOfRouter<RouterType>
    >,
    params: { endpoint: Endpoint; schema: JSONSchema4; data: unknown },
  ) => Schema['Endpoints'][Endpoint]['Request'];

  /** A configuration for supporting introspection. */
  introspection: IntrospectionConfig | undefined;
};

/**
 * Implements the specified `schema` on the provided router object.
 *
 * @param schema The API OneSchema object.
 * @param config The implementation configuration.
 */
export const implementSchema = <
  Schema extends OneSchema<any>,
  RouterType extends Router<any, any>,
>(
  schema: Schema,
  {
    implementation,
    parse,
    on: router,
    introspection,
  }: ImplementationConfig<Schema, RouterType>,
): void => {
  if (introspection) {
    router.get(introspection.route, (ctx, next) => {
      const response: IntrospectionResponse = {
        schema,
        serviceVersion: introspection.serviceVersion,
      };

      ctx.body = response;
      ctx.status = 200;
      return next();
    });
  }

  // Iterate through every handler, and add a route for it based on
  // the key/route description.
  for (const [endpoint, routeHandler] of Object.entries(implementation)) {
    // Separate method and path. e.g. 'POST my/route' => ['POST', 'my/route']
    const [method, path] = endpoint.split(' ');

    /** A shared route handler. */
    const handler: Router.Middleware<
      StateOfRouter<RouterType>,
      ContextOfRouter<RouterType>
    > = async (ctx, next) => {
      // 1. Validate the input data.
      const requestSchema = schema.Endpoints[endpoint].Request;
      if (requestSchema) {
        // 1a. For GET and DELETE, validate the query params.
        if (['GET', 'DELETE'].includes(method)) {
          // @ts-ignore
          ctx.request.query = parse(ctx, {
            endpoint,
            schema: { ...requestSchema, definitions: schema.Resources },
            data: ctx.request.query,
          });
        } else {
          // 1b. Otherwise, use the body.
          ctx.request.body = parse(ctx, {
            endpoint,
            schema: { ...requestSchema, definitions: schema.Resources },
            data: ctx.request.body,
          });
        }
      }

      // 2. Run the provided route handler.
      const response = await routeHandler(ctx);

      /**
       * Why we avoid checking the response against the response schema:
       *
       * Current limitations of JSONSchema prevent us from doing this correctly,
       * because of common inheritance-like approaches to defining response types.
       * See this SO thread for a detailed description of the issue:
       *
       * https://stackoverflow.com/questions/22689900/json-schema-allof-with-additionalproperties
       */

      // 3. Return the result and call the next middleware.
      ctx.response.body = response;
      // If the response status is already set to a 200-level code, don't override it.
      // This is the mechanism for allowing consumers to customize response codes.
      if (ctx.response.status < 200 || ctx.response.status >= 300) {
        ctx.response.status = 200;
      }
      return next();
    };

    // Register the route + handler on the router.
    switch (method) {
      case 'POST':
        router.post(path, handler);
        break;
      case 'GET':
        router.get(path, handler);
        break;
      case 'PUT':
        router.put(path, handler);
        break;
      case 'PATCH':
        router.patch(path, handler);
        break;
      case 'DELETE':
        router.delete(path, handler);
        break;
      default:
        throw new Error(`Unsupported method detected: ${endpoint}`);
    }
  }
};
