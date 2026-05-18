import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { WorkspaceRole } from '@prisma/client';
import { ProjectService } from './project.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { WorkspaceMemberGuard } from '../workspace/guards/workspace-member.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Projects')
@ApiBearerAuth('access-token')
@UseGuards(WorkspaceMemberGuard)
@Controller('workspaces/:slug/projects')
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @ApiOperation({ summary: 'Create a project — OWNER or ADMIN only' })
  @ApiParam({ name: 'slug', description: 'Workspace slug' })
  create(
    @Param('slug') slug: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateProjectDto,
  ) {
    return this.projectService.create(slug, userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List projects in workspace' })
  @ApiParam({ name: 'slug', description: 'Workspace slug' })
  @ApiQuery({
    name: 'archived',
    required: false,
    type: Boolean,
    description: 'Include archived projects',
  })
  findAll(
    @Param('slug') slug: string,
    @Query('archived') archived?: boolean,
  ) {
    return this.projectService.findAll(slug, archived);
  }

  @Get(':identifier')
  @ApiOperation({ summary: 'Get project details' })
  @ApiParam({ name: 'slug', description: 'Workspace slug' })
  @ApiParam({ name: 'identifier', example: 'ENG' })
  findOne(
    @Param('slug') slug: string,
    @Param('identifier') identifier: string,
  ) {
    return this.projectService.findOne(slug, identifier);
  }

  @Patch(':identifier')
  @UseGuards(RolesGuard)
  @Roles(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @ApiOperation({ summary: 'Update project — OWNER or ADMIN only' })
  @ApiParam({ name: 'slug', description: 'Workspace slug' })
  @ApiParam({ name: 'identifier', example: 'ENG' })
  update(
    @Param('slug') slug: string,
    @Param('identifier') identifier: string,
    @Body() dto: UpdateProjectDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.projectService.update(slug, identifier, dto, userId);
  }

  @Patch(':identifier/archive')
  @UseGuards(RolesGuard)
  @Roles(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @ApiOperation({ summary: 'Archive a project — OWNER or ADMIN only' })
  @ApiParam({ name: 'slug', description: 'Workspace slug' })
  @ApiParam({ name: 'identifier', example: 'ENG' })
  archive(
    @Param('slug') slug: string,
    @Param('identifier') identifier: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.projectService.archive(slug, identifier, userId);
  }

  @Patch(':identifier/unarchive')
  @UseGuards(RolesGuard)
  @Roles(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @ApiOperation({ summary: 'Unarchive a project — OWNER or ADMIN only' })
  @ApiParam({ name: 'slug', description: 'Workspace slug' })
  @ApiParam({ name: 'identifier', example: 'ENG' })
  unarchive(
    @Param('slug') slug: string,
    @Param('identifier') identifier: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.projectService.unarchive(slug, identifier, userId);
  }

  @Delete(':identifier')
  @UseGuards(RolesGuard)
  @Roles(WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Delete project — OWNER only' })
  @ApiParam({ name: 'slug', description: 'Workspace slug' })
  @ApiParam({ name: 'identifier', example: 'ENG' })
  remove(
    @Param('slug') slug: string,
    @Param('identifier') identifier: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.projectService.remove(slug, identifier, userId);
  }
}

