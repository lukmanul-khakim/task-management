import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { TicketService } from './ticket.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { QueryTicketDto } from './dto/query-ticket.dto';
import { WorkspaceMemberGuard } from '../workspace/guards/workspace-member.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Tickets')
@ApiBearerAuth('access-token')
@UseGuards(WorkspaceMemberGuard)
@Controller('workspaces/:slug/projects/:identifier/tickets')
export class TicketController {
  constructor(private readonly ticketService: TicketService) {}

  @Post()
  @ApiOperation({ summary: 'Create a ticket' })
  @ApiParam({ name: 'slug', description: 'Workspace slug' })
  @ApiParam({ name: 'identifier', description: 'Project identifier e.g. ENG' })
  create(
    @Param('slug') slug: string,
    @Param('identifier') identifier: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateTicketDto,
  ) {
    return this.ticketService.create(slug, identifier, userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List tickets (paginated + filtered)' })
  @ApiParam({ name: 'slug', description: 'Workspace slug' })
  @ApiParam({ name: 'identifier', description: 'Project identifier e.g. ENG' })
  findAll(
    @Param('slug') slug: string,
    @Param('identifier') identifier: string,
    @Query() query: QueryTicketDto,
  ) {
    return this.ticketService.findAll(slug, identifier, query);
  }

  @Get(':number')
  @ApiOperation({ summary: 'Get ticket details + activity log' })
  @ApiParam({ name: 'slug', description: 'Workspace slug' })
  @ApiParam({ name: 'identifier', description: 'Project identifier e.g. ENG' })
  @ApiParam({ name: 'number', description: 'Ticket number e.g. 42' })
  findOne(
    @Param('slug') slug: string,
    @Param('identifier') identifier: string,
    @Param('number', ParseIntPipe) number: number,
  ) {
    return this.ticketService.findOne(slug, identifier, number);
  }

  @Patch(':number')
  @ApiOperation({ summary: 'Update ticket — changes auto-logged to activity' })
  @ApiParam({ name: 'slug', description: 'Workspace slug' })
  @ApiParam({ name: 'identifier', description: 'Project identifier e.g. ENG' })
  @ApiParam({ name: 'number', description: 'Ticket number' })
  update(
    @Param('slug') slug: string,
    @Param('identifier') identifier: string,
    @Param('number', ParseIntPipe) number: number,
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateTicketDto,
  ) {
    return this.ticketService.update(slug, identifier, number, userId, dto);
  }

  @Delete(':number')
  @ApiOperation({ summary: 'Delete a ticket' })
  @ApiParam({ name: 'slug', description: 'Workspace slug' })
  @ApiParam({ name: 'identifier', description: 'Project identifier e.g. ENG' })
  @ApiParam({ name: 'number', description: 'Ticket number' })
  remove(
    @Param('slug') slug: string,
    @Param('identifier') identifier: string,
    @Param('number', ParseIntPipe) number: number,
    @CurrentUser('sub') userId: string,
  ) {
    return this.ticketService.remove(slug, identifier, number, userId);
  }

  @Get(':number/activity')
  @ApiOperation({ summary: 'Get ticket activity log' })
  @ApiParam({ name: 'slug', description: 'Workspace slug' })
  @ApiParam({ name: 'identifier', description: 'Project identifier e.g. ENG' })
  @ApiParam({ name: 'number', description: 'Ticket number' })
  getActivity(
    @Param('slug') slug: string,
    @Param('identifier') identifier: string,
    @Param('number', ParseIntPipe) number: number,
  ) {
    return this.ticketService.getActivity(slug, identifier, number);
  }
}
