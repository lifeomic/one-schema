import { Server } from 'http';
import axios, { AxiosInstance } from 'axios';
import Koa from 'koa';

export type UseSchemaClientOptions = {
  service: Koa;
};

export type UseServiceClientContext = {
  client: AxiosInstance;
};

export const useServiceClient = ({ service }: UseSchemaClientOptions) => {
  const context: UseServiceClientContext = {} as any;

  let server: Server;

  beforeEach(() => {
    server = service.listen();

    context.client = axios.create({
      // In tests, we should always explicitly assert 200.
      validateStatus: () => true,
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      baseURL: `http://127.0.0.1:${(server.address() as any).port}`,
    });
  });

  afterEach(() => {
    server.close();
  });

  return context;
};
