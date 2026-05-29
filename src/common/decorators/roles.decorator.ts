import { SetMetadata } from '@nestjs/common';
import { WorkspaceRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Restrict route to specific workspace roles.
 * Usage: @Roles(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
 */
export const Roles = (...roles: WorkspaceRole[]) =>
  SetMetadata(ROLES_KEY, roles);
