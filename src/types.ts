import type { JSONSchema4 } from 'json-schema';

export type EndpointDefinition = {
  Name: string;
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

export type IntrospectionResponse = {
  schema: OneSchemaDefinition;
  serviceVersion: string;
};
