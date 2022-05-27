import { OneSchemaDefinition } from '.';
import { generateEndpointTypes } from './generate-endpoints';
import { validateSchema } from './meta-schema';

export type GenerateAxiosClientInput = {
  spec: OneSchemaDefinition;
  outputClass: string;
};

export const generateAxiosClient = async ({
  spec,
  outputClass,
}: GenerateAxiosClientInput): Promise<string> => {
  validateSchema(spec);
  return [
    '/* eslint-disable */',
    "import { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';",
    '',
    await generateEndpointTypes(spec),
    `
const substituteParams = (url: string, params: any) =>
  Object.entries(params).reduce(
    (url, [name, value]) => url.replace(":" + name, value as any),
    url
  );

const removePathParams = (url: string, params: any) => 
  Object.entries(params).reduce(
    (accum, [name, value]) =>
      url.includes(':' + name) ? accum : { ...accum, [name]: value },
    {}
  );

export class ${outputClass} {

  constructor(private readonly client: AxiosInstance) {}

  ${Object.entries(spec.Endpoints)
    .map(([endpoint, { Name }]) => {
      const [method, url] = endpoint.split(' ');
      const paramsName = method === 'GET' ? 'params' : 'data';

      return `
        ${Name}(
          ${paramsName}: Endpoints['${endpoint}']['Request'] &
            Endpoints['${endpoint}']['PathParams'] ,
          config?: AxiosRequestConfig
        ): Promise<AxiosResponse<Endpoints['${endpoint}']['Response']>> {
          return this.client.request({
            ...config,
            method: '${method}',
            ${paramsName}: removePathParams('${url}', ${paramsName}),
            url: substituteParams('${url}', ${paramsName}),
          })
        }
      `;
    })
    .join('\n\n')}
}`.trim(),
  ].join('\n');
};
