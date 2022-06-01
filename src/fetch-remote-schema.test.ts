import { Alpha } from '@lifeomic/alpha';
import { fetchRemoteSchema } from './fetch-remote-schema';

test('fetchRemoteSchema calls the provided url', async () => {
  const getSpy = jest.spyOn(Alpha.prototype, 'get').mockResolvedValue({
    data: { mockResult: 'mockValue' },
  });

  const url = 'lambda://mock-service:deployed/v1/private/introspect';
  const res = await fetchRemoteSchema({ url });

  expect(getSpy).toHaveBeenCalledTimes(1);
  expect(getSpy).toHaveBeenCalledWith(url);

  expect(res).toStrictEqual({ mockResult: 'mockValue' });
});
