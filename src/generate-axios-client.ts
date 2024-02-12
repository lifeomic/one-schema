import { EndpointDefinition, OneSchemaDefinition } from '.';
import { generateEndpointTypes } from './generate-endpoints';
import { validateSchema } from './meta-schema';

export type GenerateAxiosClientInput = {
  spec: OneSchemaDefinition;
  outputClass: string;
};

export type GenerateAxiosClientOutput = {
  typescript: string;
};

const toJSDocLines = (docs: string): string =>
  docs
    .split('\n')
    .map((line) => ` * ${line}`)
    .join('\n');

const PAGINATE_JSDOC = `
/**
 * Paginates exhaustively through the provided \`request\`, using the specified
 * \`data\`. A \`pageSize\` can be specified in the \`data\` to customize the
 * page size for pagination.
 */
`.trim();

const generateEndpointHelper = ([endpoint, { Name, Description }]: [
  string,
  EndpointDefinition,
]) => {
  return {
    jsdoc: `/**
     ${toJSDocLines(Description || `Executes the \`${endpoint}\` endpoint.`)}
     *
     * @param data The request data.
     * @param config The Axios request overrides for the request.
     *
     * @returns An AxiosResponse object representing the response.
     */`,
    declaration: `${Name}(
      data: Endpoints['${endpoint}']['Request'] &
        Endpoints['${endpoint}']['PathParams'],
      config?: AxiosRequestConfig
    ): Promise<AxiosResponse<Endpoints['${endpoint}']['Response']>>`,
  };
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
  ].join('\n');

  const typescript = `
${declaration}

/* eslint-disable */

const substituteParams = (url: string, params: Object) =>
  Object.entries(params).reduce(
    (url, [name, value]) => url.replace(":" + name, encodeURIComponent(value)),
    url
  );

const removePathParams = (url: string, params: Object) =>
  Object.entries(params)
    .filter(([key, value]) => value !== undefined)
    .reduce(
      (accum, [name, value]) =>
        url.includes(':' + name) ? accum : { ...accum, [name]: value },
      {}
    );

const parseQueryParamsFromPagingLink = (link: string) => {
  const params = new URLSearchParams(link.split('?')[1]);

  return {
    nextPageToken: params.get('nextPageToken'),
    pageSize: params.get('pageSize')
  };
};

export class ${outputClass} {
  client: AxiosInstance;

  constructor(client: AxiosInstance) {
    this.client = client;
  }

  ${Object.entries(spec.Endpoints)
    .map((entry) => {
      const [endpoint] = entry;
      const [method, url] = endpoint.split(' ');
      const useQueryParams = ['GET', 'DELETE'].includes(method);
      const { jsdoc, declaration } = generateEndpointHelper(entry);

      return `
       ${jsdoc}
       ${declaration}{
          return this.client.request({
            ...config,
            method: '${method}',
            ${
              useQueryParams
                ? `params: removePathParams('${url}', data),`
                : `data: removePathParams('${url}', data),`
            }
            url: substituteParams('${url}', data),
          })
        }
      `;
    })
    .join('\n\n')}

  ${PAGINATE_JSDOC}
  async paginate<T extends { nextPageToken?: string; pageSize?: string }, Item>(
    request: (
      data: T,
      config?: AxiosRequestConfig,
    ) => Promise<
      AxiosResponse<{ items: Item[]; links: { self: string; next?: string } }>
    >,
    data: T,
    config?: AxiosRequestConfig
  ): Promise<Item[]> {
    const result = [];

    let nextPageParams = {};
    do {
      // @ts-expect-error
      const response = await this[request.name](
        { ...nextPageParams, ...data },
        config
      );

      result.push(...response.data.items);

      nextPageParams = response.data.links.next
        ? parseQueryParamsFromPagingLink(response.data.links.next)
        : {};
      // @ts-expect-error
    } while (!!nextPageParams.nextPageToken);

    return result;
  }
}

module.exports.${outputClass} = ${outputClass};
`.trim();

  return {
    typescript,
  };
};
