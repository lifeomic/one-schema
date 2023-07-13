import {
  IntrospectionConfig,
  IntrospectionResponse,
  OneSchemaDefinition,
} from './types';
import type Router from '@koa/router';
import { toOpenAPISpec } from './openapi';

export const addIntrospection = (
  introspection: IntrospectionConfig,
  /**
   * A function that returns the latest schema for the service. We need
   * to use a function because a `OneSchemaRouter`'s schema does not
   * fully exist yet during its constructor call, which is when this function
   * is executed. So any time the introspect route is called, the most
   * up-to-date schema will be returned.
   */
  getSchema: () => OneSchemaDefinition,
  /**
   * The service's default router that all the endpoints are
   * declared on.
   */
  router: Router<any, any>,
) => {
  const introRouter = introspection.router || router;
  introRouter.get(introspection.route, (ctx, next) => {
    const response: IntrospectionResponse = {
      schema: getSchema(),
      serviceVersion: introspection.serviceVersion,
    };

    ctx.body = response;
    ctx.status = 200;
    return next();
  });
  if (introspection.openApi) {
    const { info } = introspection.openApi;
    introRouter.get(introspection.openApi.route, (ctx, next) => {
      const response = toOpenAPISpec(getSchema(), {
        info: {
          ...info,
          version: introspection.serviceVersion,
        },
      });
      ctx.body = response;
      ctx.status = 200;
      return next();
    });
  }
};
