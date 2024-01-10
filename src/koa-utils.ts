import Router from '@koa/router';
import { ExtendableContext } from 'koa';

/**
 * This type is structured recursively.
 */
export type PathParamsOf<Route> =
  // First, filter out the leading method and space (e.g. the "GET ")
  Route extends `${string} ${infer Path}`
    ? PathParamsOf<Path>
    : // Now, split by the "/", and check the strings before + after.
    Route extends `${infer Before}/${infer After}`
    ? PathParamsOf<Before> & PathParamsOf<After>
    : // If the path part looks like a param, return the object.
    Route extends `:${infer Param}`
    ? {
        [Key in Param]: string;
      }
    : {};

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
export type ExtendableContextWithRequestFieldsRemoved =
  // Omit request entirely
  Omit<ExtendableContext, 'request'> & {
    // Re-add request, but without the "body" or "query" fields.
    request: Omit<ExtendableContext['request'], 'body' | 'query'>;
  };

export type StateOfRouter<RouterType> = RouterType extends Router<
  infer State,
  any
>
  ? State
  : never;

export type ContextOfRouter<RouterType> = RouterType extends Router<
  any,
  infer Context
>
  ? Context
  : never;

export type ContextOfEndpoint<
  RouteName,
  Request,
  RouterType extends Router<any, any>,
> =
  // prettier-ignore
  // 1. Start with a context that has request.body and request.query removed.
  // This context also importantly does _not_ have the `params` property included,
  // since it comes from a core `koa` type, rather than from `@koa/router`.
  & ExtendableContextWithRequestFieldsRemoved
  // 2. Now, we add the generated + well-typed `params`, `request.body`, and
  // `request.query` properties. 
  & {
      params: PathParamsOf<RouteName>;
      request: RouteName extends `${'GET' | 'DELETE'} ${string}`
        ? { query: Request }
        : { body: Request };
    } 
  // 3. Now, add the `state` property and merge in the arbitrary custom context, to
  // essentially mimic the behavior of koa's `ParameterizedContext`. 
  //
  // Why not just use ParameterizedContext: When we tried to use ParameterizedContext
  // directly, it was incompatible with Omit (omitting a single property resulted in
  // a fully empty object).
  & { state: StateOfRouter<RouterType> } & ContextOfRouter<RouterType>;

export type EndpointImplementation<
  RouteName,
  Request,
  Response,
  RouterType extends Router<any, any>,
> = (
  context: ContextOfEndpoint<RouteName, Request, RouterType>,
) => Response | Promise<Response>;

export type OneSchemaRouterMiddleware<Context> = (
  context: Context,
  next: () => Promise<any>,
) => any | Promise<any>;

export const implementRoute = <
  Route extends string,
  Request,
  Response,
  R extends Router<any, any>,
>(
  route: Route,
  router: R,
  parse: (ctx: ContextOfEndpoint<Route, Request, R>, data: unknown) => Request,
  middlewares: OneSchemaRouterMiddleware<
    ContextOfEndpoint<Route, Request, R>
  >[],
  implementation: EndpointImplementation<Route, Request, Response, R>,
) => {
  // Separate method and path. e.g. 'POST my/route' => ['POST', 'my/route']
  const [method, path] = route.split(' ');

  /** A shared route handler. */
  const handler: Router.Middleware<
    StateOfRouter<R>,
    ContextOfRouter<R>
  > = async (ctx, next) => {
    // 1. Validate the input data.
    // 1a. For GET and DELETE, validate the query params.
    if (['GET', 'DELETE'].includes(method)) {
      // We want to allow data modifications during `parse`. But, Koa
      // will not let us re-set the `.query` property entirely. So, we
      // have to manually remove each key, then use Object.assign(...)
      // to re-add the parsed data.

      // This spread operator is important. Why:
      // Some simple `parse` implementations will simply validate the
      // ctx.request.query data, then return the same object as the "parsed"
      // response. In that scenario, we need to make a copy of the data before
      // deleting keys on ctx.request.query, because that would _also_ delete
      // the keys on the object returned from parse(...)
      const query = { ...parse(ctx, ctx.request.query) };
      for (const key in ctx.request.query) {
        delete ctx.request.query[key];
      }
      Object.assign(ctx.request.query, query);
    } else {
      // 1b. Otherwise, use the body.
      ctx.request.body = parse(ctx, ctx.request.body);
    }

    // 2. Run the provided route handler.
    const response = await implementation(ctx);

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
      router.post(path, ...middlewares, handler);
      break;
    case 'GET':
      router.get(path, ...middlewares, handler);
      break;
    case 'PUT':
      router.put(path, ...middlewares, handler);
      break;
    case 'PATCH':
      router.patch(path, ...middlewares, handler);
      break;
    case 'DELETE':
      router.delete(path, ...middlewares, handler);
      break;
    default:
      throw new Error(`Unsupported method detected: ${route}`);
  }
};
