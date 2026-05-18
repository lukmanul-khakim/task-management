import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WorkspaceRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';

@Injectable()
export class WorkspaceService {
  constructor(private prisma: PrismaService) {}

  // ─── Create ───────────────────────────────────────────────────────────────

  async create(userId: string, dto: CreateWorkspaceDto) {
    const slugTaken = await this.prisma.workspace.findUnique({
      where: { slug: dto.slug },
      select: { id: true },
    });
    if (slugTaken) throw new ConflictException('Slug is already taken');

    return this.prisma.workspace.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        description: dto.description,
        ownerId: userId,
        // Auto-add creator as OWNER member
        members: {
          create: { userId, role: WorkspaceRole.OWNER },
        },
      },
      select: workspaceSelect,
    });
  }

  // ─── Find all (for current user) ─────────────────────────────────────────

  async findAllForUser(userId: string) {
    return this.prisma.workspace.findMany({
      where: { members: { some: { userId } } },
      select: workspaceSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── Find one ─────────────────────────────────────────────────────────────

  async findOne(slug: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { slug },
      select: {
        ...workspaceSelect,
        members: {
          select: {
            role: true,
            joinedAt: true,
            user: { select: { id: true, name: true, email: true, avatarUrl: true } },
          },
        },
      },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');
    return workspace;
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async update(slug: string, dto: UpdateWorkspaceDto) {
    await this.findOne(slug);
    return this.prisma.workspace.update({
      where: { slug },
      data: dto,
      select: workspaceSelect,
    });
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  async remove(slug: string, userId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { slug },
      select: { ownerId: true },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');
    if (workspace.ownerId !== userId) {
      throw new ForbiddenException('Only the owner can delete this workspace');
    }
    await this.prisma.workspace.delete({ where: { slug } });
    return { message: 'Workspace deleted' };
  }

  // ─── Members ──────────────────────────────────────────────────────────────

  async getMembers(slug: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { slug },
      select: {
        members: {
          select: {
            role: true,
            joinedAt: true,
            user: { select: { id: true, name: true, email: true, avatarUrl: true } },
          },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');
    return workspace.members;
  }

  async inviteMember(slug: string, dto: InviteMemberDto) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');

    // Check if user exists
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true, name: true, email: true },
    });

    if (!user) {
      // In production: send email invite. For now, return clear message.
      return { message: `Invite sent to ${dto.email} (user not yet registered)` };
    }

    // Check already a member
    const existing = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
    });
    if (existing) throw new ConflictException('User is already a member');

    const member = await this.prisma.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        role: dto.role ?? WorkspaceRole.MEMBER,
      },
      select: {
        role: true,
        joinedAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });

    return member;
  }

  async updateMemberRole(
    slug: string,
    memberId: string,
    dto: UpdateMemberRoleDto,
    requesterId: string,
  ) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { slug },
      select: { id: true, ownerId: true },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');

    // Cannot change owner's role
    if (workspace.ownerId === memberId) {
      throw new ForbiddenException("Cannot change the owner's role");
    }
    // Cannot change own role
    if (requesterId === memberId) {
      throw new ForbiddenException('Cannot change your own role');
    }

    return this.prisma.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: memberId } },
      data: { role: dto.role },
      select: {
        role: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async removeMember(slug: string, memberId: string, requesterId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { slug },
      select: { id: true, ownerId: true },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');

    if (workspace.ownerId === memberId) {
      throw new ForbiddenException('Cannot remove the workspace owner');
    }

    // Members can remove themselves, admins/owners can remove others
    if (requesterId !== memberId) {
      const requester = await this.prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: workspace.id, userId: requesterId } },
        select: { role: true },
      });
      if (
        !requester ||
        (requester.role !== WorkspaceRole.OWNER &&
          requester.role !== WorkspaceRole.ADMIN)
      ) {
        throw new ForbiddenException('Insufficient permissions');
      }
    }

    await this.prisma.workspaceMember.delete({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: memberId } },
    });

    return { message: 'Member removed' };
  }
}

// ─── Reusable select shape ───────────────────────────────────────────────────

const workspaceSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  logoUrl: true,
  ownerId: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { members: true, projects: true } },
} as const;

