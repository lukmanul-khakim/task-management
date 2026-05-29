import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService, CacheKeys } from '../../redis/redis.service';

/**
 * Verifies the current user is a member of the workspace (via :slug param).
 * Attaches `request.workspaceMemberRole` for use by RolesGuard.
 * Attaches `request.workspace` for use in controllers.
 *
 * Workspace ID is cached by slug (TTL 5 min) to avoid a full workspace
 * lookup on every request. Membership is always queried live (security-sensitive).
 */
@Injectable()
export class WorkspaceMemberGuard implements CanActivate {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const slug: string = request.params.slug;
    const userId: string = request.user?.sub;

    if (!slug || !userId) return false;

    const cacheKey = CacheKeys.workspaceId(slug);
    const cachedId = await this.redis.get<string>(cacheKey);

    if (cachedId) {
      const membership = await this.prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: cachedId, userId } },
        select: { role: true },
      });
      if (!membership) {
        throw new ForbiddenException('You are not a member of this workspace');
      }
      request.workspace = { id: cachedId, slug };
      request.workspaceMemberRole = membership.role;
      return true;
    }

    // Cache miss — full lookup
    const workspace = await this.prisma.workspace.findUnique({
      where: { slug },
      include: {
        members: {
          where: { userId },
          select: { role: true },
        },
      },
    });

    if (!workspace) throw new NotFoundException('Workspace not found');

    await this.redis.set(cacheKey, workspace.id);

    const membership = workspace.members[0];
    if (!membership) {
      throw new ForbiddenException('You are not a member of this workspace');
    }

    request.workspace = workspace;
    request.workspaceMemberRole = membership.role;

    return true;
  }
}
