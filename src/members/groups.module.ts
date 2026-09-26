import { Module } from '@nestjs/common';
import { GroupAssignmentService } from './group-assignment.service';

@Module({
  providers: [GroupAssignmentService],
  exports: [GroupAssignmentService],
})
export class GroupsModule {}
