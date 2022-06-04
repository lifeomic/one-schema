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

  paginate<T extends { nextPageToken?: string; pageSize?: string }, Item>(
    request: (
      data: T,
      config?: AxiosRequestConfig
    ) => Promise<
      AxiosResponse<{ items: Item[]; links: { self: string; next?: string } }>
    >,
    data: T,
    config?: AxiosRequestConfig
  ): Promise<Item[]>;
}`.trim(),
  ].join('\n');

  const javascript = `
/* eslint-disable */

const substituteParams = (url, params) =>
  Object.entries(params).reduce(
    (url, [name, value]) => url.replace(":" + name, encodeURIComponent(value)),
    url
  );

const removePathParams = (url, params, encode) => 
  Object.entries(params)
    .filter(([key, value]) => value !== undefined)
    .reduce(
      (accum, [name, value]) =>
        url.includes(':' + name)
          ? accum
          : { ...accum, [name]: encode ? encodeURIComponent(value) : value },
      {}
    );

const parseQueryParamsFromPagingLink = (link) => {
  const params = new URLSearchParams(link.split('?')[1]);

  return {
    nextPageToken: params.get('nextPageToken'),
    pageSize: params.get('pageSize')
  };
};

class ${outputClass} {

  constructor(client) {
    this.client = client;
  }

  ${Object.entries(spec.Endpoints)
    .map(([endpoint, { Name }]) => {
      const [method, url] = endpoint.split(' ');
      const useQueryParams = ['GET', 'DELETE'].includes(method);
      return `
        ${Name}(data, config) {
          return this.client.request({
            ...config,
            method: '${method}',
            ${
              useQueryParams
                ? `params: removePathParams('${url}', data, true),`
                : `data: removePathParams('${url}', data, false),`
            }
            url: substituteParams('${url}', data),
          })
        }
      `;
    })
    .join('\n\n')}

  async paginate(request, data, config) {
    const result = [];

    let nextPageParams = {};
    do {
      const response = await this[request.name](
        { ...nextPageParams, ...data },
        config
      );

      result.push(...response.data.items);

      nextPageParams = response.data.links.next
        ? parseQueryParamsFromPagingLink(response.data.links.next)
        : {};
    } while (!!nextPageParams.nextPageToken);

    return result;
  }
}

module.exports.${outputClass} = ${outputClass};
  `.trim();

  return {
    javascript,
    declaration,
  };
};
