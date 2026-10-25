import { NoResponseProcessor } from '../src/applications/no-response.processor';
// E2E fixtures control historical timestamps. Scheduled background work would
// race those fixtures; explicit processor behavior has its own regression suite.
beforeAll(() => {
  jest
    .spyOn(NoResponseProcessor.prototype, 'onModuleInit')
    .mockImplementation(() => {});
});
afterAll(() => {
  jest.restoreAllMocks();
});
