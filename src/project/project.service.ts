import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProjectStatus, WorkspaceRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@Injectable()
export class ProjectService {
  constructor(private prisma: PrismaService) {}

  // ─── Create ───────────────────────────────────────────────────────────────

  async create(workspaceSlug: string, userId: string, dto: CreateProjectDto) {
    const workspace = await this.getWorkspaceOrThrow(workspaceSlug);

    // Only OWNER or ADMIN can create projects
    await this.assertAdminOrOwner(workspaceSlug, userId);

    // Identifier must be unique within workspace
    const identifierTaken = await this.prisma.project.findUnique({
      where: {
        workspaceId_identifier: {
          workspaceId: workspace.id,
          identifier: dto.identifier,
        },
      },
      select: { id: true },
    });
    if (identifierTaken) {
      throw new ConflictException(
        `Identifier "${dto.identifier}" is already used in this workspace`,
      );
    }

    return this.prisma.project.create({
      data: {
        workspaceId: workspace.id,
        name: dto.name,
        description: dto.description,
        identifier: dto.identifier,
      },
      select: projectSelect,
    });
  }

  // ─── Find all (in workspace) ──────────────────────────────────────────────

  async findAll(workspaceSlug: string, includeArchived = false) {
    const workspace = await this.getWorkspaceOrThrow(workspaceSlug);

    return this.prisma.project.findMany({
      where: {
        workspaceId: workspace.id,
        ...(includeArchived ? {} : { status: ProjectStatus.ACTIVE }),
      },
      select: projectSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── Find one ─────────────────────────────────────────────────────────────

  async findOne(workspaceSlug: string, identifier: string) {
    const workspace = await this.getWorkspaceOrThrow(workspaceSlug);

    const project = await this.prisma.project.findUnique({
      where: {
        workspaceId_identifier: {
          workspaceId: workspace.id,
          identifier,
        },
      },
      select: {
        ...projectSelect,
        _count: { select: { tickets: true } },
      },
    });

    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async update(
    workspaceSlug: string,
    identifier: string,
    dto: UpdateProjectDto,
    userId: string,
  ) {
    await this.assertAdminOrOwner(workspaceSlug, userId);
    const project = await this.findOne(workspaceSlug, identifier);

    return this.prisma.project.update({
      where: { id: project.id },
      data: dto,
      select: projectSelect,
    });
  }

  // ─── Archive / Unarchive ──────────────────────────────────────────────────

  async archive(workspaceSlug: string, identifier: string, userId: string) {
    await this.assertAdminOrOwner(workspaceSlug, userId);
    const project = await this.findOne(workspaceSlug, identifier);

    if (project.status === ProjectStatus.ARCHIVED) {
      throw new ConflictException('Project is already archived');
    }

    return this.prisma.project.update({
      where: { id: project.id },
      data: { status: ProjectStatus.ARCHIVED, archivedAt: new Date() },
      select: projectSelect,
    });
  }

  async unarchive(workspaceSlug: string, identifier: string, userId: string) {
    await this.assertAdminOrOwner(workspaceSlug, userId);
    const project = await this.findOne(workspaceSlug, identifier);

    if (project.status === ProjectStatus.ACTIVE) {
      throw new ConflictException('Project is already active');
    }

    return this.prisma.project.update({
      where: { id: project.id },
      data: { status: ProjectStatus.ACTIVE, archivedAt: null },
      select: projectSelect,
    });
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  async remove(workspaceSlug: string, identifier: string, userId: string) {
    await this.assertOwner(workspaceSlug, userId);
    const project = await this.findOne(workspaceSlug, identifier);

    await this.prisma.project.delete({ where: { id: project.id } });
    return { message: 'Project deleted' };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async getWorkspaceOrThrow(slug: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { slug },
      select: { id: true, slug: true },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');
    return workspace;
  }

  private async getMembership(workspaceSlug: string, userId: string) {
    const workspace = await this.getWorkspaceOrThrow(workspaceSlug);
    return this.prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId: workspace.id, userId },
      },
      select: { role: true },
    });
  }

  private async assertAdminOrOwner(workspaceSlug: string, userId: string) {
    const member = await this.getMembership(workspaceSlug, userId);
    if (
      !member ||
      (member.role !== WorkspaceRole.OWNER &&
        member.role !== WorkspaceRole.ADMIN)
    ) {
      throw new ForbiddenException('Only OWNER or ADMIN can perform this action');
    }
  }

  private async assertOwner(workspaceSlug: string, userId: string) {
    const member = await this.getMembership(workspaceSlug, userId);
    if (!member || member.role !== WorkspaceRole.OWNER) {
      throw new ForbiddenException('Only OWNER can perform this action');
    }
  }
}

// ─── Reusable select shape ───────────────────────────────────────────────────

const projectSelect = {
  id: true,
  name: true,
  identifier: true,
  description: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  archivedAt: true,
  workspace: { select: { id: true, name: true, slug: true } },
} as const;

