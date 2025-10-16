.PHONY: help install dev build test lint clean infra

# Détecter si on a docker-compose ou docker compose
DOCKER_COMPOSE := $(shell command -v docker-compose 2> /dev/null)
ifndef DOCKER_COMPOSE
	DOCKER_COMPOSE := docker compose
endif

help:
	@echo "Commandes disponibles:"
	@echo "  make install    - Installer toutes les dépendances"
	@echo "  make infra      - Démarrer Redis, ClickHouse, Keycloak"
	@echo "  make dev        - Lancer tous les services en dev"
	@echo "  make build      - Builder tous les projets"
	@echo "  make test       - Tester tous les projets"
	@echo "  make lint       - Linter tous les projets"
	@echo "  make graph      - Afficher le graph de dépendances"
	@echo "  make clean      - Nettoyer les caches"

install:
	npm install
	cd apps/dataset-service && poetry install

infra:
	$(DOCKER_COMPOSE) up -d redis clickhouse keycloak

dev:
	@echo "⚠️  Infrastructure déjà lancée, démarrage des services..."
	nx run-many -t dev --all --parallel

build:
	nx run-many -t build --all

test:
	nx run-many -t test --all

lint:
	nx run-many -t lint --all

graph:
	nx graph

clean:
	nx reset
	$(DOCKER_COMPOSE) down -v