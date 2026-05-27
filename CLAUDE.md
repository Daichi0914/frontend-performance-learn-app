# CLAUDE.md

## Build and Run Commands
- Start dev environment (MySQL, Redis, Nginx, Backend, Frontend): `make up`
- Stop dev environment: `make down`
- Rebuild dev environment: `make rebuild`
- Clean dev environment: `make clean`
- Show logs: `make logs`
- Check service status: `make ps`

## Testing Commands
- Backend unit tests: `make test-backend` (or `cd backend && go test ./...`)
- Backend integration tests: `make test-integration` (or `cd backend && go test -tags=integration ./...`)
- Frontend unit/component tests: `make test-frontend` (or `cd frontend && npm run test`)
- Playwright E2E tests: `make test-e2e` (or `cd frontend && npm run test:e2e`)

## Codebase Guidelines & Architecture
This repository implements a Go (Clean Architecture) and Next.js (App Router) structure, strictly adhering to the **Single Responsibility Principle (単一責任の原則)**.

### General Design Principles
- **Single Responsibility Principle (SRP)**: Each package, file, struct, function, and component must have exactly one responsibility (one reason to change).
  - **Handlers (`delivery`)**: Responsible only for parsing HTTP requests, validating inputs, setting headers, and returning responses. Never include business logic or database queries here.
  - **Usecases (`usecase`)**: Responsible only for orchestrating application business logic. Never handle HTTP status codes, request cookies, or database connection details here.
  - **Repositories (`infrastructure`)**: Responsible only for database persistence and querying (GORM/Redis). Never include core business validation rules here.
  - **React Components**: Keep them presentational and layout-focused. Extract side-effects, API management, and complex states into custom hooks.


### Backend (Go 1.24)
- **Layered Architecture**:
  - `domain/`: Independent domain entities and repository/service interfaces. No external framework dependencies.
  - `usecase/`: Application-specific business rules and orchestration logic.
  - `delivery/`: HTTP route definition and handler implementations (REST API endpoints).
  - `infrastructure/`: GORM/MySQL DB adapters, Redis clients, and integration setup.
- **Dependency Rule**: Dependencies flow inwards. `delivery` and `infrastructure` depend on `usecase`, which depends on `domain`.
- **Database**: GORM is used for MySQL object-relational mapping.
- **Tests**: Unit tests for usecases/handlers, Integration tests for repository implementations using `testcontainers-go`.

### Frontend (Next.js 15+, React 19)
- **Structure**: Next.js App Router (`src/app`), reusable modular components (`src/components`), custom hooks (`src/hooks`).
- **Styling**: Vanilla CSS for styling. No TailwindCSS unless requested.
- **State Management**: React states and custom hooks.

### Testing & Quality
- Playwright for end-to-end integration flows.
- Vitest for frontend unit and component testing.

## Testing Philosophy & Responsibility (Testing Trophy)
Our testing strategy is aligned with the **Testing Trophy (テスティングトロフィー)** philosophy. We prioritize tests that yield the highest confidence-to-effort ratio (Integration and E2E), while maintaining highly focused unit tests.

### 1. E2E Tests (Playwright) — System Verification
- **Scope**: Verification of entire user-facing flows across Frontend, Nginx, Backend, MySQL, and Redis.
- **Responsibility**: Test critical user journeys (e.g., initial page load verifying database/redis connection status green, page navigations). Avoid testing edge cases or fine-grained validation logic here.

### 2. Integration Tests (testcontainers-go) — Infrastructure Verification
- **Scope**: Repository adapters and cache drivers in the `infrastructure` layer.
- **Responsibility**: Verify actual SQL queries, GORM hooks, schema migrations, and Redis connections against real containers managed by `testcontainers-go`. Do not mock database drivers; verify operations against real, ephemeral MySQL/Redis instances.

### 3. Unit Tests (Go testing / Vitest) — Isolated Logic Verification
- **Scope**: Pure business logic (`usecase` layer) and HTTP/CORS route controllers (`delivery` layer) in the backend. React hooks and isolated component states in the frontend.
- **Responsibility**:
  - **Backend**: Verify usecases by injecting mock repositories. Test validation rules, serialization, HTTP headers (CORS), and response codes in handlers.
  - **Frontend**: Verify component rendering, accessibility, and local states using Vitest + Happy DOM with mocked API responses.

