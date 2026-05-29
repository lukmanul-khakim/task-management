import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { WorkspaceRole } from '@prisma/client';
import { WorkspaceService } from './workspace.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockWorkspace = {
  id: 'ws-1',
  name: 'My Team',
  slug: 'my-team',
  description: null,
  logoUrl: null,
  ownerId: 'user-1',
  createdAt: new Date(),
  updatedAt: new Date(),
  _count: { members: 1, projects: 0 },
};

const mockMember = {
  role: WorkspaceRole.OWNER,
  joinedAt: new Date(),
  user: {
    id: 'user-1',
    name: 'John',
    email: 'john@example.com',
    avatarUrl: null,
  },
};

const mockPrisma = {
  workspace: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  workspaceMember: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
};

const mockRedis = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WorkspaceService', () => {
  let service: WorkspaceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkspaceService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<WorkspaceService>(WorkspaceService);
    jest.clearAllMocks();
  });

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto = { name: 'My Team', slug: 'my-team', description: undefined };

    it('should create workspace and add creator as OWNER', async () => {
      mockPrisma.workspace.findUnique.mockResolvedValue(null);
      mockPrisma.workspace.create.mockResolvedValue(mockWorkspace);

      const result = await service.create('user-1', dto);

      expect(result).toEqual(mockWorkspace);
      expect(mockPrisma.workspace.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            slug: 'my-team',
            ownerId: 'user-1',
            members: {
              create: { userId: 'user-1', role: WorkspaceRole.OWNER },
            },
          }),
        }),
      );
    });

    it('should throw ConflictException if slug already taken', async () => {
      mockPrisma.workspace.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(service.create('user-1', dto)).rejects.toThrow(
        ConflictException,
      );
      expect(mockPrisma.workspace.create).not.toHaveBeenCalled();
    });
  });

  // ─── findAllForUser ───────────────────────────────────────────────────────

  describe('findAllForUser', () => {
    it('should return all workspaces where user is a member', async () => {
      mockPrisma.workspace.findMany.mockResolvedValue([mockWorkspace]);

      const result = await service.findAllForUser('user-1');

      expect(result).toHaveLength(1);
      expect(mockPrisma.workspace.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { members: { some: { userId: 'user-1' } } },
        }),
      );
    });
  });

  // ─── findOne ──────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return workspace with members', async () => {
      mockPrisma.workspace.findUnique.mockResolvedValue({
        ...mockWorkspace,
        members: [mockMember],
      });

      const result = await service.findOne('my-team');
      expect(result.slug).toBe('my-team');
    });

    it('should throw NotFoundException if workspace not found', async () => {
      mockPrisma.workspace.findUnique.mockResolvedValue(null);

      await expect(service.findOne('bad-slug')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('should update workspace name', async () => {
      mockPrisma.workspace.findUnique.mockResolvedValue({
        ...mockWorkspace,
        members: [mockMember],
      });
      mockPrisma.workspace.update.mockResolvedValue({
        ...mockWorkspace,
        name: 'New Name',
      });

      const result = await service.update('my-team', { name: 'New Name' });
      expect(result.name).toBe('New Name');
    });
  });

  // ─── remove ───────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('should delete workspace if requester is owner', async () => {
      mockPrisma.workspace.findUnique.mockResolvedValue({
        ownerId: 'user-1',
      });
      mockPrisma.workspace.delete.mockResolvedValue({});

      const result = await service.remove('my-team', 'user-1');
      expect(result.message).toContain('deleted');
    });

    it('should throw ForbiddenException if requester is not owner', async () => {
      mockPrisma.workspace.findUnique.mockResolvedValue({
        ownerId: 'user-1',
      });

      await expect(service.remove('my-team', 'user-2')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw NotFoundException if workspace not found', async () => {
      mockPrisma.workspace.findUnique.mockResolvedValue(null);

      await expect(service.remove('bad-slug', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── inviteMember ─────────────────────────────────────────────────────────

  describe('inviteMember', () => {
    it('should add existing user as member', async () => {
      mockPrisma.workspace.findUnique.mockResolvedValue({ id: 'ws-1' });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-2',
        name: 'Jane',
        email: 'jane@example.com',
      });
      mockPrisma.workspaceMember.findUnique.mockResolvedValue(null);
      mockPrisma.workspaceMember.create.mockResolvedValue({
        role: WorkspaceRole.MEMBER,
        joinedAt: new Date(),
        user: { id: 'user-2', name: 'Jane', email: 'jane@example.com' },
      });

      const result = await service.inviteMember('my-team', {
        email: 'jane@example.com',
        role: WorkspaceRole.MEMBER,
      });

      expect(result).toHaveProperty('role', WorkspaceRole.MEMBER);
    });

    it('should return message if user not yet registered', async () => {
      mockPrisma.workspace.findUnique.mockResolvedValue({ id: 'ws-1' });
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.inviteMember('my-team', {
        email: 'unknown@example.com',
      });

      expect(result).toHaveProperty('message');
    });

    it('should throw ConflictException if already a member', async () => {
      mockPrisma.workspace.findUnique.mockResolvedValue({ id: 'ws-1' });
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-2' });
      mockPrisma.workspaceMember.findUnique.mockResolvedValue({
        role: WorkspaceRole.MEMBER,
      });

      await expect(
        service.inviteMember('my-team', { email: 'jane@example.com' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── updateMemberRole ─────────────────────────────────────────────────────

  describe('updateMemberRole', () => {
    it('should update member role', async () => {
      mockPrisma.workspace.findUnique.mockResolvedValue({
        id: 'ws-1',
        ownerId: 'user-1',
      });
      mockPrisma.workspaceMember.update.mockResolvedValue({
        role: WorkspaceRole.ADMIN,
        user: { id: 'user-2', name: 'Jane', email: 'jane@example.com' },
      });

      const result = await service.updateMemberRole(
        'my-team',
        'user-2',
        { role: WorkspaceRole.ADMIN },
        'user-1',
      );
      expect(result.role).toBe(WorkspaceRole.ADMIN);
    });

    it('should throw ForbiddenException if trying to change owner role', async () => {
      mockPrisma.workspace.findUnique.mockResolvedValue({
        id: 'ws-1',
        ownerId: 'user-1',
      });

      await expect(
        service.updateMemberRole(
          'my-team',
          'user-1',
          { role: WorkspaceRole.MEMBER },
          'user-1',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if trying to change own role', async () => {
      mockPrisma.workspace.findUnique.mockResolvedValue({
        id: 'ws-1',
        ownerId: 'user-1',
      });

      await expect(
        service.updateMemberRole(
          'my-team',
          'user-2',
          { role: WorkspaceRole.ADMIN },
          'user-2',
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── removeMember ─────────────────────────────────────────────────────────

  describe('removeMember', () => {
    it('should allow member to remove themselves', async () => {
      mockPrisma.workspace.findUnique.mockResolvedValue({
        id: 'ws-1',
        ownerId: 'user-1',
      });
      mockPrisma.workspaceMember.delete.mockResolvedValue({});

      const result = await service.removeMember('my-team', 'user-2', 'user-2');
      expect(result.message).toContain('removed');
    });

    it('should throw ForbiddenException if trying to remove owner', async () => {
      mockPrisma.workspace.findUnique.mockResolvedValue({
        id: 'ws-1',
        ownerId: 'user-1',
      });

      await expect(
        service.removeMember('my-team', 'user-1', 'user-2'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
