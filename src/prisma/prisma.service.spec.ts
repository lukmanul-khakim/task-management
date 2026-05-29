import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

describe('PrismaService', () => {
  let service: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();

    service = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should throw if cleanDatabase called outside test env', async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    await expect(service.cleanDatabase()).rejects.toThrow(
      'cleanDatabase() can only be called in test environment',
    );

    process.env.NODE_ENV = original;
  });
});
