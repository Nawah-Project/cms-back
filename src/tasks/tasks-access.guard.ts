import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { TasksService } from './tasks.service';

@Injectable()
export class TasksAccessGuard implements CanActivate {
  constructor(private readonly tasks: TasksService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user: { id: string } }>();
    await this.tasks.assertProfDevUnlocked(request.user.id);
    return true;
  }
}
