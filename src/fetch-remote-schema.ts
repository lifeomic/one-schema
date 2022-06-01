import { Alpha } from '@lifeomic/alpha';
import { IntrospectionResponse } from './types';

export type FetchRemoteSchemaInput = {
  url: string;
};

export const fetchRemoteSchema = async ({
  url,
}: FetchRemoteSchemaInput): Promise<IntrospectionResponse> => {
  const { data } = await new Alpha().get<IntrospectionResponse>(url);

  return data;
};
