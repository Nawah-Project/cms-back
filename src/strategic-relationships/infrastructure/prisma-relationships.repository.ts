import { createHash, randomUUID } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RelationshipsRepository, type RelationshipsActor, type RelationshipsRecord } from '../relationships.port';
import type { RelationshipDocument } from '../domain/relationship-document';

function stable(value: any): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
}
const hash = (value: unknown) => createHash('sha256').update(stable(value)).digest('hex');
const scope = (actor: RelationshipsActor) => ({ ownerId: actor.id });
const conflict = () => new ConflictException({ code: 'CONFLICT', message: 'The workspace changed. Preserve your draft and reload the latest version.' });
@Injectable()
export class PrismaRelationshipsRepository extends RelationshipsRepository {
  constructor(private readonly prisma: PrismaService) { super(); }
  private record(row: any): RelationshipsRecord { return { id: row.id, ownerId: row.ownerId, revision: row.revision, document: { ...row.document, id: row.id, revision: row.revision }, updatedAt: row.updatedAt }; }
  list(actor: RelationshipsActor) { return this.prisma.strategicRelationshipsWorkspace.findMany({ where: { ownerId: actor.id }, select: { id: true, title: true, revision: true, updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: 100 }); }
  async find(actor: RelationshipsActor, id: string) {
    const row = await this.prisma.strategicRelationshipsWorkspace.findFirst({ where: { id, ...scope(actor) } });
    return row ? this.record(row) : null;
  }
  async create(actor: RelationshipsActor, requestId: string, document: RelationshipDocument) {
    const fingerprint = hash(document);
    const existing = await this.prisma.strategicRelationshipsWorkspace.findUnique({where:{ownerId:actor.id}});
    if(existing){if(existing.createRequestId===requestId&&existing.createHash!==fingerprint)throw conflict();return this.record(existing);}
    const id = randomUUID();
    try {
      const row = await this.prisma.strategicRelationshipsWorkspace.create({ data: { id, ownerId: actor.id, title: 'Strategic relationships', document: { ...document, id, revision: 0 } as Prisma.InputJsonValue, revision: 0, createRequestId: requestId, createHash: fingerprint } });
      return this.record(row);
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const winner=await this.prisma.strategicRelationshipsWorkspace.findUnique({where:{ownerId:actor.id}});
      if(!winner||(winner.createRequestId===requestId&&winner.createHash!==fingerprint))throw conflict(); return this.record(winner);
    }
  }
  async update(actor: RelationshipsActor, id: string, requestId: string, expectedRevision: number, document: RelationshipDocument) {
    const fingerprint = hash({ expectedRevision, document });
    try {
      return await this.prisma.$transaction(async tx => {
        const row = await tx.strategicRelationshipsWorkspace.findFirst({ where: { id, ...scope(actor) } });
        if (!row) throw new NotFoundException('Workspace not found');
        const receipt = await tx.strategicRelationshipsMutation.findUnique({ where: { workspaceId_requestId: { workspaceId: id, requestId } } });
        if (receipt) { if (receipt.hash !== fingerprint) throw conflict(); return this.record(row); }
        const changed = await tx.strategicRelationshipsWorkspace.updateMany({ where: { id, revision: expectedRevision }, data: { title: 'Strategic relationships', document: { ...document, id, revision: expectedRevision + 1 } as Prisma.InputJsonValue, revision: { increment: 1 } } });
        if (changed.count !== 1) {
          const retried = await tx.strategicRelationshipsMutation.findUnique({ where: { workspaceId_requestId: { workspaceId: id, requestId } } });
          if (retried?.hash === fingerprint) return this.record(await tx.strategicRelationshipsWorkspace.findUniqueOrThrow({ where: { id } }));
          throw conflict();
        }
        await tx.strategicRelationshipsMutation.create({ data: { workspaceId: id, requestId, hash: fingerprint, revision: expectedRevision + 1 } });
        const result = await tx.strategicRelationshipsWorkspace.findUniqueOrThrow({ where: { id } });
        return this.record(result);
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const receipt = await this.prisma.strategicRelationshipsMutation.findUnique({ where: { workspaceId_requestId: { workspaceId: id, requestId } } });
      const row = await this.find(actor, id);
      if (!row) throw new NotFoundException('Workspace not found');
      if (!receipt || receipt.hash !== fingerprint) throw conflict(); return row;
    }
  }
}
