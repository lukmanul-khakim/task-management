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
    '!src/**/*.module.ts',   // modules are wiring, not logic
    '!src/main.ts',
    '!src/prisma/prisma.service.ts', // thin wrapper
    '!**/*.d.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  // Enforce minimum coverage — CI will fail if these drop
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80,
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

