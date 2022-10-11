import Router from '@koa/router';
import { z } from 'zod';
import { OneSchemaRouter } from './koa-static';

const router = OneSchemaRouter.create({
  introspection: undefined,
  using: new Router(),
})
  .expose(
    {
      name: 'createItem',
      route: 'POST /v1/items',
      request: z.object({ message: z.string(), something: z.string() }),
      response: z.object({ id: z.string(), message: z.string() }),
    },
    async (ctx) => {
      ctx.request.body.message;

      return { id: '', message: '' };
    },
  )
  .expose(
    {
      name: 'getItemById',
      route: 'GET /v1/items/:id',
      request: z.object({ filter: z.string() }),
      response: z.object({ id: z.string(), message: z.string() }),
    },
    (ctx) => {
      ctx.request.query.filter;
      return { id: '', message: '' };
    },
  );

const client = router.client({} as any);

export const main = async () => {
  const res = await client.createItem({ message: '', something: '' });
};
