export class AccountLinkRequiredError extends Error {
  constructor() {
    super('Authenticate to your existing account before linking this provider');
    this.name = 'AccountLinkRequiredError';
  }
}
