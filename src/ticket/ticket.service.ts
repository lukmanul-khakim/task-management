import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ActivityAction, Prisma, TicketStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { QueryTicketDto } from './dto/query-ticket.dto';

@Injectable()
export class TicketService {
  constructor(private prisma: PrismaService) {}

  // ─── Create ───────────────────────────────────────────────────────────────

  async create(
    workspaceSlug: string,
    projectIdentifier: string,
    userId: string,
    dto: CreateTicketDto,
  ) {
    const project = await this.getProjectOrThrow(workspaceSlug, projectIdentifier);

    // Auto-increment ticket number per project
    const lastTicket = await this.prisma.ticket.findFirst({
      where: { projectId: project.id },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    const number = (lastTicket?.number ?? 0) + 1;

    return this.prisma.ticket.create({
      data: {
        projectId: project.id,
        number,
        title: dto.title,
        description: dto.description,
        status: dto.status,
        priority: dto.priority,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        assigneeId: dto.assigneeId,
        creatorId: userId,
        activities: {
          create: {
            userId,
            action: ActivityAction.CREATED,
            metadata: { title: dto.title },
          },
        },
      },
      select: ticketSelect,
    });
  }

  // ─── Find all (paginated + filtered) ─────────────────────────────────────

  async findAll(
    workspaceSlug: string,
    projectIdentifier: string,
    query: QueryTicketDto,
  ) {
    const project = await this.getProjectOrThrow(workspaceSlug, projectIdentifier);
    const { status, priority, assigneeId, page = 1, limit = 20 } = query;

    const where: Prisma.TicketWhereInput = {
      projectId: project.id,
      ...(status && { status }),
      ...(priority && { priority }),
      ...(assigneeId && { assigneeId }),
    };

    const [tickets, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        select: ticketSelect,
        orderBy: { number: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.ticket.count({ where }),
    ]);

    return {
      data: tickets,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ─── Find one ─────────────────────────────────────────────────────────────

  async findOne(
    workspaceSlug: string,
    projectIdentifier: string,
    ticketNumber: number,
  ) {
    const project = await this.getProjectOrThrow(workspaceSlug, projectIdentifier);

    const ticket = await this.prisma.ticket.findUnique({
      where: {
        projectId_number: { projectId: project.id, number: ticketNumber },
      },
      select: {
        ...ticketSelect,
        description: true,
        activities: {
          select: {
            id: true,
            action: true,
            metadata: true,
            createdAt: true,
            user: { select: { id: true, name: true, avatarUrl: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async update(
    workspaceSlug: string,
    projectIdentifier: string,
    ticketNumber: number,
    userId: string,
    dto: UpdateTicketDto,
  ) {
    const project = await this.getProjectOrThrow(workspaceSlug, projectIdentifier);

    const existing = await this.prisma.ticket.findUnique({
      where: { projectId_number: { projectId: project.id, number: ticketNumber } },
    });
    if (!existing) throw new NotFoundException('Ticket not found');

    // Build activity logs for each changed field
    const activities = this.buildActivityLogs(existing, dto, userId);

    return this.prisma.ticket.update({
      where: { id: existing.id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
        ...(dto.dueDate !== undefined && {
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        }),
        ...(dto.assigneeId !== undefined && { assigneeId: dto.assigneeId }),
        ...(activities.length > 0 && {
          activities: { create: activities },
        }),
      },
      select: ticketSelect,
    });
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  async remove(
    workspaceSlug: string,
    projectIdentifier: string,
    ticketNumber: number,
    userId: string,
  ) {
    const project = await this.getProjectOrThrow(workspaceSlug, projectIdentifier);

    const ticket = await this.prisma.ticket.findUnique({
      where: { projectId_number: { projectId: project.id, number: ticketNumber } },
      select: { id: true, creatorId: true },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    await this.prisma.ticket.delete({ where: { id: ticket.id } });
    return { message: `Ticket ${projectIdentifier}-${ticketNumber} deleted` };
  }

  // ─── Activity log ─────────────────────────────────────────────────────────

  async getActivity(
    workspaceSlug: string,
    projectIdentifier: string,
    ticketNumber: number,
  ) {
    const project = await this.getProjectOrThrow(workspaceSlug, projectIdentifier);

    const ticket = await this.prisma.ticket.findUnique({
      where: { projectId_number: { projectId: project.id, number: ticketNumber } },
      select: {
        activities: {
          select: {
            id: true,
            action: true,
            metadata: true,
            createdAt: true,
            user: { select: { id: true, name: true, avatarUrl: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket.activities;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async getProjectOrThrow(workspaceSlug: string, identifier: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { slug: workspaceSlug },
      select: { id: true },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');

    const project = await this.prisma.project.findUnique({
      where: {
        workspaceId_identifier: {
          workspaceId: workspace.id,
          identifier,
        },
      },
      select: { id: true, identifier: true },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  private buildActivityLogs(
    existing: any,
    dto: UpdateTicketDto,
    userId: string,
  ) {
    const logs: Prisma.ActivityLogCreateWithoutTicketInput[] = [];

    if (dto.status !== undefined && dto.status !== existing.status) {
      logs.push({
        user: { connect: { id: userId } },
        action: ActivityAction.STATUS_CHANGED,
        metadata: { from: existing.status, to: dto.status },
      });
    }

    if (dto.priority !== undefined && dto.priority !== existing.priority) {
      logs.push({
        user: { connect: { id: userId } },
        action: ActivityAction.PRIORITY_CHANGED,
        metadata: { from: existing.priority, to: dto.priority },
      });
    }

    if (dto.assigneeId !== undefined && dto.assigneeId !== existing.assigneeId) {
      if (dto.assigneeId === null) {
        logs.push({
          user: { connect: { id: userId } },
          action: ActivityAction.UNASSIGNED,
          metadata: { from: existing.assigneeId },
        });
      } else {
        logs.push({
          user: { connect: { id: userId } },
          action: ActivityAction.ASSIGNED,
          metadata: { to: dto.assigneeId },
        });
      }
    }

    if (dto.dueDate !== undefined) {
      if (dto.dueDate === null && existing.dueDate) {
        logs.push({
          user: { connect: { id: userId } },
          action: ActivityAction.DUE_DATE_REMOVED,
          metadata: { from: existing.dueDate },
        });
      } else if (dto.dueDate !== null) {
        logs.push({
          user: { connect: { id: userId } },
          action: ActivityAction.DUE_DATE_SET,
          metadata: { to: dto.dueDate },
        });
      }
    }

    if (dto.title !== undefined && dto.title !== existing.title) {
      logs.push({
        user: { connect: { id: userId } },
        action: ActivityAction.UPDATED,
        metadata: { field: 'title', from: existing.title, to: dto.title },
      });
    }

    return logs;
  }
}

// ─── Reusable select shape ───────────────────────────────────────────────────

const ticketSelect = {
  id: true,
  number: true,
  title: true,
  status: true,
  priority: true,
  dueDate: true,
  createdAt: true,
  updatedAt: true,
  project: { select: { id: true, identifier: true, name: true } },
  creator: { select: { id: true, name: true, avatarUrl: true } },
  assignee: { select: { id: true, name: true, avatarUrl: true } },
  labels: {
    select: { label: { select: { id: true, name: true, color: true } } },
  },
  _count: { select: { activities: true } },
} as const;

