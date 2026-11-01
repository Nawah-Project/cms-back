import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { TasksService } from './tasks.service';

@Injectable()
export class TasksAccessGuard implements CanActivate {
  constructor(private readonly tasks: TasksService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user: { id: string }; method: string }>();
    await this.tasks.assertProfDevUnlocked(request.user.id, request.method==='GET'||request.method==='HEAD'?'VIEW':'INTERACT');
    return true;
  }
}
