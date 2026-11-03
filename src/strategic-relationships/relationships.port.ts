import type { RelationshipDocument } from './domain/relationship-document';

export interface RelationshipsActor { id: string; isRoot: boolean }
export interface RelationshipsRecord { id: string; ownerId: string; revision: number; document: RelationshipDocument; updatedAt: Date }
export abstract class RelationshipsRepository {
  abstract list(actor: RelationshipsActor): Promise<Array<{ id: string; title: string; revision: number; updatedAt: Date }>>;
  abstract find(actor: RelationshipsActor, id: string): Promise<RelationshipsRecord | null>;
  abstract create(actor: RelationshipsActor, requestId: string, document: RelationshipDocument): Promise<RelationshipsRecord>;
  abstract update(actor: RelationshipsActor, id: string, requestId: string, expectedRevision: number, document: RelationshipDocument): Promise<RelationshipsRecord>;
}
