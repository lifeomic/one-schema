import type Router from '@koa/router';
import type { JSONSchema4 } from 'json-schema';
import type { OpenAPIV3 } from 'openapi-types';

export type EndpointDefinition = {
  Name: string;
  Description?: string;
  Request?: JSONSchema4;
  Response: JSONSchema4;
};

export type OneSchemaDefinition = {
  Resources?: {
    [key: string]: JSONSchema4;
  };

  Endpoints: {
    [key: string]: EndpointDefinition;
  };
};

export type GeneratedEndpointsType = {
  [key: string]: {
    Request: any;
    PathParams: any;
    Response: any;
  };
};

export type OneSchema<Endpoints extends GeneratedEndpointsType> =
  OneSchemaDefinition & {
    Endpoints: {
      [K in keyof Endpoints]: {
        Request?: JSONSchema4;
        Response: JSONSchema4;
      };
    };
    __endpoints_type__?: Endpoints;
  };

export type EndpointsOf<Schema extends OneSchema<any>> = NonNullable<
  Schema['__endpoints_type__']
>;

export type IntrospectionConfig = {
  /**
   * A route at which to serve the introspection request on the implementing
   * Router object.
   *
   * A GET method will be supported on this route, and will return introspection data.
   */
  route: string;
  /**
   * If provided, an endpoint for returning the OpenAPI schema for the implementing router
   * will be set up.
   */
  openApi?: {
    /**
     * A route at which to serve the OpenAPI schema for the implementing router object.
     *
     * A GET method will be supported on this route, and will return the OpenAPI schema.
     */
    route: string;
    /**
     * API metadata info to include in the returned OpenAPI schema.
     */
    info: Omit<OpenAPIV3.InfoObject, 'version'>;
  };
  /**
   * The current version of the service, served as part of introspection.
   */
  serviceVersion: string;
  /**
   * An optional alternative router to use for the introspection routes.
   */
  router?: Router<any, any>;
};

export type IntrospectionResponse = {
  schema: OneSchemaDefinition;
  serviceVersion: string;
};
