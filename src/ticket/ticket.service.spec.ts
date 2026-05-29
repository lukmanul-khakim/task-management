import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ActivityAction, TicketPriority, TicketStatus } from '@prisma/client';
import { TicketService } from './ticket.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockWorkspace = { id: 'ws-1', slug: 'my-team' };
const mockProject = { id: 'proj-1', identifier: 'ENG' };
const mockTicket = {
  id: 'ticket-1',
  number: 1,
  title: 'Fix login bug',
  description: null,
  status: TicketStatus.BACKLOG,
  priority: TicketPriority.NO_PRIORITY,
  dueDate: null,
  assigneeId: null,
  creatorId: 'user-1',
  projectId: 'proj-1',
};

const mockPrisma = {
  workspace: { findUnique: jest.fn() },
  project: { findUnique: jest.fn() },
  ticket: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
};

const mockRedis = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('TicketService', () => {
  let service: TicketService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<TicketService>(TicketService);
    jest.clearAllMocks();

    // Default: workspace and project exist
    mockPrisma.workspace.findUnique.mockResolvedValue(mockWorkspace);
    mockPrisma.project.findUnique.mockResolvedValue(mockProject);
  });

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should create ticket with auto-incremented number', async () => {
      mockPrisma.ticket.findFirst.mockResolvedValue({ number: 5 });
      mockPrisma.ticket.create.mockResolvedValue({ ...mockTicket, number: 6 });

      const result = await service.create('my-team', 'ENG', 'user-1', {
        title: 'Fix login bug',
      });

      expect(result.number).toBe(6);
      expect(mockPrisma.ticket.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ number: 6 }),
        }),
      );
    });

    it('should start numbering from 1 when no tickets exist', async () => {
      mockPrisma.ticket.findFirst.mockResolvedValue(null);
      mockPrisma.ticket.create.mockResolvedValue({ ...mockTicket, number: 1 });

      const result = await service.create('my-team', 'ENG', 'user-1', {
        title: 'First ticket',
      });

      expect(result.number).toBe(1);
    });

    it('should throw NotFoundException if workspace not found', async () => {
      mockPrisma.workspace.findUnique.mockResolvedValue(null);

      await expect(
        service.create('bad-slug', 'ENG', 'user-1', { title: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if project not found', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(null);

      await expect(
        service.create('my-team', 'BAD', 'user-1', { title: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return paginated tickets', async () => {
      mockPrisma.ticket.findMany.mockResolvedValue([mockTicket]);
      mockPrisma.ticket.count.mockResolvedValue(1);

      const result = await service.findAll('my-team', 'ENG', {
        page: 1,
        limit: 20,
      });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.totalPages).toBe(1);
    });

    it('should filter by status', async () => {
      mockPrisma.ticket.findMany.mockResolvedValue([]);
      mockPrisma.ticket.count.mockResolvedValue(0);

      await service.findAll('my-team', 'ENG', {
        status: TicketStatus.IN_PROGRESS,
        page: 1,
        limit: 20,
      });

      expect(mockPrisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: TicketStatus.IN_PROGRESS }),
        }),
      );
    });
  });

  // ─── findOne ──────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return ticket with activity log', async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue({
        ...mockTicket,
        activities: [],
      });

      const result = await service.findOne('my-team', 'ENG', 1);
      expect(result).toBeDefined();
    });

    it('should throw NotFoundException if ticket not found', async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue(null);

      await expect(service.findOne('my-team', 'ENG', 999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── update (activity log) ────────────────────────────────────────────────

  describe('update', () => {
    it('should log STATUS_CHANGED when status changes', async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue(mockTicket);
      mockPrisma.ticket.update.mockResolvedValue({
        ...mockTicket,
        status: TicketStatus.IN_PROGRESS,
      });

      await service.update('my-team', 'ENG', 1, 'user-1', {
        status: TicketStatus.IN_PROGRESS,
      });

      expect(mockPrisma.ticket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            activities: {
              create: expect.arrayContaining([
                expect.objectContaining({
                  action: ActivityAction.STATUS_CHANGED,
                  metadata: {
                    from: TicketStatus.BACKLOG,
                    to: TicketStatus.IN_PROGRESS,
                  },
                }),
              ]),
            },
          }),
        }),
      );
    });

    it('should log ASSIGNED when assignee is added', async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue(mockTicket);
      mockPrisma.ticket.update.mockResolvedValue({
        ...mockTicket,
        assigneeId: 'user-2',
      });

      await service.update('my-team', 'ENG', 1, 'user-1', {
        assigneeId: 'user-2',
      });

      expect(mockPrisma.ticket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            activities: {
              create: expect.arrayContaining([
                expect.objectContaining({
                  action: ActivityAction.ASSIGNED,
                }),
              ]),
            },
          }),
        }),
      );
    });

    it('should log UNASSIGNED when assignee is removed', async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue({
        ...mockTicket,
        assigneeId: 'user-2',
      });
      mockPrisma.ticket.update.mockResolvedValue({
        ...mockTicket,
        assigneeId: null,
      });

      await service.update('my-team', 'ENG', 1, 'user-1', {
        assigneeId: null,
      });

      expect(mockPrisma.ticket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            activities: {
              create: expect.arrayContaining([
                expect.objectContaining({
                  action: ActivityAction.UNASSIGNED,
                }),
              ]),
            },
          }),
        }),
      );
    });

    it('should not create activity log if nothing changed', async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue(mockTicket);
      mockPrisma.ticket.update.mockResolvedValue(mockTicket);

      await service.update('my-team', 'ENG', 1, 'user-1', {
        title: mockTicket.title, // same value
      });

      expect(mockPrisma.ticket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({ activities: expect.anything() }),
        }),
      );
    });
  });
});
