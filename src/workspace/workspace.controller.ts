import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { WorkspaceRole } from '@prisma/client';
import { WorkspaceService } from './workspace.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { WorkspaceMemberGuard } from './guards/workspace-member.guard';
import {
  CurrentUser,
  JwtPayload,
} from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@ApiTags('Workspaces')
@ApiBearerAuth('access-token')
@Controller('workspaces')
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  // ─── Workspace CRUD ───────────────────────────────────────────────────────

  @Post()
  @ApiOperation({ summary: 'Create a new workspace' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateWorkspaceDto) {
    return this.workspaceService.create(user.sub, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all workspaces for current user' })
  findAll(@CurrentUser('sub') userId: string) {
    return this.workspaceService.findAllForUser(userId);
  }

  @Get(':slug')
  @UseGuards(WorkspaceMemberGuard)
  @ApiOperation({ summary: 'Get workspace details' })
  @ApiParam({ name: 'slug', example: 'my-team' })
  findOne(@Param('slug') slug: string) {
    return this.workspaceService.findOne(slug);
  }

  @Patch(':slug')
  @UseGuards(WorkspaceMemberGuard, RolesGuard)
  @Roles(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @ApiOperation({ summary: 'Update workspace — OWNER or ADMIN only' })
  @ApiParam({ name: 'slug', example: 'my-team' })
  update(@Param('slug') slug: string, @Body() dto: UpdateWorkspaceDto) {
    return this.workspaceService.update(slug, dto);
  }

  @Delete(':slug')
  @UseGuards(WorkspaceMemberGuard, RolesGuard)
  @Roles(WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Delete workspace — OWNER only' })
  @ApiParam({ name: 'slug', example: 'my-team' })
  remove(@Param('slug') slug: string, @CurrentUser('sub') userId: string) {
    return this.workspaceService.remove(slug, userId);
  }

  // ─── Members ──────────────────────────────────────────────────────────────

  @Get(':slug/members')
  @UseGuards(WorkspaceMemberGuard)
  @ApiOperation({ summary: 'List workspace members' })
  @ApiParam({ name: 'slug', example: 'my-team' })
  getMembers(@Param('slug') slug: string) {
    return this.workspaceService.getMembers(slug);
  }

  @Post(':slug/members/invite')
  @UseGuards(WorkspaceMemberGuard, RolesGuard)
  @Roles(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @ApiOperation({ summary: 'Invite a member — OWNER or ADMIN only' })
  @ApiParam({ name: 'slug', example: 'my-team' })
  invite(@Param('slug') slug: string, @Body() dto: InviteMemberDto) {
    return this.workspaceService.inviteMember(slug, dto);
  }

  @Patch(':slug/members/:memberId/role')
  @UseGuards(WorkspaceMemberGuard, RolesGuard)
  @Roles(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @ApiOperation({ summary: 'Update member role — OWNER or ADMIN only' })
  @ApiParam({ name: 'slug', example: 'my-team' })
  @ApiParam({ name: 'memberId', description: 'User ID of the member' })
  updateRole(
    @Param('slug') slug: string,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateMemberRoleDto,
    @CurrentUser('sub') requesterId: string,
  ) {
    return this.workspaceService.updateMemberRole(
      slug,
      memberId,
      dto,
      requesterId,
    );
  }

  @Delete(':slug/members/:memberId')
  @UseGuards(WorkspaceMemberGuard)
  @ApiOperation({ summary: 'Remove a member (or leave workspace)' })
  @ApiParam({ name: 'slug', example: 'my-team' })
  @ApiParam({ name: 'memberId', description: 'User ID of the member' })
  removeMember(
    @Param('slug') slug: string,
    @Param('memberId') memberId: string,
    @CurrentUser('sub') requesterId: string,
  ) {
    return this.workspaceService.removeMember(slug, memberId, requesterId);
  }
}
