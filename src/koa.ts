import { JSONSchema4 } from 'json-schema';
import type { ParameterizedContext } from 'koa';
import type Router = require('koa-router');
import type { EndpointsOf, OneSchema } from './types';

// This declare is required to override the "declare" that comes from
// koa-bodyparser. Without this, the typings from one-schema will be
// overriden and collapsed into "any".
declare module 'koa' {
  interface Request {
    body?: unknown;
  }
}

export type ImplementationOf<Schema extends OneSchema<any>, State, Context> = {
  [Name in keyof EndpointsOf<Schema>]: (
    context: ParameterizedContext<
      State,
      Context & {
        params: EndpointsOf<Schema>[Name]['PathParams'];
        request: Name extends `${'GET' | 'DELETE'} ${string}`
          ? { query: EndpointsOf<Schema>[Name]['Request'] }
          : { body: EndpointsOf<Schema>[Name]['Request'] };
      }
    >,
  ) => Promise<EndpointsOf<Schema>[Name]['Response']>;
};

/**
 * An implementation configuration for an API.
 */
export type ImplementationConfig<
  Schema extends OneSchema<any>,
  State,
  Context,
> = {
  /**
   * The implementation of the API.
   */
  implementation: ImplementationOf<Schema, State, Context>;

  /**
   * The router to use for implementing the API.
   */
  on: Router<State, Context>;

  /**
   * A function for parsing the correct data from the provided `payload`,
   * such that the parsed data matches the request `schema` for the `endpoint`.
   *
   * If the `payload` does not conform to the schema, this function
   * should `throw`.
   *
   * @param ctx The current context.
   * @param endpoint The endpoint being requested.
   * @param schema The request JSON Schema.
   * @param payload The payload to validate.
   *
   * @returns A validated payload.
   */
  parse: <Endpoint extends keyof EndpointsOf<Schema>>(
    ctx: ParameterizedContext<State, Context>,
    endpoint: Endpoint,
    schema: JSONSchema4,
    payload: unknown,
  ) => Schema['Endpoints'][Endpoint]['Request'];
};

/**
 * Implements the specified `schema` on the provided router object.
 *
 * @param schema The API OneSchema object.
 * @param config The implementation configuration.
 */
export const implementSchema = <State, Context, Schema extends OneSchema<any>>(
  { Endpoints, Resources }: Schema,
  {
    implementation,
    parse,
    on: router,
  }: ImplementationConfig<Schema, State, Context>,
): void => {
  // Iterate through every handler, and add a route for it based on
  // the key/route description.
  for (const [endpoint, routeHandler] of Object.entries(implementation)) {
    // Separate method and path. e.g. 'POST my/route' => ['POST', 'my/route']
    const [method, path] = endpoint.split(' ');

    /** A shared route handler. */
    const handler: Router.IMiddleware<State, Context> = async (ctx, next) => {
      // 1. Validate the input data.
      const requestSchema = Endpoints[endpoint].Request;
      if (requestSchema) {
        // 1a. For GET and DELETE, validate the query params.
        if (['GET', 'DELETE'].includes(method)) {
          // @ts-ignore
          ctx.request.query = parse(
            ctx,
            endpoint,
            { ...requestSchema, definitions: Resources },
            ctx.request.query,
          );
        } else {
          // 1b. Otherwise, use the body.
          ctx.request.body = parse(
            ctx,
            endpoint,
            { ...requestSchema, definitions: Resources },
            ctx.request.body,
          );
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
      ctx.response.status = 200;
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
