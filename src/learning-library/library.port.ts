import type { Command, LibraryDocument } from './domain/types';
export type LibraryActor = {
  id: string;
  isRoot: boolean;
  permissions: unknown;
};
export abstract class LibraryRepository {
  abstract load(ownerId: string): Promise<LibraryDocument>;
  abstract mutate(
    ownerId: string,
    expectedRevision: number,
    command: Command,
  ): Promise<LibraryDocument>;
}
