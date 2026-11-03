import type { Request, Response } from 'express';
export abstract class SessionAuthenticator {
  abstract authenticate(request: Request, response: Response): Promise<{ id: string; email: string }>;
}
