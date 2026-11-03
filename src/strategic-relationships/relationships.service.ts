import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DomainError, validateDocument } from './domain/relationship-document';
import { RelationshipsRepository, type RelationshipsActor } from './relationships.port';

@Injectable()
export class StrategicRelationshipsService {
  constructor(private readonly repository: RelationshipsRepository) {}
  list(actor: RelationshipsActor) { return this.repository.list(actor); }
  async get(actor: RelationshipsActor, id: string) {
    const record = await this.repository.find(actor, id);
    if (!record) throw new NotFoundException('Workspace not found');
    return record;
  }
  private validate(value: unknown) {
    try { const doc=validateDocument(value);if(doc.mode!=='personal')throw new DomainError('MODE');return doc; }
    catch (error) { throw new BadRequestException({code:error instanceof DomainError?error.code:'FORMAT',message:'Invalid relationships document'}); }
  }
  create(actor: RelationshipsActor, requestId: string, value: unknown) { return this.repository.create(actor, requestId, this.validate(value)); }
  update(actor: RelationshipsActor, id: string, requestId: string, revision: number, value: unknown) { return this.repository.update(actor, id, requestId, revision, this.validate(value)); }
}
