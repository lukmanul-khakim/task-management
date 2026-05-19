import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Simple liveness probe — just returns 200 if app is running */
  @Public()
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Liveness probe' })
  liveness() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  /** Readiness probe — checks DB connectivity */
  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe — checks DB' })
  async readiness() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ok',
        db: 'connected',
        timestamp: new Date().toISOString(),
      };
    } catch {
      return {
        status: 'error',
        db: 'disconnected',
        timestamp: new Date().toISOString(),
      };
    }
  }
}

