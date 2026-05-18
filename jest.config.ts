import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.module.ts',
    '!src/**/*.controller.ts',   // controllers covered by e2e
    '!src/**/*.dto.ts',          // DTOs are just class definitions
    '!src/**/*.decorator.ts',    // trivial wrappers
    '!src/**/*.interceptor.ts',
    '!src/**/*.filter.ts',
    '!src/**/*.guard.ts',        // guards covered by e2e
    '!src/**/*.strategy.ts',     // strategies covered by e2e
    '!src/main.ts',
    '!**/*.d.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@auth/(.*)$': '<rootDir>/src/auth/$1',
    '^@workspace/(.*)$': '<rootDir>/src/workspace/$1',
    '^@project/(.*)$': '<rootDir>/src/project/$1',
    '^@ticket/(.*)$': '<rootDir>/src/ticket/$1',
    '^@common/(.*)$': '<rootDir>/src/common/$1',
    '^@prisma-service/(.*)$': '<rootDir>/src/prisma/$1',
  },
  // Separate config for e2e tests
  projects: [
    {
      displayName: 'unit',
      testMatch: ['<rootDir>/src/**/*.spec.ts'],
      transform: { '^.+\\.(t|j)s$': 'ts-jest' },
      moduleNameMapper: {
        '^@auth/(.*)$': '<rootDir>/src/auth/$1',
        '^@workspace/(.*)$': '<rootDir>/src/workspace/$1',
        '^@project/(.*)$': '<rootDir>/src/project/$1',
        '^@ticket/(.*)$': '<rootDir>/src/ticket/$1',
        '^@common/(.*)$': '<rootDir>/src/common/$1',
        '^@prisma-service/(.*)$': '<rootDir>/src/prisma/$1',
      },
    },
    {
      displayName: 'e2e',
      testMatch: ['<rootDir>/__tests__/**/*.e2e-spec.ts'],
      transform: { '^.+\\.(t|j)s$': 'ts-jest' },
      moduleNameMapper: {
        '^@auth/(.*)$': '<rootDir>/src/auth/$1',
        '^@workspace/(.*)$': '<rootDir>/src/workspace/$1',
        '^@project/(.*)$': '<rootDir>/src/project/$1',
        '^@ticket/(.*)$': '<rootDir>/src/ticket/$1',
        '^@common/(.*)$': '<rootDir>/src/common/$1',
        '^@prisma-service/(.*)$': '<rootDir>/src/prisma/$1',
      },
    },
  ],
};

export default config;

