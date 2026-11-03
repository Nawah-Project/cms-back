import { createHash, randomUUID } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkspaceRepository, type WorkspaceActor, type WorkspaceRecord } from '../workspace.port';
import type { WorkspaceDocument } from '../domain/workspace-document';

function stable(value: any): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
}
const hash = (value: unknown) => createHash('sha256').update(stable(value)).digest('hex');
const scope = (actor: WorkspaceActor) => actor.isRoot ? {} : { ownerId: actor.id };
const conflict = () => new ConflictException({ code: 'CONFLICT', message: 'The workspace changed. Preserve your draft and reload the latest version.' });
@Injectable()
export class PrismaWorkspaceRepository extends WorkspaceRepository {
  constructor(private readonly prisma: PrismaService) { super(); }
  private record(row: any): WorkspaceRecord { return { id: row.id, ownerId: row.ownerId, revision: row.revision, document: { ...row.document, id: row.id, revision: row.revision }, updatedAt: row.updatedAt }; }
  list(actor: WorkspaceActor) { return this.prisma.founderWorkspace.findMany({ where: { ownerId: actor.id }, select: { id: true, title: true, revision: true, updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: 100 }); }
  async find(actor: WorkspaceActor, id: string) {
    const row = await this.prisma.founderWorkspace.findFirst({ where: { id, ...scope(actor) } });
    return row ? this.record(row) : null;
  }
  async create(actor: WorkspaceActor, requestId: string, document: WorkspaceDocument) {
    const fingerprint = hash(document);
    const existing = await this.prisma.founderWorkspace.findUnique({ where: { ownerId_createRequestId: { ownerId: actor.id, createRequestId: requestId } } });
    if (existing) { if (existing.createHash !== fingerprint) throw conflict(); return this.record(existing); }
    const id = randomUUID();
    try {
      const row = await this.prisma.founderWorkspace.create({ data: { id, ownerId: actor.id, title: document.title, document: { ...document, id, revision: 0 } as Prisma.InputJsonValue, revision: 0, createRequestId: requestId, createHash: fingerprint } });
      return this.record(row);
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const winner = await this.prisma.founderWorkspace.findUnique({ where: { ownerId_createRequestId: { ownerId: actor.id, createRequestId: requestId } } });
      if (!winner || winner.createHash !== fingerprint) throw conflict(); return this.record(winner);
    }
  }
  async update(actor: WorkspaceActor, id: string, requestId: string, expectedRevision: number, document: WorkspaceDocument) {
    const fingerprint = hash({ expectedRevision, document });
    try {
      return await this.prisma.$transaction(async tx => {
        const row = await tx.founderWorkspace.findFirst({ where: { id, ...scope(actor) } });
        if (!row) throw new NotFoundException('Workspace not found');
        const receipt = await tx.founderWorkspaceMutation.findUnique({ where: { workspaceId_requestId: { workspaceId: id, requestId } } });
        if (receipt) { if (receipt.hash !== fingerprint) throw conflict(); return this.record(row); }
        const changed = await tx.founderWorkspace.updateMany({ where: { id, revision: expectedRevision }, data: { title: document.title, document: { ...document, id, revision: expectedRevision + 1 } as Prisma.InputJsonValue, revision: { increment: 1 } } });
        if (changed.count !== 1) {
          const retried = await tx.founderWorkspaceMutation.findUnique({ where: { workspaceId_requestId: { workspaceId: id, requestId } } });
          if (retried?.hash === fingerprint) return this.record(await tx.founderWorkspace.findUniqueOrThrow({ where: { id } }));
          throw conflict();
        }
        await tx.founderWorkspaceMutation.create({ data: { workspaceId: id, requestId, hash: fingerprint, revision: expectedRevision + 1 } });
        const result = await tx.founderWorkspace.findUniqueOrThrow({ where: { id } });
        return this.record(result);
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const receipt = await this.prisma.founderWorkspaceMutation.findUnique({ where: { workspaceId_requestId: { workspaceId: id, requestId } } });
      const row = await this.find(actor, id);
      if (!row) throw new NotFoundException('Workspace not found');
      if (!receipt || receipt.hash !== fingerprint) throw conflict(); return row;
    }
  }
}
