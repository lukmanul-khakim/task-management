import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()   // available everywhere without importing PrismaModule each time
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}

