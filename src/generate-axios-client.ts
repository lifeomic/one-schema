import { OneSchemaDefinition } from '.';
import { generateEndpointTypes } from './generate-endpoints';
import { validateSchema } from './meta-schema';

export type GenerateAxiosClientInput = {
  spec: OneSchemaDefinition;
  outputClass: string;
};

export type GenerateAxiosClientOutput = {
  javascript: string;
  declaration: string;
};

export const generateAxiosClient = async ({
  spec,
  outputClass,
}: GenerateAxiosClientInput): Promise<GenerateAxiosClientOutput> => {
  validateSchema(spec);

  const declaration = [
    '/* eslint-disable */',
    "import { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';",
    '',
    await generateEndpointTypes(spec),
    `
export declare class ${outputClass} {

  constructor(client: AxiosInstance);

  ${Object.entries(spec.Endpoints)
    .map(([endpoint, { Name }]) => {
      const [method] = endpoint.split(' ');
      const paramsName = method === 'GET' ? 'params' : 'data';

      return `
        ${Name}(
          ${paramsName}: Endpoints['${endpoint}']['Request'] &
            Endpoints['${endpoint}']['PathParams'],
          config?: AxiosRequestConfig
        ): Promise<AxiosResponse<Endpoints['${endpoint}']['Response']>>`;
    })
    .join('\n\n')}
}`.trim(),
  ].join('\n');

  const javascript = `
/* eslint-disable */

const substituteParams = (url, params) =>
  Object.entries(params).reduce(
    (url, [name, value]) => url.replace(":" + name, value),
    url
  );

const removePathParams = (url, params) => 
  Object.entries(params).reduce(
    (accum, [name, value]) =>
      url.includes(':' + name) ? accum : { ...accum, [name]: value },
    {}
  );

class ${outputClass} {

  constructor(client) {
    this.client = client;
  }

  ${Object.entries(spec.Endpoints)
    .map(([endpoint, { Name }]) => {
      const [method, url] = endpoint.split(' ');
      const paramsName = method === 'GET' ? 'params' : 'data';

      return `
        ${Name}(${paramsName}, config) {
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
}

module.exports.${outputClass} = ${outputClass};
  `.trim();

  return {
    javascript,
    declaration,
  };
};
