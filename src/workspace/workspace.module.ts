import { Module } from '@nestjs/common';
import { WorkspaceController } from './workspace.controller';
import { WorkspaceService } from './workspace.service';
import { WorkspaceMemberGuard } from './guards/workspace-member.guard';

@Module({
  controllers: [WorkspaceController],
  providers: [WorkspaceService, WorkspaceMemberGuard],
  exports: [WorkspaceService, WorkspaceMemberGuard],
})
export class WorkspaceModule {}

