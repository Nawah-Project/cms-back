import type { WorkspaceDocument } from './domain/workspace-document';

export interface WorkspaceActor { id: string; isRoot: boolean }
export interface WorkspaceRecord { id: string; ownerId: string; revision: number; document: WorkspaceDocument; updatedAt: Date }
export abstract class WorkspaceRepository {
  abstract list(actor: WorkspaceActor): Promise<Array<{ id: string; title: string; revision: number; updatedAt: Date }>>;
  abstract find(actor: WorkspaceActor, id: string): Promise<WorkspaceRecord | null>;
  abstract create(actor: WorkspaceActor, requestId: string, document: WorkspaceDocument): Promise<WorkspaceRecord>;
  abstract update(actor: WorkspaceActor, id: string, requestId: string, expectedRevision: number, document: WorkspaceDocument): Promise<WorkspaceRecord>;
}
