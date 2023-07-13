import { JSONSchema4 } from 'json-schema';
import type { ParameterizedContext } from 'koa';
import type Router from '@koa/router';
import type { EndpointsOf, IntrospectionConfig, OneSchema } from './types';
import Ajv from 'ajv';
import {
  ContextOfRouter,
  EndpointImplementation,
  implementRoute,
  StateOfRouter,
} from './koa-utils';
import { addIntrospection } from './introspection';

export type ImplementationOf<
  Schema extends OneSchema<any>,
  RouterType extends Router<any, any>,
> = {
  [Name in keyof EndpointsOf<Schema>]: EndpointImplementation<
    Name,
    EndpointsOf<Schema>[Name]['Request'],
    EndpointsOf<Schema>[Name]['Response'],
    RouterType
  >;
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
   * If not provided, a default parser will be used.
   *
   * @param ctx The current context.
   * @param params.endpoint The endpoint being requested.
   * @param params.schema The request JSON Schema.
   * @param params.data The payload to validate.
   *
   * @returns A validated payload.
   */
  parse?: <Endpoint extends keyof EndpointsOf<Schema>>(
    ctx: ParameterizedContext<
      StateOfRouter<RouterType>,
      ContextOfRouter<RouterType>
    >,
    params: { endpoint: Endpoint; schema: JSONSchema4; data: unknown },
  ) => Schema['Endpoints'][Endpoint]['Request'];

  /** A configuration for supporting introspection. */
  introspection: IntrospectionConfig | undefined;
};

const ajv = new Ajv();

const defaultParse: ImplementationConfig<any, any>['parse'] = (
  ctx,
  { endpoint, data, schema },
) => {
  if (!ajv.validate(schema, data)) {
    const method = (endpoint as string).split(' ')[0];
    const dataVar = ['GET', 'DELETE'].includes(method)
      ? 'query parameters'
      : 'payload';

    return ctx.throw(
      400,
      `The request did not conform to the required schema: ${ajv.errorsText(
        undefined,
        { dataVar },
      )}`,
    );
  }
  return data as any;
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
    addIntrospection(introspection, () => schema, router);
  }

  // Iterate through every handler, and add a route for it based on
  // the key/route description.
  for (const endpoint in implementation) {
    const routeHandler = implementation[endpoint];

    const parser: typeof parse = parse ?? defaultParse;

    implementRoute(
      endpoint,
      router,
      (ctx, data) => {
        const requestSchema = schema.Endpoints[endpoint].Request;
        /* istanbul ignore next */
        if (!requestSchema) {
          return data;
        }
        return parser(ctx, {
          endpoint,
          schema: { ...requestSchema, definitions: schema.Resources },
          data,
        });
      },
      routeHandler,
    );
  }
};
