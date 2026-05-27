.PHONY: up down build rebuild logs ps restart clean e2e-up e2e-down test-backend test-integration test-frontend test-e2e stg-up stg-down stg-build prod-up prod-down prod-build

# --- Development Environment ---

up:
	touch ./.htpasswd
	podman volume create boilerplate_mysql_dev_data || true
	podman volume create boilerplate_redis_dev_data || true
	podman compose up -d --scale cloudflared=0
	rm -f ./.htpasswd

down:
	podman compose down -v

build:
	podman compose build

rebuild:
	touch ./.htpasswd
	podman volume create boilerplate_mysql_dev_data || true
	podman volume create boilerplate_redis_dev_data || true
	podman compose up -d --build --scale cloudflared=0
	rm -f ./.htpasswd

logs:
	podman compose logs -f

ps:
	podman compose ps

restart:
	podman compose restart

clean:
	podman compose down -v

# --- Testing ---

test-backend:
	cd backend && go test -v ./...

test-integration:
	cd backend && go test -v -tags=integration ./...

test-frontend:
	cd frontend && npm run test

test-e2e:
	$(MAKE) e2e-up
	@echo "Waiting for E2E backend to be ready..."
	@for i in $$(seq 1 30); do \
		if curl -s http://localhost:8081/api/ping > /dev/null 2>&1; then \
			echo "E2E backend is ready!"; \
			break; \
		fi; \
		echo "Waiting... ($$i/30)"; \
		sleep 2; \
		if [ $$i -eq 30 ]; then echo "Timeout waiting for E2E backend"; exit 1; fi; \
	done
	@cd frontend && E2E_ENV=true BACKEND_PROXY_TARGET=http://localhost:8081 NEXT_PUBLIC_API_URL=/api npm run test:e2e; \
	EXIT_CODE=$$?; $(MAKE) -C .. e2e-down; exit $$EXIT_CODE

# --- E2E Environment ---

e2e-up:
	podman volume create boilerplate_mysql_e2e_data || true
	podman volume create boilerplate_redis_e2e_data || true
	podman compose -p boilerplate-e2e --env-file .env.e2e --profile e2e up -d --build mysql-e2e redis-e2e backend-e2e

e2e-down:
	podman compose -p boilerplate-e2e --env-file .env.e2e --profile e2e down -v
