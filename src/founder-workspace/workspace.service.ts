import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InvalidWorkspace,
  validateWorkspaceDocument,
} from './domain/workspace-document';
import { WorkspaceRepository, type WorkspaceActor } from './workspace.port';

@Injectable()
export class FounderWorkspaceService {
  constructor(private readonly repository: WorkspaceRepository) {}
  list(actor: WorkspaceActor) {
    return this.repository.list(actor);
  }
  async get(actor: WorkspaceActor, id: string) {
    const record = await this.repository.find(actor, id);
    if (!record) throw new NotFoundException('Workspace not found');
    return record;
  }
  private validate(value: unknown) {
    try {
      return validateWorkspaceDocument(value);
    } catch (error) {
      if (error instanceof InvalidWorkspace)
        throw new BadRequestException({
          code: error.code,
          message: 'Invalid workspace document',
        });
      throw error;
    }
  }
  create(actor: WorkspaceActor, requestId: string, value: unknown) {
    return this.repository.create(actor, requestId, this.validate(value));
  }
  update(
    actor: WorkspaceActor,
    id: string,
    requestId: string,
    revision: number,
    value: unknown,
  ) {
    return this.repository.update(
      actor,
      id,
      requestId,
      revision,
      this.validate(value),
    );
  }
  async addTask(
    actor: WorkspaceActor,
    id: string,
    requestId: string,
    revision: number,
    task: Record<string, any>,
  ) {
    const record = await this.get(actor, id),
      document = structuredClone(record.document);
    const existing = document.tasks.find((x) => x.id === task.id);
    if (existing) {
      if (
        [
          'title',
          'cycleId',
          'laneId',
          'start',
          'end',
          'hours',
          'resourceUrl',
        ].some((key) => existing[key] !== task[key])
      )
        throw new BadRequestException({ code: 'TASK_EXISTS' });
      return record;
    }
    document.tasks.push({
      ...task,
      status: 'planned',
      kind: 'learning',
      actualHours: 0,
      notes: '',
      deliverable: '',
      blocker: '',
      dependsOn: '',
      deadline: '',
      archived: false,
    });
    return this.update(actor, id, requestId, revision, document);
  }
}
