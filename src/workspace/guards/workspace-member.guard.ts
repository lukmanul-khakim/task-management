import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Verifies the current user is a member of the workspace (via :slug param).
 * Attaches `request.workspaceMemberRole` for use by RolesGuard.
 * Attaches `request.workspace` for use in controllers.
 */
@Injectable()
export class WorkspaceMemberGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const slug: string = request.params.slug;
    const userId: string = request.user?.sub;

    if (!slug || !userId) return false;

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

    const membership = workspace.members[0];
    if (!membership) {
      throw new ForbiddenException('You are not a member of this workspace');
    }

    // Attach to request for downstream use
    request.workspace = workspace;
    request.workspaceMemberRole = membership.role;

    return true;
  }
}

