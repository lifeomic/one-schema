import Router = require('koa-router');
import { implementSchema } from '.';
import { withAssumptions } from './meta-schema';

test('using unsupported methods throws immediately', () => {
  expect(() => {
    implementSchema(
      withAssumptions({
        Endpoints: {
          'OPTIONS /post': {
            Name: 'test',
            Request: {},
            Response: {},
          },
        },
      }),
      {
        // @ts-ignore
        on: new Router(),
        parse: () => null as any,
        implementation: {
          'OPTIONS /post': () => ({}),
        },
      },
    );
  }).toThrowError('Unsupported method detected: OPTIONS /post');
});
