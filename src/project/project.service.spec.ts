import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ProjectStatus, WorkspaceRole } from '@prisma/client';
import { ProjectService } from './project.service';
import { PrismaService } from '../prisma/prisma.service';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockWorkspace = { id: 'ws-1', slug: 'my-team' };

const mockProject = {
  id: 'proj-1',
  name: 'Backend API',
  identifier: 'ENG',
  description: null,
  status: ProjectStatus.ACTIVE,
  createdAt: new Date(),
  updatedAt: new Date(),
  archivedAt: null,
  workspace: { id: 'ws-1', name: 'My Team', slug: 'my-team' },
};

const mockOwnerMember = { role: WorkspaceRole.OWNER };
const mockAdminMember = { role: WorkspaceRole.ADMIN };
const mockRegularMember = { role: WorkspaceRole.MEMBER };

const mockPrisma = {
  workspace: { findUnique: jest.fn() },
  project: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  workspaceMember: { findUnique: jest.fn() },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ProjectService', () => {
  let service: ProjectService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ProjectService>(ProjectService);
    jest.clearAllMocks();

    // Default: workspace exists
    mockPrisma.workspace.findUnique.mockResolvedValue(mockWorkspace);
  });

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto = { name: 'Backend API', identifier: 'ENG' };

    it('should create project when user is OWNER', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(null); // identifier not taken
      mockPrisma.workspaceMember.findUnique.mockResolvedValue(mockOwnerMember);
      mockPrisma.project.create.mockResolvedValue(mockProject);

      const result = await service.create('my-team', 'user-1', dto);
      expect(result.identifier).toBe('ENG');
    });

    it('should create project when user is ADMIN', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(null);
      mockPrisma.workspaceMember.findUnique.mockResolvedValue(mockAdminMember);
      mockPrisma.project.create.mockResolvedValue(mockProject);

      const result = await service.create('my-team', 'user-1', dto);
      expect(result).toBeDefined();
    });

    it('should throw ForbiddenException if user is MEMBER', async () => {
      mockPrisma.workspaceMember.findUnique.mockResolvedValue(mockRegularMember);

      await expect(service.create('my-team', 'user-1', dto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ConflictException if identifier already taken', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({ id: 'existing' });
      mockPrisma.workspaceMember.findUnique.mockResolvedValue(mockOwnerMember);

      await expect(service.create('my-team', 'user-1', dto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw NotFoundException if workspace not found', async () => {
      mockPrisma.workspace.findUnique.mockResolvedValue(null);

      await expect(service.create('bad-slug', 'user-1', dto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return only active projects by default', async () => {
      mockPrisma.project.findMany.mockResolvedValue([mockProject]);

      const result = await service.findAll('my-team');
      expect(result).toHaveLength(1);
      expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: ProjectStatus.ACTIVE }),
        }),
      );
    });

    it('should return all projects when includeArchived is true', async () => {
      mockPrisma.project.findMany.mockResolvedValue([mockProject]);

      await service.findAll('my-team', true);
      expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({ status: expect.anything() }),
        }),
      );
    });
  });

  // ─── findOne ──────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return project by identifier', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({
        ...mockProject,
        _count: { tickets: 0 },
      });

      const result = await service.findOne('my-team', 'ENG');
      expect(result.identifier).toBe('ENG');
    });

    it('should throw NotFoundException if project not found', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(null);

      await expect(service.findOne('my-team', 'BAD')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── archive / unarchive ──────────────────────────────────────────────────

  describe('archive', () => {
    it('should archive active project', async () => {
      mockPrisma.workspaceMember.findUnique.mockResolvedValue(mockOwnerMember);
      mockPrisma.project.findUnique.mockResolvedValue({
        ...mockProject,
        _count: { tickets: 0 },
      });
      mockPrisma.project.update.mockResolvedValue({
        ...mockProject,
        status: ProjectStatus.ARCHIVED,
        archivedAt: new Date(),
      });

      const result = await service.archive('my-team', 'ENG', 'user-1');
      expect(result.status).toBe(ProjectStatus.ARCHIVED);
    });

    it('should throw ConflictException if project already archived', async () => {
      mockPrisma.workspaceMember.findUnique.mockResolvedValue(mockOwnerMember);
      mockPrisma.project.findUnique.mockResolvedValue({
        ...mockProject,
        status: ProjectStatus.ARCHIVED,
        _count: { tickets: 0 },
      });

      await expect(service.archive('my-team', 'ENG', 'user-1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('unarchive', () => {
    it('should unarchive archived project', async () => {
      mockPrisma.workspaceMember.findUnique.mockResolvedValue(mockOwnerMember);
      mockPrisma.project.findUnique.mockResolvedValue({
        ...mockProject,
        status: ProjectStatus.ARCHIVED,
        _count: { tickets: 0 },
      });
      mockPrisma.project.update.mockResolvedValue({
        ...mockProject,
        status: ProjectStatus.ACTIVE,
        archivedAt: null,
      });

      const result = await service.unarchive('my-team', 'ENG', 'user-1');
      expect(result.status).toBe(ProjectStatus.ACTIVE);
    });

    it('should throw ConflictException if project already active', async () => {
      mockPrisma.workspaceMember.findUnique.mockResolvedValue(mockOwnerMember);
      mockPrisma.project.findUnique.mockResolvedValue({
        ...mockProject,
        _count: { tickets: 0 },
      });

      await expect(
        service.unarchive('my-team', 'ENG', 'user-1'),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── remove ───────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('should delete project if user is OWNER', async () => {
      mockPrisma.workspaceMember.findUnique.mockResolvedValue(mockOwnerMember);
      mockPrisma.project.findUnique.mockResolvedValue({
        ...mockProject,
        _count: { tickets: 0 },
      });
      mockPrisma.project.delete.mockResolvedValue({});

      const result = await service.remove('my-team', 'ENG', 'user-1');
      expect(result.message).toContain('deleted');
    });

    it('should throw ForbiddenException if user is ADMIN', async () => {
      mockPrisma.workspaceMember.findUnique.mockResolvedValue(mockAdminMember);

      await expect(
        service.remove('my-team', 'ENG', 'user-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});

